import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  fetchStaffQueue,
  fetchTicketOwners,
  type SortOrder,
  type StaffQueueQuery,
  type StaffQueueScope,
  type StaffQueueSortField,
} from "../api/tickets.js";
import { fetchCategories } from "../api/referenceData.js";
import { PriorityBadge, StatusBadge } from "../components/Badges.js";
import { Pagination } from "../components/Pagination.js";
import { StateBlock } from "../components/StateBlock.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { ApiError } from "../lib/http.js";
import { roleLabel } from "../context/AuthContext.js";
import type {
  Priority,
  ReferenceItem,
  StaffQueueItem,
  TicketOwnerOption,
  TicketStatus,
} from "../types/index.js";

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES: TicketStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "REOPENED",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
];
const PAGE_SIZES = [10, 20, 50] as const;
const SORT_FIELDS: Array<{ value: StaffQueueSortField; label: string; defaultOrder: SortOrder }> = [
  { value: "itPriority", label: "IT Priority", defaultOrder: "desc" },
  { value: "createdAt", label: "Created date", defaultOrder: "asc" },
  { value: "updatedAt", label: "Updated date", defaultOrder: "asc" },
  { value: "ticketNumber", label: "Ticket number", defaultOrder: "asc" },
  { value: "status", label: "Status", defaultOrder: "asc" },
];

interface FilterState {
  q: string;
  status: string;
  itPriority: string;
  categoryId: string;
  owner: string;
}

interface PageState {
  scope: StaffQueueScope;
  filters: FilterState;
  sort: StaffQueueSortField;
  order: SortOrder;
  page: number;
  pageSize: 10 | 20 | 50;
}

const DEFAULT_FILTERS: FilterState = { q: "", status: "", itPriority: "", categoryId: "", owner: "" };

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isStatus(value: string | null): value is TicketStatus {
  return Boolean(value && STATUSES.includes(value as TicketStatus));
}

function isPriority(value: string | null): value is Priority {
  return Boolean(value && PRIORITIES.includes(value as Priority));
}

function isSort(value: string | null): value is StaffQueueSortField {
  return Boolean(value && SORT_FIELDS.some((field) => field.value === value));
}

function parsePositiveInteger(value: string | null, fallback: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return parsed > 0 ? parsed : fallback;
}

function readPageState(params: URLSearchParams): PageState {
  const pageSizeValue = Number(params.get("pageSize"));
  const pageSize = PAGE_SIZES.includes(pageSizeValue as 10 | 20 | 50)
    ? (pageSizeValue as 10 | 20 | 50)
    : 10;
  const sort = isSort(params.get("sort")) ? (params.get("sort") as StaffQueueSortField) : "itPriority";
  const order = params.get("order") === "asc" || params.get("order") === "desc"
    ? (params.get("order") as SortOrder)
    : SORT_FIELDS.find((field) => field.value === sort)?.defaultOrder ?? "desc";
  const owner = params.get("owner") ?? "";
  const safeOwner = owner === "me" || owner === "unassigned" || /^\d+$/.test(owner) ? owner : "";

  return {
    scope: params.get("scope") === "all" ? "all" : "active",
    filters: {
      q: params.get("q") ?? "",
      status: isStatus(params.get("status")) ? params.get("status")! : "",
      itPriority: isPriority(params.get("itPriority")) ? params.get("itPriority")! : "",
      categoryId: /^\d+$/.test(params.get("categoryId") ?? "") ? params.get("categoryId")! : "",
      owner: safeOwner,
    },
    sort,
    order,
    page: parsePositiveInteger(params.get("page"), 1),
    pageSize,
  };
}

function queryFromState(state: PageState, search: string): StaffQueueQuery {
  const query: StaffQueueQuery = {
    scope: state.scope,
    page: state.page,
    pageSize: state.pageSize,
    sort: state.sort,
    order: state.order,
  };
  const trimmedSearch = search.trim();
  if (trimmedSearch) query.q = trimmedSearch;
  if (state.filters.status) query.status = state.filters.status as TicketStatus;
  if (state.filters.itPriority) query.itPriority = state.filters.itPriority as Priority;
  if (state.filters.categoryId) query.categoryId = Number(state.filters.categoryId);
  if (state.filters.owner === "me" || state.filters.owner === "unassigned") query.owner = state.filters.owner;
  else if (/^\d+$/.test(state.filters.owner)) query.owner = Number(state.filters.owner);
  return query;
}

