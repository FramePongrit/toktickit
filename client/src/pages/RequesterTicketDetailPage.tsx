import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchTicket, indicateResolution, postPublicComment } from "../api/tickets.js";
import { AttachmentSection } from "../components/AttachmentSection.js";
import { PriorityBadge, StatusBadge } from "../components/Badges.js";
import { StateBlock } from "../components/StateBlock.js";
import { ApiError } from "../lib/http.js";
import type {
  AttachmentMeta,
  PublicComment,
  ResolutionIndication,
  Role,
  TicketDetail,
} from "../types/index.js";

const COMMENT_LIMIT = 2000;
const FINAL_STATUSES = new Set(["CLOSED", "CANCELLED"]);
const DIALOG_FOCUSABLE = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
].join(",");

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function roleLabel(role: Role): string {
  if (role === "REQUESTER") return "Requester";
  if (role === "STAFF") return "IT Staff";
  return "Administrator";
}

/** Read-only presentation of one ticket field (ui-spec §3). */
function ReadOnlyField({
  label,
  children,
  className = "col-12 col-md-6 col-lg-3",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`${className} mb-3`}>
      <span className="form-label fw-semibold d-block">{label}</span>
      <div className="zen-readonly">{children}</div>
    </div>
  );
}

function PublicCommentTimeline({ comments }: { comments: PublicComment[] }) {
  if (comments.length === 0) {
    return <p className="zen-muted mb-0">No public comments yet.</p>;
  }

  return (
    <ol className="zen-comment-timeline list-unstyled mb-0">
      {comments.map((comment) => (
        <li key={comment.id} className="zen-comment-item">
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
            <div>
              <span className="fw-semibold">{comment.author.fullName}</span>{" "}
              <span className="zen-badge zen-badge-medium">{roleLabel(comment.author.role)}</span>
            </div>
            <time className="zen-muted" dateTime={comment.createdAt}>
              {formatDateTime(comment.createdAt)}
            </time>
          </div>
          <p className="zen-comment-body mb-0 mt-2">{comment.body}</p>
        </li>
      ))}
    </ol>
  );
}

function ResolutionRecorded({ indication }: { indication: ResolutionIndication }) {
  return (
    <div className="zen-success" role="status">
      <p className="fw-semibold mb-1">Problem appears resolved has been recorded.</p>
      <p className="mb-0">
        This indication does not change the Ticket status. Recorded by {indication.indicatedBy.fullName} (
        {roleLabel(indication.indicatedBy.role)}) on {formatDateTime(indication.indicatedAt)}.
      </p>
    </div>
  );
}

