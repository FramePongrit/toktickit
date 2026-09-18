import type { CookieConfig } from "./cookie.js";

export interface SecurityConfig {
  jwtSecret: string;
  clientOrigin: string;
  cookie: CookieConfig;
  /** Header-only requester identity is permitted only in the Lab2 test app. */
  allowLegacyRequesterHeader: boolean;
}

const LOCAL_ENVIRONMENTS = new Set(["development", "test", "local"]);
const COOKIE_NAME_PATTERN = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;

function parseBoolean(name: string, value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false.`);
}

function validateClientOrigin(value: string | undefined): string {
  if (!value || value === "*") {
    throw new Error("CLIENT_ORIGIN must be an exact HTTP(S) origin.");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("CLIENT_ORIGIN must be an exact HTTP(S) origin.");
  }

  if (!/^https?:$/.test(parsed.protocol) || parsed.origin !== value) {
    throw new Error("CLIENT_ORIGIN must be an exact HTTP(S) origin without a path.");
  }
  return parsed.origin;
}

export function loadSecurityConfig(env: NodeJS.ProcessEnv = process.env): SecurityConfig {
  const jwtSecret = env.JWT_SECRET?.trim();
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long.");
  }

  // A missing NODE_ENV is treated as non-local. Local/test callers must opt in
  // explicitly, so an accidentally omitted deployment setting cannot produce
  // a non-Secure authentication cookie.
  const nodeEnv = env.NODE_ENV;
  const localDevelopment = nodeEnv !== undefined && LOCAL_ENVIRONMENTS.has(nodeEnv);
  const secure = parseBoolean("COOKIE_SECURE", env.COOKIE_SECURE, localDevelopment ? false : true);
  if (!localDevelopment && !secure) {
    throw new Error("COOKIE_SECURE must be true outside local development.");
  }

  const cookieName = env.AUTH_COOKIE_NAME ?? "toktickit_session";
  if (!COOKIE_NAME_PATTERN.test(cookieName)) {
    throw new Error("AUTH_COOKIE_NAME is not a valid cookie name.");
  }

  const sameSite = env.AUTH_COOKIE_SAMESITE ?? "Lax";
  if (sameSite !== "Lax") {
    throw new Error("AUTH_COOKIE_SAMESITE must be Lax.");
  }

  const path = env.AUTH_COOKIE_PATH ?? "/";
  if (path !== "/") {
    throw new Error("AUTH_COOKIE_PATH must be /." );
  }

  const maxAgeSeconds = Number(env.AUTH_COOKIE_MAX_AGE ?? 8 * 60 * 60);
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds !== 8 * 60 * 60) {
    throw new Error("AUTH_COOKIE_MAX_AGE must be 28800 seconds.");
  }

  return {
    jwtSecret,
    clientOrigin: validateClientOrigin(env.CLIENT_ORIGIN),
    allowLegacyRequesterHeader: false,
    cookie: {
      name: cookieName,
      httpOnly: true,
      sameSite: "Lax",
      secure,
      path: "/",
      maxAgeSeconds,
    },
  };
}

/**
 * The exported Express app is imported by Lab 1/Lab 2 tests without starting
 * the server. It therefore uses a clearly local-only test configuration when
 * startup environment variables are absent; index.ts always uses strict
 * startup validation through loadSecurityConfig().
 */
export function createDevelopmentSecurityConfig(): SecurityConfig {
  return {
    jwtSecret: "local-development-only-jwt-secret-change-me-32chars",
    clientOrigin: "http://localhost:5173",
    allowLegacyRequesterHeader: true,
    cookie: {
      name: "toktickit_session",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
      path: "/",
      maxAgeSeconds: 8 * 60 * 60,
    },
  };
}
