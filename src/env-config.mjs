import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { decodeBase32 } from "./totp.mjs";

export const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const defaultEnvPath = path.join(projectDirectory, ".env");

const CREDENTIAL_KEYS = ["BI_USERNAME", "BI_PASSWORD", "BI_TOTP_SECRET"];

function parseValue(rawValue, lineNumber) {
  const value = rawValue.trim();
  if (!value) {
    return "";
  }

  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`Valor entre comillas inválido en .env, línea ${lineNumber}.`);
    }
  }

  if (value.startsWith("'")) {
    if (!value.endsWith("'")) {
      throw new Error(`Valor entre comillas inválido en .env, línea ${lineNumber}.`);
    }
    return value.slice(1, -1);
  }

  return value.replace(/\s+#.*$/, "").trim();
}

export function parseEnv(text) {
  const values = {};
  const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) {
      throw new Error(`Línea inválida en .env: ${index + 1}.`);
    }

    values[match[1]] = parseValue(match[2], index + 1);
  });

  return values;
}

function serializeEnv(values) {
  const keys = Object.keys(values).sort((left, right) => {
    const leftCredentialIndex = CREDENTIAL_KEYS.indexOf(left);
    const rightCredentialIndex = CREDENTIAL_KEYS.indexOf(right);
    if (leftCredentialIndex !== -1 || rightCredentialIndex !== -1) {
      if (leftCredentialIndex === -1) return 1;
      if (rightCredentialIndex === -1) return -1;
      return leftCredentialIndex - rightCredentialIndex;
    }
    return left.localeCompare(right);
  });

  return [
    "# Configuración local de PAM. No versionar este archivo.",
    ...keys.map((key) => `${key}=${JSON.stringify(String(values[key]))}`),
    "",
  ].join("\n");
}

async function persistProjectEnvironment(values, envPath) {
  const temporaryPath = `${envPath}.${process.pid}.tmp`;
  const contents = serializeEnv(values);

  await writeFile(temporaryPath, contents, { encoding: "utf8", mode: 0o600 });
  try {
    await rename(temporaryPath, envPath);
  } catch {
    await writeFile(envPath, contents, { encoding: "utf8", mode: 0o600 });
    await rm(temporaryPath, { force: true });
  }
}

export function validateCredentials(input) {
  const username = String(input?.username ?? "").trim();
  const password = String(input?.password ?? "");
  const normalizedSecret = String(input?.totpSecret ?? "")
    .toUpperCase()
    .replace(/[\s=-]/g, "");

  if (!username || username.length > 256 || username.includes("\0")) {
    throw new Error("Escriba un usuario válido.");
  }
  if (!password || password.length > 4096 || password.includes("\0")) {
    throw new Error("Escriba una contraseña válida.");
  }
  if (normalizedSecret.length < 16) {
    throw new Error(
      "Escriba la clave Base32 de enrolamiento del Authenticator, no el código temporal de 6 dígitos.",
    );
  }
  decodeBase32(normalizedSecret);

  return { username, password, totpSecret: normalizedSecret };
}

export async function readProjectEnvironment(envPath = defaultEnvPath) {
  try {
    return parseEnv(await readFile(envPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

export async function loadProjectCredentials(options = {}) {
  const values = await readProjectEnvironment(options.envPath);
  const environment = options.includeProcessEnvironment === false ? {} : process.env;
  return validateCredentials({
    username: environment.BI_USERNAME ?? values.BI_USERNAME,
    password: environment.BI_PASSWORD ?? values.BI_PASSWORD,
    totpSecret: environment.BI_TOTP_SECRET ?? values.BI_TOTP_SECRET,
  });
}

export async function credentialsAreConfigured(envPath = defaultEnvPath) {
  try {
    await loadProjectCredentials({ envPath, includeProcessEnvironment: false });
    return true;
  } catch {
    return false;
  }
}

export async function updateProjectEnvironment(updates, options = {}) {
  const envPath = options.envPath ?? defaultEnvPath;
  const currentValues = await readProjectEnvironment(envPath);
  const nextValues = { ...currentValues, ...updates };
  await persistProjectEnvironment(nextValues, envPath);
  return nextValues;
}

export async function writeProjectCredentials(input, options = {}) {
  const envPath = options.envPath ?? defaultEnvPath;
  const currentValues = await readProjectEnvironment(envPath);
  const credentials = validateCredentials({
    username: String(input?.username ?? "").trim() || currentValues.BI_USERNAME,
    password: String(input?.password ?? "") || currentValues.BI_PASSWORD,
    totpSecret: String(input?.totpSecret ?? "").trim() || currentValues.BI_TOTP_SECRET,
  });
  const nextValues = {
    ...currentValues,
    BI_USERNAME: credentials.username,
    BI_PASSWORD: credentials.password,
    BI_TOTP_SECRET: credentials.totpSecret,
  };
  await persistProjectEnvironment(nextValues, envPath);

  return credentials;
}
