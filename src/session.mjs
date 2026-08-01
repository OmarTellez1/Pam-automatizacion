import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { generateTotp, waitForSafeTotpWindow } from "./totp.mjs";

export const TARGET_ORIGIN = "https://10.30.17.117";
export const LOGIN_URL = `${TARGET_ORIGIN}/webconsole/login?redir=dashboard`;
export const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const artifactsDirectory = path.join(projectDirectory, "run-artifacts");

function requiredEnvironmentVariable(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable segura ${name}. Ejecute scripts/setup-secrets.ps1.`);
  }
  return value;
}

export function isEnabled(value) {
  return String(value).toLowerCase() === "true";
}

async function readConfiguration() {
  const configPath = path.join(projectDirectory, "state", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));

  if (!config.username || typeof config.username !== "string") {
    throw new Error("state/config.json no contiene un usuario válido.");
  }

  return config;
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
  const config = await readConfiguration();
  const password = requiredEnvironmentVariable("BI_PASSWORD");
  const totpSecret = requiredEnvironmentVariable("BI_TOTP_SECRET");
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

    await username.fill(config.username);
    await passwordField.fill(password);

    if (config.loginTo) {
      const loginTo = await countOrFail(
        page.getByRole("combobox", { name: "Log in to", exact: true }),
        "Log in to",
      );
      await loginTo.selectOption({ label: config.loginTo });
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
    await responseField.fill(generateTotp(totpSecret));

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

