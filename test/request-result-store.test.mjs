import assert from "node:assert/strict";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  clearPreviousRequestArtifacts,
  consumeEmailedRequestResult,
  requestArtifactPaths,
} from "../src/request-result-store.mjs";
import { extractValidatedRequestIds } from "../src/email-content.mjs";

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

test("elimina resultados anteriores antes de una ejecución nueva", async () => {
  const resultsDirectory = await mkdtemp(path.join(tmpdir(), "pam-request-artifacts-"));
  const paths = requestArtifactPaths(resultsDirectory);
  await Promise.all(Object.values(paths).map((filePath) => writeFile(filePath, "anterior", "utf8")));

  await clearPreviousRequestArtifacts({ resultsDirectory });

  for (const filePath of Object.values(paths)) assert.equal(await exists(filePath), false);
});

test("vacía los ID después del correo y conserva solo un recibo sin ID", async () => {
  const resultsDirectory = await mkdtemp(path.join(tmpdir(), "pam-request-consumed-"));
  const paths = requestArtifactPaths(resultsDirectory);
  await writeFile(paths.resultPath, JSON.stringify({
    completedAt: "2026-08-17T15:00:00.000Z",
    favoriteCount: 2,
    pending: [{ id: "180001" }, { id: "180002" }],
    requestIds: ["180001", "180002"],
    conflicts: [],
    sendEmail: true,
  }), "utf8");
  await writeFile(paths.manifestPath, '{"requestIds":["180001","180002"]}', "utf8");
  await writeFile(paths.htmlPath, "180001<br>180002", "utf8");

  await consumeEmailedRequestResult({
    resultsDirectory,
    consumedAt: "2026-08-17T15:01:00.000Z",
  });

  const receiptText = await readFile(paths.resultPath, "utf8");
  const receipt = JSON.parse(receiptText);
  assert.deepEqual(receipt.requestIds, []);
  assert.deepEqual(receipt.pending, []);
  assert.equal(receipt.emailSent, true);
  assert.equal(receipt.consumedAt, "2026-08-17T15:01:00.000Z");
  assert.doesNotMatch(receiptText, /180001|180002/);
  assert.throws(() => extractValidatedRequestIds(receipt), /al menos un Request ID/);
  assert.equal(await exists(paths.manifestPath), false);
  assert.equal(await exists(paths.htmlPath), false);
});
