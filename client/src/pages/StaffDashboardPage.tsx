import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import type { MouseEvent } from "react";
import { fetchStaffDashboard, fetchStaffDashboardActions } from "../api/dashboards.js";
import type { DashboardAction, StaffActionView, StaffDashboardActionQuery } from "../api/dashboards.js";
import { DashboardError, DashboardHeader, DashboardPageFrame, MetricCard, StatusCountGrid, TicketPreviewSection, formatDashboardDate } from "../components/DashboardPrimitives.js";
import { Pagination } from "../components/Pagination.js";
import { StateBlock } from "../components/StateBlock.js";
import { useAuth } from "../context/AuthContext.js";
import { useDashboardSnapshot } from "../hooks/useDashboardSnapshot.js";
import { isOffsetDateTime } from "../lib/offsetDateTime.js";
import { ApiError } from "../lib/http.js";
import type { PagedResult } from "../types/index.js";

const PAGE_SIZES = [10, 20, 50] as const;

interface ActionsLocation {
  valid: boolean;
  view: StaffActionView | null;
  page: number;
  pageSize: 10 | 20 | 50;
  from?: string;
  through?: string;
}

function readActionsLocation(params: URLSearchParams): ActionsLocation {
  const allowed = new Set(["actions", "from", "through", "page", "pageSize"]);
  const keys = [...params.keys()];
  if (keys.some((key) => !allowed.has(key) || params.getAll(key).length !== 1)) {
    return { valid: false, view: null, page: 1, pageSize: 10 };
  }
  const viewValue = params.get("actions");
  if (!viewValue) {
    return keys.length === 0
      ? { valid: true, view: null, page: 1, pageSize: 10 }
      : { valid: false, view: null, page: 1, pageSize: 10 };
  }
  if (viewValue !== "active-assigned" && viewValue !== "completed-performed") {
    return { valid: false, view: null, page: 1, pageSize: 10 };
  }
  const pageText = params.get("page");
  const sizeText = params.get("pageSize");
  if (params.has("page") && (!pageText || !/^[1-9]\d*$/.test(pageText) || !Number.isSafeInteger(Number(pageText)))) {
    return { valid: false, view: null, page: 1, pageSize: 10 };
  }
  if (params.has("pageSize") && !["10", "20", "50"].includes(sizeText ?? "")) {
    return { valid: false, view: null, page: 1, pageSize: 10 };
  }
  const pageSize = Number(sizeText ?? 10);

  const from = params.get("from") ?? undefined;
  const through = params.get("through") ?? undefined;
  if (viewValue === "active-assigned" && (params.has("from") || params.has("through"))) return { valid: false, view: null, page: 1, pageSize: 10 };
  if (viewValue === "completed-performed" && (!params.has("from") || !params.has("through") || !from || !through || !isOffsetDateTime(from) || !isOffsetDateTime(through) || Date.parse(from) > Date.parse(through))) {
    return { valid: false, view: null, page: 1, pageSize: 10 };
  }
  return { valid: true, view: viewValue, page: Number(pageText ?? 1), pageSize: pageSize as 10 | 20 | 50, from, through };
}

function dashboardActionQuery(location: ActionsLocation): StaffDashboardActionQuery {
  return {
    view: location.view ?? "active-assigned",
    page: location.page,
    pageSize: location.pageSize,
    ...(location.view === "completed-performed" ? { from: location.from, through: location.through } : {}),
  };
}

