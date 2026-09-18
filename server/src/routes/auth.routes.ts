import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { createAuthenticationMiddleware, createCsrfMiddleware } from "../middleware/authentication.js";
import { AuthService, validateCurrentPasswordShape } from "../services/auth.service.js";
import { serializeAuthCookie, serializeClearedAuthCookie } from "../security/cookie.js";
import type { SecurityConfig } from "../security/config.js";
import { JwtService } from "../security/jwt.js";
import { AuthSessionService } from "../security/session.js";
import { LoginThrottle } from "../security/throttle.js";

const loginSchema = z.object({
  email: z.string({ error: "Email is required." }).trim().toLowerCase().email("Email must be valid."),
  password: z.string({ error: "Password is required." }).trim().min(1, "Password is required."),
});

const changePasswordSchema = z.object({
  currentPassword: z.string({ error: "Current password is required." }),
  newPassword: z.string({ error: "New password is required." }),
  confirmation: z.string({ error: "Confirmation is required." }),
});

export interface AuthRouterDependencies {
  config: SecurityConfig;
  jwt: JwtService;
  sessions: AuthSessionService;
  throttle: LoginThrottle;
}

function noStore(res: { setHeader(name: string, value: string): unknown }) {
  res.setHeader("Cache-Control", "no-store");
}

export function createAuthRouter(dependencies: AuthRouterDependencies): Router {
  const router = Router();
  const authService = new AuthService(dependencies);
  const allowMandatoryChange = createAuthenticationMiddleware({
    jwt: dependencies.jwt,
    sessions: dependencies.sessions,
    config: dependencies.config,
    allowPasswordChangeRequired: true,
  });
  const csrf = createCsrfMiddleware({ sessions: dependencies.sessions });

  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const input = loginSchema.parse(req.body);
      const result = await authService.login(input.email, input.password);
      res.setHeader("Set-Cookie", serializeAuthCookie(result.jwt, dependencies.config.cookie));
      noStore(res);
      res.status(200).json({ user: result.user, csrfToken: result.session.csrfToken });
    })
  );

  router.get(
    "/me",
    allowMandatoryChange,
    asyncHandler(async (req, res) => {
      const csrfToken = await dependencies.sessions.getCsrfToken(req.auth!.sessionId);
      if (!csrfToken) throw HttpError.unauthorized("UNAUTHENTICATED", "Authentication is required.");
      noStore(res);
      res.status(200).json({ user: req.auth!.user, csrfToken });
    })
  );

  router.post(
    "/logout",
    allowMandatoryChange,
    csrf,
    asyncHandler(async (req, res) => {
      await dependencies.sessions.revokeOne(req.auth!.sessionId);
      res.setHeader("Set-Cookie", serializeClearedAuthCookie(dependencies.config.cookie));
      res.status(204).send();
    })
  );

  router.post(
    "/change-password",
    allowMandatoryChange,
    csrf,
    asyncHandler(async (req, res) => {
      const input = changePasswordSchema.parse(req.body);
      validateCurrentPasswordShape(input.currentPassword);
      const result = await authService.changePassword(
        req.auth!.userId,
        input.currentPassword,
        input.newPassword,
        input.confirmation
      );
      res.setHeader("Set-Cookie", serializeAuthCookie(result.jwt, dependencies.config.cookie));
      noStore(res);
      res.status(200).json({ user: result.user, csrfToken: result.session.csrfToken });
    })
  );

  return router;
}
