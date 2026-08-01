import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGraphMailPayload,
  extractValidatedRequestIds,
  normalizeCcRecipients,
  wasAlreadySent,
} from "../src/outlook-email.mjs";

const requestIds = Array.from({ length: 14 }, (_, index) => String(140131 + index));
const pending = requestIds.map((id) => ({ id, status: "Pending" }));

test("usa dinámicamente los 14 ID de la última ejecución", () => {
  assert.deepEqual(extractValidatedRequestIds({ requestIds, pending }), requestIds);
});

test("rechaza solicitudes que no estén Pending o no coincidan", () => {
  assert.throws(
    () => extractValidatedRequestIds({ requestIds, pending: pending.map((item, index) => index ? item : { ...item, status: "Approved" }) }),
    /estado Pending/,
  );
  assert.throws(
    () => extractValidatedRequestIds({ requestIds, pending: pending.map((item, index) => index ? item : { ...item, id: "999999" }) }),
    /no coinciden/,
  );
});

test("construye un correo HTML para un solo destinatario", () => {
  const payload = buildGraphMailPayload({
    recipient: "tellezoe@hitss.com",
    subject: "ACCESOS AL PAM",
    html: "<p>Correo</p>",
  });

  assert.equal(payload.message.subject, "ACCESOS AL PAM");
  assert.equal(payload.message.body.contentType, "HTML");
  assert.equal(payload.message.toRecipients[0].emailAddress.address, "tellezoe@hitss.com");
});

test("valida las copias e ignora los espacios vacíos configurables", () => {
  assert.deepEqual(normalizeCcRecipients([
    " copia1@hitss.com ",
    "",
    "copia2@hitss.com",
  ]), ["copia1@hitss.com", "copia2@hitss.com"]);
  assert.throws(
    () => normalizeCcRecipients(["copia@hitss.com", "COPIA@HITSS.COM"]),
    /duplicadas/,
  );
  assert.throws(() => normalizeCcRecipients(["no-es-correo"]), /válida/);
});

test("detecta un intento de envío duplicado sin depender del orden", () => {
  assert.equal(wasAlreadySent({
    recipient: "TELLEZOE@HITSS.COM",
    subject: "ACCESOS AL PAM",
    requestIds: [...requestIds].reverse(),
  }, {
    recipient: "tellezoe@hitss.com",
    subject: "ACCESOS AL PAM",
    requestIds,
  }), true);
});
