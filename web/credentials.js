const form = document.querySelector("#credentials-form");
const submitButton = document.querySelector("#save-button");
const resultElement = document.querySelector("#form-result");
const configuredMessage = document.querySelector("#configured-message");
const credentialInputs = [
  form.elements.username,
  form.elements.password,
  form.elements.totpSecret,
];
let submitLabel = "Guardar y probar acceso";

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

loadCredentialStatus();
