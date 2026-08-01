export const DEFAULT_REASON =
  "Soporte y pruebas con usuario post producción - TIC PETER GOMEZ";
export const DEFAULT_HOURS = 8;

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

function ecuadorMinute(date) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export function replacePastDateWithTodayForEcuador(value, now = new Date()) {
  const startDate = String(value).trim();
  const requestedDate = parseDayMonthForEcuador(startDate, now);
  const currentDate = ecuadorMinute(now).slice(0, 10);
  if (requestedDate >= currentDate) {
    return { startDate, updated: false };
  }

  const [, month, day] = currentDate.split("-");
  return { startDate: `${day}/${month}`, updated: true };
}

export function validateRequestStartNotPast(date, startTime, now = new Date()) {
  const requested = `${validateIsoDate(date)}T${validateStartTime(startTime)}`;
  const current = ecuadorMinute(now);
  if (requested < current) {
    throw new Error(
      "La fecha y hora de inicio ya pasaron en America/Guayaquil. " +
      "Edite la solicitud y seleccione un horario actual o futuro.",
    );
  }
  return { date, startTime };
}

export function parseTime12Hour(value, period) {
  const match = /^(0?[1-9]|1[0-2]):([0-5]\d)$/.exec(String(value ?? "").trim());
  const normalizedPeriod = String(period ?? "").trim().toUpperCase();
  if (!match || !["AM", "PM"].includes(normalizedPeriod)) {
    throw new Error("La hora debe usar el formato hh:mm y seleccionar AM o PM.");
  }

  const displayHour = Number(match[1]);
  const hour = normalizedPeriod === "AM"
    ? displayHour % 12
    : (displayHour % 12) + 12;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

export function parseFormattedTime12Hour(value) {
  const match = /^(0?[1-9]|1[0-2]):([0-5]\d)\s+(AM|PM)$/i.exec(String(value ?? "").trim());
  if (!match) {
    throw new Error("La hora debe usar el formato hh:mm AM/PM.");
  }
  return parseTime12Hour(`${match[1]}:${match[2]}`, match[3]);
}

export function splitTime24Hour(value) {
  const [hour, minute] = validateStartTime(value).split(":").map(Number);
  return {
    startTime12: `${String(hour % 12 || 12).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    startPeriod: hour >= 12 ? "PM" : "AM",
  };
}

export function formatTime12Hour(value) {
  const { startTime12, startPeriod } = splitTime24Hour(value);
  return `${startTime12} ${startPeriod}`;
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

function normalizeGridText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function filterRequestsByStartDate(requests, options) {
  const expectedStartDate = expectedReleaseText(options.date, options.startTime);
  return requests.filter(
    (request) => normalizeGridText(request.release) === expectedStartDate,
  );
}
