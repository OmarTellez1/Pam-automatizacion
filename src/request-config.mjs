export const DEFAULT_REASON =
  "Soporte y pruebas con usuario post producción - TIC PETER GOMEZ";
export const DEFAULT_HOURS = 8;
export const EXPECTED_REQUEST_COUNT = 14;

export function validateIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("La fecha debe usar el formato YYYY-MM-DD.");

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new Error(`La fecha ${value} no existe.`);
  }

  return value;
}

export function currentEcuadorYear(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Guayaquil",
    year: "numeric",
  }).format(date);
}

export function parseDayMonthForEcuador(value, date = new Date()) {
  const match = /^(\d{2})\/(\d{2})$/.exec(String(value).trim());
  if (!match) {
    throw new Error("La fecha debe usar el formato dd/mm, por ejemplo 01/08.");
  }

  const [, day, month] = match;
  const year = currentEcuadorYear(date);
  return validateIsoDate(`${year}-${month}-${day}`);
}

export function formatIsoDateAsDayMonthYear(value) {
  const [year, month, day] = validateIsoDate(value).split("-");
  return `${day}/${month}/${year}`;
}

export function validateStartTime(value) {
  const normalized = String(value).trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
    throw new Error("La hora debe usar el formato HH:mm de 24 horas, por ejemplo 14:00.");
  }
  return normalized;
}

export function formatTime12Hour(value) {
  const [hour, minute] = validateStartTime(value).split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${String(displayHour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`;
}

export function applicationFamily(value) {
  const normalized = String(value).toLowerCase();
  for (const family of ["winscp", "putty", "plsql", "nosqlbooster"]) {
    if (normalized.includes(family)) return family;
  }
  return normalized.replace(/\s+/g, " ").trim();
}

export function requestKey({ system, account, application }) {
  return [system, account, applicationFamily(application)]
    .map((value) => String(value).toLowerCase().replace(/\s+/g, " ").trim())
    .join("|");
}

export function expectedReleaseText(date, time) {
  const [year, month, day] = validateIsoDate(date).split("-").map(Number);
  const [hour, minute] = validateStartTime(time).split(":").map(Number);
  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${monthName} ${String(day).padStart(2, "0")}, ${year}, ${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}
