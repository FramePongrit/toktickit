import type { ReactNode } from "react";
import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "./Badges.js";
import type { DashboardMetric, DashboardTicket } from "../api/dashboards.js";
import type { TicketStatus } from "../types/index.js";

export function formatDashboardDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function internalHref(value: string, fallback: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export function DashboardHeader({
  name,
  generatedAt,
  loading,
  onRefresh,
}: {
  name: string;
  generatedAt?: string;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
      <div>
        <h1 className="h3 mb-1" data-page-heading tabIndex={-1}>Dashboard</h1>
        <p className="zen-muted mb-0">Welcome, {name}. Your service desk at a glance.</p>
        <p className="small zen-muted mt-1 mb-0" data-testid="dashboard-as-of">
          {generatedAt ? `Updated ${formatDashboardDate(generatedAt)} (Bangkok time)` : "Waiting for the latest snapshot"}
        </p>
      </div>
      <button type="button" className="btn btn-outline-primary" onClick={onRefresh} disabled={loading} aria-busy={loading}>
        {loading ? "Refreshing…" : "Refresh Dashboard"}
      </button>
    </div>
  );
}

export function MetricCard({
  title,
  metric,
  detail,
  onClick,
}: {
  title: string;
  metric: DashboardMetric;
  detail?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <article className="zen-card h-100 p-3 dashboard-metric-card">
      <h2 className="h6 mb-2">{title}</h2>
      <p className="display-6 fw-semibold mb-1" aria-label={`${metric.value} ${metric.unit}`}>
        {metric.value}
      </p>
      <p className="small zen-muted text-capitalize mb-3">{metric.unit}</p>
      {detail && <p className="small zen-muted mb-3">{detail}</p>}
      <Link className="btn btn-sm btn-outline-primary" to={internalHref(metric.href, "/")} onClick={onClick}>
        View {title}
      </Link>
    </article>
  );
}

export function TicketPreviewSection({
  title,
  tickets,
  href,
  dateLabel,
  dateFor,
  emptyText,
  ticketBase = "/tickets",
}: {
  title: string;
  tickets: DashboardTicket[];
  href: string;
  dateLabel: string;
  dateFor: (ticket: DashboardTicket) => string | null;
  emptyText: string;
  ticketBase?: string;
}) {
  return (
    <section className="zen-card p-3 h-100" aria-labelledby={`preview-${title.replace(/\W+/g, "-").toLowerCase()}`}>
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-start gap-2 mb-2">
        <h2 className="h5 mb-0" id={`preview-${title.replace(/\W+/g, "-").toLowerCase()}`}>{title}</h2>
        <Link to={internalHref(href, "/tickets")} className="btn btn-sm btn-outline-primary">View all {title.toLowerCase()}</Link>
      </div>
      {tickets.length === 0 ? (
        <p className="zen-muted mb-0">{emptyText}</p>
      ) : (
        <ul className="list-unstyled mb-0">
          {tickets.map((ticket) => (
            <li className="dashboard-preview-row py-3" key={ticket.id}>
              <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
                <Link className="fw-semibold" to={`${ticketBase}/${ticket.id}`}>{ticket.ticketNumber}</Link>
                <StatusBadge status={ticket.currentStatus} />
              </div>
              <p className="mb-1 mt-1 dashboard-wrap">{ticket.summary}</p>
              {ticket.requester && <p className="small zen-muted mb-1">Requester: {ticket.requester.fullName}</p>}
              {ticket.owner !== undefined && <p className="small zen-muted mb-1">Owner: {ticket.owner?.fullName ?? "Unassigned"}</p>}
              <p className="small zen-muted mb-0">{dateLabel}: {dateFor(ticket) ? formatDashboardDate(dateFor(ticket)!) : "Unknown"}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function StatusCountGrid({
  counts,
}: {
  counts: Record<TicketStatus, DashboardMetric>;
}) {
  const statuses: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED", "RESOLVED", "CLOSED", "CANCELLED"];
  return (
    <section className="zen-card p-3 mb-4" aria-labelledby="ticket-status-counts-heading">
      <h2 className="h5 mb-3" id="ticket-status-counts-heading">Tickets by status</h2>
      <div className="row g-2">
        {statuses.map((status) => (
          <div className="col-6 col-md-3" key={status}>
            <Link className="dashboard-status-count" to={internalHref(counts[status].href, "/staff/tickets?scope=all")}>
              <StatusBadge status={status} />
              <span className="fw-semibold">{counts[status].value}</span>
              <span className="visually-hidden">tickets</span>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DashboardError({
  forbidden,
  error,
  staleAt,
  staleLabel = "snapshot",
  retry,
}: {
  forbidden: boolean;
  error: string;
  staleAt?: string;
  staleLabel?: string;
  retry: () => void;
}) {
  return (
    <div className="zen-error-panel p-3 mb-4" role="alert">
      <p className="fw-semibold mb-1">{forbidden ? "You do not have access to this dashboard." : "Dashboard could not be refreshed."}</p>
      <p className="mb-2">{forbidden ? "Return to your permitted workspace." : staleAt ? `Showing the previous ${staleLabel} from ${formatDashboardDate(staleAt)} (Bangkok time).` : error}</p>
      {!forbidden && staleAt && <p className="small mb-2">{error}</p>}
      {!forbidden && <button type="button" className="btn btn-outline-primary" onClick={retry}>Retry</button>}
    </div>
  );
}

export function DashboardPageFrame({ children }: { children: ReactNode }) {
  return <section className="dashboard-page">{children}</section>;
}
