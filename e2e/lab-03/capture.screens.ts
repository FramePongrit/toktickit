import fs from "node:fs/promises";
import { test, expect, request as playwrightRequest, type Page } from "@playwright/test";
import {
  API_URL,
  E2E_TAG,
  type E2EUser,
  assertDialogsAccessible,
  assertResponsiveLayout,
  cleanupE2EUsers,
  closeE2EPrisma,
  createE2EUser,
  createTicketApi,
  loginUi,
} from "../support/fixtures.js";

const ROOT = "artifacts/lab-03/screenshots";
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 820, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
] as const;

async function capture(page: Page, folder: string, name: string) {
  await fs.mkdir(`${ROOT}/${folder}`, { recursive: true });
  await page.screenshot({ path: `${ROOT}/${folder}/${name}.png`, fullPage: true });
}

test.describe.serial("E2E-R01 — Lab 3 responsive screenshot evidence", () => {
  let requester: E2EUser;
  let staff: E2EUser;
  let admin: E2EUser;
  let ticket: { id: number; ticketNumber: string };
  const createdUserIds: number[] = [];

  test.beforeAll(async () => {
    requester = await createE2EUser("REQUESTER", "screens-requester");
    staff = await createE2EUser("STAFF", "screens-staff");
    admin = await createE2EUser("ADMIN", "screens-admin");
    createdUserIds.push(requester.id, staff.id, admin.id);

    const api = await playwrightRequest.newContext({ baseURL: API_URL });
    try {
      const login = await api.post(`${API_URL}/api/auth/login`, { data: { email: requester.email, password: requester.password } });
      const session = await login.json();
      ticket = await createTicketApi(api, { user: session.user, csrfToken: session.csrfToken }, `Issue 61 screenshots ${E2E_TAG}`);
    } finally {
      await api.dispose();
    }
  });

  test.afterAll(async () => {
    await cleanupE2EUsers(createdUserIds);
    await closeE2EPrisma();
  });

  test("captures login evidence at every required viewport", async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
      await assertResponsiveLayout(page, `Login ${viewport.name}`);
      await capture(page, "authentication", `login-${viewport.name}`);
    }
  });

  test("captures Staff Queue evidence at every required viewport", async ({ page }) => {
    await loginUi(page, staff);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto("/staff/tickets");
      await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
      await assertResponsiveLayout(page, `Staff Queue ${viewport.name}`);
      await capture(page, "staff-queue", `queue-${viewport.name}`);
    }
  });

  test("captures Staff and Requester Ticket Detail evidence without overflow", async ({ page }) => {
    await loginUi(page, staff);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto(`/staff/tickets/${ticket.id}`);
      await expect(page.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();
      await assertResponsiveLayout(page, `Staff Ticket Detail ${viewport.name}`);
      await capture(page, "staff-ticket-detail", `staff-ticket-detail-${viewport.name}`);
    }

    const navigationToggle = page.getByRole("button", { name: "Open navigation menu" });
    if (await navigationToggle.isVisible()) await navigationToggle.click();
    await page.getByRole("button", { name: "Logout" }).click();
    await loginUi(page, requester);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto(`/tickets/${ticket.id}`);
      await expect(page.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();
      await assertResponsiveLayout(page, `Requester Ticket Detail ${viewport.name}`);
      await capture(page, "staff-ticket-detail", `requester-ticket-detail-${viewport.name}`);
    }
  });

  test("captures User Management evidence and checks dialog semantics", async ({ page }) => {
    await loginUi(page, admin);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto("/admin/users");
      await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
      await assertResponsiveLayout(page, `User Management ${viewport.name}`);
      if (viewport.name === "mobile") {
        await page.getByRole("button", { name: "Create User" }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await assertDialogsAccessible(page);
        await assertResponsiveLayout(page, "User Management create dialog mobile");
        await capture(page, "user-management", "create-dialog-mobile");
        await page.keyboard.press("Escape");
      } else {
        await capture(page, "user-management", `user-management-${viewport.name}`);
      }
    }
  });
});
