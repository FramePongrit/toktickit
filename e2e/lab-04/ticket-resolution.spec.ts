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

type TicketDetail = { id: number; version: number; currentStatus: string; workCycle: number; resolvedAt: string | null };

async function selectAndConfirmStatus(page: import("@playwright/test").Page, status: string, cancelReason?: string) {
  await page.getByRole("tab", { name: "Ticket Details" }).click();
  await page.getByLabel("Next status").selectOption(status);
  if (status === "CANCELLED") await page.getByLabel("Cancellation reason").fill(cancelReason ?? "E2E cancellation reason");
  await page.getByRole("button", { name: "Update status" }).click();
  const confirmation = page.getByRole("dialog", { name: `Confirm ${status[0]}${status.slice(1).toLowerCase()} status` });
  if (await confirmation.count()) await confirmation.getByRole("button", { name: `Confirm ${status[0]}${status.slice(1).toLowerCase()}` }).click();
  await expect(page.getByTestId("status-feedback")).toContainText(/updated|resolved|reopened|closed|cancelled/i);
}

async function createActionInBrowser(page: import("@playwright/test").Page, description: string, followUpNote?: string) {
  await page.getByRole("tab", { name: "Actions Taken" }).click();
  await page.getByRole("button", { name: "New Action" }).click();
  await page.getByLabel(/Action Description/).fill(description);
  if (followUpNote) {
    await page.getByLabel("Follow-Up Required?").check();
    await page.getByLabel("Follow-up Note").fill(followUpNote);
  }
  const responsePromise = page.waitForResponse((response) => response.url().includes("/api/staff/tickets/") && response.url().endsWith("/actions") && response.request().method() === "POST" && response.status() === 201);
  await page.getByRole("button", { name: "Save Planned Action" }).click();
  const response = await responsePromise;
  const body = await response.json() as { action: { id: number } };
  await expect(page.getByRole("heading", { name: `Action ${body.action.id} · Planned` })).toBeVisible();
  return body.action.id;
}

async function completeActionInBrowser(page: import("@playwright/test").Page, actionId: number, result: string) {
  await page.getByRole("button", { name: "Complete" }).click();
  await page.getByLabel("Result").fill(result);
  const responsePromise = page.waitForResponse((response) => response.url().endsWith(`/actions/${actionId}/transitions`) && response.request().method() === "POST" && response.status() === 200);
  await page.getByRole("button", { name: "Confirm Complete" }).click();
  await responsePromise;
  await expect(page.getByRole("heading", { name: `Action ${actionId} · Completed` })).toBeVisible();
}

