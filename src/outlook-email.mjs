import { randomUUID } from "node:crypto";
import { normalizeRequestIds } from "./email-content.mjs";

const GRAPH_SEND_MAIL_URL = "https://graph.microsoft.com/v1.0/me/sendMail";

function sameStringSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

export function validateEmailAddress(value, fieldName = "correo") {
  const email = String(value ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`${fieldName} no contiene una dirección de correo válida.`);
  }
  return email;
}

export function normalizeCcRecipients(values) {
  if (values === undefined || values === null) return [];
  if (!Array.isArray(values)) {
    throw new Error("cc debe ser una lista de direcciones de correo.");
  }

  const recipients = values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .map((value, index) => validateEmailAddress(value, `cc[${index}]`));
  const unique = new Set(recipients.map((value) => value.toLowerCase()));
  if (unique.size !== recipients.length) {
    throw new Error("cc no puede contener direcciones duplicadas.");
  }
  return recipients;
}

export function extractValidatedRequestIds(result) {
  if (!result || typeof result !== "object") {
    throw new Error("El resultado de solicitudes no es un objeto válido.");
  }

  const requestIds = normalizeRequestIds(result.requestIds);
  if (!Array.isArray(result.pending) || result.pending.length !== requestIds.length) {
    throw new Error("El resultado debe contener exactamente 14 solicitudes Pending.");
  }
  if (result.pending.some((request) => request?.status !== "Pending")) {
    throw new Error("Todas las solicitudes utilizadas para el correo deben estar en estado Pending.");
  }

  const pendingIds = normalizeRequestIds(result.pending.map((request) => request?.id));
  if (!sameStringSet(requestIds, pendingIds)) {
    throw new Error("Los Request ID no coinciden con las solicitudes Pending.");
  }

  return requestIds;
}

export function buildGraphMailPayload({ recipient, subject, html }) {
  const address = validateEmailAddress(recipient, "recipient");
  const normalizedSubject = String(subject ?? "").trim();
  if (!normalizedSubject) throw new Error("El asunto del correo es obligatorio.");
  if (!String(html ?? "").trim()) throw new Error("El cuerpo HTML del correo es obligatorio.");

  return {
    message: {
      subject: normalizedSubject,
      body: {
        contentType: "HTML",
        content: html,
      },
      toRecipients: [
        {
          emailAddress: { address },
        },
      ],
    },
  };
}

export function wasAlreadySent(lastEmail, { recipient, subject, requestIds }) {
  if (!lastEmail || typeof lastEmail !== "object") return false;
  if (String(lastEmail.recipient).toLowerCase() !== String(recipient).toLowerCase()) return false;
  if (lastEmail.subject !== subject) return false;
  if (!Array.isArray(lastEmail.requestIds)) return false;
  return sameStringSet(lastEmail.requestIds.map(String), requestIds.map(String));
}

export async function sendGraphMail({ accessToken, payload, fetchImpl = fetch }) {
  if (!String(accessToken ?? "").trim()) throw new Error("Falta el token de acceso de Microsoft Graph.");
  const clientRequestId = randomUUID();
  const response = await fetchImpl(GRAPH_SEND_MAIL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "client-request-id": clientRequestId,
      "return-client-request-id": "true",
    },
    body: JSON.stringify(payload),
  });

  if (response.status !== 202) {
    const detail = (await response.text()).slice(0, 2_000);
    throw new Error(`Microsoft Graph rechazó el correo (${response.status}): ${detail}`);
  }

  return {
    clientRequestId,
    graphRequestId: response.headers.get("request-id") ?? undefined,
  };
}
