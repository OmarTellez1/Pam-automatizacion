import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeRequestIds,
  renderAccessEmailMarkdown,
} from "../src/email-content.mjs";

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
