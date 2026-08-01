const form = document.querySelector("#credentials-form");
const submitButton = document.querySelector("#save-button");
const resultElement = document.querySelector("#form-result");
const configuredMessage = document.querySelector("#configured-message");
const outlookForm = document.querySelector("#outlook-form");
const outlookSubmitButton = document.querySelector("#save-outlook-button");
const outlookTestButton = document.querySelector("#test-outlook-email-button");
const outlookResultElement = document.querySelector("#outlook-result");
const outlookConfiguredMessage = document.querySelector("#outlook-configured-message");
const credentialInputs = [
  form.elements.username,
  form.elements.password,
  form.elements.totpSecret,
];
let submitLabel = "Guardar y probar acceso";
let verifiedOutlookSender = "";
let outlookOperationInProgress = false;

function applyConfiguredState(configured) {
  configuredMessage.hidden = !configured;
  for (const input of credentialInputs) input.required = !configured;

  form.elements.username.placeholder = configured
    ? "Dejar vacío para conservar el usuario"
    : "Escribe tu usuario";
  form.elements.password.placeholder = configured
    ? "Dejar vacío para conservar la contraseña"
    : "Escribe tu contraseña";
  form.elements.totpSecret.placeholder = configured
    ? "Dejar vacío para conservar la clave"
    : "Clave Base32 de enrolamiento";
  submitLabel = configured ? "Guardar cambios y probar acceso" : "Guardar y probar acceso";
  submitButton.querySelector("span:first-child").textContent = submitLabel;
}

async function loadCredentialStatus() {
  try {
    const response = await fetch("/api/credentials/status", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json();
    applyConfiguredState(result.configured);
  } catch {
    applyConfiguredState(false);
  }
}

for (const button of document.querySelectorAll("[data-reveal]")) {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.reveal);
    const shouldReveal = input.type === "password";
    input.type = shouldReveal ? "text" : "password";
    button.textContent = shouldReveal ? "Ocultar" : "Mostrar";
    button.setAttribute("aria-label", `${shouldReveal ? "Ocultar" : "Mostrar"} ${
      input.id === "password" ? "contraseña" : "clave del Authenticator"
    }`);
  });
}

function showResult(type, message) {
  resultElement.hidden = false;
  resultElement.dataset.type = type;
  resultElement.textContent = message;
}

function showOutlookResult(type, message) {
  outlookResultElement.hidden = false;
  outlookResultElement.dataset.type = type;
  outlookResultElement.textContent = message;
}

function applyOutlookState(result) {
  verifiedOutlookSender = result.configured ? result.sender : "";
  outlookForm.elements.sender.value = result.sender ?? "";
  outlookConfiguredMessage.hidden = !result.configured;
  outlookTestButton.disabled = !result.configured || outlookOperationInProgress;
  outlookSubmitButton.querySelector("span:first-child").textContent = result.configured
    ? "Guardar cambios y verificar Outlook"
    : "Guardar y verificar Outlook";
}

function outlookInputMatchesVerified() {
  return Boolean(verifiedOutlookSender) &&
    outlookForm.elements.sender.value.trim().toLowerCase() ===
      verifiedOutlookSender.toLowerCase();
}

async function loadOutlookStatus() {
  try {
    const response = await fetch("/api/outlook/status", { cache: "no-store" });
    if (!response.ok) throw new Error("outlook status unavailable");
    applyOutlookState(await response.json());
  } catch {
    applyOutlookState({ configured: false, sender: "" });
    showOutlookResult("error", "No fue posible consultar la configuración de Outlook.");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  submitButton.disabled = true;
  submitButton.classList.add("is-loading");
  submitButton.querySelector("span:first-child").textContent = "Guardando y comprobando…";
  resultElement.hidden = true;

  const payload = {
    username: form.elements.username.value,
    password: form.elements.password.value,
    totpSecret: form.elements.totpSecret.value,
  };

  try {
    const response = await fetch("/api/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    showResult(
      result.verified ? "success" : result.configured ? "warning" : "error",
      result.message,
    );
    if (result.configured) applyConfiguredState(true);
    if (result.verified) {
      form.elements.password.value = "";
      form.elements.totpSecret.value = "";
    }
  } catch {
    showResult("error", "Se perdió la conexión con la interfaz local. Vuelva a intentarlo.");
  } finally {
    payload.password = "";
    payload.totpSecret = "";
    submitButton.disabled = false;
    submitButton.classList.remove("is-loading");
    submitButton.querySelector("span:first-child").textContent = submitLabel;
  }
});

outlookForm.elements.sender.addEventListener("input", () => {
  const stillVerified = outlookInputMatchesVerified();
  outlookTestButton.disabled = !stillVerified || outlookOperationInProgress;
  outlookConfiguredMessage.hidden = !stillVerified;
});

outlookForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!outlookForm.reportValidity() || outlookOperationInProgress) return;

  outlookOperationInProgress = true;
  outlookSubmitButton.disabled = true;
  outlookTestButton.disabled = true;
  outlookSubmitButton.querySelector("span:first-child").textContent = "Verificando Outlook…";
  outlookResultElement.hidden = true;

  try {
    const response = await fetch("/api/outlook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender: outlookForm.elements.sender.value }),
    });
    const result = await response.json();
    if (!response.ok) {
      const message = response.status === 404
        ? "La interfaz local todavía usa una versión anterior. Cierre la terminal de " +
          "INICIAR_INTERFAZ.cmd y vuelva a ejecutar el archivo."
        : result.message;
      showOutlookResult("error", message);
      return;
    }
    applyOutlookState(result);
    showOutlookResult("success", result.message);
  } catch {
    showOutlookResult("error", "Se perdió la conexión con la interfaz local. Vuelva a intentarlo.");
  } finally {
    outlookOperationInProgress = false;
    outlookSubmitButton.disabled = false;
    outlookTestButton.disabled = !outlookInputMatchesVerified();
    outlookSubmitButton.querySelector("span:first-child").textContent = verifiedOutlookSender
      ? "Guardar cambios y verificar Outlook"
      : "Guardar y verificar Outlook";
  }
});

outlookTestButton.addEventListener("click", async () => {
  if (outlookOperationInProgress || !verifiedOutlookSender) return;
  const confirmed = window.confirm(
    `Se enviará un correo de prueba a ${verifiedOutlookSender}. ¿Desea continuar?`,
  );
  if (!confirmed) return;

  outlookOperationInProgress = true;
  outlookSubmitButton.disabled = true;
  outlookTestButton.disabled = true;
  outlookTestButton.textContent = "Enviando prueba…";
  outlookResultElement.hidden = true;
  try {
    const response = await fetch("/api/outlook/test-email", { method: "POST" });
    const result = await response.json();
    showOutlookResult(response.ok ? "success" : "error", result.message);
  } catch {
    showOutlookResult("error", "No fue posible solicitar el correo de prueba.");
  } finally {
    outlookOperationInProgress = false;
    outlookSubmitButton.disabled = false;
    outlookTestButton.disabled = false;
    outlookTestButton.textContent = "Enviar correo de prueba";
  }
});

Promise.all([loadCredentialStatus(), loadOutlookStatus()]);
