import { mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, request as playwrightRequest, test } from "@playwright/test";
import {
  API_URL,
  E2E_TAG,
  type E2EUser,
  assertResponsiveLayout,
  cleanupE2EUsers,
  closeE2EPrisma,
  createE2EUser,
  createTicketApi,
  loginApi,
  loginUi,
} from "../support/fixtures.js";

const DATABASE_URL = process.env.DATABASE_URL;
const UPLOAD_ROOT = process.env.UPLOAD_DIR?.trim();
const SCREENSHOT_ROOT = path.resolve(
  process.env.PW_SCREENSHOT_ROOT ?? path.join("test-results", `issue90-dashboard-${Date.now()}`)
);

function assertIssue90Isolation() {
  if (!DATABASE_URL || !UPLOAD_ROOT) throw new Error("Issue 90 browser verification needs explicit isolated database and upload paths.");
  const database = new URL(DATABASE_URL);
  const schema = database.searchParams.get("schema");
  if (
    !["127.0.0.1", "localhost"].includes(database.hostname) ||
    database.port !== "55434" ||
    database.pathname !== "/lab4test" ||
    !schema?.startsWith("lab4_issue90_e2e")
  ) {
    throw new Error("Issue 90 browser verification refuses a database outside the dedicated loopback lab4_issue90_e2e schema.");
  }
  const resolvedUploads = path.resolve(UPLOAD_ROOT);
  if (!resolvedUploads.toLowerCase().includes(`${path.sep}test-results${path.sep}issue90`.toLowerCase())) {
    throw new Error("Issue 90 browser verification requires an upload directory under its task-owned test-results/issue90 root.");
  }
  const screenshotRunRoot = path.resolve("test-results", "issue90").toLowerCase();
  if (!SCREENSHOT_ROOT.toLowerCase().startsWith(`${screenshotRunRoot}${path.sep}`.toLowerCase())) {
    throw new Error("Issue 90 screenshots must stay under the task-owned test-results/issue90 directory.");
  }
  const artifactsRoot = path.resolve("artifacts");
  if (SCREENSHOT_ROOT === artifactsRoot || SCREENSHOT_ROOT.startsWith(`${artifactsRoot}${path.sep}`)) {
    throw new Error("Issue 90 screenshots must stay outside the committed artifacts directory.");
  }
}

type Api = Awaited<ReturnType<typeof playwrightRequest.newContext>>;
type Session = Awaited<ReturnType<typeof loginApi>>;
type StaffDetail = { id: number; ticketNumber: string; version: number; itPriority: string };

async function getStaffTicket(api: Api, ticketId: number): Promise<StaffDetail> {
  const response = await api.get(`${API_URL}/api/staff/tickets/${ticketId}`);
  expect(response.status()).toBe(200);
  return response.json() as Promise<StaffDetail>;
}

async function claimTicket(api: Api, session: Session, ticketId: number) {
  const ticket = await getStaffTicket(api, ticketId);
  const response = await api.patch(`${API_URL}/api/staff/tickets/${ticketId}/claim`, {
    headers: { "X-CSRF-Token": session.csrfToken },
    data: { expectedTicketVersion: ticket.version },
  });
  expect(response.status()).toBe(200);
}

async function updateTicketStatus(
  api: Api,
  session: Session,
  ticketId: number,
  status: "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "RESOLVED",
  publicComment?: string
) {
  const ticket = await getStaffTicket(api, ticketId);
  const response = await api.patch(`${API_URL}/api/staff/tickets/${ticketId}/status`, {
    headers: { "X-CSRF-Token": session.csrfToken, "Idempotency-Key": randomUUID() },
    data: {
      expectedTicketVersion: ticket.version,
      status,
      ...(publicComment ? { publicComment } : {}),
    },
  });
  expect(response.status()).toBe(200);
  return response.json() as Promise<{ ticketVersion: number }>;
}

