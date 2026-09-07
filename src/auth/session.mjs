import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";
import {
  loadProjectCredentials,
  projectDirectory,
  validateCredentials,
} from "../config/env-config.mjs";
import {
  createTotpClock,
  generateTotp,
  waitForNextTotpWindow,
  waitForSafeTotpWindow,
} from "./totp.mjs";

export const TARGET_ORIGIN = "https://10.30.17.117";
export const LOGIN_URL = `${TARGET_ORIGIN}/webconsole/login?redir=dashboard`;
const artifactsDirectory = path.join(projectDirectory, "run-artifacts");

export function isEnabled(value) {
  return String(value).toLowerCase() === "true";
}

function assertAllowedUrl(url) {
  const parsed = new URL(url);
  if (parsed.origin !== TARGET_ORIGIN) {
    throw new Error(`Navegación bloqueada fuera del portal permitido: ${parsed.origin}`);
  }
}

export async function restrictContextToPortal(context) {
  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (/^(about:|data:|blob:)/.test(requestUrl)) {
      await route.continue();
      return;
    }

    try {
      assertAllowedUrl(requestUrl);
      await route.continue();
    } catch {
      await route.abort("blockedbyclient");
    }
  });
}

export async function countOrFail(locator, description, options = {}) {
  const { timeout = 30_000 } = options;
  await locator.waitFor({ state: "visible", timeout });
  const count = await locator.count();
  if (count !== 1) {
    throw new Error(`Se esperaba un único campo ${description}; se encontraron ${count}.`);
  }
  return locator;
}

export async function saveFailureArtifact(page, error) {
  await mkdir(artifactsDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const screenshotPath = path.join(artifactsDirectory, `error-${timestamp}.png`);
  const reportPath = path.join(artifactsDirectory, `error-${timestamp}.txt`);

  if (page) {
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  }
  await writeFile(
    reportPath,
    `${new Date().toISOString()}\nURL: ${page?.url() ?? "no disponible"}\n${error.stack ?? error.message}\n`,
    "utf8",
  );

  return { screenshotPath, reportPath };
}

export async function submitTotpWithSingleRetry(submitAttempt, options = {}) {
  const waitUntilSafe = options.waitUntilSafe ?? waitForSafeTotpWindow;
  const waitUntilNext = options.waitUntilNext ?? waitForNextTotpWindow;
  const warn = options.warn ?? console.warn;

  await waitUntilSafe();
  let outcome = await submitAttempt();
  if (outcome === "rejected") {
    warn(
      "El PAM rechazó el código del Authenticator. Se esperará al siguiente código y se intentará una vez más.",
    );
    await waitUntilNext();
    outcome = await submitAttempt();
  }
  if (outcome === "rejected") {
    throw new Error(
      "El PAM rechazó dos códigos consecutivos de Microsoft Authenticator. Revise que la clave Base32 configurada corresponda a la cuenta correcta.",
    );
  }
  return outcome;
}

export async function authenticatePage(page, credentialsInput) {
  const credentials = validateCredentials(credentialsInput);
  let authenticationStage = "portal";

  try {
    const requestStartedAt = Date.now();
    const loginResponse = await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
    const responseReceivedAt = Date.now();
    assertAllowedUrl(page.url());
    const totpNow = createTotpClock(await loginResponse?.headerValue("date"), {
      requestStartedAt,
      responseReceivedAt,
    });

    const username = await countOrFail(
      page.getByRole("textbox", { name: "Username", exact: true }),
      "Username",
    );
    const passwordField = await countOrFail(
      page.getByRole("textbox", { name: "Password", exact: true }),
      "Password",
    );

    await username.fill(credentials.username);
    await passwordField.fill(credentials.password);

    if (process.env.BI_LOGIN_TO) {
      const loginTo = await countOrFail(
        page.getByRole("combobox", { name: "Log in to", exact: true }),
        "Log in to",
      );
      await loginTo.selectOption({ label: process.env.BI_LOGIN_TO });
    }

    const loginButton = await countOrFail(
      page.getByRole("button", { name: "Log In", exact: true }),
      "Log In",
    );
    await loginButton.click();
    authenticationStage = "primary_credentials";

    const responseField = page.getByRole("textbox", {
      name: "Enter Response",
      exact: true,
    });
    await responseField.waitFor({ state: "visible", timeout: 30_000 });
    authenticationStage = "totp";
    const submitButton = await countOrFail(
      page.getByRole("button", { name: "Submit", exact: true }),
      "Submit",
    );

    const rejectionMessage = page.getByText(/the provided token was rejected/i);
    const submitCurrentTotp = async () => {
      await responseField.waitFor({ state: "visible", timeout: 30_000 });
      await submitButton.click({ trial: true, timeout: 30_000 });
      await waitForSafeTotpWindow({ now: totpNow });
      await responseField.fill(generateTotp(credentials.totpSecret, { timestamp: totpNow() }));

      const previousRejection = (await rejectionMessage.count()) > 0
        ? await rejectionMessage.first().elementHandle()
        : null;
      const controller = new AbortController();
      const waitOptions = { timeout: 30_000, signal: controller.signal };
      const accepted = page.waitForURL(
        (url) => url.origin === TARGET_ORIGIN && !url.pathname.includes("/login"),
        { ...waitOptions, waitUntil: "domcontentloaded" },
      ).then(() => "accepted");
      const rejected = (previousRejection
        ? previousRejection.waitForElementState("hidden", waitOptions)
        : Promise.resolve())
        .then(() => rejectionMessage.waitFor({ state: "visible", ...waitOptions }))
        .then(() => "rejected");

      // Attach rejection handlers before clicking: a waiter can fail during the click.
      try {
        const [outcome] = await Promise.all([
          Promise.race([accepted, rejected]),
          submitButton.click(),
        ]);
        return outcome;
      } finally {
        controller.abort();
        await previousRejection?.dispose();
      }
    };

    await submitTotpWithSingleRetry(submitCurrentTotp, {
      waitUntilSafe: () => waitForSafeTotpWindow({ now: totpNow }),
      waitUntilNext: () => waitForNextTotpWindow({ timestamp: totpNow() }),
    });
    authenticationStage = "confirmation";

    const dashboardLink = page.getByRole("link", {
      name: "Return to dashboard",
      exact: true,
    });
    await countOrFail(dashboardLink, "Return to dashboard");
    return page;
  } catch (error) {
    error.authenticationStage ??= authenticationStage;
    error.page = page;
    throw error;
  }
}

export async function openAuthenticatedSession(options = {}) {
  const credentials = options.credentials
    ? validateCredentials(options.credentials)
    : await loadProjectCredentials();
  const headed = options.headed ?? isEnabled(process.env.BI_HEADED);

  const browser = await chromium.launch({ channel: "chrome", headless: !headed });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    locale: "es-EC",
    timezoneId: "America/Guayaquil",
    viewport: { width: 1840, height: 900 },
  });

  await restrictContextToPortal(context);

  const page = await context.newPage();

  try {
    await authenticatePage(page, credentials);
    return { browser, context, page };
  } catch (error) {
    error.browser = browser;
    throw error;
  }
}
