import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  finalActionSendsEmail,
  getFinalActionState,
  loadFinalAction,
  validateFinalAction,
  writeFinalAction,
} from "../src/automation/final-action.mjs";
import { updateProjectEnvironment } from "../src/config/env-config.mjs";

test("usa la interfaz web como resultado seguro predeterminado", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-final-default-"));
  const envPath = path.join(directory, ".env");
  assert.deepEqual(await getFinalActionState({ envPath }), {
    action: "web",
    sendEmail: false,
  });
});

test("guarda la selección de correo y la recupera", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-final-email-"));
  const envPath = path.join(directory, ".env");
  await writeFinalAction("email", { envPath });
  assert.equal(await loadFinalAction({ envPath, includeProcessEnvironment: false }), "email");
  assert.equal(finalActionSendsEmail("email"), true);
  assert.equal(finalActionSendsEmail("web"), false);
});

test("rechaza cualquier acción final desconocida", () => {
  assert.throws(() => validateFinalAction("ambos"), /resultado web o envío de correo/);
});

test("migra la selección anterior de Bloc de notas al resultado web", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-final-legacy-"));
  const envPath = path.join(directory, ".env");
  await updateProjectEnvironment({ PAM_FINAL_ACTION: "notepad" }, { envPath });
  assert.equal(await loadFinalAction({ envPath, includeProcessEnvironment: false }), "web");
});
