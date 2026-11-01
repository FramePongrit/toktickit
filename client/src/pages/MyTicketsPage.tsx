import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchCategories, fetchRelatedSystems } from "../api/referenceData.js";
import { fetchMyTickets } from "../api/tickets.js";
import type { TicketSortField } from "../api/tickets.js";
import { Pagination } from "../components/Pagination.js";
import { StateBlock } from "../components/StateBlock.js";
import { TicketList } from "../components/TicketList.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { isOffsetDateTime } from "../lib/offsetDateTime.js";
import type { PagedResult, Priority, ReferenceItem, TicketListItem } from "../types/index.js";
import type { TicketStatus } from "../types/index.js";

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const PAGE_SIZES = [10, 20, 50] as const;
const DEFAULT_PAGE_SIZE = 10;

interface Filters {
  q: string;
  categoryId: string;
  relatedSystemId: string;
  priority: string;
  status: string;
  statuses: string;
  updatedFrom: string;
  updatedThrough: string;
  resolvedFrom: string;
  resolvedThrough: string;
}

const NO_FILTERS: Filters = { q: "", categoryId: "", relatedSystemId: "", priority: "", status: "", statuses: "", updatedFrom: "", updatedThrough: "", resolvedFrom: "", resolvedThrough: "" };
const TICKET_STATUSES: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED", "RESOLVED", "CLOSED", "CANCELLED"];
const TICKET_SORTS: TicketSortField[] = ["createdAt", "ticketNumber", "requestedPriority", "summary", "updatedAt", "resolvedAt"];

function filtersFromParams(params: URLSearchParams): Filters {
  return {
    ...NO_FILTERS,
    q: params.get("q") ?? "",
    categoryId: params.get("categoryId") ?? "",
    relatedSystemId: params.get("relatedSystemId") ?? "",
    priority: params.get("priority") ?? "",
    status: params.get("status") ?? "",
    statuses: params.get("statuses") ?? "",
    updatedFrom: params.get("updatedFrom") ?? "",
    updatedThrough: params.get("updatedThrough") ?? "",
    resolvedFrom: params.get("resolvedFrom") ?? "",
    resolvedThrough: params.get("resolvedThrough") ?? "",
  };
}

function validTicketListUrl(params: URLSearchParams): boolean {
  const allowed = new Set(["page", "pageSize", "q", "categoryId", "relatedSystemId", "priority", "status", "statuses", "updatedFrom", "updatedThrough", "resolvedFrom", "resolvedThrough", "sort", "order"]);
  const keys = [...params.keys()];
  if (keys.some((key) => !allowed.has(key) || params.getAll(key).length !== 1)) return false;
  const value = (key: string) => params.get(key);
  const statuses = value("statuses");
  if (params.has("status") && statuses || params.has("statuses") && !statuses) return false;
  if (params.has("status") && !TICKET_STATUSES.includes(value("status") as TicketStatus)) return false;
  if (params.has("statuses")) {
    const parts = (statuses ?? "").split(",").map((item) => item.trim());
    if (parts.length > TICKET_STATUSES.length || !parts.every(Boolean) || new Set(parts).size !== parts.length || parts.some((item) => !TICKET_STATUSES.includes(item as TicketStatus))) return false;
  }
  if (value("priority") && !PRIORITIES.includes(value("priority") as Priority)) return false;
  if (value("sort") && !TICKET_SORTS.includes(value("sort") as TicketSortField)) return false;
  if (value("order") && value("order") !== "asc" && value("order") !== "desc") return false;
  if (value("page") && !/^[1-9]\d*$/.test(value("page")!)) return false;
  if (value("pageSize") && ![10, 20, 50].includes(Number(value("pageSize")))) return false;
  for (const key of ["categoryId", "relatedSystemId"]) if (value(key) && !/^[1-9]\d*$/.test(value(key)!)) return false;
  if ((value("q")?.length ?? 0) > 100) return false;
  for (const [from, through] of [["updatedFrom", "updatedThrough"], ["resolvedFrom", "resolvedThrough"]]) {
    for (const key of [from, through]) {
      const date = value(key);
      if (params.has(key) && !isOffsetDateTime(date)) return false;
    }
    const lower = value(from);
    const upper = value(through);
    if (lower && upper && Date.parse(lower) > Date.parse(upper)) return false;
  }
  return true;
}

