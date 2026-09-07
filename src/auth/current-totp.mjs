import path from "node:path";
import https from "node:https";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadProjectCredentials } from "../config/env-config.mjs";
import { createTotpClock, generateTotp, waitForNextTotpWindow, waitForSafeTotpWindow } from "./totp.mjs";

export function loadPortalTotpClock(options = {}) {
  const get = options.get ?? https.get;
  const now = options.now ?? Date.now;
  const requestStartedAt = now();
  return new Promise((resolve, reject) => {
    // Fixed origin, no redirects, cookies or credentials. The certificate exception
    // applies only to this request to the same private PAM portal as the browser.
    const request = get("https://10.30.17.117/webconsole/login?redir=dashboard", {
      rejectUnauthorized: false,
      signal: AbortSignal.timeout(10_000),
      headers: { "Cache-Control": "no-cache" },
    }, (response) => {
      const responseReceivedAt = now();
      response.on("error", () => reject(new Error("No se pudo leer la hora de PAM.")));
      response.resume();
      if (response.statusCode !== 200) {
        reject(new Error("PAM no respondió correctamente al consultar la hora del Authenticator."));
        return;
      }
      try {
        resolve(createTotpClock(response.headers.date, { requestStartedAt, responseReceivedAt, now }));
      } catch (error) { reject(error); }
    });
    request.on("error", (error) => reject(new Error(error.code === "ABORT_ERR"
      ? "Tiempo agotado al consultar la hora de PAM. Revise la conexión o VPN."
      : "No se pudo consultar la hora de PAM. Revise la conexión o VPN.")));
  });
}

export async function getCurrentProjectTotp(options = {}) {
  // The PowerShell launcher also reads .env directly; keep all three credentials aligned.
  const credentials = await loadProjectCredentials({ envPath: options.envPath, includeProcessEnvironment: false });
  const now = await (options.loadClock ?? loadPortalTotpClock)();
  if (options.nextWindow) {
    await waitForNextTotpWindow({ timestamp: now(), sleep: options.sleep });
  }
  await waitForSafeTotpWindow({ now, sleep: options.sleep });
  return generateTotp(credentials.totpSecret, { timestamp: now() });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--next-window")) throw new Error("Opción de TOTP no válida.");
    process.stdout.write(await getCurrentProjectTotp({ nextWindow: args.includes("--next-window") }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
