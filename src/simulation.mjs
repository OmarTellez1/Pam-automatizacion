export const SIMULATED_REQUEST_IDS = Object.freeze([
  "137288",
  "137287",
  "137286",
  "137284",
  "137283",
  "137282",
  "137281",
  "137280",
  "137278",
  "137276",
  "137275",
  "137274",
  "137273",
  "137271",
]);

export function testButtonIsEnabled(value) {
  return String(value ?? "").trim().toUpperCase() === "TRUE";
}

export function formatAutomationEmailSubject(subject, testMode) {
  const normalized = String(subject ?? "").trim();
  return testMode === true ? `[PRUEBA] ${normalized}` : normalized;
}

export function validateSimulatedRequestIds(requestIds) {
  if (!Array.isArray(requestIds)) {
    throw new TypeError("Los Request ID simulados deben proporcionarse como una lista.");
  }
  const normalized = requestIds.map((value) => String(value).trim());
  if (
    normalized.length !== SIMULATED_REQUEST_IDS.length ||
    normalized.some((value, index) => value !== SIMULATED_REQUEST_IDS[index])
  ) {
    throw new Error("El resultado de prueba no contiene la lista autorizada de Request ID simulados.");
  }
  return normalized;
}