function sortFromParams(params: URLSearchParams): TicketSortField {
  const sort = params.get("sort");
  return TICKET_SORTS.includes(sort as TicketSortField) ? sort as TicketSortField : "createdAt";
}

function pageFromParams(params: URLSearchParams): number {
  return Math.max(1, Number(params.get("page")) || 1);
}

function pageSizeFromParams(params: URLSearchParams): 10 | 20 | 50 {
  const pageSize = Number(params.get("pageSize"));
  return PAGE_SIZES.includes(pageSize as 10 | 20 | 50) ? pageSize as 10 | 20 | 50 : DEFAULT_PAGE_SIZE;
}

export function MyTicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchSignature = searchParams.toString();
  const params = new URLSearchParams(searchSignature);
  const invalidQuery = !validTicketListUrl(params);
  const filters = filtersFromParams(params);
  const sort = sortFromParams(params);
  const order = params.get("order") === "asc" ? "asc" : "desc";
  const page = pageFromParams(params);
  const pageSize = pageSizeFromParams(params);

  const [result, setResult] = useState<PagedResult<TicketListItem> | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [reload, setReload] = useState(0);

  const [categories, setCategories] = useState<ReferenceItem[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<ReferenceItem[]>([]);

  const debouncedQuery = useDebouncedValue(filters.q);

  // Whether any filter is active decides between the empty state and the
  // no-results state, which say different things (BR-41, BR-42).
  const filtersActive =
    debouncedQuery !== "" ||
    filters.categoryId !== "" ||
    filters.relatedSystemId !== "" ||
    filters.priority !== "" ||
    filters.status !== "" || filters.statuses !== "" ||
    filters.updatedFrom !== "" || filters.updatedThrough !== "" ||
    filters.resolvedFrom !== "" || filters.resolvedThrough !== "";
  const hasFilters = filtersActive || invalidQuery;
  const linkedFilterLabels = [
    filters.status && `Status: ${filters.status}`,
    filters.statuses && `Statuses: ${filters.statuses}`,
    filters.updatedFrom || filters.updatedThrough ? `Updated: ${filters.updatedFrom || "any date"} to ${filters.updatedThrough || "any date"}` : "",
    filters.resolvedFrom || filters.resolvedThrough ? `Resolved: ${filters.resolvedFrom || "any date"} to ${filters.resolvedThrough || "any date"}` : "",
  ].filter(Boolean);

  useEffect(() => {
    Promise.all([fetchCategories(), fetchRelatedSystems()])
      .then(([loadedCategories, loadedSystems]) => {
        setCategories(loadedCategories);
        setRelatedSystems(loadedSystems);
      })
      // The filter selects simply stay empty if reference data is unavailable;
      // the list itself reports its own failure.
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (invalidQuery) {
      setState("error");
      return () => { cancelled = true; };
    }
    setState("loading");

    fetchMyTickets({
      page,
      pageSize,
      sort,
      order,
      ...(debouncedQuery !== "" && { q: debouncedQuery }),
      ...(filters.categoryId !== "" && { categoryId: Number(filters.categoryId) }),
      ...(filters.relatedSystemId !== "" && { relatedSystemId: Number(filters.relatedSystemId) }),
      ...(filters.priority !== "" && { priority: filters.priority as Priority }),
      ...(filters.status !== "" && { status: filters.status as TicketStatus }),
      ...(filters.statuses !== "" && { statuses: filters.statuses }),
      ...(filters.updatedFrom !== "" && { updatedFrom: filters.updatedFrom }),
      ...(filters.updatedThrough !== "" && { updatedThrough: filters.updatedThrough }),
      ...(filters.resolvedFrom !== "" && { resolvedFrom: filters.resolvedFrom }),
      ...(filters.resolvedThrough !== "" && { resolvedThrough: filters.resolvedThrough }),
    })
      .then((paged) => {
        if (cancelled) return;
        setResult(paged);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [
    page,
    pageSize,
    sort,
    order,
    debouncedQuery,
    filters.categoryId,
    filters.relatedSystemId,
    filters.priority,
    filters.status,
    filters.statuses,
    filters.updatedFrom,
    filters.updatedThrough,
    filters.resolvedFrom,
    filters.resolvedThrough,
    invalidQuery,
    reload,
  ]);

  function updateFilter<K extends keyof Filters>(field: K, value: Filters[K]) {
    const next = new URLSearchParams(searchSignature);
    if (value) next.set(field, value);
    else next.delete(field);
    // Any filter change invalidates the old page but preserves the dashboard's
    // query so refresh and browser history reproduce the same list.
    next.set("page", "1");
    setSearchParams(next, { replace: true });
  }

  function clearFilters() {
    setSearchParams({}, { replace: true });
  }

  function changeSort(field: TicketSortField) {
    const next = new URLSearchParams(searchSignature);
    next.set("sort", field);
    next.set("order", field === sort ? (order === "asc" ? "desc" : "asc") : "desc");
    next.set("page", "1");
    setSearchParams(next, { replace: true });
  }

  function changePage(nextPage: number) {
    const next = new URLSearchParams(searchSignature);
    next.set("page", String(nextPage));
    setSearchParams(next, { replace: true });
  }

  return (
    <>
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-4">
        <div>
          <h1 className="h3 mb-1" data-page-heading tabIndex={-1}>My Tickets</h1>
          <p className="zen-muted mb-0">View and track all of your support requests.</p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            Clear Filters
          </button>
          <Link className="btn btn-primary" to="/tickets/new">
            Create Ticket
          </Link>
        </div>
      </div>

      <section className="zen-card p-3 mb-4" aria-label="Filters">
        <div className="row g-3">
          <div className="col-12 col-md-6 col-lg-3">
            <label className="form-label fw-semibold" htmlFor="ticket-search">
              Search
            </label>
            <input
              id="ticket-search"
              type="search"
              className="form-control"
              placeholder="Search by ticket number or summary…"
              value={filters.q}
              onChange={(e) => updateFilter("q", e.target.value)}
            />
          </div>

          <div className="col-12 col-md-6 col-lg-3">
            <label className="form-label fw-semibold" htmlFor="filter-category">
              Category
            </label>
            <select
              id="filter-category"
              className="form-select"
              value={filters.categoryId}
              onChange={(e) => updateFilter("categoryId", e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-md-6 col-lg-3">
            <label className="form-label fw-semibold" htmlFor="filter-system">
              Related System
            </label>
            <select
              id="filter-system"
              className="form-select"
              value={filters.relatedSystemId}
              onChange={(e) => updateFilter("relatedSystemId", e.target.value)}
            >
              <option value="">All Related Systems</option>
              {relatedSystems.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-md-6 col-lg-3">
            <label className="form-label fw-semibold" htmlFor="filter-priority">
              Requested Priority
            </label>
            <select
              id="filter-priority"
              className="form-select"
              value={filters.priority}
              onChange={(e) => updateFilter("priority", e.target.value)}
            >
              <option value="">All Priorities</option>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority.charAt(0) + priority.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
        {linkedFilterLabels.length > 0 && <p className="form-text mt-3 mb-0" role="status">Dashboard filters: {linkedFilterLabels.join(" · ")}</p>}
      </section>

      {state === "loading" && <StateBlock kind="loading" title="Loading your tickets…" />}

      {state === "error" && (
        <StateBlock
          kind="error"
          title={invalidQuery ? "This Ticket link has invalid filters" : "Could not load your tickets"}
          description={invalidQuery ? "Review the status and date filters, or clear the link filters to start again." : "The service did not respond. Your filters have been kept, so retrying repeats the same search."}
          action={
            invalidQuery ? <button type="button" className="btn btn-outline-primary" onClick={clearFilters}>Clear Filters</button> :
              <button type="button" className="btn btn-outline-primary" onClick={() => setReload((n) => n + 1)}>Retry</button>
          }
        />
      )}

      {state === "ready" && result && result.total === 0 && !filtersActive && (
        <StateBlock
          kind="empty"
          title="You have not created any tickets yet"
          description="When you submit a support request it will appear here."
          action={
            <Link className="btn btn-primary" to="/tickets/new">
              Create Ticket
            </Link>
          }
        />
      )}

      {state === "ready" && result && result.total === 0 && filtersActive && (
        <StateBlock
          kind="no-results"
          title="No tickets match your filters"
          description="Try a different search term, or clear the filters to see all of your tickets."
          action={
            <button type="button" className="btn btn-outline-primary" onClick={clearFilters}>
              Clear Filters
            </button>
          }
        />
      )}

      {state === "ready" && result && result.total > 0 && (
        <>
          <TicketList
            tickets={result.data}
            sort={sort}
            order={order}
            onSortChange={changeSort}
          />
          <Pagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            totalPages={result.totalPages}
            onPageChange={changePage}
          />
        </>
      )}
    </>
  );
}
