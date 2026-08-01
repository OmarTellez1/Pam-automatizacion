import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  credentialsAreConfigured,
  defaultEnvPath,
  projectDirectory,
  readProjectEnvironment,
} from "./env-config.mjs";
import { getFinalActionState } from "./final-action.mjs";
import { defaultMailEnvPath, getMailSettingsState } from "./mail-settings.mjs";
import { getRequestSettingsState } from "./request-settings.mjs";
import { testButtonIsEnabled } from "./simulation.mjs";

const automationScript = path.join(projectDirectory, "scripts", "run-access-requests.ps1");
export const automationLogsDirectory = path.join(projectDirectory, "logs");

function statusError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function createAutomationLogPath(mode, date = new Date()) {
  const timestamp = date.toISOString().replace(/[:.]/g, "-");
  return path.join(automationLogsDirectory, `automation-${mode}-${timestamp}.log`);
}

export async function runPowerShellAutomation(mode, options = {}) {
  const modeArgument = mode === "real" ? "-Execute" : "-TestRun";
  const logPath = options.logPath ?? createAutomationLogPath(mode);
  await mkdir(path.dirname(logPath), { recursive: true });

  return new Promise((resolve, reject) => {
    const log = createWriteStream(logPath, { flags: "a", encoding: "utf8" });
    log.write(`[${new Date().toISOString()}] Inicio de automatización. Modo: ${mode}.\n`);
    const child = spawn("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      automationScript,
      modeArgument,
    ], {
      cwd: projectDirectory,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let settled = false;
    child.stdout.on("data", (chunk) => {
      log.write(chunk);
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      log.write(chunk);
      process.stderr.write(chunk);
      stderr = `${stderr}${chunk}`.slice(-16_000);
    });
    const finish = (error) => {
      if (settled) return;
      settled = true;
      log.write(`[${new Date().toISOString()}] ${error ? `Error: ${error.message}` : "Finalización correcta."}\n`);
      log.end(() => error ? reject(error) : resolve({ logPath }));
    };
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (code === 0) {
        finish();
        return;
      }
      const lines = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const diagnostic = lines.find((line) => /(?:syntaxerror|error:|exception|fallido)/i.test(line));
      finish(new Error(diagnostic ?? `La automatización terminó con código ${code}.`));
    });
  });
}

export function createAutomationController(options = {}) {
  const envPath = options.envPath ?? defaultEnvPath;
  const mailEnvPath = options.mailEnvPath ?? defaultMailEnvPath;
  const runner = options.runner ?? runPowerShellAutomation;
  let launchReserved = false;
  let status = {
    state: "idle",
    mode: null,
    message: "La automatización está lista.",
  };

  async function testEnabled() {
    const values = await readProjectEnvironment(envPath);
    return testButtonIsEnabled(values.BOTON_PRUEBA);
  }

  async function getStatus() {
    return { ...status, testButtonEnabled: await testEnabled() };
  }

  async function start(mode) {
    if (!["test", "real"].includes(mode)) {
      throw statusError("El modo de automatización no es válido.");
    }
    if (launchReserved || status.state === "running") {
      throw statusError("Ya hay una automatización en ejecución.", 409);
    }

    launchReserved = true;
    try {
      if (mode === "test" && !(await testEnabled())) {
        throw statusError("El botón de prueba no está habilitado en .env.", 403);
      }
      if (!(await credentialsAreConfigured(envPath))) {
        throw statusError("Configure primero las credenciales del PAM.");
      }
      if (!(await getRequestSettingsState({ envPath })).configured) {
        throw statusError("Configure primero los parámetros de la solicitud.");
      }
      const finalAction = await getFinalActionState({ envPath });
      if (finalAction.sendEmail && !(await getMailSettingsState({ envPath: mailEnvPath })).configured) {
        throw statusError("Configure primero el envío de correo o seleccione el resultado web.");
      }

      const startedAt = new Date().toISOString();
      const logPath = createAutomationLogPath(mode, new Date(startedAt));
      const logFile = path.relative(projectDirectory, logPath);
      status = {
        state: "running",
        mode,
        finalAction: finalAction.action,
        emailSent: false,
        startedAt,
        logFile,
        message: `${mode === "test"
          ? "Prueba en curso: se llenarán y descartarán todos los formularios de Favorites."
          : "Automatización real en curso: se crearán solicitudes en PAM."} ` +
          "Todos los botones se habilitarán nuevamente cuando termine con éxito o con error.",
      };

      void Promise.resolve()
        .then(() => runner(mode, { logPath }))
        .then(() => {
          status = {
            ...status,
            state: "completed",
            emailSent: finalAction.sendEmail,
            completedAt: new Date().toISOString(),
            message: finalAction.sendEmail
              ? "La automatización terminó y el correo se envió correctamente."
              : mode === "test"
                ? "Prueba completada sin enviar solicitudes al PAM."
                : "Automatización real completada.",
          };
        })
        .catch((error) => {
          status = {
            ...status,
            state: "failed",
            completedAt: new Date().toISOString(),
            message: `La automatización terminó con error: ${error.message} Log: ${logFile}`,
          };
        });

      return getStatus();
    } finally {
      launchReserved = false;
    }
  }

  return { getStatus, start };
}
