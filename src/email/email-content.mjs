import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requestKey } from "../requests/request-config.mjs";
import { validateSimulatedRequestIds } from "../automation/simulation.mjs";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const htmlOutputPath = path.join(projectDirectory, "run-results", "CORREO_ACCESOS_PAM.html");
export const REQUEST_IDS_PLACEHOLDER = "{{REQUEST_IDS}}";

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

export function normalizeRequestIds(requestIds, expectedCount) {
  if (!Array.isArray(requestIds)) {
    throw new TypeError("Los Request ID deben proporcionarse como una lista.");
  }

  const normalized = requestIds.map((value) => String(value).trim());
  if (normalized.length < 1 && expectedCount !== 0) {
    throw new Error("Se requiere al menos un Request ID.");
  }
  if (expectedCount !== undefined) {
    if (!Number.isSafeInteger(expectedCount) || expectedCount < 0) {
      throw new Error("La cantidad esperada de Request ID no es válida.");
    }
    if (normalized.length !== expectedCount) {
      throw new Error(`Se requieren ${expectedCount} Request ID; se encontraron ${normalized.length}.`);
    }
  }
  if (normalized.some((value) => !/^\d+$/.test(value))) {
    throw new Error("Todos los Request ID deben contener únicamente dígitos.");
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("Los Request ID deben ser únicos.");
  }

  return normalized;
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

export function renderAccessEmailHtml(template, requestIds) {
  const normalized = normalizeRequestIds(requestIds);
  const renderedIds = normalized.join("<br>\n");
  let html = String(template ?? "");

  requireSingleRequestIdsPlaceholder(html);
  html = html.replace(REQUEST_IDS_PLACEHOLDER, renderedIds);
  return html;
}

export function extractValidatedRequestIds(result) {
  if (!result || typeof result !== "object") {
    throw new Error("El resultado de solicitudes no es un objeto válido.");
  }

  if (result.testMode === true) {
    if (
      !Number.isSafeInteger(result.favoriteCount) ||
      result.favoriteCount < 1 ||
      result.validatedFavoriteCount !== result.favoriteCount ||
      result.submitted !== 0
    ) {
      throw new Error("El resultado de prueba no confirma todos los formularios de Favorites.");
    }
    return validateSimulatedRequestIds(result.requestIds);
  }

  const legacyPendingCount = Array.isArray(result.pending) ? result.pending.length : undefined;
  const favoriteCount = result.favoriteCount ?? legacyPendingCount;
  if (!Number.isSafeInteger(favoriteCount) || favoriteCount < 1) {
    throw new Error("El resultado no indica una cantidad válida de cuentas favoritas.");
  }

  const conflicts = result.conflicts ?? [];
  if (!Array.isArray(conflicts) || conflicts.length > favoriteCount) {
    throw new Error("La lista de conflictos de acceso aprobado no es válida.");
  }
  if (conflicts.some((conflict) => conflict?.type !== "approved_access_overlap")) {
    throw new Error("El resultado contiene un tipo de conflicto no reconocido.");
  }
  const expectedPendingCount = favoriteCount - conflicts.length;
  const requestIds = normalizeRequestIds(result.requestIds, expectedPendingCount);
  if (!Array.isArray(result.pending) || result.pending.length !== expectedPendingCount) {
    throw new Error(`El resultado debe contener ${expectedPendingCount} solicitudes Pending.`);
  }
  if (result.pending.some((request) => request?.status !== "Pending")) {
    throw new Error("Todas las solicitudes utilizadas para el correo deben estar en estado Pending.");
  }

  const pendingIds = normalizeRequestIds(
    result.pending.map((request) => request?.id),
    expectedPendingCount,
  );
  const pendingSet = new Set(pendingIds);
  if (requestIds.some((requestId) => !pendingSet.has(requestId))) {
    throw new Error("Los Request ID no coinciden con las solicitudes Pending.");
  }
  if (conflicts.length) {
    const pendingKeys = new Set(result.pending.map(requestKey));
    const conflictKeys = new Set(conflicts.map(requestKey));
    const coveredKeys = new Set([...pendingKeys, ...conflictKeys]);
    if (
      pendingKeys.size !== expectedPendingCount ||
      conflictKeys.size !== conflicts.length ||
      [...conflictKeys].some((key) => pendingKeys.has(key)) ||
      coveredKeys.size !== favoriteCount
    ) {
      throw new Error("Las solicitudes Pending y los conflictos no cubren Favorites de forma única.");
    }
  }
  return requestIds;
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

export async function generateAccessEmailArtifacts(requestIds, options = {}) {
  const html = renderAccessEmailHtml(options.htmlTemplate, requestIds);
  await mkdir(path.dirname(htmlOutputPath), { recursive: true });
  await writeFile(htmlOutputPath, html, "utf8");
  return { htmlPath: htmlOutputPath };
}
