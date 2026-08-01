import { access } from "node:fs/promises";
import path from "node:path";
import {
  createProjectEnvironmentFile,
  projectDirectory,
  readProjectEnvironment,
  updateProjectEnvironment,
} from "./env-config.mjs";
import { validateEmailAddress } from "./email-address.mjs";
import {
  migrateLegacyRequestIdsPlaceholder,
  requireSingleRequestIdsPlaceholder,
} from "./email-content.mjs";

export const defaultMailEnvPath = path.join(projectDirectory, ".env.mail");
const MAX_CONTENT_LENGTH = 8_000_000;
const ALLOWED_TAGS = new Set([
  "a", "b", "blockquote", "br", "div", "em", "font", "h1", "h2", "h3", "h4", "h5", "h6",
  "i", "img", "li", "ol", "p", "pre", "s", "span", "strong", "table", "tbody", "td", "tfoot",
  "th", "thead", "tr", "u", "ul",
]);
const GLOBAL_ATTRIBUTES = new Set(["align", "dir", "height", "style", "title", "valign", "width"]);
const TAG_ATTRIBUTES = {
  a: new Set(["href"]),
  font: new Set(["color", "face", "size"]),
  img: new Set(["alt", "border", "src"]),
  table: new Set(["border", "cellpadding", "cellspacing"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
};

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function sanitizeStyle(value) {
  const style = String(value).trim();
  if (!style || /url\s*\(|expression\s*\(|behavior\s*:|@import|-moz-binding|position\s*:\s*fixed/i.test(style)) {
    return "";
  }
  return style;
}

function sanitizeTagAttributes(tag, rawAttributes) {
  const allowed = new Set([...GLOBAL_ATTRIBUTES, ...(TAG_ATTRIBUTES[tag] ?? [])]);
  const attributes = [];
  const pattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = pattern.exec(rawAttributes))) {
    const name = match[1].toLowerCase();
    if (!allowed.has(name)) continue;
    let value = match[2] ?? match[3] ?? match[4] ?? "";

    if (name === "style") {
      value = sanitizeStyle(value);
      if (!value) continue;
    }
    if (name === "href" && !/^(https?:|mailto:|#)/i.test(value.trim())) continue;
    if (name === "src") {
      const normalized = value.replace(/\s+/g, "");
      if (!/^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(normalized)) continue;
      value = normalized;
    }

    attributes.push(`${name}="${escapeAttribute(value)}"`);
  }
  return attributes.length ? ` ${attributes.join(" ")}` : "";
}

export function sanitizeEmailHtml(value) {
  let html = String(value ?? "").replaceAll("\0", "").trim();
  if (!html) throw new Error("El contenido del correo es obligatorio.");
  if (html.length > MAX_CONTENT_LENGTH) {
    throw new Error("El contenido del correo supera el límite de 8 MB.");
  }

  const body = /<body\b([^>]*)>([\s\S]*?)<\/body>/i.exec(html);
  if (body) html = `<div${sanitizeTagAttributes("div", body[1])}>${body[2]}</div>`;
  html = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|form|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(meta|link|base|input|button)\b[^>]*\/?>/gi, "")
    .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, "")
    .replace(/<\/?([A-Za-z][A-Za-z0-9:-]*)\b([^>]*)>/g, (tagText, rawTag, rawAttributes) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (tagText.startsWith("</")) return `</${tag}>`;
      const attributes = sanitizeTagAttributes(tag, rawAttributes);
      if (tag === "img" && !/\ssrc=/.test(attributes)) return "";
      return `<${tag}${attributes}>`;
    });

  const visibleText = html.replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim();
  if (!visibleText && !/<img\b/i.test(html)) {
    throw new Error("El contenido del correo es obligatorio.");
  }
  return html;
}

export function parseRecipientList(value, fieldName, options = {}) {
  const recipients = String(value ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item, index) => validateEmailAddress(item, `${fieldName}[${index}]`));
  if (options.required && recipients.length === 0) {
    throw new Error(`${fieldName} debe contener al menos una dirección de correo.`);
  }
  const unique = new Set(recipients.map((item) => item.toLowerCase()));
  if (unique.size !== recipients.length) {
    throw new Error(`${fieldName} no puede contener direcciones duplicadas.`);
  }
  return recipients;
}

