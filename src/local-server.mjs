import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  credentialsAreConfigured,
  defaultEnvPath,
  projectDirectory,
  writeProjectCredentials,
} from "./env-config.mjs";
import { openAuthenticatedSession, saveFailureArtifact } from "./session.mjs";
import {
  getRequestSettingsState,
  writeRequestSettings,
} from "./request-settings.mjs";
import {
  defaultMailEnvPath,
  getMailSettingsState,
  writeMailSettings,
} from "./mail-settings.mjs";
import {
  getFinalActionState,
  writeFinalAction,
} from "./final-action.mjs";
import {
  defaultAutomationResultPath,
  getLatestAutomationResult,
} from "./automation-result.mjs";
import { initializeLocalConfigurationFiles } from "./configuration-bootstrap.mjs";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 4317;
const staticDirectory = path.join(projectDirectory, "web");
const routeFiles = new Map([
  ["/", "index.html"],
  ["/credenciales", "credentials.html"],
  ["/solicitud", "request-settings.html"],
  ["/correo", "mail-settings.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
  ["/credentials.js", "credentials.js"],
  ["/request-settings.js", "request-settings.js"],
  ["/mail-settings.js", "mail-settings.js"],
]);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function setSecurityHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
  ].join("; "));
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

function sendJson(response, statusCode, body) {
  setSecurityHeaders(response);
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function requestHasAllowedHost(request) {
  const port = request.socket.localPort;
  return request.headers.host === `${HOST}:${port}` || request.headers.host === `localhost:${port}`;
}

function requestIsSameOrigin(request) {
  return request.headers.origin === `http://${request.headers.host}`;
}

async function readJsonBody(request, maxBytes = 16_384) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("La solicitud es demasiado grande.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("La solicitud no contiene JSON válido.");
    error.statusCode = 400;
    throw error;
  }
}

async function verifyLogin(credentials) {
  let session;
  let failedBrowser;
  try {
    session = await openAuthenticatedSession({ credentials, headed: false });
  } catch (error) {
    failedBrowser = error.browser;
    await saveFailureArtifact(error.page, error).catch(() => {});
    throw error;
  } finally {
    await (session?.browser ?? failedBrowser)?.close().catch(() => {});
  }
}

export function describeAuthenticationFailure(error) {
  if (error?.authenticationStage === "primary_credentials") {
    return "El portal no aceptó el usuario o la contraseña. Revise ambos datos e inténtelo nuevamente.";
  }
  if (error?.authenticationStage === "totp") {
    return "El usuario y la contraseña fueron aceptados, pero el código de Microsoft Authenticator no fue válido. Revise la clave Base32 y la hora del equipo.";
  }
  if (error?.authenticationStage === "confirmation") {
    return "El portal procesó las credenciales, pero no confirmó el inicio de sesión. Inténtelo nuevamente o revise el estado del portal.";
  }
  return "No fue posible conectar o completar el inicio de sesión. Revise la conexión a la red o VPN y vuelva a intentarlo.";
}