async function createAction(
  api: Api,
  session: Session,
  ticketId: number,
  assigneeId: number,
  description: string
): Promise<{ id: number; ticketVersion: number }> {
  const ticket = await getStaffTicket(api, ticketId);
  const response = await api.post(`${API_URL}/api/staff/tickets/${ticketId}/actions`, {
    headers: { "X-CSRF-Token": session.csrfToken, "Idempotency-Key": randomUUID() },
    data: { expectedTicketVersion: ticket.version, description, assigneeId },
  });
  expect(response.status()).toBe(201);
  const body = await response.json() as { action: { id: number }; ticketVersion: number };
  return { id: body.action.id, ticketVersion: body.ticketVersion };
}

async function completeAction(
  api: Api,
  session: Session,
  ticketId: number,
  action: { id: number; ticketVersion: number },
  result: string
) {
  const response = await api.post(`${API_URL}/api/staff/tickets/${ticketId}/actions/${action.id}/transitions`, {
    headers: { "X-CSRF-Token": session.csrfToken, "Idempotency-Key": randomUUID() },
    data: {
      expectedTicketVersion: action.ticketVersion,
      expectedActionVersion: 1,
      status: "COMPLETED",
      result,
    },
  });
  expect(response.status()).toBe(200);
  return response.json() as Promise<{ ticketVersion: number }>;
}

async function setMetric(page: import("@playwright/test").Page, name: string, value: number, unit: "tickets" | "actions") {
  const card = page.locator(".dashboard-metric-card").filter({ has: page.getByRole("heading", { name }) });
  await expect(card.locator("[aria-label]")).toHaveAttribute("aria-label", `${value} ${unit}`);
}

