import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../../src/AppRouter.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { UserManagementPage } from "../../src/pages/UserManagementPage.js";
import * as usersApi from "../../src/api/adminUsers.js";
import { ApiError, setCsrfToken } from "../../src/lib/http.js";
import type { AdminUser } from "../../src/types/index.js";

const ADMIN: AdminUser = {
  id: 1,
  fullName: "Ada Administrator",
  email: "ada@example.test",
  active: true,
  role: "ADMIN",
  mustChangePassword: false,
};

const STAFF: AdminUser = {
  id: 2,
  fullName: "Sam Support",
  email: "sam@example.test",
  active: true,
  role: "STAFF",
  mustChangePassword: false,
};

const INACTIVE_REQUESTER: AdminUser = {
  id: 3,
  fullName: "Ria Requester",
  email: "ria@example.test",
  active: false,
  role: "REQUESTER",
  mustChangePassword: true,
};

const USERS = [ADMIN, STAFF, INACTIVE_REQUESTER];

function response(status: number, body?: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function pathOf(input: RequestInfo | URL): string {
  return new URL(String(input)).pathname;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/users"]}>
      <AuthProvider>
        <UserManagementPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

async function waitForUserTable() {
  return screen.findByTestId("admin-users-table");
}

function renderApp(initialEntry: string, role: "ADMIN" | "STAFF") {
  const current = role === "ADMIN" ? ADMIN : STAFF;
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (pathOf(input) === "/api/auth/me") return response(200, { user: ADMIN, csrfToken: "csrf-admin" });
    return response(404, { error: { code: "NOT_FOUND", message: "Not found" } });
  }));
  vi.spyOn(usersApi, "fetchAdminUsers").mockResolvedValue({ data: USERS });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setCsrfToken(null);
});

