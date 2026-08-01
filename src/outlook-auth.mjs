import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  InteractionRequiredAuthError,
  LogLevel,
  PublicClientApplication,
} from "@azure/msal-node";
import {
  DataProtectionScope,
  PersistenceCachePlugin,
  PersistenceCreator,
} from "@azure/msal-node-extensions";
import { validateEmailAddress } from "./outlook-email.mjs";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateDirectory = path.join(projectDirectory, "state");
const configPath = path.join(stateDirectory, "outlook-config.json");
const cachePath = path.join(stateDirectory, "outlook-token-cache.bin");
const scopes = ["https://graph.microsoft.com/Mail.Send"];

function validateGuid(value, fieldName) {
  const guid = String(value ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(guid)) {
    throw new Error(`${fieldName} debe ser un GUID válido de Microsoft Entra.`);
  }
  return guid;
}

export async function loadOutlookConfig() {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("Outlook no está configurado. Ejecute scripts\\setup-outlook.ps1 primero.");
    }
    throw error;
  }

  return {
    tenantId: validateGuid(parsed.tenantId, "tenantId"),
    clientId: validateGuid(parsed.clientId, "clientId"),
    sender: validateEmailAddress(parsed.sender, "sender"),
    recipient: validateEmailAddress(parsed.recipient, "recipient"),
    subject: String(parsed.subject ?? "").trim() || "ACCESOS AL PAM",
  };
}

async function createPublicClient(config) {
  await mkdir(stateDirectory, { recursive: true });
  const persistence = await PersistenceCreator.createPersistence({
    cachePath,
    dataProtectionScope: DataProtectionScope.CurrentUser,
    serviceName: "BeyondInsightOutlookAutomation",
    accountName: config.sender,
    usePlaintextFileOnLinux: false,
  });

  return new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
    },
    cache: {
      cachePlugin: new PersistenceCachePlugin(persistence),
    },
    system: {
      loggerOptions: {
        logLevel: LogLevel.Error,
        piiLoggingEnabled: false,
        loggerCallback: () => {},
      },
    },
  });
}

export async function acquireOutlookToken({ allowInteractive = false } = {}) {
  const config = await loadOutlookConfig();
  const client = await createPublicClient(config);
  const accounts = await client.getTokenCache().getAllAccounts();
  const expectedSender = config.sender.toLowerCase();
  const account = accounts.find((candidate) => candidate.username?.toLowerCase() === expectedSender);

  if (account) {
    try {
      const response = await client.acquireTokenSilent({ account, scopes });
      return { accessToken: response.accessToken, account: response.account, config };
    } catch (error) {
      if (!(error instanceof InteractionRequiredAuthError) && error?.name !== "InteractionRequiredAuthError") {
        throw error;
      }
    }
  }

  if (!allowInteractive) {
    throw new Error("Outlook requiere autorización. Ejecute scripts\\run-outlook-auth.ps1 una vez.");
  }

  const response = await client.acquireTokenByDeviceCode({
    scopes,
    deviceCodeCallback: (deviceCode) => {
      console.log(deviceCode.message);
    },
  });
  if (!response?.accessToken || !response.account) {
    throw new Error("Microsoft Entra no devolvió una sesión autorizada.");
  }
  if (response.account.username?.toLowerCase() !== expectedSender) {
    throw new Error(`La cuenta autorizada (${response.account.username}) no coincide con ${config.sender}.`);
  }

  return { accessToken: response.accessToken, account: response.account, config };
}
