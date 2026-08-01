import assert from "node:assert/strict";
import test from "node:test";

test("carga el flujo de solicitudes con todas sus dependencias válidas", async () => {
  const module = await import("../src/request-access.mjs");
  assert.ok(module);
});
