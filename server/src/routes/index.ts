import { Router } from "express";
import { relatedSystemsRouter } from "./relatedSystems.routes.js";
import { createTicketsRouter } from "./tickets.routes.js";
import { createAttachmentsRouter } from "./attachments.routes.js";
import { createAuthRouter, type AuthRouterDependencies } from "./auth.routes.js";
import { createStaffTicketsRouter } from "./staffTickets.routes.js";
import { createAuthenticationMiddleware, createCsrfMiddleware } from "../middleware/authentication.js";
import { requireRoles } from "../middleware/authorization.js";
import { HttpError } from "../lib/httpError.js";

export function createApiRouter(auth: AuthRouterDependencies): Router {
  const apiRouter = Router();
  apiRouter.use("/auth", createAuthRouter(auth));
  apiRouter.use("/related-systems", relatedSystemsRouter);
  const authentication = createAuthenticationMiddleware({
    jwt: auth.jwt,
    sessions: auth.sessions,
    config: auth.config,
  });
  const csrf = createCsrfMiddleware({ sessions: auth.sessions });
  apiRouter.use("/tickets", createTicketsRouter({ authentication, csrf }));
  apiRouter.use("/attachments", createAttachmentsRouter({ authentication, csrf }));
  apiRouter.use("/staff/tickets", createStaffTicketsRouter({ authentication, csrf }));

  // Feature routers for these namespaces arrive in later issues. Keep their
  // authorization boundary active now so a direct Requester call cannot turn
  // an unimplemented Staff/Admin path into an accidental public surface. A
  // later router is mounted before these deny-only fallbacks.
  apiRouter.use(
    "/staff",
    authentication,
    requireRoles("STAFF", "ADMIN"),
    (_req, _res, next) => next(HttpError.notFound("ROUTE_NOT_FOUND", "The requested resource does not exist."))
  );
  apiRouter.use(
    "/admin",
    authentication,
    requireRoles("ADMIN"),
    (_req, _res, next) => next(HttpError.notFound("ROUTE_NOT_FOUND", "The requested resource does not exist."))
  );
  return apiRouter;
}
