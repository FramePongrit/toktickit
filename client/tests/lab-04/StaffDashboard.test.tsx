import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import * as dashboardsApi from "../../src/api/dashboards.js";
import type { DashboardAction, StaffDashboard } from "../../src/api/dashboards.js";
import { StaffDashboardPage } from "../../src/pages/StaffDashboardPage.js";
import { setCsrfToken, ApiError } from "../../src/lib/http.js";
import { renderAuthenticated } from "../support/auth.js";
import type { SafeUser, TicketStatus } from "../../src/types/index.js";

const STAFF: SafeUser = { id: 7, fullName: "Jordan Staff", email: "jordan@example.test", active: true, role: "STAFF", mustChangePassword: false };
const STATUSES: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED", "RESOLVED", "CLOSED", "CANCELLED"];
const DASHBOARD: StaffDashboard = {
  generatedAt: "2026-10-29T04:30:00.000Z",
  window: { timeZone: "Asia/Bangkok", from: "2026-10-22T17:00:00.000Z", through: "2026-10-29T04:30:00.000Z" },
  metrics: {
    unassignedTickets: { value: 2, unit: "tickets", href: "/staff/tickets?scope=active&owner=unassigned" },
    myActiveTickets: { value: 4, unit: "tickets", href: "/staff/tickets?scope=active&owner=me" },
    myActiveActions: { value: 3, unit: "actions", href: "/staff/dashboard?actions=active-assigned" },
    highUrgentTickets: { value: 1, unit: "tickets", href: "/staff/tickets?scope=active&itPriorities=HIGH%2CURGENT" },
  },
  statusCounts: Object.fromEntries(STATUSES.map((status, index) => [status, { value: index, unit: "tickets", href: `/staff/tickets?scope=all&status=${status}` }])) as StaffDashboard["statusCounts"],
  previews: {
    priorityRecentTickets: {
      data: [{ id: 21, ticketNumber: "TCK-0021", summary: "Shared printer is offline", requestedPriority: "LOW", itPriority: "URGENT", currentStatus: "IN_PROGRESS", createdAt: "2026-10-20T04:00:00.000Z", updatedAt: "2026-10-29T04:10:00.000Z", resolvedAt: null, requester: { id: 20, fullName: "Rin Requester" }, owner: { id: 7, fullName: "Jordan Staff" } }],
      href: "/staff/tickets?scope=active&sort=priorityRecent",
    },
    myCompletedActions: {
      data: [{ id: 91, ticketId: 21, ticketNumber: "TCK-0021", description: "Restarted the print server", status: "COMPLETED", workCycle: 1, assignee: { id: 8, fullName: "Assignee Two" }, performedBy: { id: 7, fullName: "Jordan Staff" }, completedAt: "2026-10-29T04:00:00.000Z", ticket: { currentStatus: "IN_PROGRESS", workCycle: 2 } }],
      href: "/staff/dashboard?actions=completed-performed&from=2026-10-22T17%3A00%3A00.000Z&through=2026-10-29T04%3A30%3A00.000Z",
    },
  },
};

const ACTIVE_ACTION: DashboardAction = {
  id: 92,
  ticketId: 22,
  ticketNumber: "TCK-0022",
  description: "Check the wireless access point",
  status: "IN_PROGRESS",
  workCycle: 3,
  assignee: { id: 7, fullName: "Jordan Staff" },
  performedBy: null,
  completedAt: null,
  ticket: { currentStatus: "REOPENED", workCycle: 3 },
};

