import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
import {
  assertIsolatedE2EDatabase,
  cleanupE2EUsers,
  closeE2EPrisma,
  createE2EUser,
  loginUi,
  type E2EUser,
} from "../support/fixtures.js";

/**
 * Captures the Lab 2 journey with authenticated Requesters into the configured
 * task-owned screenshot root. Run with `npm run screenshots`.
 *
 * Kept in its own Playwright project so an ordinary `npm run e2e` does not
 * rewrite the committed images.
 */

const ROOT = path.resolve(path.join(
  process.env.PW_SCREENSHOT_ROOT ?? path.join("test-results", "lab-04", "screenshots"),
  "lab-02",
));

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 820, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];
let requester: E2EUser;
let otherRequester: E2EUser;
let emptyRequester: E2EUser;
const createdUserIds: number[] = [];

test.beforeAll(async () => {
  assertIsolatedE2EDatabase();
  requester = await createE2EUser("REQUESTER", "lab2-capture-requester");
  createdUserIds.push(requester.id);
  otherRequester = await createE2EUser("REQUESTER", "lab2-capture-other-requester");
  createdUserIds.push(otherRequester.id);
  emptyRequester = await createE2EUser("REQUESTER", "lab2-capture-empty-requester");
  createdUserIds.push(emptyRequester.id);
});

test.afterAll(async () => {
  try {
    await cleanupE2EUsers(createdUserIds);
  } finally {
    await closeE2EPrisma();
  }
});

async function shot(page: Page, folder: string, name: string) {
  await fs.mkdir(path.join(ROOT, folder), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, folder, `${name}.png`), fullPage: true });
}

async function signInRequester(page: Page, user: E2EUser) {
  await loginUi(page, user);
  await expect(page.getByTestId("current-user")).toHaveText(user.fullName);
}

async function fillCreateForm(page: Page, summary: string) {
  await page.getByLabel("Category").selectOption({ label: "Hardware" });
  await page.getByLabel("Related System").selectOption({ label: "Corporate Laptop" });
  await page.getByLabel("Requested Priority").selectOption({ label: "Medium" });
  await page.getByLabel("Ticket Summary").fill(summary);
  await page
    .getByLabel("Description")
    .fill("The battery drains much faster than usual even when the system is idle.");
}

test("capture: requester login and authenticated landing", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await shot(page, "create-ticket", "00-requester-login");
  await signInRequester(page, requester);
  await expect(page).toHaveURL(/\/dashboard$/);
  await shot(page, "create-ticket", "01-requester-dashboard");
});

test("capture: create ticket states", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await signInRequester(page, requester);

  await page.goto("/tickets/new");
  await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();
  // Requester identity comes from the authenticated session, and the reference
  // data comes from the database.
  await shot(page, "create-ticket", "02-initial-desktop");

  // Validation failure: field-level messages, no request sent.
  await page.getByRole("button", { name: "Submit Ticket" }).click();
  await expect(page.getByText("Summary is required.")).toBeVisible();
  await shot(page, "create-ticket", "03-validation-failure");

  // Invalid attachment is rejected before upload. Captured on the detail
  // screen later; here the form is simply filled in.
  await fillCreateForm(page, `Screenshot capture ${Date.now()}`);
  await shot(page, "create-ticket", "04-filled");

  await page.getByRole("button", { name: "Submit Ticket" }).click();
  await expect(page.getByText(/created successfully/)).toBeVisible();
  // Proof that the official number and the saved values came from the backend.
  await shot(page, "create-ticket", "05-success-with-ticket-number");
});

test("capture: create ticket API failure", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await signInRequester(page, requester);

  await page.goto("/tickets/new");
  await fillCreateForm(page, "This submission will fail");

  // Simulates the backend being unavailable, so the safe error state can be
  // captured without stopping the server mid-run.
  await page.route("**/api/tickets", (route) =>
    route.request().method() === "POST" ? route.abort("failed") : route.continue()
  );

  await page.getByRole("button", { name: "Submit Ticket" }).click();
  await expect(page.getByText(/could not be submitted/)).toBeVisible();
  // Every entered value is still present.
  await shot(page, "create-ticket", "06-api-failure-values-preserved");
});

