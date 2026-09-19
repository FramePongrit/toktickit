import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  claimStaffTicket,
  fetchStaffTicket,
  fetchTicketOwners,
  postInternalNote,
  postStaffPublicComment,
  reassignStaffTicket,
  updateStaffItPriority,
  updateStaffTicketStatus,
} from "../api/tickets.js";
import { AttachmentSection } from "../components/AttachmentSection.js";
import { PriorityBadge, StatusBadge } from "../components/Badges.js";
import { StateBlock } from "../components/StateBlock.js";
import { roleLabel } from "../context/AuthContext.js";
import { ApiError } from "../lib/http.js";
import type {
  InternalNote,
  Priority,
  PublicComment,
  Role,
  TicketDetail,
  TicketOwnerOption,
  TicketStatus,
} from "../types/index.js";

const MESSAGE_LIMIT = 2000;
const FINAL_STATUSES = new Set<TicketStatus>(["CLOSED", "CANCELLED"]);
const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const CONFIRM_STATUSES = new Set<TicketStatus>(["RESOLVED", "CLOSED", "CANCELLED", "REOPENED"]);
const FOCUSABLE = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
].join(",");

type LoadState = "loading" | "ready" | "not-found" | "error";
type DirectoryState = "idle" | "loading" | "ready" | "forbidden" | "error";

interface ActionFeedback {
  busy: boolean;
  error: string | null;
  success: string | null;
}

const idleFeedback = (): ActionFeedback => ({ busy: false, error: null, success: null });

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

function sorted<T extends { id: number; createdAt: string }>(items: T[] | undefined): T[] {
  return [...(items ?? [])].sort((left, right) => {
    const byTime = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return byTime || left.id - right.id;
  });
}

function safeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.status >= 400 && error.status < 500
    ? error.message
    : fallback;
}

function ReadOnlyField({
  label,
  children,
  className = "col-12 col-md-6 col-xl-3",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`${className} mb-3`}>
      <span className="form-label fw-semibold d-block">{label}</span>
      <div className="zen-readonly text-break">{children}</div>
    </div>
  );
}

function ActionFeedback({ feedback, testId }: { feedback: ActionFeedback; testId: string }) {
  if (!feedback.error && !feedback.success) return null;
  return (
    <div className="mt-2" data-testid={testId} aria-live="polite">
      {feedback.error && <p className="zen-field-error mb-2" role="alert">{feedback.error}</p>}
      {feedback.success && <p className="zen-success mb-2" role="status">{feedback.success}</p>}
    </div>
  );
}

function PublicTimeline({ comments }: { comments: PublicComment[] }) {
  if (comments.length === 0) return <p className="zen-muted mb-0">No public comments yet.</p>;
  return (
    <ol className="zen-comment-timeline list-unstyled mb-0">
      {comments.map((comment) => (
        <li className="zen-comment-item" key={comment.id}>
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
            <div>
              <span className="fw-semibold">{comment.author.fullName}</span>{" "}
              <span className="zen-badge zen-badge-medium">{roleLabel(comment.author.role)}</span>
            </div>
            <time className="zen-muted" dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
          </div>
          <p className="zen-comment-body mb-0 mt-2">{comment.body}</p>
        </li>
      ))}
    </ol>
  );
}

function InternalTimeline({ notes }: { notes: InternalNote[] }) {
  if (notes.length === 0) return <p className="zen-muted mb-0">No internal notes yet.</p>;
  return (
    <ol className="zen-comment-timeline list-unstyled mb-0">
      {notes.map((note) => (
        <li className="zen-comment-item" key={note.id}>
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
            <div>
              <span className="fw-semibold">{note.author.fullName}</span>{" "}
              <span className="zen-badge zen-badge-high">{roleLabel(note.author.role)}</span>
            </div>
            <time className="zen-muted" dateTime={note.createdAt}>{formatDateTime(note.createdAt)}</time>
          </div>
          <p className="zen-comment-body mb-0 mt-2">{note.body}</p>
        </li>
      ))}
    </ol>
  );
}

