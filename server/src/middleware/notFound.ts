import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/httpError.js";

/**
 * Without this, an unknown path falls through to Express's default handler,
 * which replies with an HTML page rather than the JSON error shape every other
 * failure uses.
 */
export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(HttpError.notFound("ROUTE_NOT_FOUND", "The requested resource does not exist."));
}
