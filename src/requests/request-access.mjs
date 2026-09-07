import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseYesNo, promptUntilValid } from "./interactive-input.mjs";
import {
  DEFAULT_HOURS,
  DEFAULT_REASON,
  expectedReleaseText,
  filterRequestsByStartDate,
  formatIsoDateAsDayMonthYear,
  formatTime12Hour,
  parseDayMonthForEcuador,
  requestKey,
  validateRequestStartNotPast,
  validateStartTime,
} from "./request-config.mjs";
import { loadRequestSettings } from "./request-settings.mjs";
import { loadMailSettings } from "../email/mail-settings.mjs";
import { finalActionSendsEmail, loadFinalAction } from "../automation/final-action.mjs";
import { SIMULATED_REQUEST_IDS } from "../automation/simulation.mjs";
import { projectDirectory } from "../config/env-config.mjs";
import {
  TARGET_ORIGIN,
  isEnabled,
  openAuthenticatedSession,
  saveFailureArtifact,
} from "../auth/session.mjs";

const ACCOUNTS_URL = `${TARGET_ORIGIN}/webconsole/ps/portal?tab=accounts`;
const REQUESTS_URL = `${TARGET_ORIGIN}/webconsole/ps/portal?tab=requests`;
const resultsDirectory = path.join(projectDirectory, "run-results");

async function parseArguments(argv) {
  const result = {
    dateInput: undefined,
    startTime: undefined,
    emailInput: undefined,
    sendEmail: undefined,
    execute: false,
    singleSubmit: false,
    testRun: false,
    headed: isEnabled(process.env.BI_HEADED),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--date") result.dateInput = argv[++index];
    else if (argument === "--time") result.startTime = argv[++index];
    else if (argument === "--email") result.emailInput = argv[++index];
    else if (argument === "--execute") result.execute = true;
    else if (argument === "--single-submit") result.singleSubmit = true;
    else if (argument === "--test-run") result.testRun = true;
    else if (argument === "--headed") result.headed = true;
    else throw new Error(`Argumento desconocido: ${argument}`);
  }

  if ([result.execute, result.singleSubmit, result.testRun].filter(Boolean).length > 1) {
    throw new Error("Los modos real, envío único y prueba no pueden ejecutarse al mismo tiempo.");
  }

  let storedSettings;
  try {
    storedSettings = await loadRequestSettings();
  } catch {
    storedSettings = undefined;
  }
  result.dateInput ??= storedSettings?.startDate;
  result.startTime ??= storedSettings?.startTime;
  result.sessionHours = storedSettings?.sessionHours ?? DEFAULT_HOURS;
  result.durationDays = storedSettings?.durationDays ?? 0;
  result.durationHours = storedSettings?.durationHours ?? DEFAULT_HOURS;
  result.reason = storedSettings?.reason ?? DEFAULT_REASON;
  if (result.emailInput === undefined) {
    result.sendEmail = finalActionSendsEmail(await loadFinalAction());
  }

  let terminal;
  try {
    if (!result.dateInput || !result.startTime) {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error("Faltan --date dd/mm y/o --time HH:mm para una ejecución no interactiva.");
      }
      terminal = createInterface({ input: process.stdin, output: process.stdout });
      terminal.on("SIGINT", cancelAutomation);
      if (!result.dateInput) {
        result.date = await promptUntilValid(
          terminal,
          "¿En qué fecha desea solicitar los permisos? Formato dd/mm: ",
          parseDayMonthForEcuador,
        );
      }
      if (!result.startTime) {
        result.startTime = await promptUntilValid(
          terminal,
          "¿A qué hora desea solicitar los permisos? Formato HH:mm de 24 horas: ",
          validateStartTime,
        );
      }
    }
  } finally {
    terminal?.off("SIGINT", cancelAutomation);
    terminal?.close();
  }

  if (!result.date) {
    result.date = parseDayMonthForEcuador(result.dateInput);
  }
  result.startTime = validateStartTime(result.startTime);
  if (result.execute || result.singleSubmit) {
    validateRequestStartNotPast(result.date, result.startTime);
  }
  if (result.sendEmail === undefined) {
    result.sendEmail = parseYesNo(result.emailInput);
  }
  if (result.singleSubmit && result.sendEmail) {
    throw new Error("La prueba de envío único no admite correo automático.");
  }
  console.log(`Fecha confirmada: ${formatIsoDateAsDayMonthYear(result.date)}`);
  console.log(
    `Hora confirmada: ${formatTime12Hour(result.startTime)} (${result.startTime} en formato de 24 horas)`,
  );
  console.log(
    result.sendEmail
      ? "Resultado final: se enviará un correo."
      : "Resultado final: los ID se mostrarán en la interfaz web.",
  );
  return result;
}

