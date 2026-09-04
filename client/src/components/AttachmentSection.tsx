import { useRef, useState } from "react";
import {
  MAX_ACTIVE_ATTACHMENTS,
  describeFileProblem,
  downloadAttachment,
  removeAttachment,
  uploadAttachment,
} from "../api/attachments.js";
import { ApiError } from "../lib/http.js";
import type { AttachmentMeta } from "../types/index.js";

interface AttachmentSectionProps {
  ticketId: number;
  attachments: AttachmentMeta[];
  onChanged: (attachments: AttachmentMeta[]) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function AttachmentSection({ ticketId, attachments, onChanged }: AttachmentSectionProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [removingId, setRemovingId] = useState<number | null>(null);
  const [removalReason, setRemovalReason] = useState("");
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [removalPending, setRemovalPending] = useState(false);

  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Removed attachments do not occupy a slot (BR-31).
  const activeCount = attachments.filter((a) => !a.isRemoved).length;
  const limitReached = activeCount >= MAX_ACTIVE_ATTACHMENTS;

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setDownloadError(null);

    const problem = describeFileProblem(file);
    if (problem) {
      setUploadError(problem);
      event.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const created = await uploadAttachment(ticketId, file);
      onChanged([...attachments, created]);
    } catch (error) {
      setUploadError(
        error instanceof ApiError
          ? error.message
          : "The attachment could not be uploaded. Please try again."
      );
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function handleDownload(attachment: AttachmentMeta) {
    setDownloadError(null);
    try {
      await downloadAttachment(attachment);
    } catch (error) {
      setDownloadError(
        error instanceof ApiError
          ? error.message
          : "The attachment could not be downloaded. Please try again."
      );
    }
  }

  function openRemoveDialog(attachment: AttachmentMeta) {
    setRemovingId(attachment.id);
    setRemovalReason("");
    setRemovalError(null);
  }

  async function confirmRemoval() {
    if (removingId === null) return;

    setRemovalPending(true);
    setRemovalError(null);
    try {
      const updated = await removeAttachment(removingId, removalReason.trim());
      onChanged(attachments.map((a) => (a.id === updated.id ? updated : a)));
      setRemovingId(null);
    } catch (error) {
      setRemovalError(
        error instanceof ApiError
          ? error.message
          : "The attachment could not be removed. Please try again."
      );
    } finally {
      setRemovalPending(false);
    }
  }

  const reasonValid = removalReason.trim().length >= 3 && removalReason.trim().length <= 200;

  return (
    <section className="zen-card p-3 p-md-4" aria-labelledby="attachments-heading">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h2 className="h6 mb-0" id="attachments-heading">
          Attachments ({activeCount} active of {MAX_ACTIVE_ATTACHMENTS})
        </h2>

        <div>
          <label className="btn btn-outline-primary mb-0" htmlFor="attachment-input">
            {uploading ? "Uploading…" : "Add attachment"}
          </label>
          <input
            id="attachment-input"
            ref={fileInput}
            type="file"
            className="visually-hidden"
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            disabled={uploading || limitReached}
            onChange={handleFile}
          />
        </div>
      </div>

      {limitReached && (
        <p className="zen-warning-panel mb-3" role="status">
          This ticket already has {MAX_ACTIVE_ATTACHMENTS} active attachments. Remove one before
          adding another.
        </p>
      )}

      {uploadError && (
        <p className="zen-field-error mb-3" role="alert">
          {uploadError}
        </p>
      )}

      {downloadError && (
        <p className="zen-field-error mb-3" role="alert">
          {downloadError}
        </p>
      )}

      {attachments.length === 0 ? (
        <p className="zen-muted mb-0">No attachments on this ticket.</p>
      ) : (
        <ul className="list-unstyled mb-0">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="d-flex flex-column flex-md-row justify-content-between gap-2 py-3 border-top"
              data-testid={`attachment-${attachment.id}`}
            >
              <div className={attachment.isRemoved ? "zen-muted" : ""}>
                <p className="mb-1">
                  <span className="fw-semibold text-break">{attachment.originalFilename}</span>
                  {attachment.isRemoved && (
                    <span className="zen-badge zen-badge-low ms-2">Removed</span>
                  )}
                </p>
                <p className="mb-0" style={{ fontSize: "0.875rem" }}>
                  {formatSize(attachment.sizeBytes)} · {attachment.mimeType} · uploaded{" "}
                  {formatDateTime(attachment.uploadedAt)}
                </p>
                {attachment.isRemoved && (
                  <p className="mb-0" style={{ fontSize: "0.875rem" }}>
                    Removed {attachment.removedAt ? formatDateTime(attachment.removedAt) : ""} —{" "}
                    {attachment.removalReason}
                  </p>
                )}
              </div>

              {/* A removed attachment keeps its metadata but offers no way to
                  reach its content: no download, no preview (BR-33). */}
              {!attachment.isRemoved && (
                <div className="d-flex gap-2 align-items-start">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => handleDownload(attachment)}
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => openRemoveDialog(attachment)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {removingId !== null && (
        <div
          className="zen-card p-3 mt-3"
          role="dialog"
          aria-modal="true"
          aria-labelledby="removal-heading"
        >
          <h3 className="h6" id="removal-heading">
            Remove attachment
          </h3>
          <p className="zen-muted" style={{ fontSize: "0.875rem" }}>
            The file stays on record as removed, with your reason, and can no longer be downloaded.
          </p>

          <label className="form-label fw-semibold" htmlFor="removal-reason">
            Removal reason
            <span className="zen-required" aria-hidden="true">
              *
            </span>
            <span className="visually-hidden">(required)</span>
          </label>
          <input
            id="removal-reason"
            type="text"
            className="form-control"
            value={removalReason}
            maxLength={200}
            onChange={(e) => setRemovalReason(e.target.value)}
          />
          <p className="zen-muted mb-2" style={{ fontSize: "0.875rem" }}>
            Between 3 and 200 characters.
          </p>

          {removalError && (
            <p className="zen-field-error" role="alert">
              {removalError}
            </p>
          )}

          <div className="d-flex justify-content-end gap-2">
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={() => setRemovingId(null)}
              disabled={removalPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-outline-danger"
              // Stays disabled until the reason is valid, so the requester is
              // not sent to the server only to be told the same thing (BR-34).
              disabled={!reasonValid || removalPending}
              onClick={confirmRemoval}
            >
              {removalPending ? "Removing…" : "Confirm removal"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
