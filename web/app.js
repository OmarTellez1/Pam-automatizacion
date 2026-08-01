const credentialsActionLabel = document.querySelector("#credentials-action-label");
const requestActionLabel = document.querySelector("#request-action-label");
const mailActionLabel = document.querySelector("#mail-action-label");
const finalActionToggle = document.querySelector("#final-action-toggle");
const finalActionLabel = document.querySelector("#final-action-label");
const finalActionStatus = document.querySelector("#final-action-status");
const testAutomationButton = document.querySelector("#test-automation-button");
const realAutomationButton = document.querySelector("#real-automation-button");
const automationStatusElement = document.querySelector("#automation-status");
const resultDialog = document.querySelector("#automation-result-dialog");
const resultKickerElement = document.querySelector("#automation-result-kicker");
const resultTitleElement = document.querySelector("#automation-result-title");
const resultDescriptionElement = document.querySelector("#automation-result-description");
const resultIdsElement = document.querySelector("#automation-result-ids");
const resultTimeElement = document.querySelector("#automation-result-time");
const copyResultButton = document.querySelector("#copy-result-ids");
const copyResultStatus = document.querySelector("#copy-result-status");
const closeResultButton = document.querySelector("#close-result-dialog");
const dismissResultButton = document.querySelector("#dismiss-result-dialog");
const configurationLinks = [...document.querySelectorAll(".actions a.button")];
const emailSuccessDialog = document.querySelector("#email-success-dialog");
const dismissEmailSuccessButton = document.querySelector("#dismiss-email-success");
let latestRequestIds = [];
let presentedResultId;
let trackedAutomationStartedAt;
let presentedEmailCompletionId;
let automationRunning = false;
let automationStartPending = false;

function setAutomationControlsLocked(locked) {
  automationRunning = locked;
  for (const link of configurationLinks) {
    link.classList.toggle("is-disabled", locked);
    link.setAttribute("aria-disabled", String(locked));
    link.tabIndex = locked ? -1 : 0;
  }
  testAutomationButton.disabled = locked;
  realAutomationButton.disabled = locked;
  finalActionToggle.disabled = locked;
  document.querySelector(".actions").setAttribute("aria-busy", String(locked));
}

for (const link of configurationLinks) {
  link.addEventListener("click", (event) => {
    if (automationRunning) event.preventDefault();
  });
}

function renderFinalAction(action) {
  const sendsEmail = action === "email";
  finalActionToggle.dataset.action = action;
  finalActionToggle.setAttribute("aria-pressed", String(sendsEmail));
  finalActionLabel.textContent = sendsEmail
    ? "Se enviará un correo al final"
    : "Se mostrarán los IDs en esta interfaz al final";
}

async function updateConfigurationAction({ url, label, configureText, editText }) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("configuration status unavailable");
    const result = await response.json();
    label.textContent = result.configured ? editText : configureText;
  } catch {
    label.textContent = configureText;
  }
}

Promise.all([
  updateConfigurationAction({
    url: "/api/credentials/status",
    label: credentialsActionLabel,
    configureText: "Configurar credenciales del PAM",
    editText: "Editar credenciales del PAM",
  }),
  updateConfigurationAction({
    url: "/api/request-settings",
    label: requestActionLabel,
    configureText: "Configurar solicitud",
    editText: "Editar solicitud",
  }),
  updateConfigurationAction({
    url: "/api/mail-settings",
    label: mailActionLabel,
    configureText: "Configurar envío de correo",
    editText: "Editar envío de correo",
  }),
]);

async function loadFinalAction() {
  try {
    const response = await fetch("/api/final-action", { cache: "no-store" });
    if (!response.ok) throw new Error("final action unavailable");
    const result = await response.json();
    renderFinalAction(result.action);
  } catch {
    renderFinalAction("web");
    finalActionStatus.textContent = "No fue posible cargar la acción final; los IDs se mostrarán en la web.";
  } finally {
    finalActionToggle.disabled = automationRunning;
  }
}

