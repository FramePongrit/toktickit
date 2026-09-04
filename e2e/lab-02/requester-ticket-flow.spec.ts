import { test, expect, type Page } from "@playwright/test";

/**
 * The full Requester journey against a real client, a real API and a real
 * database. Component tests stub the API, so this is the only place the whole
 * stack is exercised together.
 */

const SUMMARY_PREFIX = "E2E laptop battery";

/**
 * "Create Ticket" and "My Tickets" appear in the header, as page actions, and
 * inside empty states, so navigation locators are scoped to the main nav.
 */
function nav(page: Page, name: string) {
  return page.getByLabel("Main").getByRole("link", { name });
}

/** Picks a requester by name on the selection screen and continues. */
async function selectRequester(page: Page, fullName: string) {
  await page.goto("/select-requester");
  await expect(page.getByRole("heading", { name: "Select Development Requester" })).toBeVisible();

  // Option labels carry the department too ("Jennifer Anderson — Library"), and
  // selectOption's label matcher takes an exact string, so the option is found
  // by its text and selected by its value.
  const select = page.getByLabel("Development Requester");
  const value = await select
    .locator("option", { hasText: fullName })
    .first()
    .getAttribute("value");
  await select.selectOption(value!);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByTestId("current-requester")).toHaveText(fullName);
}

async function createTicket(page: Page, summary: string): Promise<string> {
  await nav(page, "Create Ticket").click();
  await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();

  await page.getByLabel("Category").selectOption({ label: "Hardware" });
  await page.getByLabel("Related System").selectOption({ label: "Corporate Laptop" });
  await page.getByLabel("Requested Priority").selectOption({ label: "Medium" });
  await page.getByLabel("Ticket Summary").fill(summary);
  await page
    .getByLabel("Description")
    .fill("The battery drains much faster than usual even when the system is idle.");

  await page.getByRole("button", { name: "Submit Ticket" }).click();

  const confirmation = page.getByText(/created successfully/);
  await expect(confirmation).toBeVisible();

  // The number must come from the backend, not from anything the form knew.
  const text = (await confirmation.textContent()) ?? "";
  const match = text.match(/TKT-\d{4}-\d{6}/);
  expect(match, "the confirmation should show an official ticket number").not.toBeNull();
  return match![0];
}

test("E2E-01: select a requester, create a ticket, and keep the selection across a reload", async ({
  page,
}) => {
  await selectRequester(page, "Jennifer Anderson");

  const summary = `${SUMMARY_PREFIX} ${Date.now()}`;
  const ticketNumber = await createTicket(page, summary);
  expect(ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);

  // The selection is persisted, so a reload does not return to the selector.
  await page.reload();
  await expect(page.getByTestId("current-requester")).toHaveText("Jennifer Anderson");
});

test("E2E-02: find the new ticket in My Tickets through search and filters", async ({ page }) => {
  await selectRequester(page, "Jennifer Anderson");

  const summary = `${SUMMARY_PREFIX} ${Date.now()}`;
  const ticketNumber = await createTicket(page, summary);

  await nav(page, "My Tickets").click();
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();

  // Search by the summary text.
  await page.getByLabel("Search").fill(summary);
  await expect(page.getByRole("link", { name: ticketNumber })).toBeVisible();

  // Search by the ticket number itself.
  await page.getByLabel("Search").fill(ticketNumber);
  await expect(page.getByRole("link", { name: ticketNumber })).toBeVisible();

  // A filter that cannot match hides it, and shows the no-results state rather
  // than the empty state.
  await page.getByLabel("Requested Priority").selectOption("URGENT");
  await expect(page.getByText(/No tickets match your filters/)).toBeVisible();
  await expect(page.getByText(/have not created any tickets yet/)).toHaveCount(0);

  // Clear Filters sits both in the page header and inside the no-results
  // block, so the header one is addressed explicitly.
  await page.getByRole("button", { name: "Clear Filters" }).first().click();
  await expect(page.getByRole("link", { name: ticketNumber })).toBeVisible();
});

test("E2E-03: upload, download and soft-remove an attachment", async ({ page }) => {
  await selectRequester(page, "Jennifer Anderson");

  const summary = `${SUMMARY_PREFIX} ${Date.now()}`;
  const ticketNumber = await createTicket(page, summary);

  await page.getByRole("link", { name: "View ticket" }).click();
  await expect(page.getByRole("heading", { name: ticketNumber })).toBeVisible();
  await expect(page.getByText("No attachments on this ticket.")).toBeVisible();

  // Upload
  await page.setInputFiles("#attachment-input", {
    name: "evidence.png",
    mimeType: "image/png",
    buffer: Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"),
  });
  await expect(page.getByText("evidence.png")).toBeVisible();
  await expect(page.getByText("1 active of 5")).toBeVisible();

  // Download. The client fetches with the identity header and saves a blob, so
  // a plain link would not work here (D-06).
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toBe("evidence.png");

  // Soft removal, which requires a reason.
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  const confirm = page.getByRole("button", { name: "Confirm removal" });
  await expect(confirm).toBeDisabled();

  await page.getByLabel("Removal reason").fill("Uploaded the wrong screenshot");
  await expect(confirm).toBeEnabled();
  await confirm.click();

  // Metadata and reason stay visible; the content becomes unreachable.
  await expect(page.getByText("Removed", { exact: true })).toBeVisible();
  await expect(page.getByText("Uploaded the wrong screenshot")).toBeVisible();
  await expect(page.getByText("evidence.png")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download" })).toHaveCount(0);
  await expect(page.getByText("0 active of 5")).toBeVisible();

  // The removal survives a reload, so it was persisted rather than local state.
  await page.reload();
  await expect(page.getByText("Removed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download" })).toHaveCount(0);
});

