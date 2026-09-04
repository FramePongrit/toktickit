import type { NextFunction, Request, Response } from "express";
import { getPrisma } from "../prisma.js";
import { HttpError } from "../lib/httpError.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const REQUESTER_HEADER = "x-requester-id";

/**
 * Resolves the Lab 2 Development Requester from the X-Requester-Id header.
 *
 * This is a testing mechanism, not authentication — it trusts the header
 * completely. Lab 3 replaces the body of this function with token
 * verification; because every handler reads the identity from req.requester
 * rather than from the header, no handler changes then (BR-47).
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
    const requester = await getPrisma().requesterUser.findUnique({
      where: { id },
      select: { id: true, fullName: true, email: true, active: true },
    });

    if (!requester) {
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

    req.requester = {
      id: requester.id,
      fullName: requester.fullName,
      email: requester.email,
    };

    next();
  }
);
