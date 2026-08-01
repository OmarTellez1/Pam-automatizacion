import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXPECTED_REQUEST_COUNT } from "./request-config.mjs";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = path.join(projectDirectory, "EMAIL_TEMPLATE.md");
const outputPath = path.join(projectDirectory, "run-results", "CORREO_ACCESOS_PAM.md");
const htmlTemplatePath = path.join(projectDirectory, "EMAIL_TEMPLATE.html");
const htmlOutputPath = path.join(projectDirectory, "run-results", "CORREO_ACCESOS_PAM.html");
const idsPlaceholder = "{{REQUEST_IDS}}";

export function normalizeRequestIds(requestIds) {
  if (!Array.isArray(requestIds)) {
    throw new TypeError("Los Request ID deben proporcionarse como una lista.");
  }

  const normalized = requestIds.map((value) => String(value).trim());
  if (normalized.length !== EXPECTED_REQUEST_COUNT) {
    throw new Error(`Se requieren exactamente ${EXPECTED_REQUEST_COUNT} Request ID.`);
  }
  if (normalized.some((value) => !/^\d+$/.test(value))) {
    throw new Error("Todos los Request ID deben contener únicamente dígitos.");
  }
  if (new Set(normalized).size !== EXPECTED_REQUEST_COUNT) {
    throw new Error("Los Request ID deben ser únicos.");
  }

  return normalized;
}

export function renderAccessEmailMarkdown(template, requestIds) {
  const normalized = normalizeRequestIds(requestIds);
  if (!template.includes(idsPlaceholder)) {
    throw new Error(`La plantilla no contiene el marcador ${idsPlaceholder}.`);
  }

  return template.replace(idsPlaceholder, normalized.join("<br>\n"));
}

export async function generateAccessEmailMarkdown(requestIds) {
  const template = await readFile(templatePath, "utf8");
  const markdown = renderAccessEmailMarkdown(template, requestIds);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");
  return outputPath;
}

export async function generateAccessEmailArtifacts(requestIds) {
  const normalized = normalizeRequestIds(requestIds);
  const [markdownTemplate, htmlTemplate] = await Promise.all([
    readFile(templatePath, "utf8"),
    readFile(htmlTemplatePath, "utf8"),
  ]);
  const markdown = renderAccessEmailMarkdown(markdownTemplate, normalized);
  const html = renderAccessEmailMarkdown(htmlTemplate, normalized);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await Promise.all([
    writeFile(outputPath, markdown, "utf8"),
    writeFile(htmlOutputPath, html, "utf8"),
  ]);
  return { markdownPath: outputPath, htmlPath: htmlOutputPath };
}
