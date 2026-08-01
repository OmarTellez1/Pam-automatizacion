const statusElement = document.querySelector("#credential-status");
const stateContainer = document.querySelector(".credential-state");

async function loadCredentialStatus() {
  try {
    const response = await fetch("/api/credentials/status", { cache: "no-store" });
    if (!response.ok) throw new Error("status unavailable");
    const result = await response.json();
    statusElement.textContent = result.configured
      ? "Credenciales configuradas en este equipo"
      : "Credenciales pendientes de configuración";
    stateContainer.dataset.configured = String(result.configured);
  } catch {
    statusElement.textContent = "No fue posible comprobar la configuración";
    stateContainer.dataset.configured = "error";
  }
}

loadCredentialStatus();
