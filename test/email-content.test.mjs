import assert from "node:assert/strict";
import test from "node:test";
import {
  extractValidatedRequestIds,
  materializeInlineImages,
  migrateLegacyRequestIdsPlaceholder,
  normalizeRequestIds,
  renderAccessEmailHtml,
} from "../src/email-content.mjs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SIMULATED_REQUEST_IDS } from "../src/simulation.mjs";

const ids = Array.from({ length: 5 }, (_, index) => String(140131 + index));

test("elimina espacios exteriores de los ID", () => {
  assert.deepEqual(normalizeRequestIds(ids.map((id) => ` ${id} `)), ids);
});

test("acepta una cantidad dinámica y la contrasta con Favorites", () => {
  assert.deepEqual(normalizeRequestIds(ids), ids);
  assert.throws(() => normalizeRequestIds(ids.slice(0, 4), 5), /5 Request ID/);
  assert.throws(() => normalizeRequestIds([], 1), /al menos un Request ID/);
});

test("rechaza ID duplicados o no numéricos", () => {
  assert.throws(() => normalizeRequestIds([...ids.slice(0, 4), ids[0]]), /únicos/);
  assert.throws(() => normalizeRequestIds([...ids.slice(0, 4), "ABC"]), /dígitos/);
});

test("usa todos los ID Pending de la cantidad actual de Favorites", () => {
  const pending = ids.map((id) => ({ id, status: "Pending" }));
  assert.deepEqual(extractValidatedRequestIds({ favoriteCount: 5, requestIds: ids, pending }), ids);
  assert.throws(
    () => extractValidatedRequestIds({
      favoriteCount: 5,
      requestIds: ids,
      pending: pending.map((item, index) => index ? item : { ...item, status: "Approved" }),
    }),
    /estado Pending/,
  );
  assert.throws(
    () => extractValidatedRequestIds({ favoriteCount: 6, requestIds: ids, pending }),
    /6 Request ID/,
  );
});

test("acepta resultados parciales cubiertos por conflictos de acceso aprobado", () => {
  const result = {
    favoriteCount: 3,
    requestIds: ["170001", "170002"],
    pending: [
      { id: "170001", status: "Pending", system: "A", account: "one", application: "PuTTY" },
      { id: "170002", status: "Pending", system: "B", account: "two", application: "WinSCP" },
    ],
    conflicts: [{
      type: "approved_access_overlap",
      system: "C",
      account: "three",
      application: "PLSQL",
    }],
  };
  assert.deepEqual(extractValidatedRequestIds(result), ["170001", "170002"]);
  assert.throws(
    () => extractValidatedRequestIds({
      ...result,
      conflicts: [{ ...result.conflicts[0], system: "A", account: "one", application: "PuTTY" }],
    }),
    /no cubren Favorites/,
  );
  assert.deepEqual(extractValidatedRequestIds({
    favoriteCount: 1,
    requestIds: [],
    pending: [],
    conflicts: [{
      type: "approved_access_overlap",
      system: "C",
      account: "three",
      application: "PLSQL",
    }],
  }), []);
});

test("acepta IDs simulados solo en un resultado de prueba completo", () => {
  const result = {
    testMode: true,
    favoriteCount: 6,
    validatedFavoriteCount: 6,
    submitted: 0,
    requestIds: [...SIMULATED_REQUEST_IDS],
  };
  assert.deepEqual(extractValidatedRequestIds(result), SIMULATED_REQUEST_IDS);
  assert.throws(
    () => extractValidatedRequestIds({ ...result, submitted: 1 }),
    /no confirma todos los formularios/,
  );
  assert.throws(
    () => extractValidatedRequestIds({ ...result, requestIds: SIMULATED_REQUEST_IDS.slice(1) }),
    /lista autorizada/,
  );
});

test("actualiza solo los ID y conserva el motivo configurado en el correo", () => {
  const html = '<table><tr><td style="font-weight:bold">Solicitudes de <strong>PAM</strong></td><td>{{REQUEST_IDS}}</td></tr><tr><td>Motivo del acceso</td><td>Motor de crédito masivo</td></tr></table>';
  const result = renderAccessEmailHtml(html, ids, {
    requestReason: "Soporte y pruebas con usuario post producción - TIC PETER GOMEZ",
  });

  assert.match(result, new RegExp(ids.join("<br>\\n")));
  assert.doesNotMatch(result, /REQUEST_IDS/);
  assert.match(result, /<td>Motor de crédito masivo<\/td>/);
  assert.doesNotMatch(result, /Soporte y pruebas/);
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
