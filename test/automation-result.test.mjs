import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getLatestAutomationResult } from "../src/automation-result.mjs";
import { SIMULATED_REQUEST_IDS } from "../src/simulation.mjs";

const requestIds = Array.from({ length: 3 }, (_, index) => String(160001 + index));
const pending = requestIds.map((id) => ({ id, status: "Pending" }));

test("no anuncia un resultado destinado al correo", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-result-email-"));
  const resultPath = path.join(directory, "last-run.json");
  await writeFile(
    resultPath,
    JSON.stringify({ favoriteCount: requestIds.length, requestIds, pending, sendEmail: true }),
    "utf8",
  );
  assert.deepEqual(await getLatestAutomationResult({ resultPath }), { available: false });
});

test("anuncia la cantidad dinámica de Favorites para el resultado web", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-result-web-"));
  const resultPath = path.join(directory, "last-run.json");
  await writeFile(resultPath, JSON.stringify({
    completedAt: "2026-08-01T15:00:00.000Z",
    favoriteCount: requestIds.length,
    requestIds,
    pending,
    sendEmail: false,
  }), "utf8");

  const result = await getLatestAutomationResult({ resultPath });
  assert.equal(result.available, true);
  assert.equal(result.favoriteCount, 3);
  assert.deepEqual(result.requestIds, requestIds);
});

test("distingue un resultado web de prueba con IDs simulados", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-result-test-"));
  const resultPath = path.join(directory, "last-run.json");
  await writeFile(resultPath, JSON.stringify({
    completedAt: "2026-08-01T15:00:00.000Z",
    testMode: true,
    favoriteCount: 2,
    validatedFavoriteCount: 2,
    submitted: 0,
    requestIds: SIMULATED_REQUEST_IDS,
    sendEmail: false,
  }), "utf8");

  const result = await getLatestAutomationResult({ resultPath });
  assert.equal(result.available, true);
  assert.equal(result.testMode, true);
  assert.equal(result.favoriteCount, 2);
  assert.deepEqual(result.requestIds, SIMULATED_REQUEST_IDS);
});

test("devuelve las solicitudes omitidas por solapamiento aprobado", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-result-conflicts-"));
  const resultPath = path.join(directory, "last-run.json");
  const conflict = {
    type: "approved_access_overlap",
    system: "NOSQLBOOSTER",
    account: "TicProyectos",
    application: "NOSQLBOOSTER",
    requestStartDate: "Aug 03, 2026, 12:00 AM",
    message: "This account is already available during the requested time for Application access.",
  };
  await writeFile(resultPath, JSON.stringify({
    completedAt: "2026-08-01T15:00:00.000Z",
    favoriteCount: 2,
    requestIds: ["170001"],
    pending: [{
      id: "170001",
      status: "Pending",
      system: "PGDCMSA01",
      account: "creditenginelg",
      application: "PuTTY",
    }],
    conflicts: [conflict],
    sendEmail: false,
  }), "utf8");

  const result = await getLatestAutomationResult({ resultPath });
  assert.deepEqual(result.requestIds, ["170001"]);
  assert.deepEqual(result.conflicts, [conflict]);
});

test("no anuncia resultados cuando todavía no existe una ejecución", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-result-missing-"));
  assert.deepEqual(
    await getLatestAutomationResult({ resultPath: path.join(directory, "last-run.json") }),
    { available: false },
  );
});
