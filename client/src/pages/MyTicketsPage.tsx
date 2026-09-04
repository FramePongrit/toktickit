import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchCategories, fetchRelatedSystems } from "../api/referenceData.js";
import { fetchMyTickets } from "../api/tickets.js";
import type { TicketSortField } from "../api/tickets.js";
import { Pagination } from "../components/Pagination.js";
import { StateBlock } from "../components/StateBlock.js";
import { TicketList } from "../components/TicketList.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import type { PagedResult, Priority, ReferenceItem, TicketListItem } from "../types/index.js";

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const PAGE_SIZE = 10;

interface Filters {
  q: string;
  categoryId: string;
  relatedSystemId: string;
  priority: string;
}

const NO_FILTERS: Filters = { q: "", categoryId: "", relatedSystemId: "", priority: "" };

export function MyTicketsPage() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<TicketSortField>("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

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
    filters.priority !== "";

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
    setState("loading");

    fetchMyTickets({
      page,
      pageSize: PAGE_SIZE,
      sort,
      order,
      ...(debouncedQuery !== "" && { q: debouncedQuery }),
      ...(filters.categoryId !== "" && { categoryId: Number(filters.categoryId) }),
      ...(filters.relatedSystemId !== "" && { relatedSystemId: Number(filters.relatedSystemId) }),
      ...(filters.priority !== "" && { priority: filters.priority as Priority }),
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
    sort,
    order,
    debouncedQuery,
    filters.categoryId,
    filters.relatedSystemId,
    filters.priority,
    reload,
  ]);

  function updateFilter<K extends keyof Filters>(field: K, value: Filters[K]) {
    setFilters((previous) => ({ ...previous, [field]: value }));
    // Any filter change invalidates the current page number: page 3 of the old
    // result set is meaningless against the new one.
    setPage(1);
  }

  function clearFilters() {
    setFilters(NO_FILTERS);
    setPage(1);
  }

  function changeSort(field: TicketSortField) {
    if (field === sort) {
      setOrder((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setOrder("desc");
    }
    setPage(1);
  }

  return (
    <>
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-4">
        <div>
          <h1 className="h3 mb-1">My Tickets</h1>
          <p className="zen-muted mb-0">View and track all of your support requests.</p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={clearFilters}
            disabled={!filtersActive}
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
      </section>

      {state === "loading" && <StateBlock kind="loading" title="Loading your tickets…" />}

      {state === "error" && (
        <StateBlock
          kind="error"
          title="Could not load your tickets"
          description="The service did not respond. Your filters have been kept, so retrying repeats the same search."
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
            onPageChange={setPage}
          />
        </>
      )}
    </>
  );
}