function stateToParams(state: PageState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.scope !== "active") params.set("scope", state.scope);
  if (state.filters.q) params.set("q", state.filters.q);
  if (state.filters.status) params.set("status", state.filters.status);
  if (state.filters.itPriority) params.set("itPriority", state.filters.itPriority);
  if (state.filters.categoryId) params.set("categoryId", state.filters.categoryId);
  if (state.filters.owner) params.set("owner", state.filters.owner);
  params.set("sort", state.sort);
  params.set("order", state.order);
  params.set("page", String(state.page));
  params.set("pageSize", String(state.pageSize));
  return params;
}

function ResolutionIndication({ ticket }: { ticket: StaffQueueItem }) {
  if (!ticket.resolutionIndication) return <span className="zen-muted">Not indicated</span>;
  return (
    <span className="queue-indication" data-testid="resolution-indication">
      <span aria-hidden="true">✓</span>
      <span>
        Resolution indicated
        <span className="d-block fw-normal zen-muted" style={{ fontSize: "0.8rem" }}>
          {formatDate(ticket.resolutionIndication.indicatedAt)} by {ticket.resolutionIndication.indicatedBy.fullName}
        </span>
      </span>
    </span>
  );
}

function OwnerName({ owner }: { owner: TicketOwnerOption | null }) {
  return owner ? (
    <span>
      {owner.fullName}
      <span className="d-block zen-muted" style={{ fontSize: "0.8rem" }}>{roleLabel(owner.role)}</span>
    </span>
  ) : <span className="zen-muted">Unassigned</span>;
}

function SortButton({
  field,
  label,
  sort,
  order,
  onChange,
}: {
  field: StaffQueueSortField;
  label: string;
  sort: StaffQueueSortField;
  order: SortOrder;
  onChange: (field: StaffQueueSortField) => void;
}) {
  const active = field === sort;
  return (
    <button
      type="button"
      className="btn btn-link p-0 text-start text-decoration-none fw-semibold"
      onClick={() => onChange(field)}
    >
      {label} <span aria-hidden="true">{active ? (order === "asc" ? "▲" : "▼") : "⇅"}</span>
    </button>
  );
}

function QueueTable({ ticket }: { ticket: StaffQueueItem }) {
  return (
    <tr>
      <td><Link to={`/staff/tickets/${ticket.id}`} className="fw-semibold">{ticket.ticketNumber}</Link><span className="d-block zen-muted">{formatDate(ticket.createdAt)}</span></td>
      <td><span className="fw-semibold">{ticket.summary}</span><span className="d-block zen-muted">{ticket.requester.fullName}</span></td>
      <td>{ticket.category.name}</td>
      <td><PriorityBadge priority={ticket.requestedPriority} testId="requested-priority-badge" /><span className="d-block mt-1"><PriorityBadge priority={ticket.itPriority} testId="it-priority-badge" /></span></td>
      <td><StatusBadge status={ticket.currentStatus} /><span className="d-block mt-1"><ResolutionIndication ticket={ticket} /></span></td>
      <td><OwnerName owner={ticket.owner} /></td>
      <td><span className="d-block">{formatDate(ticket.updatedAt)}</span><Link to={`/staff/tickets/${ticket.id}`} className="btn btn-sm btn-outline-primary mt-2">Open</Link></td>
    </tr>
  );
}

function QueueTableHeader({ sort, order, onSortChange }: { sort: StaffQueueSortField; order: SortOrder; onSortChange: (field: StaffQueueSortField) => void }) {
  const ariaSort = (field: StaffQueueSortField): "ascending" | "descending" | "none" =>
    sort === field ? (order === "asc" ? "ascending" : "descending") : "none";
  const ticketColumnSort = sort === "ticketNumber" || sort === "createdAt" ? ariaSort(sort) : "none";
  return (
    <thead>
      <tr>
        <th scope="col" className="queue-col-ticket" aria-sort={ticketColumnSort}><SortButton field="ticketNumber" label="Ticket / date" sort={sort} order={order} onChange={onSortChange} /><span className="d-block mt-1"><SortButton field="createdAt" label="Created date" sort={sort} order={order} onChange={onSortChange} /></span></th>
        <th scope="col" className="queue-col-summary">Summary / requester</th>
        <th scope="col" className="queue-col-category">Category</th>
        <th scope="col" className="queue-col-priority" aria-sort={ariaSort("itPriority")}><SortButton field="itPriority" label="Requested + IT priority" sort={sort} order={order} onChange={onSortChange} /></th>
        <th scope="col" className="queue-col-status" aria-sort={ariaSort("status")}><SortButton field="status" label="Status" sort={sort} order={order} onChange={onSortChange} /></th>
        <th scope="col" className="queue-col-owner">Owner</th>
        <th scope="col" className="queue-col-updated" aria-sort={ariaSort("updatedAt")}><SortButton field="updatedAt" label="Updated / action" sort={sort} order={order} onChange={onSortChange} /></th>
      </tr>
    </thead>
  );
}

