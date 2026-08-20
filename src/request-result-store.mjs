import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultResultsDirectory = path.join(projectDirectory, "run-results");

export function requestArtifactPaths(resultsDirectory = defaultResultsDirectory) {
  return {
    resultPath: path.join(resultsDirectory, "last-run.json"),
    manifestPath: path.join(resultsDirectory, "email-manifest.json"),
    htmlPath: path.join(resultsDirectory, "CORREO_ACCESOS_PAM.html"),
  };
}

export async function clearPreviousRequestArtifacts(options = {}) {
  const paths = requestArtifactPaths(options.resultsDirectory);
  await Promise.all(Object.values(paths).map((filePath) => rm(filePath, { force: true })));
}

export async function consumeEmailedRequestResult(options = {}) {
  const paths = requestArtifactPaths(options.resultsDirectory);
  const result = JSON.parse(await readFile(paths.resultPath, "utf8"));
  const requestIds = Array.isArray(result.requestIds) ? result.requestIds : [];
  if (requestIds.length < 1) {
    throw new Error("El resultado enviado no contiene Request ID para consumir.");
  }

  const receipt = {
    ...result,
    pending: [],
    requestIds: [],
    emailSent: true,
    consumedAt: options.consumedAt ?? new Date().toISOString(),
  };
  await writeFile(paths.resultPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  await Promise.all([
    rm(paths.manifestPath, { force: true }),
    rm(paths.htmlPath, { force: true }),
  ]);
  return receipt;
}

async function runCli() {
  const action = process.argv[2];
  if (action === "clear") {
    await clearPreviousRequestArtifacts();
    return;
  }
  if (action === "consume-email") {
    await consumeEmailedRequestResult();
    return;
  }
  throw new Error("Acción de artefactos no válida.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runCli();
  } catch (error) {
    console.error(`No se pudieron actualizar los artefactos temporales: ${error.message}`);
    process.exitCode = 1;
  }
}
