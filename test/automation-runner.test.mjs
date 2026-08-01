import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createAutomationController } from "../src/automation-runner.mjs";
import { updateProjectEnvironment } from "../src/env-config.mjs";
import { formatAutomationEmailSubject } from "../src/simulation.mjs";

async function createConfiguredEnvironment(testButtonValue) {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-automation-controller-"));
  const envPath = path.join(directory, ".env");
  const mailEnvPath = path.join(directory, ".env.mail");
  await writeFile(envPath, [
    'BI_USERNAME="usuario.prueba"',
    'BI_PASSWORD="contraseña-prueba"',
    'BI_TOTP_SECRET="JBSWY3DPEHPK3PXP"',
    'PAM_START_DATE="03/08"',
    'PAM_START_TIME="14:15"',
    'PAM_SESSION_HOURS="8"',
    'PAM_REQUEST_REASON="Prueba"',
    'PAM_FINAL_ACTION="web"',
    `BOTON_PRUEBA="${testButtonValue}"`,
    "",
  ].join("\n"), "utf8");
  await writeFile(mailEnvPath, "", "utf8");
  return { envPath, mailEnvPath };
}

async function configureEmailFinalAction(paths) {
  const env = await import("../src/env-config.mjs");
  await env.updateProjectEnvironment({ PAM_FINAL_ACTION: "email" }, { envPath: paths.envPath });
  await writeFile(paths.mailEnvPath, [
    'PAM_MAIL_SENDER="sender@example.com"',
    'PAM_MAIL_TO="recipient@example.com"',
    'PAM_MAIL_CC=""',
    'PAM_MAIL_SUBJECT="Accesos PAM"',
    'PAM_MAIL_CONTENT_HTML="<p>{{REQUEST_IDS}}</p>"',
    "",
  ].join("\n"), "utf8");
}

test("habilita el modo de prueba únicamente con BOTON_PRUEBA=TRUE", async () => {
  const enabledPaths = await createConfiguredEnvironment("TRUE");
  const disabledPaths = await createConfiguredEnvironment("FALSE");
  const enabled = createAutomationController({ ...enabledPaths, runner: async () => {} });
  const disabled = createAutomationController({ ...disabledPaths, runner: async () => {} });

  assert.equal((await enabled.getStatus()).testButtonEnabled, true);
  assert.equal((await disabled.getStatus()).testButtonEnabled, false);
  await assert.rejects(() => disabled.start("test"), /no está habilitado/);
});

test("rechaza un horario pasado antes de iniciar PowerShell", async () => {
  const paths = await createConfiguredEnvironment("TRUE");
  await updateProjectEnvironment({
    PAM_START_DATE: "01/08",
    PAM_START_TIME: "10:00",
  }, { envPath: paths.envPath });
  let runnerCalled = false;
  const controller = createAutomationController({
    ...paths,
    now: () => new Date("2026-08-01T18:35:00.000Z"),
    runner: async () => { runnerCalled = true; },
  });

  await assert.rejects(() => controller.start("real"), /fecha y hora de inicio ya pasaron/);
  assert.equal(runnerCalled, false);
});

test("identifica únicamente los asuntos de correo simulados", () => {
  assert.equal(formatAutomationEmailSubject("Accesos PAM", true), "[PRUEBA] Accesos PAM");
  assert.equal(formatAutomationEmailSubject("Accesos PAM", false), "Accesos PAM");
});

test("impide dos automatizaciones simultáneas y conserva el modo solicitado", async () => {
  const paths = await createConfiguredEnvironment("TRUE");
  let finish;
  const running = new Promise((resolve) => { finish = resolve; });
  const controller = createAutomationController({
    ...paths,
    runner: async () => running,
    outlookVerifier: async () => {},
    resultLoader: async () => ({ sendEmail: true, conflicts: [] }),
  });

  const started = await controller.start("test");
  assert.equal(started.state, "running");
  assert.equal(started.mode, "test");
  await assert.rejects(() => controller.start("real"), /Ya hay una automatización/);

  finish();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await controller.getStatus()).state, "completed");
});

test("publica el error exacto y la ruta del log para la interfaz", async () => {
  const paths = await createConfiguredEnvironment("TRUE");
  const controller = createAutomationController({
    ...paths,
    runner: async () => { throw new Error("Selector Favorites no encontrado."); },
  });

  await controller.start("test");
  await new Promise((resolve) => setImmediate(resolve));
  const status = await controller.getStatus();
  assert.equal(status.state, "failed");
  assert.match(status.message, /Selector Favorites no encontrado/);
  assert.match(status.message, /logs[\\/]automation-test-/);
  assert.match(status.logFile, /^logs[\\/]automation-test-/);
});

test("informa el bloqueo temporal y confirma el correo al completar", async () => {
  const paths = await createConfiguredEnvironment("TRUE");
  await configureEmailFinalAction(paths);
  let finish;
  const running = new Promise((resolve) => { finish = resolve; });
  const controller = createAutomationController({
    ...paths,
    runner: async () => running,
    outlookVerifier: async () => {},
    resultLoader: async () => ({ sendEmail: true, conflicts: [] }),
  });

  const started = await controller.start("test");
  assert.equal(started.finalAction, "email");
  assert.equal(started.emailSent, false);
  assert.match(started.message, /Todos los botones se habilitarán nuevamente/);

  finish();
  await new Promise((resolve) => setImmediate(resolve));
  const completed = await controller.getStatus();
  assert.equal(completed.state, "completed");
  assert.equal(completed.emailSent, true);
  assert.match(completed.message, /correo se envió correctamente/);
});

test("no confirma correo cuando todos los accesos terminaron en conflicto", async () => {
  const paths = await createConfiguredEnvironment("TRUE");
  await configureEmailFinalAction(paths);
  const conflict = {
    type: "approved_access_overlap",
    system: "NOSQLBOOSTER",
    account: "TicProyectos",
    application: "NOSQLBOOSTER",
    requestStartDate: "Aug 03, 2026, 12:00 AM",
  };
  const controller = createAutomationController({
    ...paths,
    runner: async () => {},
    outlookVerifier: async () => {},
    resultLoader: async () => ({ sendEmail: false, conflicts: [conflict] }),
  });

  await controller.start("real");
  await new Promise((resolve) => setImmediate(resolve));
  const completed = await controller.getStatus();
  assert.equal(completed.state, "completed");
  assert.equal(completed.emailSent, false);
  assert.deepEqual(completed.conflicts, [conflict]);
  assert.match(completed.message, /No se envió correo/);
});

test("verifica Outlook antes de iniciar una automatización con correo", async () => {
  const paths = await createConfiguredEnvironment("TRUE");
  await configureEmailFinalAction(paths);
  let runnerCalled = false;
  const controller = createAutomationController({
    ...paths,
    outlookVerifier: async () => {
      throw new Error("La cuenta no está iniciada.");
    },
    runner: async () => { runnerCalled = true; },
  });

  await assert.rejects(
    () => controller.start("real"),
    /No fue posible verificar Outlook clásico.*cuenta no está iniciada/,
  );
  assert.equal(runnerCalled, false);
});
