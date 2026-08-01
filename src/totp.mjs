import { createHmac } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function decodeBase32(value) {
  const normalized = String(value)
    .toUpperCase()
    .replace(/[\s=-]/g, "");

  if (!normalized || /[^A-Z2-7]/.test(normalized)) {
    throw new Error("La clave TOTP no tiene un formato Base32 válido.");
  }

  let bits = 0;
  let bitCount = 0;
  const bytes = [];

  for (const character of normalized) {
    bits = (bits << 5) | BASE32_ALPHABET.indexOf(character);
    bitCount += 5;

    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((bits >> bitCount) & 0xff);
      bits &= (1 << bitCount) - 1;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotp(secret, options = {}) {
  const {
    timestamp = Date.now(),
    periodSeconds = 30,
    digits = 6,
    algorithm = "sha1",
  } = options;

  const counter = BigInt(Math.floor(timestamp / 1000 / periodSeconds));
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);

  const digest = createHmac(algorithm, decodeBase32(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, "0");
}

export async function waitForSafeTotpWindow(options = {}) {
  const { periodSeconds = 30, minimumRemainingSeconds = 8 } = options;
  const elapsed = Math.floor(Date.now() / 1000) % periodSeconds;
  const remaining = periodSeconds - elapsed;

  if (remaining >= minimumRemainingSeconds) {
    return;
  }

  await new Promise((resolve) =>
    setTimeout(resolve, (remaining + 1) * 1000),
  );
}

