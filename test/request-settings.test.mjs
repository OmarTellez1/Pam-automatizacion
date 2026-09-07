import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  readProjectEnvironment,
  writeProjectCredentials,
} from "../src/config/env-config.mjs";
import {
  getRequestSettingsState,
  loadRequestSettings,
  validateRequestSettings,
  writeRequestSettings,
} from "../src/requests/request-settings.mjs";

test("valida fecha, hora, duración total y razón de la solicitud", () => {
  assert.deepEqual(validateRequestSettings({
    startDate: "01/08",
    startTime12: "02:00",
    startPeriod: "PM",
    sessionHours: "8",
    reason: "Soporte programado",
  }), {
    startDate: "01/08",
    startTime: "14:00",
    sessionHours: 8,
    durationDays: 0,
    durationHours: 8,
    reason: "Soporte programado",
  });
});

test("mantiene la duración permitida dentro del campo Hours del portal", () => {
  const settings = validateRequestSettings({
    startDate: "01/08",
    startTime: "14:00",
    sessionHours: 8,
    reason: "Soporte programado",
  });
  assert.equal(settings.durationDays, 0);
  assert.equal(settings.durationHours, 8);
});

test("guarda y recupera la configuración sin modificar credenciales existentes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-request-settings-"));
  const envPath = path.join(directory, ".env");
  const expected = {
    startDate: "02/08",
    startTime: "09:30",
    sessionHours: 7,
    durationDays: 0,
    durationHours: 7,
    reason: "Mantenimiento de aplicación",
  };

  await writeProjectCredentials({
    username: "usuario.prueba",
    password: "contraseña-prueba",
    totpSecret: "JBSWY3DPEHPK3PXP",
  }, { envPath });
  await writeRequestSettings(expected, { envPath });
  assert.deepEqual(await loadRequestSettings({ envPath }), expected);
  assert.deepEqual(await getRequestSettingsState({ envPath }), {
    configured: true,
    dateUpdated: false,
    settings: {
      ...expected,
      startTime12: "09:30",
      startPeriod: "AM",
    },
  });
  const values = await readProjectEnvironment(envPath);
  assert.equal(values.PAM_REQUEST_REASON, expected.reason);
  assert.equal(values.BI_USERNAME, "usuario.prueba");
});

test("actualiza una fecha pasada al abrir la edición y conserva la hora", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-request-date-refresh-"));
  const envPath = path.join(directory, ".env");
  await writeRequestSettings({
    startDate: "31/07",
    startTime: "09:00",
    sessionHours: 8,
    reason: "Soporte programado",
  }, { envPath });

  const state = await getRequestSettingsState({
    envPath,
    refreshPastDate: true,
    now: new Date("2026-08-01T18:35:00.000Z"),
  });

  assert.equal(state.dateUpdated, true);
  assert.equal(state.settings.startDate, "01/08");
  assert.equal(state.settings.startTime, "09:00");
  assert.equal(state.settings.startTime12, "09:00");
  assert.equal(state.settings.startPeriod, "AM");
  const values = await readProjectEnvironment(envPath);
  assert.equal(values.PAM_START_DATE, "01/08");
  assert.equal(values.PAM_START_TIME, "09:00");
});

test("rechaza duraciones fuera del intervalo permitido", () => {
  assert.throws(
    () => validateRequestSettings({
      startDate: "01/08",
      startTime: "14:00",
      sessionHours: 9,
      reason: "Soporte",
    }),
    /entre 1 y 8 horas/,
  );
});
