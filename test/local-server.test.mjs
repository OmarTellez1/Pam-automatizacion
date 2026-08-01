import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalServer, startLocalInterface } from "../src/local-server.mjs";

async function withServer(callback) {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-ui-"));
  const envPath = path.join(directory, ".env");
  let testedCredentials;
  const server = createLocalServer({
    envPath,
    authenticate: async (credentials) => {
      testedCredentials = credentials;
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    await callback({ baseUrl: `http://127.0.0.1:${port}`, testedCredentials });
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

test("abre automáticamente la interfaz al iniciar el servidor", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-ui-open-"));
  let openedUrl;
  const { server, url } = await startLocalInterface({
    port: 0,
    envPath: path.join(directory, ".env"),
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
