import type { NextFunction, Request, Response } from "express";
import { getPrisma } from "../prisma.js";
import { HttpError } from "../lib/httpError.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const REQUESTER_HEADER = "x-requester-id";

/**
 * Resolves the Lab 2 Development Requester from the X-Requester-Id header.
 *
 * This is a testing mechanism, not authentication — it trusts the header
 * completely. Issue 6 replaces the header resolution with authenticated
 * session resolution; Issue 4 still owns the mandatory-password gate so the
 * legacy route cannot bypass the first-login flow in the interim.
 *
 * The four failure cases are distinguished deliberately (api-spec.md §2):
 * a missing header is 401 because no identity was presented; a malformed one
 * is 400 because the request itself is malformed; an unknown id is 401 because
 * an identity was presented and could not be resolved; and an inactive
 * requester is 403 because identity resolved but is not permitted — the same
 * distinction a valid token for a deactivated account will need in Lab 3.
 */
export const requireRequester = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    if (req.auth) {
      if (req.auth.user.role !== "REQUESTER") {
        throw HttpError.unauthorized(
          "REQUESTER_NOT_FOUND",
          "The selected development requester no longer exists."
        );
      }

      const suppliedHeader = req.header(REQUESTER_HEADER)?.trim();
      if (suppliedHeader !== undefined && suppliedHeader !== String(req.auth.userId)) {
        throw HttpError.unauthorized(
          "REQUESTER_NOT_FOUND",
          "The selected development requester no longer exists."
        );
      }

      req.requester = {
        id: req.auth.user.id,
        fullName: req.auth.user.fullName,
        email: req.auth.user.email,
      };
      next();
      return;
    }

    const raw = req.header(REQUESTER_HEADER);

    if (raw === undefined || raw.trim() === "") {
      throw HttpError.unauthorized(
        "REQUESTER_HEADER_MISSING",
        "No development requester was selected."
      );
    }

    if (!/^[1-9]\d*$/.test(raw.trim())) {
      throw HttpError.badRequest(
        "REQUESTER_HEADER_INVALID",
        "The development requester identifier is not valid."
      );
    }

    const id = Number(raw.trim());
    const requester = await getPrisma().user.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        active: true,
        role: true,
        mustChangePassword: true,
      },
    });

    if (!requester) {
      throw HttpError.unauthorized(
        "REQUESTER_NOT_FOUND",
        "The selected development requester no longer exists."
      );
    }

    if (requester.role !== "REQUESTER") {
      throw HttpError.unauthorized(
        "REQUESTER_NOT_FOUND",
        "The selected development requester no longer exists."
      );
    }

    if (!requester.active) {
      throw HttpError.forbidden(
        "REQUESTER_INACTIVE",
        "The selected development requester is inactive."
      );
    }

    if (requester.mustChangePassword) {
      throw HttpError.forbidden(
        "PASSWORD_CHANGE_REQUIRED",
        "Change the Initial Password before using this feature."
      );
    }

    req.requester = {
      id: requester.id,
      fullName: requester.fullName,
      email: requester.email,
    };

    next();
  }
);
