import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { parseYesNo, promptUntilValid } from "./interactive-input.mjs";
import { generateAccessEmailArtifacts } from "./email-content.mjs";
import {
  DEFAULT_HOURS,
  DEFAULT_REASON,
  EXPECTED_REQUEST_COUNT,
  expectedReleaseText,
  formatIsoDateAsDayMonthYear,
  formatTime12Hour,
  parseDayMonthForEcuador,
  requestKey,
  validateStartTime,
} from "./request-config.mjs";
import {
  TARGET_ORIGIN,
  isEnabled,
  openAuthenticatedSession,
  projectDirectory,
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
    headed: isEnabled(process.env.BI_HEADED),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--date") result.dateInput = argv[++index];
    else if (argument === "--time") result.startTime = argv[++index];
    else if (argument === "--email") result.emailInput = argv[++index];
    else if (argument === "--execute") result.execute = true;
    else if (argument === "--headed") result.headed = true;
    else throw new Error(`Argumento desconocido: ${argument}`);
  }

  let terminal;
  try {
    if (!result.dateInput || !result.startTime || !result.emailInput) {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error("Faltan --date dd/mm, --time HH:mm y/o --email S|N para una ejecución no interactiva.");
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
      if (!result.emailInput) {
        result.sendEmail = await promptUntilValid(
          terminal,
          "¿Desea que envié el correo por usted? S/N: ",
          parseYesNo,
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
  console.log(`Enviar correo al finalizar: ${result.sendEmail ? "Sí" : "No"}`);
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

async function loadAccountTargets(page) {
  await page.goto(ACCOUNTS_URL, { waitUntil: "domcontentloaded" });
  await page.getByText(`${EXPECTED_REQUEST_COUNT} items`, { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  const rows = await readGridRows(page);
  const targets = rows.map(({ index, cells }) => ({
    index,
    account: cells.AccountName,
    system: cells.SystemName,
    application: cells.ApplicationName,
  }));

  if (targets.length !== EXPECTED_REQUEST_COUNT) {
    throw new Error(`Se esperaban ${EXPECTED_REQUEST_COUNT} cuentas favoritas; se encontraron ${targets.length}.`);
  }
  if (new Set(targets.map(requestKey)).size !== EXPECTED_REQUEST_COUNT) {
    throw new Error("Las 14 cuentas no tienen una combinación única de sistema, cuenta y aplicación.");
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
    (request) => request.release === release && request.reason === DEFAULT_REASON,
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
  if (actualLabel !== targetLabel) {
    throw new Error(
      `El calendario no conservó la fecha solicitada. Esperada: ${targetLabel}; observada: ${actualLabel}`,
    );
  }
}

async function openRequestForm(page, target) {
  const rows = page.locator('tr[aria-label^="Row "]');
  if ((await rows.count()) !== EXPECTED_REQUEST_COUNT) {
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
  await days.fill("0");
  await hours.fill(String(DEFAULT_HOURS));
  await minutes.fill("0");
  await reason.fill(DEFAULT_REASON);

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
    days: "0",
    hours: String(DEFAULT_HOURS),
    minutes: "0",
    reason: DEFAULT_REASON,
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`El formulario no conservó los valores esperados: ${JSON.stringify(actual)}`);
  }
}

async function submitOneRequest(page, target, options) {
  await openRequestForm(page, target);
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

process.on("SIGINT", cancelAutomation);

try {
  const options = await parseArguments(process.argv.slice(2));
  session = await openAuthenticatedSession({ headed: options.headed });
  const { page } = session;
  const targets = await loadAccountTargets(page);
  const existing = await findExistingRequests(page, options);
  const existingByKey = new Map(existing.map((request) => [requestKey(request), request]));

  if (!options.execute) {
    await page.goto(ACCOUNTS_URL, { waitUntil: "domcontentloaded" });
    await page.getByText(`${EXPECTED_REQUEST_COUNT} items`, { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await submitOneRequest(page, targets[0], options);
    console.log(`Validación sin envío correcta para ${options.date}.`);
  } else {
    await page.goto(ACCOUNTS_URL, { waitUntil: "domcontentloaded" });
    await page.getByText(`${EXPECTED_REQUEST_COUNT} items`, { exact: true }).waitFor({ state: "visible", timeout: 30_000 });

    let submitted = 0;
    for (const target of targets) {
      if (existingByKey.has(requestKey(target))) {
        console.log(`Solicitud existente: ${target.system} / ${target.application}`);
        continue;
      }
      await submitOneRequest(page, target, options);
      submitted += 1;
      console.log(`Solicitud enviada ${submitted}/${EXPECTED_REQUEST_COUNT}: ${target.system} / ${target.application}`);
    }

    const pending = desiredRequests(await readPendingRequests(page), options);
    const uniqueIds = [...new Set(pending.map((request) => request.id))];
    const result = {
      date: options.date,
      startTime: options.startTime,
      hours: DEFAULT_HOURS,
      reason: DEFAULT_REASON,
      submitted,
      pending,
      requestIds: uniqueIds,
      sendEmail: options.sendEmail,
    };
    const resultPath = await saveResult(result);

    console.log(`Resultado guardado: ${resultPath}`);
    console.log(`REQUEST_IDS=${uniqueIds.join(",")}`);
    if (uniqueIds.length !== EXPECTED_REQUEST_COUNT) {
      throw new Error(`Se esperaban ${EXPECTED_REQUEST_COUNT} Request ID únicos; se encontraron ${uniqueIds.length}.`);
    }
    const emailArtifacts = await generateAccessEmailArtifacts(uniqueIds);
    console.log(`Correo Markdown generado: ${emailArtifacts.markdownPath}`);
    console.log(`Correo HTML generado: ${emailArtifacts.htmlPath}`);
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
