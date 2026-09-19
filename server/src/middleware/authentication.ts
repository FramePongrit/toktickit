import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { readCookie } from "../security/cookie.js";
import type { SecurityConfig } from "../security/config.js";
import { JwtVerificationError, type JwtService } from "../security/jwt.js";
import type { ActiveSession, AuthSessionService } from "../security/session.js";

export interface AuthenticationDependencies {
  jwt: Pick<JwtService, "verify">;
  sessions: Pick<AuthSessionService, "findActive" | "verifyCsrf">;
  config?: SecurityConfig;
  allowPasswordChangeRequired?: boolean;
}

function unauthenticated(): HttpError {
  return HttpError.unauthorized("UNAUTHENTICATED", "Authentication is required.");
}

function resolveSessionContext(session: ActiveSession, claims: { sub: string; sid: string }) {
  const userId = Number(claims.sub);
  if (session.id !== claims.sid || session.userId !== userId) throw unauthenticated();
  return {
    sessionId: session.id,
    userId: session.userId,
    user: session.user,
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
  };
}

export function createAuthenticationMiddleware(dependencies: AuthenticationDependencies) {
  const cookieName = dependencies.config?.cookie.name ?? "toktickit_session";
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const token = readCookie(req.header("cookie"), cookieName);
    if (!token) throw unauthenticated();

    let claims;
    try {
      claims = dependencies.jwt.verify(token);
    } catch (error) {
      if (error instanceof JwtVerificationError) throw unauthenticated();
      throw unauthenticated();
    }

    const session = await dependencies.sessions.findActive(claims.sid);
    if (!session) throw unauthenticated();
    const auth = resolveSessionContext(session, claims);
    if (!auth.user.active) {
      throw HttpError.forbidden("USER_INACTIVE", "This User is inactive.");
    }
    if (auth.user.mustChangePassword && !dependencies.allowPasswordChangeRequired) {
      throw HttpError.forbidden(
        "PASSWORD_CHANGE_REQUIRED",
        "Change the Initial Password before using this feature."
      );
    }
    req.auth = auth;
    next();
  });
}

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function createCsrfMiddleware(dependencies: {
  sessions: Pick<AuthSessionService, "verifyCsrf">;
}) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!MUTATING_METHODS.has(req.method)) {
      next();
      return;
    }
    if (!req.auth?.sessionId) {
      throw HttpError.unauthorized("UNAUTHENTICATED", "Authentication is required.");
    }
    const token = req.header("x-csrf-token") ?? "";
    if (!(await dependencies.sessions.verifyCsrf(req.auth.sessionId, token))) {
      throw HttpError.forbidden("CSRF_INVALID", "The CSRF token is invalid.");
    }
    next();
  });
}

export const requireAuthentication = createAuthenticationMiddleware;
export const requireCsrf = createCsrfMiddleware;
