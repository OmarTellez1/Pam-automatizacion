import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadMailSettings,
  parseRecipientList,
  sanitizeEmailHtml,
  validateMailSettings,
  writeMailSettings,
} from "../src/mail-settings.mjs";
import { updateProjectEnvironment } from "../src/env-config.mjs";

test("reconoce varios destinatarios separados por punto y coma", () => {
  assert.deepEqual(
    parseRecipientList("uno@example.com; dos@example.com", "Para", { required: true }),
    ["uno@example.com", "dos@example.com"],
  );
});

test("rechaza direcciones repetidas entre Para y CC", () => {
  assert.throws(() => validateMailSettings({
    to: "uno@example.com",
    cc: "UNO@example.com",
    subject: "Prueba",
    contentHtml: "<p>Contenido</p>",
  }), /no puede repetirse en CC/);
});

test("conserva formato, tablas e imágenes seguras y elimina contenido activo", () => {
  const image = "data:image/png;base64,iVBORw0KGgo=";
  const html = sanitizeEmailHtml(`<script>alert(1)</script><table style="border-collapse:collapse"><tr><td onclick="bad()"><strong>Texto</strong><img src="${image}" onerror="bad()"></td></tr></table>`);

  assert.match(html, /<table style="border-collapse:collapse">/);
  assert.match(html, /<strong>Texto<\/strong>/);
  assert.match(html, /data:image\/png;base64/);
  assert.doesNotMatch(html, /script|onclick|onerror/);
});

test("elimina imágenes externas que no pueden conservarse de forma segura", () => {
  assert.equal(sanitizeEmailHtml('<p>Texto</p><img src="https://example.com/image.png">'), "<p>Texto</p>");
});

test("conserva el estilo general de un body pegado", () => {
  const html = sanitizeEmailHtml('<html><body style="font-family:Aptos;color:#222"><p>Texto</p></body></html>');
  assert.match(html, /^<div style="font-family:Aptos;color:#222"><p>Texto<\/p><\/div>$/);
});

test("guarda y vuelve a cargar toda la configuración de correo", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-mail-settings-"));
  const envPath = path.join(directory, ".env.mail");
  const input = {
    to: "uno@example.com;dos@example.com",
    cc: "copia@example.com",
    subject: "Accesos PAM",
    contentHtml: "<p><strong>Hola</strong></p><table><tr><td>Solicitudes de PAM</td><td>{{REQUEST_IDS}}</td></tr></table>",
  };

  await writeMailSettings(input, { envPath });
  const loaded = await loadMailSettings({ envPath });
  assert.equal(loaded.to, input.to);
  assert.equal(loaded.cc, input.cc);
  assert.equal(loaded.subject, input.subject);
  assert.match(loaded.contentHtml, /<table>/);
});

test("rechaza contenido sin marcador o con el marcador repetido", () => {
  const base = { to: "uno@example.com", cc: "", subject: "Prueba" };
  assert.throws(
    () => validateMailSettings({ ...base, contentHtml: "<p>Sin marcador</p>" }),
    /exactamente una vez.*REQUEST_IDS/,
  );
  assert.throws(
    () => validateMailSettings({ ...base, contentHtml: "{{REQUEST_IDS}} {{REQUEST_IDS}}" }),
    /exactamente una vez.*REQUEST_IDS/,
  );
  assert.throws(
    () => validateMailSettings({ ...base, contentHtml: '<p title="{{REQUEST_IDS}}">Sin marcador visible</p>' }),
    /marcador visible.*REQUEST_IDS/,
  );
});

test("recupera una configuración anterior sustituyendo los ID escritos por el marcador", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-mail-migration-"));
  const envPath = path.join(directory, ".env.mail");
  await updateProjectEnvironment({
    PAM_MAIL_TO: "uno@example.com",
    PAM_MAIL_CC: "",
    PAM_MAIL_SUBJECT: "Accesos PAM",
    PAM_MAIL_CONTENT_HTML: "<table><tr><td>Solicitudes de PAM</td><td>123<br>456</td></tr></table>",
  }, { envPath });

  const loaded = await loadMailSettings({ envPath });
  assert.match(loaded.contentHtml, /{{REQUEST_IDS}}/);
  assert.doesNotMatch(loaded.contentHtml, /123|456/);
});
