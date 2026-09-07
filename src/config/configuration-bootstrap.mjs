import {
  createProjectEnvironmentFile,
  defaultEnvPath,
} from "./env-config.mjs";
import { DEFAULT_FINAL_ACTION } from "../automation/final-action.mjs";
import {
  defaultMailEnvPath,
  ensureMailSettingsFile,
} from "../email/mail-settings.mjs";
import { DEFAULT_HOURS, DEFAULT_REASON } from "../requests/request-config.mjs";

export async function initializeLocalConfigurationFiles(options = {}) {
  const envPath = options.envPath ?? defaultEnvPath;
  const mailEnvPath = options.mailEnvPath ?? defaultMailEnvPath;
  const [envCreated, mailEnvCreated] = await Promise.all([
    createProjectEnvironmentFile({
      BI_USERNAME: "",
      BI_PASSWORD: "",
      BI_TOTP_SECRET: "",
      PAM_START_DATE: "",
      PAM_START_TIME: "",
      PAM_SESSION_HOURS: String(DEFAULT_HOURS),
      PAM_REQUEST_REASON: DEFAULT_REASON,
      PAM_FINAL_ACTION: DEFAULT_FINAL_ACTION,
      BOTON_PRUEBA: "FALSE",
    }, { envPath }),
    ensureMailSettingsFile({ envPath: mailEnvPath }),
  ]);
  return { envCreated, mailEnvCreated };
}