async function readGridRows(page) {
  return page.evaluate(() => {
    const text = (element) => element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return [...document.querySelectorAll('tr[aria-label^="Row "]')].map((row, index) => ({
      index,
      cells: Object.fromEntries(
        [...row.querySelectorAll("td")]
          .map((cell) => [cell.getAttribute("data-column-id"), text(cell)])
          .filter(([column]) => column),
      ),
    }));
  });
}

export function parsePaginationLabel(label) {
  const match = /^Page\s+(\d+)\/(\d+)$/.exec(String(label ?? "").trim());
  if (!match) throw new Error(`El paginador no tiene un formato reconocido: ${label}`);
  const currentPage = Number(match[1]);
  const totalPages = Number(match[2]);
  if (
    !Number.isSafeInteger(currentPage) ||
    !Number.isSafeInteger(totalPages) ||
    currentPage < 1 ||
    totalPages < 1 ||
    currentPage > totalPages
  ) {
    throw new Error(`El paginador contiene valores inválidos: ${label}`);
  }
  return { currentPage, totalPages };
}

async function visibleGridSignature(page) {
  return page.evaluate(() => [...document.querySelectorAll('tr[aria-label^="Row "]')]
    .map((row) => row.querySelector('[data-column-id="RequestId"]')?.textContent?.trim() ?? "")
    .join("|"));
}

async function waitForGridPage(page, expectedPage, previousSignature) {
  await page.waitForFunction(
    ({ expected, previous }) => {
      const input = document.querySelector('input[type="number"][aria-label^="Page "]');
      const match = /^Page\s+(\d+)\/(\d+)$/.exec(input?.getAttribute("aria-label") ?? "");
      if (!match || Number(match[1]) !== expected) return false;
      const signature = [...document.querySelectorAll('tr[aria-label^="Row "]')]
        .map((row) => row.querySelector('[data-column-id="RequestId"]')?.textContent?.trim() ?? "")
        .join("|");
      return signature !== previous;
    },
    { expected: expectedPage, previous: previousSignature },
  );
  await page.waitForTimeout(350);
}

async function readPendingItemCount(page) {
  return page.evaluate(() => {
    const counts = [...document.querySelectorAll("*")]
      .filter((element) => element.children.length === 0)
      .map((element) => /^(\d+)\s+items?$/.exec(element.textContent?.trim() ?? ""))
      .filter(Boolean)
      .map((match) => Number(match[1]));
    return counts.length ? Math.max(...counts) : undefined;
  });
}

