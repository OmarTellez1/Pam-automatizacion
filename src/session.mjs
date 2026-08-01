import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";
import {
  loadProjectCredentials,
  projectDirectory,
  validateCredentials,
} from "./env-config.mjs";
import { generateTotp, waitForSafeTotpWindow } from "./totp.mjs";

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

  const page = await context.newPage();

  try {
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
    assertAllowedUrl(page.url());

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

    const responseField = page.getByRole("textbox", {
      name: "Enter Response",
      exact: true,
    });
    await responseField.waitFor({ state: "visible", timeout: 30_000 });
    await waitForSafeTotpWindow();
    await responseField.fill(generateTotp(credentials.totpSecret));

    const submitButton = await countOrFail(
      page.getByRole("button", { name: "Submit", exact: true }),
      "Submit",
    );
    await submitButton.click();
    await page.waitForURL(
      (url) => url.origin === TARGET_ORIGIN && !url.pathname.includes("/login"),
      { timeout: 30_000, waitUntil: "domcontentloaded" },
    );

    const dashboardLink = page.getByRole("link", {
      name: "Return to dashboard",
      exact: true,
    });
    if ((await dashboardLink.count()) !== 1) {
      throw new Error("El portal no confirmó el inicio de sesión.");
    }

    return { browser, context, page };
  } catch (error) {
    error.page = page;
    error.browser = browser;
    throw error;
  }
}
