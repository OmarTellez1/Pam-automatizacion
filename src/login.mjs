import process from "node:process";
import {
  isEnabled,
  openAuthenticatedSession,
  saveFailureArtifact,
} from "./session.mjs";

let session;

try {
  session = await openAuthenticatedSession();
  const currentUrl = new URL(session.page.url());
  console.log(`Inicio de sesión correcto: ${currentUrl.pathname}`);

  if (isEnabled(process.env.BI_KEEP_OPEN)) {
    console.log("La ventana permanecerá abierta hasta que se cierre manualmente.");
    await session.page.waitForEvent("close", { timeout: 0 });
  }
} catch (error) {
  const artifacts = await saveFailureArtifact(error.page, error);
  console.error(`Inicio de sesión fallido: ${error.message}`);
  console.error(`Diagnóstico: ${artifacts.reportPath}`);
  process.exitCode = 1;
} finally {
  await (session?.browser ?? undefined)?.close().catch(() => {});
}

