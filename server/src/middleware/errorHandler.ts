import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError, type FieldIssue } from "../lib/httpError.js";

function zodIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "(body)",
    message: issue.message,
  }));
}

/**
 * The single place any failure becomes a response. Every non-2xx body in this
 * API has the shape { error: { code, message, details? } } because every one
 * of them passes through here.
 *
 * Must keep all four parameters: Express identifies error handlers by arity,
 * and dropping `next` would silently turn this into ordinary middleware that
 * never runs.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details && { details: err.details }) },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "The submitted data is invalid.",
        details: zodIssues(err),
      },
    });
    return;
  }

  // Anything reaching here is unexpected. Log it for the developer, but tell
  // the caller nothing beyond the fact that it failed (BR-27).
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
  });
}