export async function readAllPendingGridRows(page) {
  const pageInput = page.locator('input[type="number"][aria-label^="Page "]');
  if ((await pageInput.count()) === 0) return readGridRows(page);
  if ((await pageInput.count()) !== 1) {
    throw new Error("La tabla Pending contiene más de un paginador reconocido.");
  }

  for (let scanAttempt = 1; scanAttempt <= 3; scanAttempt += 1) {
    let pageInfo = parsePaginationLabel(await pageInput.getAttribute("aria-label"));
    if (pageInfo.currentPage !== 1) {
      const previousSignature = await visibleGridSignature(page);
      await page.getByRole("button", { name: "First page", exact: true }).click();
      await waitForGridPage(page, 1, previousSignature);
      pageInfo = parsePaginationLabel(await pageInput.getAttribute("aria-label"));
    }

    const rowsById = new Map();
    for (let visited = 0; visited < 500; visited += 1) {
      const rows = await readGridRows(page);
      for (const row of rows) {
        const requestId = String(row.cells.RequestId ?? "").trim();
        if (!/^\d+$/.test(requestId)) {
          throw new Error("Pending contiene una fila sin Request ID válido.");
        }
        rowsById.set(requestId, row);
      }

      pageInfo = parsePaginationLabel(await pageInput.getAttribute("aria-label"));
      if (pageInfo.currentPage === pageInfo.totalPages) break;
      const previousSignature = await visibleGridSignature(page);
      const nextPage = pageInfo.currentPage + 1;
      await page.getByRole("button", { name: "Next page", exact: true }).click();
      await waitForGridPage(page, nextPage, previousSignature);
      if (visited === 499) throw new Error("Pending excedió el límite seguro de 500 páginas.");
    }

    const expectedCount = await readPendingItemCount(page);
    if (expectedCount === undefined || rowsById.size === expectedCount) {
      return [...rowsById.values()];
    }
    if (scanAttempt < 3) await page.waitForTimeout(750);
    else {
      throw new Error(
        `Pending indica ${expectedCount} elementos, pero se pudieron leer ${rowsById.size} ` +
        "Request ID únicos después de recorrer todas sus páginas.",
      );
    }
  }
  throw new Error("No fue posible completar la lectura paginada de Pending.");
}

async function openFavoriteAccounts(page) {
  await page.goto(ACCOUNTS_URL, { waitUntil: "domcontentloaded" });

  const browseByCategory = page
    .getByText(/^Browse by Category$/i, { exact: true })
    .filter({ visible: true });
  await browseByCategory.first().waitFor({ state: "visible", timeout: 30_000 });
  if ((await browseByCategory.count()) !== 1) {
    throw new Error("No se pudo identificar de forma única la sección Browse By Category.");
  }

  const favorites = page.getByText("Favorites", { exact: true }).filter({ visible: true });
  await favorites.first().waitFor({ state: "visible", timeout: 15_000 });
  if ((await favorites.count()) !== 1) {
    throw new Error("No se pudo identificar de forma única la categoría Favorites.");
  }
  await favorites.click();
  const rows = page.locator('tr[aria-label^="Row "]');
  await rows.first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(750);
  const favoriteCount = await rows.count();
  if (!Number.isSafeInteger(favoriteCount) || favoriteCount < 1) {
    throw new Error("Favorites no contiene cuentas disponibles para solicitar acceso.");
  }
  return favoriteCount;
}

async function loadAccountTargets(page) {
  const favoriteCount = await openFavoriteAccounts(page);

  const rows = await readGridRows(page);
  const targets = rows.map(({ index, cells }) => ({
    index,
    account: cells.AccountName,
    system: cells.SystemName,
    application: cells.ApplicationName,
  }));

  if (targets.length !== favoriteCount) {
    throw new Error(`Favorites indica ${favoriteCount} cuentas, pero se encontraron ${targets.length} filas.`);
  }
  if (new Set(targets.map(requestKey)).size !== favoriteCount) {
    throw new Error("Las cuentas de Favorites no tienen una combinación única de sistema, cuenta y aplicación.");
  }

  return targets;
}

async function selectPendingStatus(page) {
  const statusName = "Pending";
  const status = page.getByLabel("Status", { exact: true });
  await status.waitFor({ state: "visible", timeout: 30_000 });
  await status.click();

  const option = page.getByRole("option", { name: statusName, exact: true });
  await option.waitFor({ state: "visible", timeout: 10_000 });
  if ((await option.count()) !== 1) {
    throw new Error(`El estado ${statusName} no es único.`);
  }
  await option.click();
  await page.waitForFunction(
    ({ expected }) => {
      const label = [...document.querySelectorAll("label")].find(
        (element) => element.textContent?.trim() === "Status",
      );
      const input = label ? document.getElementById(label.htmlFor) : null;
      return input?.getAttribute("title") === expected;
    },
    { expected: statusName },
  );
  await page.waitForTimeout(750);
}