export function RequesterTicketDetailPage() {
  const { id } = useParams();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [reload, setReload] = useState(0);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentSuccess, setCommentSuccess] = useState<string | null>(null);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [indicationError, setIndicationError] = useState<string | null>(null);
  const [indicating, setIndicating] = useState(false);
  const [confirmIndication, setConfirmIndication] = useState(false);
  const commentSubmissionGuard = useRef(false);
  const indicationGuard = useRef(false);
  const indicationTriggerRef = useRef<HTMLButtonElement>(null);
  const indicationDialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!confirmIndication) return;

    const dialog = indicationDialogRef.current;
    if (!dialog) return;

    const focusable = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE)).filter(
        (element) => element.getAttribute("tabindex") !== "-1"
      );
    const first = focusable()[0];
    first?.focus();

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setConfirmIndication(false);
        return;
      }
      if (event.key !== "Tab") return;

      const elements = focusable();
      if (elements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = elements[0];
      const lastElement = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    dialog.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      dialog.removeEventListener("keydown", handleDialogKeyDown);
      indicationTriggerRef.current?.focus();
    };
  }, [confirmIndication]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setCommentSuccess(null);
    setConfirmIndication(false);

    fetchTicket(Number(id))
      .then((loaded) => {
        if (cancelled) return;
        setTicket(loaded);
        setState("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setState(error instanceof ApiError && error.status === 404 ? "not-found" : "error");
      });

    return () => {
      cancelled = true;
    };
  }, [id, reload]);

  function updateAttachments(attachments: AttachmentMeta[]) {
    setTicket((current) => (current ? { ...current, attachments } : current));
  }

  async function handleCommentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ticket || commentSubmissionGuard.current) return;

    const trimmed = commentDraft.trim();
    if (!trimmed) {
      setCommentError("Enter a public comment before posting.");
      setCommentSuccess(null);
      return;
    }
    if (commentDraft.length > COMMENT_LIMIT) {
      setCommentError(`Public comments must be ${COMMENT_LIMIT.toLocaleString()} characters or fewer.`);
      setCommentSuccess(null);
      return;
    }

    commentSubmissionGuard.current = true;
    setCommentSubmitting(true);
    setCommentError(null);
    setCommentSuccess(null);
    try {
      const created = await postPublicComment(ticket.id, trimmed);
      setTicket((current) =>
        current
          ? { ...current, publicComments: [...(current.publicComments ?? []), created] }
          : current
      );
      setCommentDraft("");
      setCommentSuccess("Your public comment was posted.");
    } catch (error) {
      if (error instanceof ApiError && error.code === "TICKET_FINAL") {
        setCommentError("This Ticket is now closed or cancelled. Refreshing its read-only history.");
        setReload((value) => value + 1);
      } else {
        setCommentError("The public comment could not be posted. Please retry.");
      }
    } finally {
      commentSubmissionGuard.current = false;
      setCommentSubmitting(false);
    }
  }

  async function handleIndication() {
    if (!ticket || indicationGuard.current) return;

    indicationGuard.current = true;
    setIndicating(true);
    setIndicationError(null);
    let refreshAfterFailure = false;
    try {
      const indication = await indicateResolution(ticket.id);
      setTicket((current) => (current ? { ...current, resolutionIndication: indication } : current));
      setConfirmIndication(false);
    } catch (error) {
      if (error instanceof ApiError && error.code === "TICKET_FINAL") {
        setIndicationError("This Ticket is now closed or cancelled. Refreshing its read-only history.");
        refreshAfterFailure = true;
      } else if (
        error instanceof ApiError &&
        (error.code === "RESOLUTION_ALREADY_INDICATED" ||
          error.code === "RESOLUTION_INDICATION_NOT_ALLOWED")
      ) {
        setIndicationError("The indication is no longer available. Refreshing the current Ticket state.");
        refreshAfterFailure = true;
      } else {
        setIndicationError("The indication could not be recorded. Please retry.");
      }
      setConfirmIndication(false);
      if (refreshAfterFailure) setReload((value) => value + 1);
    } finally {
      indicationGuard.current = false;
      setIndicating(false);
    }
  }

  if (state === "loading") {
    return <StateBlock kind="loading" title="Loading ticket…" />;
  }

  if (state === "not-found") {
    return (
      <StateBlock
        kind="empty"
        title="Ticket not found"
        description="This ticket does not exist, or it belongs to a different requester."
        action={
          <Link className="btn btn-outline-primary" to="/tickets">
            Back to My Tickets
          </Link>
        }
      />
    );
  }

  if (state === "error" || !ticket) {
    return (
      <StateBlock
        kind="error"
        title="Could not load this ticket"
        description="The service did not respond. Please try again in a moment."
        action={
          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={() => setReload((value) => value + 1)}
          >
            Retry
          </button>
        }
      />
    );
  }

  const isFinal = FINAL_STATUSES.has(ticket.currentStatus);
  const isResolved = ticket.currentStatus === "RESOLVED";
  const comments = [...(ticket.publicComments ?? [])].sort((left, right) => {
    const byTime = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return byTime || left.id - right.id;
  });
  const itPriority = ticket.itPriority ?? ticket.requestedPriority;

  return (
    <div className="zen-ticket-detail">
      <nav aria-label="Breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0">
          <li className="breadcrumb-item">
            <Link to="/tickets">My Tickets</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            Ticket Details
          </li>
        </ol>
      </nav>

      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-4">
        <h1 className="h3 mb-0" data-page-heading tabIndex={-1}>{ticket.ticketNumber}</h1>
        <Link className="btn btn-outline-primary" to="/tickets">
          Back to My Tickets
        </Link>
      </div>

      {isFinal && (
        <div className="zen-warning-panel mb-4" role="status">
          <p className="fw-semibold mb-1">Closed/Cancelled tickets are read-only.</p>
          <p className="mb-0">
            History remains available, and active attachments can still be downloaded. New comments,
            indications, uploads, and removals are unavailable.
          </p>
        </div>
      )}

      <section className="zen-card p-3 p-md-4 mb-4" aria-label="Ticket information">
        <div className="row">
          <ReadOnlyField label="Ticket No.">{ticket.ticketNumber}</ReadOnlyField>
          <ReadOnlyField label="Ticket Date">{formatDateTime(ticket.createdAt)}</ReadOnlyField>
          <ReadOnlyField label="Category">{ticket.category.name}</ReadOnlyField>
          <ReadOnlyField label="Related System">{ticket.relatedSystem.name}</ReadOnlyField>

          <ReadOnlyField label="Requester">{ticket.requester.fullName}</ReadOnlyField>
          <ReadOnlyField label="Requested Priority">
            <span data-testid="requested-priority"><PriorityBadge priority={ticket.requestedPriority} /></span>
          </ReadOnlyField>
          <ReadOnlyField label="IT Priority">
            <span data-testid="it-priority"><PriorityBadge priority={itPriority} testId="it-priority-badge" /></span>
          </ReadOnlyField>
          <ReadOnlyField label="Current Status">
            <StatusBadge status={ticket.currentStatus} />
          </ReadOnlyField>

          <ReadOnlyField label="Ticket Summary" className="col-12">
            {ticket.summary}
          </ReadOnlyField>
          <ReadOnlyField label="Description" className="col-12">
            <span style={{ whiteSpace: "pre-wrap" }}>{ticket.description}</span>
          </ReadOnlyField>
        </div>
      </section>

      <section className="zen-card zen-communication-card p-3 p-md-4 mb-4" aria-labelledby="public-comments-heading">
        <div className="d-flex flex-column flex-sm-row justify-content-between gap-2 mb-1">
          <h2 className="h5 mb-0" id="public-comments-heading">Public comments</h2>
          <span className="zen-badge zen-badge-medium align-self-start">Visible to you and TokTickIT staff</span>
        </div>
        <p className="zen-muted mb-4">Messages are shared with the IT team and kept in chronological history.</p>

        <PublicCommentTimeline comments={comments} />

        {isFinal ? (
          <p className="zen-warning-panel mt-4 mb-0" role="status">
            Closed/Cancelled tickets are read-only. Historical public comments remain available.
          </p>
        ) : (
          <form className="mt-4" onSubmit={handleCommentSubmit} noValidate>
            <label className="form-label fw-semibold" htmlFor="public-comment">
              Add a public comment
            </label>
            <textarea
              id="public-comment"
              className={`form-control${commentError ? " is-invalid" : ""}`}
              value={commentDraft}
              maxLength={COMMENT_LIMIT}
              rows={4}
              aria-invalid={commentError ? "true" : "false"}
              aria-describedby="public-comment-hint public-comment-feedback"
              onChange={(event) => {
                setCommentDraft(event.target.value);
                setCommentError(null);
                setCommentSuccess(null);
              }}
              disabled={commentSubmitting}
            />
            <div id="public-comment-hint" className="zen-muted mt-1" style={{ fontSize: "0.875rem" }}>
              {Math.max(0, COMMENT_LIMIT - commentDraft.length).toLocaleString()} characters remaining (maximum {COMMENT_LIMIT.toLocaleString()}).
            </div>
            <div id="public-comment-feedback" aria-live="polite">
              {commentError && <p className="zen-field-error mb-2" role="alert">{commentError}</p>}
              {commentSuccess && <p className="zen-success mt-2 mb-2" role="status">{commentSuccess}</p>}
            </div>
            <button type="submit" className="btn btn-primary" disabled={commentSubmitting}>
              {commentSubmitting ? "Posting…" : "Post public comment"}
            </button>
          </form>
        )}
      </section>

      <section className="zen-card p-3 p-md-4 mb-4" aria-labelledby="resolution-heading">
        <h2 className="h5" id="resolution-heading">Resolution indication</h2>
        <p className="zen-muted">
          This is a signal to IT only. It does not formally resolve, close, or otherwise change the Ticket status.
        </p>
        {ticket.resolutionIndication ? (
          <ResolutionRecorded indication={ticket.resolutionIndication} />
        ) : isFinal ? (
          <p className="zen-warning-panel mb-0" role="status">Closed/Cancelled tickets are read-only.</p>
        ) : isResolved ? (
          <p className="zen-muted mb-0" role="status">This Ticket is already formally Resolved, so no indication is needed.</p>
        ) : (
          <>
            {indicationError && <p className="zen-field-error" role="alert">{indicationError}</p>}
            {!confirmIndication ? (
              <button
                ref={indicationTriggerRef}
                type="button"
                className="btn btn-outline-primary"
                onClick={() => setConfirmIndication(true)}
                disabled={indicating}
              >
                Problem appears resolved
              </button>
            ) : (
              <div
                ref={indicationDialogRef}
                className="zen-warning-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="indication-confirm-heading"
                tabIndex={-1}
              >
                <h3 className="h6" id="indication-confirm-heading">Confirm resolution indication</h3>
                <p>This tells IT the problem appears resolved. It does not close the Ticket or change its status.</p>
                <div className="d-flex flex-wrap justify-content-end gap-2">
                  <button type="button" className="btn btn-outline-primary" onClick={() => setConfirmIndication(false)} disabled={indicating}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => void handleIndication()} disabled={indicating}>
                    {indicating ? "Recording…" : "Confirm indication"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <AttachmentSection
        ticketId={ticket.id}
        attachments={ticket.attachments}
        onChanged={updateAttachments}
        readOnly={isFinal}
      />
    </div>
  );
}
