import assert from "node:assert/strict";
import test from "node:test";
import {
  createTotpClock,
  decodeBase32,
  generateTotp,
  millisecondsUntilNextTotpWindow,
  waitForNextTotpWindow,
  waitForSafeTotpWindow,
} from "../src/auth/totp.mjs";

test("genera el TOTP con el reloj de PAM aunque Windows tenga 67 segundos de atraso", () => {
  const serverTimestamp = Date.UTC(2026, 8, 7, 14, 27, 23);
  let localNow = serverTimestamp - 67_000;
  const now = createTotpClock(new Date(serverTimestamp).toUTCString(), {
    requestStartedAt: localNow - 100,
    responseReceivedAt: localNow + 100,
    now: () => localNow,
  });
  const secret = "JBSWY3DPEHPK3PXP";
  assert.equal(now(), serverTimestamp + 500);
  assert.equal(generateTotp(secret, { timestamp: now() }), generateTotp(secret, { timestamp: serverTimestamp }));
  assert.notEqual(generateTotp(secret, { timestamp: now() }), generateTotp(secret, { timestamp: localNow }));
  localNow += 30_000;
  assert.equal(now(), serverTimestamp + 30_500);
});

test("detiene la generación si PAM no proporciona una hora válida", () => {
  for (const serverDate of [undefined, null, "", "invalid"]) {
    assert.throws(() => createTotpClock(serverDate, {
      requestStartedAt: 0, responseReceivedAt: 100,
    }), /hora del portal/);
  }
});

test("espera usando la ventana de PAM y respeta los milisegundos antes del vencimiento", async () => {
  for (const [timestamp, expectedWait] of [[22_001, 8999], [22_000, 0], [29_900, 1100]]) {
    let waited = 0;
    await waitForSafeTotpWindow({
      now: () => timestamp,
      sleep: async (milliseconds) => { waited = milliseconds; },
    });
    assert.equal(waited, expectedWait);
  }
});

test("decodifica Base32 sin distinguir espacios, guiones o mayúsculas", () => {
  assert.equal(decodeBase32("jbsw-y3dp ehpk3pxp").toString("hex"), "48656c6c6f21deadbeef");
});

test("espera obligatoriamente hasta el siguiente intervalo TOTP después de un rechazo", async () => {
  const timestamp = Date.UTC(2026, 7, 24, 17, 25, 15, 250);
  assert.equal(
    millisecondsUntilNextTotpWindow({ timestamp }),
    15_750,
  );

  let waitedMilliseconds;
  await waitForNextTotpWindow({
    timestamp,
    sleep: async (milliseconds) => {
      waitedMilliseconds = milliseconds;
    },
  });
  assert.equal(waitedMilliseconds, 15_750);
});

test("genera los vectores RFC 6238 para SHA-1", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const vectors = [
    [59_000, "94287082"],
    [1_111_111_109_000, "07081804"],
    [1_111_111_111_000, "14050471"],
    [1_234_567_890_000, "89005924"],
    [2_000_000_000_000, "69279037"],
    [20_000_000_000_000, "65353130"],
  ];

  for (const [timestamp, expected] of vectors) {
    assert.equal(generateTotp(secret, { timestamp, digits: 8 }), expected);
  }
});

test("rechaza una clave Base32 vacía o inválida", () => {
  assert.throws(() => decodeBase32(""), /Base32/);
  assert.throws(() => decodeBase32("ABC018"), /Base32/);
});
