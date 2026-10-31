import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, request as playwrightRequest, test } from "@playwright/test";
import {
  API_URL,
  E2E_TAG,
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

const SCREENSHOT_ROOT = path.resolve(path.join(
  process.env.PW_SCREENSHOT_ROOT ?? path.join("test-results", "lab-04", "screenshots"),
  "actions-taken",
));

async function capture(page: import("@playwright/test").Page, name: string) {
  await mkdir(SCREENSHOT_ROOT, { recursive: true });
  const output = path.join(SCREENSHOT_ROOT, name);
  await page.screenshot({ path: output, fullPage: true });
  console.log(`VIS-01 screenshot ${output}`);
}

test.describe.serial("VIS-01 — Actions Taken responsive captures", () => {
  let requester: E2EUser;
  let staff: E2EUser;
  const createdUserIds: number[] = [];

  test.beforeAll(async () => {
    assertIsolatedE2EDatabase();
    requester = await createE2EUser("REQUESTER", "issue91-visual-requester");
    createdUserIds.push(requester.id);
    staff = await createE2EUser("STAFF", "issue91-visual-staff");
    createdUserIds.push(staff.id);
  });

  test.afterAll(async () => {
    try {
      await cleanupE2EUsers(createdUserIds);
    } finally {
      await closeE2EPrisma();
    }
  });

  test("captures gate, create and completed Action views at required viewports", async ({ page }) => {
    test.setTimeout(120_000);
    const api = await playwrightRequest.newContext({ baseURL: API_URL });
    try {
      const requesterSession = await loginApi(api, requester);
      const ticket = await createTicketApi(api, requesterSession, `Issue 91 visual capture ${E2E_TAG}`);
      await loginUi(page, staff);
      await page.goto(`/staff/tickets/${ticket.id}`);
      await expect(page.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();
      await page.getByRole("button", { name: "Claim Ticket" }).click();
      await page.getByRole("tab", { name: "Actions Taken" }).click();
      await expect(page.getByRole("heading", { name: "Actions Taken" })).toBeVisible();
      await page.setViewportSize({ width: 1440, height: 900 });
      await assertResponsiveLayout(page, "Actions Taken resolution gate at 1440x900");
      await capture(page, "resolution-gate-1440x900.png");

      await page.getByRole("button", { name: "New Action" }).click();
      await page.getByLabel(/Action Description/).fill("Capture a readable completed work record");
      await capture(page, "action-create-form-1440x900.png");
      const createdPromise = page.waitForResponse((response) => response.url().endsWith(`/api/staff/tickets/${ticket.id}/actions`) && response.request().method() === "POST" && response.status() === 201);
      await page.getByRole("button", { name: "Save Planned Action" }).click();
      const created = await (await createdPromise).json() as { action: { id: number } };
      await expect(page.getByRole("heading", { name: `Action ${created.action.id} · Planned` })).toBeVisible();
      await page.getByRole("button", { name: "Complete" }).click();
      await page.getByLabel("Result").fill("The captured action passed validation.");
      await page.getByRole("button", { name: "Confirm Complete" }).click();
      await expect(page.getByRole("heading", { name: `Action ${created.action.id} · Completed` })).toBeVisible();

      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 820, height: 1024 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        await expect(page.getByRole("heading", { name: "Actions Taken" })).toBeVisible();
        await assertResponsiveLayout(page, `Completed Actions Taken at ${viewport.width}x${viewport.height}`);
        await page.evaluate(() => window.scrollTo(0, 0));
        await capture(page, `actions-taken-${viewport.width}x${viewport.height}.png`);
        console.log(`VIS-01 geometry ${viewport.width}x${viewport.height}: horizontal overflow ${await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)}px`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      const navigationToggle = page.getByRole("button", { name: "Open navigation menu" });
      if (await navigationToggle.isVisible()) await navigationToggle.click();
      await expect(page.getByTestId("current-user")).toContainText(staff.fullName);
      await capture(page, "actions-taken-390x844-identity.png");
    } finally {
      await api.dispose();
    }
  });
});
