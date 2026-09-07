import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getOutlookSettingsState,
  loadOutlookSender,
  writeOutlookSender,
} from "../src/email/outlook-settings.mjs";
import { readProjectEnvironment, updateProjectEnvironment } from "../src/config/env-config.mjs";

test("guarda y recupera únicamente el remitente verificado de Outlook", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-outlook-settings-"));
  const envPath = path.join(directory, ".env.mail");
  await updateProjectEnvironment({ PAM_MAIL_TO: "destino@example.com" }, { envPath });

  const sender = await writeOutlookSender("usuario@example.com", { envPath });
  assert.equal(sender, "usuario@example.com");
  assert.equal(await loadOutlookSender({ envPath }), sender);
  assert.deepEqual(await getOutlookSettingsState({ envPath }), {
    configured: true,
    sender,
  });
  const values = await readProjectEnvironment(envPath);
  assert.equal(values.PAM_MAIL_TO, "destino@example.com");
});

test("Outlook permanece opcional cuando no existe un remitente válido", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-outlook-optional-"));
  const envPath = path.join(directory, ".env.mail");
  assert.deepEqual(await getOutlookSettingsState({ envPath }), {
    configured: false,
    sender: "",
  });
  await assert.rejects(
    () => writeOutlookSender("correo-invalido", { envPath }),
    /dirección de correo válida/,
  );
});
