import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { dirname } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { ActionStatus, Priority, TicketStatus } from "@prisma/client";
import { app } from "../testApp.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/security/password.js";
import { setDashboardClockForTest } from "../../src/services/dashboards.service.js";
import { deleteFileIfPresent, storedFilePath } from "../../src/lib/paths.js";
import { loginAs, TEST_PASSWORD, withAuth, type AuthSessionFixture } from "../support/auth.js";

const prisma = getPrisma();
const tag = randomUUID().slice(0, 8);
const passwordHashPromise = hashPassword(TEST_PASSWORD);
const ticketIds: number[] = [];
const actionIds: number[] = [];
const userIds: number[] = [];
const uploadedFiles: string[] = [];
let requesterId: number;
let otherRequesterId: number;
let staffId: number;
let otherStaffId: number;
let adminId: number;
let categoryId: number;
let relatedSystemId: number;
let requesterAuth: AuthSessionFixture;
let otherRequesterAuth: AuthSessionFixture;
let staffAuth: AuthSessionFixture;
let otherStaffAuth: AuthSessionFixture;
let adminAuth: AuthSessionFixture;

function bangkokWindowStart(asOf: Date): Date {
  const local = new Date(asOf.getTime() + 7 * 60 * 60 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - 6) - 7 * 60 * 60 * 1000);
}

async function makeTicket(options: {
  requester?: number;
  owner?: number | null;
  status?: TicketStatus;
  priority?: Priority;
  updatedAt?: Date;
  resolvedAt?: Date | null;
  workCycle?: number;
  label?: string;
  createdAt?: Date;
}) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `D89-${tag}-${randomUUID().slice(0, 6)}`,
      requesterId: options.requester ?? requesterId,
      ownerId: options.owner ?? null,
      categoryId,
      relatedSystemId,
      requestedPriority: options.priority ?? "MEDIUM",
      itPriority: options.priority ?? "MEDIUM",
      currentStatus: options.status ?? "OPEN",
      workCycle: options.workCycle ?? 1,
      summary: `Dashboard ${options.label ?? "fixture"} ${tag}`,
      description: "A task-owned dashboard fixture Ticket.",
      createdAt: options.createdAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000),
      updatedAt: options.updatedAt ?? new Date(),
      resolvedAt: options.resolvedAt ?? null,
    },
  });
  ticketIds.push(ticket.id);
  return ticket;
}

async function makeAction(ticketId: number, options: {
  workCycle?: number;
  status?: ActionStatus;
  assignee?: number;
  performer?: number | null;
  completedAt?: Date | null;
  createdAt?: Date;
}) {
  const status = options.status ?? "PLANNED";
  const completedAt = options.completedAt ?? null;
  const action = await prisma.actionTaken.create({
    data: {
      ticketId,
      workCycle: options.workCycle ?? 1,
      status,
      description: `Dashboard action ${tag}`,
      result: status === "COMPLETED" ? "Verified the requested change." : null,
      actionAt: options.createdAt ?? new Date(),
      createdAt: options.createdAt ?? new Date(),
      assigneeId: options.assignee ?? staffId,
      createdById: staffId,
      performedById: status === "COMPLETED" ? (options.performer ?? staffId) : null,
      completedAt,
    },
  });
  actionIds.push(action.id);
  return action;
}

beforeAll(async () => {
  const [category, system] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { active: true }, orderBy: { id: "asc" } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { active: true }, orderBy: { id: "asc" } }),
  ]);
  categoryId = category.id;
  relatedSystemId = system.id;
  const passwordHash = await passwordHashPromise;
  const [requester, otherRequester, staff, otherStaff, admin] = await Promise.all([
    prisma.user.create({ data: { fullName: `Dashboard Requester ${tag}`, email: `d89.req.${tag}@example.test`, passwordHash } }),
    prisma.user.create({ data: { fullName: `Other Dashboard Requester ${tag}`, email: `d89.other.${tag}@example.test`, passwordHash } }),
    prisma.user.create({ data: { fullName: `Dashboard Staff ${tag}`, email: `d89.staff.${tag}@example.test`, role: "STAFF", passwordHash } }),
    prisma.user.create({ data: { fullName: `Other Dashboard Staff ${tag}`, email: `d89.staff.other.${tag}@example.test`, role: "STAFF", passwordHash } }),
    prisma.user.create({ data: { fullName: `Dashboard Admin ${tag}`, email: `d89.admin.${tag}@example.test`, role: "ADMIN", passwordHash } }),
  ]);
  requesterId = requester.id;
  otherRequesterId = otherRequester.id;
  staffId = staff.id;
  otherStaffId = otherStaff.id;
  adminId = admin.id;
  userIds.push(requesterId, otherRequesterId, staffId, otherStaffId, adminId);
  [requesterAuth, otherRequesterAuth, staffAuth, otherStaffAuth, adminAuth] = await Promise.all([
    loginAs(requester.email), loginAs(otherRequester.email), loginAs(staff.email), loginAs(otherStaff.email), loginAs(admin.email),
  ]);
});