async function readPendingRequests(page) {
  await page.goto(REQUESTS_URL, { waitUntil: "domcontentloaded" });
  await selectPendingStatus(page);
  const rows = await readAllPendingGridRows(page);
  return rows.map(({ cells }) => ({
    id: cells.RequestId,
    system: cells.SystemName,
    account: cells.AccountName,
    application: cells.Application,
    release: cells.ReleaseDt,
    reason: cells.Description,
    status: "Pending",
  }));
}

async function findExistingRequests(page, options) {
  const pending = await readPendingRequests(page);
  return filterRequestsByStartDate(pending, options);
}

async function setStartDate(page, locator, date) {
  const [year, month, day] = date.split("-").map(Number);
  const calendarMarker = "codex-start-date-calendar";
  const targetLabel = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
  const expectedInputLabel = `${new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`))} ${String(day).padStart(2, "0")}, ${year}`;

  let actualLabel = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await locator.evaluate((visibleInput, target) => {
      const hiddenInput = visibleInput.parentElement?.querySelector('input[type="hidden"]');
      const calendar = hiddenInput?._flatpickr;
      if (!calendar) {
        throw new Error("El control de fecha no expone su calendario Flatpickr.");
      }
      const targetDate = new Date(target.year, target.month - 1, target.day);
      document
        .querySelectorAll(`[data-codex-calendar="${target.marker}"]`)
        .forEach((element) => element.removeAttribute("data-codex-calendar"));
      calendar.open();
      calendar.jumpToDate(targetDate);
      calendar.calendarContainer.setAttribute("data-codex-calendar", target.marker);
    }, { year, month, day, marker: calendarMarker });

    const calendar = page.locator(`[data-codex-calendar="${calendarMarker}"]`);
    const targetDay = calendar.locator(
      `.flatpickr-day[aria-label="${targetLabel}"]:not(.flatpickr-disabled)`,
    );
    await targetDay.waitFor({ state: "visible", timeout: 10_000 });
    if ((await targetDay.count()) !== 1) {
      throw new Error(`La fecha ${targetLabel} no aparece una sola vez en su calendario.`);
    }
    await targetDay.click();

    let stableSamples = 0;
    for (let sample = 0; sample < 12; sample += 1) {
      await page.waitForTimeout(125);
      actualLabel = await locator.inputValue();
      stableSamples = actualLabel === expectedInputLabel ? stableSamples + 1 : 0;
      if (stableSamples >= 8) return;
    }
    await page.waitForTimeout(250);
  }

  throw new Error(
    `El calendario no conservó la fecha solicitada después de 3 intentos. ` +
    `Esperada: ${expectedInputLabel}; observada: ${actualLabel}`,
  );
}

function requestFormLocators(page) {
  return {
    startDate: page.getByLabel("Start Date", { exact: true }),
    startTime: page.getByLabel("Start Time", { exact: true }),
    days: page.getByLabel("Days", { exact: true }),
    hours: page.getByLabel("Hours", { exact: true }),
    minutes: page.getByLabel("Minutes", { exact: true }),
    reason: page.getByLabel("Reason", { exact: true }),
    applicationSession: page.getByRole("switch", {
      name: "Application Session",
      exact: true,
    }),
  };
}

function expectedRequestFormValues(options) {
  const [expectedYear, , expectedDay] = options.date.split("-");
  const expectedMonthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${options.date}T00:00:00Z`));
  return {
    date: `${expectedMonthName} ${expectedDay}, ${expectedYear}`,
    time: options.startTime,
    days: String(options.durationDays),
    hours: String(options.durationHours),
    minutes: "0",
    reason: options.reason,
  };
}

async function readRequestFormValues(fields) {
  return {
    date: await fields.startDate.inputValue(),
    time: await fields.startTime.inputValue(),
    days: await fields.days.inputValue(),
    hours: await fields.hours.inputValue(),
    minutes: await fields.minutes.inputValue(),
    reason: await fields.reason.inputValue(),
  };
}

