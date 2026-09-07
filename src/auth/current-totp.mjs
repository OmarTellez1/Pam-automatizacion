import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadProjectCredentials } from "../config/env-config.mjs";
import { generateTotp, waitForSafeTotpWindow } from "./totp.mjs";

export async function getCurrentProjectTotp() {
  const credentials = await loadProjectCredentials();
  await waitForSafeTotpWindow();
  return generateTotp(credentials.totpSecret);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(await getCurrentProjectTotp());
}