test("E2E-04: another requester cannot see or open the ticket", async ({ page }) => {
  await selectRequester(page, "Jennifer Anderson");

  const summary = `${SUMMARY_PREFIX} ${Date.now()}`;
  const ticketNumber = await createTicket(page, summary);

  await page.getByRole("link", { name: "View ticket" }).click();
  await expect(page.getByRole("heading", { name: ticketNumber })).toBeVisible();
  const ticketUrl = page.url();

  // Switch identity.
  await page.getByRole("button", { name: "Change Requester" }).click();
  await selectRequester(page, "Michael Brown");

  // The other requester's ticket is absent from the list …
  await page.getByLabel("Search").fill(ticketNumber);
  await expect(page.getByRole("link", { name: ticketNumber })).toHaveCount(0);

  // … and unreachable by its direct URL. The server answers 404 for "not
  // yours" exactly as it does for "does not exist", so nothing about the
  // ticket is disclosed (BR-13).
  await page.goto(ticketUrl);
  await expect(page.getByText("Ticket not found")).toBeVisible();
  await expect(page.getByText(summary)).toHaveCount(0);
});

test("E2E-06: the Zen Green tokens are actually applied", async ({ page }) => {
  await selectRequester(page, "Jennifer Anderson");

  // Verified against the rendered page rather than the stylesheet, because
  // Bootstrap is loaded precompiled and bakes button colours in at build time
  // — overriding --bs-primary alone would not have recoloured anything.
  const header = page.locator(".zen-header").first();
  await expect(header).toHaveCSS("background-color", "rgb(0, 107, 60)");

  // The active page control must be green too. Bootstrap's pagination defaults
  // to its own blue, and nothing else in the app uses that component, so it is
  // easy to leave un-themed.
  const activePage = page.locator(".page-item.active .page-link").first();
  if (await activePage.count()) {
    await expect(activePage).toHaveCSS("background-color", "rgb(0, 107, 60)");
  }

  await nav(page, "Create Ticket").click();
  const submit = page.getByRole("button", { name: "Submit Ticket" });
  await expect(submit).toHaveCSS("background-color", "rgb(0, 107, 60)");

  // Read-only fields are visibly distinct from editable ones. Bootstrap ties
  // .form-control's background to --bs-body-bg, which the theme repoints at
  // the page colour, so without an explicit rule every editable field would
  // look read-only. Both halves are asserted so that cannot regress.
  await expect(page.getByTestId("readonly-ticket-number")).toHaveCSS(
    "background-color",
    "rgb(242, 244, 241)"
  );
  await expect(page.getByLabel("Ticket Summary")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)"
  );

  // Validation text uses the specified dark red, and success is never colour
  // alone — the confirmation carries readable text (AC-48).
  await submit.click();
  const message = page.getByText("Summary is required.");
  await expect(message).toBeVisible();
  await expect(message).toHaveCSS("color", "rgb(164, 22, 26)");
});

test("E2E-05 / E2E-07: every screen is usable at desktop, tablet and mobile", async ({ page }) => {
  await selectRequester(page, "Jennifer Anderson");
  const summary = `${SUMMARY_PREFIX} ${Date.now()}`;
  await createTicket(page, summary);
  await page.getByRole("link", { name: "View ticket" }).click();
  const ticketUrl = page.url();

  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet", width: 820, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const path of ["/tickets", "/tickets/new", ticketUrl]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      // No horizontal page scrolling at any width. A one-pixel tolerance
      // absorbs sub-pixel rounding in the layout.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `${path} overflows horizontally at ${viewport.name}`).toBeLessThanOrEqual(1);

      // Content must not sit flush against the viewport edge. Bootstrap zeroes
      // the navbar's horizontal padding on an element that is also a
      // container, which left the brand at x=0 below the container's max width.
      const brand = await page.locator(".navbar-brand").boundingBox();
      if (brand) {
        expect(brand.x, `brand touches the edge at ${viewport.name}`).toBeGreaterThan(0);
      }
    }

    if (viewport.name === "mobile") {
      // Every interactive control stays touch-friendly. The pagination links
      // and the navbar toggler are not .btn, so they were missed by the first
      // rule and measured 38px and 40px.
      await page.goto("/tickets");
      const undersized = await page.evaluate(() => {
        const bad: string[] = [];
        document.querySelectorAll("button, a.btn, .page-link").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && (r.height < 44 || r.width < 44)) {
            bad.push(`${el.tagName}.${el.className.split(" ")[0]} ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
        });
        return bad;
      });
      expect(undersized, "controls below the 44px touch target at mobile").toEqual([]);
    }
  }

  // E2E-07: the list is a table from md upward and cards below it.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tickets");
  await expect(page.locator("table")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tickets");
  await expect(page.locator("table")).toBeHidden();
});
