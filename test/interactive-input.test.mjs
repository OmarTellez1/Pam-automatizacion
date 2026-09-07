import assert from "node:assert/strict";
import test from "node:test";
import { parseYesNo, promptUntilValid } from "../src/requests/interactive-input.mjs";
import {
  parseDayMonthForEcuador,
  validateStartTime,
} from "../src/requests/request-config.mjs";

function fakeTerminal(answers) {
  const prompts = [];
  return {
    prompts,
    async question(prompt) {
      prompts.push(prompt);
      return answers.shift();
    },
  };
}

test("repite la fecha hasta recibir una respuesta no vacía y válida", async () => {
  const terminal = fakeTerminal(["   ", "1/8", " 02/08 "]);
  const messages = [];
  const value = await promptUntilValid(
    terminal,
    "Fecha: ",
    (answer) => parseDayMonthForEcuador(answer, new Date("2026-07-31T18:00:00Z")),
    (message) => messages.push(message),
  );

  assert.equal(value, "2026-08-02");
  assert.equal(terminal.prompts.length, 3);
  assert.match(messages[0], /obligatoria/);
  assert.match(messages[1], /inválida/);
});

test("elimina espacios y repite la hora hasta recibir formato de 24 horas", async () => {
  const terminal = fakeTerminal(["10:00 AM", " 10:00 "]);
  const messages = [];
  const value = await promptUntilValid(
    terminal,
    "Hora: ",
    validateStartTime,
    (message) => messages.push(message),
  );

  assert.equal(value, "10:00");
  assert.equal(terminal.prompts.length, 2);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /inválida/);
});

test("acepta S y N sin distinguir mayúsculas, minúsculas o espacios", () => {
  assert.equal(parseYesNo("S"), true);
  assert.equal(parseYesNo(" s "), true);
  assert.equal(parseYesNo("N"), false);
  assert.equal(parseYesNo(" n "), false);
});

test("repite la pregunta de correo hasta recibir S o N", async () => {
  const terminal = fakeTerminal(["", "sí", " n "]);
  const messages = [];
  const value = await promptUntilValid(
    terminal,
    "¿Desea que envié el correo por usted? S/N: ",
    parseYesNo,
    (message) => messages.push(message),
  );

  assert.equal(value, false);
  assert.equal(terminal.prompts.length, 3);
  assert.match(messages[0], /obligatoria/);
  assert.match(messages[1], /S para Sí o N para No/);
});