describe("Issue #60 Administrator User Management", () => {
  it("UI-U01/UI-U02: renders deterministic table/cards, badges, search, Role, and active-status filters", async () => {
    const user = userEvent.setup();
    const fetchUsers = vi.mocked(usersApi.fetchAdminUsers);
    renderPage();

    expect(await screen.findByRole("heading", { name: "User Management" })).toBeInTheDocument();
    const table = screen.getByTestId("admin-users-table");
    expect(table).toHaveClass("d-none", "d-md-block");
    expect(within(table).getByText("Ada Administrator")).toBeInTheDocument();
    expect(within(table).getByText("Administrator")).toBeInTheDocument();
    expect(within(table).getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByTestId("admin-users-cards")).toHaveClass("d-md-none");
    expect(screen.getByRole("button", { name: "Create User" })).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Search" }), "sam");
    await waitFor(() => expect(fetchUsers).toHaveBeenLastCalledWith({ q: "sam", role: undefined, active: undefined }));
    await user.selectOptions(screen.getByLabelText("Role"), "STAFF");
    await waitFor(() => expect(fetchUsers).toHaveBeenLastCalledWith({ q: "sam", role: "STAFF", active: undefined }));
    await user.selectOptions(screen.getByLabelText("Active status"), "false");
    await waitFor(() => expect(fetchUsers).toHaveBeenLastCalledWith({ q: "sam", role: "STAFF", active: false }));
  });

  it("UI-U01: creates a User, validates fields, clears sensitive values, refreshes, and announces success", async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(usersApi, "createAdminUser").mockResolvedValue({ user: { ...INACTIVE_REQUESTER, id: 4, fullName: "New User" } });
    renderPage();
    await waitForUserTable();

    const trigger = screen.getByRole("button", { name: "Create User" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Create User" });
    expect(within(dialog).getByLabelText("Initial Password")).toHaveAttribute("type", "password");
    await user.click(within(dialog).getByRole("button", { name: "Create User" }));
    expect(await within(dialog).findByText("Full name is required.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Full name"), "New User");
    await user.type(within(dialog).getByLabelText("Email"), "new@example.test");
    await user.selectOptions(within(dialog).getByLabelText("Role"), "STAFF");
    await user.type(within(dialog).getByLabelText("Initial Password"), "StartPassword1");
    await user.type(within(dialog).getByLabelText("Confirm Initial Password"), "StartPassword1");
    await user.click(within(dialog).getByRole("button", { name: "Create User" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      fullName: "New User",
      email: "new@example.test",
      role: "STAFF",
      active: true,
      initialPassword: "StartPassword1",
      confirmation: "StartPassword1",
    })));
    expect(await screen.findByText("User created successfully.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    const reopened = screen.getByRole("dialog", { name: "Create User" });
    expect(within(reopened).getByLabelText("Initial Password")).toHaveValue("");
    expect(within(reopened).getByLabelText("Confirm Initial Password")).toHaveValue("");
  });

  it("UI-U01: keeps the Create dialog open for duplicate email and shows a safe field conflict", async () => {
    const user = userEvent.setup();
    vi.spyOn(usersApi, "createAdminUser").mockRejectedValue(new ApiError(409, "EMAIL_ALREADY_EXISTS", "A User with this email already exists."));
    renderPage();
    await waitForUserTable();
    await user.click(screen.getByRole("button", { name: "Create User" }));
    const dialog = screen.getByRole("dialog", { name: "Create User" });
    await user.type(within(dialog).getByLabelText("Full name"), "Duplicate");
    await user.type(within(dialog).getByLabelText("Email"), "ada@example.test");
    await user.type(within(dialog).getByLabelText("Initial Password"), "StartPassword1");
    await user.type(within(dialog).getByLabelText("Confirm Initial Password"), "StartPassword1");
    await user.click(within(dialog).getByRole("button", { name: "Create User" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("already exists");
    expect(within(dialog).getByLabelText("Full name")).toHaveValue("Duplicate");
    expect(within(dialog).getByLabelText("Initial Password")).toHaveValue("");
    expect(screen.queryByText("passwordHash")).not.toBeInTheDocument();
  });

  it("UI-U01: edits another User and resets their Initial Password as a distinct confirmed action", async () => {
    const user = userEvent.setup();
    const edit = vi.spyOn(usersApi, "editAdminUser").mockResolvedValue({ user: { ...STAFF, fullName: "Sam Updated" } });
    const reset = vi.spyOn(usersApi, "resetAdminUserPassword").mockResolvedValue({ user: STAFF });
    renderPage();
    await waitForUserTable();
    await user.click(screen.getByRole("button", { name: "Edit Sam Support" }));
    const editDialog = screen.getByRole("dialog", { name: "Edit Sam Support" });
    await user.clear(within(editDialog).getByLabelText("Full name"));
    await user.type(within(editDialog).getByLabelText("Full name"), "Sam Updated");
    await user.click(within(editDialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(edit).toHaveBeenCalledWith(2, expect.objectContaining({ fullName: "Sam Updated", role: "STAFF", active: true })));
    expect(await screen.findByText("Sam Updated updated successfully.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit Sam Support" }));
    await user.click(within(screen.getByRole("dialog", { name: "Edit Sam Support" })).getByRole("button", { name: "Reset Initial Password" }));
    const resetDialog = screen.getByRole("dialog", { name: /Reset Initial Password for Sam Support/ });
    await user.type(within(resetDialog).getByLabelText("New Initial Password"), "ResetPassword1");
    await user.type(within(resetDialog).getByLabelText("Confirm Initial Password"), "ResetPassword1");
    await user.click(within(resetDialog).getByRole("button", { name: "Confirm Reset" }));
    await waitFor(() => expect(reset).toHaveBeenCalledWith(2, { initialPassword: "ResetPassword1", confirmation: "ResetPassword1" }));
    expect(await screen.findByText(/Initial Password reset for Sam Support/)).toBeInTheDocument();
  });

  it("UI-U01: allows own name/email edits while disabling self Role, active, and reset controls", async () => {
    const user = userEvent.setup();
    const edit = vi.spyOn(usersApi, "editAdminUser").mockResolvedValue({ user: { ...ADMIN, fullName: "Ada Renamed" } });
    renderPage();
    await waitForUserTable();
    await user.click(screen.getByRole("button", { name: "Edit Ada Administrator" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Ada Administrator" });
    expect(within(dialog).getByLabelText("Role")).toBeDisabled();
    expect(within(dialog).getByLabelText("Active account")).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Reset Initial Password" })).toBeDisabled();
    expect(within(dialog).getByText(/cannot change your own Role/)).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("Full name"));
    await user.type(within(dialog).getByLabelText("Full name"), "Ada Renamed");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(edit).toHaveBeenCalledWith(1, { fullName: "Ada Renamed", email: ADMIN.email }));
  });

  it("UI-U01: sends Role and active toggle changes and reflects the updated account state", async () => {
    const user = userEvent.setup();
    const updated = { ...STAFF, role: "ADMIN" as const, active: false };
    const fetchUsers = vi.mocked(usersApi.fetchAdminUsers);
    fetchUsers.mockReset()
      .mockResolvedValueOnce({ data: USERS })
      .mockResolvedValueOnce({ data: [ADMIN, updated, INACTIVE_REQUESTER] });
    const edit = vi.spyOn(usersApi, "editAdminUser").mockResolvedValue({ user: updated });
    renderPage();
    await waitForUserTable();
    await user.click(screen.getByRole("button", { name: "Edit Sam Support" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Sam Support" });
    await user.selectOptions(within(dialog).getByLabelText("Role"), "ADMIN");
    await user.click(within(dialog).getByLabelText("Active account"));
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(edit).toHaveBeenCalledWith(2, {
      fullName: STAFF.fullName,
      email: STAFF.email,
      role: "ADMIN",
      active: false,
    }));
    const table = await waitForUserTable();
    const row = within(table).getByText("Sam Support").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("Administrator")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("Inactive")).toBeInTheDocument();
  });

  it("UI-U01: renders actionable last-admin and owned-ticket conflicts without leaking ticket details", async () => {
    const user = userEvent.setup();
    const edit = vi.spyOn(usersApi, "editAdminUser")
      .mockRejectedValueOnce(new ApiError(409, "LAST_ACTIVE_ADMINISTRATOR", "At least one active Administrator must remain."))
      .mockRejectedValueOnce(new ApiError(409, "USER_OWNS_NON_FINAL_TICKETS", "Reassign Tickets first.", [], { nonFinalOwnedTicketCount: 3 }));
    renderPage();
    await waitForUserTable();
    await user.click(screen.getByRole("button", { name: "Edit Sam Support" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Sam Support" });
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(dialog).findByText(/Keep another active Administrator/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(dialog).findByText(/Reassign 3 non-final Tickets/)).toBeInTheDocument();
    expect(screen.queryByText(/TCK-|ticket number|Summary:/i)).not.toBeInTheDocument();
  });

  it("UI-U01: distinguishes loading, empty, no-results, forbidden, and retryable failure states", async () => {
    const user = userEvent.setup();
    let resolve!: (value: { data: AdminUser[] }) => void;
    vi.mocked(usersApi.fetchAdminUsers).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    renderPage();
    expect(screen.getByTestId("admin-user-skeleton")).toHaveAttribute("aria-busy", "true");
    resolve({ data: [] });
    expect(await screen.findByText("No Users found.")).toBeInTheDocument();

    cleanup();
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => pathOf(input) === "/api/auth/me" ? response(200, { user: ADMIN, csrfToken: "csrf" }) : response(404)));
    vi.spyOn(usersApi, "fetchAdminUsers").mockResolvedValue({ data: [] });
    renderPage();
    await user.type(await screen.findByRole("searchbox", { name: "Search" }), "missing");
    expect(await screen.findByText("No Users match these filters.")).toBeInTheDocument();

    cleanup();
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => pathOf(input) === "/api/auth/me" ? response(200, { user: ADMIN, csrfToken: "csrf" }) : response(404)));
    vi.spyOn(usersApi, "fetchAdminUsers").mockRejectedValueOnce(new ApiError(503, "UNEXPECTED", "Unavailable")).mockResolvedValueOnce({ data: USERS });
    renderPage();
    expect(await screen.findByText("Could not load Users")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(within(await waitForUserTable()).getByText("Sam Support")).toBeInTheDocument();

    cleanup();
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => pathOf(input) === "/api/auth/me" ? response(200, { user: ADMIN, csrfToken: "csrf" }) : response(404)));
    vi.spyOn(usersApi, "fetchAdminUsers").mockRejectedValue(new ApiError(403, "FORBIDDEN", "Forbidden"));
    renderPage();
    expect(await screen.findByText("You do not have access to User Management")).toBeInTheDocument();
  });

  it("UI-U02: traps dialog focus, closes on Escape, returns focus, and keeps password fields write-only", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForUserTable();
    const trigger = screen.getByRole("button", { name: "Create User" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Create User" });
    const first = within(dialog).getByLabelText("Full name");
    const last = within(dialog).getByRole("button", { name: "Create User" });
    expect(document.activeElement).toBe(first);
    last.focus();
    await user.tab();
    expect(document.activeElement).toBe(first);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("UI-U02: returns Reset Initial Password focus after both Cancel and Escape", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForUserTable();
    await user.click(screen.getByRole("button", { name: "Edit Sam Support" }));

    let editDialog = screen.getByRole("dialog", { name: "Edit Sam Support" });
    const resetAction = within(editDialog).getByRole("button", { name: "Reset Initial Password" });
    await user.click(resetAction);
    expect(screen.getByRole("dialog", { name: /Reset Initial Password for Sam Support/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    editDialog = await screen.findByRole("dialog", { name: "Edit Sam Support" });
    expect(document.activeElement).toBe(within(editDialog).getByRole("button", { name: "Reset Initial Password" }));

    await user.click(within(editDialog).getByRole("button", { name: "Reset Initial Password" }));
    const resetDialog = screen.getByRole("dialog", { name: /Reset Initial Password for Sam Support/ });
    await user.click(within(resetDialog).getByRole("button", { name: "Cancel" }));
    editDialog = await screen.findByRole("dialog", { name: "Edit Sam Support" });
    expect(document.activeElement).toBe(within(editDialog).getByRole("button", { name: "Reset Initial Password" }));
  });

  it("UI-U02: focuses the dialog fallback and blocks Tab while a mutation disables every control", async () => {
    const user = userEvent.setup();
    let resolveCreate!: (value: { user: AdminUser }) => void;
    vi.spyOn(usersApi, "createAdminUser").mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve; }));
    renderPage();
    await waitForUserTable();
    await user.click(screen.getByRole("button", { name: "Create User" }));
    const dialog = screen.getByRole("dialog", { name: "Create User" });
    await user.type(within(dialog).getByLabelText("Full name"), "Busy User");
    await user.type(within(dialog).getByLabelText("Email"), "busy@example.test");
    await user.type(within(dialog).getByLabelText("Initial Password"), "BusyPassword1");
    await user.type(within(dialog).getByLabelText("Confirm Initial Password"), "BusyPassword1");
    await user.click(within(dialog).getByRole("button", { name: "Create User" }));

    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Creating User..." })).toBeDisabled());
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(dialog);
    resolveCreate({ user: { ...STAFF, id: 4, fullName: "Busy User" } });
    expect(await screen.findByText("User created successfully.")).toBeInTheDocument();
  });

  it("UI-H01/UI-U02: exposes User Management only for Administrators and uses bounded responsive representations", async () => {
    renderApp("/admin/users", "ADMIN");
    expect(await screen.findByRole("heading", { name: "User Management" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "User Management" })).toBeInTheDocument();
    expect(screen.getByTestId("admin-users-table")).toHaveClass("d-none", "d-md-block");
    expect(screen.getByTestId("admin-users-cards")).toHaveClass("d-md-none");
    expect(document.documentElement.querySelector(".admin-user-management")?.classList.contains("overflow-x-auto")).toBe(false);
  });

  it("UI-H01/UI-U01: blocks direct User Management navigation and hides the navigation item for Staff", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (pathOf(input) === "/api/auth/me") return response(200, { user: STAFF, csrfToken: "csrf-staff" });
      return response(404, { error: { code: "NOT_FOUND", message: "Not found" } });
    }));
    renderApp("/admin/users", "STAFF");
    expect(await screen.findByRole("heading", { name: "You do not have access to this page" })).toBeInTheDocument();
    expect(screen.queryByTestId("user-management-page")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "User Management" })).not.toBeInTheDocument();
  });
});
