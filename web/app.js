const actionLabel = document.querySelector("#credentials-action-label");
const finalActionToggle = document.querySelector("#final-action-toggle");
const finalActionLabel = document.querySelector("#final-action-label");
const finalActionStatus = document.querySelector("#final-action-status");
const resultDialog = document.querySelector("#automation-result-dialog");
const resultIdsElement = document.querySelector("#automation-result-ids");
const resultTimeElement = document.querySelector("#automation-result-time");
const copyResultButton = document.querySelector("#copy-result-ids");
const copyResultStatus = document.querySelector("#copy-result-status");
const closeResultButton = document.querySelector("#close-result-dialog");
const dismissResultButton = document.querySelector("#dismiss-result-dialog");
let latestRequestIds = [];
let presentedResultId;

function renderFinalAction(action) {
  const sendsEmail = action === "email";
  finalActionToggle.dataset.action = action;
  finalActionToggle.setAttribute("aria-pressed", String(sendsEmail));
  finalActionLabel.textContent = sendsEmail
    ? "Se enviará un correo al final"
    : "Se mostrarán los IDs en esta interfaz al final";
}

async function updateCredentialsAction() {
  try {
    const response = await fetch("/api/credentials/status", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json();
    actionLabel.textContent = result.configured
      ? "Editar credenciales"
      : "Configurar credenciales";
  } catch {
    actionLabel.textContent = "Configurar credenciales";
  }
}

updateCredentialsAction();

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
    finalActionToggle.disabled = false;
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
    finalActionToggle.disabled = false;
  }
});

loadFinalAction();

function closeResultDialog() {
  if (resultDialog.open) resultDialog.close();
}

function renderAutomationResult(result) {
  latestRequestIds = result.requestIds;
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
    copyResultStatus.textContent = "Los 14 Request ID se copiaron al portapapeles.";
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

checkAutomationResult();
window.setInterval(checkAutomationResult, 2000);
