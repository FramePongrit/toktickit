import { useCallback } from "react";
import { Link } from "react-router-dom";
import { fetchRequesterDashboard } from "../api/dashboards.js";
import { DashboardError, DashboardHeader, DashboardPageFrame, MetricCard, TicketPreviewSection } from "../components/DashboardPrimitives.js";
import { StateBlock } from "../components/StateBlock.js";
import { useAuth } from "../context/AuthContext.js";
import { useDashboardSnapshot } from "../hooks/useDashboardSnapshot.js";

export function RequesterDashboardPage() {
  const { user } = useAuth();
  const identity = user ? `${user.id}:${user.role}` : "no-user";
  const load = useCallback((signal: AbortSignal) => fetchRequesterDashboard(signal), []);
  const dashboard = useDashboardSnapshot(identity, load, Boolean(user));

  if (!user) return null;

  const data = dashboard.data;
  const generatedAt = data?.generatedAt;
  const refresh = dashboard.refresh;

  return (
    <DashboardPageFrame>
      <DashboardHeader name={user.fullName} generatedAt={generatedAt} loading={dashboard.loading} onRefresh={refresh} />
      {data && dashboard.error && (
        <DashboardError
          forbidden={dashboard.forbidden}
          error={dashboard.error.message}
          staleAt={generatedAt}
          retry={refresh}
        />
      )}
      {!data ? dashboard.loading ? (
        <StateBlock kind="loading" title="Loading your dashboard…" />
      ) : dashboard.forbidden ? (
        <StateBlock kind="error" title="You do not have access to this dashboard." description="Return to your permitted workspace." />
      ) : (
        <StateBlock kind="error" title="Dashboard unavailable" description={dashboard.error?.message ?? "The service could not load your dashboard."} action={<button type="button" className="btn btn-outline-primary" onClick={refresh}>Retry</button>} />
      ) : (
        <>
          <div className="row g-3 mb-4">
            <div className="col-12 col-sm-6 col-xl-3"><MetricCard title="Open Tickets" metric={data.metrics.openTickets} /></div>
            <div className="col-12 col-sm-6 col-xl-3"><MetricCard title="Waiting for Me" metric={data.metrics.waitingForMe} /></div>
            <div className="col-12 col-sm-6 col-xl-3">
              <MetricCard title="Recently Updated" metric={data.metrics.recentlyUpdated} detail="Today and the previous 6 days (Bangkok time)." />
            </div>
            <div className="col-12 col-sm-6 col-xl-3">
              <MetricCard title="Recently Resolved" metric={data.metrics.recentlyResolved} detail="Today and the previous 6 days (Bangkok time)." />
            </div>
          </div>

          <p className="small zen-muted">The recent period covers today and the previous 6 days in Bangkok time. Older Tickets with no recorded resolution time are not included in Recently Resolved.</p>

          <div className="row g-3 mb-4">
            <div className="col-12 col-lg-6">
              <TicketPreviewSection
                title="Recently Updated Tickets"
                tickets={data.previews.recentUpdated.data}
                href={data.previews.recentUpdated.href}
                dateLabel="Updated"
                dateFor={(ticket) => ticket.updatedAt}
                emptyText="No Tickets were updated in this period."
              />
            </div>
            <div className="col-12 col-lg-6">
              <TicketPreviewSection
                title="Recently Resolved Tickets"
                tickets={data.previews.recentResolved.data}
                href={data.previews.recentResolved.href}
                dateLabel="Resolved"
                dateFor={(ticket) => ticket.resolvedAt}
                emptyText="No Tickets with a recorded resolution time were resolved in this period."
              />
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2">
            <Link className="btn btn-primary" to="/tickets/new">Create Ticket</Link>
            <Link className="btn btn-outline-primary" to="/tickets">Open My Tickets</Link>
          </div>
        </>
      )}
    </DashboardPageFrame>
  );
}
