import { mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, request as playwrightRequest, test } from "@playwright/test";
import {
  API_URL,
  E2E_TAG,
  type E2EUser,
  assertIsolatedE2EDatabase,
  assertResponsiveLayout,
  cleanupE2EUsers,
  closeE2EPrisma,
  createE2EUser,
  createTicketApi,
  loginApi,
  loginUi,
} from "../support/fixtures.js";

const SCREENSHOT_ROOT = path.resolve(path.join(
  process.env.PW_SCREENSHOT_ROOT ?? path.join("test-results", "lab-04", "screenshots"),
  "actions-taken",
));

async function capture(page: import("@playwright/test").Page, name: string, options: { fullPage?: boolean } = {}) {
  await mkdir(SCREENSHOT_ROOT, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_ROOT, `${name}.png`), fullPage: options.fullPage ?? false });
}

test.describe.serial("E2E-88 — Actions Taken Staff and Requester journey", () => {
  let requester: E2EUser;
  let staff: E2EUser;
  let otherStaff: E2EUser;
  const createdUserIds: number[] = [];

  test.beforeAll(async () => {
    assertIsolatedE2EDatabase();
    requester = await createE2EUser("REQUESTER", "issue88-requester");
    staff = await createE2EUser("STAFF", "issue88-staff");
    otherStaff = await createE2EUser("STAFF", "issue88-assignee");
    createdUserIds.push(requester.id, staff.id, otherStaff.id);
  });

  test.afterAll(async () => {
    await cleanupE2EUsers(createdUserIds);
    await closeE2EPrisma();
  });

  test("creates, edits, completes, corrects and cancels Actions; resolves/reopens; keeps Requester reads safe", async ({ page }) => {
    test.setTimeout(120_000);
    const requesterApi = await playwrightRequest.newContext({ baseURL: API_URL });
    const otherStaffApi = await playwrightRequest.newContext({ baseURL: API_URL });
    try {
      const requesterSession = await loginApi(requesterApi, requester);
      const otherStaffSession = await loginApi(otherStaffApi, otherStaff);
      const ticket = await createTicketApi(requesterApi, requesterSession, `Issue 88 Actions Taken ${E2E_TAG}`);
      await loginUi(page, staff);
      await page.goto(`/staff/tickets/${ticket.id}`);
      await expect(page.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();

      const claimResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === `/api/staff/tickets/${ticket.id}/claim`
          && response.request().method() === "PATCH";
      });
      const refreshedDetail = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === `/api/staff/tickets/${ticket.id}`
          && response.request().method() === "GET";
      });
      await page.getByRole("button", { name: "Claim Ticket" }).click();
      const [claimResult, detailResult] = await Promise.all([claimResponse, refreshedDetail]);
      expect(claimResult.status()).toBe(200);
      expect(detailResult.status()).toBe(200);
      await expect(page.getByTestId("claim-feedback")).toContainText("Ticket claimed successfully");
      await expect(page.locator('[aria-labelledby="ownership-heading"] strong')).toContainText(staff.fullName);
      await expect(page.locator('#staff-status option[value="OPEN"]')).toHaveCount(1);
      await expect(page.getByText("Complete at least one Action in this work cycle.")).toBeVisible();
      await page.getByLabel("Next status").selectOption("OPEN");
      await page.getByRole("button", { name: "Update status" }).click();
      await expect(page.getByTestId("status-feedback")).toContainText("updated");
      await capture(page, "resolution-gate-no-completed-action");

      const detailsTab = page.getByRole("tab", { name: "Ticket Details" });
      const actionsTab = page.getByRole("tab", { name: "Actions Taken" });
      await detailsTab.focus();
      await page.keyboard.press("End");
      await expect(actionsTab).toBeFocused();
      await expect(actionsTab).toHaveAttribute("aria-selected", "true");
      await expect(page).toHaveURL(/tab=actions/);
      const panel = page.getByTestId("actions-taken-panel");
      await panel.scrollIntoViewIfNeeded();
      await expect(page.getByRole("heading", { name: "Actions Taken" })).toBeVisible();
      await capture(page, "actions-view-desktop-before-work");

      await page.getByRole("button", { name: "New Action" }).click();
      const descriptionField = page.getByLabel(/Action Description/);
      const actionDate = page.getByLabel(/Action Date\/Time \(Bangkok\)/);
      await expect(actionDate).toHaveValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      await page.getByLabel("Assignee").selectOption(String(otherStaff.id));
      await descriptionField.fill("Inspect VPN account and confirm access");
      await capture(page, "action-create-form");
      let firstCreateBody: Record<string, unknown> | null = null;
      const firstCreateRequest = page.waitForRequest((request) => request.url().endsWith(`/api/staff/tickets/${ticket.id}/actions`) && request.method() === "POST");
      const firstCreateResponse = page.waitForResponse((response) => response.url().endsWith(`/api/staff/tickets/${ticket.id}/actions`) && response.request().method() === "POST" && response.status() === 201);
      await page.getByRole("button", { name: "Save Planned Action" }).click();
      const createRequest = await firstCreateRequest;
      firstCreateBody = createRequest.postDataJSON() as Record<string, unknown>;
      expect(firstCreateBody).not.toHaveProperty("actionAt");
      const created = await (await firstCreateResponse).json() as { action: { id: number } };
      const completedActionId = created.action.id;
      await expect(page.getByText("Inspect VPN account and confirm access").first()).toBeVisible();

      await page.getByRole("button", { name: "Edit Action" }).click();
      await page.getByLabel(/Action Description/).fill("Inspect the VPN account configuration");
      let releaseEditResponse!: () => void;
      let announceEditResponse!: () => void;
      const editResponseReady = new Promise<void>((resolve) => { announceEditResponse = resolve; });
      const heldEditResponse = new Promise<void>((resolve) => { releaseEditResponse = resolve; });
      const editUrl = `**/api/staff/tickets/${ticket.id}/actions/${completedActionId}`;
      await page.route(editUrl, async (route) => {
        if (route.request().method() !== "PATCH") return route.continue();
        const response = await route.fetch();
        announceEditResponse();
        await heldEditResponse;
        await route.fulfill({ response });
      });
      await page.getByRole("button", { name: "Save revision" }).click();
      await editResponseReady;
      const editUiResponse = page.waitForResponse((response) => response.url().endsWith(`/api/staff/tickets/${ticket.id}/actions/${completedActionId}`) && response.request().method() === "PATCH");
      const disabledActionControl = page.getByRole("button", { name: "Edit Action" });
      await expect(disabledActionControl).toBeDisabled();
      const disabledOutline = await disabledActionControl.evaluate((element) => {
        const style = window.getComputedStyle(element);
        return { color: style.color, borderColor: style.borderColor };
      });
      expect(disabledOutline).toEqual({ color: "rgb(0, 107, 60)", borderColor: "rgb(0, 107, 60)" });
      console.log(`E2E-88 disabled outline color ${disabledOutline.color}; border ${disabledOutline.borderColor}: matches Zen green.`);
      await capture(page, "action-edit-pending-disabled-outline");
      releaseEditResponse();
      const editedActionResponse = await editUiResponse;
      expect(editedActionResponse.status()).toBe(200);
      await expect(page.getByText(/Latest Ticket, Actions, and workflow loaded/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Edit Action" })).toBeEnabled();
      await page.unroute(editUrl);
      await expect(page.getByText("Inspect the VPN account configuration").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Hide history" })).toBeVisible();
      await expect(page.getByText("Description:")).toBeVisible();
      await expect(page.getByText(/Inspect VPN account and confirm access.*Inspect the VPN account configuration/)).toBeVisible();
      await capture(page, "action-history-readable-correction");
      await page.getByRole("button", { name: "Hide history" }).click();

      await page.getByRole("button", { name: "Complete" }).click();
      await page.getByLabel(/Result/).fill("VPN access was verified with the requester");
      await capture(page, "action-complete-form");
      await page.getByRole("button", { name: "Confirm Complete" }).click();
      await expect(page.getByRole("heading", { name: `Action ${completedActionId} · Completed` })).toBeVisible();
      await expect(page.getByText("VPN access was verified with the requester").first()).toBeVisible();
      const completedActionRow = page.getByTestId(`action-row-${completedActionId}`);
      await expect(completedActionRow).toContainText(otherStaff.fullName);
      await expect(completedActionRow).toContainText(staff.fullName);

      await page.getByRole("button", { name: "Edit Action" }).click();
      await page.getByLabel(/Action Description/).fill("Corrected VPN access verification wording");
      await page.getByLabel(/Correction Reason/).fill("Review the stale-version conflict");
      await capture(page, "action-terminal-correction-form");
      const currentDetailResponse = await otherStaffApi.get(`${API_URL}/api/staff/tickets/${ticket.id}`);
      expect(currentDetailResponse.status()).toBe(200);
      const currentDetail = await currentDetailResponse.json() as { version: number; itPriority: string };
      const nextPriority = currentDetail.itPriority === "HIGH" ? "LOW" : "HIGH";
      const changedParent = await otherStaffApi.patch(`${API_URL}/api/staff/tickets/${ticket.id}/it-priority`, {
        headers: { "X-CSRF-Token": otherStaffSession.csrfToken },
        data: { itPriority: nextPriority, expectedTicketVersion: currentDetail.version },
      });
      expect(changedParent.status()).toBe(200);
      let correctionPatchCount = 0;
      const correctionRequestListener = (request: import("@playwright/test").Request) => {
        if (request.url().endsWith(`/api/staff/tickets/${ticket.id}/actions/${completedActionId}`) && request.method() === "PATCH") correctionPatchCount += 1;
      };
      page.on("request", correctionRequestListener);
      const staleCorrectionResponse = page.waitForResponse((response) => response.url().endsWith(`/api/staff/tickets/${ticket.id}/actions/${completedActionId}`) && response.request().method() === "PATCH" && response.status() === 409);
      await page.getByRole("button", { name: "Save revision" }).click();
      await staleCorrectionResponse;
      await expect(page.getByText(/changed before this correction was saved/i)).toBeVisible();
      await expect(page.getByLabel(/Action Description/)).toHaveValue("Corrected VPN access verification wording");
      await expect(page.getByLabel(/Correction Reason/)).toHaveValue("Review the stale-version conflict");
      await expect(page.getByRole("button", { name: "Save revision" })).toBeDisabled();
      expect(correctionPatchCount).toBe(1);
      await capture(page, "action-edit-conflict-review", { fullPage: true });
      await page.getByRole("button", { name: "Load latest for comparison" }).click();
      await expect(page.getByRole("button", { name: "I reviewed these versions; allow explicit retry" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Save revision" })).toBeDisabled();
      expect(correctionPatchCount).toBe(1);
      await page.getByRole("button", { name: "I reviewed these versions; allow explicit retry" }).click();
      await expect(page.getByLabel(/Action Description/)).toHaveValue("Corrected VPN access verification wording");
      await expect(page.getByLabel(/Correction Reason/)).toHaveValue("Review the stale-version conflict");
      await expect(page.getByRole("button", { name: "Save revision" })).toBeEnabled();
      expect(correctionPatchCount).toBe(1);
      const reviewedCorrectionResponse = page.waitForResponse((response) => response.url().endsWith(`/api/staff/tickets/${ticket.id}/actions/${completedActionId}`) && response.request().method() === "PATCH" && response.status() === 200);
      await page.getByRole("button", { name: "Save revision" }).click();
      await reviewedCorrectionResponse;
      page.off("request", correctionRequestListener);
      await expect(page.getByText(/revision was recorded/i)).toBeVisible();
      await expect(page.getByText("Corrected VPN access verification wording").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Edit Action" })).toBeEnabled();

      let failFirstRetryCreate = true;
      const actionCreateUrl = `**/api/staff/tickets/${ticket.id}/actions`;
      await page.route(actionCreateUrl, async (route) => {
        if (route.request().method() === "POST" && failFirstRetryCreate) {
          failFirstRetryCreate = false;
          await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "INJECTED_FAILURE", message: "Synthetic ambiguous create failure" } }) });
          return;
        }
        await route.continue();
      });
      const retryRequests: Array<{ body: Record<string, unknown>; key: string | undefined }> = [];
      const retryRequestListener = (request: import("@playwright/test").Request) => {
        if (request.url().endsWith(`/api/staff/tickets/${ticket.id}/actions`) && request.method() === "POST" && request.postData()) {
          const body = request.postDataJSON() as Record<string, unknown>;
          if (body.description === "Create and retry a second Action") retryRequests.push({ body, key: request.headers()["idempotency-key"] });
        }
      };
      page.on("request", retryRequestListener);
      await page.getByRole("button", { name: "New Action" }).click();
      await expect(page.getByLabel("Assignee")).toHaveValue(String(staff.id));
      await page.getByLabel(/Action Description/).fill("Create and retry a second Action");
      await page.getByRole("button", { name: "Save Planned Action" }).click();
      await expect(page.getByText(/result is unknown/i)).toBeVisible();
      await capture(page, "action-create-ambiguous-failure");
      await page.getByRole("button", { name: "Retry exact create" }).click();
      const secondCreated = await (await page.waitForResponse((response) => response.url().endsWith(`/api/staff/tickets/${ticket.id}/actions`) && response.request().method() === "POST" && response.status() === 201)).json() as { action: { id: number } };
      page.off("request", retryRequestListener);
      await page.unroute(actionCreateUrl);
      expect(retryRequests).toHaveLength(2);
      expect(retryRequests[1]).toEqual(retryRequests[0]);

      await page.getByRole("button", { name: "Cancel Action" }).click();
      await page.getByLabel(/Cancellation Reason/).fill("Duplicate work item");
      await capture(page, "action-cancellation-form");
      await page.getByRole("button", { name: "Confirm Cancel Action" }).click();
      await expect(page.getByRole("heading", { name: `Action ${secondCreated.action.id} · Cancelled` })).toBeVisible();
      await expect(page.getByText("Duplicate work item").first()).toBeVisible();

      await page.getByRole("tab", { name: "Ticket Details" }).click();
      await page.getByLabel("Next status").selectOption("IN_PROGRESS");
      await page.getByRole("button", { name: "Update status" }).click();
      await expect(page.getByTestId("status-feedback")).toContainText("updated");
      await page.getByLabel("Next status").selectOption("RESOLVED");
      await page.getByRole("button", { name: "Update status" }).click();
      await expect(page.getByRole("dialog", { name: "Confirm Resolved status" })).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "Confirm Resolved" }).click();
      await expect(page.getByTestId("status-feedback")).toContainText("Resolved");
      await page.getByLabel("Next status").selectOption("REOPENED");
      await page.getByRole("button", { name: "Update status" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Confirm Reopened" }).click();
      await expect(page.getByTestId("ticket-work-cycle")).toContainText("Work cycle 2");
      await expect(page.getByTestId("ticket-work-cycle")).toContainText("Not resolved in this cycle");

      await page.getByRole("tab", { name: "Actions Taken" }).click();
      await expect(page.getByText(/Cycle 1 · Historical/).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Edit Action" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "New Action" })).toBeEnabled();
      await page.getByTestId("actions-taken-panel").scrollIntoViewIfNeeded();
      for (const viewport of [{ width: 1440, height: 900 }, { width: 820, height: 1024 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await assertResponsiveLayout(page, `Issue 88 Actions Taken ${viewport.width}x${viewport.height}`);
        console.log(`E2E-88 responsive geometry ${viewport.width}x${viewport.height}: no horizontal overflow, clipped content, unreadable controls, or overlapping controls.`);
        await page.evaluate(() => window.scrollTo(0, 0));
        await capture(page, `actions-view-${viewport.width}x${viewport.height}`, { fullPage: true });
        if (viewport.width === 390) {
          await page.getByRole("button", { name: "Open navigation menu" }).click();
          await expect(page.getByTestId("current-user")).toContainText(staff.fullName);
          await capture(page, "actions-view-390x844-identity", { fullPage: true });
          await page.getByRole("button", { name: "Close navigation menu" }).click();
        }
      }

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole("button", { name: "Logout" }).click();
      await loginUi(page, requester);
      await page.goto(`/tickets/${ticket.id}?tab=actions&actionId=${completedActionId}`);
      await expect(page.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();
      await expect(page.getByRole("heading", { name: `Action ${completedActionId} · Completed` })).toBeVisible();
      await expect(page.getByText("Corrected VPN access verification wording").first()).toBeVisible();
      await expect(page.getByText("Create and retry a second Action").first()).toBeVisible();
      const cancelledActionRow = page.getByTestId(`action-row-${secondCreated.action.id}`);
      await cancelledActionRow.getByRole("button", { name: "View details" }).click();
      await expect(page.getByText("Duplicate work item").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "New Action" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "View change history" })).toHaveCount(0);
      await expect(page.getByText("Internal Notes")).toHaveCount(0);
      await capture(page, "requester-read-only-action-deep-link", { fullPage: true });
    } finally {
      await Promise.all([requesterApi.dispose(), otherStaffApi.dispose()]);
    }
  });
});
