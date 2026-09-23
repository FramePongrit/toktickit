import { createCipheriv, createDecipheriv, createHash, timingSafeEqual } from "node:crypto";
import { systemRandom, type RandomSource } from "./dependencies.js";

const AES_ALGORITHM = "aes-256-gcm";
const AES_IV_BYTES = 12;

function encryptionKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function generateCsrfToken(random: RandomSource = systemRandom): string {
  return Buffer.from(random.bytes(32)).toString("base64url");
}

export function hashCsrfToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function verifyCsrfToken(token: string, expectedHash: string): boolean {
  if (!token || !expectedHash) return false;
  const actual = Buffer.from(hashCsrfToken(token), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * AuthSession persists only a hash for verification. The browser still needs
 * the original opaque value after a reload, so the value is encrypted at rest
 * with the server secret rather than stored or returned as plaintext.
 */
export function encryptCsrfToken(
  token: string,
  secret: string,
  random: RandomSource = systemRandom
): string {
  const iv = Buffer.from(random.bytes(AES_IV_BYTES));
  if (iv.length !== AES_IV_BYTES) throw new Error("CSRF encryption IV has an invalid length.");
  const cipher = createCipheriv(AES_ALGORITHM, encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptCsrfToken(encrypted: string, secret: string): string | null {
  try {
    const [ivEncoded, tagEncoded, ciphertextEncoded] = encrypted.split(".");
    if (!ivEncoded || !tagEncoded || !ciphertextEncoded) return null;
    const iv = Buffer.from(ivEncoded, "base64url");
    const tag = Buffer.from(tagEncoded, "base64url");
    const ciphertext = Buffer.from(ciphertextEncoded, "base64url");
    if (iv.length !== AES_IV_BYTES || tag.length !== 16) return null;
    const decipher = createDecipheriv(AES_ALGORITHM, encryptionKey(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
