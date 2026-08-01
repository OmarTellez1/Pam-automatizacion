import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateAccessEmailArtifacts } from "./email-content.mjs";
import {
  extractValidatedRequestIds,
  normalizeCcRecipients,
  validateEmailAddress,
} from "./outlook-email.mjs";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resultsDirectory = path.join(projectDirectory, "run-results");
const resultPath = path.join(resultsDirectory, "last-run.json");
const configPath = path.join(projectDirectory, "mail-config.json");
const manifestPath = path.join(resultsDirectory, "email-manifest.json");

export async function prepareAccessEmail() {
  const [result, config] = await Promise.all([
    readFile(resultPath, "utf8").then(JSON.parse),
    readFile(configPath, "utf8").then(JSON.parse),
  ]);
  const requestIds = extractValidatedRequestIds(result);
  const sender = validateEmailAddress(config.sender, "sender");
  const recipient = validateEmailAddress(config.recipient, "recipient");
  const ccRecipients = normalizeCcRecipients(config.cc);
  if (ccRecipients.some((address) => address.toLowerCase() === recipient.toLowerCase())) {
    throw new Error("El destinatario principal no debe repetirse en cc.");
  }
  const subject = String(config.subject ?? "").trim();
  if (!subject) throw new Error("El asunto del correo es obligatorio.");

  const artifacts = await generateAccessEmailArtifacts(requestIds);
  const manifest = {
    preparedAt: new Date().toISOString(),
    sender,
    recipient,
    ccRecipients,
    subject,
    requestDate: result.date,
    startTime: result.startTime,
    requestIds,
    ...artifacts,
  };
  await mkdir(resultsDirectory, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, manifestPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { manifestPath: output } = await prepareAccessEmail();
    console.log(output);
  } catch (error) {
    console.error(`No se pudo preparar el correo: ${error.message}`);
    process.exitCode = 1;
  }
}
