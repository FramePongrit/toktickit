import { randomUUID } from "node:crypto";
import path from "node:path";
import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/httpError.js";
import { UPLOAD_DIR, deleteFileIfPresent, ensureUploadDir, storedFilePath } from "../lib/paths.js";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ACTIVE_ATTACHMENTS = 5;

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

/**
 * Both the extension and the declared MIME type must be permitted. Neither is
 * authoritative on its own — the browser supplies the MIME type and a user can
 * rename a file — so requiring both raises the bar without pretending to be
 * content inspection, which is out of scope for Lab 2 (BR-29, D-11).
 */
export function isPermittedFile(originalName: string, mimeType: string): boolean {
  return (
    ALLOWED_EXTENSIONS.has(path.extname(originalName).toLowerCase()) &&
    ALLOWED_MIME_TYPES.has(mimeType)
  );
}

ensureUploadDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Never derive the stored name from the requester's filename: a name such
    // as "../../etc/passwd" would otherwise escape the upload directory.
    cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  },
});

export const uploadSingleAttachment = multer({
  storage,
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
}).single("file");

function isMultipartParserError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { message?: unknown; code?: unknown };
  if (typeof candidate.code === "string") return false;
  return typeof candidate.message === "string" && /multipart|boundary|form|part/i.test(candidate.message);
}

/** Normalizes Busboy's plain parser Errors without masking disk failures. */
export function parseSingleAttachment(req: Request, res: Response, next: NextFunction): void {
  uploadSingleAttachment(req, res, (error: unknown) => {
    if (isMultipartParserError(error)) {
      next(new HttpError(400, "VALIDATION_FAILED", "The submitted data is invalid."));
      return;
    }
    next(error);
  });
}

/**
 * Multer must parse before application guards so malformed multipart and
 * streaming size failures do not disclose route state. Disk storage can have
 * created a file by the time a later auth/role/ownership/service guard fails,
 * so the route-level error middleware removes it before the error is rendered.
 */
export function cleanupUploadedFileOnError(
  error: unknown,
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const filename = req.file?.filename;
  if (!filename) {
    next(error);
    return;
  }

  void deleteFileIfPresent(storedFilePath(filename)).finally(() => next(error));
}