async function assertRequestFormValues(page, options, context) {
  const fields = requestFormLocators(page);
  const actual = await readRequestFormValues(fields);
  const expected = expectedRequestFormValues(options);
  const applicationSessionChecked =
    (await fields.applicationSession.count()) === 1 &&
    (await fields.applicationSession.getAttribute("aria-checked")) === "true";
  if (!applicationSessionChecked || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${context}: el formulario cambió y Submit Request fue bloqueado. ` +
      `Esperado: ${JSON.stringify(expected)}; observado: ${JSON.stringify(actual)}; ` +
      `Application Session: ${applicationSessionChecked ? "seleccionado" : "no seleccionado"}.`,
    );
  }
}

async function waitForRequestFormReady(page) {
  const fields = requestFormLocators(page);
  await Promise.all([
    fields.startDate.waitFor({ state: "visible", timeout: 15_000 }),
    fields.startTime.waitFor({ state: "visible", timeout: 15_000 }),
    fields.hours.waitFor({ state: "visible", timeout: 15_000 }),
    fields.reason.waitFor({ state: "visible", timeout: 15_000 }),
    fields.applicationSession.waitFor({ state: "visible", timeout: 15_000 }),
  ]);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await fields.applicationSession.getAttribute("aria-checked")) === "true") {
      await page.waitForTimeout(500);
      if ((await fields.applicationSession.getAttribute("aria-checked")) === "true") return;
    }
    await page.waitForTimeout(150);
  }
  throw new Error("El formulario no terminó de inicializar Application Session.");
}

async function openRequestForm(page, target, expectedCount) {
  const rows = page.locator('tr[aria-label^="Row "]');
  if ((await rows.count()) !== expectedCount) {
    throw new Error("La tabla de cuentas cambió antes de abrir la solicitud.");
  }

  const row = rows.nth(target.index);
  const observed = await row.evaluate((element) => {
    const value = (column) =>
      element.querySelector(`[data-column-id="${column}"]`)?.textContent?.replace(/\s+/g, " ").trim();
    return {
      account: value("AccountName"),
      system: value("SystemName"),
      application: value("ApplicationName"),
    };
  });
  if (requestKey(observed) !== requestKey(target)) {
    throw new Error(`La fila ${target.index + 1} cambió de identidad.`);
  }

  const access = row.getByText("Access", { exact: true });
  if ((await access.count()) !== 1) {
    throw new Error(`La acción Access no es única para ${target.system}/${target.application}.`);
  }
  await access.click();

  const submitTab = page.getByRole("tab", { name: "Submit Request", exact: true });
  await submitTab.waitFor({ state: "visible", timeout: 15_000 });
  await submitTab.click();
  await page.getByText("Select session start date", { exact: true }).waitFor({
    state: "visible",
    timeout: 15_000,
  });
  await waitForRequestFormReady(page);
}

async function fillRequestForm(page, options) {
  const fields = requestFormLocators(page);
  await setStartDate(page, fields.startDate, options.date);
  await fields.startTime.fill(options.startTime);
  await page.waitForTimeout(250);
  if ((await fields.startTime.inputValue()) !== options.startTime) {
    await fields.startTime.fill(options.startTime);
  }
  await fields.days.fill(String(options.durationDays));
  await fields.hours.fill(String(options.durationHours));
  await fields.minutes.fill("0");
  await fields.reason.fill(options.reason);
  await page.waitForTimeout(750);
  await assertRequestFormValues(page, options, "Validación posterior al llenado");
}

const APPROVED_ACCESS_OVERLAP_CODE =
  "PSPortal.Requests.Policies.RemoteAppAccesssAlreadyAvailable";

export function classifySubmissionResponse(status, payload) {
  if (status >= 200 && status < 300) return { submitted: true };

  const code = payload?.ErrorDetails?.ErrorCode?.Key;
  const message = String(payload?.Message ?? "").trim();
  if (status === 400 && code === APPROVED_ACCESS_OVERLAP_CODE) {
    return {
      submitted: false,
      conflict: {
        type: "approved_access_overlap",
        code,
        message: message || "La cuenta ya está disponible durante el horario solicitado.",
      },
    };
  }

  throw new Error(
    `PAM rechazó Submit Request con HTTP ${status}${code ? ` (${code})` : ""}` +
    `${message ? `: ${message}` : "."}`,
  );
}

function observeSubmissionOutcome(page, submit) {
  const invalidTime = page
    .getByText(/^The time must be between .+ and .+\.$/i)
    .filter({ visible: true });

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      page.off("response", onResponse);
      callback(value);
    };
    const onResponse = async (response) => {
      const url = new URL(response.url());
      if (
        response.request().method() !== "POST" ||
        !url.pathname.toLowerCase().endsWith("/api/ps-portal/requests")
      ) return;
      let payload;
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
      try {
        finish(resolve, classifySubmissionResponse(response.status(), payload));
      } catch (error) {
        finish(reject, error);
      }
    };
    const poll = async () => {
      while (!settled) {
        try {
          if ((await invalidTime.count()) > 0) {
            const message = (await invalidTime.first().textContent())?.replace(/\s+/g, " ").trim();
            finish(reject, new Error(
              `PAM no permite la hora solicitada: ${message} ` +
              "Edite la solicitud y seleccione un horario válido.",
            ));
            return;
          }
          if (await submit.isHidden()) {
            finish(resolve, { submitted: true });
            return;
          }
          await page.waitForTimeout(100);
        } catch (error) {
          finish(reject, error);
        }
      }
    };
    const timeout = setTimeout(() => {
      finish(reject, new Error(
        "PAM no respondió a Submit Request ni mostró una validación reconocida en 30 segundos.",
      ));
    }, 30_000);
    page.on("response", onResponse);
    void poll();
  });
}

async function closeRequestForm(page) {
  const cancel = page.getByRole("button", { name: "Cancel", exact: true });
  await cancel.click();
  const discard = page.getByRole("button", { name: "Discard Changes", exact: true });
  await discard.waitFor({ state: "visible", timeout: 10_000 });
  await discard.click();
  await cancel.waitFor({ state: "hidden", timeout: 15_000 });
}

async function submitOneRequest(page, target, options, expectedCount) {
  await openRequestForm(page, target, expectedCount);
  await fillRequestForm(page, options);

  if (!options.execute) {
    await closeRequestForm(page);
    return { submitted: false, cancelled: true };
  }

  const submit = page.getByRole("button", { name: "Submit Request", exact: true });
  if ((await submit.count()) !== 1) {
    throw new Error("El botón final Submit Request no es único.");
  }
  await page.waitForTimeout(500);
  await assertRequestFormValues(page, options, "Validación inmediata antes del envío");
  const submissionOutcome = observeSubmissionOutcome(page, submit);
  await submit.click();
  const outcome = await submissionOutcome;
  if (outcome.conflict) {
    await closeRequestForm(page);
    return outcome;
  }
  await submit.waitFor({ state: "hidden", timeout: 30_000 });
  return outcome;
}

async function saveResult(result) {
  await mkdir(resultsDirectory, { recursive: true });
  const resultPath = path.join(resultsDirectory, "last-run.json");
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return resultPath;
}

async function saveSingleSubmitVerification(result) {
  await mkdir(resultsDirectory, { recursive: true });
  const resultPath = path.join(resultsDirectory, "single-submit-verification.json");
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return resultPath;
}

async function waitForPendingRequest(page, target, options) {
  const expectedKey = requestKey(target);
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const matching = filterRequestsByStartDate(
      await readPendingRequests(page),
      options,
    ).filter((request) => requestKey(request) === expectedKey);
    if (matching.length === 1) return matching[0];
    if (matching.length > 1) {
      throw new Error(
        "Pending contiene más de una solicitud para la misma cuenta y Request Start Date.",
      );
    }
    if (attempt < 6) await page.waitForTimeout(2_000);
  }
  throw new Error(
    `No apareció en Pending la solicitud con Request Start Date ${expectedReleaseText(options.date, options.startTime)}.`,
  );
}

let session;
let failedBrowser;
let cancellationStarted = false;

async function cancelAutomation() {
  if (cancellationStarted) {
    process.exit(130);
  }
  cancellationStarted = true;
  console.log("\nAutomatización cancelada por el usuario.");
  await session?.browser?.close().catch(() => {});
  process.exit(130);
}

const isEntryPoint = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
process.on("SIGINT", cancelAutomation);

try {
  const options = await parseArguments(process.argv.slice(2));
  if ((options.execute || options.testRun) && options.sendEmail) {
    await loadMailSettings();
  }
  session = await openAuthenticatedSession({ headed: options.headed });
  const { page } = session;
  const targets = await loadAccountTargets(page);
  const favoriteCount = targets.length;
  const existing = await findExistingRequests(page, options);
  const existingByKey = new Map(existing.map((request) => [requestKey(request), request]));

  if (options.testRun) {
    const observedCount = await openFavoriteAccounts(page);
    if (observedCount !== favoriteCount) {
      throw new Error(`Favorites cambió de ${favoriteCount} a ${observedCount} cuentas durante la prueba.`);
    }

    let validated = 0;
    for (const target of targets) {
      await submitOneRequest(page, target, options, favoriteCount);
      validated += 1;
      console.log(`Formulario de prueba validado ${validated}/${favoriteCount}: ${target.system} / ${target.application}`);
    }

    const result = {
      completedAt: new Date().toISOString(),
      date: options.date,
      startTime: options.startTime,
      hours: options.sessionHours,
      reason: options.reason,
      submitted: 0,
      favoriteCount,
      validatedFavoriteCount: validated,
      requestIds: [...SIMULATED_REQUEST_IDS],
      sendEmail: options.sendEmail,
      testMode: true,
    };
    const resultPath = await saveResult(result);
    console.log(`Resultado de prueba guardado: ${resultPath}`);
    console.log(`REQUEST_IDS_SIMULADOS=${SIMULATED_REQUEST_IDS.join(",")}`);
  } else if (options.singleSubmit) {
    const observedCount = await openFavoriteAccounts(page);
    if (observedCount !== favoriteCount) {
      throw new Error(`Favorites cambió de ${favoriteCount} a ${observedCount} cuentas durante el envío único.`);
    }

    const target = targets.find((candidate) => !existingByKey.has(requestKey(candidate)));
    if (!target) {
      throw new Error("Todas las cuentas de Favorites ya tienen una solicitud Pending para esa fecha y hora.");
    }

    const outcome = await submitOneRequest(
      page,
      target,
      { ...options, execute: true },
      favoriteCount,
    );
    let verification;
    if (outcome.conflict) {
      const conflict = {
        ...outcome.conflict,
        system: target.system,
        account: target.account,
        application: target.application,
        requestStartDate: expectedReleaseText(options.date, options.startTime),
        hours: options.sessionHours,
      };
      verification = {
        completedAt: new Date().toISOString(),
        singleSubmit: true,
        submitted: 0,
        date: options.date,
        startTime: options.startTime,
        hours: options.sessionHours,
        reason: options.reason,
        target,
        conflict,
      };
      console.warn(
        `Solicitud omitida por acceso aprobado superpuesto: ${target.system} / ` +
        `${target.application} — ${conflict.requestStartDate}.`,
      );
    } else {
      console.log(`Única solicitud enviada: ${target.system} / ${target.application}.`);
      const pendingRequest = await waitForPendingRequest(page, target, options);
      verification = {
        completedAt: new Date().toISOString(),
        singleSubmit: true,
        submitted: 1,
        date: options.date,
        startTime: options.startTime,
        requestStartDate: pendingRequest.release,
        hours: options.sessionHours,
        reason: options.reason,
        target,
        requestId: pendingRequest.id,
        status: pendingRequest.status,
      };
    }
    const verificationPath = await saveSingleSubmitVerification(verification);
    console.log(`Verificación de envío único guardada: ${verificationPath}`);
    if (verification.requestId) console.log(`REQUEST_ID_UNICO=${verification.requestId}`);
  } else if (!options.execute) {
    const observedCount = await openFavoriteAccounts(page);
    if (observedCount !== favoriteCount) {
      throw new Error(`Favorites cambió de ${favoriteCount} a ${observedCount} cuentas durante la ejecución.`);
    }
    await submitOneRequest(page, targets[0], options, favoriteCount);
    console.log(`Validación sin envío correcta para ${options.date}.`);
  } else {
    const observedCount = await openFavoriteAccounts(page);
    if (observedCount !== favoriteCount) {
      throw new Error(`Favorites cambió de ${favoriteCount} a ${observedCount} cuentas durante la ejecución.`);
    }

    let submitted = 0;
    let processed = 0;
    const conflicts = [];
    for (const target of targets) {
      if (existingByKey.has(requestKey(target))) {
        processed += 1;
        console.log(`Solicitud existente: ${target.system} / ${target.application}`);
        continue;
      }
      const outcome = await submitOneRequest(page, target, options, favoriteCount);
      processed += 1;
      if (outcome.conflict) {
        const conflict = {
          ...outcome.conflict,
          system: target.system,
          account: target.account,
          application: target.application,
          requestStartDate: expectedReleaseText(options.date, options.startTime),
          hours: options.sessionHours,
        };
        conflicts.push(conflict);
        console.warn(
          `Solicitud omitida por acceso aprobado superpuesto ${processed}/${favoriteCount}: ` +
          `${target.system} / ${target.application} — ${conflict.requestStartDate}.`,
        );
        continue;
      }
      submitted += 1;
      console.log(`Solicitud enviada ${processed}/${favoriteCount}: ${target.system} / ${target.application}`);
    }

    const favoriteKeys = new Set(targets.map(requestKey));
    const pending = filterRequestsByStartDate(await readPendingRequests(page), options)
      .filter((request) => favoriteKeys.has(requestKey(request)));
    const uniqueIds = [...new Set(pending.map((request) => request.id))];
    const uniquePendingKeys = new Set(pending.map(requestKey));
    const conflictKeys = new Set(conflicts.map(requestKey));
    const expectedPendingCount = favoriteCount - conflicts.length;
    const coveredKeys = new Set([...uniquePendingKeys, ...conflictKeys]);
    if (
      pending.length !== expectedPendingCount ||
      uniquePendingKeys.size !== expectedPendingCount ||
      conflictKeys.size !== conflicts.length ||
      coveredKeys.size !== favoriteCount
    ) {
      throw new Error(
        `Se esperaban ${expectedPendingCount} solicitudes Pending y ${conflicts.length} conflictos ` +
        `para cubrir ${favoriteCount} favoritos; se encontraron ${pending.length} Pending.`,
      );
    }
    if (uniqueIds.length !== expectedPendingCount) {
      throw new Error(
        `Se esperaban ${expectedPendingCount} Request ID únicos; se encontraron ${uniqueIds.length}.`,
      );
    }
    const result = {
      completedAt: new Date().toISOString(),
      date: options.date,
      startTime: options.startTime,
      hours: options.sessionHours,
      reason: options.reason,
      submitted,
      favoriteCount,
      pending,
      requestIds: uniqueIds,
      conflicts,
      sendEmail: options.sendEmail,
    };
    const resultPath = await saveResult(result);

    console.log(`Resultado guardado: ${resultPath}`);
    console.log(`REQUEST_IDS=${uniqueIds.join(",")}`);
    console.log(`CONFLICTOS_ACCESO_APROBADO=${conflicts.length}`);
    for (const conflict of conflicts) {
      console.warn(
        `CONFLICTO: ${conflict.system} / ${conflict.application} / ${conflict.account} — ` +
        `${conflict.requestStartDate}`,
      );
    }
  }
} catch (error) {
  failedBrowser = error.browser;
  const artifacts = await saveFailureArtifact(error.page ?? session?.page, error);
  console.error(`Flujo de solicitudes fallido: ${error.message}`);
  console.error(`Diagnóstico: ${artifacts.reportPath}`);
  process.exitCode = 1;
} finally {
  process.off("SIGINT", cancelAutomation);
  await (session?.browser ?? failedBrowser)?.close().catch(() => {});
}
}
