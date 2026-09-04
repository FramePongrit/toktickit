import { Link } from "react-router-dom";
import { PriorityBadge, StatusBadge } from "./Badges.js";
import type { TicketListItem } from "../types/index.js";
import type { TicketSortField } from "../api/tickets.js";

interface TicketListProps {
  tickets: TicketListItem[];
  sort: TicketSortField;
  order: "asc" | "desc";
  onSortChange: (field: TicketSortField) => void;
}

const SORTABLE: { field: TicketSortField; label: string }[] = [
  { field: "ticketNumber", label: "Ticket No." },
  { field: "createdAt", label: "Created Date" },
  { field: "summary", label: "Summary" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Renders a table from md upward and stacked cards below it.
 *
 * Cards rather than a horizontally scrolling table: the sprint forbids
 * horizontal page scrolling on mobile, and a card keeps every field readable
 * instead of clipping the row (D-07).
 */
export function TicketList({ tickets, sort, order, onSortChange }: TicketListProps) {
  function ariaSort(field: TicketSortField): "ascending" | "descending" | "none" {
    if (sort !== field) return "none";
    return order === "asc" ? "ascending" : "descending";
  }

  return (
    <>
      {/* Desktop and tablet */}
      <div className="d-none d-md-block zen-card">
        <table className="table table-hover align-middle mb-0">
          <thead>
            <tr>
              {SORTABLE.map(({ field, label }) => (
                <th key={field} scope="col" aria-sort={ariaSort(field)}>
                  <button
                    type="button"
                    className="btn btn-link p-0 text-decoration-none fw-semibold"
                    onClick={() => onSortChange(field)}
                  >
                    {label}
                    <span aria-hidden="true">
                      {sort === field ? (order === "asc" ? " ▲" : " ▼") : " ⇅"}
                    </span>
                  </button>
                </th>
              ))}
              <th scope="col">Category</th>
              <th scope="col">Related System</th>
              <th scope="col">Requested Priority</th>
              <th scope="col">Current Status</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr key={ticket.id}>
                <td>
                  <Link to={`/tickets/${ticket.id}`}>{ticket.ticketNumber}</Link>
                </td>
                <td>{formatDate(ticket.createdAt)}</td>
                <td>{ticket.summary}</td>
                <td>{ticket.category.name}</td>
                <td>{ticket.relatedSystem.name}</td>
                <td>
                  <PriorityBadge priority={ticket.requestedPriority} />
                </td>
                <td>
                  <StatusBadge status={ticket.currentStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className="list-unstyled d-md-none mb-0">
        {tickets.map((ticket) => (
          <li key={ticket.id} className="zen-card p-3 mb-3">
            <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
              <Link to={`/tickets/${ticket.id}`} className="fw-semibold">
                {ticket.ticketNumber}
              </Link>
              <span className="zen-muted" style={{ fontSize: "0.875rem" }}>
                {formatDate(ticket.createdAt)}
              </span>
            </div>
            <p className="mb-2">{ticket.summary}</p>
            <p className="zen-muted mb-2" style={{ fontSize: "0.875rem" }}>
              {ticket.category.name} · {ticket.relatedSystem.name}
            </p>
            <div className="d-flex flex-wrap gap-2">
              <PriorityBadge priority={ticket.requestedPriority} />
              <StatusBadge status={ticket.currentStatus} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
