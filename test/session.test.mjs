import assert from "node:assert/strict";
import test from "node:test";
import { submitTotpWithSingleRetry } from "../src/auth/session.mjs";

test("reintenta una vez con el siguiente intervalo cuando PAM rechaza el TOTP", async () => {
  const outcomes = ["rejected", "accepted"];
  const events = [];

  const outcome = await submitTotpWithSingleRetry(
    async () => {
      events.push("submit");
      return outcomes.shift();
    },
    {
      waitUntilSafe: async () => events.push("safe"),
      waitUntilNext: async () => events.push("next"),
      warn: () => events.push("warn"),
    },
  );

  assert.equal(outcome, "accepted");
  assert.deepEqual(events, ["safe", "submit", "warn", "next", "submit"]);
});

test("informa claramente cuando PAM rechaza dos TOTP consecutivos", async () => {
  await assert.rejects(
    submitTotpWithSingleRetry(
      async () => "rejected",
      {
        waitUntilSafe: async () => {},
        waitUntilNext: async () => {},
        warn: () => {},
      },
    ),
    /rechazó dos códigos consecutivos.*clave Base32/,
  );
});
