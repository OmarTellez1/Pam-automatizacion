import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateAccessEmailArtifacts } from "./email-content.mjs";
import { acquireOutlookToken, loadOutlookConfig } from "./outlook-auth.mjs";
import {
  buildGraphMailPayload,
  extractValidatedRequestIds,
  sendGraphMail,
  wasAlreadySent,
} from "./outlook-email.mjs";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resultsDirectory = path.join(projectDirectory, "run-results");
const resultPath = path.join(resultsDirectory, "last-run.json");
const auditPath = path.join(resultsDirectory, "last-email.json");

function parseArguments(argv) {
  const options = { send: false, allowInteractive: false, force: false };
  for (const argument of argv) {
    if (argument === "--send") options.send = true;
    else if (argument === "--allow-interactive") options.allowInteractive = true;
    else if (argument === "--force") options.force = true;
    else throw new Error(`Argumento desconocido: ${argument}`);
  }
  return options;
}

async function readJson(filePath, optional = false) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (optional && error.code === "ENOENT") return undefined;
    throw error;
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  const result = await readJson(resultPath);
  const requestIds = extractValidatedRequestIds(result);
  const config = await loadOutlookConfig();
  const artifacts = await generateAccessEmailArtifacts(requestIds);
  const html = await readFile(artifacts.htmlPath, "utf8");
  const payload = buildGraphMailPayload({
    recipient: config.recipient,
    subject: config.subject,
    html,
  });

  console.log(`Para: ${config.recipient}`);
  console.log(`Asunto: ${config.subject}`);
  console.log(`Request ID: ${requestIds.join(", ")}`);
  console.log(`Vista previa: ${artifacts.htmlPath}`);

  if (!options.send) {
    console.log("Vista previa generada. No se envió ningún correo.");
  } else {
    const lastEmail = await readJson(auditPath, true);
    if (!options.force && wasAlreadySent(lastEmail, {
      recipient: config.recipient,
      subject: config.subject,
      requestIds,
    })) {
      throw new Error("Este mismo conjunto de 14 ID ya fue enviado. Use --force solo si el reenvío es intencional.");
    }

    const { accessToken, account } = await acquireOutlookToken({
      allowInteractive: options.allowInteractive,
    });
    const graph = await sendGraphMail({ accessToken, payload });
    const audit = {
      acceptedAt: new Date().toISOString(),
      sender: account.username,
      recipient: config.recipient,
      subject: config.subject,
      requestDate: result.date,
      startTime: result.startTime,
      requestIds,
      ...graph,
    };
    await mkdir(resultsDirectory, { recursive: true });
    await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    console.log("Microsoft Graph aceptó el correo y guardó una copia en Elementos enviados.");
  }
} catch (error) {
  console.error(`Flujo de correo fallido: ${error.message}`);
  process.exitCode = 1;
}