test.describe.serial("E2E-02 — resolution gate, reopened cycle, close and cancellation", () => {
  let requester: E2EUser;
  let staff: E2EUser;
  const createdUserIds: number[] = [];

  test.beforeAll(async () => {
    assertIsolatedE2EDatabase();
    requester = await createE2EUser("REQUESTER", "issue91-resolution-requester");
    createdUserIds.push(requester.id);
    staff = await createE2EUser("STAFF", "issue91-resolution-staff");
    createdUserIds.push(staff.id);
  });

  test.afterAll(async () => {
    try {
      await cleanupE2EUsers(createdUserIds);
    } finally {
      await closeE2EPrisma();
    }
  });

  test("requires cleared follow-up evidence in each cycle and closes with the latest resolution time", async ({ page }) => {
    test.setTimeout(120_000);
    const requesterApi = await playwrightRequest.newContext({ baseURL: API_URL });
    const staffApi = await playwrightRequest.newContext({ baseURL: API_URL });
    try {
      const requesterSession = await loginApi(requesterApi, requester);
      const ticket = await createTicketApi(requesterApi, requesterSession, `Issue 91 resolution cycle ${E2E_TAG}`);
      await loginApi(staffApi, staff);
      await loginUi(page, staff);
      await page.goto(`/staff/tickets/${ticket.id}`);
      await page.getByRole("button", { name: "Claim Ticket" }).click();
      await expect(page.getByText(staff.fullName)).toBeVisible();
      await selectAndConfirmStatus(page, "OPEN");
      await selectAndConfirmStatus(page, "IN_PROGRESS");

      const firstActionId = await createActionInBrowser(page, "Collect first-cycle verification", "Confirm the fix with the requester");
      await completeActionInBrowser(page, firstActionId, "First-cycle checks passed");
      await page.getByRole("tab", { name: "Ticket Details" }).click();
      await expect(page.getByLabel("Next status").locator('option[value="RESOLVED"]')).toHaveCount(0);
      const resolutionGate = page.getByLabel("Resolution requirements");
      await expect(resolutionGate).toContainText("Cycle 1: 1 completed, 0 unfinished, 1 requiring follow-up.");

      await page.getByRole("tab", { name: "Actions Taken" }).click();
      await page.getByRole("button", { name: "Edit Action" }).click();
      await page.getByLabel("Follow-Up Required?").uncheck();
      await page.getByLabel("Correction Reason").fill("Follow-up was completed and verified");
      const correctionResponsePromise = page.waitForResponse((response) =>
        response.url().endsWith(`/api/staff/tickets/${ticket.id}/actions/${firstActionId}`)
        && response.request().method() === "PATCH"
        && response.status() === 200
      );
      await page.getByRole("button", { name: "Save revision" }).click();
      const correctionResponse = await correctionResponsePromise;
      const correctionBody = await correctionResponse.json() as {
        action: { followUpRequired: boolean; followUpNote: string | null };
      };
      expect(correctionBody.action).toMatchObject({
        followUpRequired: false,
        followUpNote: "Confirm the fix with the requester",
      });
      const historyResponse = await staffApi.get(
        `${API_URL}/api/staff/tickets/${ticket.id}/actions/${firstActionId}/history?page=1&pageSize=10`
      );
      expect(historyResponse.status()).toBe(200);
      const historyBody = await historyResponse.json() as {
        data: Array<{ operation: string; actor: { id: number }; reason: string | null; after: Record<string, unknown> | null }>;
      };
      expect(historyBody.data).toContainEqual(expect.objectContaining({
        operation: "EDIT",
        actor: expect.objectContaining({ id: staff.id }),
        reason: "Follow-up was completed and verified",
        after: expect.objectContaining({
          followUpRequired: false,
          followUpNote: "Confirm the fix with the requester",
        }),
      }));
      await expect(page.getByText(/Latest Ticket, Actions, and workflow loaded/)).toBeVisible();
      await expect(page.getByRole("heading", { name: `Change history for Action ${firstActionId}` })).toBeVisible();
      await expect(page.getByText(/Reason: Follow-up was completed and verified/)).toBeVisible();
      await expect(page.getByText(/Follow-up required: Yes.*No/)).toBeVisible();
      await page.getByRole("tab", { name: "Ticket Details" }).click();
      await expect(resolutionGate).toContainText("Cycle 1: 1 completed, 0 unfinished, 0 requiring follow-up.");
      await selectAndConfirmStatus(page, "RESOLVED");
      const firstResolution = await staffApi.get(`${API_URL}/api/staff/tickets/${ticket.id}`);
      expect(firstResolution.status()).toBe(200);
      const firstResolvedAt = (await firstResolution.json() as TicketDetail).resolvedAt;
      expect(firstResolvedAt).toBeTruthy();

      await selectAndConfirmStatus(page, "REOPENED");
      await expect(page.getByTestId("ticket-work-cycle")).toContainText("Work cycle 2");
      await expect(page.getByTestId("ticket-work-cycle")).toContainText("Not resolved in this cycle");
      await expect(page.getByLabel("Next status").locator('option[value="RESOLVED"]')).toHaveCount(0);
      await expect(resolutionGate).toContainText("Cycle 2: 0 completed, 0 unfinished, 0 requiring follow-up.");
      const reopened = await staffApi.get(`${API_URL}/api/staff/tickets/${ticket.id}`);
      expect(reopened.status()).toBe(200);
      expect((await reopened.json() as TicketDetail).resolvedAt).toBeNull();

      const secondActionId = await createActionInBrowser(page, "Collect reopened-cycle verification");
      await completeActionInBrowser(page, secondActionId, "Reopened-cycle checks passed");
      await page.getByRole("tab", { name: "Ticket Details" }).click();
      await selectAndConfirmStatus(page, "RESOLVED");
      const secondResolution = await staffApi.get(`${API_URL}/api/staff/tickets/${ticket.id}`);
      const latestResolvedAt = (await secondResolution.json() as TicketDetail).resolvedAt;
      expect(latestResolvedAt).toBeTruthy();
      expect(new Date(latestResolvedAt!).getTime()).toBeGreaterThan(new Date(firstResolvedAt!).getTime());
      await selectAndConfirmStatus(page, "CLOSED");

      const closed = await staffApi.get(`${API_URL}/api/staff/tickets/${ticket.id}`);
      expect(closed.status()).toBe(200);
      expect(await closed.json()).toMatchObject({ currentStatus: "CLOSED", workCycle: 2, resolvedAt: latestResolvedAt });
      const workflow = await staffApi.get(`${API_URL}/api/staff/tickets/${ticket.id}/workflow`);
      expect(workflow.status()).toBe(200);
      const workflowRows = (await workflow.json() as { data: Array<{ kind: string; fromStatus: string | null; toStatus: string; workCycle: number }> }).data;
      expect(workflowRows).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "TRANSITION", fromStatus: "RESOLVED", toStatus: "REOPENED", workCycle: 2 }),
        expect.objectContaining({ kind: "TRANSITION", fromStatus: "REOPENED", toStatus: "RESOLVED", workCycle: 2 }),
      ]));
    } finally {
      await Promise.all([requesterApi.dispose(), staffApi.dispose()]);
    }
  });

  test("cancels a Ticket and its unfinished Action together with one parent version increment", async ({ page }) => {
    test.setTimeout(90_000);
    const requesterApi = await playwrightRequest.newContext({ baseURL: API_URL });
    const staffApi = await playwrightRequest.newContext({ baseURL: API_URL });
    try {
      const requesterSession = await loginApi(requesterApi, requester);
      const ticket = await createTicketApi(requesterApi, requesterSession, `Issue 91 parent cancellation ${E2E_TAG}`);
      await loginApi(staffApi, staff);
      await loginUi(page, staff);
      await page.goto(`/staff/tickets/${ticket.id}`);
      await page.getByRole("button", { name: "Claim Ticket" }).click();
      await selectAndConfirmStatus(page, "OPEN");
      const actionId = await createActionInBrowser(page, "Unfinished work cancelled with parent");
      await page.getByRole("tab", { name: "Ticket Details" }).click();
      const before = await staffApi.get(`${API_URL}/api/staff/tickets/${ticket.id}`);
      const beforeTicket = await before.json() as TicketDetail;
      const reason = "Requester withdrew this task";
      await selectAndConfirmStatus(page, "CANCELLED", reason);

      const [afterResponse, actionsResponse, workflowResponse, historyResponse] = await Promise.all([
        staffApi.get(`${API_URL}/api/staff/tickets/${ticket.id}`),
        staffApi.get(`${API_URL}/api/staff/tickets/${ticket.id}/actions`),
        staffApi.get(`${API_URL}/api/staff/tickets/${ticket.id}/workflow`),
        staffApi.get(`${API_URL}/api/staff/tickets/${ticket.id}/actions/${actionId}/history`),
      ]);
      expect(afterResponse.status()).toBe(200);
      expect(actionsResponse.status()).toBe(200);
      expect(workflowResponse.status()).toBe(200);
      expect(historyResponse.status()).toBe(200);
      const after = await afterResponse.json() as TicketDetail;
      expect(after.currentStatus).toBe("CANCELLED");
      expect(after.version).toBe(beforeTicket.version + 1);
      const actions = await actionsResponse.json() as { data: Array<{ id: number; status: string; version: number; cancelReason: string; cancelledAt: string }> };
      expect(actions.data).toHaveLength(1);
      expect(actions.data[0]).toMatchObject({ id: actionId, status: "CANCELLED", version: 2, cancelReason: reason, cancelledBy: { id: staff.id } });
      const workflow = await workflowResponse.json() as { data: Array<{ kind: string; fromStatus: string | null; toStatus: string; reason: string; actor: { id: number } | null; occurredAt: string }> };
      const cancellationEvents = workflow.data.filter((row) => row.toStatus === "CANCELLED");
      expect(cancellationEvents).toHaveLength(1);
      expect(cancellationEvents[0]).toMatchObject({ kind: "TRANSITION", fromStatus: "OPEN", toStatus: "CANCELLED", reason, actor: { id: staff.id } });
      expect(cancellationEvents[0]!.occurredAt).toBe(actions.data[0]!.cancelledAt);
      const history = await historyResponse.json() as { data: Array<{ operation: string; reason: string; actor: { id: number } }> };
      const cancellationRevisions = history.data.filter((row) => row.operation === "TICKET_CANCEL");
      expect(cancellationRevisions).toHaveLength(1);
      expect(cancellationRevisions[0]).toMatchObject({ reason, actor: { id: staff.id } });
    } finally {
      await Promise.all([requesterApi.dispose(), staffApi.dispose()]);
    }
  });
});
