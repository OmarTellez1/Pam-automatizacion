import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXPECTED_REQUEST_COUNT } from "./request-config.mjs";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = path.join(projectDirectory, "EMAIL_TEMPLATE.md");
const outputPath = path.join(projectDirectory, "run-results", "CORREO_ACCESOS_PAM.md");
const htmlTemplatePath = path.join(projectDirectory, "EMAIL_TEMPLATE.html");
const htmlOutputPath = path.join(projectDirectory, "run-results", "CORREO_ACCESOS_PAM.html");
export const REQUEST_IDS_PLACEHOLDER = "{{REQUEST_IDS}}";
const reasonPlaceholder = "{{REQUEST_REASON}}";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cellText(html) {
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function replaceFollowingTableCell(html, label, replacement) {
  const matches = [...html.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)];
  const normalizedLabel = label.toLowerCase();
  for (let index = 0; index < matches.length - 1; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    if (!cellText(current[2]).includes(normalizedLabel)) continue;
    const between = html.slice(current.index + current[0].length, next.index);
    if (/<\/tr\b/i.test(between)) continue;
    const openingTagLength = next[0].indexOf(">") + 1;
    const closingTagIndex = next[0].toLowerCase().lastIndexOf(`</${next[1].toLowerCase()}`);
    const replacedCell = `${next[0].slice(0, openingTagLength)}${replacement}${next[0].slice(closingTagIndex)}`;
    return `${html.slice(0, next.index)}${replacedCell}${html.slice(next.index + next[0].length)}`;
  }
  return null;
}

export function requireSingleRequestIdsPlaceholder(template) {
  const html = String(template ?? "");
  const positions = [];
  let offset = 0;
  while ((offset = html.indexOf(REQUEST_IDS_PLACEHOLDER, offset)) !== -1) {
    positions.push(offset);
    offset += REQUEST_IDS_PLACEHOLDER.length;
  }
  const isVisibleText = positions.length === 1 &&
    html.lastIndexOf(">", positions[0]) > html.lastIndexOf("<", positions[0]);
  if (!isVisibleText) {
    throw new Error(
      `El contenido debe incluir exactamente una vez el marcador visible ${REQUEST_IDS_PLACEHOLDER}.`,
    );
  }
  return html;
}

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
  if (!template.includes(REQUEST_IDS_PLACEHOLDER)) {
    throw new Error(`La plantilla no contiene el marcador ${REQUEST_IDS_PLACEHOLDER}.`);
  }

  return template.replace(REQUEST_IDS_PLACEHOLDER, normalized.join("<br>\n"));
}

export function migrateLegacyRequestIdsPlaceholder(template) {
  const html = String(template ?? "");
  if (html.includes(REQUEST_IDS_PLACEHOLDER)) return html;
  return replaceFollowingTableCell(
    html,
    "solicitudes de pam",
    REQUEST_IDS_PLACEHOLDER,
  ) ?? html;
}

export function renderAccessEmailHtml(template, requestIds, options = {}) {
  const normalized = normalizeRequestIds(requestIds);
  const renderedIds = normalized.join("<br>\n");
  let html = String(template ?? "");

  requireSingleRequestIdsPlaceholder(html);
  html = html.replace(REQUEST_IDS_PLACEHOLDER, renderedIds);

  const reason = String(options.requestReason ?? "").trim();
  if (html.includes(reasonPlaceholder)) {
    html = html.replaceAll(reasonPlaceholder, escapeHtml(reason));
  } else if (reason) {
    const replaced = replaceFollowingTableCell(html, "motivo del acceso", escapeHtml(reason));
    if (replaced !== null) html = replaced;
  }
  return html;
}

export async function materializeInlineImages(html, options = {}) {
  const directory = options.directory ?? path.join(projectDirectory, "run-results", "email-inline");
  const inlineImages = [];
  const byHash = new Map();
  const pattern = /data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)/gi;
  const matches = [...String(html).matchAll(pattern)];
  let convertedHtml = String(html);

  for (const match of matches) {
    const mimeSubtype = match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase();
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length || bytes.toString("base64").replace(/=+$/, "") !== match[2].replace(/=+$/, "")) {
      throw new Error("Una imagen pegada contiene datos Base64 inválidos.");
    }
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
    let image = byHash.get(hash);
    if (!image) {
      const extension = mimeSubtype === "jpeg" ? "jpg" : mimeSubtype;
      const contentId = `pam-inline-${hash}@local`;
      const imagePath = path.join(directory, `${hash}.${extension}`);
      await mkdir(directory, { recursive: true });
      await writeFile(imagePath, bytes);
      image = { path: imagePath, contentId, mimeType: `image/${mimeSubtype}` };
      byHash.set(hash, image);
      inlineImages.push(image);
    }
    convertedHtml = convertedHtml.replaceAll(match[0], `cid:${image.contentId}`);
  }
  return { html: convertedHtml, inlineImages };
}

export async function generateAccessEmailMarkdown(requestIds) {
  const template = await readFile(templatePath, "utf8");
  const markdown = renderAccessEmailMarkdown(template, requestIds);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");
  return outputPath;
}

export async function generateAccessEmailArtifacts(requestIds, options = {}) {
  const normalized = normalizeRequestIds(requestIds);
  const [markdownTemplate, htmlTemplate] = await Promise.all([
    readFile(templatePath, "utf8"),
    readFile(htmlTemplatePath, "utf8"),
  ]);
  const markdown = renderAccessEmailMarkdown(markdownTemplate, normalized);
  const html = renderAccessEmailHtml(options.htmlTemplate ?? htmlTemplate, normalized, options);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await Promise.all([
    writeFile(outputPath, markdown, "utf8"),
    writeFile(htmlOutputPath, html, "utf8"),
  ]);
  return { markdownPath: outputPath, htmlPath: htmlOutputPath };
}
