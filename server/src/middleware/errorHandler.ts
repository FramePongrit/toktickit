import type { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { ZodError } from "zod";
import { HttpError, type FieldIssue } from "../lib/httpError.js";
import { MAX_ATTACHMENT_BYTES } from "./upload.js";

function zodIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "(body)",
    // Zod's strict-object error includes every unknown key in its message.
    // Do not echo secret-shaped client field names such as `passwordHash`.
    message: issue.code === "unrecognized_keys"
      ? "The submitted data contains an unsupported field."
      : issue.message,
  }));
}

function isJsonParseError(error: unknown): boolean {
  if (!(error instanceof SyntaxError)) return false;
  const candidate = error as SyntaxError & { type?: string; status?: number };
  return candidate.type === "entity.parse.failed" || candidate.status === 400;
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
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
        ...(err.meta && { meta: err.meta }),
      },
    });
    return;
  }

  // Multer signals its own limits with a MulterError rather than an HttpError,
  // so without this mapping an oversized upload would surface as a 500.
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        error: {
          code: "FILE_TOO_LARGE",
          message: `Each attachment must be ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB or smaller.`,
        },
      });
      return;
    }
    res.status(400).json({
      error: { code: "VALIDATION_FAILED", message: "The submitted data is invalid." },
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

  // express.json() reports malformed JSON as a SyntaxError before the route
  // middleware runs. Keep it a transport-level, generic validation failure so
  // it cannot reveal authentication, role, ownership, or Ticket state.
  if (isJsonParseError(err)) {
    res.status(400).json({
      error: { code: "VALIDATION_FAILED", message: "The submitted data is invalid." },
    });
    return;
  }

  // Anything reaching here is unexpected. Keep internal exception details out
  // of both the response and the default log line; callers and log consumers
  // must not receive SQL, paths, hashes, tokens, or stack traces (BR-25).
  console.error("Unhandled error");
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
  });
}