afterEach(async () => {
  setDashboardClockForTest(undefined);
  await prisma.ticketWorkflowEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.actionRevision.deleteMany({ where: { actionId: { in: actionIds } } });
  await prisma.actionTaken.deleteMany({ where: { id: { in: actionIds } } });
  await prisma.publicComment.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.internalNote.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.attachment.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await Promise.all(uploadedFiles.splice(0).map((filename) => deleteFileIfPresent(storedFilePath(filename))));
  ticketIds.length = 0;
  actionIds.length = 0;
});

afterAll(async () => {
  await prisma.idempotencyRecord.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("Issue #89 Dashboard and Staff Actions APIs", () => {
  it("returns a private Requester snapshot with inclusive Bangkok-window counts and safe previews", async () => {
    const empty = await withAuth(request(app).get("/api/requester/dashboard"), requesterAuth, false);
    expect(empty.status).toBe(200);
    expect(Object.values(empty.body.metrics as Record<string, { value: number }>).every((metric) => metric.value === 0)).toBe(true);
    expect(empty.body.previews.recentUpdated.data).toEqual([]);
    expect(empty.body.previews.recentResolved.data).toEqual([]);

    const now = new Date();
    const from = bangkokWindowStart(now);
    await makeTicket({ status: "NEW", updatedAt: new Date(now.getTime() - 60 * 60 * 1000) });
    await makeTicket({ status: "WAITING_FOR_REQUESTER", updatedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) });
    const resolvedAt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    await makeTicket({ status: "RESOLVED", resolvedAt, updatedAt: resolvedAt, label: "recent resolved" });
    await makeTicket({ status: "RESOLVED", resolvedAt: from, updatedAt: from, label: "boundary resolved" });
    await makeTicket({ status: "CLOSED", resolvedAt: null, updatedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000), label: "unknown legacy resolve time" });
    await makeTicket({ status: "CANCELLED", updatedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000) });
    await makeTicket({ status: "OPEN", updatedAt: new Date(from.getTime() - 1) });
    const foreignTicket = await makeTicket({ requester: otherRequesterId, status: "OPEN", updatedAt: new Date() });

    const response = await withAuth(request(app).get("/api/requester/dashboard"), requesterAuth, false);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body.window.timeZone).toBe("Asia/Bangkok");
    expect(response.body.window.from).toBe(from.toISOString());

    const asOf = new Date(response.body.generatedAt as string);
    const independent = await prisma.$queryRaw<{ open: number; waiting: number; updated: number; resolved: number }[]>`
      SELECT
        COUNT(*) FILTER (WHERE "currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED'))::int AS "open",
        COUNT(*) FILTER (WHERE "currentStatus" = 'WAITING_FOR_REQUESTER')::int AS "waiting",
        COUNT(*) FILTER (WHERE "updatedAt" >= ${from} AND "updatedAt" <= ${asOf})::int AS "updated",
        COUNT(*) FILTER (WHERE "currentStatus" IN ('RESOLVED','CLOSED') AND "resolvedAt" >= ${from} AND "resolvedAt" <= ${asOf})::int AS "resolved"
      FROM "Ticket" WHERE "requesterId" = ${requesterId}
    `;
    expect(response.body.metrics).toMatchObject({
      openTickets: { value: independent[0].open, unit: "tickets" },
      waitingForMe: { value: independent[0].waiting, unit: "tickets" },
      recentlyUpdated: { value: independent[0].updated, unit: "tickets" },
      recentlyResolved: { value: independent[0].resolved, unit: "tickets" },
    });
    expect(response.body.metrics.openTickets.value).toBe(3);
    expect(response.body.metrics.waitingForMe.value).toBe(1);
    expect(response.body.metrics.recentlyResolved.value).toBe(2);
    expect(response.body.metrics.recentlyResolved.href).toContain("statuses=RESOLVED%2CCLOSED");
    expect(response.body.previews.recentUpdated.data).toHaveLength(5);
    expect(response.body.previews.recentResolved.data.map((row: { resolvedAt: string }) => row.resolvedAt)).toContain(from.toISOString());
    expect(response.body.previews.recentUpdated.data.every((row: { id: number }) => ticketIds.includes(row.id))).toBe(true);
    expect(response.body.previews.recentUpdated.data.some((row: { id: number }) => row.id === foreignTicket.id)).toBe(false);
    expect(response.body.previews.recentUpdated.data[0]).not.toHaveProperty("description");
    expect(response.body.previews.recentUpdated.data[0]).not.toHaveProperty("requester");
    expect(response.body.previews.recentUpdated.data[0]).not.toHaveProperty("attachments");
    for (const metric of Object.values(response.body.metrics) as Array<{ value: number; href: string }>) {
      const link = new URL(metric.href, "http://local.test");
      const list = await withAuth(request(app).get(`/api${link.pathname}${link.search}`), requesterAuth, false);
      expect(list.status).toBe(200);
      expect(list.body.total).toBe(metric.value);
    }
    for (const preview of Object.values(response.body.previews) as Array<{ data: Array<{ id: number }>; href: string }>) {
      const link = new URL(preview.href, "http://local.test");
      const list = await withAuth(request(app).get(`/api${link.pathname}${link.search}`), requesterAuth, false);
      expect(list.body.data.slice(0, 5).map((row: { id: number }) => row.id)).toEqual(preview.data.map((row) => row.id));
    }
    const resolvedLink = new URL(response.body.previews.recentResolved.href, "http://local.test");
    const resolvedList = await withAuth(request(app).get(`/api/tickets${resolvedLink.search}`), requesterAuth, false);
    expect(resolvedList.body.data.map((row: { id: number }) => row.id)).toEqual(response.body.previews.recentResolved.data.map((row: { id: number }) => row.id));
  });

  it("includes exact window endpoints and excludes one millisecond beyond the fixed asOf", async () => {
    const asOf = new Date("2026-10-29T12:00:00.000Z");
    const from = bangkokWindowStart(asOf);
    setDashboardClockForTest(() => asOf);
    const createdAt = new Date(asOf.getTime() - 10 * 24 * 60 * 60 * 1000);
    const updatedAtFrom = await makeTicket({ status: "OPEN", createdAt, updatedAt: from, label: "updated at lower boundary" });
    const updatedAtThrough = await makeTicket({ status: "OPEN", createdAt, updatedAt: asOf, label: "updated at upper boundary" });
    const updatedAfterThrough = await makeTicket({ status: "OPEN", createdAt, updatedAt: new Date(asOf.getTime() + 1), label: "updated after upper boundary" });
    const updatedBeforeFrom = await makeTicket({ status: "OPEN", createdAt, updatedAt: new Date(from.getTime() - 1), label: "updated before lower boundary" });
    const resolvedAtFrom = await makeTicket({ status: "RESOLVED", createdAt, resolvedAt: from, updatedAt: from, label: "resolved at lower boundary" });
    const resolvedAtThrough = await makeTicket({ status: "CLOSED", createdAt, resolvedAt: asOf, updatedAt: asOf, label: "resolved at upper boundary" });
    const resolvedAfterThrough = await makeTicket({ status: "RESOLVED", createdAt, resolvedAt: new Date(asOf.getTime() + 1), updatedAt: new Date(asOf.getTime() + 1), label: "resolved after upper boundary" });
    const foreign = await makeTicket({ requester: otherRequesterId, status: "OPEN", createdAt, updatedAt: asOf, label: "foreign exact boundary" });

    const response = await withAuth(request(app).get("/api/requester/dashboard"), requesterAuth, false);
    expect(response.body.generatedAt).toBe(asOf.toISOString());
    expect(response.body.window.from).toBe(from.toISOString());
    expect(response.body.metrics.recentlyUpdated.value).toBe(4);
    expect(response.body.metrics.recentlyResolved.value).toBe(2);
    const updatedIds = response.body.previews.recentUpdated.data.map((row: { id: number }) => row.id);
    expect(updatedIds).toEqual(expect.arrayContaining([updatedAtFrom.id, updatedAtThrough.id, resolvedAtFrom.id, resolvedAtThrough.id]));
    expect(updatedIds).not.toContain(updatedAfterThrough.id);
    expect(updatedIds).not.toContain(updatedBeforeFrom.id);
    expect(updatedIds).not.toContain(resolvedAfterThrough.id);
    expect(updatedIds).not.toContain(foreign.id);
    const resolvedIds = response.body.previews.recentResolved.data.map((row: { id: number }) => row.id);
    expect(resolvedIds).toEqual([resolvedAtThrough.id, resolvedAtFrom.id]);
    expect(resolvedIds).not.toContain(resolvedAfterThrough.id);
  });

  it("returns all Staff status counts and Dashboard metrics matching independent SQL, including old-cycle performed work", async () => {
    const now = new Date();
    const from = bangkokWindowStart(now);
    const activeOne = await makeTicket({ owner: null, status: "OPEN", priority: "URGENT" });
    const activeTwo = await makeTicket({ owner: staffId, status: "IN_PROGRESS", priority: "HIGH" });
    const oldCycleParent = await makeTicket({ owner: otherStaffId, status: "CLOSED", workCycle: 2 });
    const terminalParent = await makeTicket({ owner: staffId, status: "CLOSED" });
    const mismatchParent = await makeTicket({ owner: staffId, status: "OPEN", workCycle: 2 });
    await makeAction(activeOne.id, { createdAt: new Date(now.getTime() - 5000) });
    await makeAction(activeTwo.id, { status: "IN_PROGRESS", createdAt: new Date(now.getTime() - 4000) });
    await makeAction(mismatchParent.id, { workCycle: 1, createdAt: new Date(now.getTime() - 3000) });
    await makeAction(terminalParent.id, { createdAt: new Date(now.getTime() - 2000) });
    const earlierCycleCompleted = await makeAction(oldCycleParent.id, { workCycle: 1, status: "COMPLETED", performer: staffId, completedAt: new Date(now.getTime() - 60 * 60 * 1000) });
    const currentCycleCompleted = await makeAction(activeTwo.id, { status: "COMPLETED", performer: staffId, completedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) });
    await makeAction(activeTwo.id, { status: "COMPLETED", performer: otherStaffId, completedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000) });
    await makeAction(activeTwo.id, { status: "COMPLETED", performer: staffId, completedAt: new Date(from.getTime() - 1) });

    const response = await withAuth(request(app).get("/api/staff/dashboard"), staffAuth, false);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(Object.keys(response.body.statusCounts).sort()).toEqual(["CANCELLED", "CLOSED", "IN_PROGRESS", "NEW", "OPEN", "REOPENED", "RESOLVED", "WAITING_FOR_REQUESTER"].sort());
    const independent = await prisma.$queryRaw<{ status: TicketStatus; count: number }[]>`
      SELECT "currentStatus" AS "status", COUNT(*)::int AS "count" FROM "Ticket" GROUP BY "currentStatus"
    `;
    for (const row of independent) expect(response.body.statusCounts[row.status].value).toBe(row.count);
    for (const status of ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "REOPENED", "CLOSED", "CANCELLED"] as const) {
      expect(response.body.statusCounts[status]).toHaveProperty("value");
    }

    const activeCount = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS "count" FROM "ActionTaken" a JOIN "Ticket" t ON t.id = a."ticketId"
      WHERE a."assigneeId" = ${staffId} AND a.status IN ('PLANNED','IN_PROGRESS')
        AND a."workCycle" = t."workCycle" AND t."currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')
    `;
    expect(response.body.metrics.myActiveActions.value).toBe(activeCount[0].count);
    expect(response.body.metrics.myActiveActions.value).toBe(2);
    expect(response.body.metrics.myActiveActions.href).toBe("/staff/dashboard?actions=active-assigned");
    const staffCounts = await prisma.$queryRaw<{ unassigned: number; mine: number; highUrgent: number }[]>`
      SELECT
        COUNT(*) FILTER (WHERE "currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED') AND "ownerId" IS NULL)::int AS "unassigned",
        COUNT(*) FILTER (WHERE "currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED') AND "ownerId" = ${staffId})::int AS "mine",
        COUNT(*) FILTER (WHERE "currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED') AND "itPriority" IN ('HIGH','URGENT'))::int AS "highUrgent"
      FROM "Ticket"
    `;
    expect(response.body.metrics.unassignedTickets.value).toBe(staffCounts[0].unassigned);
    expect(response.body.metrics.myActiveTickets.value).toBe(staffCounts[0].mine);
    expect(response.body.metrics.highUrgentTickets.value).toBe(staffCounts[0].highUrgent);
    expect(response.body.previews.myCompletedActions.href).toContain("/staff/dashboard?actions=completed-performed&from=");
    expect(response.body.previews.myCompletedActions.data.map((row: { id: number }) => row.id)).toEqual(expect.arrayContaining([earlierCycleCompleted.id, currentCycleCompleted.id]));
    expect(response.body.previews.myCompletedActions.data.some((row: { id: number }) => row.id === actionIds.at(-1))).toBe(false);
    expect(response.body.previews.priorityRecentTickets.data).toHaveLength(5);
    expect(response.body.previews.priorityRecentTickets.data[0]).not.toHaveProperty("description");
    expect(response.body.previews.priorityRecentTickets.data.find((row: { id: number }) => row.id === activeOne.id)).toHaveProperty("resolvedAt", null);
    expect(response.body.previews.myCompletedActions.data[0]).not.toHaveProperty("result");
    expect(response.body.previews.myCompletedActions.data[0]).not.toHaveProperty("revisions");
    const priorityLink = new URL(response.body.previews.priorityRecentTickets.href, "http://local.test");
    const priorityList = await withAuth(request(app).get(`/api${priorityLink.pathname}${priorityLink.search}`), staffAuth, false);
    expect(priorityList.body.data.slice(0, 5).map((row: { id: number }) => row.id)).toEqual(response.body.previews.priorityRecentTickets.data.map((row: { id: number }) => row.id));
    for (const [status, metric] of Object.entries(response.body.statusCounts) as Array<[TicketStatus, { value: number; href: string }]>) {
      const link = new URL(metric.href, "http://local.test");
      const list = await withAuth(request(app).get(`/api${link.pathname}${link.search}`), staffAuth, false);
      expect(list.status).toBe(200);
      expect(list.body.total).toBe(metric.value);
      expect(list.body.data.every((row: { currentStatus: TicketStatus }) => row.currentStatus === status)).toBe(true);
    }
    for (const metric of Object.values(response.body.metrics) as Array<{ value: number; href: string; unit: string }>) {
      if (metric.unit === "actions") continue;
      const link = new URL(metric.href, "http://local.test");
      const list = await withAuth(request(app).get(`/api${link.pathname}${link.search}`), staffAuth, false);
      expect(list.body.total).toBe(metric.value);
    }
    const actionsLink = new URL(response.body.metrics.myActiveActions.href, "http://local.test");
    const activeActions = await withAuth(request(app).get(`/api/staff/actions?view=${actionsLink.searchParams.get("actions")}`), staffAuth, false);
    expect(activeActions.body.total).toBe(response.body.metrics.myActiveActions.value);
    const completedLink = new URL(response.body.previews.myCompletedActions.href, "http://local.test");
    const completedActions = await withAuth(request(app).get(`/api/staff/actions?view=${completedLink.searchParams.get("actions")}&from=${encodeURIComponent(completedLink.searchParams.get("from")!)}&through=${encodeURIComponent(completedLink.searchParams.get("through")!)}`), staffAuth, false);
    expect(completedActions.body.data.slice(0, 5).map((row: { id: number }) => row.id)).toEqual(response.body.previews.myCompletedActions.data.map((row: { id: number }) => row.id));
  });

  it("scopes and paginates active-assigned versus completed-performed Staff Actions and rejects unsafe queries", async () => {
    const now = new Date();
    const activeTicket = await makeTicket({ owner: staffId, status: "OPEN" });
    const oldCycleTicket = await makeTicket({ owner: staffId, status: "CLOSED", workCycle: 2 });
    const wrongCycleTicket = await makeTicket({ owner: staffId, status: "OPEN", workCycle: 3 });
    const activeA = await makeAction(activeTicket.id, { createdAt: new Date(now.getTime() - 20000) });
    const activeB = await makeAction(activeTicket.id, { createdAt: new Date(now.getTime() - 19000) });
    let activeLast = activeB;
    for (let index = 2; index < 11; index += 1) {
      activeLast = await makeAction(activeTicket.id, { createdAt: new Date(now.getTime() - (18 - index) * 1000) });
    }
    await makeAction(wrongCycleTicket.id, { workCycle: 1 });
    const historical = await makeAction(oldCycleTicket.id, { workCycle: 1, status: "COMPLETED", performer: staffId, completedAt: new Date(now.getTime() - 60 * 60 * 1000) });
    const completedCurrent = await makeAction(activeTicket.id, { status: "COMPLETED", performer: staffId, completedAt: new Date(now.getTime() - 30 * 60 * 1000) });

    const active = await withAuth(request(app).get("/api/staff/actions?page=1&pageSize=10"), staffAuth, false);
    expect(active.status).toBe(200);
    expect(active.body).toMatchObject({ page: 1, pageSize: 10, total: 11, totalPages: 2 });
    expect(active.body.data[0].id).toBe(activeA.id);
    const secondPage = await withAuth(request(app).get("/api/staff/actions?page=2&pageSize=10"), staffAuth, false);
    expect(secondPage.body.data[0].id).toBe(activeLast.id);
    expect(secondPage.body.data[0]).toMatchObject({ ticket: { currentStatus: "OPEN", workCycle: 1 }, workCycle: 1 });

    const windowFrom = bangkokWindowStart(now).toISOString();
    const windowThrough = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const completed = await withAuth(request(app).get("/api/staff/actions").query({ view: "completed-performed", from: windowFrom, through: windowThrough, pageSize: 20 }), staffAuth, false);
    expect(completed.status).toBe(200);
    expect(completed.body.total).toBe(2);
    expect(completed.body.data.map((row: { id: number }) => row.id)).toEqual([completedCurrent.id, historical.id]);
    expect(completed.body.data[1]).toMatchObject({ workCycle: 1, ticket: { currentStatus: "CLOSED", workCycle: 2 }, performedBy: { id: staffId } });

    expect((await withAuth(request(app).get("/api/staff/actions"), requesterAuth, false)).status).toBe(403);
    expect((await withAuth(request(app).get("/api/staff/actions"), otherStaffAuth, false)).body.total).toBe(0);
    expect((await withAuth(request(app).get("/api/staff/actions"), adminAuth, false)).status).toBe(200);
    for (const query of ["?unknown=yes", "?view=completed-performed", `?view=completed-performed&from=${windowThrough}&through=${windowFrom}`]) {
      expect((await withAuth(request(app).get(`/api/staff/actions${query}`), staffAuth, false)).status).toBe(400);
    }
    expect((await withAuth(request(app).get("/api/staff/dashboard?userId=1"), staffAuth, false)).status).toBe(400);
  });

  it("rejects missing/wrong Dashboard roles and lets Admin reuse the Staff summary", async () => {
    expect((await request(app).get("/api/requester/dashboard")).status).toBe(401);
    expect((await request(app).get("/api/staff/dashboard")).status).toBe(401);
    expect((await withAuth(request(app).get("/api/requester/dashboard"), staffAuth, false)).status).toBe(403);
    expect((await withAuth(request(app).get("/api/staff/dashboard"), requesterAuth, false)).status).toBe(403);
    const admin = await withAuth(request(app).get("/api/staff/dashboard"), adminAuth, false);
    expect(admin.status).toBe(200);
    expect(Object.keys(admin.body.metrics).sort()).toEqual(["highUrgentTickets", "myActiveActions", "myActiveTickets", "unassignedTickets"].sort());
    expect(Object.keys(admin.body.statusCounts)).toHaveLength(8);
    expect(Object.values(admin.body.statusCounts as Record<string, { value: number }>).every((row) => Number.isInteger(row.value) && row.value >= 0)).toBe(true);
  });

  it("advances only Ticket.updatedAt for successful visible activity and leaves failures, replays, and Internal Notes unchanged", async () => {
    const oldTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const ticket = await makeTicket({ status: "OPEN", updatedAt: oldTime });
    const versionOne = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { version: true, updatedAt: true } });
    const actionKey = randomUUID();
    const actionResponse = await withAuth(request(app).post(`/api/staff/tickets/${ticket.id}/actions`), staffAuth)
      .set("Idempotency-Key", actionKey)
      .send({ expectedTicketVersion: versionOne.version, description: "Review the account access" });
    expect(actionResponse.status).toBe(201);
    actionIds.push(actionResponse.body.action.id as number);
    const afterAction = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { version: true, updatedAt: true } });
    expect(afterAction.updatedAt.getTime()).toBeGreaterThan(versionOne.updatedAt.getTime());

    const replay = await withAuth(request(app).post(`/api/staff/tickets/${ticket.id}/actions`), staffAuth)
      .set("Idempotency-Key", actionKey)
      .send({ expectedTicketVersion: versionOne.version, description: "Review the account access" });
    expect(replay.status).toBe(201);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { version: true, updatedAt: true } })).toEqual(afterAction);

    const failedComment = await withAuth(request(app).post(`/api/tickets/${ticket.id}/comments`), requesterAuth).send({ body: "   " });
    expect(failedComment.status).toBe(400);
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { version: true, updatedAt: true } })).toEqual(afterAction);

    const comment = await withAuth(request(app).post(`/api/tickets/${ticket.id}/comments`), requesterAuth).send({ body: "I can access the service now." });
    expect(comment.status).toBe(201);
    const afterComment = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { version: true, updatedAt: true } });
    expect(afterComment.updatedAt.getTime()).toBeGreaterThan(afterAction.updatedAt.getTime());
    expect(afterComment.version).toBe(afterAction.version);

    const note = await withAuth(request(app).post(`/api/staff/tickets/${ticket.id}/notes`), staffAuth).send({ body: "Internal routing detail." });
    expect(note.status).toBe(201);
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { version: true, updatedAt: true } })).toEqual(afterComment);

    const indicated = await withAuth(request(app).put(`/api/tickets/${ticket.id}/resolution-indication`), requesterAuth).send({});
    expect(indicated.status).toBe(200);
    const afterIndication = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { version: true, updatedAt: true } });
    expect(afterIndication.updatedAt.getTime()).toBeGreaterThan(afterComment.updatedAt.getTime());
    expect(afterIndication.version).toBe(afterComment.version);
    expect((await withAuth(request(app).put(`/api/tickets/${ticket.id}/resolution-indication`), requesterAuth).send({})).status).toBe(409);
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { version: true, updatedAt: true } })).toEqual(afterIndication);

    const uploadBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const attachmentIds: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const added = await withAuth(request(app).post(`/api/tickets/${ticket.id}/attachments`), requesterAuth)
        .attach("file", uploadBytes, `dashboard-${index}.png`);
      expect(added.status).toBe(201);
      attachmentIds.push(added.body.id as number);
      const row = await prisma.attachment.findUniqueOrThrow({ where: { id: added.body.id }, select: { storedFilename: true } });
      uploadedFiles.push(row.storedFilename);
    }
    const afterAdds = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { version: true, updatedAt: true } });
    expect(afterAdds.updatedAt.getTime()).toBeGreaterThan(afterIndication.updatedAt.getTime());
    expect(afterAdds.version).toBe(afterIndication.version);

    const uploadDirectory = dirname(storedFilePath(uploadedFiles[0]!));
    const beforeRejectedUpload = new Set(await readdir(uploadDirectory));
    const failedUpload = await withAuth(request(app).post(`/api/tickets/${ticket.id}/attachments`), requesterAuth)
      .attach("file", uploadBytes, "dashboard-over-limit.png");
    expect(failedUpload.status).toBe(409);
    expect(await prisma.attachment.count({ where: { ticketId: ticket.id, removedAt: null } })).toBe(5);
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { version: true, updatedAt: true } })).toEqual(afterAdds);
    expect(new Set(await readdir(uploadDirectory))).toEqual(beforeRejectedUpload);

    for (const attachmentId of attachmentIds) {
      const removed = await withAuth(request(app).patch(`/api/attachments/${attachmentId}/remove`), requesterAuth).send({ removalReason: "No longer needed" });
      expect(removed.status).toBe(200);
    }
    const afterRemovals = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { version: true, updatedAt: true } });
    expect(afterRemovals.updatedAt.getTime()).toBeGreaterThan(afterAdds.updatedAt.getTime());
    expect(afterRemovals.version).toBe(afterAdds.version);
  });

  it("applies new Requester list bounds/status sets and Staff priorityRecent drilldowns without weakening legacy filters", async () => {
    const now = new Date();
    const start = bangkokWindowStart(now);
    const boundary = await makeTicket({ status: "RESOLVED", priority: "URGENT", resolvedAt: start, updatedAt: start, label: "list boundary" });
    const resolvedTieTime = new Date(now.getTime() - 60 * 60 * 1000);
    const tied = await makeTicket({ status: "CLOSED", priority: "HIGH", resolvedAt: resolvedTieTime, updatedAt: resolvedTieTime, label: "list tie" });
    const tiedPeer = await makeTicket({ status: "RESOLVED", priority: "MEDIUM", resolvedAt: resolvedTieTime, updatedAt: resolvedTieTime, label: "list tie peer" });
    await makeTicket({ status: "CLOSED", priority: "LOW", resolvedAt: null, updatedAt: now, label: "legacy null resolvedAt" });
    const urgentRecent = await makeTicket({ status: "OPEN", priority: "URGENT", updatedAt: new Date(now.getTime() - 30 * 60 * 1000), label: "urgent recent" });
    const urgentOld = await makeTicket({ status: "OPEN", priority: "URGENT", updatedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), label: "urgent old" });
    const highRecent = await makeTicket({ status: "OPEN", priority: "HIGH", updatedAt: new Date(now.getTime() - 60 * 60 * 1000), label: "high recent" });
    const highOld = await makeTicket({ status: "OPEN", priority: "HIGH", updatedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000), label: "high old" });
    const medium = await makeTicket({ status: "OPEN", priority: "MEDIUM", updatedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000), label: "medium row" });
    const low = await makeTicket({ status: "OPEN", priority: "LOW", updatedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000), label: "low row" });

    const list = await withAuth(request(app).get("/api/tickets").query({ statuses: "RESOLVED,CLOSED", resolvedFrom: start.toISOString(), resolvedThrough: now.toISOString(), sort: "resolvedAt", order: "desc", pageSize: 10 }), requesterAuth, false);
    expect(list.status).toBe(200);
    expect(list.body.data.map((row: { id: number }) => row.id)).toContain(boundary.id);
    expect(list.body.data.map((row: { id: number }) => row.id)).toContain(tied.id);
    expect(list.body.data.map((row: { id: number }) => row.id)).toEqual([tiedPeer.id, tied.id, boundary.id]);
    const resolvedAsc = await withAuth(request(app).get("/api/tickets").query({ sort: "resolvedAt", order: "asc", pageSize: 20 }), requesterAuth, false);
    const resolvedDesc = await withAuth(request(app).get("/api/tickets").query({ sort: "resolvedAt", order: "desc", pageSize: 20 }), requesterAuth, false);
    for (const rows of [resolvedAsc.body.data, resolvedDesc.body.data]) {
      const firstNull = rows.findIndex((row: { resolvedAt: string | null }) => row.resolvedAt === null);
      expect(firstNull).toBeGreaterThanOrEqual(0);
      expect(rows.slice(firstNull).every((row: { resolvedAt: string | null }) => row.resolvedAt === null)).toBe(true);
    }
    expect(resolvedDesc.body.data.findIndex((row: { id: number }) => row.id === tiedPeer.id)).toBeLessThan(resolvedDesc.body.data.findIndex((row: { id: number }) => row.id === tied.id));
    expect(resolvedAsc.body.data.findIndex((row: { id: number }) => row.id === tied.id)).toBeLessThan(resolvedAsc.body.data.findIndex((row: { id: number }) => row.id === tiedPeer.id));
    const nullDesc = resolvedDesc.body.data.filter((row: { resolvedAt: string | null }) => row.resolvedAt === null).map((row: { id: number }) => row.id);
    const nullAsc = resolvedAsc.body.data.filter((row: { resolvedAt: string | null }) => row.resolvedAt === null).map((row: { id: number }) => row.id);
    expect(nullDesc).toEqual([...nullDesc].sort((left: number, right: number) => right - left));
    expect(nullAsc).toEqual([...nullAsc].sort((left: number, right: number) => left - right));
    const sameCreatedAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const legacyTieA = await makeTicket({ status: "OPEN", createdAt: sameCreatedAt, updatedAt: sameCreatedAt, label: "legacy tie A" });
    const legacyTieB = await makeTicket({ status: "OPEN", createdAt: sameCreatedAt, updatedAt: sameCreatedAt, label: "legacy tie B" });
    const legacyList = await withAuth(request(app).get("/api/tickets").query({ status: "OPEN", sort: "createdAt", order: "desc", pageSize: 20 }), requesterAuth, false);
    expect(legacyList.body.data.findIndex((row: { id: number }) => row.id === legacyTieB.id)).toBeLessThan(legacyList.body.data.findIndex((row: { id: number }) => row.id === legacyTieA.id));
    expect((await withAuth(request(app).get("/api/tickets?status=OPEN&statuses=OPEN,CLOSED"), requesterAuth, false)).status).toBe(400);
    expect((await withAuth(request(app).get("/api/tickets?updatedFrom=2026-10-29T00:00:00"), requesterAuth, false)).status).toBe(400);
    expect((await withAuth(request(app).get("/api/tickets?surprise=1"), requesterAuth, false)).status).toBe(400);

    const staffList = await withAuth(request(app).get("/api/staff/tickets").query({ scope: "active", q: tag, itPriorities: "HIGH,URGENT", sort: "priorityRecent" }), staffAuth, false);
    expect(staffList.status).toBe(200);
    expect(staffList.body.data.map((row: { id: number }) => row.id)).toEqual([urgentRecent.id, urgentOld.id, highRecent.id, highOld.id]);
    const allPriorities = await withAuth(request(app).get("/api/staff/tickets").query({ scope: "active", q: tag, sort: "priorityRecent" }), staffAuth, false);
    expect(allPriorities.body.data.map((row: { id: number }) => row.id)).toEqual([urgentRecent.id, urgentOld.id, highRecent.id, highOld.id, medium.id, legacyTieB.id, legacyTieA.id, low.id]);
  });
});