export function createLocalServer(options = {}) {
  const envPath = options.envPath ?? defaultEnvPath;
  const mailEnvPath = options.mailEnvPath ?? defaultMailEnvPath;
  const automationResultPath = options.automationResultPath ?? defaultAutomationResultPath;
  const authenticate = options.authenticate ?? verifyLogin;
  let credentialTestInProgress = false;
  let requestSettingsWriteInProgress = false;
  let mailSettingsWriteInProgress = false;
  let finalActionWriteInProgress = false;

  return http.createServer(async (request, response) => {
    try {
      if (!requestHasAllowedHost(request)) {
        sendJson(response, 403, { message: "Host local no permitido." });
        return;
      }

      const url = new URL(request.url, `http://${request.headers.host}`);

      if (request.method === "GET" && url.pathname === "/api/credentials/status") {
        sendJson(response, 200, { configured: await credentialsAreConfigured(envPath) });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/request-settings") {
        sendJson(response, 200, await getRequestSettingsState({ envPath }));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/mail-settings") {
        sendJson(response, 200, await getMailSettingsState({ envPath: mailEnvPath }));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/final-action") {
        sendJson(response, 200, await getFinalActionState({ envPath }));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/automation-result") {
        sendJson(response, 200, await getLatestAutomationResult({
          resultPath: automationResultPath,
        }));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/credentials") {
        if (!requestIsSameOrigin(request)) {
          sendJson(response, 403, { message: "Origen de solicitud no permitido." });
          return;
        }
        if (!String(request.headers["content-type"] ?? "").startsWith("application/json")) {
          sendJson(response, 415, { message: "El contenido debe enviarse como JSON." });
          return;
        }
        if (credentialTestInProgress) {
          sendJson(response, 409, {
            message: "Ya se está guardando y comprobando otra configuración.",
          });
          return;
        }

        credentialTestInProgress = true;
        try {
          const credentials = await writeProjectCredentials(await readJsonBody(request), { envPath });
          try {
            await authenticate(credentials);
            sendJson(response, 200, {
              configured: true,
              verified: true,
              message: "Credenciales guardadas. El inicio de sesión se comprobó correctamente.",
            });
          } catch (error) {
            sendJson(response, 200, {
              configured: true,
              verified: false,
              message: describeAuthenticationFailure(error),
            });
          }
        } finally {
          credentialTestInProgress = false;
        }
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/request-settings") {
        if (!requestIsSameOrigin(request)) {
          sendJson(response, 403, { message: "Origen de solicitud no permitido." });
          return;
        }
        if (!String(request.headers["content-type"] ?? "").startsWith("application/json")) {
          sendJson(response, 415, { message: "El contenido debe enviarse como JSON." });
          return;
        }
        if (requestSettingsWriteInProgress) {
          sendJson(response, 409, {
            message: "Ya se está guardando otra configuración de solicitud.",
          });
          return;
        }

        requestSettingsWriteInProgress = true;
        try {
          const settings = await writeRequestSettings(await readJsonBody(request), { envPath });
          sendJson(response, 200, {
            configured: true,
            settings,
            message: "Configuración de solicitud guardada correctamente.",
          });
        } finally {
          requestSettingsWriteInProgress = false;
        }
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/mail-settings") {
        if (!requestIsSameOrigin(request)) {
          sendJson(response, 403, { message: "Origen de solicitud no permitido." });
          return;
        }
        if (!String(request.headers["content-type"] ?? "").startsWith("application/json")) {
          sendJson(response, 415, { message: "El contenido debe enviarse como JSON." });
          return;
        }
        if (mailSettingsWriteInProgress) {
          sendJson(response, 409, {
            message: "Ya se está guardando otra configuración de correo.",
          });
          return;
        }

        mailSettingsWriteInProgress = true;
        try {
          const settings = await writeMailSettings(
            await readJsonBody(request, 12_000_000),
            { envPath: mailEnvPath },
          );
          sendJson(response, 200, {
            configured: true,
            settings,
            message: "Configuración de correo guardada correctamente.",
          });
        } finally {
          mailSettingsWriteInProgress = false;
        }
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/final-action") {
        if (!requestIsSameOrigin(request)) {
          sendJson(response, 403, { message: "Origen de solicitud no permitido." });
          return;
        }
        if (!String(request.headers["content-type"] ?? "").startsWith("application/json")) {
          sendJson(response, 415, { message: "El contenido debe enviarse como JSON." });
          return;
        }
        if (finalActionWriteInProgress) {
          sendJson(response, 409, { message: "Ya se está cambiando la acción final." });
          return;
        }

        finalActionWriteInProgress = true;
        try {
          const input = await readJsonBody(request);
          const action = await writeFinalAction(input.action, { envPath });
          sendJson(response, 200, {
            action,
            sendEmail: action === "email",
            message: "Acción final guardada correctamente.",
          });
        } finally {
          finalActionWriteInProgress = false;
        }
        return;
      }

      const fileName = request.method === "GET" ? routeFiles.get(url.pathname) : undefined;
      if (!fileName) {
        sendJson(response, 404, { message: "Recurso no encontrado." });
        return;
      }

      const filePath = path.join(staticDirectory, fileName);
      const contents = await readFile(filePath);
      setSecurityHeaders(response);
      response.writeHead(200, { "Content-Type": contentTypes[path.extname(fileName)] });
      response.end(contents);
    } catch (error) {
      sendJson(response, error.statusCode ?? 400, {
        message: error.message || "No fue posible procesar la solicitud.",
      });
    }
  });
}

export function openDefaultBrowser(url) {
  return new Promise((resolve, reject) => {
    const child = spawn("explorer.exe", [url], {
      detached: true,
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function parsePort(argumentsList) {
  const portIndex = argumentsList.indexOf("--port");
  const value = portIndex === -1 ? process.env.PAM_UI_PORT ?? DEFAULT_PORT : argumentsList[portIndex + 1];
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("El puerto de la interfaz local no es válido.");
  }
  return port;
}

const isEntryPoint = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

export async function startLocalInterface(options = {}) {
  const host = options.host ?? HOST;
  const port = options.port ?? DEFAULT_PORT;
  const envPath = options.envPath ?? defaultEnvPath;
  const mailEnvPath = options.mailEnvPath ?? defaultMailEnvPath;
  await initializeLocalConfigurationFiles({ envPath, mailEnvPath });
  const server = createLocalServer({ ...options, envPath, mailEnvPath });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  const actualPort = server.address().port;
  const url = `http://${host}:${actualPort}/`;
  if (options.openBrowser !== false) {
    const browserOpener = options.browserOpener ?? openDefaultBrowser;
    try {
      await browserOpener(url);
    } catch (error) {
      console.error(`No fue posible abrir el navegador automáticamente: ${error.message}`);
      console.error(`Abra manualmente ${url}`);
    }
  }

  return { server, url };
}

if (isEntryPoint) {
  try {
    const port = parsePort(process.argv.slice(2));
    const { url } = await startLocalInterface({
      port,
      openBrowser: !process.argv.includes("--no-open"),
    });
    console.log(`Interfaz PAM disponible en ${url}`);
    console.log("Cierre esta ventana o presione Ctrl+C para detenerla.");
  } catch (error) {
    console.error(`No fue posible iniciar la interfaz local: ${error.message}`);
    process.exitCode = 1;
  }
}
