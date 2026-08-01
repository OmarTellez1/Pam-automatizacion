const form = document.querySelector("#credentials-form");
const submitButton = document.querySelector("#save-button");
const resultElement = document.querySelector("#form-result");

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
    showResult(response.ok ? "success" : result.configured ? "warning" : "error", result.message);
    if (response.ok) {
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
    submitButton.querySelector("span:first-child").textContent = "Guardar y probar acceso";
  }
});
