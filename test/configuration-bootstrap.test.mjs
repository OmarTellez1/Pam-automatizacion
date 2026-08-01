import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { initializeLocalConfigurationFiles } from "../src/configuration-bootstrap.mjs";
import { readProjectEnvironment } from "../src/env-config.mjs";
import { getMailSettingsState } from "../src/mail-settings.mjs";

test("crea automáticamente .env y .env.mail con todas las variables iniciales", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-bootstrap-"));
  const envPath = path.join(directory, ".env");
  const mailEnvPath = path.join(directory, ".env.mail");

  assert.deepEqual(
    await initializeLocalConfigurationFiles({ envPath, mailEnvPath }),
    { envCreated: true, mailEnvCreated: true },
  );
  const values = await readProjectEnvironment(envPath);
  assert.equal(values.BI_USERNAME, "");
  assert.equal(values.BI_PASSWORD, "");
  assert.equal(values.BI_TOTP_SECRET, "");
  assert.equal(values.PAM_SESSION_HOURS, "8");
  assert.equal(values.PAM_FINAL_ACTION, "web");
  const mail = await getMailSettingsState({ envPath: mailEnvPath });
  assert.equal(mail.configured, false);
  assert.ok(mail.settings.to.length > 0);
  assert.equal(mail.settings.contentHtml, "");
});

test("no modifica ninguno de los archivos cuando ya existen", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-bootstrap-existing-"));
  const envPath = path.join(directory, ".env");
  const mailEnvPath = path.join(directory, ".env.mail");
  const existingEnv = "EXISTING_ENV_CONTENT";
  const existingMailEnv = "EXISTING_MAIL_CONTENT";
  await Promise.all([
    writeFile(envPath, existingEnv, "utf8"),
    writeFile(mailEnvPath, existingMailEnv, "utf8"),
  ]);

  assert.deepEqual(
    await initializeLocalConfigurationFiles({ envPath, mailEnvPath }),
    { envCreated: false, mailEnvCreated: false },
  );
  assert.equal(await readFile(envPath, "utf8"), existingEnv);
  assert.equal(await readFile(mailEnvPath, "utf8"), existingMailEnv);
});
