import { Router } from "express";
import { relatedSystemsRouter } from "./relatedSystems.routes.js";
import { requestersRouter } from "./requesters.routes.js";
import { ticketsRouter } from "./tickets.routes.js";
import { attachmentsRouter } from "./attachments.routes.js";
import { createAuthRouter, type AuthRouterDependencies } from "./auth.routes.js";
import { createOptionalAuthenticationMiddleware } from "../middleware/authentication.js";

export function createApiRouter(auth: AuthRouterDependencies): Router {
  const apiRouter = Router();
  apiRouter.use("/auth", createAuthRouter(auth));
  apiRouter.use("/related-systems", relatedSystemsRouter);
  apiRouter.use("/dev-requesters", requestersRouter);
  const optionalAuthentication = createOptionalAuthenticationMiddleware({
    jwt: auth.jwt,
    sessions: auth.sessions,
    config: auth.config,
  });
  apiRouter.use("/tickets", optionalAuthentication, ticketsRouter);
  apiRouter.use("/attachments", optionalAuthentication, attachmentsRouter);
  return apiRouter;
}
