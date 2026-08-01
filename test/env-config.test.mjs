import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import test from "node:test";
import {
  credentialsAreConfigured,
  loadProjectCredentials,
  parseEnv,
  validateCredentials,
  writeProjectCredentials,
  updateProjectEnvironment,
} from "../src/env-config.mjs";

test("interpreta valores .env entre comillas sin perder caracteres especiales", () => {
  const values = parseEnv('BI_USERNAME="usuario"\nBI_PASSWORD="p#a=s\\\\word"\n');
  assert.equal(values.BI_USERNAME, "usuario");
  assert.equal(values.BI_PASSWORD, "p#a=s\\word");
});

test("guarda y vuelve a cargar las tres credenciales del proyecto", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-env-"));
  const envPath = path.join(directory, ".env");
  const expected = {
    username: "usuario.prueba",
    password: "contraseña # con = símbolos",
    totpSecret: "JBSWY3DPEHPK3PXP",
  };

  await writeProjectCredentials(expected, { envPath });
  assert.deepEqual(await loadProjectCredentials({ envPath }), expected);
  assert.equal(await credentialsAreConfigured(envPath), true);
  const contents = await readFile(envPath, "utf8");
  assert.match(contents, /^BI_USERNAME=/m);
  assert.match(contents, /^BI_PASSWORD=/m);
  assert.match(contents, /^BI_TOTP_SECRET=/m);
});

test("rechaza un código temporal de seis dígitos como secreto TOTP", () => {
  assert.throws(
    () => validateCredentials({ username: "u", password: "p", totpSecret: "234567" }),
    /no el código temporal de 6 dígitos/,
  );
});

test("permite actualizar solo la contraseña y conserva las otras credenciales", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-env-partial-"));
  const envPath = path.join(directory, ".env");
  await writeProjectCredentials({
    username: "usuario.original",
    password: "contraseña-original",
    totpSecret: "JBSWY3DPEHPK3PXP",
  }, { envPath });

  await writeProjectCredentials({
    username: "",
    password: "contraseña-nueva",
    totpSecret: "",
  }, { envPath });

  assert.deepEqual(await loadProjectCredentials({ envPath }), {
    username: "usuario.original",
    password: "contraseña-nueva",
    totpSecret: "JBSWY3DPEHPK3PXP",
  });
});

test("no considera la solicitud ni el correo como credenciales configuradas", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pam-env-non-credentials-"));
  const envPath = path.join(directory, ".env");
  await updateProjectEnvironment({
    PAM_START_DATE: "03/08",
    PAM_REQUEST_REASON: "Prueba",
    PAM_MAIL_TO: "persona@example.com",
    PAM_FINAL_ACTION: "email",
  }, { envPath });

  assert.equal(await credentialsAreConfigured(envPath), false);
});
