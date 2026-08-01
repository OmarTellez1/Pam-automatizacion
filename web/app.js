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
const resultConflictsElement = document.querySelector("#automation-result-conflicts");
const resultConflictListElement = document.querySelector("#automation-conflict-list");
const resultTimeElement = document.querySelector("#automation-result-time");
const copyResultButton = document.querySelector("#copy-result-ids");
const copyResultStatus = document.querySelector("#copy-result-status");
const closeResultButton = document.querySelector("#close-result-dialog");
const dismissResultButton = document.querySelector("#dismiss-result-dialog");
const configurationLinks = [...document.querySelectorAll(".actions a.button")];
const emailSuccessDialog = document.querySelector("#email-success-dialog");
const dismissEmailSuccessButton = document.querySelector("#dismiss-email-success");
const emailSuccessDescription = document.querySelector("#email-success-description");
const emailSuccessConflicts = document.querySelector("#email-success-conflicts");
const emailSuccessConflictList = document.querySelector("#email-success-conflict-list");
const automationErrorDialog = document.querySelector("#automation-error-dialog");
const automationErrorTitle = document.querySelector("#automation-error-title");
const automationErrorDescription = document.querySelector("#automation-error-description");
const dismissAutomationErrorButton = document.querySelector("#dismiss-automation-error");
const outlookRequiredDialog = document.querySelector("#outlook-required-dialog");
const outlookRequiredDescription = document.querySelector("#outlook-required-description");
const dismissOutlookRequiredButton = document.querySelector("#dismiss-outlook-required");
const configureOutlookLink = document.querySelector("#configure-outlook-link");
let latestRequestIds = [];
let presentedResultId;
let automationResultMonitorInitialized = false;
let trackedAutomationStartedAt;
let presentedEmailCompletionId;
let automationRunning = false;
let automationStartPending = false;
let automationStartErrorActive = false;
let outlookResetRequired = false;

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
    configureText: "Configurar credenciales",
    editText: "Editar credenciales",
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
    if (result.action === "email") {
      const outlookResponse = await fetch("/api/outlook/status", { cache: "no-store" });
      const outlookState = outlookResponse.ok ? await outlookResponse.json() : { configured: false };
      if (!outlookState.configured) {
        await persistFinalAction("web");
        renderFinalAction("web");
        return;
      }
    }
    renderFinalAction(result.action);
  } catch {
    renderFinalAction("web");
    finalActionStatus.textContent = "No fue posible cargar la acción final; los IDs se mostrarán en la web.";
  } finally {
    finalActionToggle.disabled = automationRunning;
  }
}

