import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import type { SessionUser } from "../security/session.js";

export type AllowedRole = SessionUser["role"];

/**
 * Route authorization is deliberately separate from authentication. The
 * authentication middleware proves the session and refreshes the User from
 * the database; these guards only decide whether that current User may use a
 * route. Keeping the two stages separate makes the 401/403 boundary explicit.
 */
export function requireRoles(...roles: AllowedRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(HttpError.unauthorized("UNAUTHENTICATED", "Authentication is required."));
      return;
    }

    if (!roles.includes(req.auth.user.role)) {
      next(HttpError.forbidden("FORBIDDEN", "You do not have permission to use this feature."));
      return;
    }

    next();
  };
}

/** Requester-only routes. Staff and Administrators receive a safe 403. */
export const requireRequesterRole = requireRoles("REQUESTER");

/** Administrator inherits every Staff Ticket operation. */
export const requireStaffRole = requireRoles("STAFF", "ADMIN");

/** Any authenticated role may read a resource shared by the API contract. */
export const requireAnyAuthenticatedRole = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      throw HttpError.unauthorized("UNAUTHENTICATED", "Authentication is required.");
    }
    next();
  }
);

export function currentUserId(req: Request): number {
  if (!req.auth) {
    throw HttpError.unauthorized("UNAUTHENTICATED", "Authentication is required.");
  }
  return req.auth.userId;
}