function QueueCards({ tickets }: { tickets: StaffQueueItem[] }) {
  return (
    <div className="staff-queue-cards d-lg-none" data-testid="staff-queue-cards">
      {tickets.map((ticket) => (
        <article className="zen-card staff-queue-card p-3 mb-3" key={ticket.id}>
          <div className="d-flex justify-content-between align-items-start gap-2">
            <Link to={`/staff/tickets/${ticket.id}`} className="fw-semibold">{ticket.ticketNumber}</Link>
            <span className="zen-muted">{formatDate(ticket.createdAt)}</span>
          </div>
          <h2 className="h5 mt-2 mb-1">{ticket.summary}</h2>
          <p className="zen-muted mb-2">Requester: {ticket.requester.fullName}</p>
          <dl className="row mb-0 gy-2">
            <dt className="col-5">Category</dt><dd className="col-7">{ticket.category.name}</dd>
            <dt className="col-5">Priorities</dt><dd className="col-7"><PriorityBadge priority={ticket.requestedPriority} testId="requested-priority-badge" /> <PriorityBadge priority={ticket.itPriority} testId="it-priority-badge" /></dd>
            <dt className="col-5">Status</dt><dd className="col-7"><StatusBadge status={ticket.currentStatus} /></dd>
            <dt className="col-5">Owner</dt><dd className="col-7"><OwnerName owner={ticket.owner} /></dd>
            <dt className="col-5">Resolution</dt><dd className="col-7"><ResolutionIndication ticket={ticket} /></dd>
            <dt className="col-5">Updated</dt><dd className="col-7">{formatDate(ticket.updatedAt)}</dd>
          </dl>
          <Link to={`/staff/tickets/${ticket.id}`} className="btn btn-outline-primary w-100 mt-3">Open ticket</Link>
        </article>
      ))}
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div className="staff-queue-skeleton" data-testid="staff-queue-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">Loading the ticket queue…</span>
      <div className="staff-queue-table d-none d-lg-block zen-card" data-testid="staff-queue-skeleton-table" aria-hidden="true">
        <table className="table align-middle mb-0">
          <tbody>
            {Array.from({ length: 4 }, (_, index) => (
              <tr className="queue-skeleton-row" key={index}>
                {Array.from({ length: 7 }, (_, cell) => <td key={cell}><span className="queue-skeleton-block" style={{ width: `${55 + ((index + cell) % 4) * 10}%` }} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="staff-queue-cards d-lg-none" data-testid="staff-queue-skeleton-cards" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="zen-card staff-queue-card queue-skeleton-card p-3 mb-3" key={index}>
            <span className="queue-skeleton-block mb-3" style={{ width: "34%" }} />
            <span className="queue-skeleton-block mb-2" style={{ width: "82%" }} />
            <span className="queue-skeleton-block mb-2" style={{ width: "62%" }} />
            <span className="queue-skeleton-block" style={{ width: "48%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function StaffTicketQueuePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<PageState>(() => readPageState(searchParams));
  const [searchInput, setSearchInput] = useState(state.filters.q);
  const [result, setResult] = useState<{ data: StaffQueueItem[]; page: number; pageSize: number; total: number; totalPages: number } | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [reload, setReload] = useState(0);
  const [categories, setCategories] = useState<ReferenceItem[]>([]);
  const [owners, setOwners] = useState<TicketOwnerOption[]>([]);
  const [ownerState, setOwnerState] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const [ownerReload, setOwnerReload] = useState(0);
  const debouncedSearch = useDebouncedValue(searchInput);

  const filtersActive = Boolean(
    searchInput.trim() || state.filters.status || state.filters.itPriority || state.filters.categoryId || state.filters.owner
  );

  useEffect(() => {
    setSearchParams(stateToParams({ ...state, filters: { ...state.filters, q: searchInput } }), { replace: true });
  }, [state, searchInput, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setLoadError(null);
    fetchStaffQueue(queryFromState(state, debouncedSearch))
      .then((next) => {
        if (cancelled) return;
        setResult(next);
        setLoadState("ready");
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setLoadError(caught instanceof ApiError ? caught : new ApiError(0, "UNEXPECTED", "The service is unavailable. Please try again."));
        setLoadState("error");
      });
    return () => { cancelled = true; };
  }, [state.scope, state.page, state.pageSize, state.sort, state.order, state.filters.status, state.filters.itPriority, state.filters.categoryId, state.filters.owner, debouncedSearch, reload]);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setOwnerState("loading");
    fetchTicketOwners()
      .then((next) => { if (!cancelled) { setOwners(next); setOwnerState("ready"); } })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setOwnerState(caught instanceof ApiError && caught.status === 403 ? "forbidden" : "error");
      });
    return () => { cancelled = true; };
  }, [ownerReload]);

  function updateState(patch: Partial<PageState>, resetPage = true) {
    setState((previous) => ({ ...previous, ...patch, page: resetPage ? 1 : patch.page ?? previous.page }));
  }

  function updateFilter(field: keyof FilterState, value: string) {
    if (field === "q") {
      setSearchInput(value);
      setState((previous) => ({ ...previous, page: 1 }));
      return;
    }
    setState((previous) => ({ ...previous, filters: { ...previous.filters, [field]: value }, page: 1 }));
  }

  function clearFilters() {
    setSearchInput("");
    setState((previous) => ({
      ...previous,
      filters: { ...DEFAULT_FILTERS },
      sort: "itPriority",
      order: "desc",
      page: 1,
      pageSize: 10,
    }));
  }

  function changeSort(field: StaffQueueSortField) {
    setState((previous) => {
      if (previous.sort === field) return { ...previous, order: previous.order === "asc" ? "desc" : "asc", page: 1 };
      return { ...previous, sort: field, order: SORT_FIELDS.find((item) => item.value === field)?.defaultOrder ?? "asc", page: 1 };
    });
  }

  const ownerOptions = useMemo(() => owners.map((owner) => ({ ...owner, label: `${owner.fullName} — ${roleLabel(owner.role)}` })), [owners]);
  const stateDescription = state.scope === "active" ? "Active Tickets are work that can still be progressed." : "All Tickets includes active and final historical work.";

  return (
    <section data-testid="staff-landing" className="staff-queue-page">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-start gap-3 mb-4">
        <div>
          <h1 className="h3 mb-1" data-page-heading tabIndex={-1}>Ticket Queue</h1>
          <h2 className="visually-hidden">Staff Queue</h2>
          <p className="zen-muted mb-0">Find and prioritize support work for Requesters.</p>
        </div>
        <div className="btn-group" role="group" aria-label="Ticket scope">
          <button type="button" className="btn btn-outline-primary" aria-pressed={state.scope === "active"} onClick={() => updateState({ scope: "active" })}>Active</button>
          <button type="button" className="btn btn-outline-primary" aria-pressed={state.scope === "all"} onClick={() => updateState({ scope: "all" })}>All</button>
        </div>
      </div>
      <p className="zen-muted mb-3" aria-live="polite">{stateDescription}</p>

      <section className="zen-card p-3 mb-4" aria-label="Queue filters">
        <div className="row g-3">
          <div className="col-12 col-md-6 col-lg-4">
            <label className="form-label fw-semibold" htmlFor="staff-queue-search">Search</label>
            <input id="staff-queue-search" type="search" className="form-control" placeholder="Ticket number, summary, requester…" value={searchInput} onChange={(event) => updateFilter("q", event.target.value)} />
          </div>
          <div className="col-12 col-md-6 col-lg-4">
            <label className="form-label fw-semibold" htmlFor="staff-queue-status">Status</label>
            <select id="staff-queue-status" className="form-select" value={state.filters.status} onChange={(event) => updateFilter("status", event.target.value)}><option value="">All statuses</option>{STATUSES.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select>
          </div>
          <div className="col-12 col-md-6 col-lg-4">
            <label className="form-label fw-semibold" htmlFor="staff-queue-it-priority">IT Priority</label>
            <select id="staff-queue-it-priority" className="form-select" value={state.filters.itPriority} onChange={(event) => updateFilter("itPriority", event.target.value)}><option value="">All IT priorities</option>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{titleCase(priority)}</option>)}</select>
          </div>
          <div className="col-12 col-md-6 col-lg-4">
            <label className="form-label fw-semibold" htmlFor="staff-queue-category">Category</label>
            <select id="staff-queue-category" className="form-select" value={state.filters.categoryId} onChange={(event) => updateFilter("categoryId", event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          </div>
          <div className="col-12 col-md-6 col-lg-4">
            <label className="form-label fw-semibold" htmlFor="staff-queue-owner">Owner</label>
            <select id="staff-queue-owner" className="form-select" value={state.filters.owner} onChange={(event) => updateFilter("owner", event.target.value)}>
              <option value="">All owners</option>
              <option value="me">My Tickets</option>
              <option value="unassigned">Unassigned</option>
              {ownerOptions.map((owner) => <option key={owner.id} value={owner.id}>{owner.label}</option>)}
            </select>
            {ownerState === "loading" && <div className="form-text" role="status" data-testid="owner-directory-feedback">Loading eligible owners…</div>}
            {ownerState === "error" && <div className="zen-field-error" role="alert" data-testid="owner-directory-feedback">Eligible owners could not be loaded. <button type="button" className="btn btn-link p-0 align-baseline" onClick={() => setOwnerReload((value) => value + 1)}>Retry</button></div>}
            {ownerState === "forbidden" && <div className="zen-field-error" role="alert" data-testid="owner-directory-feedback">Eligible owner choices are unavailable for this account.</div>}
          </div>
          <div className="col-12 col-md-6 col-lg-4">
            <label className="form-label fw-semibold" htmlFor="staff-queue-sort">Sort</label>
            <select id="staff-queue-sort" className="form-select" value={state.sort} onChange={(event) => updateState({ sort: event.target.value as StaffQueueSortField })}>{SORT_FIELDS.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}</select>
          </div>
          <div className="col-12 col-md-6 col-lg-4">
            <label className="form-label fw-semibold" htmlFor="staff-queue-order">Order</label>
            <select id="staff-queue-order" className="form-select" value={state.order} onChange={(event) => updateState({ order: event.target.value as SortOrder })}><option value="asc">Ascending</option><option value="desc">Descending</option></select>
          </div>
          <div className="col-12 col-md-6 col-lg-4">
            <label className="form-label fw-semibold" htmlFor="staff-queue-page-size">Page size</label>
            <select id="staff-queue-page-size" className="form-select" value={state.pageSize} onChange={(event) => updateState({ pageSize: Number(event.target.value) as 10 | 20 | 50 })}><option value={10}>10 tickets</option><option value={20}>20 tickets</option><option value={50}>50 tickets</option></select>
          </div>
        </div>
        <button type="button" className="btn btn-outline-primary mt-3" onClick={clearFilters} disabled={!filtersActive}>Clear Filters</button>
      </section>

      {loadState === "loading" && <QueueSkeleton />}
      {loadState === "error" && (
        <StateBlock
          kind="error"
          title={loadError?.status === 403 ? "You do not have access to the Staff Queue" : "Could not load the ticket queue"}
          description={loadError?.status === 403 ? "Only IT Staff and Administrators can view this queue." : "The service did not respond. Your query has been kept, so you can safely retry."}
          action={loadError?.status === 403 ? <Link className="btn btn-outline-primary" to="/">Return to your workspace</Link> : <button type="button" className="btn btn-outline-primary" onClick={() => setReload((value) => value + 1)}>Retry</button>}
        />
      )}
      {loadState === "ready" && result && result.total === 0 && !filtersActive && <StateBlock kind="empty" title={`No Tickets in this ${state.scope === "active" ? "scope" : "view"}.`} description={stateDescription} />}
      {loadState === "ready" && result && result.total === 0 && filtersActive && <StateBlock kind="no-results" title="No Tickets match these filters." description="Try a different search or clear the filters to see more Tickets." action={<button type="button" className="btn btn-outline-primary" onClick={clearFilters}>Clear Filters</button>} />}
      {loadState === "ready" && result && result.total > 0 && (
        <>
          <div className="d-flex justify-content-between align-items-center gap-2 mb-2"><p className="zen-muted mb-0" aria-live="polite">Showing {(result.page - 1) * result.pageSize + 1} to {Math.min(result.page * result.pageSize, result.total)} of {result.total} tickets</p><span className="zen-muted">{result.total} total</span></div>
          <div className="staff-queue-table d-none d-lg-block zen-card" data-testid="staff-queue-table">
            <table className="table table-hover align-middle mb-0"><QueueTableHeader sort={state.sort} order={state.order} onSortChange={changeSort} /><tbody>{result.data.map((ticket) => <QueueTable key={ticket.id} ticket={ticket} />)}</tbody></table>
          </div>
          <QueueCards tickets={result.data} />
          <Pagination page={result.page} pageSize={result.pageSize} total={result.total} totalPages={result.totalPages} onPageChange={(page) => updateState({ page }, false)} />
        </>
      )}
    </section>
  );
}
