import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchTicket } from "../api/tickets.js";
import { AttachmentSection } from "../components/AttachmentSection.js";
import { PriorityBadge, StatusBadge } from "../components/Badges.js";
import { StateBlock } from "../components/StateBlock.js";
import { ApiError } from "../lib/http.js";
import type { AttachmentMeta, TicketDetail } from "../types/index.js";

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

export function RequesterTicketDetailPage() {
  const { id } = useParams();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    fetchTicket(Number(id))
      .then((loaded) => {
        if (cancelled) return;
        setTicket(loaded);
        setState("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        // 404 covers both "no such ticket" and "not yours" — the server does
        // not distinguish them, and neither does this screen (BR-13).
        setState(error instanceof ApiError && error.status === 404 ? "not-found" : "error");
      });

    return () => {
      cancelled = true;
    };
  }, [id, reload]);

  function updateAttachments(attachments: AttachmentMeta[]) {
    setTicket((current) => (current ? { ...current, attachments } : current));
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
            onClick={() => setReload((n) => n + 1)}
          >
            Retry
          </button>
        }
      />
    );
  }

  return (
    <>
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
        <h1 className="h3 mb-0">{ticket.ticketNumber}</h1>
        <Link className="btn btn-outline-primary" to="/tickets">
          Back to My Tickets
        </Link>
      </div>

      {/* Read-only throughout: nothing on this screen edits the ticket (BR-44). */}
      <section className="zen-card p-3 p-md-4 mb-4" aria-label="Ticket information">
        <div className="row">
          <ReadOnlyField label="Ticket No.">{ticket.ticketNumber}</ReadOnlyField>
          <ReadOnlyField label="Ticket Date">
            {new Date(ticket.createdAt).toLocaleString()}
          </ReadOnlyField>
          <ReadOnlyField label="Category">{ticket.category.name}</ReadOnlyField>
          <ReadOnlyField label="Related System">{ticket.relatedSystem.name}</ReadOnlyField>

          <ReadOnlyField label="Requester">{ticket.requester.fullName}</ReadOnlyField>
          <ReadOnlyField label="Requested Priority">
            <PriorityBadge priority={ticket.requestedPriority} />
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

      <AttachmentSection
        ticketId={ticket.id}
        attachments={ticket.attachments}
        onChanged={updateAttachments}
      />
    </>
  );
}
