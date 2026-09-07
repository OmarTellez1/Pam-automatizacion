import assert from "node:assert/strict";
import { mkdir, mkdtemp, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ARTIFACT_RETENTION_DIRECTORIES,
  cleanupExpiredArtifacts,
} from "../src/config/artifact-retention.mjs";

test("elimina únicamente artefactos con más de dos días", async () => {
  const projectDirectory = await mkdtemp(path.join(tmpdir(), "pam-retention-"));
  const now = new Date("2026-09-07T12:00:00.000Z");
  const oldDate = new Date("2026-09-05T11:59:59.999Z");
  const boundaryDate = new Date("2026-09-05T12:00:00.000Z");

  for (const directoryName of ARTIFACT_RETENTION_DIRECTORIES) {
    const directoryPath = path.join(projectDirectory, directoryName, "nested");
    await mkdir(directoryPath, { recursive: true });
    const oldPath = path.join(directoryPath, "old.log");
    const currentPath = path.join(directoryPath, "current.log");
    await writeFile(oldPath, "old", "utf8");
    await writeFile(currentPath, "current", "utf8");
    await Promise.all([
      utimes(oldPath, oldDate, oldDate),
      utimes(currentPath, boundaryDate, boundaryDate),
    ]);
  }

  const stateDirectory = path.join(projectDirectory, "state");
  const statePath = path.join(stateDirectory, "legacy-profile.bin");
  await mkdir(stateDirectory);
  await writeFile(statePath, "preserve", "utf8");
  await utimes(statePath, oldDate, oldDate);

  const result = await cleanupExpiredArtifacts({ projectDirectory, now });

  assert.equal(result.deletedCount, 3);
  assert.equal(result.retainedCount, 3);
  assert.deepEqual(result.failed, []);
  await assert.rejects(stat(path.join(projectDirectory, "logs", "nested", "old.log")), {
    code: "ENOENT",
  });
  assert.ok(await stat(path.join(projectDirectory, "logs", "nested", "current.log")));
  assert.ok(await stat(statePath));
});
