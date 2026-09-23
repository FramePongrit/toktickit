import { test, expect } from "@playwright/test";
import {
  E2E_TAG,
  type E2EUser,
  cleanupE2EUsers,
  closeE2EPrisma,
  createE2EUser,
  loginUi,
} from "../support/fixtures.js";

/**
 * Authenticated Lab 2 user-facing regression journey.
 *
 * The original Lab 2 E2E selected a requester in the browser. Lab 3 replaced
 * that development-only selector with real authentication, so this keeps the
 * business journey (create, list, search, filter, clear) while exercising the
 * Lab 3 identity boundary and an isolated task-owned requester.
 */
test.describe.serial("Legacy requester journey under Lab 3 authentication", () => {
  let requester: E2EUser;
  const createdUserIds: number[] = [];

  test.beforeAll(async () => {
    requester = await createE2EUser("REQUESTER", "legacy-regression-requester");
    createdUserIds.push(requester.id);
  });

  test.afterAll(async () => {
    await cleanupE2EUsers(createdUserIds);
    await closeE2EPrisma();
  });

  test("creates a ticket and finds it through the legacy list/search/filter journey", async ({ page }) => {
    await loginUi(page, requester);
    const summary = `Legacy regression ${E2E_TAG}`;

    await page.getByLabel("Main").getByRole("link", { name: "Create Ticket" }).click();
    await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();
    await page.getByLabel("Category").selectOption({ label: "Hardware" });
    await page.getByLabel("Related System").selectOption({ label: "Corporate Laptop" });
    await page.getByLabel("Requested Priority").selectOption({ label: "Medium" });
    await page.getByLabel("Ticket Summary").fill(summary);
    await page.getByLabel("Description").fill("Authenticated legacy journey regression fixture.");
    await page.getByRole("button", { name: "Submit Ticket" }).click();

    const confirmation = page.getByText(/created successfully/);
    await expect(confirmation).toBeVisible();
    const confirmationText = (await confirmation.textContent()) ?? "";
    const ticketNumber = confirmationText.match(/TKT-\d{4}-\d{6}/)?.[0];
    expect(ticketNumber, "the backend-generated ticket number must be shown").toBeDefined();

    await page.getByLabel("Main").getByRole("link", { name: "My Tickets" }).click();
    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
    await page.getByLabel("Search").fill(summary);
    await expect(page.getByRole("link", { name: ticketNumber! })).toBeVisible();

    await page.getByLabel("Search").fill(ticketNumber!);
    await expect(page.getByRole("link", { name: ticketNumber! })).toBeVisible();
    await page.getByLabel("Requested Priority").selectOption("URGENT");
    await expect(page.getByText(/No tickets match your filters/)).toBeVisible();
    await page.getByRole("button", { name: "Clear Filters" }).first().click();
    await expect(page.getByRole("link", { name: ticketNumber! })).toBeVisible();
  });
});
