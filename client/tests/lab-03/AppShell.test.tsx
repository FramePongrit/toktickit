import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../../src/AppRouter.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { setCsrfToken } from "../../src/lib/http.js";

const BASE_USER = {
  id: 3,
  fullName: "Shell User",
  email: "shell@example.test",
  active: true,
  role: "STAFF" as const,
  mustChangePassword: false,
};

function response(status: number, body?: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function pathOf(input: RequestInfo | URL): string {
  return new URL(String(input)).pathname;
}

function renderApp(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken(null);
});

describe("Issue 50 authenticated application shell", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (pathOf(input) === "/api/auth/me") return response(200, { user: BASE_USER, csrfToken: "csrf-shell" });
      if (pathOf(input) === "/api/auth/logout") return response(204);
      return response(404);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("UI-H01: restores current user on startup and lands Staff at the Staff Queue", async () => {
    renderApp("/");
    expect(await screen.findByTestId("staff-landing")).toBeInTheDocument();
    expect(screen.getByTestId("current-user")).toHaveTextContent("Shell User");
    expect(screen.getByTestId("current-role")).toHaveTextContent("IT Staff");
    const bootstrap = fetchMock.mock.calls.find(([input]) => pathOf(input) === "/api/auth/me");
    expect(bootstrap?.[1]).toEqual(expect.objectContaining({ credentials: "include" }));
  });

  it.each([
    ["REQUESTER", "/tickets", "My Tickets"],
    ["STAFF", "/staff/tickets", "Staff Queue"],
    ["ADMIN", "/admin/users", "User Management"],
  ] as const)("UI-H01: defaults %s to %s and exposes its permitted navigation", async (role, landing, navName) => {
    const user = { ...BASE_USER, role };
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (pathOf(input) === "/api/auth/me") return Promise.resolve(response(200, { user, csrfToken: "csrf-role" }));
      if (pathOf(input) === "/api/categories" || pathOf(input) === "/api/related-systems") return Promise.resolve(response(200, []));
      if (pathOf(input) === "/api/tickets") return Promise.resolve(response(200, { data: [], page: 1, pageSize: 10, total: 0, totalPages: 0 }));
      return Promise.resolve(response(404));
    });

    renderApp("/");
    expect(await screen.findByRole("heading", { name: role === "ADMIN" ? "User Management" : role === "STAFF" ? "Staff Queue" : "My Tickets" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: navName })).toBeInTheDocument();
    if (role === "REQUESTER") {
      expect(screen.getAllByRole("link", { name: "Create Ticket" }).length).toBeGreaterThan(0);
      expect(screen.queryByRole("link", { name: "User Management" })).not.toBeInTheDocument();
    } else if (role === "STAFF") {
      expect(screen.queryByRole("link", { name: "My Tickets" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "User Management" })).not.toBeInTheDocument();
    } else {
      expect(screen.getByRole("link", { name: "Staff Queue" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "My Tickets" })).not.toBeInTheDocument();
    }
  });

  it("UI-H01: blocks direct navigation to another role's route", async () => {
    renderApp("/admin/users");
    expect(await screen.findByRole("heading", { name: "You do not have access to this page" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Staff Queue" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });

  it("UI-H01: closes the mobile navigation and focuses the destination heading", async () => {
    const user = userEvent.setup();
    renderApp("/staff/tickets");
    await screen.findByRole("heading", { name: "Staff Queue" });

    const toggle = screen.getByRole("button", { name: "Open navigation menu" });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("link", { name: "Change Password" }));
    const heading = await screen.findByRole("heading", { name: "Change password" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open navigation menu" })).toHaveAttribute("aria-expanded", "false");
      expect(document.activeElement).toBe(heading);
    });
  });

  it("UI-H01: keeps the desktop navigation open and hides the mobile toggler", async () => {
    renderApp("/staff/tickets");
    await screen.findByTestId("staff-landing");

    expect(screen.getByRole("button", { name: "Open navigation menu" })).toHaveClass("d-md-none");
    expect(document.getElementById("zen-nav")).toHaveClass("navbar-collapse", "d-md-flex");
  });

  it("UI-H01: logs out, sends the current CSRF token, and protects the route afterward", async () => {
    const user = userEvent.setup();
    renderApp("/staff/tickets");
    await screen.findByTestId("staff-landing");
    await user.click(screen.getByRole("button", { name: "Logout" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    const logout = fetchMock.mock.calls.find(([input]) => pathOf(input) === "/api/auth/logout");
    expect(logout?.[1]).toEqual(expect.objectContaining({ credentials: "include" }));
    expect(new Headers((logout?.[1] as RequestInit).headers).get("X-CSRF-Token")).toBe("csrf-shell");
    expect(screen.queryByTestId("current-user")).not.toBeInTheDocument();
  });

  it("UI-H01: keeps the app in a safe failure state when current-user restoration fails", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (pathOf(input) === "/api/auth/me") return Promise.resolve(response(500, { error: { code: "INTERNAL_ERROR", message: "SQL password" } }));
      return Promise.resolve(response(404));
    });
    renderApp("/staff/tickets");
    expect(await screen.findByRole("heading", { name: "TokTickIT could not restore your session" })).toBeInTheDocument();
    expect(screen.queryByText("SQL password")).not.toBeInTheDocument();
  });

  it("UI-H01: responds to a revoked/unauthenticated startup session by returning to Login", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (pathOf(input) === "/api/auth/me") return Promise.resolve(response(401, { error: { code: "UNAUTHENTICATED", message: "Authentication is required." } }));
      return Promise.resolve(response(404));
    });
    renderApp("/staff/tickets");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument());
    expect(screen.queryByTestId("staff-landing")).not.toBeInTheDocument();
  });

  it("UI-H01: clears the in-memory session and returns to Login when a protected API later returns 401", async () => {
    const requester = { ...BASE_USER, role: "REQUESTER" as const };
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (pathOf(input) === "/api/auth/me") return Promise.resolve(response(200, { user: requester, csrfToken: "csrf-active" }));
      if (pathOf(input) === "/api/categories") return Promise.resolve(response(401, { error: { code: "UNAUTHENTICATED", message: "Authentication is required." } }));
      if (pathOf(input) === "/api/related-systems") return Promise.resolve(response(200, []));
      if (pathOf(input) === "/api/tickets") return Promise.resolve(response(401, { error: { code: "UNAUTHENTICATED", message: "Authentication is required." } }));
      return Promise.resolve(response(404));
    });

    renderApp("/tickets");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByTestId("current-user")).not.toBeInTheDocument();
  });
});
