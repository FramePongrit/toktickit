import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { StaffTicketQueuePage } from "../../src/pages/StaffTicketQueuePage.js";
import { AppRoutes } from "../../src/AppRouter.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import * as ticketsApi from "../../src/api/tickets.js";
import * as referenceData from "../../src/api/referenceData.js";
import { ApiError, setCsrfToken } from "../../src/lib/http.js";
import type { StaffQueueItem, TicketOwnerOption } from "../../src/types/index.js";

const STAFF = {
  id: 7,
  fullName: "Queue Staff",
  email: "staff@example.test",
  active: true,
  role: "STAFF" as const,
  mustChangePassword: false,
};

const OWNER_OPTIONS: TicketOwnerOption[] = [
  { id: 7, fullName: "Queue Staff", role: "STAFF" },
  { id: 8, fullName: "Queue Admin", role: "ADMIN" },
];

const TICKETS: StaffQueueItem[] = [
  {
    id: 101,
    ticketNumber: "TCK-0101",
    summary: "Cannot connect to VPN",
    requestedPriority: "HIGH",
    itPriority: "URGENT",
    currentStatus: "IN_PROGRESS",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-02T10:00:00.000Z",
    category: { id: 1, name: "Network" },
    requester: { id: 20, fullName: "Requester One", email: "requester@example.test" },
    owner: OWNER_OPTIONS[0],
    resolutionIndication: {
      indicatedAt: "2026-09-02T09:00:00.000Z",
      indicatedBy: { id: 7, fullName: "Queue Staff", role: "STAFF" },
    },
  },
  {
    id: 102,
    ticketNumber: "TCK-0102",
    summary: "New laptop request",
    requestedPriority: "LOW",
    itPriority: "MEDIUM",
    currentStatus: "NEW",
    createdAt: "2026-09-03T10:00:00.000Z",
    updatedAt: "2026-09-03T11:00:00.000Z",
    category: { id: 2, name: "Hardware" },
    requester: { id: 21, fullName: "Requester Two", email: "two@example.test" },
    owner: null,
    resolutionIndication: null,
  },
];

const PAGE = {
  data: TICKETS,
  page: 1,
  pageSize: 10,
  total: 2,
  totalPages: 1,
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderQueue(initialEntry = "/staff/tickets") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <StaffTicketQueuePage />
      <LocationProbe />
    </MemoryRouter>
  );
}

function mockReadyQueue(result = PAGE) {
  vi.spyOn(ticketsApi, "fetchStaffQueue").mockResolvedValue(result);
  vi.spyOn(ticketsApi, "fetchTicketOwners").mockResolvedValue(OWNER_OPTIONS);
  vi.spyOn(referenceData, "fetchCategories").mockResolvedValue([
    { id: 1, name: "Network" },
    { id: 2, name: "Hardware" },
  ]);
}

afterEach(() => {
  vi.restoreAllMocks();
  setCsrfToken(null);
});

