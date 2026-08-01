import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createLocalServer,
  describeAuthenticationFailure,
  startLocalInterface,
} from "../src/local-server.mjs";

async function withServer(callback) {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-ui-"));
  const envPath = path.join(directory, ".env");
  const mailEnvPath = path.join(directory, ".env.mail");
  const automationResultPath = path.join(directory, "last-run.json");
  const testedCredentials = [];
  const server = createLocalServer({
    envPath,
    mailEnvPath,
    automationResultPath,
    authenticate: async (credentials) => {
      testedCredentials.push(credentials);
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    await callback({
      baseUrl: `http://127.0.0.1:${port}`,
      testedCredentials,
      automationResultPath,
    });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("sirve la interfaz local y no expone credenciales en el estado", async () => {
  await withServer(async ({ baseUrl }) => {
    const page = await fetch(`${baseUrl}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Configurar credenciales/);

    const status = await fetch(`${baseUrl}/api/credentials/status`);
    assert.deepEqual(await status.json(), { configured: false });
  });
});

test("entrega vacío el contenido inicial del correo", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await fetch(`${baseUrl}/api/mail-settings`).then((response) => response.json());
    assert.equal(result.configured, false);
    assert.equal(result.settings.contentHtml, "");
  });
});

test("guarda credenciales y ejecuta la comprobación inyectada", async () => {
  await withServer(async ({ baseUrl }) => {
    const credentials = {
      username: "usuario.prueba",
      password: "contraseña-prueba",
      totpSecret: "JBSWY3DPEHPK3PXP",
    };
    const response = await fetch(`${baseUrl}/api/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: baseUrl,
      },
      body: JSON.stringify(credentials),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      configured: true,
      verified: true,
      message: "Credenciales guardadas. El inicio de sesión se comprobó correctamente.",
    });
    const status = await fetch(`${baseUrl}/api/credentials/status`);
    assert.deepEqual(await status.json(), { configured: true });
  });
});

test("bloquea escrituras desde un origen distinto", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://sitio-no-permitido.test",
      },
      body: "{}",
    });
    assert.equal(response.status, 403);
  });
});

test("la API conserva los campos vacíos durante una edición parcial", async () => {
  await withServer(async ({ baseUrl, testedCredentials }) => {
    const headers = { "Content-Type": "application/json", Origin: baseUrl };
    await fetch(`${baseUrl}/api/credentials`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        username: "usuario.original",
        password: "contraseña-original",
        totpSecret: "JBSWY3DPEHPK3PXP",
      }),
    });
    const response = await fetch(`${baseUrl}/api/credentials`, {
      method: "POST",
      headers,
      body: JSON.stringify({ username: "", password: "contraseña-nueva", totpSecret: "" }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(testedCredentials.at(-1), {
      username: "usuario.original",
      password: "contraseña-nueva",
      totpSecret: "JBSWY3DPEHPK3PXP",
    });
  });
});

test("distingue errores de usuario y contraseña de errores del Authenticator", () => {
  assert.match(
    describeAuthenticationFailure({ authenticationStage: "primary_credentials" }),
    /usuario o la contraseña/,
  );
  assert.match(
    describeAuthenticationFailure({ authenticationStage: "totp" }),
    /Authenticator no fue válido/,
  );
});

test("abre automáticamente la interfaz al iniciar el servidor", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-ui-open-"));
  const envPath = path.join(directory, ".env");
  const mailEnvPath = path.join(directory, ".env.mail");
  let openedUrl;
  const { server, url } = await startLocalInterface({
    port: 0,
    envPath,
    mailEnvPath,
    openBrowser: true,
    browserOpener: async (targetUrl) => {
      openedUrl = targetUrl;
    },
  });

  try {
    assert.equal(openedUrl, url);
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("guarda y devuelve la configuración persistente de solicitud", async () => {
  await withServer(async ({ baseUrl }) => {
    const settings = {
      startDate: "03/08",
      startTime: "11:15",
      sessionHours: 8,
      reason: "Prueba de persistencia",
    };
    const response = await fetch(`${baseUrl}/api/request-settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: baseUrl,
      },
      body: JSON.stringify(settings),
    });
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.equal(saved.configured, true);
    assert.equal(saved.settings.reason, settings.reason);

    const loadedResponse = await fetch(`${baseUrl}/api/request-settings`);
    const loaded = await loadedResponse.json();
    assert.equal(loaded.configured, true);
    assert.equal(loaded.settings.startDate, settings.startDate);
    assert.equal(loaded.settings.sessionHours, settings.sessionHours);
  });
});

test("guarda y devuelve destinatarios y contenido enriquecido del correo", async () => {
  await withServer(async ({ baseUrl }) => {
    const settings = {
      to: "uno@example.com;dos@example.com",
      cc: "copia@example.com",
      subject: "Accesos PAM",
      contentHtml: '<p style="font-weight: bold">Hola</p><table><tr><td>Solicitudes de PAM</td><td>{{REQUEST_IDS}}</td></tr></table>',
    };
    const response = await fetch(`${baseUrl}/api/mail-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify(settings),
    });
    assert.equal(response.status, 200);

    const loaded = await fetch(`${baseUrl}/api/mail-settings`).then((result) => result.json());
    assert.equal(loaded.configured, true);
    assert.equal(loaded.settings.to, settings.to);
    assert.deepEqual(loaded.settings.toRecipients, ["uno@example.com", "dos@example.com"]);
    assert.match(loaded.settings.contentHtml, /<table>/);
    assert.match(loaded.settings.contentHtml, /font-weight: bold/);
  });
});

test("guarda y alterna la acción final de la automatización", async () => {
  await withServer(async ({ baseUrl }) => {
    const initial = await fetch(`${baseUrl}/api/final-action`).then((result) => result.json());
    assert.deepEqual(initial, { action: "web", sendEmail: false });

    const response = await fetch(`${baseUrl}/api/final-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify({ action: "email" }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).sendEmail, true);

    const loaded = await fetch(`${baseUrl}/api/final-action`).then((result) => result.json());
    assert.deepEqual(loaded, { action: "email", sendEmail: true });
  });
});

test("devuelve los 14 ID para mostrarlos en la interfaz web", async () => {
  await withServer(async ({ baseUrl, automationResultPath }) => {
    const requestIds = Array.from({ length: 14 }, (_, index) => String(150001 + index));
    await writeFile(automationResultPath, JSON.stringify({
      completedAt: "2026-08-01T15:00:00.000Z",
      requestIds,
      sendEmail: false,
    }), "utf8");

    const result = await fetch(`${baseUrl}/api/automation-result`).then((response) => response.json());
    assert.equal(result.available, true);
    assert.deepEqual(result.requestIds, requestIds);
    assert.match(result.resultId, /150001/);
  });
});
