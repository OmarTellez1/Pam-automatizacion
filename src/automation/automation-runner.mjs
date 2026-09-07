import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  credentialsAreConfigured,
  defaultEnvPath,
  projectDirectory,
  readProjectEnvironment,
} from "../config/env-config.mjs";
import { getFinalActionState } from "./final-action.mjs";
import { defaultMailEnvPath, getMailSettingsState } from "../email/mail-settings.mjs";
import { verifyOutlookAccount } from "../email/outlook-classic.mjs";
import { getOutlookSettingsState } from "../email/outlook-settings.mjs";
import {
  parseDayMonthForEcuador,
  validateRequestStartNotPast,
} from "../requests/request-config.mjs";
import { getRequestSettingsState } from "../requests/request-settings.mjs";
import { testButtonIsEnabled } from "./simulation.mjs";

const automationScript = path.join(projectDirectory, "scripts", "run-access-requests.ps1");
const automationResultPath = path.join(projectDirectory, "run-results", "last-run.json");
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

function repairPowerShellText(value) {
  if (!/[ÃÂ]/.test(value)) return value;
  try {
    return Buffer.from(value, "latin1").toString("utf8");
  } catch {
    return value;
  }
}

export function extractAutomationErrorMessage(stderr, exitCode) {
  const lines = repairPowerShellText(stderr)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const text = lines.join("\n");

  if (/mismo conjunto de Request ID ya fue enviado/i.test(text)) {
    return "Ya existe un correo enviado con estos mismos Request ID. Outlook no envió un duplicado.";
  }
  if (/permanecía en Bandeja de salida y se movió a Borradores/i.test(text)) {
    return "Outlook no completó el envío. El mensaje permanecía en Bandeja de salida y se movió a Borradores para evitar que se enviara más tarde. Revise la conexión de Outlook antes de intentarlo nuevamente.";
  }
  if (/no confirmó que el mensaje llegara a Enviados/i.test(text)) {
    return "Outlook no confirmó el envío del correo. Los Request ID no fueron marcados como enviados. Revise Outlook antes de intentarlo nuevamente.";
  }
  if (/valor no est[aá] dentro del intervalo esperado/i.test(text)) {
    return "Outlook no pudo enviar el correo porque rechazó el mensaje preparado. Revise el borrador guardado en Outlook e inténtelo nuevamente.";
  }

  const usefulLines = lines
    .map((line) => line.replace(/^.+?\.ps1\s*:\s*/i, ""))
    .filter((line) => !/^(?:En |At |\+|CategoryInfo\s*:|FullyQualifiedErrorId\s*:)/i.test(line));
  const diagnostic = usefulLines.find((line) =>
    /(?:fallido|no pudo|no se |ya existe|ya fue|Outlook|PAM|correo|solicitud)/i.test(line)
  );
  return diagnostic ?? `La automatización terminó con código ${exitCode}.`;
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
      finish(new Error(extractAutomationErrorMessage(stderr, code)));
    });
  });
}

export function createAutomationController(options = {}) {
  const envPath = options.envPath ?? defaultEnvPath;
  const mailEnvPath = options.mailEnvPath ?? defaultMailEnvPath;
  const runner = options.runner ?? runPowerShellAutomation;
  const outlookVerifier = options.outlookVerifier ?? verifyOutlookAccount;
  const now = options.now ?? (() => new Date());
  const resultLoader = options.resultLoader ?? (async () =>
    JSON.parse(await readFile(options.resultPath ?? automationResultPath, "utf8"))
  );
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
      const requestState = await getRequestSettingsState({ envPath });
      if (!requestState.configured) {
        throw statusError("Configure primero los parámetros de la solicitud.");
      }
      const currentTime = now();
      try {
        validateRequestStartNotPast(
          parseDayMonthForEcuador(requestState.settings.startDate, currentTime),
          requestState.settings.startTime,
          currentTime,
        );
      } catch (error) {
        throw statusError(error.message);
      }
      const finalAction = await getFinalActionState({ envPath });
      if (finalAction.sendEmail) {
        const outlookState = await getOutlookSettingsState({ envPath: mailEnvPath });
        if (!outlookState.configured) {
          throw statusError(
            "Configure y verifique primero su cuenta de Outlook o seleccione el resultado web.",
          );
        }
        if (!(await getMailSettingsState({ envPath: mailEnvPath })).configured) {
          throw statusError("Configure primero el envío de correo o seleccione el resultado web.");
        }
        try {
          await outlookVerifier(outlookState.sender);
        } catch (error) {
          throw statusError(`No fue posible verificar Outlook clásico: ${error.message}`);
        }
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
        .then(async () => {
          let conflicts = [];
          let completionResult;
          try {
            completionResult = await resultLoader(mode);
            conflicts = Array.isArray(completionResult?.conflicts)
              ? completionResult.conflicts
              : [];
          } catch {
            conflicts = [];
          }
          const emailSent = finalAction.sendEmail && completionResult?.sendEmail !== false;
          const emailSkipped = finalAction.sendEmail && completionResult?.sendEmail === false;
          status = {
            ...status,
            state: "completed",
            emailSent,
            conflicts,
            completedAt: new Date().toISOString(),
            message: emailSkipped
              ? "La automatización terminó sin Request ID nuevos. No se envió correo; revise las solicitudes omitidas en la interfaz."
              : emailSent
              ? `La automatización terminó y el correo se envió correctamente.${conflicts.length
                ? ` ${conflicts.length} solicitud${conflicts.length === 1 ? " fue omitida" : "es fueron omitidas"} por acceso aprobado superpuesto.`
                : ""}`
              : mode === "test"
                ? "Prueba completada sin enviar solicitudes al PAM."
                : `Automatización real completada.${conflicts.length
                  ? ` ${conflicts.length} solicitud${conflicts.length === 1 ? " fue omitida" : "es fueron omitidas"} por acceso aprobado superpuesto.`
                  : ""}`,
          };
        })
        .catch((error) => {
          status = {
            ...status,
            state: "failed",
            completedAt: new Date().toISOString(),
            errorMessage: error.message,
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
