import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { normalizeRequestIds } from "./email-content.mjs";
import { projectDirectory } from "./env-config.mjs";

export const defaultAutomationResultPath = path.join(
  projectDirectory,
  "run-results",
  "last-run.json",
);

export async function getLatestAutomationResult(options = {}) {
  const resultPath = options.resultPath ?? defaultAutomationResultPath;
  try {
    const [result, fileStats] = await Promise.all([
      readFile(resultPath, "utf8").then(JSON.parse),
      stat(resultPath),
    ]);
    if (result.sendEmail !== false) return { available: false };

    const requestIds = normalizeRequestIds(result.requestIds);
    const configuredTime = Date.parse(result.completedAt);
    const completedAt = Number.isFinite(configuredTime)
      ? new Date(configuredTime).toISOString()
      : fileStats.mtime.toISOString();
    return {
      available: true,
      resultId: `${completedAt}:${requestIds.join(",")}`,
      completedAt,
      requestIds,
    };
  } catch (error) {
    if (error.code === "ENOENT") return { available: false };
    throw error;
  }
}
