import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { projectDirectory as defaultProjectDirectory } from "./env-config.mjs";

export const DEFAULT_ARTIFACT_RETENTION_DAYS = 2;
export const ARTIFACT_RETENTION_DIRECTORIES = Object.freeze([
  ".playwright-cli",
  "logs",
  "run-artifacts",
]);

function validateRetentionDays(value) {
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error("La retención de artefactos debe ser mayor que cero días.");
  }
  return days;
}

function assertPathInsideProject(projectDirectory, targetPath) {
  const relativePath = path.relative(projectDirectory, targetPath);
  if (
    !relativePath ||
    relativePath.startsWith(`..${path.sep}`) ||
    relativePath === ".." ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Ruta de limpieza no permitida: ${targetPath}`);
  }
}

async function visitFiles(directoryPath, callback) {
  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await visitFiles(entryPath, callback);
    } else if (entry.isFile()) {
      await callback(entryPath);
    }
  }
}

export async function cleanupExpiredArtifacts(options = {}) {
  const projectDirectory = path.resolve(
    options.projectDirectory ?? defaultProjectDirectory,
  );
  const retentionDays = validateRetentionDays(
    options.retentionDays ?? DEFAULT_ARTIFACT_RETENTION_DAYS,
  );
  const now = options.now instanceof Date
    ? options.now.getTime()
    : Number(options.now ?? Date.now());
  if (!Number.isFinite(now)) {
    throw new Error("La fecha de referencia para limpiar artefactos no es válida.");
  }

  const cutoffTime = now - retentionDays * 24 * 60 * 60 * 1_000;
  const result = {
    retentionDays,
    cutoffTime: new Date(cutoffTime).toISOString(),
    deletedCount: 0,
    retainedCount: 0,
    failed: [],
  };

  for (const directoryName of ARTIFACT_RETENTION_DIRECTORIES) {
    const directoryPath = path.resolve(projectDirectory, directoryName);
    assertPathInsideProject(projectDirectory, directoryPath);
    try {
      await visitFiles(directoryPath, async (filePath) => {
        try {
          const fileStats = await stat(filePath);
          if (fileStats.mtimeMs >= cutoffTime) {
            result.retainedCount += 1;
            return;
          }
          await rm(filePath, { force: true });
          result.deletedCount += 1;
        } catch (error) {
          if (error.code === "ENOENT") return;
          result.failed.push({
            path: path.relative(projectDirectory, filePath),
            message: error.message,
          });
        }
      });
    } catch (error) {
      result.failed.push({ path: directoryName, message: error.message });
    }
  }

  return result;
}
