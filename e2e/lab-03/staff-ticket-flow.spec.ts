import { test, expect, request as playwrightRequest } from "@playwright/test";
import {
  API_URL,
  E2E_TAG,
  type E2EUser,
  assertDialogsAccessible,
  assertNoHorizontalOverflow,
  cleanupE2EUsers,
  closeE2EPrisma,
  createE2EUser,
  createTicketApi,
  loginApi,
  loginUi,
} from "../support/fixtures.js";

test.describe.serial("E2E-S01 — real Staff Queue and Ticket workflow", () => {
  let requester: E2EUser;
  let staff: E2EUser;
  let secondStaff: E2EUser;
  const createdUserIds: number[] = [];

  test.beforeAll(async () => {
    requester = await createE2EUser("REQUESTER", "flow-requester");
    staff = await createE2EUser("STAFF", "flow-staff");
    secondStaff = await createE2EUser("STAFF", "flow-second-staff");
    createdUserIds.push(requester.id, staff.id, secondStaff.id);
  });

  test.afterAll(async () => {
    await cleanupE2EUsers(createdUserIds);
    await closeE2EPrisma();
  });

  test("queue filters, ownership actions, communications, resolution lifecycle, attachments, and direct guards", async ({ page, request }) => {
    const requesterApi = await playwrightRequest.newContext({ baseURL: API_URL });
    const staffApi = await playwrightRequest.newContext({ baseURL: API_URL });
    try {
      const requesterSession = await loginApi(requesterApi, requester);
      const ticket = await createTicketApi(requesterApi, requesterSession, `Issue 61 staff flow ${E2E_TAG}`);
      const staffSession = await loginApi(staffApi, staff);
      const queuePrefix = `Issue 61 queue matrix ${E2E_TAG}`;
      const queueTickets: Array<{ id: number; ticketNumber: string }> = [];
      for (let index = 1; index <= 12; index += 1) {
        queueTickets.push(await createTicketApi(requesterApi, requesterSession, `${queuePrefix} ${String(index).padStart(2, "0")}`));
      }
      const highPriorityUpdate = await staffApi.patch(`${API_URL}/api/staff/tickets/${queueTickets[0].id}/it-priority`, {
        headers: { "X-CSRF-Token": staffSession.csrfToken },
        data: { itPriority: "HIGH" },
      });
      expect(highPriorityUpdate.status()).toBe(200);

      const requesterStaffBoundary = await requesterApi.get(`${API_URL}/api/staff/tickets/${ticket.id}`);
      expect(requesterStaffBoundary.status()).toBe(403);
      expect((await requesterStaffBoundary.json()).error.code).toBe("FORBIDDEN");

      const requesterTicketBoundary = await requesterApi.get(`${API_URL}/api/tickets/${ticket.id}`);
      expect(requesterTicketBoundary.status()).toBe(200);

      const missingCsrfClaim = await staffApi.patch(`${API_URL}/api/staff/tickets/${ticket.id}/claim`);
      expect(missingCsrfClaim.status()).toBe(403);
      expect((await missingCsrfClaim.json()).error.code).toBe("CSRF_INVALID");

      await loginUi(page, staff);
      await expect(page).toHaveURL(/\/staff\/tickets(?:\?|$)/);
      await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();

      await page.goto(`/staff/tickets?scope=active&q=${encodeURIComponent(queuePrefix)}&pageSize=10&sort=ticketNumber&order=asc`);
      await expect(page.getByTestId("pagination-summary")).toHaveText("Showing 1 to 10 of 12 tickets");
      await page.locator("#staff-queue-status").selectOption("NEW");
      await expect(page).toHaveURL(/status=NEW/);
      await expect(page.getByTestId("pagination-summary")).toHaveText("Showing 1 to 10 of 12 tickets");
      await page.locator("#staff-queue-it-priority").selectOption("HIGH");
      await expect(page.getByRole("link", { name: queueTickets[0].ticketNumber })).toBeVisible();
      await expect(page.getByTestId("staff-queue-table").locator("tbody tr")).toHaveCount(1);
      await page.locator("#staff-queue-it-priority").selectOption("");
      await page.locator("#staff-queue-sort").selectOption("ticketNumber");
      await page.locator("#staff-queue-order").selectOption("asc");
      await expect(page.getByTestId("staff-queue-table").locator("tbody tr").first().locator("a.fw-semibold", { hasText: queueTickets[0].ticketNumber })).toBeVisible();
      await page.locator("#staff-queue-order").selectOption("desc");
      await expect(page).toHaveURL(/sort=ticketNumber.*order=desc/);
      await expect(page.getByTestId("staff-queue-table").locator("tbody tr").first().locator("a.fw-semibold", { hasText: queueTickets[11].ticketNumber })).toBeVisible();
      await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
      await page.getByRole("button", { name: "Next" }).click();
      await expect(page.getByTestId("pagination-summary")).toHaveText("Showing 11 to 12 of 12 tickets");
      await expect(page.getByTestId("staff-queue-table").locator("tbody tr").first().locator("a.fw-semibold", { hasText: queueTickets[1].ticketNumber })).toBeVisible();
      await page.locator("#staff-queue-status").selectOption("");

      await page.getByLabel("Search").fill(ticket.ticketNumber);
      await expect(page.getByRole("link", { name: ticket.ticketNumber })).toBeVisible();
      await page.getByRole("link", { name: ticket.ticketNumber }).click();
      await expect(page.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();

      await page.getByRole("button", { name: "Claim Ticket" }).click();
      await expect(page.getByText(staff.fullName)).toBeVisible();

      await page.getByRole("button", { name: "Reassign Ticket" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await assertDialogsAccessible(page);
      await page.getByLabel("New eligible Owner").selectOption({ label: `${secondStaff.fullName} — IT Staff` });
      await page.getByRole("button", { name: "Confirm Reassign" }).click();
      await expect(page.getByLabel("Ownership").getByText(secondStaff.fullName)).toBeVisible();

      await page.locator("#staff-it-priority").selectOption("HIGH");
      await page.getByRole("button", { name: "Save IT Priority" }).click();
      await expect(page.getByTestId("priority-feedback")).toContainText("saved");

      await page.getByLabel("Next status").selectOption("OPEN");
      await page.getByRole("button", { name: "Update status" }).click();
      await expect(page.getByTestId("status-feedback")).toContainText("updated");

      await page.getByLabel("Next status").selectOption("IN_PROGRESS");
      await page.getByRole("button", { name: "Update status" }).click();
      await expect(page.getByTestId("status-feedback")).toContainText("updated");

      await expect(page.locator("#staff-status option[value='WAITING_FOR_REQUESTER']")).toHaveCount(1);
      const waitingExplanation = `Please confirm whether the issue is now resolved. Waiting evidence ${E2E_TAG}.`;
      await page.getByLabel("Next status").selectOption("WAITING_FOR_REQUESTER");
      await page.getByLabel(/Public Comment for Requester/).fill(waitingExplanation);
      await page.getByRole("button", { name: "Update status" }).click();
      await expect(page.getByTestId("status-feedback")).toContainText("Waiting For Requester");
      await expect(page.getByText(waitingExplanation, { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Logout" }).click();
      await expect(page).toHaveURL(/\/login$/);
      await loginUi(page, requester);
      await page.goto(`/tickets/${ticket.id}`);
      await expect(page.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();
      await expect(page.getByText(waitingExplanation, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Problem appears resolved" }).click();
      await expect(page.getByRole("dialog", { name: "Confirm resolution indication" })).toBeVisible();
      await assertDialogsAccessible(page);
      await page.getByRole("dialog").getByRole("button", { name: "Confirm indication" }).click();
      await expect(page.getByText("Problem appears resolved has been recorded.", { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Logout" }).click();
      await expect(page).toHaveURL(/\/login$/);
      await loginUi(page, staff);
      await page.goto(`/staff/tickets/${ticket.id}`);
      await expect(page.getByText(`Indicated by ${requester.fullName}`, { exact: false })).toBeVisible();

      await page.getByLabel("Next status").selectOption("OPEN");
      await page.getByRole("button", { name: "Update status" }).click();
      await expect(page.getByTestId("status-feedback")).toContainText("updated");
      await page.getByLabel("Next status").selectOption("IN_PROGRESS");
      await page.getByRole("button", { name: "Update status" }).click();
      await expect(page.getByTestId("status-feedback")).toContainText("updated");

      const malicious = '<img src=x onerror="alert(1)">';
      await page.getByLabel("Add Public Comment").fill(malicious);
      await page.getByRole("button", { name: "Post Public Comment" }).click();
      await expect(page.locator(".zen-comment-body", { hasText: malicious })).toBeVisible();
      await expect(page.locator(".zen-comment-body img")).toHaveCount(0);

      const note = `Internal evidence ${E2E_TAG}`;
      await page.getByLabel("Add Internal Note").fill(note);
      await page.getByRole("button", { name: "Save Internal Note" }).click();
      await expect(page.locator(".staff-communication-internal")).toContainText(note);

      await page.getByLabel("Next status").selectOption("RESOLVED");
      await page.getByRole("button", { name: "Update status" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await assertDialogsAccessible(page);
      await page.getByRole("dialog").getByRole("button", { name: "Confirm Resolved" }).click();
      await expect(page.getByTestId("status-feedback")).toContainText("updated");

      await page.reload();
      await expect(page.getByRole("region", { name: "Ticket and Requester" }).getByTestId("status-badge")).toHaveText("Resolved");
      await expect(page.getByLabel("Add Public Comment")).toBeVisible();
      await expect(page.getByLabel("Add Internal Note")).toBeVisible();
      await expect(page.getByText(`Indicated by ${requester.fullName}`, { exact: false })).toBeVisible();

      await page.getByLabel("Next status").selectOption("REOPENED");
      await page.getByRole("button", { name: "Update status" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "Confirm Reopened" }).click();
      await expect(page.getByTestId("status-feedback")).toContainText("updated");

      await page.goto(`/staff/tickets/${ticket.id}`);
      await expect(page.getByText("No active Resolution Indication.")).toBeVisible();

      const finalTicket = await createTicketApi(requesterApi, requesterSession, `Issue 61 final guard ${E2E_TAG}`);
      const finalOwner = await staffApi.patch(`${API_URL}/api/staff/tickets/${finalTicket.id}/claim`, {
        headers: { "X-CSRF-Token": staffSession.csrfToken },
      });
      expect(finalOwner.status()).toBe(200);
      for (const status of ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const) {
        const finalStatus = await staffApi.patch(`${API_URL}/api/staff/tickets/${finalTicket.id}/status`, {
          headers: { "X-CSRF-Token": staffSession.csrfToken },
          data: { status },
        });
        expect(finalStatus.status()).toBe(200);
      }
      const finalInvalidPriority = await staffApi.patch(`${API_URL}/api/staff/tickets/${finalTicket.id}/it-priority`, {
        headers: { "X-CSRF-Token": staffSession.csrfToken },
        data: { itPriority: "NOT_A_PRIORITY" },
      });
      expect(finalInvalidPriority.status()).toBe(409);
      expect((await finalInvalidPriority.json()).error.code).toBe("TICKET_FINAL");

      await page.goto(`/staff/tickets/${finalTicket.id}`);
      await expect(page.getByTestId("terminal-readonly")).toBeVisible();
      await expect(page.getByLabel("Add Public Comment")).toHaveCount(0);
      await assertNoHorizontalOverflow(page, "Staff Ticket Detail desktop");
    } finally {
      await requesterApi.dispose();
      await staffApi.dispose();
    }
  });

  test("Requester can upload, download, and remove an attachment through the browser", async ({ page, request }) => {
    const requesterApi = await playwrightRequest.newContext({ baseURL: API_URL });
    try {
      const session = await loginApi(requesterApi, requester);
      const ticket = await createTicketApi(requesterApi, session, `Issue 61 attachment ${E2E_TAG}`);
      await loginUi(page, requester);
      await page.goto(`/tickets/${ticket.id}`);
      await expect(page.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();

      await page.setInputFiles("#attachment-input", {
        name: "issue-61-evidence.png",
        mimeType: "image/png",
        buffer: Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"),
      });
      await expect(page.getByText("1 active of 5")).toBeVisible();
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download" }).click();
      expect((await download).suggestedFilename()).toBe("issue-61-evidence.png");

      await page.getByRole("button", { name: "Remove", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await assertDialogsAccessible(page);
      await page.getByLabel("Removal reason").fill("Issue 61 cleanup-owned attachment");
      await page.getByRole("button", { name: "Confirm removal" }).click();
      await expect(page.getByText("Removed", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Download" })).toHaveCount(0);
    } finally {
      await requesterApi.dispose();
    }
  });
});
