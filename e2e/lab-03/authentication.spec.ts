import { test, expect, request as playwrightRequest } from "@playwright/test";
import {
  API_URL,
  E2E_CHANGED_PASSWORD,
  E2E_INITIAL_PASSWORD,
  E2E_PASSWORD,
  type E2EUser,
  createE2EUser,
  cleanupE2EUsers,
  closeE2EPrisma,
  loginApi,
  loginUi,
} from "../support/fixtures.js";

test.describe.serial("E2E-A01 — Lab 3 authentication and direct security", () => {
  let requester: E2EUser;
  let mandatory: E2EUser;
  let inactive: E2EUser;
  const createdUserIds: number[] = [];

  test.beforeAll(async () => {
    requester = await createE2EUser("REQUESTER", "auth-requester");
    mandatory = await createE2EUser("REQUESTER", "auth-mandatory", {
      mustChangePassword: true,
      password: E2E_INITIAL_PASSWORD,
    });
    inactive = await createE2EUser("REQUESTER", "auth-inactive", { active: false });
    createdUserIds.push(requester.id, mandatory.id, inactive.id);
  });

  test.afterAll(async () => {
    await cleanupE2EUsers(createdUserIds);
    await closeE2EPrisma();
  });

  test("valid login lands by Role and direct API guards reject unauthenticated/forged mutations", async ({ page, request }) => {
    const noCookie = await playwrightRequest.newContext({ baseURL: API_URL });
    try {
      const unauthenticated = await noCookie.get("/api/tickets");
      expect(unauthenticated.status()).toBe(401);
      expect((await unauthenticated.json()).error.code).toBe("UNAUTHENTICATED");
    } finally {
      await noCookie.dispose();
    }

    await loginUi(page, requester);
    await expect(page).toHaveURL(/\/tickets$/);
    await expect(page.getByRole("link", { name: "My Tickets" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Staff Queue" })).toHaveCount(0);

    await page.goto("/staff/tickets");
    await expect(page.getByRole("heading", { name: "You do not have access to this page" })).toBeVisible();
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "You do not have access to this page" })).toBeVisible();
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/tickets");
    await expect(page).toHaveURL(/\/login$/);

    const session = await loginApi(request, requester);
    const staffBoundary = await request.get(`${API_URL}/api/staff/tickets`);
    expect(staffBoundary.status()).toBe(403);
    expect((await staffBoundary.json()).error.code).toBe("FORBIDDEN");

    const forgedCsrf = await request.post(`${API_URL}/api/tickets`, {
      headers: { "X-CSRF-Token": "forged-token" },
      data: { categoryId: 1, relatedSystemId: 1, requestedPriority: "LOW", summary: "", description: "" },
    });
    expect(forgedCsrf.status()).toBe(403);
    expect((await forgedCsrf.json()).error.code).toBe("CSRF_INVALID");

    const logout = await request.post(`${API_URL}/api/auth/logout`, {
      headers: { "X-CSRF-Token": session.csrfToken },
      data: {},
    });
    expect(logout.status()).toBe(204);
    const reused = await request.get(`${API_URL}/api/auth/me`);
    expect(reused.status()).toBe(401);
  });

  test("invalid and inactive credentials expose safe, distinct browser feedback", async ({ page, request }) => {
    const wrong = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: requester.email, password: "WrongPassword123!" },
    });
    const unknown = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: `unknown-${Date.now()}@example.test`, password: "WrongPassword123!" },
    });
    expect(wrong.status()).toBe(401);
    expect(unknown.status()).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());

    const inactiveResponse = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: inactive.email, password: inactive.password },
    });
    expect(inactiveResponse.status()).toBe(403);
    expect((await inactiveResponse.json()).error.code).toBe("USER_INACTIVE");
    expect(inactiveResponse.headers()["set-cookie"]).toBeUndefined();

    await page.goto("/login");
    await page.getByLabel("Email").fill(inactive.email);
    await page.getByLabel("Password").fill(inactive.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toHaveText(/account is inactive/i);
    await expect(page.getByLabel("Password")).toHaveValue("");
  });

  test("mandatory password change gates normal routes and invalidates the Initial Password", async ({ page, request }) => {
    await loginUi(page, { ...mandatory, password: E2E_INITIAL_PASSWORD });
    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.getByText(/initial password must be changed/i)).toBeVisible();

    await page.locator("#current-password").fill(E2E_INITIAL_PASSWORD);
    await page.locator("#new-password").fill(E2E_CHANGED_PASSWORD);
    await page.locator("#confirm-password").fill(E2E_CHANGED_PASSWORD);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL(/\/tickets$/);

    const oldPassword = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: mandatory.email, password: E2E_INITIAL_PASSWORD },
    });
    expect(oldPassword.status()).toBe(401);

    const newPassword = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: mandatory.email, password: E2E_CHANGED_PASSWORD },
    });
    expect(newPassword.status()).toBe(200);
    mandatory.password = E2E_CHANGED_PASSWORD;
  });
});
