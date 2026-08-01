import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationFamily,
  expectedReleaseText,
  filterRequestsByStartDate,
  formatIsoDateAsDayMonthYear,
  formatTime12Hour,
  parseFormattedTime12Hour,
  parseTime12Hour,
  parseDayMonthForEcuador,
  requestKey,
  replacePastDateWithTodayForEcuador,
  splitTime24Hour,
  validateIsoDate,
  validateRequestStartNotPast,
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

test("distingue los Pending únicamente por Request Start Date completo", () => {
  const requests = [
    { id: "140001", release: "Aug 01, 2026, 7:00 PM", reason: "Prueba controlada" },
    { id: "140002", release: "Aug 01, 2026, 6:00 PM", reason: "Prueba controlada" },
    { id: "140003", release: "Aug 02, 2026, 7:00 PM", reason: "Prueba controlada" },
    { id: "140004", release: "Aug 01, 2026, 7:00 PM", reason: "Otra razón" },
    { id: "140005", release: "  Aug 01, 2026, 7:00 PM  ", reason: "Prueba   controlada" },
  ];
  assert.deepEqual(
    filterRequestsByStartDate(requests, {
      date: "2026-08-01",
      startTime: "19:00",
      reason: "Prueba controlada",
    }).map((request) => request.id),
    ["140001", "140004", "140005"],
  );
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

test("convierte de forma segura entre 12 y 24 horas", () => {
  assert.equal(validateStartTime("14:00"), "14:00");
  assert.equal(parseTime12Hour("02:00", "PM"), "14:00");
  assert.equal(parseTime12Hour("12:00", "AM"), "00:00");
  assert.equal(parseTime12Hour("12:00", "PM"), "12:00");
  assert.deepEqual(splitTime24Hour("00:15"), { startTime12: "12:15", startPeriod: "AM" });
  assert.deepEqual(splitTime24Hour("14:30"), { startTime12: "02:30", startPeriod: "PM" });
  assert.equal(formatTime12Hour("14:00"), "02:00 PM");
  assert.equal(formatTime12Hour("01:00"), "01:00 AM");
  assert.equal(formatTime12Hour("00:00"), "12:00 AM");
  assert.equal(formatTime12Hour("12:00"), "12:00 PM");
  assert.equal(parseFormattedTime12Hour("02:30 PM"), "14:30");
  assert.equal(parseFormattedTime12Hour("2:30 pm"), "14:30");
  assert.throws(() => validateStartTime("24:00"), /24 horas/);
  assert.throws(() => validateStartTime("2:00 PM"), /24 horas/);
  assert.throws(() => parseTime12Hour("13:00", "PM"), /AM o PM/);
  assert.throws(() => parseTime12Hour("02:00", "XX"), /AM o PM/);
  assert.throws(() => parseFormattedTime12Hour("14:30"), /AM\/PM/);
});

test("rechaza una fecha y hora que ya pasaron en Ecuador", () => {
  const now = new Date("2026-08-01T18:35:00.000Z");
  assert.deepEqual(
    validateRequestStartNotPast("2026-08-01", "13:35", now),
    { date: "2026-08-01", startTime: "13:35" },
  );
  assert.throws(
    () => validateRequestStartNotPast("2026-08-01", "10:00", now),
    /ya pasaron.*America\/Guayaquil/,
  );
  assert.deepEqual(
    validateRequestStartNotPast("2026-08-03", "00:00", now),
    { date: "2026-08-03", startTime: "00:00" },
  );
});

test("reemplaza únicamente una fecha pasada por el día actual de Ecuador", () => {
  const now = new Date("2026-08-01T18:35:00.000Z");
  assert.deepEqual(
    replacePastDateWithTodayForEcuador("31/07", now),
    { startDate: "01/08", updated: true },
  );
  assert.deepEqual(
    replacePastDateWithTodayForEcuador("01/08", now),
    { startDate: "01/08", updated: false },
  );
  assert.deepEqual(
    replacePastDateWithTodayForEcuador("02/08", now),
    { startDate: "02/08", updated: false },
  );
});
