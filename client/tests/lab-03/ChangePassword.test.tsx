import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../../src/AppRouter.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { setCsrfToken } from "../../src/lib/http.js";

const MANDATORY = {
  id: 2,
  fullName: "Legacy Requester",
  email: "legacy@example.test",
  active: true,
  role: "REQUESTER" as const,
  mustChangePassword: true,
};

function response(status: number, body?: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function pathOf(input: RequestInfo | URL): string {
  return new URL(String(input)).pathname;
}

function renderApp(initialEntry = "/change-password") {
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

describe("Issue 50 Change Password", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (pathOf(input) === "/api/auth/me") return Promise.resolve(response(200, { user: MANDATORY, csrfToken: "csrf-bootstrap" }));
      return Promise.resolve(response(404));
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("UI-L02/UI-H01: gates direct navigation and exposes only the mandatory change actions", async () => {
    renderApp("/tickets");
    expect(await screen.findByRole("heading", { name: "Change password" })).toBeInTheDocument();
    expect(screen.getByText(/initial password must be changed/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "My Tickets" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change Password" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Logout" })).toHaveLength(2);
  });

  it("UI-L02: validates rules, confirmation, and reuse before making a mutation", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: "Change password" });

    await user.type(screen.getByLabelText(/Current Password/), "same-password1");
    await user.type(screen.getByLabelText(/^New Password/), "same-password1");
    await user.type(screen.getByLabelText(/^Confirm New Password/), "different-password2");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(screen.getByText("The new password must differ from the current password.")).toBeInTheDocument();
    expect(screen.getByText("Confirmation must match the new password.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => pathOf(input) === "/api/auth/change-password")).toHaveLength(0);
  });

  it("UI-L02: supports self-service mode and clears password fields during save", async () => {
    const user = userEvent.setup();
    const selfService = { ...MANDATORY, mustChangePassword: false, role: "STAFF" as const };
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (pathOf(input) === "/api/auth/me") return Promise.resolve(response(200, { user: selfService, csrfToken: "csrf-bootstrap" }));
      return Promise.resolve(response(404));
    });
    renderApp();
    expect(await screen.findByText("Update your password for future sign-ins.")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Current Password/), "current-password1");
    await user.type(screen.getByLabelText(/^New Password/), "different-password2");
    await user.type(screen.getByLabelText(/^Confirm New Password/), "different-password2");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(screen.getByLabelText(/Current Password/)).toHaveValue("");
    expect(screen.getByLabelText(/^New Password/)).toHaveValue("");
    expect(screen.getByLabelText(/^Confirm New Password/)).toHaveValue("");
  });

  it("UI-L02: sends the current CSRF token, prevents duplicate password changes, and replaces it after success", async () => {
    const user = userEvent.setup();
    const staff = { ...MANDATORY, fullName: "Staff User", role: "STAFF" as const, mustChangePassword: false };
    let resolveChange!: (value: Response) => void;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (pathOf(input) === "/api/auth/me") return Promise.resolve(response(200, { user: MANDATORY, csrfToken: "csrf-old" }));
      if (pathOf(input) === "/api/auth/change-password") return new Promise<Response>((resolve) => { resolveChange = resolve; });
      return Promise.resolve(response(404));
    });
    renderApp();
    await screen.findByRole("heading", { name: "Change password" });
    await user.type(screen.getByLabelText(/Current Password/), "TokTickIT123!");
    await user.type(screen.getByLabelText(/^New Password/), "new-password2");
    await user.type(screen.getByLabelText(/^Confirm New Password/), "new-password2");
    const save = screen.getByRole("button", { name: "Save new password" });
    await user.click(save);
    await user.click(save);

    expect(screen.getByRole("button", { name: "Saving password..." })).toBeDisabled();
    expect(screen.getByTestId("password-save-spinner")).toBeInTheDocument();
    expect(screen.getByTestId("password-save-status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: "Saving password..." })).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector("form")).toHaveAttribute("aria-busy", "true");
    const calls = fetchMock.mock.calls.filter(([input]) => pathOf(input) === "/api/auth/change-password");
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual(expect.objectContaining({ credentials: "include" }));
    expect(new Headers((calls[0][1] as RequestInit).headers).get("X-CSRF-Token")).toBe("csrf-old");

    resolveChange(response(200, { user: staff, csrfToken: "csrf-new" }));
    expect(await screen.findByTestId("staff-landing")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("link", { name: "Change Password" })).toBeInTheDocument());
  });

  it("UI-L02: gives safe current-password failure feedback and does not expose server details", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (pathOf(input) === "/api/auth/me") return Promise.resolve(response(200, { user: MANDATORY, csrfToken: "csrf-old" }));
      if (pathOf(input) === "/api/auth/change-password") return Promise.resolve(response(401, { error: { code: "CURRENT_PASSWORD_INVALID", message: "secret backend detail" } }));
      return Promise.resolve(response(404));
    });
    renderApp();
    await screen.findByRole("heading", { name: "Change password" });
    await user.type(screen.getByLabelText(/Current Password/), "wrong-password1");
    await user.type(screen.getByLabelText(/^New Password/), "new-password2");
    await user.type(screen.getByLabelText(/^Confirm New Password/), "new-password2");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The current password is incorrect.");
    expect(screen.queryByText("secret backend detail")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Current Password/)).toHaveValue("");
  });
});