test("capture: my tickets states", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await signInRequester(page, requester);

  await page.goto("/tickets");
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  await shot(page, "my-tickets", "00-loaded-desktop");

  await page.getByLabel("Search").fill("battery");
  await page.waitForTimeout(500);
  await shot(page, "my-tickets", "01-search");

  await page.getByLabel("Search").fill("");
  await page.getByLabel("Requested Priority").selectOption("MEDIUM");
  await page.waitForTimeout(500);
  await shot(page, "my-tickets", "02-filtered");

  // No-results: distinct from the empty state, with a Clear Filters action.
  await page.getByLabel("Search").fill("no-such-ticket-anywhere");
  await expect(page.getByText(/No tickets match your filters/)).toBeVisible();
  await shot(page, "my-tickets", "03-no-results");

  await page.getByRole("button", { name: "Clear Filters" }).first().click();
  await page.waitForTimeout(500);

  // Failure state.
  await page.route("**/api/tickets?*", (route) => route.abort("failed"));
  await page.reload();
  await expect(page.getByText(/Could not load your tickets/)).toBeVisible();
  await shot(page, "my-tickets", "04-failure");
});

test("capture: my tickets empty state for a requester with no tickets", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  // A requester who has created nothing shows the empty state, which reads
  // differently from the no-results state above.
  await signInRequester(page, emptyRequester);

  await page.goto("/tickets");
  const empty = page.getByText(/have not created any tickets yet/);
  if (await empty.isVisible().catch(() => false)) {
    await shot(page, "my-tickets", "05-empty");
  }
});

test("capture: ticket detail and attachment states", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await signInRequester(page, requester);

  await page.goto("/tickets/new");
  await fillCreateForm(page, `Attachment capture ${Date.now()}`);
  await page.getByRole("button", { name: "Submit Ticket" }).click();
  await page.getByRole("link", { name: "View ticket" }).click();

  await expect(page.getByText("No attachments on this ticket.")).toBeVisible();
  await shot(page, "ticket-detail", "00-loaded-no-attachments");

  // Invalid attachment: rejected client-side before any request.
  await page.setInputFiles("#attachment-input", {
    name: "payload.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("MZ"),
  });
  await expect(page.getByText(/Only JPG, JPEG, PNG, WEBP and PDF/)).toBeVisible();
  await shot(page, "ticket-detail", "01-invalid-attachment");

  await page.setInputFiles("#attachment-input", {
    name: "evidence.png",
    mimeType: "image/png",
    buffer: Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"),
  });
  await expect(page.getByText("1 active of 5")).toBeVisible();
  await shot(page, "ticket-detail", "02-attachment-active");

  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot(page, "ticket-detail", "03-remove-dialog");

  await page.getByLabel("Removal reason").fill("Uploaded the wrong screenshot");
  await page.getByRole("button", { name: "Confirm removal" }).click();
  await expect(page.getByText("Removed", { exact: true })).toBeVisible();
  // Metadata and reason retained; no download offered.
  await shot(page, "ticket-detail", "04-attachment-removed");

  // Unauthorised access to the same ticket from another requester.
  const ticketUrl = page.url();
  await page.getByRole("button", { name: "Logout" }).click();
  await signInRequester(page, otherRequester);
  await page.goto(ticketUrl);
  await expect(page.getByText("Ticket not found")).toBeVisible();
  await shot(page, "ticket-detail", "05-cross-requester-rejected");
});

test("capture: responsive evidence at three viewports", async ({ page }) => {
  await signInRequester(page, requester);

  await page.goto("/tickets/new");
  await fillCreateForm(page, `Responsive capture ${Date.now()}`);
  await page.getByRole("button", { name: "Submit Ticket" }).click();
  await page.getByRole("link", { name: "View ticket" }).click();
  const ticketUrl = page.url();

  const screens: [string, string][] = [
    ["/tickets", "my-tickets"],
    ["/tickets/new", "create-ticket"],
    [ticketUrl, "ticket-detail"],
  ];

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const [path, folder] of screens) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await shot(page, folder, `10-responsive-${viewport.name}`);
    }
  }
});
