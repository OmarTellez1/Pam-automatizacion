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
  formatIsoDateAsDayMonthYear,
  formatTime12Hour,
  parseDayMonthForEcuador,
  requestKey,
  validateStartTime,
} from "./request-config.mjs";
import { loadRequestSettings } from "./request-settings.mjs";
import { loadMailSettings } from "./mail-settings.mjs";
import { finalActionSendsEmail, loadFinalAction } from "./final-action.mjs";
import { SIMULATED_REQUEST_IDS } from "./simulation.mjs";
import { projectDirectory } from "./env-config.mjs";
import {
  TARGET_ORIGIN,
  isEnabled,
  openAuthenticatedSession,
  saveFailureArtifact,
} from "./session.mjs";

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
    testRun: false,
    headed: isEnabled(process.env.BI_HEADED),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--date") result.dateInput = argv[++index];
    else if (argument === "--time") result.startTime = argv[++index];
    else if (argument === "--email") result.emailInput = argv[++index];
    else if (argument === "--execute") result.execute = true;
    else if (argument === "--test-run") result.testRun = true;
    else if (argument === "--headed") result.headed = true;
    else throw new Error(`Argumento desconocido: ${argument}`);
  }

  if (result.execute && result.testRun) {
    throw new Error("Los modos real y de prueba no pueden ejecutarse al mismo tiempo.");
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
  if (result.sendEmail === undefined) {
    result.sendEmail = parseYesNo(result.emailInput);
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
  const rows = await readGridRows(page);
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

function desiredRequests(requests, options) {
  const release = expectedReleaseText(options.date, options.startTime);
  return requests.filter(
    (request) => request.release === release && request.reason === options.reason,
  );
}

async function findExistingRequests(page, options) {
  const pending = await readPendingRequests(page);
  return desiredRequests(pending, options);
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

  await page.waitForTimeout(350);
  const actualLabel = await locator.inputValue();
  if (actualLabel !== expectedInputLabel) {
    throw new Error(
      `El calendario no conservó la fecha solicitada. Esperada: ${expectedInputLabel}; observada: ${actualLabel}`,
    );
  }
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
}

async function fillRequestForm(page, options) {
  const startDate = page.getByLabel("Start Date", { exact: true });
  const startTime = page.getByLabel("Start Time", { exact: true });
  const days = page.getByLabel("Days", { exact: true });
  const hours = page.getByLabel("Hours", { exact: true });
  const minutes = page.getByLabel("Minutes", { exact: true });
  const reason = page.getByLabel("Reason", { exact: true });

  await setStartDate(page, startDate, options.date);
  await startTime.fill(options.startTime);
  await page.waitForTimeout(250);
  if ((await startTime.inputValue()) !== options.startTime) {
    await startTime.fill(options.startTime);
  }
  await days.fill(String(options.durationDays));
  await hours.fill(String(options.durationHours));
  await minutes.fill("0");
  await reason.fill(options.reason);

  const applicationSession = page.getByRole("switch", {
    name: "Application Session",
    exact: true,
  });
  if (
    (await applicationSession.count()) !== 1 ||
    (await applicationSession.getAttribute("aria-checked")) !== "true"
  ) {
    throw new Error("Application Session no está seleccionado.");
  }

  const [expectedYear, , expectedDay] = options.date.split("-");
  const expectedMonthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${options.date}T00:00:00Z`));
  const expectedDate = `${expectedMonthName} ${expectedDay}, ${expectedYear}`;
  const actual = {
    date: await startDate.inputValue(),
    time: await startTime.inputValue(),
    days: await days.inputValue(),
    hours: await hours.inputValue(),
    minutes: await minutes.inputValue(),
    reason: await reason.inputValue(),
  };
  const expected = {
    date: expectedDate,
    time: options.startTime,
    days: String(options.durationDays),
    hours: String(options.durationHours),
    minutes: "0",
    reason: options.reason,
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`El formulario no conservó los valores esperados: ${JSON.stringify(actual)}`);
  }
}

async function submitOneRequest(page, target, options, expectedCount) {
  await openRequestForm(page, target, expectedCount);
  await fillRequestForm(page, options);

  if (!options.execute) {
    const cancel = page.getByRole("button", { name: "Cancel", exact: true });
    await cancel.click();
    const discard = page.getByRole("button", { name: "Discard Changes", exact: true });
    await discard.waitFor({ state: "visible", timeout: 10_000 });
    await discard.click();
    await cancel.waitFor({ state: "hidden", timeout: 15_000 });
    return false;
  }

  const submit = page.getByRole("button", { name: "Submit Request", exact: true });
  if ((await submit.count()) !== 1) {
    throw new Error("El botón final Submit Request no es único.");
  }
  await submit.click();
  await submit.waitFor({ state: "hidden", timeout: 30_000 });
  return true;
}

async function saveResult(result) {
  await mkdir(resultsDirectory, { recursive: true });
  const resultPath = path.join(resultsDirectory, "last-run.json");
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return resultPath;
}

let session;
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
    for (const target of targets) {
      if (existingByKey.has(requestKey(target))) {
        console.log(`Solicitud existente: ${target.system} / ${target.application}`);
        continue;
      }
      await submitOneRequest(page, target, options, favoriteCount);
      submitted += 1;
      console.log(`Solicitud enviada ${submitted}/${favoriteCount}: ${target.system} / ${target.application}`);
    }

    const favoriteKeys = new Set(targets.map(requestKey));
    const pending = desiredRequests(await readPendingRequests(page), options)
      .filter((request) => favoriteKeys.has(requestKey(request)));
    const uniqueIds = [...new Set(pending.map((request) => request.id))];
    const uniquePendingKeys = new Set(pending.map(requestKey));
    if (pending.length !== favoriteCount || uniquePendingKeys.size !== favoriteCount) {
      throw new Error(
        `Se esperaban ${favoriteCount} solicitudes Pending, una por cuenta favorita; se encontraron ${pending.length}.`,
      );
    }
    if (uniqueIds.length !== favoriteCount) {
      throw new Error(`Se esperaban ${favoriteCount} Request ID únicos; se encontraron ${uniqueIds.length}.`);
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
      sendEmail: options.sendEmail,
    };
    const resultPath = await saveResult(result);

    console.log(`Resultado guardado: ${resultPath}`);
    console.log(`REQUEST_IDS=${uniqueIds.join(",")}`);
  }
} catch (error) {
  const artifacts = await saveFailureArtifact(error.page ?? session?.page, error);
  console.error(`Flujo de solicitudes fallido: ${error.message}`);
  console.error(`Diagnóstico: ${artifacts.reportPath}`);
  process.exitCode = 1;
} finally {
  process.off("SIGINT", cancelAutomation);
  await (session?.browser ?? undefined)?.close().catch(() => {});
}
}
