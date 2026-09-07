import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeBase32,
  generateTotp,
  millisecondsUntilNextTotpWindow,
  waitForNextTotpWindow,
} from "../src/auth/totp.mjs";

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
