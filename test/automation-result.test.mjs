import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getLatestAutomationResult } from "../src/automation-result.mjs";

const requestIds = Array.from({ length: 14 }, (_, index) => String(160001 + index));

test("no anuncia un resultado destinado al correo", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-result-email-"));
  const resultPath = path.join(directory, "last-run.json");
  await writeFile(resultPath, JSON.stringify({ requestIds, sendEmail: true }), "utf8");
  assert.deepEqual(await getLatestAutomationResult({ resultPath }), { available: false });
});

test("no anuncia resultados cuando todavía no existe una ejecución", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-result-missing-"));
  assert.deepEqual(
    await getLatestAutomationResult({ resultPath: path.join(directory, "last-run.json") }),
    { available: false },
  );
});
