import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getCurrentProjectTotp, loadPortalTotpClock } from "../src/auth/current-totp.mjs";
import { writeProjectCredentials } from "../src/config/env-config.mjs";
import { generateTotp } from "../src/auth/totp.mjs";

function mockGet(statusCode, date, failure) {
  return (url, options, callback) => {
    assert.equal(new URL(url).origin, "https://10.30.17.117");
    assert.equal(options.headers["Cache-Control"], "no-cache");
    assert.equal(options.headers.Authorization, undefined);
    assert.ok(options.signal instanceof AbortSignal);
    const request = new EventEmitter();
    request.setTimeout = () => request;
    queueMicrotask(() => {
      if (failure) { request.emit("error", new Error("private transport details")); return; }
      const response = new EventEmitter();
      Object.assign(response, { statusCode, headers: { date }, resume() {} });
      callback(response);
    });
    return request;
  };
}

test("consulta solamente PAM y corrige el desfase sin enviar credenciales", async () => {
  const local = Date.UTC(2026, 8, 7, 14, 20, 0);
  const now = await loadPortalTotpClock({
    now: () => local,
    get: mockGet(200, new Date(local + 67_000).toUTCString()),
  });
  assert.equal(now(), local + 67_500);
});

test("rechaza redirecciones, hora ausente y fallos de red sin usar el reloj local", async () => {
  for (const args of [[302, new Date().toUTCString()], [200, undefined], [200, null, true]]) {
    await assert.rejects(loadPortalTotpClock({ get: mockGet(...args) }), /hora|PAM/);
  }
});

test("el lanzador genera con hora PAM y espera un código nuevo al reintentar", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-current-totp-"));
  try {
    const envPath = path.join(directory, ".env");
    const secret = "JBSWY3DPEHPK3PXP";
    await writeProjectCredentials({ username: "fixture", password: "fixture", totpSecret: secret }, { envPath });
    let timestamp = Date.UTC(2026, 8, 7, 14, 20, 29, 900);
    const waits = [];
    const options = {
      envPath,
      loadClock: async () => () => timestamp,
      sleep: async milliseconds => { waits.push(milliseconds); timestamp += milliseconds; },
    };
    const first = await getCurrentProjectTotp(options);
    assert.deepEqual(waits, [1100]);
    assert.equal(first, generateTotp(secret, { timestamp }));
    const retry = await getCurrentProjectTotp({ ...options, nextWindow: true });
    assert.deepEqual(waits, [1100, 30_000]);
    assert.equal(retry, generateTotp(secret, { timestamp }));
    assert.notEqual(retry, first);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
