import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useAuth } from "../../src/context/AuthContext.js";
import * as dashboardsApi from "../../src/api/dashboards.js";
import { RequesterDashboardPage } from "../../src/pages/RequesterDashboardPage.js";
import { setCsrfToken, ApiError } from "../../src/lib/http.js";
import { renderAuthenticated, TEST_REQUESTER } from "../support/auth.js";
import type { RequesterDashboard } from "../../src/api/dashboards.js";

const DASHBOARD: RequesterDashboard = {
  generatedAt: "2026-10-29T04:30:00.000Z",
  window: { timeZone: "Asia/Bangkok", from: "2026-10-22T17:00:00.000Z", through: "2026-10-29T04:30:00.000Z" },
  metrics: {
    openTickets: { value: 3, unit: "tickets", href: "/tickets?statuses=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED" },
    waitingForMe: { value: 1, unit: "tickets", href: "/tickets?status=WAITING_FOR_REQUESTER" },
    recentlyUpdated: { value: 2, unit: "tickets", href: "/tickets?updatedFrom=2026-10-22T17%3A00%3A00.000Z&updatedThrough=2026-10-29T04%3A30%3A00.000Z&sort=updatedAt&order=desc" },
    recentlyResolved: { value: 1, unit: "tickets", href: "/tickets?statuses=RESOLVED,CLOSED&resolvedFrom=2026-10-22T17%3A00%3A00.000Z&resolvedThrough=2026-10-29T04%3A30%3A00.000Z&sort=resolvedAt&order=desc" },
  },
  previews: {
    recentUpdated: {
      data: [{ id: 42, ticketNumber: "TCK-0042", summary: "Printer needs a driver", currentStatus: "OPEN", itPriority: "MEDIUM", updatedAt: "2026-10-29T04:10:00.000Z", resolvedAt: null }],
      href: "/tickets?updatedFrom=2026-10-22T17%3A00%3A00.000Z&updatedThrough=2026-10-29T04%3A30%3A00.000Z&sort=updatedAt&order=desc",
    },
    recentResolved: {
      data: [{ id: 43, ticketNumber: "TCK-0043", summary: "VPN access restored", currentStatus: "RESOLVED", itPriority: "HIGH", updatedAt: "2026-10-28T08:00:00.000Z", resolvedAt: "2026-10-28T07:45:00.000Z" }],
      href: "/tickets?statuses=RESOLVED,CLOSED&resolvedFrom=2026-10-22T17%3A00%3A00.000Z&resolvedThrough=2026-10-29T04%3A30%3A00.000Z&sort=resolvedAt&order=desc",
    },
  },
};

function AuthRefreshButton() {
  const { refresh } = useAuth();
  return <button type="button" onClick={() => void refresh()}>Refresh signed-in user</button>;
}

function renderDashboard(includeAuthRefresh = false) {
  return renderAuthenticated(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/dashboard" element={<><RequesterDashboardPage />{includeAuthRefresh && <AuthRefreshButton />}</>} />
        <Route path="/tickets/:id" element={<h1>Requester Ticket detail</h1>} />
      </Routes>
    </MemoryRouter>,
    TEST_REQUESTER
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  setCsrfToken(null);
});