function actionTitle(status: DashboardAction["status"]): string {
  return status.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function openActionHref(action: DashboardAction): string {
  return `/staff/tickets/${action.ticketId}?tab=actions&actionId=${action.id}`;
}

function ActionPreviewSection({
  actions,
  href,
  onOpen,
}: {
  actions: DashboardAction[];
  href: string;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <section className="zen-card p-3 h-100" aria-labelledby="completed-actions-preview-heading">
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-start gap-2 mb-2">
        <h2 className="h5 mb-0" id="completed-actions-preview-heading">My Completed Actions</h2>
        <Link to={href} className="btn btn-sm btn-outline-primary" onClick={onOpen}>View all completed Actions</Link>
      </div>
      <p className="small zen-muted">Actions completed today and the previous 6 days (Bangkok time).</p>
      {actions.length === 0 ? <p className="zen-muted mb-0">No Actions were completed in the recent period.</p> : (
        <ul className="list-unstyled mb-0">
          {actions.map((action) => (
            <li className="dashboard-preview-row py-3" key={action.id}>
              <div className="d-flex flex-wrap justify-content-between gap-2">
                <Link className="fw-semibold" to={openActionHref(action)}>{action.ticketNumber}</Link>
                <span className={`zen-badge zen-action-${action.status.toLowerCase()}`}>{actionTitle(action.status)}</span>
              </div>
              <p className="dashboard-wrap mt-1 mb-1">{action.description}</p>
              <p className="small zen-muted mb-1">Assigned to: {action.assignee.fullName}</p>
              <p className="small zen-muted mb-1">Completed by: {action.performedBy?.fullName ?? "Unknown"}</p>
              <p className="small zen-muted mb-0">Completed: {action.completedAt ? formatDashboardDate(action.completedAt) : "Unknown"}</p>
              {action.workCycle !== action.ticket.workCycle && <p className="small zen-muted mb-0">Earlier work cycle ({action.workCycle})</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DashboardActionsTable({ actions }: { actions: DashboardAction[] }) {
  return (
    <>
      <div className="table-responsive d-none d-lg-block">
        <table className="table align-middle mb-0 dashboard-actions-table">
          <caption className="visually-hidden">Actions assigned to you or completed by you</caption>
          <thead><tr><th scope="col">Ticket</th><th scope="col">Action</th><th scope="col">Status</th><th scope="col">Cycle</th><th scope="col">Assignee</th><th scope="col">Performer</th><th scope="col">Completed</th><th scope="col">Open</th></tr></thead>
          <tbody>{actions.map((action) => (
            <tr key={action.id}>
              <td><Link to={openActionHref(action)}>{action.ticketNumber}</Link></td>
              <td className="dashboard-wrap">{action.description}</td>
              <td><span className={`zen-badge zen-action-${action.status.toLowerCase()}`}>{actionTitle(action.status)}</span></td>
              <td>{action.workCycle}{action.workCycle !== action.ticket.workCycle && <span className="d-block small zen-muted">Earlier cycle</span>}</td>
              <td>{action.assignee.fullName}</td>
              <td>{action.performedBy?.fullName ?? "Not completed"}</td>
              <td>{action.completedAt ? formatDashboardDate(action.completedAt) : "—"}</td>
              <td><Link className="btn btn-sm btn-outline-primary" to={openActionHref(action)}>Open Action</Link></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="d-lg-none">
        {actions.map((action) => (
          <article className="dashboard-action-card p-3" key={action.id}>
            <p className="mb-1"><Link className="fw-semibold" to={openActionHref(action)}>{action.ticketNumber}</Link></p>
            <p className="dashboard-wrap mb-2">{action.description}</p>
            <dl className="dashboard-action-fields mb-2">
              <dt>Status</dt><dd><span className={`zen-badge zen-action-${action.status.toLowerCase()}`}>{actionTitle(action.status)}</span></dd>
              <dt>Cycle</dt><dd>{action.workCycle}{action.workCycle !== action.ticket.workCycle ? " (earlier cycle)" : ""}</dd>
              <dt>Assignee</dt><dd>{action.assignee.fullName}</dd>
              <dt>Performer</dt><dd>{action.performedBy?.fullName ?? "Not completed"}</dd>
              <dt>Completed</dt><dd>{action.completedAt ? formatDashboardDate(action.completedAt) : "—"}</dd>
            </dl>
            <Link className="btn btn-outline-primary w-100" to={openActionHref(action)}>Open Action</Link>
          </article>
        ))}
      </div>
    </>
  );
}

export function StaffDashboardPage() {
  const { user } = useAuth();
  const identity = user ? `${user.id}:${user.role}` : "no-user";
  const load = useCallback((signal: AbortSignal) => fetchStaffDashboard(signal), []);
  const dashboard = useDashboardSnapshot(identity, load, Boolean(user));
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const searchSignature = searchParams.toString();
  const actionsLocation = useMemo(() => readActionsLocation(new URLSearchParams(searchSignature)), [searchSignature]);
  const lastUserIdentity = useRef(identity);
  const userIdentityGeneration = useRef(0);
  if (lastUserIdentity.current !== identity) {
    lastUserIdentity.current = identity;
    userIdentityGeneration.current += 1;
  }
  const actionScope = `${identity}:${userIdentityGeneration.current}:${searchSignature}`;
  const [actionsState, setActionsState] = useState<{ scope: string | null; data: PagedResult<DashboardAction> | null; receivedAt: string | null; loading: boolean; error: ApiError | null; forbidden: boolean }>({ scope: null, data: null, receivedAt: null, loading: false, error: null, forbidden: false });
  const [actionsReload, setActionsReload] = useState(0);
  const actionGeneration = useRef(0);
  const shouldFocusActions = useRef(false);
  const actionsHeading = useRef<HTMLHeadingElement>(null);
  const data = dashboard.data;

  useEffect(() => {
    const generation = ++actionGeneration.current;
    const controller = new AbortController();
    if (!actionsLocation.valid || !actionsLocation.view || !user) {
      setActionsState({ scope: actionScope, data: null, receivedAt: null, loading: false, error: null, forbidden: false });
      return () => {
        controller.abort();
        if (actionGeneration.current === generation) actionGeneration.current += 1;
      };
    }

    setActionsState((current) => current.scope === actionScope
      ? { ...current, loading: true, error: null, forbidden: false }
      : { scope: actionScope, data: null, receivedAt: null, loading: true, error: null, forbidden: false });
    fetchStaffDashboardActions(dashboardActionQuery(actionsLocation), controller.signal)
      .then((result) => {
        if (actionGeneration.current === generation) setActionsState({ scope: actionScope, data: result, receivedAt: new Date().toISOString(), loading: false, error: null, forbidden: false });
      })
      .catch((caught: unknown) => {
        if (actionGeneration.current !== generation || controller.signal.aborted) return;
        const error = caught instanceof ApiError ? caught : new ApiError(0, "UNEXPECTED", "The service is unavailable. Please try again.");
        if (error.status === 401 || error.status === 403) setActionsState({ scope: actionScope, data: null, receivedAt: null, loading: false, error, forbidden: error.status === 403 });
        else setActionsState((current) => ({ scope: actionScope, data: current.scope === actionScope ? current.data : null, receivedAt: current.scope === actionScope ? current.receivedAt : null, loading: false, error, forbidden: false }));
      });
    return () => {
      controller.abort();
      if (actionGeneration.current === generation) actionGeneration.current += 1;
    };
  }, [actionScope, actionsLocation, actionsReload, user]);

  useEffect(() => {
    if (!shouldFocusActions.current || !actionsLocation.valid || !actionsLocation.view) return;
    shouldFocusActions.current = false;
    actionsHeading.current?.focus();
  }, [actionsLocation, searchSignature]);

  if (!user) return null;

  const visibleActions = actionsState.scope === actionScope ? actionsState : { scope: actionScope, data: null, receivedAt: null, loading: Boolean(actionsLocation.view), error: null, forbidden: false };
  const generatedAt = data?.generatedAt;
  const onRefresh = () => {
    dashboard.refresh();
    if (actionsLocation.view) setActionsReload((value) => value + 1);
  };

  function openActions(href: string, event?: MouseEvent<HTMLAnchorElement>) {
    const target = new URL(href, window.location.origin);
    const targetSearch = new URLSearchParams(target.search).toString();
    if (location.pathname === target.pathname && searchSignature === targetSearch) {
      if (event) {
        event.preventDefault();
      }
      actionsHeading.current?.focus();
      return;
    }
    shouldFocusActions.current = true;
  }

  function updateActionLocation(changes: { page?: number; pageSize?: 10 | 20 | 50 }) {
    const next = new URLSearchParams(searchSignature);
    if (changes.page !== undefined) next.set("page", String(changes.page));
    if (changes.pageSize !== undefined) {
      next.set("pageSize", String(changes.pageSize));
      next.set("page", "1");
    }
    setSearchParams(next, { replace: true });
  }

  return (
    <DashboardPageFrame>
      <DashboardHeader name={user.fullName} generatedAt={generatedAt} loading={dashboard.loading} onRefresh={onRefresh} />
      {data && dashboard.error && <DashboardError forbidden={dashboard.forbidden} error={dashboard.error.message} staleAt={generatedAt} retry={onRefresh} />}
      {!data ? dashboard.loading ? (
        <StateBlock kind="loading" title="Loading your dashboard…" />
      ) : dashboard.forbidden ? (
        <StateBlock kind="error" title="You do not have access to this dashboard." />
      ) : (
        <StateBlock kind="error" title="Dashboard unavailable" description={dashboard.error?.message ?? "The service could not load your dashboard."} action={<button type="button" className="btn btn-outline-primary" onClick={onRefresh}>Retry</button>} />
      ) : (
        <>
          <div className="row g-3 mb-4">
            <div className="col-12 col-sm-6 col-xl-3"><MetricCard title="Unassigned Tickets" metric={data.metrics.unassignedTickets} /></div>
            <div className="col-12 col-sm-6 col-xl-3"><MetricCard title="My Active Tickets" metric={data.metrics.myActiveTickets} /></div>
            <div className="col-12 col-sm-6 col-xl-3">
              <MetricCard title="My Active Actions" metric={data.metrics.myActiveActions} onClick={(event) => openActions(data.metrics.myActiveActions.href, event)} />
            </div>
            <div className="col-12 col-sm-6 col-xl-3"><MetricCard title="High/Urgent Tickets" metric={data.metrics.highUrgentTickets} /></div>
          </div>

          <StatusCountGrid counts={data.statusCounts} />

          <div className="row g-3 mb-4">
            <div className="col-12 col-lg-6">
              <TicketPreviewSection
                title="Priority and Recently Updated Tickets"
                tickets={data.previews.priorityRecentTickets.data}
                href={data.previews.priorityRecentTickets.href}
                dateLabel="Updated"
                dateFor={(ticket) => ticket.updatedAt}
                emptyText="There are no active Tickets in this preview."
                ticketBase="/staff/tickets"
              />
            </div>
            <div className="col-12 col-lg-6">
              <ActionPreviewSection
                actions={data.previews.myCompletedActions.data}
                href={data.previews.myCompletedActions.href}
                onOpen={(event) => openActions(data.previews.myCompletedActions.href, event)}
              />
            </div>
          </div>

          {actionsLocation.valid && actionsLocation.view && (
            <section className="zen-card p-3 mb-4" aria-labelledby="my-actions-heading">
              <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-start gap-3 mb-3">
                <div>
                  <h2 className="h5 mb-1" id="my-actions-heading" ref={actionsHeading} tabIndex={-1}>My Actions</h2>
                  <p className="small zen-muted mb-0" data-testid="my-actions-view">
                    {actionsLocation.view === "active-assigned" ? "Active Actions assigned to you for current-cycle, active Tickets." : `Actions completed by you from ${formatDashboardDate(actionsLocation.from!)} through ${formatDashboardDate(actionsLocation.through!)} (Bangkok time).`}
                  </p>
                </div>
                <div className="d-flex flex-wrap align-items-end gap-2">
                  <label className="small fw-semibold" htmlFor="dashboard-action-page-size">
                    Actions per page
                    <select id="dashboard-action-page-size" className="form-select form-select-sm mt-1" value={actionsLocation.pageSize} onChange={(event) => updateActionLocation({ pageSize: Number(event.target.value) as 10 | 20 | 50 })}>
                      {PAGE_SIZES.map((size) => <option value={size} key={size}>{size}</option>)}
                    </select>
                  </label>
                  <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setActionsReload((value) => value + 1)} disabled={visibleActions.loading} aria-busy={visibleActions.loading}>Refresh Actions</button>
                </div>
              </div>

              {visibleActions.error && visibleActions.data && (
                <DashboardError forbidden={visibleActions.forbidden} error={visibleActions.error.message} staleAt={visibleActions.receivedAt ?? undefined} staleLabel="Actions result" retry={() => setActionsReload((value) => value + 1)} />
              )}
              {visibleActions.error && !visibleActions.data && (
                <StateBlock kind="error" title={visibleActions.forbidden ? "You do not have access to these Actions." : "Actions unavailable"} description={visibleActions.forbidden ? "Return to your permitted workspace." : "The Actions could not be loaded."} action={!visibleActions.forbidden ? <button type="button" className="btn btn-outline-primary" onClick={() => setActionsReload((value) => value + 1)}>Retry Actions</button> : undefined} />
              )}
              {visibleActions.loading && visibleActions.data && <p className="small zen-muted" role="status">Refreshing this Actions page…</p>}
              {visibleActions.loading && !visibleActions.data ? <StateBlock kind="loading" title="Loading your Actions…" /> : null}
              {!visibleActions.loading && !visibleActions.error && visibleActions.data?.data.length === 0 && (
                <StateBlock
                  kind="empty"
                  title={visibleActions.data.total > 0 ? "No Actions on this page" : "No Actions match this view"}
                  description={visibleActions.data.total > 0
                    ? "The list changed after this page was opened. Use the page controls to return to available Actions."
                    : actionsLocation.view === "active-assigned" ? "There are no unfinished current-cycle Actions assigned to you on active Tickets." : "You completed no Actions during this snapshot period."}
                />
              )}
              {visibleActions.data && (
                <>
                  <p className="small zen-muted" data-testid="my-actions-total">{visibleActions.data.total} Actions in this view</p>
                  {visibleActions.data.data.length > 0 && <DashboardActionsTable actions={visibleActions.data.data} />}
                  <Pagination
                    page={visibleActions.data.page}
                    pageSize={visibleActions.data.pageSize}
                    total={visibleActions.data.total}
                    totalPages={visibleActions.data.totalPages}
                    itemLabel="Actions"
                    onPageChange={(page) => updateActionLocation({ page })}
                  />
                </>
              )}
            </section>
          )}
          {!actionsLocation.valid && (
            <StateBlock kind="error" title="This Dashboard link has invalid Action filters" description="Check the view, date window, and page settings, or clear the invalid Action link." action={<button type="button" className="btn btn-outline-primary" onClick={() => setSearchParams({}, { replace: true })}>Clear Action filters</button>} />
          )}
        </>
      )}
    </DashboardPageFrame>
  );
}