function pagedActions(data: DashboardAction[] = [ACTIVE_ACTION], page = 1, pageSize: 10 | 20 | 50 = 10, total = data.length) {
  return { data, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function ActionViewTestControls() {
  const [, setSearchParams] = useSearchParams();
  return <div>
    <button type="button" onClick={() => setSearchParams({ actions: "completed-performed", from: "2026-10-22T17:00:00.000Z", through: "2026-10-29T04:30:00.000Z" })}>Test completed Actions view</button>
    <button type="button" onClick={() => setSearchParams({ actions: "active-assigned" })}>Test active Actions view</button>
  </div>;
}

function renderStaff(initialEntry = "/staff/dashboard", includeActionControls = false) {
  return renderAuthenticated(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/staff/dashboard" element={<><StaffDashboardPage /><LocationProbe />{includeActionControls && <ActionViewTestControls />}</>} />
        <Route path="/staff/tickets/:id" element={<h1>Staff Ticket detail</h1>} />
      </Routes>
    </MemoryRouter>,
    STAFF
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  setCsrfToken(null);
});

describe("Issue 90 Staff/Admin Dashboard", () => {
  it("UI-01: renders four ticket/action metrics, all eight status links, and truthful previews", async () => {
    vi.spyOn(dashboardsApi, "fetchStaffDashboard").mockResolvedValue(DASHBOARD);
    const actions = vi.spyOn(dashboardsApi, "fetchStaffDashboardActions").mockResolvedValue(pagedActions());
    renderStaff();

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    await screen.findAllByRole("link", { name: "TCK-0021" });
    expect(screen.getByTestId("dashboard-as-of")).toHaveTextContent("29 Oct 2026, 11:30");
    expect(screen.getByRole("link", { name: "View Unassigned Tickets" })).toHaveAttribute("href", DASHBOARD.metrics.unassignedTickets.href);
    expect(screen.getByRole("link", { name: "View My Active Tickets" })).toHaveAttribute("href", DASHBOARD.metrics.myActiveTickets.href);
    expect(screen.getByRole("link", { name: "View My Active Actions" })).toHaveAttribute("href", DASHBOARD.metrics.myActiveActions.href);
    expect(screen.getByRole("link", { name: "View High/Urgent Tickets" })).toHaveAttribute("href", DASHBOARD.metrics.highUrgentTickets.href);
    const statusGrid = screen.getByRole("region", { name: "Tickets by status" });
    for (const status of STATUSES) {
      const label = status.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
      expect(within(statusGrid).getByRole("link", { name: new RegExp(label) })).toHaveAttribute("href", `/staff/tickets?scope=all&status=${status}`);
    }
    expect(screen.getByText("Requester: Rin Requester")).toBeInTheDocument();
    expect(screen.getByText("Owner: Jordan Staff")).toBeInTheDocument();
    expect(screen.getByText("Assigned to: Assignee Two")).toBeInTheDocument();
    expect(screen.getByText("Completed by: Jordan Staff")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "TCK-0021" })[0]).toHaveAttribute("href", "/staff/tickets/21");
    expect(screen.getByRole("link", { name: "View all completed Actions" })).toHaveAttribute("href", DASHBOARD.previews.myCompletedActions.href);
    expect(screen.getByText("Actions completed today and the previous 6 days (Bangkok time).")).toBeInTheDocument();
    expect(actions).not.toHaveBeenCalled();
  });

  it("UI-01: opens My Active Actions from another Actions view and focuses its heading", async () => {
    const user = userEvent.setup();
    vi.spyOn(dashboardsApi, "fetchStaffDashboard").mockResolvedValue(DASHBOARD);
    const actions = vi.spyOn(dashboardsApi, "fetchStaffDashboardActions").mockResolvedValue(pagedActions());
    renderStaff("/staff/dashboard?actions=completed-performed&from=2026-10-22T17%3A00%3A00.000Z&through=2026-10-29T04%3A30%3A00.000Z");

    expect(await screen.findByRole("heading", { name: "My Actions" })).toBeInTheDocument();
    expect(actions).toHaveBeenCalledWith(expect.objectContaining({ view: "completed-performed", from: "2026-10-22T17:00:00.000Z", through: "2026-10-29T04:30:00.000Z" }), expect.any(AbortSignal));
    await user.click(screen.getByRole("link", { name: "View My Active Actions" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/staff/dashboard?actions=active-assigned"));
    await waitFor(() => expect(actions).toHaveBeenLastCalledWith(expect.objectContaining({ view: "active-assigned", page: 1, pageSize: 10 }), expect.any(AbortSignal)));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "My Actions" }));
    expect(screen.getByText("Active Actions assigned to you for current-cycle, active Tickets.")).toBeInTheDocument();
  });

  it.each([
    "/staff/dashboard?actions=active-assigned&page=",
    "/staff/dashboard?actions=active-assigned&from=",
    "/staff/dashboard?actions=completed-performed&from=2026-10-22T17%3A00%3A00.000Z",
    "/staff/dashboard?actions=active-assigned&actions=completed-performed",
    "/staff/dashboard?actions=active-assigned&unknown=1",
  ])("rejects invalid Action URL %s without requesting data", async (path) => {
    vi.spyOn(dashboardsApi, "fetchStaffDashboard").mockResolvedValue(DASHBOARD);
    const actions = vi.spyOn(dashboardsApi, "fetchStaffDashboardActions").mockResolvedValue(pagedActions());
    renderStaff(path);
    expect(await screen.findByText("This Dashboard link has invalid Action filters")).toBeInTheDocument();
    expect(actions).not.toHaveBeenCalled();
  });

  it("preserves the completed snapshot window while paging and changing page size", async () => {
    const user = userEvent.setup();
    vi.spyOn(dashboardsApi, "fetchStaffDashboard").mockResolvedValue(DASHBOARD);
    const completed = DASHBOARD.previews.myCompletedActions.data;
    const actions = vi.spyOn(dashboardsApi, "fetchStaffDashboardActions").mockImplementation((query) => Promise.resolve(pagedActions(completed, query.page, query.pageSize, 35)));
    renderStaff("/staff/dashboard?actions=completed-performed&from=2026-10-22T17%3A00%3A00.000Z&through=2026-10-29T04%3A30%3A00.000Z&pageSize=20");

    await waitFor(() => expect(actions).toHaveBeenCalledWith(expect.objectContaining({ view: "completed-performed", page: 1, pageSize: 20, from: "2026-10-22T17:00:00.000Z", through: "2026-10-29T04:30:00.000Z" }), expect.any(AbortSignal)));
    const navigation = await screen.findByRole("navigation", { name: "Actions pages" });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(actions).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize: 20, from: "2026-10-22T17:00:00.000Z", through: "2026-10-29T04:30:00.000Z" }), expect.any(AbortSignal)));
    await user.selectOptions(screen.getByLabelText("Actions per page"), "50");
    await waitFor(() => expect(actions).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 50, from: "2026-10-22T17:00:00.000Z", through: "2026-10-29T04:30:00.000Z" }), expect.any(AbortSignal)));
    expect(navigation).toHaveAttribute("data-pagination-windowed", "true");
    expect(screen.getByTestId("location")).toHaveTextContent("from=2026-10-22T17%3A00%3A00.000Z");
    expect(screen.getByTestId("location")).toHaveTextContent("through=2026-10-29T04%3A30%3A00.000Z");
  });

  it("keeps navigation when the current Actions page is beyond its latest total", async () => {
    const user = userEvent.setup();
    vi.spyOn(dashboardsApi, "fetchStaffDashboard").mockResolvedValue(DASHBOARD);
    const actions = vi.spyOn(dashboardsApi, "fetchStaffDashboardActions").mockImplementation((query) => Promise.resolve(
      query.page > 2 ? pagedActions([], query.page, query.pageSize, 15) : pagedActions([ACTIVE_ACTION], query.page, query.pageSize, 15)
    ));
    renderStaff("/staff/dashboard?actions=active-assigned&page=3");

    expect(await screen.findByText("No Actions on page 3. 15 total; return to page 2.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(actions).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }), expect.any(AbortSignal)));
    expect(await screen.findAllByText("Check the wireless access point")).toHaveLength(2);
  });

  it("ignores late Action rows across an active→completed→active URL change", async () => {
    const pending: Array<{ query: dashboardsApi.StaffDashboardActionQuery; resolve: (value: ReturnType<typeof pagedActions>) => void; signal?: AbortSignal }> = [];
    const actions = vi.spyOn(dashboardsApi, "fetchStaffDashboardActions").mockImplementation((query, signal) => new Promise((resolve) => {
      pending.push({ query, resolve, signal });
    }));
    vi.spyOn(dashboardsApi, "fetchStaffDashboard").mockResolvedValue(DASHBOARD);
    const user = userEvent.setup();
    renderStaff("/staff/dashboard?actions=active-assigned", true);

    await waitFor(() => expect(pending).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Test completed Actions view" }));
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0].signal?.aborted).toBe(true);
    expect(pending[1].query.view).toBe("completed-performed");

    await user.click(screen.getByRole("button", { name: "Test active Actions view" }));
    await waitFor(() => expect(pending).toHaveLength(3));
    expect(pending[1].signal?.aborted).toBe(true);
    expect(pending[2].query.view).toBe("active-assigned");

    const actionWithDescription = (description: string): DashboardAction => ({ ...ACTIVE_ACTION, description });
    await act(async () => pending[0].resolve(pagedActions([actionWithDescription("Private active result A-old")])));
    await act(async () => pending[1].resolve(pagedActions([actionWithDescription("Private completed result B")])));
    expect(screen.queryByText("Private active result A-old")).not.toBeInTheDocument();
    expect(screen.queryByText("Private completed result B")).not.toBeInTheDocument();

    await act(async () => pending[2].resolve(pagedActions([actionWithDescription("Current active result A")])));
    expect(await screen.findAllByText("Current active result A")).toHaveLength(2);
    expect(screen.queryByText("Private active result A-old")).not.toBeInTheDocument();
    expect(screen.queryByText("Private completed result B")).not.toBeInTheDocument();
    expect(actions).toHaveBeenCalledTimes(3);
  });

  it("distinguishes a first Action failure from a failed refresh of a retained Action result", async () => {
    const actions = vi.spyOn(dashboardsApi, "fetchStaffDashboardActions")
      .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "First Action read failed"))
      .mockResolvedValueOnce(pagedActions())
      .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Action refresh failed"));
    vi.spyOn(dashboardsApi, "fetchStaffDashboard").mockResolvedValue(DASHBOARD);
    const user = userEvent.setup();
    renderStaff("/staff/dashboard?actions=active-assigned");

    expect(await screen.findByRole("heading", { name: "Actions unavailable" })).toBeInTheDocument();
    expect(screen.queryByText(/Showing the previous Actions result/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry Actions" }));
    expect(await screen.findAllByText("Check the wireless access point")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Refresh Actions" }));

    const stale = await screen.findByRole("alert");
    expect(stale).toHaveTextContent(/Showing the previous Actions result from/);
    expect(stale).not.toHaveTextContent("29 Oct 2026, 11:30");
    expect(screen.getAllByText("Check the wireless access point")).toHaveLength(2);
    expect(actions).toHaveBeenCalledTimes(3);
  });

  it("keeps zero metrics distinct from a dashboard failure", async () => {
    const load = vi.spyOn(dashboardsApi, "fetchStaffDashboard").mockRejectedValue(new ApiError(500, "INTERNAL_ERROR", "safe error"));
    renderStaff();
    expect(await screen.findByRole("heading", { name: "Dashboard unavailable" })).toBeInTheDocument();
    expect(screen.queryByLabelText("0 tickets")).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("loads Dashboard and Actions after auth restoration in StrictMode, then aborts on unmount", async () => {
    const dashboardSignals: AbortSignal[] = [];
    const actionSignals: AbortSignal[] = [];
    vi.spyOn(dashboardsApi, "fetchStaffDashboard").mockImplementation((signal) => {
      dashboardSignals.push(signal!);
      return new Promise<StaffDashboard>(() => {});
    });
    vi.spyOn(dashboardsApi, "fetchStaffDashboardActions").mockImplementation((_query, signal) => {
      actionSignals.push(signal!);
      return new Promise<ReturnType<typeof pagedActions>>(() => {});
    });
    const view = renderAuthenticated(
      <StrictMode><MemoryRouter initialEntries={["/staff/dashboard?actions=active-assigned"]}><Routes><Route path="/staff/dashboard" element={<StaffDashboardPage />} /></Routes></MemoryRouter></StrictMode>,
      STAFF
    );
    await waitFor(() => {
      expect(dashboardSignals).toHaveLength(1);
      expect(actionSignals).toHaveLength(1);
    });
    expect(dashboardSignals[0].aborted).toBe(false);
    expect(actionSignals[0].aborted).toBe(false);
    view.unmount();
    expect(dashboardSignals.every((signal) => signal.aborted)).toBe(true);
    expect(actionSignals.every((signal) => signal.aborted)).toBe(true);
  });
});