finalActionToggle.addEventListener("click", async () => {
  const previousAction = finalActionToggle.dataset.action;
  const nextAction = previousAction === "email" ? "web" : "email";
  finalActionToggle.disabled = true;
  finalActionStatus.textContent = "Guardando acción final…";
  try {
    const response = await fetch("/api/final-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: nextAction }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    renderFinalAction(result.action);
    finalActionStatus.textContent = result.message;
  } catch {
    renderFinalAction(previousAction);
    finalActionStatus.textContent = "No fue posible guardar la acción final.";
  } finally {
    finalActionToggle.disabled = automationRunning;
  }
});

loadFinalAction();

function closeResultDialog() {
  if (resultDialog.open) resultDialog.close();
}

function renderAutomationResult(result) {
  latestRequestIds = result.requestIds;
  if (result.testMode) {
    resultKickerElement.textContent = "Prueba completada";
    resultTitleElement.textContent = "Request ID simulados";
    resultDescriptionElement.textContent =
      `Se validaron ${result.favoriteCount} formularios de Favorites sin presionar Submit Request. ` +
      `Estos ${result.requestIds.length} IDs son únicamente datos de prueba.`;
  } else {
    resultKickerElement.textContent = "Automatización completada";
    resultTitleElement.textContent = "Request ID obtenidos";
    resultDescriptionElement.textContent =
      `Se obtuvieron ${result.favoriteCount} solicitudes de las cuentas favoritas. ` +
      "Puede copiar los IDs para utilizarlos donde necesite.";
  }
  resultIdsElement.replaceChildren(...result.requestIds.map((requestId) => {
    const item = document.createElement("li");
    item.textContent = requestId;
    return item;
  }));
  resultTimeElement.textContent = `Finalizado: ${new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(result.completedAt))}`;
}

function renderAutomationStatus(status) {
  const isRunning = status.state === "running";
  if (isRunning && status.startedAt) trackedAutomationStartedAt = status.startedAt;
  testAutomationButton.hidden = !status.testButtonEnabled;
  setAutomationControlsLocked(isRunning || automationStartPending);
  automationStatusElement.textContent = status.message ?? "";
  automationStatusElement.dataset.state = status.state;

  const completionId = `${status.startedAt ?? ""}:${status.completedAt ?? ""}`;
  if (
    status.state === "completed" &&
    status.emailSent === true &&
    status.startedAt === trackedAutomationStartedAt &&
    completionId !== presentedEmailCompletionId
  ) {
    presentedEmailCompletionId = completionId;
    if (!emailSuccessDialog.open) emailSuccessDialog.showModal();
  }
}

async function loadAutomationStatus() {
  try {
    const response = await fetch("/api/automation/status", { cache: "no-store" });
    if (!response.ok) throw new Error("automation status unavailable");
    renderAutomationStatus(await response.json());
  } catch {
    testAutomationButton.hidden = true;
    testAutomationButton.disabled = true;
    realAutomationButton.disabled = true;
    automationStatusElement.textContent = "No fue posible consultar el estado de la automatización.";
  }
}

async function startAutomation(mode) {
  if (automationRunning) return;
  const confirmed = mode === "real"
    ? window.confirm("Esta ejecución presionará Submit Request y creará solicitudes reales en PAM. ¿Desea continuar?")
    : window.confirm("La prueba recorrerá todos los favoritos sin presionar Submit Request. Según el toggle, puede enviar un correo con IDs simulados. ¿Desea continuar?");
  if (!confirmed) return;

  closeResultDialog();
  if (emailSuccessDialog.open) emailSuccessDialog.close();
  automationStartPending = true;
  setAutomationControlsLocked(true);
  automationStatusElement.textContent =
    "Iniciando automatización… Todos los botones se habilitarán nuevamente cuando termine con éxito o con error.";
  try {
    const response = await fetch("/api/automation/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    automationStartPending = false;
    trackedAutomationStartedAt = result.startedAt;
    renderAutomationStatus(result);
  } catch (error) {
    automationStartPending = false;
    await loadAutomationStatus();
    automationStatusElement.textContent = error.message || "No fue posible iniciar la automatización.";
  }
}

testAutomationButton.addEventListener("click", () => startAutomation("test"));
realAutomationButton.addEventListener("click", () => startAutomation("real"));

async function checkAutomationResult() {
  try {
    const response = await fetch("/api/automation-result", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json();
    if (!result.available || result.resultId === presentedResultId) return;
    presentedResultId = result.resultId;
    renderAutomationResult(result);
    if (!resultDialog.open) resultDialog.showModal();
  } catch {
    // El sondeo volverá a intentarlo; no interrumpe el uso de la portada.
  }
}

copyResultButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(latestRequestIds.join("\n"));
    copyResultButton.querySelector("span:first-child").textContent = "IDs copiados";
    copyResultStatus.textContent =
      `${latestRequestIds.length} Request ID se copiaron al portapapeles.`;
    window.setTimeout(() => {
      copyResultButton.querySelector("span:first-child").textContent = "Copiar IDs";
    }, 1800);
  } catch {
    copyResultStatus.textContent = "No fue posible copiar los IDs. Puede seleccionarlos manualmente.";
  }
});

closeResultButton.addEventListener("click", closeResultDialog);
dismissResultButton.addEventListener("click", closeResultDialog);
resultDialog.addEventListener("click", (event) => {
  if (event.target === resultDialog) closeResultDialog();
});
dismissEmailSuccessButton.addEventListener("click", () => emailSuccessDialog.close());
emailSuccessDialog.addEventListener("click", (event) => {
  if (event.target === emailSuccessDialog) emailSuccessDialog.close();
});

checkAutomationResult();
window.setInterval(checkAutomationResult, 2000);
loadAutomationStatus();
window.setInterval(loadAutomationStatus, 1500);
