export async function promptUntilValid(terminal, prompt, validate, report = console.log) {
  while (true) {
    const answer = String(await terminal.question(prompt)).trim();
    if (!answer) {
      report("La respuesta es obligatoria. Inténtelo nuevamente.");
      continue;
    }

    try {
      return validate(answer);
    } catch (error) {
      report(`Respuesta inválida: ${error.message}`);
    }
  }
}

export function parseYesNo(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "S") return true;
  if (normalized === "N") return false;
  throw new Error("Responda S para Sí o N para No.");
}
