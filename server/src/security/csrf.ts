import { createHash, timingSafeEqual } from "node:crypto";
import { systemRandom, type RandomSource } from "./dependencies.js";

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
