import process from "node:process";
import {
  defaultEnvPath,
  readProjectEnvironment,
  updateProjectEnvironment,
} from "./env-config.mjs";

export const FINAL_ACTION_WEB = "web";
export const FINAL_ACTION_EMAIL = "email";
export const DEFAULT_FINAL_ACTION = FINAL_ACTION_WEB;

export function validateFinalAction(value) {
  const action = String(value ?? "").trim().toLowerCase();
  if (action !== FINAL_ACTION_WEB && action !== FINAL_ACTION_EMAIL) {
    throw new Error("La acción final debe ser resultado web o envío de correo.");
  }
  return action;
}

export function finalActionSendsEmail(action) {
  return validateFinalAction(action) === FINAL_ACTION_EMAIL;
}

export async function loadFinalAction(options = {}) {
  const values = await readProjectEnvironment(options.envPath);
  const environment = options.includeProcessEnvironment === false ? {} : process.env;
  const storedValue = environment.PAM_FINAL_ACTION ?? values.PAM_FINAL_ACTION ?? DEFAULT_FINAL_ACTION;
  const value = String(storedValue).toLowerCase() === "notepad" ? FINAL_ACTION_WEB : storedValue;
  return validateFinalAction(value);
}

export async function getFinalActionState(options = {}) {
  const action = await loadFinalAction({
    envPath: options.envPath,
    includeProcessEnvironment: false,
  });
  return { action, sendEmail: finalActionSendsEmail(action) };
}

export async function writeFinalAction(value, options = {}) {
  const envPath = options.envPath ?? defaultEnvPath;
  const action = validateFinalAction(value);
  await updateProjectEnvironment({ PAM_FINAL_ACTION: action }, { envPath });
  return action;
}
