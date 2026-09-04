import { downloadFile, request } from "../lib/http.js";
import type { AttachmentMeta } from "../types/index.js";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ACTIVE_ATTACHMENTS = 5;

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/**
 * Mirrors the server rules so an obviously wrong file is rejected before it is
 * uploaded. The server checks again — this is convenience, not the gate.
 */
export function describeFileProblem(file: File): string | null {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(extension) || !ALLOWED_MIME_TYPES.includes(file.type)) {
    return "Only JPG, JPEG, PNG, WEBP and PDF files are accepted.";
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return "Each attachment must be 5 MB or smaller.";
  }
  return null;
}

export function uploadAttachment(ticketId: number, file: File): Promise<AttachmentMeta> {
  const body = new FormData();
  body.append("file", file);
  // Content-Type is deliberately not set: the browser must add the multipart
  // boundary itself, and setting it by hand corrupts the request.
  return request<AttachmentMeta>(`/api/tickets/${ticketId}/attachments`, { method: "POST", body });
}

export function removeAttachment(
  attachmentId: number,
  removalReason: string
): Promise<AttachmentMeta> {
  return request<AttachmentMeta>(`/api/attachments/${attachmentId}/remove`, {
    method: "PATCH",
    body: JSON.stringify({ removalReason }),
  });
}

/**
 * Fetches the bytes and hands them to the browser. A plain link cannot be used:
 * it could not carry the X-Requester-Id header across origins, so the download
 * would fail the ownership check (D-06).
 */
export function downloadAttachment(attachment: AttachmentMeta): Promise<void> {
  return downloadFile(
    `/api/attachments/${attachment.id}/download`,
    attachment.originalFilename
  );
}
