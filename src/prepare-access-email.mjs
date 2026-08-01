import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateAccessEmailArtifacts } from "./email-content.mjs";
import { materializeInlineImages } from "./email-content.mjs";
import { loadMailSettings } from "./mail-settings.mjs";
import {
  extractValidatedRequestIds,
  validateEmailAddress,
} from "./outlook-email.mjs";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resultsDirectory = path.join(projectDirectory, "run-results");
const resultPath = path.join(resultsDirectory, "last-run.json");
const configPath = path.join(projectDirectory, "mail-config.json");
const manifestPath = path.join(resultsDirectory, "email-manifest.json");

export async function prepareAccessEmail() {
  const [result, config, mailSettings] = await Promise.all([
    readFile(resultPath, "utf8").then(JSON.parse),
    readFile(configPath, "utf8").then(JSON.parse),
    loadMailSettings(),
  ]);
  const requestIds = extractValidatedRequestIds(result);
  const sender = validateEmailAddress(config.sender, "sender");
  const { toRecipients, ccRecipients, subject, contentHtml } = mailSettings;

  const artifacts = await generateAccessEmailArtifacts(requestIds, {
    htmlTemplate: contentHtml,
    requestReason: result.reason,
  });
  const originalHtml = await readFile(artifacts.htmlPath, "utf8");
  const converted = await materializeInlineImages(originalHtml);
  await writeFile(artifacts.htmlPath, converted.html, "utf8");
  const contentHash = createHash("sha256").update(converted.html).digest("hex");
  const manifest = {
    preparedAt: new Date().toISOString(),
    sender,
    recipient: toRecipients[0],
    toRecipients,
    ccRecipients,
    subject,
    requestDate: result.date,
    startTime: result.startTime,
    requestIds,
    inlineImages: converted.inlineImages,
    contentHash,
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
