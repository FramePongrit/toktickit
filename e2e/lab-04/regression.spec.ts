import { expect, request as playwrightRequest, test } from "@playwright/test";
import {
  API_URL,
  E2E_TAG,
  assertIsolatedE2EDatabase,
  cleanupE2EUsers,
  closeE2EPrisma,
  createE2EUser,
  createTicketApi,
  loginApi,
  loginUi,
  type E2EUser,
} from "../support/fixtures.js";

test.describe.serial("E2E-04 — Lab 1–3 communication, attachment and identity regression", () => {
  let requester: E2EUser;
  let staff: E2EUser;
  const createdUserIds: number[] = [];

  test.beforeAll(async () => {
    assertIsolatedE2EDatabase();
    requester = await createE2EUser("REQUESTER", "issue91-regression-requester");
    createdUserIds.push(requester.id);
    staff = await createE2EUser("STAFF", "issue91-regression-staff");
    createdUserIds.push(staff.id);
  });

  test.afterAll(async () => {
    try {
      await cleanupE2EUsers(createdUserIds);
    } finally {
      await closeE2EPrisma();
    }
  });

  test("preserves Dashboard landing, public communication and attachments while hiding Internal Notes", async ({ page }) => {
    test.setTimeout(90_000);
    const api = await playwrightRequest.newContext({ baseURL: API_URL });
    try {
      const requesterSession = await loginApi(api, requester);
      const ticket = await createTicketApi(api, requesterSession, `Issue 91 regression Ticket ${E2E_TAG}`);
      await loginUi(page, requester);
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.getByRole("link", { name: "My Tickets", exact: true }).click();
      await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
      await page.goto(`/tickets/${ticket.id}`);
      await expect(page.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();

      const publicText = `Requester public update ${E2E_TAG}`;
      await page.getByLabel("Add a public comment").fill(publicText);
      await page.getByRole("button", { name: "Post public comment" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Your public comment was posted." })).toBeVisible();
      await expect(page.getByText(publicText, { exact: true })).toBeVisible();

      await page.getByLabel("Add attachment").setInputFiles({
        name: `issue91-${E2E_TAG}.pdf`,
        mimeType: "application/pdf",
        buffer: Buffer.from(`%PDF-1.4\nTask-owned attachment ${E2E_TAG}\n%%EOF`, "utf8"),
      });
      await expect(page.getByText("1 active of 5")).toBeVisible();
      await expect(page.getByText(`issue91-${E2E_TAG}.pdf`, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Logout" }).click();

      await loginUi(page, staff);
      await expect(page).toHaveURL(/\/staff\/dashboard$/);
      await page.goto(`/staff/tickets/${ticket.id}`);
      await expect(page.getByText(publicText, { exact: true })).toBeVisible();
      await page.getByLabel("Add Internal Note").fill(`Staff-only note ${E2E_TAG}`);
      await page.getByRole("button", { name: "Save Internal Note" }).click();
      await expect(page.getByTestId("note-feedback")).toContainText("Internal Note saved");
      await expect(page.getByText(`Staff-only note ${E2E_TAG}`, { exact: true })).toBeVisible();
      await expect(page.getByText(`issue91-${E2E_TAG}.pdf`, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Logout" }).click();

      await loginUi(page, requester);
      await page.goto(`/tickets/${ticket.id}`);
      await expect(page.getByText(publicText, { exact: true })).toBeVisible();
      await expect(page.getByText(`Staff-only note ${E2E_TAG}`, { exact: true })).toHaveCount(0);
      await expect(page.getByText(`issue91-${E2E_TAG}.pdf`, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Save Internal Note" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
    } finally {
      await api.dispose();
    }
  });
});