export function validateMailSettings(input) {
  const sender = validateEmailAddress(input?.sender, "Tu correo de Outlook");
  const toRecipients = parseRecipientList(input?.to, "Para", { required: true });
  const ccRecipients = parseRecipientList(input?.cc, "CC");
  const toSet = new Set(toRecipients.map((item) => item.toLowerCase()));
  if (ccRecipients.some((item) => toSet.has(item.toLowerCase()))) {
    throw new Error("Una dirección de Para no puede repetirse en CC.");
  }
  const subject = String(input?.subject ?? "").trim();
  if (!subject || subject.length > 255 || subject.includes("\0")) {
    throw new Error("El asunto es obligatorio y debe tener hasta 255 caracteres.");
  }
  const contentHtml = sanitizeEmailHtml(input?.contentHtml);
  requireSingleRequestIdsPlaceholder(contentHtml);
  return {
    sender,
    to: toRecipients.join(";"),
    cc: ccRecipients.join(";"),
    toRecipients,
    ccRecipients,
    subject,
    contentHtml,
  };
}

function loadInitialSettings() {
  return {
    sender: "",
    to: "",
    cc: "",
    subject: "ACCESOS AL PAM",
    contentHtml: "",
  };
}

export async function loadMailSettings(options = {}) {
  const envPath = options.envPath ?? defaultMailEnvPath;
  const values = await readProjectEnvironment(envPath);
  return validateMailSettings({
    sender: values.PAM_MAIL_SENDER,
    to: values.PAM_MAIL_TO,
    cc: values.PAM_MAIL_CC,
    subject: values.PAM_MAIL_SUBJECT,
    contentHtml: migrateLegacyRequestIdsPlaceholder(values.PAM_MAIL_CONTENT_HTML),
  });
}

export async function getMailSettingsState(options = {}) {
  try {
    return { configured: true, settings: await loadMailSettings(options) };
  } catch {
    const envPath = options.envPath ?? defaultMailEnvPath;
    const initialSettings = loadInitialSettings();
    const values = await readProjectEnvironment(envPath);
    let contentHtml = "";
    if (String(values.PAM_MAIL_CONTENT_HTML ?? "").trim()) {
      try {
        contentHtml = sanitizeEmailHtml(values.PAM_MAIL_CONTENT_HTML);
      } catch {
        contentHtml = "";
      }
    }
    return {
      configured: false,
      settings: {
        sender: values.PAM_MAIL_SENDER ?? initialSettings.sender,
        to: values.PAM_MAIL_TO ?? initialSettings.to,
        cc: values.PAM_MAIL_CC ?? initialSettings.cc,
        subject: values.PAM_MAIL_SUBJECT ?? initialSettings.subject,
        contentHtml,
      },
    };
  }
}

export async function writeMailSettings(input, options = {}) {
  const envPath = options.envPath ?? defaultMailEnvPath;
  const settings = validateMailSettings(input);
  await updateProjectEnvironment({
    PAM_MAIL_SENDER: settings.sender,
    PAM_MAIL_TO: settings.to,
    PAM_MAIL_CC: settings.cc,
    PAM_MAIL_SUBJECT: settings.subject,
    PAM_MAIL_CONTENT_HTML: settings.contentHtml,
  }, { envPath });
  return settings;
}

export async function ensureMailSettingsFile(options = {}) {
  const envPath = options.envPath ?? defaultMailEnvPath;
  try {
    await access(envPath);
    return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const settings = loadInitialSettings();
  return createProjectEnvironmentFile({
    PAM_MAIL_SENDER: settings.sender,
    PAM_MAIL_TO: settings.to,
    PAM_MAIL_CC: settings.cc,
    PAM_MAIL_SUBJECT: settings.subject,
    PAM_MAIL_CONTENT_HTML: settings.contentHtml,
  }, { envPath });
}