describe("Issue 56 Staff Ticket Queue", () => {
  it("UI-Q01: wires approved query controls, restores URL state, and resets page on changes", async () => {
    const user = userEvent.setup();
    const queue = vi.spyOn(ticketsApi, "fetchStaffQueue").mockResolvedValue(PAGE);
    vi.spyOn(ticketsApi, "fetchTicketOwners").mockResolvedValue(OWNER_OPTIONS);
    vi.spyOn(referenceData, "fetchCategories").mockResolvedValue([{ id: 2, name: "Hardware" }]);

    renderQueue("/staff/tickets?scope=all&q=VPN&status=OPEN&itPriority=HIGH&categoryId=2&owner=me&sort=updatedAt&order=desc&page=3&pageSize=20");

    await screen.findByRole("heading", { name: "Ticket Queue" });
    await waitFor(() => expect(queue).toHaveBeenCalledWith({
      scope: "all",
      q: "VPN",
      status: "OPEN",
      itPriority: "HIGH",
      categoryId: 2,
      owner: "me",
      sort: "updatedAt",
      order: "desc",
      page: 3,
      pageSize: 20,
    }));

    expect(screen.getByDisplayValue("VPN")).toBeInTheDocument();
    expect(screen.getByDisplayValue("20 tickets")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("scope=all");
    expect(screen.getByTestId("location")).toHaveTextContent("page=3");

    await user.selectOptions(screen.getByLabelText("Status"), "RESOLVED");
    await waitFor(() => expect(queue).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "RESOLVED",
      page: 1,
      scope: "all",
      pageSize: 20,
    })));
    expect(screen.getByTestId("location")).toHaveTextContent("status=RESOLVED");
    expect(screen.getByTestId("location")).toHaveTextContent("page=1");
  });

  it("UI-Q01: sends owner ids from the safe directory and keeps the built-in owner modes available", async () => {
    const user = userEvent.setup();
    const queue = vi.spyOn(ticketsApi, "fetchStaffQueue").mockResolvedValue(PAGE);
    vi.spyOn(ticketsApi, "fetchTicketOwners").mockResolvedValue(OWNER_OPTIONS);
    vi.spyOn(referenceData, "fetchCategories").mockResolvedValue([]);

    renderQueue();
    await screen.findByRole("option", { name: "Queue Admin — Administrator" });
    expect(screen.getByRole("option", { name: "All owners" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "My Tickets" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Unassigned" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Owner"), "8");
    await waitFor(() => expect(queue).toHaveBeenLastCalledWith(expect.objectContaining({ owner: 8, page: 1 })));
  });

  it("UI-Q01/UI-Q02: renders the seven-column desktop table, responsive cards, badges, indication, and unassigned owner", async () => {
    mockReadyQueue();
    renderQueue();

    const table = await screen.findByTestId("staff-queue-table");
    expect(table).toHaveClass("d-none", "d-lg-block");
    expect(within(table).getByRole("columnheader", { name: /Summary \/ requester/i })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: /Category/i })).toBeInTheDocument();
    expect(within(table).getByText("TCK-0101")).toBeInTheDocument();
    expect(within(table).getByText("Requester One")).toBeInTheDocument();
    expect(within(table).getByText("Unassigned")).toBeInTheDocument();
    expect(within(table).getAllByTestId("requested-priority-badge")[0]).toHaveTextContent("High");
    expect(within(table).getAllByTestId("it-priority-badge")[0]).toHaveTextContent("Urgent");
    expect(within(table).getByTestId("resolution-indication")).toHaveTextContent("Resolution indicated");
    expect(within(table).getAllByRole("link", { name: "Open" })[0]).toHaveAttribute("href", "/staff/tickets/101");

    const cards = screen.getByTestId("staff-queue-cards");
    expect(cards).toHaveClass("d-lg-none");
    expect(within(cards).getByRole("heading", { name: "Cannot connect to VPN" })).toBeInTheDocument();
    expect(within(cards).getAllByRole("link", { name: "Open ticket" })[0]).toHaveAttribute("href", "/staff/tickets/101");
    expect(within(cards).getByText("Resolution indicated")).toBeInTheDocument();
  });

  it("UI-Q01: distinguishes loading, empty, and filtered no-results states", async () => {
    let resolveQueue!: (value: typeof PAGE) => void;
    vi.spyOn(ticketsApi, "fetchStaffQueue").mockImplementation(() => new Promise((resolve) => { resolveQueue = resolve; }));
    vi.spyOn(ticketsApi, "fetchTicketOwners").mockResolvedValue([]);
    vi.spyOn(referenceData, "fetchCategories").mockResolvedValue([]);
    renderQueue();
    expect(screen.getByTestId("staff-queue-skeleton")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("staff-queue-skeleton-table")).toBeInTheDocument();
    expect(screen.getByTestId("staff-queue-skeleton-cards")).toBeInTheDocument();
    expect(screen.getByTestId("staff-queue-skeleton").querySelector(".spinner-border")).not.toBeInTheDocument();

    resolveQueue({ data: [], page: 1, pageSize: 10, total: 0, totalPages: 0 });
    expect(await screen.findByText("No Tickets in this scope.")).toBeInTheDocument();

    cleanup();
    vi.restoreAllMocks();
    vi.spyOn(ticketsApi, "fetchStaffQueue").mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0, totalPages: 0 });
    vi.spyOn(ticketsApi, "fetchTicketOwners").mockResolvedValue([]);
    vi.spyOn(referenceData, "fetchCategories").mockResolvedValue([]);
    renderQueue("/staff/tickets?q=does-not-exist");
    expect(await screen.findByText("No Tickets match these filters.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Clear Filters" }).at(-1)).toBeInTheDocument();
  });

  it("UI-Q01: keeps query state on retry and exposes a safe queue failure", async () => {
    const user = userEvent.setup();
    const queue = vi.spyOn(ticketsApi, "fetchStaffQueue")
      .mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "The service is unavailable."))
      .mockResolvedValueOnce(PAGE);
    vi.spyOn(ticketsApi, "fetchTicketOwners").mockResolvedValue([]);
    vi.spyOn(referenceData, "fetchCategories").mockResolvedValue([]);
    renderQueue("/staff/tickets?q=network&page=2");

    expect(await screen.findByText("Could not load the ticket queue")).toBeInTheDocument();
    expect(screen.queryByText("INTERNAL_ERROR")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findAllByText("TCK-0101");
    expect(queue).toHaveBeenCalledWith(expect.objectContaining({ q: "network", page: 2 }));
  });

  it("UI-Q01: gives the owner directory independent forbidden feedback while retaining safe modes", async () => {
    vi.spyOn(ticketsApi, "fetchStaffQueue").mockResolvedValue(PAGE);
    vi.spyOn(ticketsApi, "fetchTicketOwners").mockRejectedValue(new ApiError(403, "FORBIDDEN", "Forbidden"));
    vi.spyOn(referenceData, "fetchCategories").mockResolvedValue([]);
    renderQueue();

    expect(await screen.findByText("Eligible owner choices are unavailable for this account.")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "My Tickets" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Unassigned" })).toBeInTheDocument();
  });

  it("UI-Q01: retries the owner directory independently and then exposes safe eligible options", async () => {
    const user = userEvent.setup();
    const owners = vi.spyOn(ticketsApi, "fetchTicketOwners")
      .mockRejectedValueOnce(new ApiError(503, "UNEXPECTED", "Unavailable"))
      .mockResolvedValueOnce(OWNER_OPTIONS);
    vi.spyOn(ticketsApi, "fetchStaffQueue").mockResolvedValue(PAGE);
    vi.spyOn(referenceData, "fetchCategories").mockResolvedValue([]);
    renderQueue();

    await waitFor(() => expect(screen.getByTestId("owner-directory-feedback")).toHaveTextContent("Eligible owners could not be loaded"));
    const feedback = screen.getByTestId("owner-directory-feedback");
    await user.click(within(feedback).getByRole("button", { name: "Retry" }));
    await screen.findByRole("option", { name: "Queue Admin — Administrator" });
    expect(owners).toHaveBeenCalledTimes(2);
  });

  it("UI-Q01: renders a safe Queue API 403 state with a role-appropriate action", async () => {
    vi.spyOn(ticketsApi, "fetchStaffQueue").mockRejectedValue(new ApiError(403, "FORBIDDEN", "Forbidden"));
    vi.spyOn(ticketsApi, "fetchTicketOwners").mockResolvedValue([]);
    vi.spyOn(referenceData, "fetchCategories").mockResolvedValue([]);
    renderQueue();

    expect(await screen.findByText("You do not have access to the Staff Queue")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to your workspace" })).toHaveAttribute("href", "/");
  });

  it("UI-Q02: uses bounded pagination at the first, middle, and last page without an overflow strip", async () => {
    const user = userEvent.setup();
    const manyPages = { ...PAGE, total: 120, totalPages: 12 };
    const queue = vi.spyOn(ticketsApi, "fetchStaffQueue").mockImplementation((query) =>
      Promise.resolve({ ...manyPages, page: query.page })
    );
    vi.spyOn(ticketsApi, "fetchTicketOwners").mockResolvedValue([]);
    vi.spyOn(referenceData, "fetchCategories").mockResolvedValue([]);
    renderQueue("/staff/tickets?page=1");

    let navigation = await screen.findByRole("navigation", { name: "Ticket list pages" });
    expect(navigation).toHaveAttribute("data-pagination-windowed", "true");
    expect(navigation.querySelector("ul")).toHaveClass("flex-wrap");
    expect(navigation).not.toHaveClass("overflow-x-auto");
    expect(navigation.querySelectorAll("button")).toHaveLength(8);
    expect(within(navigation).getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).queryByRole("button", { name: "6" })).not.toBeInTheDocument();

    await user.click(within(navigation).getByRole("button", { name: "Next" }));
    await waitFor(() => expect(queue).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));

    cleanup();
    vi.restoreAllMocks();
    const lastPageQueue = vi.spyOn(ticketsApi, "fetchStaffQueue").mockImplementation((query) =>
      Promise.resolve({ ...manyPages, page: query.page })
    );
    vi.spyOn(ticketsApi, "fetchTicketOwners").mockResolvedValue([]);
    vi.spyOn(referenceData, "fetchCategories").mockResolvedValue([]);
    renderQueue("/staff/tickets?page=6");
    navigation = await screen.findByRole("navigation", { name: "Ticket list pages" });
    expect(within(navigation).getByRole("button", { name: "5" })).toBeInTheDocument();
    expect(within(navigation).getByRole("button", { name: "6" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("button", { name: "7" })).toBeInTheDocument();
    expect(navigation.querySelectorAll("button")).toHaveLength(7);

    await user.click(within(navigation).getByRole("button", { name: "12" }));
    await waitFor(() => expect(lastPageQueue).toHaveBeenLastCalledWith(expect.objectContaining({ page: 12 })));
    navigation = await screen.findByRole("navigation", { name: "Ticket list pages" });
    await waitFor(() => expect(within(navigation).getByRole("button", { name: "12" })).toHaveAttribute("aria-current", "page"));
    expect(within(navigation).getByRole("button", { name: "8" })).toBeInTheDocument();
    expect(within(navigation).queryByRole("button", { name: "6" })).not.toBeInTheDocument();
    expect(navigation.querySelectorAll("button")).toHaveLength(8);
  });

  it("UI-Q01: denies a Requester from the Staff Queue route", async () => {
    const requester = { ...STAFF, role: "REQUESTER" as const };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path === "/api/auth/me") return { ok: true, status: 200, json: async () => ({ user: requester, csrfToken: "csrf" }) } as Response;
      return { ok: false, status: 404, json: async () => ({ error: { code: "NOT_FOUND", message: "Not found" } }) } as Response;
    }));
    render(
      <MemoryRouter initialEntries={["/staff/tickets"]}>
        <AuthProvider><AppRoutes /></AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByRole("heading", { name: "You do not have access to this page" })).toBeInTheDocument();
  });
});
