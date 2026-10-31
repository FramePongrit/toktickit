import { expect, request as playwrightRequest, test } from "@playwright/test";
import {
  API_URL,
  E2E_TAG,
  assertDialogsAccessible,
  assertIsolatedE2EDatabase,
  assertResponsiveLayout,
  cleanupE2EUsers,
  closeE2EPrisma,
  createE2EUser,
  createTicketApi,
  loginApi,
  loginUi,
  type E2EUser,
} from "../support/fixtures.js";

test.describe.serial("STYLE-02 — browser keyboard and accessible form behavior", () => {
  let requester: E2EUser;
  let staff: E2EUser;
  const createdUserIds: number[] = [];

  test.beforeAll(async () => {
    assertIsolatedE2EDatabase();
    requester = await createE2EUser("REQUESTER", "issue91-a11y-requester");
    createdUserIds.push(requester.id);
    staff = await createE2EUser("STAFF", "issue91-a11y-staff");
    createdUserIds.push(staff.id);
  });

  test.afterAll(async () => {
    try {
      await cleanupE2EUsers(createdUserIds);
    } finally {
      await closeE2EPrisma();
    }
  });

  test("supports keyboard tab navigation, focused validation, labelled fields and mobile text enlargement", async ({ page }) => {
    test.setTimeout(90_000);
    const api = await playwrightRequest.newContext({ baseURL: API_URL });
    try {
      const session = await loginApi(api, requester);
      const ticket = await createTicketApi(api, session, `Issue 91 accessibility ${E2E_TAG}`);
      await loginUi(page, staff);
      await page.goto(`/staff/tickets/${ticket.id}`);
      const claimResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === `/api/staff/tickets/${ticket.id}/claim`
          && response.request().method() === "PATCH"
          && response.status() === 200;
      });
      const refreshedDetail = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === `/api/staff/tickets/${ticket.id}`
          && response.request().method() === "GET"
          && response.status() === 200;
      });
      await page.getByRole("button", { name: "Claim Ticket" }).click();
      await Promise.all([claimResponse, refreshedDetail]);
      await expect(page.getByTestId("claim-feedback")).toContainText("Ticket claimed successfully");
      await expect(page.getByLabel("Next status")).toBeVisible();
      await expect(page.locator('#staff-status option[value="OPEN"]')).toHaveCount(1);
      await expect(page.locator('[aria-labelledby="ownership-heading"] strong')).toContainText(staff.fullName);

      const detailsTab = page.getByRole("tab", { name: "Ticket Details" });
      const actionsTab = page.getByRole("tab", { name: "Actions Taken" });
      await detailsTab.focus();
      await expect(detailsTab).toBeFocused();
      await page.keyboard.press("End");
      await expect(actionsTab).toBeFocused();
      await expect(actionsTab).toHaveAttribute("aria-selected", "true");
      const panel = page.getByRole("tabpanel", { name: "Actions Taken" });
      await expect(panel).toBeVisible();
      await expect(panel).not.toHaveAttribute("hidden", "");

      await page.getByRole("button", { name: "New Action" }).click();
      const description = page.getByLabel(/Action Description/);
      await expect(description).toBeFocused();
      await page.getByRole("button", { name: "Save Planned Action" }).click();
      await expect(description).toHaveAttribute("aria-invalid", "true");
      await expect(description).toBeFocused();
      const describedBy = await description.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      const descriptionError = page.locator(`#${describedBy!.split(/\s+/).find((id) => id.includes("error"))}`);
      await expect(descriptionError).toBeVisible();

      await description.fill("Complete the keyboard accessibility review");
      await expect(description).toHaveAttribute("aria-invalid", "false");
      const createForm = page.locator('section[aria-labelledby="new-action-heading"] form');
      await expect(createForm).toHaveAttribute("aria-busy", "false");
      await expect(createForm.getByLabel("Follow-Up Required?")).toBeVisible();
      await expect(createForm.getByLabel("Assignee")).toHaveValue(String(staff.id));
      await expect(createForm.getByLabel(/Action Date\/Time \(Bangkok\)/)).toBeVisible();
      const labelledInputs = await createForm.locator("input:not([type=hidden]), select, textarea").evaluateAll((elements) => elements.map((element) => {
        const input = element as HTMLElement;
        const id = input.id;
        return { id, labelled: Boolean(id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) };
      }));
      expect(labelledInputs.length).toBeGreaterThan(0);
      expect(labelledInputs.every((input) => input.labelled)).toBe(true);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.addStyleTag({ content: "html { font-size: 125%; }" });
      await assertResponsiveLayout(page, "Issue91 Actions form at 125% text, mobile viewport");
      await page.getByRole("button", { name: "Save Planned Action" }).click();
      await expect(page.getByText("Complete the keyboard accessibility review", { exact: true })).toBeVisible();

      await page.getByRole("tab", { name: "Ticket Details" }).click();
      await page.getByLabel("Next status").selectOption("OPEN");
      await page.getByRole("button", { name: "Update status" }).click();
      await expect(page.getByTestId("status-feedback")).toContainText("updated");
      await page.getByLabel("Next status").selectOption("CANCELLED");
      await page.getByLabel("Cancellation reason").fill("Accessibility dialog check");
      await page.getByRole("button", { name: "Update status" }).click();
      const dialog = page.getByRole("dialog", { name: "Confirm Cancelled status" });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      await assertDialogsAccessible(page);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Update status" })).toBeFocused();
    } finally {
      await api.dispose();
    }
  });
});
