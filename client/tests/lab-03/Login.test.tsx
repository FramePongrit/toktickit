import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../../src/AppRouter.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { setCsrfToken } from "../../src/lib/http.js";

const USER = {
  id: 1,
  fullName: "Niran Requester",
  email: "niran@example.test",
  active: true,
  role: "REQUESTER" as const,
  mustChangePassword: false,
};

function response(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>
  );
}

function pathOf(input: RequestInfo | URL): string {
  return new URL(String(input)).pathname;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken(null);
});

describe("Issue 50 Login", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (pathOf(input) === "/api/auth/me") {
        return response(401, { error: { code: "UNAUTHENTICATED", message: "Authentication is required." } });
      }
      return response(404, { error: { code: "NOT_FOUND", message: "Not found." } });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("UI-L01: validates email/password locally and focuses the first invalid field without an API call", async () => {
    const user = userEvent.setup();
    renderLogin();
    await screen.findByRole("heading", { name: "Sign in" });

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText(/Email/));
    expect(fetchMock).toHaveBeenCalledTimes(1); // bootstrap /me only
  });

  it("UI-L01: prevents duplicate submissions and disables the form while signing in", async () => {
    const user = userEvent.setup();
    let resolveLogin!: (value: Response) => void;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (pathOf(input) === "/api/auth/me") return Promise.resolve(response(401));
      if (pathOf(input) === "/api/auth/login") {
        return new Promise<Response>((resolve) => {
          resolveLogin = resolve;
        });
      }
      return Promise.resolve(response(404));
    });

    renderLogin();
    await screen.findByRole("heading", { name: "Sign in" });
    await user.type(screen.getByLabelText(/Email/), "NIRAN@EXAMPLE.TEST");
    await user.type(screen.getByLabelText(/^Password/), "valid-password1");
    const submit = screen.getByRole("button", { name: "Sign in" });
    await user.click(submit);
    await user.click(submit);

    expect(screen.getByRole("button", { name: "Signing in..." })).toBeDisabled();
    expect(screen.getByTestId("login-spinner")).toBeInTheDocument();
    expect(screen.getByTestId("login-status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: "Signing in..." })).toHaveAttribute("aria-busy", "true");
    expect(fetchMock.mock.calls.filter(([input]) => pathOf(input) === "/api/auth/login")).toHaveLength(1);

    resolveLogin(response(200, { user: USER, csrfToken: "csrf-login" }));
    expect(await screen.findByTestId("current-user")).toHaveTextContent("Niran Requester");
  });

  it.each([
    ["INVALID_CREDENTIALS", "Email or password is incorrect."],
    ["USER_INACTIVE", "This account is inactive. Contact an administrator."],
    ["LOGIN_THROTTLED", "Too many sign-in attempts. Please wait and try again later."],
  ])("UI-L01: renders safe %s feedback without account details", async (code, message) => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (pathOf(input) === "/api/auth/me") return Promise.resolve(response(401));
      if (pathOf(input) === "/api/auth/login") {
        return Promise.resolve(response(code === "LOGIN_THROTTLED" ? 429 : code === "USER_INACTIVE" ? 403 : 401, {
          error: { code, message: "server detail must not be rendered" },
        }));
      }
      return Promise.resolve(response(404));
    });

    renderLogin();
    await screen.findByRole("heading", { name: "Sign in" });
    await user.type(screen.getByLabelText(/Email/), "niran@example.test");
    await user.type(screen.getByLabelText(/^Password/), "wrong-password1");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText(/Email/)).toHaveValue("niran@example.test");
    expect(screen.getByLabelText(/^Password/)).toHaveValue("");
    expect(screen.queryByText("server detail must not be rendered")).not.toBeInTheDocument();
  });

  it("UI-L01/UI-H01: normalizes email, sends credentials, and lands by the authenticated role", async () => {
    const user = userEvent.setup();
    const staff = { ...USER, fullName: "Somsak Staff", role: "STAFF" as const };
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (pathOf(input) === "/api/auth/me") return Promise.resolve(response(401));
      if (pathOf(input) === "/api/auth/login") return Promise.resolve(response(200, { user: staff, csrfToken: "csrf-login" }));
      return Promise.resolve(response(404));
    });

    renderLogin();
    await screen.findByRole("heading", { name: "Sign in" });
    await user.type(screen.getByLabelText(/Email/), "  STAFF@EXAMPLE.TEST ");
    await user.type(screen.getByLabelText(/^Password/), "valid-password1");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByTestId("staff-landing")).toBeInTheDocument();
    const loginCall = fetchMock.mock.calls.find(([input]) => pathOf(input) === "/api/auth/login");
    expect(loginCall?.[1]).toEqual(expect.objectContaining({ credentials: "include" }));
    expect(JSON.parse(String((loginCall?.[1] as RequestInit).body))).toEqual({ email: "staff@example.test", password: "valid-password1" });
  });

  it("UI-L01: sends a must-change-password user directly to Change Password", async () => {
    const user = userEvent.setup();
    const mandatory = { ...USER, fullName: "Legacy Requester", mustChangePassword: true };
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (pathOf(input) === "/api/auth/me") return Promise.resolve(response(401));
      if (pathOf(input) === "/api/auth/login") return Promise.resolve(response(200, { user: mandatory, csrfToken: "csrf-login" }));
      return Promise.resolve(response(404));
    });

    renderLogin();
    await screen.findByRole("heading", { name: "Sign in" });
    await user.type(screen.getByLabelText(/Email/), "legacy@example.test");
    await user.type(screen.getByLabelText(/^Password/), "initial-password1");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Change password" })).toBeInTheDocument();
    expect(screen.getByText(/initial password must be changed/i)).toBeInTheDocument();
  });

  it("UI-L01: gives a generic retryable message for network/server failures", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (pathOf(input) === "/api/auth/me") return Promise.resolve(response(401));
      if (pathOf(input) === "/api/auth/login") return Promise.reject(new Error("database password leaked"));
      return Promise.resolve(response(404));
    });

    renderLogin();
    await screen.findByRole("heading", { name: "Sign in" });
    await user.type(screen.getByLabelText(/Email/), "niran@example.test");
    await user.type(screen.getByLabelText(/^Password/), "valid-password1");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("We couldn't sign you in. Please try again."));
    expect(screen.queryByText("database password leaked")).not.toBeInTheDocument();
  });
});
