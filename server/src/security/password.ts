import bcrypt from "bcryptjs";
import { HttpError } from "../lib/httpError.js";

export const BCRYPT_COST = 12;

export interface PasswordValidation {
  valid: boolean;
  normalized: string;
  issues: string[];
}

export function validatePassword(password: string): PasswordValidation {
  const normalized = password.trim();
  const issues: string[] = [];

  if (normalized.length < 10 || normalized.length > 72) {
    issues.push("Password must be between 10 and 72 characters.");
  }
  if (!/\p{L}/u.test(normalized)) {
    issues.push("Password must contain at least one letter.");
  }
  if (!/\p{N}/u.test(normalized)) {
    issues.push("Password must contain at least one digit.");
  }

  return { valid: issues.length === 0, normalized, issues };
}

export function assertValidPassword(password: string, field = "password"): string {
  const result = validatePassword(password);
  if (!result.valid) {
    throw HttpError.validationFailed("The submitted password is invalid.", [
      { field, message: result.issues.join(" ") },
    ]);
  }
  return result.normalized;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(assertValidPassword(password), BCRYPT_COST);
}

export async function comparePassword(password: string, passwordHash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password.trim(), passwordHash);
  } catch {
    return false;
  }
}

export async function isPasswordReuse(password: string, currentHash: string): Promise<boolean> {
  return comparePassword(password, currentHash);
}
