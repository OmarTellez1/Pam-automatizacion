const form = document.querySelector("#request-settings-form");
const saveButton = document.querySelector("#save-request-settings");
const resultElement = document.querySelector("#request-settings-result");
const readableDateElement = document.querySelector("#start-date-readable");
const startDayElement = form.elements.startDay;
const startMonthElement = form.elements.startMonth;
const saveLabel = "Guardar configuración";
const ECUADOR_TIME_ZONE = "America/Guayaquil";

function ecuadorToday(date = new Date()) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: ECUADOR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthName(year, month) {
  const value = new Intl.DateTimeFormat("es-EC", {
    timeZone: "UTC",
    month: "long",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return value.charAt(0).toLocaleUpperCase("es-EC") + value.slice(1);
}

function populateMonths(selectedMonth) {
  const today = ecuadorToday();
  const requestedMonth = Number(selectedMonth);
  const activeMonth = requestedMonth >= today.month && requestedMonth <= 12
    ? requestedMonth
    : today.month;
  startMonthElement.replaceChildren(...Array.from({ length: 13 - today.month }, (_, index) => {
    const month = today.month + index;
    const option = document.createElement("option");
    option.value = String(month).padStart(2, "0");
    option.textContent = monthName(today.year, month);
    return option;
  }));
  startMonthElement.value = String(activeMonth).padStart(2, "0");
}

function populateDays(selectedDay) {
  const today = ecuadorToday();
  const month = Number(startMonthElement.value);
  const maximumDay = daysInMonth(today.year, month);
  const firstAvailableDay = month === today.month ? today.day : 1;
  const requestedDay = Number(selectedDay);
  const activeDay = Number.isInteger(requestedDay)
    ? Math.min(Math.max(requestedDay, firstAvailableDay), maximumDay)
    : firstAvailableDay;
  startDayElement.replaceChildren(...Array.from({
    length: maximumDay - firstAvailableDay + 1,
  }, (_, index) => {
    const day = firstAvailableDay + index;
    const option = document.createElement("option");
    option.value = String(day).padStart(2, "0");
    option.textContent = String(day);
    return option;
  }));
  startDayElement.value = String(activeDay).padStart(2, "0");
}

function applyDateSelection(value) {
  const match = /^(\d{2})\/(\d{2})$/.exec(String(value ?? "").trim());
  populateMonths(match?.[2]);
  populateDays(match?.[1]);
  updateSelectedDate();
}

function readableStartDate(value) {
  const match = /^(\d{2})\/(\d{2})$/.exec(String(value).trim());
  if (!match) return "";

  const year = ecuadorToday().year;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }

  const formattedDate = new Intl.DateTimeFormat("es-EC", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  return formattedDate.charAt(0).toLocaleUpperCase("es-EC") + formattedDate.slice(1);
}

function updateSelectedDate() {
  form.elements.startDate.value = `${startDayElement.value}/${startMonthElement.value}`;
  const readableDate = readableStartDate(form.elements.startDate.value);
  readableDateElement.textContent = readableDate;
  readableDateElement.hidden = !readableDate;
}

function applySettingsState(result) {
  const settings = result.settings;
  applyDateSelection(settings.startDate);
  form.elements.startTime12.value = settings.startTime12 ?? "";
  form.elements.startPeriod.value = settings.startPeriod ?? "AM";
  form.elements.sessionHours.value = settings.sessionHours ?? "";
  form.elements.reason.value = settings.reason ?? "";
  saveButton.querySelector("span:first-child").textContent = saveLabel;
}

function showResult(type, message) {
  resultElement.hidden = false;
  resultElement.dataset.type = type;
  resultElement.textContent = message;
}

async function loadSettings() {
  try {
    const response = await fetch("/api/request-settings?refreshPastDate=true", { cache: "no-store" });
    if (!response.ok) throw new Error("settings unavailable");
    const result = await response.json();
    applySettingsState(result);
    if (result.dateUpdated) {
      showResult(
        "warning",
        `La fecha guardada ya había pasado y se actualizó automáticamente a hoy (${result.settings.startDate}). La hora no cambió.`,
      );
    }
  } catch {
    showResult("error", "No fue posible cargar la configuración guardada.");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  saveButton.disabled = true;
  saveButton.querySelector("span:first-child").textContent = "Guardando…";
  resultElement.hidden = true;

  try {
    const response = await fetch("/api/request-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: form.elements.startDate.value,
        startTime12: form.elements.startTime12.value,
        startPeriod: form.elements.startPeriod.value,
        sessionHours: form.elements.sessionHours.value,
        reason: form.elements.reason.value,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      showResult("error", result.message);
      return;
    }
    applySettingsState(result);
    showResult("success", result.message);
  } catch {
    showResult("error", "Se perdió la conexión con la interfaz local. Vuelva a intentarlo.");
  } finally {
    saveButton.disabled = false;
    saveButton.querySelector("span:first-child").textContent = saveLabel;
  }
});

startDayElement.addEventListener("change", updateSelectedDate);
startMonthElement.addEventListener("change", () => {
  populateDays(startDayElement.value);
  updateSelectedDate();
});

applyDateSelection("");
loadSettings();
