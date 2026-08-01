import process from "node:process";
import {
  defaultEnvPath,
  readProjectEnvironment,
  updateProjectEnvironment,
} from "./env-config.mjs";
import {
  DEFAULT_HOURS,
  DEFAULT_REASON,
  parseTime12Hour,
  parseDayMonthForEcuador,
  splitTime24Hour,
  validateStartTime,
} from "./request-config.mjs";

const MAX_SESSION_HOURS = 8;

export function validateRequestSettings(input) {
  const startDate = String(input?.startDate ?? "").trim();
  const usesTwelveHourInput = input?.startTime12 !== undefined || input?.startPeriod !== undefined;
  const startTime = usesTwelveHourInput
    ? parseTime12Hour(input?.startTime12, input?.startPeriod)
    : validateStartTime(input?.startTime);
  const rawSessionHours = String(input?.sessionHours ?? "").trim();
  const reason = String(input?.reason ?? "").trim();

  parseDayMonthForEcuador(startDate);
  if (!/^\d+$/.test(rawSessionHours)) {
    throw new Error("La duración debe ser una cantidad entera de horas.");
  }
  const sessionHours = Number(rawSessionHours);
  if (sessionHours < 1 || sessionHours > MAX_SESSION_HOURS) {
    throw new Error(`La duración debe estar entre 1 y ${MAX_SESSION_HOURS} horas.`);
  }
  if (!reason || reason.length > 1_000 || reason.includes("\0")) {
    throw new Error("Escriba una razón válida de hasta 1000 caracteres.");
  }

  return {
    startDate,
    startTime,
    sessionHours,
    durationDays: 0,
    durationHours: sessionHours,
    reason,
  };
}

function settingsForForm(settings) {
  return {
    ...settings,
    ...splitTime24Hour(settings.startTime),
  };
}

export async function loadRequestSettings(options = {}) {
  const values = await readProjectEnvironment(options.envPath);
  const environment = options.includeProcessEnvironment === false ? {} : process.env;
  return validateRequestSettings({
    startDate: environment.PAM_START_DATE ?? values.PAM_START_DATE,
    startTime: environment.PAM_START_TIME ?? values.PAM_START_TIME,
    sessionHours: environment.PAM_SESSION_HOURS ?? values.PAM_SESSION_HOURS,
    reason: environment.PAM_REQUEST_REASON ?? values.PAM_REQUEST_REASON,
  });
}

export async function getRequestSettingsState(options = {}) {
  try {
    const settings = await loadRequestSettings({
      envPath: options.envPath,
      includeProcessEnvironment: false,
    });
    return { configured: true, settings: settingsForForm(settings) };
  } catch {
    return {
      configured: false,
      settings: {
        startDate: "",
        startTime: "",
        startTime12: "",
        startPeriod: "AM",
        sessionHours: DEFAULT_HOURS,
        durationDays: 0,
        durationHours: DEFAULT_HOURS,
        reason: DEFAULT_REASON,
      },
    };
  }
}

export async function writeRequestSettings(input, options = {}) {
  const envPath = options.envPath ?? defaultEnvPath;
  const settings = validateRequestSettings(input);
  await updateProjectEnvironment({
    PAM_START_DATE: settings.startDate,
    PAM_START_TIME: settings.startTime,
    PAM_SESSION_HOURS: String(settings.sessionHours),
    PAM_REQUEST_REASON: settings.reason,
  }, { envPath });
  return settingsForForm(settings);
}
