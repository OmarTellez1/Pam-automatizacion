import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationFamily,
  expectedReleaseText,
  formatIsoDateAsDayMonthYear,
  formatTime12Hour,
  parseDayMonthForEcuador,
  requestKey,
  validateIsoDate,
  validateStartTime,
} from "../src/request-config.mjs";

test("valida fechas ISO reales", () => {
  assert.equal(validateIsoDate("2026-08-01"), "2026-08-01");
  assert.throws(() => validateIsoDate("2026-02-30"), /no existe/);
  assert.throws(() => validateIsoDate("01/08/2026"), /YYYY-MM-DD/);
});

test("normaliza familias de aplicaciones", () => {
  assert.equal(applicationFamily("WinSCP 5.21 N2 - SERVER"), "winscp");
  assert.equal(applicationFamily("PuTTY - Nodo2"), "putty");
  assert.equal(applicationFamily("PLSQL - Nodo1"), "plsql");
});

test("construye una clave estable para cuenta y aplicación", () => {
  assert.equal(
    requestKey({ system: "PGDCMSA01", account: "creditenginelg", application: "WinSCP - nodo1" }),
    "pgdcmsa01|creditenginelg|winscp",
  );
});

test("forma la fecha esperada en la tabla de Requests", () => {
  assert.equal(expectedReleaseText("2026-08-01", "10:00"), "Aug 01, 2026, 10:00 AM");
  assert.equal(expectedReleaseText("2026-08-01", "14:00"), "Aug 01, 2026, 2:00 PM");
});

test("añade el año vigente de Ecuador a una fecha dd/mm", () => {
  assert.equal(
    parseDayMonthForEcuador("01/08", new Date("2026-07-31T18:00:00Z")),
    "2026-08-01",
  );
  assert.equal(
    parseDayMonthForEcuador("01/08", new Date("2027-07-31T18:00:00Z")),
    "2027-08-01",
  );
  assert.equal(formatIsoDateAsDayMonthYear("2027-08-01"), "01/08/2027");
  assert.throws(() => parseDayMonthForEcuador("1/8"), /dd\/mm/);
  assert.throws(
    () => parseDayMonthForEcuador("31/02", new Date("2026-01-01T12:00:00Z")),
    /no existe/,
  );
});

test("valida hora de 24 horas y la convierte para confirmación", () => {
  assert.equal(validateStartTime("14:00"), "14:00");
  assert.equal(formatTime12Hour("14:00"), "02:00 PM");
  assert.equal(formatTime12Hour("01:00"), "01:00 AM");
  assert.equal(formatTime12Hour("00:00"), "12:00 AM");
  assert.equal(formatTime12Hour("12:00"), "12:00 PM");
  assert.throws(() => validateStartTime("24:00"), /24 horas/);
  assert.throws(() => validateStartTime("2:00 PM"), /24 horas/);
});
