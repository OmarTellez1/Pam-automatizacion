import {
  readProjectEnvironment,
  updateProjectEnvironment,
} from "./env-config.mjs";
import { validateEmailAddress } from "./email-address.mjs";
import { defaultMailEnvPath } from "./mail-settings.mjs";

export async function loadOutlookSender(options = {}) {
  const envPath = options.envPath ?? defaultMailEnvPath;
  const values = await readProjectEnvironment(envPath);
  return validateEmailAddress(values.PAM_MAIL_SENDER, "Tu correo de Outlook");
}

export async function getOutlookSettingsState(options = {}) {
  const envPath = options.envPath ?? defaultMailEnvPath;
  const values = await readProjectEnvironment(envPath);
  const rawSender = String(values.PAM_MAIL_SENDER ?? "").trim();
  try {
    return {
      configured: true,
      sender: validateEmailAddress(rawSender, "Tu correo de Outlook"),
    };
  } catch {
    return { configured: false, sender: rawSender };
  }
}

export async function writeOutlookSender(value, options = {}) {
  const envPath = options.envPath ?? defaultMailEnvPath;
  const sender = validateEmailAddress(value, "Tu correo de Outlook");
  await updateProjectEnvironment({ PAM_MAIL_SENDER: sender }, { envPath });
  return sender;
}
