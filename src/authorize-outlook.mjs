import { acquireOutlookToken } from "./outlook-auth.mjs";

try {
  const { account } = await acquireOutlookToken({ allowInteractive: true });
  console.log(`Outlook autorizado para ${account.username}.`);
} catch (error) {
  console.error(`No se pudo autorizar Outlook: ${error.message}`);
  process.exitCode = 1;
}
