export function validateEmailAddress(value, fieldName = "correo") {
  const email = String(value ?? "").trim();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`${fieldName} no contiene una dirección de correo válida.`);
  }
  return email;
}
