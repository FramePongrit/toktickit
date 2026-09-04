import { randomUUID } from "node:crypto";
import path from "node:path";
import multer from "multer";
import { HttpError } from "../lib/httpError.js";
import { UPLOAD_DIR, ensureUploadDir } from "../lib/paths.js";

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
  fileFilter: (_req, file, cb) => {
    if (!isPermittedFile(file.originalname, file.mimetype)) {
      // Rejecting here means the file is never written, so a wrong type leaves
      // no orphan to clean up.
      cb(
        new HttpError(
          415,
          "UNSUPPORTED_FILE_TYPE",
          "Only JPG, JPEG, PNG, WEBP and PDF files are accepted."
        )
      );
      return;
    }
    cb(null, true);
  },
}).single("file");
