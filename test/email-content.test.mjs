import assert from "node:assert/strict";
import test from "node:test";
import {
  materializeInlineImages,
  migrateLegacyRequestIdsPlaceholder,
  normalizeRequestIds,
  renderAccessEmailHtml,
  renderAccessEmailMarkdown,
} from "../src/email-content.mjs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ids = Array.from({ length: 14 }, (_, index) => String(140131 + index));

test("genera un ID por línea dentro de la celda de la tabla", () => {
  const result = renderAccessEmailMarkdown("Antes {{REQUEST_IDS}} Después", ids);

  assert.equal(result, `Antes ${ids.join("<br>\n")} Después`);
});

test("elimina espacios exteriores de los ID", () => {
  assert.deepEqual(normalizeRequestIds(ids.map((id) => ` ${id} `)), ids);
});

test("rechaza una cantidad distinta de 14 ID", () => {
  assert.throws(() => normalizeRequestIds(ids.slice(0, 13)), /exactamente 14/);
});

test("rechaza ID duplicados o no numéricos", () => {
  assert.throws(() => normalizeRequestIds([...ids.slice(0, 13), ids[0]]), /únicos/);
  assert.throws(() => normalizeRequestIds([...ids.slice(0, 13), "ABC"]), /dígitos/);
});

test("actualiza los ID y el motivo en una tabla pegada", () => {
  const html = '<table><tr><td style="font-weight:bold">Solicitudes de <strong>PAM</strong></td><td>{{REQUEST_IDS}}</td></tr><tr><td>Motivo del acceso</td><td>anterior</td></tr></table>';
  const result = renderAccessEmailHtml(html, ids, { requestReason: "Razón <segura>" });

  assert.match(result, new RegExp(ids.join("<br>\\n")));
  assert.doesNotMatch(result, /REQUEST_IDS/);
  assert.match(result, /Razón &lt;segura&gt;/);
});

test("exige exactamente un marcador para evitar enviar ID obsoletos", () => {
  assert.throws(
    () => renderAccessEmailHtml("<p>Sin tabla</p>", ids),
    /exactamente una vez.*REQUEST_IDS/,
  );
  assert.throws(
    () => renderAccessEmailHtml("{{REQUEST_IDS}} y {{REQUEST_IDS}}", ids),
    /exactamente una vez.*REQUEST_IDS/,
  );
});

test("migra una tabla anterior reemplazando sus ID por el marcador", () => {
  const migrated = migrateLegacyRequestIdsPlaceholder(
    "<table><tr><td>Solicitudes de PAM</td><td>100<br>101</td></tr></table>",
  );
  assert.match(migrated, /<td>{{REQUEST_IDS}}<\/td>/);
  assert.doesNotMatch(migrated, /100|101/);
});

test("convierte imágenes pegadas en adjuntos inline con CID", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-inline-"));
  const onePixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const result = await materializeInlineImages(
    `<p>Antes</p><img src="data:image/png;base64,${onePixelPng}">`,
    { directory },
  );

  assert.equal(result.inlineImages.length, 1);
  assert.match(result.html, /src="cid:pam-inline-/);
  assert.ok((await readFile(result.inlineImages[0].path)).length > 0);
  assert.equal(result.inlineImages[0].mimeType, "image/png");
});
