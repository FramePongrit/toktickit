import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MyTicketsPage } from "../../src/pages/MyTicketsPage.js";
import * as referenceData from "../../src/api/referenceData.js";
import * as ticketsApi from "../../src/api/tickets.js";
import type { PagedResult, TicketListItem } from "../../src/types/index.js";

const CATEGORIES = [
  { id: 1, name: "Account and Access" },
  { id: 2, name: "Hardware" },
];
const SYSTEMS = [
  { id: 1, name: "Email" },
  { id: 8, name: "Corporate Laptop" },
];

function ticket(overrides: Partial<TicketListItem> = {}): TicketListItem {
  return {
    id: 1,
    ticketNumber: "TKT-2026-000001",
    summary: "Laptop battery drains quickly",
    requestedPriority: "MEDIUM",
    currentStatus: "NEW",
    createdAt: "2026-09-01T09:14:00.000Z",
    category: CATEGORIES[1],
    relatedSystem: SYSTEMS[1],
    attachmentCount: 0,
    ...overrides,
  };
}

function paged(data: TicketListItem[], overrides: Partial<PagedResult<TicketListItem>> = {}) {
  return {
    data,
    page: 1,
    pageSize: 10,
    total: data.length,
    totalPages: data.length === 0 ? 0 : 1,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/tickets"]}>
      <Routes>
        <Route path="/tickets" element={<MyTicketsPage />} />
        <Route path="/tickets/new" element={<h1>Create Ticket</h1>} />
        <Route path="/tickets/:id" element={<h1>Ticket detail</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

/** The last query the page sent to the API. */
function lastQuery(spy: { mock: { calls: unknown[][] } }): Partial<ticketsApi.TicketQuery> {
  const { calls } = spy.mock;
  return calls[calls.length - 1][0] as ticketsApi.TicketQuery;
}

beforeEach(() => {
  vi.spyOn(referenceData, "fetchCategories").mockResolvedValue(CATEGORIES);
  vi.spyOn(referenceData, "fetchRelatedSystems").mockResolvedValue(SYSTEMS);
});

describe("My Tickets — list", () => {
  it("renders the tickets the server returned", async () => {
    vi.spyOn(ticketsApi, "fetchMyTickets").mockResolvedValue(
      paged([
        ticket(),
        ticket({ id: 2, ticketNumber: "TKT-2026-000002", summary: "Cannot connect to VPN" }),
      ])
    );

    renderPage();

    expect(await screen.findAllByText("TKT-2026-000001")).not.toHaveLength(0);
    expect(screen.getAllByText("Cannot connect to VPN").length).toBeGreaterThan(0);
  });

  it("UI-15: renders priority and status as badges carrying their text", async () => {
    vi.spyOn(ticketsApi, "fetchMyTickets").mockResolvedValue(
      paged([ticket({ requestedPriority: "URGENT" })])
    );

    renderPage();

    const badges = await screen.findAllByTestId("priority-badge");
    // Colour carries emphasis, the label carries the meaning (AC-48).
    expect(badges[0]).toHaveTextContent("Urgent");
    expect(screen.getAllByTestId("status-badge")[0]).toHaveTextContent("New");
  });

  it("links each ticket to its detail screen", async () => {
    vi.spyOn(ticketsApi, "fetchMyTickets").mockResolvedValue(paged([ticket({ id: 42 })]));

    renderPage();

    const links = await screen.findAllByRole("link", { name: "TKT-2026-000001" });
    expect(links[0]).toHaveAttribute("href", "/tickets/42");
  });

  it("requests the default sort on first load", async () => {
    const spy = vi.spyOn(ticketsApi, "fetchMyTickets").mockResolvedValue(paged([ticket()]));

    renderPage();

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(lastQuery(spy)).toMatchObject({ page: 1, pageSize: 10, sort: "createdAt", order: "desc" });
  });
});

describe("My Tickets — states", () => {
  it("shows a loading state while the request is in flight", async () => {
    let resolve: (value: PagedResult<TicketListItem>) => void = () => {};
    vi.spyOn(ticketsApi, "fetchMyTickets").mockReturnValue(
      new Promise<PagedResult<TicketListItem>>((r) => {
        resolve = r;
      })
    );

    renderPage();

    expect(screen.getByText(/Loading your tickets/i)).toBeInTheDocument();
    resolve(paged([ticket()]));
    await waitFor(() => expect(screen.queryByText(/Loading your tickets/i)).not.toBeInTheDocument());
  });

  it("UI-10: shows the empty state when the requester has no tickets at all", async () => {
    vi.spyOn(ticketsApi, "fetchMyTickets").mockResolvedValue(paged([]));

    renderPage();

    expect(await screen.findByText(/have not created any tickets yet/i)).toBeInTheDocument();
    // The empty state offers a way forward rather than a dead end.
    expect(screen.getAllByRole("link", { name: /Create Ticket/i }).length).toBeGreaterThan(0);
  });

  it("UI-11: shows a distinct no-results state when filters match nothing", async () => {
    const spy = vi
      .spyOn(ticketsApi, "fetchMyTickets")
      .mockResolvedValue(paged([ticket()]))
      .mockResolvedValueOnce(paged([ticket()]));

    renderPage();
    await screen.findAllByText("TKT-2026-000001");

    spy.mockResolvedValue(paged([]));
    fireEvent.change(screen.getByLabelText(/^Category$/i), { target: { value: "2" } });

    expect(await screen.findByText(/No tickets match your filters/i)).toBeInTheDocument();
    // Must not tell the requester they have no tickets — they do (BR-42).
    expect(screen.queryByText(/have not created any tickets yet/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Clear Filters/i }).length).toBeGreaterThan(0);
  });

  it("UI-11: Clear Filters restores the unfiltered list", async () => {
    const spy = vi.spyOn(ticketsApi, "fetchMyTickets").mockResolvedValue(paged([ticket()]));

    renderPage();
    await screen.findAllByText("TKT-2026-000001");

    spy.mockResolvedValue(paged([]));
    fireEvent.change(screen.getByLabelText(/^Category$/i), { target: { value: "2" } });
    await screen.findByText(/No tickets match your filters/i);

    spy.mockResolvedValue(paged([ticket()]));
    fireEvent.click(screen.getAllByRole("button", { name: /Clear Filters/i })[0]);

    await waitFor(() => expect(lastQuery(spy).categoryId).toBeUndefined());
    expect(await screen.findAllByText("TKT-2026-000001")).not.toHaveLength(0);
  });

  it("UI-12: shows a retryable failure state and keeps the filters set", async () => {
    const spy = vi
      .spyOn(ticketsApi, "fetchMyTickets")
      .mockRejectedValue(new Error("Service unavailable"));

    renderPage();

    expect(await screen.findByText(/Could not load your tickets/i)).toBeInTheDocument();
    // The internal message must not reach the requester (BR-27).
    expect(screen.queryByText(/Service unavailable/)).not.toBeInTheDocument();

    spy.mockResolvedValue(paged([ticket()]));
    fireEvent.click(screen.getByRole("button", { name: /Retry/i }));

    expect(await screen.findAllByText("TKT-2026-000001")).not.toHaveLength(0);
  });
});

describe("My Tickets — search, filters and sorting", () => {
  it("UI-13: sends the search term after debouncing", async () => {
    const spy = vi.spyOn(ticketsApi, "fetchMyTickets").mockResolvedValue(paged([ticket()]));

    renderPage();
    await screen.findAllByText("TKT-2026-000001");

    fireEvent.change(screen.getByLabelText(/Search/i), { target: { value: "battery" } });

    await waitFor(() => expect(lastQuery(spy).q).toBe("battery"));
  });

  it("UI-13: sends each filter as its own parameter", async () => {
    const spy = vi.spyOn(ticketsApi, "fetchMyTickets").mockResolvedValue(paged([ticket()]));

    renderPage();
    await screen.findAllByText("TKT-2026-000001");

    fireEvent.change(screen.getByLabelText(/^Category$/i), { target: { value: "2" } });
    await waitFor(() => expect(lastQuery(spy).categoryId).toBe(2));

    fireEvent.change(screen.getByLabelText(/Related System/i), { target: { value: "8" } });
    await waitFor(() => expect(lastQuery(spy).relatedSystemId).toBe(8));

    fireEvent.change(screen.getByLabelText(/Requested Priority/i), { target: { value: "HIGH" } });
    await waitFor(() => expect(lastQuery(spy).priority).toBe("HIGH"));
  });

  it("never sends a requesterId — ownership comes from the header alone", async () => {
    const spy = vi.spyOn(ticketsApi, "fetchMyTickets").mockResolvedValue(paged([ticket()]));

    renderPage();
    await waitFor(() => expect(spy).toHaveBeenCalled());

    expect(lastQuery(spy)).not.toHaveProperty("requesterId");
  });

  it("toggles the sort direction when the same column is clicked twice", async () => {
    const spy = vi.spyOn(ticketsApi, "fetchMyTickets").mockResolvedValue(paged([ticket()]));

    renderPage();
    await screen.findAllByText("TKT-2026-000001");

    // Re-queried before each click: the table re-renders between them, so a
    // node captured earlier is detached and clicking it does nothing.
    const header = () => screen.getByRole("button", { name: /Ticket No\./i });

    fireEvent.click(header());
    await waitFor(() => expect(lastQuery(spy)).toMatchObject({ sort: "ticketNumber", order: "desc" }));

    fireEvent.click(header());
    await waitFor(() => expect(lastQuery(spy)).toMatchObject({ sort: "ticketNumber", order: "asc" }));
  });

  it("exposes the sorted column through aria-sort", async () => {
    vi.spyOn(ticketsApi, "fetchMyTickets").mockResolvedValue(paged([ticket()]));

    renderPage();
    await screen.findAllByText("TKT-2026-000001");

    const createdHeader = screen.getByRole("columnheader", { name: /Created Date/i });
    expect(createdHeader).toHaveAttribute("aria-sort", "descending");
  });

  it("returns to page 1 when a filter changes", async () => {
    const spy = vi
      .spyOn(ticketsApi, "fetchMyTickets")
      .mockResolvedValue(paged([ticket()], { page: 2, total: 25, totalPages: 3 }));

    renderPage();
    await screen.findAllByText("TKT-2026-000001");

    fireEvent.click(screen.getByRole("button", { name: "3" }));
    await waitFor(() => expect(lastQuery(spy).page).toBe(3));

    // Page 3 of the previous result set means nothing against a new filter.
    fireEvent.change(screen.getByLabelText(/^Category$/i), { target: { value: "2" } });
    await waitFor(() => expect(lastQuery(spy).page).toBe(1));
  });
});

describe("My Tickets — pagination", () => {
  it("UI-14: reports the visible range and the total", async () => {
    vi.spyOn(ticketsApi, "fetchMyTickets").mockResolvedValue(
      paged([ticket()], { page: 2, pageSize: 10, total: 25, totalPages: 3 })
    );

    renderPage();

    // Page 2 of 10 covers items 11 to 20 of 25.
    expect(await screen.findByTestId("pagination-summary")).toHaveTextContent(
      "Showing 11 to 20 of 25 tickets"
    );
  });

  it("UI-14: caps the range at the total on the last page", async () => {
    vi.spyOn(ticketsApi, "fetchMyTickets").mockResolvedValue(
      paged([ticket()], { page: 3, pageSize: 10, total: 25, totalPages: 3 })
    );

    renderPage();

    expect(await screen.findByTestId("pagination-summary")).toHaveTextContent(
      "Showing 21 to 25 of 25 tickets"
    );
  });

  it("UI-14: requests the page the requester selected", async () => {
    const spy = vi
      .spyOn(ticketsApi, "fetchMyTickets")
      .mockResolvedValue(paged([ticket()], { page: 1, total: 25, totalPages: 3 }));

    renderPage();
    await screen.findAllByText("TKT-2026-000001");

    fireEvent.click(screen.getByRole("button", { name: "2" }));

    await waitFor(() => expect(lastQuery(spy).page).toBe(2));
  });

  it("UI-14: marks the current page for assistive technology", async () => {
    vi.spyOn(ticketsApi, "fetchMyTickets").mockResolvedValue(
      paged([ticket()], { page: 2, total: 25, totalPages: 3 })
    );

    renderPage();

    const nav = await screen.findByRole("navigation", { name: /Ticket list pages/i });
    expect(within(nav).getByRole("button", { name: "2" })).toHaveAttribute("aria-current", "page");
  });

  it("disables Previous on the first page and Next on the last", async () => {
    vi.spyOn(ticketsApi, "fetchMyTickets").mockResolvedValue(
      paged([ticket()], { page: 1, total: 5, totalPages: 1 })
    );

    renderPage();

    expect(await screen.findByRole("button", { name: /Previous/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });
});
