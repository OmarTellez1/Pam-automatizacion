import assert from "node:assert/strict";
import test from "node:test";
import { parsePaginationLabel } from "../src/requests/request-access.mjs";

test("interpreta la página actual y el total del paginador de Pending", () => {
  assert.deepEqual(parsePaginationLabel("Page 1/2"), {
    currentPage: 1,
    totalPages: 2,
  });
  assert.deepEqual(parsePaginationLabel(" Page 12/30 "), {
    currentPage: 12,
    totalPages: 30,
  });
});

test("rechaza etiquetas de paginación incompletas o imposibles", () => {
  assert.throws(() => parsePaginationLabel("Page 1 of 2"), /formato reconocido/);
  assert.throws(() => parsePaginationLabel("Page 3/2"), /valores inválidos/);
  assert.throws(() => parsePaginationLabel("Page 0/0"), /valores inválidos/);
});