async function captureDashboard(
  page: import("@playwright/test").Page,
  role: "requester" | "staff",
  width: number,
  height: number
) {
  await page.setViewportSize({ width, height });
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await assertResponsiveLayout(page, `${role} Dashboard ${width}x${height}`);
  await mkdir(SCREENSHOT_ROOT, { recursive: true });
  await page.screenshot({
    path: path.join(SCREENSHOT_ROOT, `${role}-dashboard-${width}x${height}.png`),
    fullPage: true,
  });
  const geometry = await page.evaluate(() => ({
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    document: `${document.documentElement.scrollWidth}x${document.documentElement.scrollHeight}`,
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  console.log(`Issue90 ${role} Dashboard geometry ${JSON.stringify(geometry)}; screenshot ${path.join(SCREENSHOT_ROOT, `${role}-dashboard-${width}x${height}.png`)}.`);
}

test.describe.serial("E2E-03 — role Dashboards and exact drilldowns", () => {
  let requester: E2EUser;
  let staff: E2EUser;
  let secondStaff: E2EUser;
  let admin: E2EUser;
  const createdUserIds: number[] = [];

  test.beforeAll(async () => {
    assertIssue90Isolation();
    requester = await createE2EUser("REQUESTER", "issue90-requester");
    staff = await createE2EUser("STAFF", "issue90-staff");
    secondStaff = await createE2EUser("STAFF", "issue90-second-assignee");
    admin = await createE2EUser("ADMIN", "issue90-admin");
    createdUserIds.push(requester.id, staff.id, secondStaff.id, admin.id);
  });

  test.afterAll(async () => {
    await cleanupE2EUsers(createdUserIds);
    await closeE2EPrisma();
  });

  test("renders role snapshots, follows links, refreshes after Action work and preserves Queue search URL", async ({ page }) => {
    test.setTimeout(120_000);
    assertIssue90Isolation();
    const requesterApi = await playwrightRequest.newContext({ baseURL: API_URL });
    const staffApi = await playwrightRequest.newContext({ baseURL: API_URL });
    try {
      const requesterSession = await loginApi(requesterApi, requester);
      const staffSession = await loginApi(staffApi, staff);

      const activeTicket = await createTicketApi(requesterApi, requesterSession, `Issue 90 Active Action ${E2E_TAG}`);
      const waitingTicket = await createTicketApi(requesterApi, requesterSession, `Issue 90 Waiting Ticket ${E2E_TAG}`);
      const resolvedTicket = await createTicketApi(requesterApi, requesterSession, `Issue 90 Resolved Ticket ${E2E_TAG}`);
      const queueTicket = await createTicketApi(requesterApi, requesterSession, `Issue 90 dashboard queue search ${E2E_TAG}`);

      await claimTicket(staffApi, staffSession, activeTicket.id);
      await updateTicketStatus(staffApi, staffSession, activeTicket.id, "OPEN");
      const activeAction = await createAction(staffApi, staffSession, activeTicket.id, staff.id, "Review the active Dashboard work item");

      await claimTicket(staffApi, staffSession, waitingTicket.id);
      await updateTicketStatus(staffApi, staffSession, waitingTicket.id, "OPEN");
      await updateTicketStatus(staffApi, staffSession, waitingTicket.id, "WAITING_FOR_REQUESTER", `Waiting evidence ${E2E_TAG}`);

      await claimTicket(staffApi, staffSession, resolvedTicket.id);
      await updateTicketStatus(staffApi, staffSession, resolvedTicket.id, "OPEN");
      await updateTicketStatus(staffApi, staffSession, resolvedTicket.id, "IN_PROGRESS");
      const completedAction = await createAction(staffApi, staffSession, resolvedTicket.id, secondStaff.id, "Complete the resolution evidence item");
      await completeAction(staffApi, staffSession, resolvedTicket.id, completedAction, "Verified the requester can access the restored service");
      await updateTicketStatus(staffApi, staffSession, resolvedTicket.id, "RESOLVED");

      const queuePriority = await staffApi.patch(`${API_URL}/api/staff/tickets/${queueTicket.id}/it-priority`, {
        headers: { "X-CSRF-Token": staffSession.csrfToken },
        data: { expectedTicketVersion: 1, itPriority: "URGENT" },
      });
      expect(queuePriority.status()).toBe(200);

      const requesterDashboardResponse = await requesterApi.get(`${API_URL}/api/requester/dashboard`);
      expect(requesterDashboardResponse.status()).toBe(200);
      const requesterDashboard = await requesterDashboardResponse.json() as {
        metrics: Record<string, { value: number; unit: string; href: string }>;
        previews: { recentUpdated: { data: Array<{ ticketNumber: string }> }; recentResolved: { data: Array<{ ticketNumber: string }> } };
      };
      expect(requesterDashboard.metrics.openTickets.value).toBeGreaterThan(0);
      expect(requesterDashboard.metrics.waitingForMe.value).toBe(1);
      expect(requesterDashboard.metrics.recentlyResolved.value).toBe(1);
      expect(requesterDashboard.previews.recentUpdated.data.map((ticket) => ticket.ticketNumber)).toContain(activeTicket.ticketNumber);
      expect(requesterDashboard.previews.recentResolved.data.map((ticket) => ticket.ticketNumber)).toContain(resolvedTicket.ticketNumber);

      const staffDashboardResponse = await staffApi.get(`${API_URL}/api/staff/dashboard`);
      expect(staffDashboardResponse.status()).toBe(200);
      const staffDashboard = await staffDashboardResponse.json() as {
        metrics: Record<string, { value: number; unit: string; href: string }>;
        previews: { priorityRecentTickets: { data: Array<{ ticketNumber: string }> }; myCompletedActions: { data: Array<{ ticketId: number; assignee: { id: number }; performedBy: { id: number } | null }> } };
      };
      expect(staffDashboard.metrics.myActiveActions.value).toBe(1);
      expect(staffDashboard.previews.priorityRecentTickets.data.map((ticket) => ticket.ticketNumber)).toContain(queueTicket.ticketNumber);
      expect(staffDashboard.previews.myCompletedActions.data).toEqual(expect.arrayContaining([
        expect.objectContaining({ ticketId: resolvedTicket.id, assignee: expect.objectContaining({ id: secondStaff.id }), performedBy: expect.objectContaining({ id: staff.id }) }),
      ]));

      await loginUi(page, requester);
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
      await setMetric(page, "Waiting for Me", requesterDashboard.metrics.waitingForMe.value, "tickets");
      await setMetric(page, "Recently Updated", requesterDashboard.metrics.recentlyUpdated.value, "tickets");
      await setMetric(page, "Recently Resolved", requesterDashboard.metrics.recentlyResolved.value, "tickets");
      await expect(page.getByRole("link", { name: activeTicket.ticketNumber })).toBeVisible();
      await expect(page.getByRole("link", { name: waitingTicket.ticketNumber })).toHaveAttribute("href", `/tickets/${waitingTicket.id}`);
      const recentlyResolved = page.getByRole("region", { name: "Recently Resolved Tickets" });
      await expect(recentlyResolved.getByRole("link", { name: resolvedTicket.ticketNumber })).toHaveAttribute("href", `/tickets/${resolvedTicket.id}`);

      await captureDashboard(page, "requester", 1440, 900);
      await captureDashboard(page, "requester", 820, 1024);
      await captureDashboard(page, "requester", 390, 844);
      await page.getByRole("button", { name: "Open navigation menu" }).click();
      await expect(page.getByTestId("current-user")).toBeVisible();
      await expect(page.getByTestId("current-role")).toHaveText("Requester");
      await page.screenshot({ path: path.join(SCREENSHOT_ROOT, "requester-dashboard-390x844-navigation-open.png"), fullPage: true });
      await page.getByRole("button", { name: "Close navigation menu" }).click();

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole("link", { name: "View Open Tickets" }).click();
      await page.waitForURL((url) => url.pathname === "/tickets" && url.searchParams.get("statuses") === "NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED");
      await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.goForward();
      await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
      await page.getByRole("button", { name: "Logout" }).click();
      await expect(page).toHaveURL(/\/login$/);

      await loginUi(page, staff);
      await page.goto("/staff/dashboard");
      await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
      await setMetric(page, "My Active Actions", staffDashboard.metrics.myActiveActions.value, "actions");
      await expect(page.getByText("Assigned to: ", { exact: false })).toBeVisible();
      await expect(page.getByText(`Completed by: ${staff.fullName}`)).toBeVisible();
      await expect(page.getByText(`Assigned to: ${secondStaff.fullName}`)).toBeVisible();
      await expect(page.getByRole("link", { name: resolvedTicket.ticketNumber })).toHaveAttribute("href", `/staff/tickets/${resolvedTicket.id}?tab=actions&actionId=${completedAction.id}`);
      await expect(page.getByText("Actions completed today and the previous 6 days (Bangkok time).")).toBeVisible();

      await captureDashboard(page, "staff", 1440, 900);
      await captureDashboard(page, "staff", 820, 1024);
      await captureDashboard(page, "staff", 390, 844);
      await page.getByRole("button", { name: "Open navigation menu" }).click();
      await expect(page.getByTestId("current-user")).toBeVisible();
      await expect(page.getByTestId("current-role")).toHaveText("IT Staff");
      await page.screenshot({ path: path.join(SCREENSHOT_ROOT, "staff-dashboard-390x844-navigation-open.png"), fullPage: true });
      await page.getByRole("button", { name: "Close navigation menu" }).click();

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole("link", { name: "View High/Urgent Tickets" }).click();
      await page.waitForURL((url) => url.pathname === "/staff/tickets" && url.searchParams.get("itPriorities") === "HIGH,URGENT");
      await expect(page.getByRole("link", { name: queueTicket.ticketNumber })).toBeVisible();
      await page.goto("/staff/dashboard");

      const activeActionsLink = page.getByRole("link", { name: "View My Active Actions" });
      await activeActionsLink.focus();
      await activeActionsLink.press("Enter");
      await expect(page).toHaveURL(/\/staff\/dashboard\?actions=active-assigned/);
      await expect(page.getByRole("heading", { name: "My Actions" })).toBeFocused();
      const activeActionsTable = page.getByRole("table", { name: "Actions assigned to you or completed by you" });
      await expect(activeActionsTable.getByText("Review the active Dashboard work item", { exact: true })).toBeVisible();
      await activeActionsTable.getByRole("link", { name: "Open Action" }).click();
      await page.waitForURL((url) => url.pathname === `/staff/tickets/${activeTicket.id}` && url.searchParams.get("tab") === "actions" && url.searchParams.get("actionId") === String(activeAction.id));
      await expect(page.getByRole("heading", { name: `Action ${activeAction.id} · Planned` })).toBeVisible();
      await page.getByRole("button", { name: "Complete" }).click();
      await page.getByLabel(/Result/).fill("Dashboard browser verification completed the assigned work");
      await page.getByRole("button", { name: "Confirm Complete" }).click();
      await expect(page.getByRole("heading", { name: `Action ${activeAction.id} · Completed` })).toBeVisible();
      await expect(page.getByText("Dashboard browser verification completed the assigned work", { exact: true })).toBeVisible();

      await page.goto("/staff/dashboard");
      const refreshedStaffDashboard = await (await staffApi.get(`${API_URL}/api/staff/dashboard`)).json() as {
        metrics: Record<string, { value: number; unit: string; href: string }>;
      };
      await page.getByRole("button", { name: "Refresh Dashboard" }).click();
      await setMetric(page, "My Active Actions", refreshedStaffDashboard.metrics.myActiveActions.value, "actions");
      expect(refreshedStaffDashboard.metrics.myActiveActions.value).toBe(0);
      await page.getByRole("link", { name: "View all completed Actions" }).click();
      await expect(page).toHaveURL(/actions=completed-performed/);
      await expect(page.getByRole("heading", { name: "My Actions" })).toBeVisible();
      const completedActionsTable = page.getByRole("table", { name: "Actions assigned to you or completed by you" });
      await expect(completedActionsTable.getByText("Review the active Dashboard work item", { exact: true })).toBeVisible();

      await page.goto("/staff/tickets");
      const queueSearch = page.getByRole("searchbox", { name: "Search" });
      await expect(queueSearch).toHaveAttribute("maxLength", "100");
      const searchText = `  ${`Issue 90 dashboard queue search ${E2E_TAG}`}  `;
      await queueSearch.fill(searchText);
      await page.waitForURL((url) => url.searchParams.get("q") === `Issue 90 dashboard queue search ${E2E_TAG}`);
      await expect(page.getByRole("link", { name: queueTicket.ticketNumber })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue(`Issue 90 dashboard queue search ${E2E_TAG}`);
      await expect(page.getByRole("link", { name: queueTicket.ticketNumber })).toBeVisible();
      await page.goBack();
      await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
      await page.goForward();
      await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue(`Issue 90 dashboard queue search ${E2E_TAG}`);
      await page.getByRole("searchbox", { name: "Search" }).fill("    ");
      await page.waitForURL((url) => !url.searchParams.has("q"));
      await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
      await expect(page.getByText(/invalid.*filter/i)).toHaveCount(0);

      await page.getByRole("button", { name: "Logout" }).click();
      await expect(page).toHaveURL(/\/login$/);
      await loginUi(page, admin);
      await page.goto("/staff/dashboard");
      await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
      await expect(page.getByTestId("current-role")).toHaveText("Administrator");
      await expect(page.getByRole("heading", { name: "Tickets by status" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Users" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "User Management" })).toBeVisible();
      console.log(`Issue90 browser screenshots saved under ${SCREENSHOT_ROOT}; E2E fixtures are scoped to the task-owned schema and cleaned up by created user IDs.`);
    } finally {
      await Promise.all([requesterApi.dispose(), staffApi.dispose()]);
    }
  });
});