function ConfirmationDialog({
  status,
  busy,
  onCancel,
  onConfirm,
}: {
  status: TicketStatus;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const first = dialog.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    dialog.addEventListener("keydown", onKeyDown);
    return () => dialog.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      ref={dialogRef}
      className="staff-detail-dialog zen-warning-panel mt-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-confirm-heading"
      tabIndex={-1}
    >
      <h3 className="h6" id="status-confirm-heading">Confirm {titleCase(status)} status</h3>
      <p className="mb-3">
        {status === "CLOSED"
          ? "Closing this Ticket is final. Closed Tickets are read-only and cannot be reopened."
          : `Update this Ticket to ${titleCase(status)}?`}
      </p>
      <div className="d-flex flex-wrap justify-content-end gap-2">
        <button ref={cancelRef} type="button" className="btn btn-outline-primary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>
          {busy ? "Updating…" : `Confirm ${titleCase(status)}`}
        </button>
      </div>
    </div>
  );
}

function ownerText(owner: TicketOwnerOption | null | undefined): React.ReactNode {
  if (!owner) return <span className="zen-muted">Unassigned</span>;
  return <>{owner.fullName} <span className="zen-muted">({roleLabel(owner.role)})</span></>;
}

export function StaffTicketDetailPage() {
  const { id } = useParams();
  const ticketId = Number(id);
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [reload, setReload] = useState(0);

  const [claimFeedback, setClaimFeedback] = useState<ActionFeedback>(idleFeedback());
  const [ownerFeedback, setOwnerFeedback] = useState<ActionFeedback>(idleFeedback());
  const [priorityFeedback, setPriorityFeedback] = useState<ActionFeedback>(idleFeedback());
  const [statusFeedback, setStatusFeedback] = useState<ActionFeedback>(idleFeedback());
  const [publicFeedback, setPublicFeedback] = useState<ActionFeedback>(idleFeedback());
  const [noteFeedback, setNoteFeedback] = useState<ActionFeedback>(idleFeedback());

  const [priorityDraft, setPriorityDraft] = useState<Priority>("MEDIUM");
  const [statusDraft, setStatusDraft] = useState<TicketStatus | "">("");
  const [waitingComment, setWaitingComment] = useState("");
  const [publicDraft, setPublicDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [statusDialog, setStatusDialog] = useState<TicketStatus | null>(null);
  const statusTriggerRef = useRef<HTMLButtonElement | null>(null);

  const [ownerDialog, setOwnerDialog] = useState(false);
  const [owners, setOwners] = useState<TicketOwnerOption[]>([]);
  const [ownerDirectoryState, setOwnerDirectoryState] = useState<DirectoryState>("idle");
  const [ownerDirectoryError, setOwnerDirectoryError] = useState<string | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [expectedOwnerId, setExpectedOwnerId] = useState<number | null>(null);
  const ownerTriggerRef = useRef<HTMLButtonElement>(null);
  const ownerDialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    fetchStaffTicket(ticketId)
      .then((loaded) => {
        if (cancelled) return;
        setTicket(loaded);
        setPriorityDraft(loaded.itPriority ?? loaded.requestedPriority);
        setStatusDraft("");
        setWaitingComment("");
        setLoadState("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadState(error instanceof ApiError && error.status === 404 ? "not-found" : "error");
      });
    return () => { cancelled = true; };
  }, [ticketId, reload]);

  useEffect(() => {
    if (!statusDialog) return;
    return () => statusTriggerRef.current?.focus();
  }, [statusDialog]);

  useEffect(() => {
    if (!ownerDialog) return;
    const dialog = ownerDialogRef.current;
    if (!dialog) return;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusable()[0];
    first?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOwnerDialog(false);
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
    };
    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      ownerTriggerRef.current?.focus();
    };
  }, [ownerDialog, ownerDirectoryState]);

  function finalError(setter: (value: ActionFeedback) => void) {
    setter({ busy: false, success: null, error: "This Ticket is now Closed/Cancelled. Refreshing its read-only detail." });
    setReload((value) => value + 1);
  }

  async function handleClaim() {
    if (!ticket) return;
    setClaimFeedback({ busy: true, error: null, success: null });
    try {
      await claimStaffTicket(ticket.id);
      setClaimFeedback({ busy: false, error: null, success: "Ticket claimed successfully. Refreshing owner details." });
      setReload((value) => value + 1);
    } catch (error) {
      if (error instanceof ApiError && error.code === "TICKET_FINAL") finalError(setClaimFeedback);
      else if (error instanceof ApiError && error.code === "TICKET_ALREADY_ASSIGNED") {
        setClaimFeedback({ busy: false, success: null, error: "This Ticket is already assigned. Review the current Owner before retrying." });
        setReload((value) => value + 1);
      } else {
        setClaimFeedback({ busy: false, success: null, error: safeErrorMessage(error, "The Ticket could not be claimed. Please retry.") });
      }
    }
  }

  async function loadOwners() {
    setOwnerDirectoryState("loading");
    setOwnerDirectoryError(null);
    try {
      setOwners(await fetchTicketOwners());
      setOwnerDirectoryState("ready");
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setOwnerDirectoryState("forbidden");
        setOwnerDirectoryError("Eligible Owner choices are unavailable for this account.");
      } else {
        setOwnerDirectoryState("error");
        setOwnerDirectoryError("Eligible Owner choices could not be loaded. Please retry.");
      }
    }
  }

  function openOwnerDialog() {
    if (!ticket?.owner || FINAL_STATUSES.has(ticket.currentStatus)) return;
    setExpectedOwnerId(ticket.owner.id);
    setSelectedOwnerId("");
    setOwnerFeedback(idleFeedback());
    setOwnerDialog(true);
    void loadOwners();
  }

  function closeOwnerDialog() {
    if (ownerFeedback.busy) return;
    setOwnerDialog(false);
    ownerTriggerRef.current?.focus();
  }

  async function handleReassign() {
    if (!ticket || expectedOwnerId === null) return;
    const ownerId = Number(selectedOwnerId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      setOwnerFeedback({ busy: false, error: "Select an active IT Staff member or Administrator.", success: null });
      return;
    }
    setOwnerFeedback({ busy: true, error: null, success: null });
    try {
      await reassignStaffTicket(ticket.id, ownerId, expectedOwnerId);
      setOwnerDialog(false);
      setOwnerFeedback({ busy: false, error: null, success: "Owner changed successfully. Refreshing Ticket detail." });
      setReload((value) => value + 1);
    } catch (error) {
      if (error instanceof ApiError && error.code === "TICKET_FINAL") {
        setOwnerDialog(false);
        finalError(setOwnerFeedback);
      } else if (error instanceof ApiError && error.code === "TICKET_OWNER_CHANGED") {
        setOwnerDialog(false);
        setOwnerFeedback({ busy: false, error: "Ticket ownership changed. Review the refreshed Owner and explicitly retry Reassign.", success: null });
        setReload((value) => value + 1);
      } else if (error instanceof ApiError && error.code === "OWNER_NOT_ELIGIBLE") {
        setOwnerFeedback({ busy: false, error: "Select an active IT Staff member or Administrator.", success: null });
        void loadOwners();
      } else {
        setOwnerFeedback({ busy: false, error: safeErrorMessage(error, "The Owner could not be changed. Please retry."), success: null });
      }
    }
  }

  async function handlePrioritySave() {
    if (!ticket) return;
    setPriorityFeedback({ busy: true, error: null, success: null });
    try {
      const result = await updateStaffItPriority(ticket.id, priorityDraft);
      setTicket((current) => current ? { ...current, itPriority: result.itPriority } : current);
      setPriorityFeedback({ busy: false, error: null, success: "IT Priority saved." });
    } catch (error) {
      if (error instanceof ApiError && error.code === "TICKET_FINAL") finalError(setPriorityFeedback);
      else setPriorityFeedback({ busy: false, error: safeErrorMessage(error, "IT Priority could not be saved. Please retry."), success: null });
    }
  }

  async function performStatus(status: TicketStatus) {
    if (!ticket) return;
    setStatusFeedback({ busy: true, error: null, success: null });
    try {
      const result = await updateStaffTicketStatus(
        ticket.id,
        status,
        status === "WAITING_FOR_REQUESTER" ? waitingComment.trim() : undefined
      );
      setStatusDialog(null);
      setStatusDraft("");
      setWaitingComment("");
      setStatusFeedback({ busy: false, error: null, success: `Ticket status updated to ${titleCase(status)}.` });
      setReload((value) => value + 1);
      setTicket((current) => current ? {
        ...current,
        currentStatus: result.currentStatus,
        resolutionIndication: result.resolutionIndication,
        allowedTransitions: result.allowedTransitions,
      } : current);
    } catch (error) {
      if (error instanceof ApiError && error.code === "TICKET_FINAL") {
        setStatusDialog(null);
        finalError(setStatusFeedback);
      } else if (error instanceof ApiError && error.code === "TICKET_OWNER_REQUIRED") {
        setStatusFeedback({ busy: false, error: "Assign an active IT Staff member or Administrator with Claim/Reassign before updating status.", success: null });
      } else if (error instanceof ApiError && error.code === "VALIDATION_FAILED" && status === "WAITING_FOR_REQUESTER") {
        setStatusFeedback({ busy: false, error: "Enter a Public Comment when waiting for the Requester.", success: null });
      } else {
        setStatusFeedback({ busy: false, error: safeErrorMessage(error, "The status could not be updated. Please retry."), success: null });
      }
    }
  }

  function submitStatus(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!statusDraft) {
      setStatusFeedback({ busy: false, error: "Select a permitted next status.", success: null });
      return;
    }
    setStatusFeedback(idleFeedback());
    if (CONFIRM_STATUSES.has(statusDraft)) {
      statusTriggerRef.current = document.activeElement as HTMLButtonElement;
      setStatusDialog(statusDraft);
    } else {
      void performStatus(statusDraft);
    }
  }

  async function submitPublic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ticket) return;
    const body = publicDraft.trim();
    const localValidationMessage = !body
      ? "Enter a Public Comment before posting."
      : publicDraft.length > MESSAGE_LIMIT
        ? `Public Comments must be ${MESSAGE_LIMIT.toLocaleString()} characters or fewer.`
        : null;
    setPublicFeedback({ busy: true, error: null, success: null });
    try {
      const created = await postStaffPublicComment(ticket.id, body);
      if (localValidationMessage) {
        setPublicFeedback({ busy: false, error: localValidationMessage, success: null });
        return;
      }
      setTicket((current) => current ? { ...current, publicComments: [...(current.publicComments ?? []), created] } : current);
      setPublicDraft("");
      setPublicFeedback({ busy: false, error: null, success: "Public Comment posted." });
    } catch (error) {
      if (error instanceof ApiError && error.code === "TICKET_FINAL") finalError(setPublicFeedback);
      else setPublicFeedback({ busy: false, error: localValidationMessage ?? safeErrorMessage(error, "The Public Comment could not be posted. Please retry."), success: null });
    }
  }

  async function submitNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ticket) return;
    const body = noteDraft.trim();
    const localValidationMessage = !body
      ? "Enter an Internal Note before posting."
      : noteDraft.length > MESSAGE_LIMIT
        ? `Internal Notes must be ${MESSAGE_LIMIT.toLocaleString()} characters or fewer.`
        : null;
    setNoteFeedback({ busy: true, error: null, success: null });
    try {
      const created = await postInternalNote(ticket.id, body);
      if (localValidationMessage) {
        setNoteFeedback({ busy: false, error: localValidationMessage, success: null });
        return;
      }
      setTicket((current) => current ? { ...current, internalNotes: [...(current.internalNotes ?? []), created] } : current);
      setNoteDraft("");
      setNoteFeedback({ busy: false, error: null, success: "Internal Note saved." });
    } catch (error) {
      if (error instanceof ApiError && error.code === "TICKET_FINAL") finalError(setNoteFeedback);
      else setNoteFeedback({ busy: false, error: localValidationMessage ?? safeErrorMessage(error, "The Internal Note could not be saved. Please retry."), success: null });
    }
  }

  if (loadState === "loading") return <StateBlock kind="loading" title="Loading Staff Ticket Detail…" />;
  if (loadState === "not-found") {
    return <StateBlock kind="empty" title="Ticket not found" description="The requested Ticket does not exist." action={<Link className="btn btn-outline-primary" to="/staff/tickets">Back to Staff Queue</Link>} />;
  }
  if (loadState === "error" || !ticket) {
    return <StateBlock kind="error" title="Could not load Staff Ticket Detail" description="The service did not respond. Please retry." action={<button type="button" className="btn btn-outline-primary" onClick={() => setReload((value) => value + 1)}>Retry</button>} />;
  }

  const isFinal = FINAL_STATUSES.has(ticket.currentStatus);
  const allowedTransitions = ticket.allowedTransitions ?? [];
  const comments = sorted(ticket.publicComments);
  const notes = sorted(ticket.internalNotes);

  return (
    <div className="staff-ticket-detail zen-ticket-detail" style={{ overflowX: "clip" }}>
      <nav aria-label="Breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0">
          <li className="breadcrumb-item"><Link to="/staff/tickets">Staff Queue</Link></li>
          <li className="breadcrumb-item active" aria-current="page">Ticket Details</li>
        </ol>
      </nav>

      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-4">
        <div>
          <h1 className="h3 mb-1" data-page-heading tabIndex={-1}>{ticket.ticketNumber}</h1>
          <p className="zen-muted mb-0">{titleCase(ticket.currentStatus)} <StatusBadge status={ticket.currentStatus} /></p>
        </div>
        <Link className="btn btn-outline-primary" to="/staff/tickets">Back to Staff Queue</Link>
      </div>

      {isFinal && (
        <div className="zen-warning-panel mb-4" role="status" data-testid="terminal-readonly">
          <p className="fw-semibold mb-1">Closed/Cancelled Tickets are read-only.</p>
          <p className="mb-0">History, metadata, and active attachment downloads remain available. Claim, Reassign, priority, status, and new communications are unavailable.</p>
        </div>
      )}

      <section className="zen-card p-3 p-md-4 mb-4" aria-label="Ticket and Requester information">
        <div className="row">
          <ReadOnlyField label="Ticket No.">{ticket.ticketNumber}</ReadOnlyField>
          <ReadOnlyField label="Ticket Date">{formatDateTime(ticket.createdAt)}</ReadOnlyField>
          <ReadOnlyField label="Category">{ticket.category.name}</ReadOnlyField>
          <ReadOnlyField label="Related System">{ticket.relatedSystem.name}</ReadOnlyField>
          <ReadOnlyField label="Requester">{ticket.requester.fullName}<span className="d-block zen-muted">{ticket.requester.email}</span></ReadOnlyField>
          <ReadOnlyField label="Requested Priority"><PriorityBadge priority={ticket.requestedPriority} testId="requested-priority" /></ReadOnlyField>
          <ReadOnlyField label="Current Status"><StatusBadge status={ticket.currentStatus} /></ReadOnlyField>
          <ReadOnlyField label="Owner">{ownerText(ticket.owner)}</ReadOnlyField>
          <ReadOnlyField label="Ticket Summary" className="col-12">{ticket.summary}</ReadOnlyField>
          <ReadOnlyField label="Description" className="col-12"><span className="staff-detail-description">{ticket.description}</span></ReadOnlyField>
        </div>
      </section>

      <section className="zen-card staff-action-card p-3 p-md-4 mb-4" aria-labelledby="ownership-heading">
        <h2 className="h5" id="ownership-heading">Ownership</h2>
        <p className="mb-3">Current Owner: <strong>{ownerText(ticket.owner)}</strong></p>
        {!isFinal && !ticket.owner && (
          <button type="button" className="btn btn-primary" onClick={() => void handleClaim()} disabled={claimFeedback.busy}>
            {claimFeedback.busy ? "Claiming…" : "Claim Ticket"}
          </button>
        )}
        {!isFinal && ticket.owner && (
          <>
            <button ref={ownerTriggerRef} type="button" className="btn btn-outline-primary" onClick={openOwnerDialog} disabled={ownerFeedback.busy}>
              {ownerFeedback.busy ? "Changing Owner…" : "Reassign Ticket"}
            </button>
            {ownerDialog && (
              <div ref={ownerDialogRef} className="staff-detail-dialog zen-card p-3 mt-3" role="dialog" aria-modal="true" aria-labelledby="reassign-heading">
                <h3 className="h6" id="reassign-heading">Reassign Ticket</h3>
                <p className="zen-muted">Current Owner is captured as the concurrency check: <strong>{ownerText(ticket.owner)}</strong></p>
                <label className="form-label fw-semibold" htmlFor="reassign-owner">New eligible Owner</label>
                {ownerDirectoryState === "loading" && <p className="zen-muted" role="status">Loading eligible Owners…</p>}
                {ownerDirectoryState === "forbidden" && <p className="zen-field-error" role="alert">{ownerDirectoryError}</p>}
                {ownerDirectoryState === "error" && <div className="zen-error-panel p-2" data-testid="owner-directory-error"><p className="mb-2" role="alert">{ownerDirectoryError}</p><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => void loadOwners()}>Retry Owner Directory</button></div>}
                {ownerDirectoryState === "ready" && (
                  <select id="reassign-owner" className="form-select" value={selectedOwnerId} onChange={(event) => setSelectedOwnerId(event.target.value)} disabled={ownerFeedback.busy}>
                    <option value="">Select an eligible Owner</option>
                    {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.fullName} — {roleLabel(owner.role)}</option>)}
                  </select>
                )}
                <ActionFeedback feedback={ownerFeedback} testId="owner-feedback" />
                <div className="d-flex flex-wrap justify-content-end gap-2 mt-3">
                  <button type="button" className="btn btn-outline-primary" onClick={closeOwnerDialog} disabled={ownerFeedback.busy}>Cancel</button>
                  <button type="button" className="btn btn-primary" onClick={() => void handleReassign()} disabled={ownerFeedback.busy || ownerDirectoryState !== "ready" || !selectedOwnerId}>
                    {ownerFeedback.busy ? "Reassigning…" : "Confirm Reassign"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        <ActionFeedback feedback={claimFeedback} testId="claim-feedback" />
        {!isFinal && <ActionFeedback feedback={ownerFeedback} testId="owner-action-feedback" />}
      </section>

      <section className="zen-card staff-action-card p-3 p-md-4 mb-4" aria-labelledby="priority-heading">
        <h2 className="h5" id="priority-heading">IT Priority</h2>
        <div className="row align-items-end">
          <div className="col-12 col-md-6">
            <label className="form-label fw-semibold" htmlFor="staff-it-priority">IT Priority</label>
            <select id="staff-it-priority" className="form-select" value={priorityDraft} onChange={(event) => setPriorityDraft(event.target.value as Priority)} disabled={isFinal || priorityFeedback.busy}>
              {PRIORITIES.map((priority) => <option key={priority} value={priority}>{titleCase(priority)}</option>)}
            </select>
            <p className="zen-muted mt-2 mb-0">Requested Priority remains read-only: <PriorityBadge priority={ticket.requestedPriority} /></p>
          </div>
          {!isFinal && <div className="col-12 col-md-auto mt-3 mt-md-0"><button type="button" className="btn btn-primary" onClick={() => void handlePrioritySave()} disabled={priorityFeedback.busy}>{priorityFeedback.busy ? "Saving…" : "Save IT Priority"}</button></div>}
        </div>
        <ActionFeedback feedback={priorityFeedback} testId="priority-feedback" />
      </section>

      <section className="zen-card staff-action-card p-3 p-md-4 mb-4" aria-labelledby="status-heading">
        <h2 className="h5" id="status-heading">Status</h2>
        <p className="zen-muted">Only status transitions permitted by the server are offered.</p>
        {!isFinal && (allowedTransitions.length === 0 ? (
          <p className="zen-warning-panel mb-0" role="status">Assign an eligible Owner with Claim or Reassign before updating status.</p>
        ) : (
          <form onSubmit={submitStatus} noValidate>
            <label className="form-label fw-semibold" htmlFor="staff-status">Next status</label>
            <select id="staff-status" className={`form-select${statusFeedback.error ? " is-invalid" : ""}`} value={statusDraft} onChange={(event) => { setStatusDraft(event.target.value as TicketStatus); setStatusFeedback(idleFeedback()); }} aria-invalid={statusFeedback.error ? "true" : "false"}>
              <option value="">Select a permitted next status</option>
              {allowedTransitions.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
            </select>
            {statusDraft === "WAITING_FOR_REQUESTER" && <div className="mt-3"><label className="form-label fw-semibold" htmlFor="waiting-public-comment">Public Comment for Requester<span className="zen-required" aria-hidden="true">*</span><span className="visually-hidden"> (required)</span></label><textarea id="waiting-public-comment" className="form-control" rows={4} maxLength={MESSAGE_LIMIT} value={waitingComment} onChange={(event) => setWaitingComment(event.target.value)} aria-describedby="waiting-comment-hint" /><p id="waiting-comment-hint" className="zen-muted mt-1 mb-0">{MESSAGE_LIMIT - waitingComment.length} characters remaining.</p></div>}
            <ActionFeedback feedback={statusFeedback} testId="status-feedback" />
            <button ref={statusTriggerRef} type="submit" className="btn btn-primary mt-3" disabled={statusFeedback.busy}>{statusFeedback.busy ? "Updating…" : "Update status"}</button>
            {statusDialog && <ConfirmationDialog status={statusDialog} busy={statusFeedback.busy} onCancel={() => setStatusDialog(null)} onConfirm={() => void performStatus(statusDialog)} />}
          </form>
        ))}
        {isFinal && <ActionFeedback feedback={statusFeedback} testId="status-feedback" />}
      </section>

      <section className="zen-card staff-indication-card p-3 p-md-4 mb-4" aria-labelledby="staff-indication-heading">
        <h2 className="h5" id="staff-indication-heading">Resolution Indication</h2>
        <p className="zen-muted">A signal from the Requester that the problem appears resolved. It does not change Ticket status.</p>
        {ticket.resolutionIndication ? <p className="zen-success mb-0" role="status">Indicated by {ticket.resolutionIndication.indicatedBy.fullName} ({roleLabel(ticket.resolutionIndication.indicatedBy.role)}) on {formatDateTime(ticket.resolutionIndication.indicatedAt)}.</p> : <p className="zen-muted mb-0">No active Resolution Indication.</p>}
      </section>

      <section className="zen-card staff-communication-public p-3 p-md-4 mb-4" aria-labelledby="staff-public-heading">
        <div className="d-flex flex-column flex-sm-row justify-content-between gap-2 mb-1"><h2 className="h5 mb-0" id="staff-public-heading">Public Comments</h2><span className="zen-badge zen-badge-medium align-self-start">Visible to Requester and staff</span></div>
        <p className="zen-muted">Use this timeline for messages the Requester may read.</p>
        <PublicTimeline comments={comments} />
        {!isFinal ? <form className="mt-4" onSubmit={submitPublic} noValidate><label className="form-label fw-semibold" htmlFor="staff-public-comment">Add Public Comment</label><textarea id="staff-public-comment" className="form-control" rows={4} maxLength={MESSAGE_LIMIT} value={publicDraft} onChange={(event) => { setPublicDraft(event.target.value); setPublicFeedback(idleFeedback()); }} aria-describedby="staff-public-hint" disabled={publicFeedback.busy} /><p id="staff-public-hint" className="zen-muted mt-1 mb-0">{MESSAGE_LIMIT - publicDraft.length} characters remaining.</p><ActionFeedback feedback={publicFeedback} testId="public-feedback" /><button type="submit" className="btn btn-primary mt-3" disabled={publicFeedback.busy}>{publicFeedback.busy ? "Posting…" : "Post Public Comment"}</button></form> : <><ActionFeedback feedback={publicFeedback} testId="public-feedback" /><p className="zen-warning-panel mt-4 mb-0" role="status">Closed/Cancelled Tickets are read-only. Historical Public Comments remain available.</p></>}
      </section>

      <section className="zen-card staff-communication-internal p-3 p-md-4 mb-4" aria-labelledby="staff-internal-heading">
        <div className="d-flex flex-column flex-sm-row justify-content-between gap-2 mb-1"><h2 className="h5 mb-0" id="staff-internal-heading">🔒 Internal Notes</h2><span className="zen-badge zen-badge-high align-self-start">Visible only to IT Staff and Administrators</span></div>
        <p className="zen-muted">Internal Notes are never shown to the Requester.</p>
        <InternalTimeline notes={notes} />
        {!isFinal ? <form className="mt-4" onSubmit={submitNote} noValidate><label className="form-label fw-semibold" htmlFor="staff-internal-note">Add Internal Note</label><textarea id="staff-internal-note" className="form-control" rows={4} maxLength={MESSAGE_LIMIT} value={noteDraft} onChange={(event) => { setNoteDraft(event.target.value); setNoteFeedback(idleFeedback()); }} aria-describedby="staff-note-hint" disabled={noteFeedback.busy} /><p id="staff-note-hint" className="zen-muted mt-1 mb-0">{MESSAGE_LIMIT - noteDraft.length} characters remaining.</p><ActionFeedback feedback={noteFeedback} testId="note-feedback" /><button type="submit" className="btn btn-warning mt-3" disabled={noteFeedback.busy}>{noteFeedback.busy ? "Saving…" : "Save Internal Note"}</button></form> : <><ActionFeedback feedback={noteFeedback} testId="note-feedback" /><p className="zen-warning-panel mt-4 mb-0" role="status">Closed/Cancelled Tickets are read-only. Historical Internal Notes remain available.</p></>}
      </section>

      <AttachmentSection ticketId={ticket.id} attachments={ticket.attachments} onChanged={() => undefined} readOnly />
    </div>
  );
}