describe("Issue 90 Requester Dashboard", () => {
  it("UI-02: renders four owned-Ticket cards, the Bangkok as-of time and safe previews with matching links", async () => {
    const load = vi.spyOn(dashboardsApi, "fetchRequesterDashboard").mockResolvedValue(DASHBOARD);
    renderDashboard();

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    await screen.findByRole("link", { name: "TCK-0042" });
    expect(screen.getByText("Welcome, Jennifer Anderson. Your service desk at a glance.")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-as-of")).toHaveTextContent("29 Oct 2026, 11:30");
    expect(screen.getByLabelText("3 tickets")).toBeInTheDocument();
    expect(screen.getAllByLabelText("1 tickets")).toHaveLength(2);
    expect(screen.getAllByText(/Today and the previous 6 days \(Bangkok time\)\./)).toHaveLength(2);

    const openLink = screen.getByRole("link", { name: "View Open Tickets" });
    expect(openLink).toHaveAttribute("href", DASHBOARD.metrics.openTickets.href);
    expect(screen.getByRole("link", { name: "TCK-0042" })).toHaveAttribute("href", "/tickets/42");
    expect(screen.getByRole("link", { name: "View all recently updated tickets" })).toHaveAttribute("href", DASHBOARD.previews.recentUpdated.href);
    expect(screen.getByRole("link", { name: "TCK-0043" })).toHaveAttribute("href", "/tickets/43");
    expect(screen.getByText(/Older Tickets with no recorded resolution time are not included/)).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("distinguishes an empty snapshot from a failed first load and retries without showing fake zeroes", async () => {
    const load = vi.spyOn(dashboardsApi, "fetchRequesterDashboard")
      .mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "Safe service error"))
      .mockResolvedValueOnce({
        ...DASHBOARD,
        metrics: Object.fromEntries(Object.entries(DASHBOARD.metrics).map(([key, metric]) => [key, { ...metric, value: 0 }])) as RequesterDashboard["metrics"],
        previews: { recentUpdated: { ...DASHBOARD.previews.recentUpdated, data: [] }, recentResolved: { ...DASHBOARD.previews.recentResolved, data: [] } },
      });
    const user = userEvent.setup();
    renderDashboard();

    expect(await screen.findByRole("heading", { name: "Dashboard unavailable" })).toBeInTheDocument();
    expect(screen.queryByLabelText("0 tickets")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findAllByLabelText("0 tickets")).toHaveLength(4);
    expect(screen.getByText("No Tickets were updated in this period.")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps a same-identity prior snapshot visibly stale after Refresh fails", async () => {
    const load = vi.spyOn(dashboardsApi, "fetchRequesterDashboard")
      .mockResolvedValueOnce(DASHBOARD)
      .mockRejectedValueOnce(new ApiError(503, "UNEXPECTED", "Temporary unavailable"));
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByRole("link", { name: "TCK-0042" });
    await user.click(screen.getByRole("button", { name: "Refresh Dashboard" }));
    expect(await screen.findByText(/Showing the previous snapshot from 29 Oct 2026, 11:30/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "TCK-0042" })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("clears a forbidden response instead of retaining the previous user's dashboard", async () => {
    const load = vi.spyOn(dashboardsApi, "fetchRequesterDashboard")
      .mockResolvedValueOnce(DASHBOARD)
      .mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Forbidden"));
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole("link", { name: "TCK-0042" });
    await user.click(screen.getByRole("button", { name: "Refresh Dashboard" }));

    expect(await screen.findByRole("heading", { name: "You do not have access to this dashboard." })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "TCK-0042" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-as-of")).toHaveTextContent("Waiting for the latest snapshot");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not reveal late Dashboard results across an A→B→A identity change", async () => {
    const pending: Array<{ resolve: (value: RequesterDashboard) => void; signal?: AbortSignal }> = [];
    const load = vi.spyOn(dashboardsApi, "fetchRequesterDashboard").mockImplementation((signal) => new Promise((resolve) => {
      pending.push({ resolve, signal });
    }));
    let authUser = TEST_REQUESTER;
    const view = renderDashboard(true);
    view.fetchMock.mockImplementation(async (input) => {
      const path = new URL(String(input), "http://localhost").pathname;
      if (path === "/api/auth/me") {
        return new Response(JSON.stringify({ user: authUser, csrfToken: "csrf-test" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(null, { status: 204 });
    });
    const user = userEvent.setup();

    await waitFor(() => expect(pending).toHaveLength(1));
    authUser = { ...TEST_REQUESTER, id: 2, fullName: "Other Requester" };
    await user.click(screen.getByRole("button", { name: "Refresh signed-in user" }));
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0].signal?.aborted).toBe(true);
    expect(screen.queryByText("Private snapshot A-old")).not.toBeInTheDocument();

    authUser = TEST_REQUESTER;
    await user.click(screen.getByRole("button", { name: "Refresh signed-in user" }));
    await waitFor(() => expect(pending).toHaveLength(3));
    expect(pending[1].signal?.aborted).toBe(true);

    const privateSnapshot = (label: string): RequesterDashboard => ({
      ...DASHBOARD,
      previews: {
        ...DASHBOARD.previews,
        recentUpdated: {
          ...DASHBOARD.previews.recentUpdated,
          data: [{ ...DASHBOARD.previews.recentUpdated.data[0]!, summary: `Private snapshot ${label}` }],
        },
      },
    });
    await act(async () => pending[0].resolve(privateSnapshot("A-old")));
    await act(async () => pending[1].resolve(privateSnapshot("B")));
    expect(screen.queryByText("Private snapshot A-old")).not.toBeInTheDocument();
    expect(screen.queryByText("Private snapshot B")).not.toBeInTheDocument();

    await act(async () => pending[2].resolve(privateSnapshot("A-current")));
    expect(await screen.findByText("Private snapshot A-current")).toBeInTheDocument();
    expect(screen.queryByText("Private snapshot A-old")).not.toBeInTheDocument();
    expect(screen.queryByText("Private snapshot B")).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("loads after auth restoration in StrictMode and cancels the live read on unmount", async () => {
    const signals: AbortSignal[] = [];
    const load = vi.spyOn(dashboardsApi, "fetchRequesterDashboard").mockImplementation((signal) => {
      signals.push(signal!);
      return new Promise<RequesterDashboard>(() => {});
    });
    const view = renderAuthenticated(<StrictMode><RequesterDashboardPage /></StrictMode>);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(signals[0].aborted).toBe(false);
    view.unmount();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
