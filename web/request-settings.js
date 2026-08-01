const form = document.querySelector("#request-settings-form");
const saveButton = document.querySelector("#save-request-settings");
const resultElement = document.querySelector("#request-settings-result");
const saveLabel = "Guardar configuración";

function applySettingsState(result) {
  const settings = result.settings;
  form.elements.startDate.value = settings.startDate ?? "";
  form.elements.startTime.value = settings.startTime ?? "";
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
    const response = await fetch("/api/request-settings", { cache: "no-store" });
    if (!response.ok) throw new Error("settings unavailable");
    applySettingsState(await response.json());
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
        startTime: form.elements.startTime.value,
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

loadSettings();