async function persistFinalAction(action) {
  const response = await fetch("/api/final-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message);
  return result;
}

function showOutlookRequired(message) {
  outlookRequiredDescription.textContent = message;
  outlookResetRequired = true;
  if (!outlookRequiredDialog.open) outlookRequiredDialog.showModal();
}

async function restoreWebFinalAction() {
  outlookResetRequired = false;
  renderFinalAction("web");
  try {
    const result = await persistFinalAction("web");
    finalActionStatus.textContent = result.message;
  } catch {
    finalActionStatus.textContent =
      "No fue posible guardar el resultado web. Vuelva a intentarlo antes de iniciar.";
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
    if (nextAction === "email") {
      renderFinalAction("email");
      const outlookResponse = await fetch("/api/outlook/status", { cache: "no-store" });
      const outlookState = outlookResponse.ok ? await outlookResponse.json() : { configured: false };
      if (!outlookState.configured) {
        showOutlookRequired(
          "No puede usar el envío por Outlook porque todavía no ha configurado y verificado " +
          "su cuenta de Outlook clásico. Mientras tanto, los IDs se mostrarán en esta interfaz al finalizar.",
        );
        return;
      }
    }
    const result = await persistFinalAction(nextAction);
    renderFinalAction(result.action);
    finalActionStatus.textContent = result.message;
  } catch (error) {
    if (nextAction === "email") {
      showOutlookRequired(
        error.message || "No fue posible verificar la configuración de Outlook.",
      );
      return;
    }
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
  const conflicts = Array.isArray(result.conflicts) ? result.conflicts : [];
  if (result.testMode) {
    resultKickerElement.textContent = "Prueba completada";
    resultTitleElement.textContent = "Request ID simulados";
    resultDescriptionElement.textContent =
      `Se validaron ${result.favoriteCount} formularios de Favorites sin presionar Submit Request. ` +
      `Estos ${result.requestIds.length} IDs son únicamente datos de prueba.`;
  } else {
    resultKickerElement.textContent = conflicts.length
      ? "Automatización completada con avisos"
      : "Automatización completada";
    resultTitleElement.textContent = conflicts.length
      ? "Resultado de las solicitudes"
      : "Request ID obtenidos";
    resultDescriptionElement.textContent = conflicts.length
      ? `Se obtuvieron ${result.requestIds.length} Request ID. ${conflicts.length} ` +
        `${conflicts.length === 1 ? "solicitud fue omitida" : "solicitudes fueron omitidas"} ` +
        "porque el acceso ya estaba aprobado durante el horario solicitado."
      : `Se obtuvieron ${result.favoriteCount} solicitudes de las cuentas favoritas. ` +
        "Puede copiar los IDs para utilizarlos donde necesite.";
  }
  resultIdsElement.replaceChildren(...result.requestIds.map((requestId) => {
    const item = document.createElement("li");
    item.textContent = requestId;
    return item;
  }));
  resultIdsElement.hidden = result.requestIds.length === 0;
  copyResultButton.disabled = result.requestIds.length === 0;
  resultConflictListElement.replaceChildren(...conflicts.map((conflict) => {
    const item = document.createElement("li");
    const identity = document.createElement("strong");
    identity.textContent = `${conflict.system} / ${conflict.application}`;
    const details = document.createElement("span");
    details.textContent = `${conflict.account} — ${conflict.requestStartDate}`;
    item.append(identity, details);
    return item;
  }));
  resultConflictsElement.hidden = conflicts.length === 0;
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
  if (!(automationStartErrorActive && status.state === "idle")) {
    automationStatusElement.textContent = status.message ?? "";
    automationStatusElement.dataset.state = status.state;
  }

  const completionId = `${status.startedAt ?? ""}:${status.completedAt ?? ""}`;
  if (
    status.state === "completed" &&
    status.emailSent === true &&
    status.startedAt === trackedAutomationStartedAt &&
    completionId !== presentedEmailCompletionId
  ) {
    presentedEmailCompletionId = completionId;
    const conflicts = Array.isArray(status.conflicts) ? status.conflicts : [];
    emailSuccessDescription.textContent = conflicts.length
      ? `Outlook aceptó el correo. ${conflicts.length} ` +
        `${conflicts.length === 1 ? "solicitud fue omitida" : "solicitudes fueron omitidas"} ` +
        "porque el acceso ya estaba aprobado durante el horario solicitado."
      : "Outlook aceptó el correo generado por la automatización.";
    emailSuccessConflictList.replaceChildren(...conflicts.map((conflict) => {
      const item = document.createElement("li");
      item.textContent = `${conflict.system} / ${conflict.application} / ${conflict.account} — ` +
        conflict.requestStartDate;
      return item;
    }));
    emailSuccessConflicts.hidden = conflicts.length === 0;
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
  if (automationErrorDialog.open) automationErrorDialog.close();
  automationStartErrorActive = false;
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
    setAutomationControlsLocked(false);
    const message = error.message || "No fue posible iniciar la automatización.";
    const isPastSchedule = /(?:fecha|hora|horario).*(?:pas(?:ó|aron|ado)|anterior)/i.test(message);
    automationStartErrorActive = true;
    automationStatusElement.textContent = isPastSchedule
      ? "Debe corregir la fecha y hora de la solicitud antes de iniciar."
      : "No fue posible iniciar la automatización.";
    automationStatusElement.dataset.state = "error";
    automationErrorTitle.textContent = isPastSchedule
      ? "La fecha y hora configuradas ya pasaron"
      : "No se pudo iniciar la automatización";
    automationErrorDescription.textContent = message;
    if (!automationErrorDialog.open) automationErrorDialog.showModal();
  }
}

testAutomationButton.addEventListener("click", () => startAutomation("test"));
realAutomationButton.addEventListener("click", () => startAutomation("real"));

async function checkAutomationResult() {
  try {
    const response = await fetch("/api/automation-result", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json();
    if (!automationResultMonitorInitialized) {
      automationResultMonitorInitialized = true;
      presentedResultId = result.available ? result.resultId : undefined;
      return;
    }
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
dismissOutlookRequiredButton.addEventListener("click", () => outlookRequiredDialog.close());
outlookRequiredDialog.addEventListener("click", (event) => {
  if (event.target === outlookRequiredDialog) outlookRequiredDialog.close();
});
outlookRequiredDialog.addEventListener("close", () => {
  if (outlookResetRequired) void restoreWebFinalAction();
});
configureOutlookLink.addEventListener("click", async (event) => {
  event.preventDefault();
  await restoreWebFinalAction();
  window.location.assign(configureOutlookLink.href);
});
dismissAutomationErrorButton.addEventListener("click", () => automationErrorDialog.close());
automationErrorDialog.addEventListener("click", (event) => {
  if (event.target === automationErrorDialog) automationErrorDialog.close();
});
automationErrorDialog.addEventListener("close", () => {
  automationStartErrorActive = false;
  void loadAutomationStatus();
});

async function initializeAutomationMonitoring() {
  // El resultado persistido al abrir la aplicación es solo la línea base. No
  // corresponde a una ejecución recién terminada en esta sesión del frontend.
  await checkAutomationResult();
  await loadAutomationStatus();
  window.setInterval(checkAutomationResult, 2000);
  window.setInterval(loadAutomationStatus, 1500);
}

initializeAutomationMonitoring();
