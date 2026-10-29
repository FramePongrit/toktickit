import os from "node:os";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Response as SupertestResponse } from "supertest";
import { Prisma, type ActionStatus, type Priority, type TicketStatus } from "@prisma/client";
import { app } from "../testApp.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/security/password.js";
import { loginAs, TEST_PASSWORD, withAuth, type AuthSessionFixture } from "../support/auth.js";

const prisma = getPrisma();
const SCHEMA = process.env.DATABASE_URL?.match(/[?&]schema=([^&]+)/)?.[1] ?? "unknown";
const DATABASE_CONTAINER = process.env.LAB4_PG_CONTAINER ?? "unspecified";
const fixtureTag = randomUUID().slice(0, 8);
const userIds: number[] = [];
const queryEvents: number[] = [];
let requesterId: number;
let staffId: number;
let categoryId: number | undefined;
let relatedSystemId: number | undefined;
let requesterAuth: AuthSessionFixture;
let staffAuth: AuthSessionFixture;
let targetValidated = false;

const statuses: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "REOPENED", "CLOSED", "CANCELLED"];
const priorities: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function chunks<T>(rows: T[], size = 500): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += size) result.push(rows.slice(offset, offset + size));
  return result;
}

function elapsedPercentile95(samples: number[]): number {
  return [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1]!;
}

function sqlParameters(values: unknown[]): unknown[] {
  return values.map((value) => value instanceof Date ? value.toISOString() : value);
}

function assertPerformanceTarget(): void {
  const connection = process.env.DATABASE_URL;
  if (!connection) throw new Error("PERF-01 requires an explicit isolated DATABASE_URL.");
  const url = new URL(connection);
  const schema = url.searchParams.get("schema");
  if (url.hostname !== "127.0.0.1" || url.port !== "55434" || url.pathname !== "/lab4test"
    || schema !== "lab4_issue89_perf" || process.env.LAB4_PG_CONTAINER !== "toktickit-lab4-issue85-test") {
    throw new Error("PERF-01 is restricted to the dedicated loopback PostgreSQL test container and lab4_issue89_perf schema.");
  }
  targetValidated = true;
}

beforeAll(async () => {
  assertPerformanceTarget();
  const [existingTickets, existingActions, existingUsers, existingCategories, existingSystems] = await Promise.all([
    prisma.ticket.count(), prisma.actionTaken.count(), prisma.user.count(), prisma.category.count(), prisma.relatedSystem.count(),
  ]);
  if (existingTickets || existingActions || existingUsers || existingCategories || existingSystems) {
    throw new Error(`PERF-01 requires a fresh task-owned schema; ${SCHEMA} was not empty.`);
  }

  (prisma as unknown as { $on: (event: "query", callback: (query: { duration: number }) => void) => void })
    .$on("query", (event) => queryEvents.push(event.duration));
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const requester = await prisma.user.create({ data: { fullName: `PERF Requester ${fixtureTag}`, email: `perf-requester-${fixtureTag}@example.test`, passwordHash } });
  requesterId = requester.id;
  userIds.push(requesterId);
  const staff = await prisma.user.create({ data: { fullName: `PERF Staff ${fixtureTag}`, email: `perf-staff-${fixtureTag}@example.test`, role: "STAFF", passwordHash } });
  staffId = staff.id;
  userIds.push(staffId);
  const category = await prisma.category.create({ data: { name: `PERF category ${fixtureTag}` } });
  categoryId = category.id;
  const system = await prisma.relatedSystem.create({ data: { name: `PERF system ${fixtureTag}` } });
  relatedSystemId = system.id;
  const perfCategoryId = category.id;
  const perfSystemId = system.id;
  [requesterAuth, staffAuth] = await Promise.all([loginAs(requester.email), loginAs(staff.email)]);

  const now = new Date();
  const createdAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const tickets = Array.from({ length: 1000 }, (_, index) => {
    const currentStatus = statuses[index % statuses.length]!;
    const workCycle = index % 2 === 0 ? 2 : 1;
    return {
      ticketNumber: `P89-${fixtureTag}-${String(index + 1).padStart(4, "0")}`,
      requesterId,
      categoryId: perfCategoryId,
      relatedSystemId: perfSystemId,
      requestedPriority: priorities[index % priorities.length]!,
      itPriority: priorities[index % priorities.length]!,
      ownerId: index % 2 === 0 ? staffId : null,
      summary: `PERF Ticket ${index + 1}`,
      description: "Synthetic PERF-01 row.",
      currentStatus,
      workCycle,
      resolvedAt: currentStatus === "RESOLVED" || currentStatus === "CLOSED"
        ? new Date(now.getTime() - (index % 6) * 24 * 60 * 60 * 1000)
        : null,
      createdAt: new Date(createdAt.getTime() - (index % 30) * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now.getTime() - (index % 24) * 60 * 60 * 1000),
    };
  });
  await prisma.ticket.createMany({ data: tickets });
  const parentRows = await prisma.ticket.findMany({ orderBy: { id: "asc" }, select: { id: true, workCycle: true, currentStatus: true, createdAt: true } });

  const actionRows: Prisma.ActionTakenCreateManyInput[] = [];
  for (const [index, ticket] of parentRows.entries()) {
    for (let slot = 0; slot < 5; slot += 1) {
      const status: ActionStatus = slot === 0 || slot === 4 ? "PLANNED" : slot === 1 ? "IN_PROGRESS" : "COMPLETED";
      const completedAt = status === "COMPLETED"
        ? new Date(now.getTime() - (index % 6) * 24 * 60 * 60 * 1000)
        : null;
      actionRows.push({
        ticketId: ticket.id,
        workCycle: slot === 3 && ticket.workCycle === 2 ? 1 : ticket.workCycle,
        status,
        description: `PERF action ${index + 1}.${slot + 1}`,
        result: status === "COMPLETED" ? "Synthetic completion result." : null,
        actionAt: new Date(ticket.createdAt.getTime() + 24 * 60 * 60 * 1000),
        assigneeId: staffId,
        createdById: staffId,
        performedById: status === "COMPLETED" ? staffId : null,
        followUpRequired: false,
        version: 1,
        createdAt: ticket.createdAt,
        updatedAt: completedAt ?? ticket.createdAt,
        completedAt,
      });
    }
  }
  for (const batch of chunks(actionRows)) await prisma.actionTaken.createMany({ data: batch });
  const actions = await prisma.actionTaken.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, workCycle: true, ticketId: true } });

  const revisions: Prisma.ActionRevisionCreateManyInput[] = actions.map((action) => ({
    actionId: action.id,
    sequence: 1,
    operation: "CREATE",
    actorId: staffId,
    after: { status: action.status, workCycle: action.workCycle, synthetic: true },
  }));
  for (const batch of chunks(revisions)) await prisma.actionRevision.createMany({ data: batch });
  await prisma.ticketWorkflowEvent.createMany({ data: parentRows.map((ticket) => ({
    ticketId: ticket.id,
    workCycle: ticket.workCycle,
    kind: "BASELINE",
    fromStatus: null,
    toStatus: ticket.currentStatus,
    actorId: null,
    ticketVersion: 1,
  })) });

  const cardinality = await Promise.all([
    prisma.ticket.count(), prisma.actionTaken.count(), prisma.actionRevision.count(), prisma.ticketWorkflowEvent.count(),
  ]);
  expect(cardinality).toEqual([1000, 5000, 5000, 1000]);
  await prisma.$executeRawUnsafe('ANALYZE "Ticket"');
  await prisma.$executeRawUnsafe('ANALYZE "ActionTaken"');
  queryEvents.length = 0;
}, 120_000);

afterAll(async () => {
  try {
    if (!targetValidated) return;
    const ownedTicketRows = await prisma.ticket.findMany({ where: { ticketNumber: { startsWith: `P89-${fixtureTag}-` } }, select: { id: true } });
    const ownedTicketIds = ownedTicketRows.map(({ id }) => id);
    const ownedActions = ownedTicketIds.length
      ? await prisma.actionTaken.findMany({ where: { ticketId: { in: ownedTicketIds } }, select: { id: true } })
      : [];
    const ownedActionIds = ownedActions.map(({ id }) => id);
    if (ownedTicketIds.length) await prisma.ticketWorkflowEvent.deleteMany({ where: { ticketId: { in: ownedTicketIds } } });
    if (ownedActionIds.length) await prisma.actionRevision.deleteMany({ where: { actionId: { in: ownedActionIds } } });
    if (ownedTicketIds.length) await prisma.actionTaken.deleteMany({ where: { ticketId: { in: ownedTicketIds } } });
    if (ownedTicketIds.length) await prisma.ticket.deleteMany({ where: { id: { in: ownedTicketIds } } });
    if (userIds.length) await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
    if (categoryId !== undefined) await prisma.category.deleteMany({ where: { id: categoryId } });
    if (relatedSystemId !== undefined) await prisma.relatedSystem.deleteMany({ where: { id: relatedSystemId } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await prisma.$disconnect();
  }
});

describe("Issue #89 PERF-01 isolated Dashboard query budget", () => {
  it("measures seven authenticated endpoints over exactly 1000 Tickets and 5000 Actions", async () => {
    const pgInfo = await prisma.$queryRaw<{ version: string; schema: string }[]>`SELECT version() AS version, current_schema() AS schema`;
    const requesterSnapshot = await withAuth(request(app).get("/api/requester/dashboard"), requesterAuth, false);
    const staffSnapshot = await withAuth(request(app).get("/api/staff/dashboard"), staffAuth, false);
    expect(requesterSnapshot.status).toBe(200);
    expect(staffSnapshot.status).toBe(200);

    const from = requesterSnapshot.body.window.from as string;
    const through = requesterSnapshot.body.generatedAt as string;
    const requesterSql = Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED'))::int AS open,
        COUNT(*) FILTER (WHERE "currentStatus" = 'WAITING_FOR_REQUESTER')::int AS waiting,
        COUNT(*) FILTER (WHERE "updatedAt" >= ${new Date(from)} AND "updatedAt" <= ${new Date(through)})::int AS updated,
        COUNT(*) FILTER (WHERE "currentStatus" IN ('RESOLVED','CLOSED') AND "resolvedAt" >= ${new Date(from)} AND "resolvedAt" <= ${new Date(through)})::int AS resolved
      FROM "Ticket" WHERE "requesterId" = ${requesterId}
    `;
    const requesterSqlResult = (await prisma.$queryRaw<{ open: number; waiting: number; updated: number; resolved: number }[]>(requesterSql))[0]!;
    expect(requesterSnapshot.body.metrics).toMatchObject({
      openTickets: { value: requesterSqlResult.open },
      waitingForMe: { value: requesterSqlResult.waiting },
      recentlyUpdated: { value: requesterSqlResult.updated },
      recentlyResolved: { value: requesterSqlResult.resolved },
    });

    const staffSql = Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED') AND "ownerId" IS NULL)::int AS unassigned,
        COUNT(*) FILTER (WHERE "currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED') AND "ownerId" = ${staffId})::int AS mine,
        COUNT(*) FILTER (WHERE "currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED') AND "itPriority" IN ('HIGH','URGENT'))::int AS high_urgent
      FROM "Ticket"
    `;
    const staffSqlResult = (await prisma.$queryRaw<{ unassigned: number; mine: number; high_urgent: number }[]>(staffSql))[0]!;
    const statusQuery = Prisma.sql`SELECT "currentStatus" AS status, COUNT(*)::int AS count FROM "Ticket" GROUP BY "currentStatus"`;
    const statusSql = await prisma.$queryRaw<{ status: TicketStatus; count: number }[]>(statusQuery);
    const actionSql = Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE a."assigneeId" = ${staffId} AND a."status" IN ('PLANNED','IN_PROGRESS') AND a."workCycle" = t."workCycle" AND t."currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED'))::int AS active_assigned,
        COUNT(*) FILTER (WHERE a."performedById" = ${staffId} AND a."status" = 'COMPLETED' AND a."completedAt" >= ${new Date(from)} AND a."completedAt" <= ${new Date(through)})::int AS completed_performed
      FROM "ActionTaken" a JOIN "Ticket" t ON t.id = a."ticketId"
    `;
    const actionSqlResult = (await prisma.$queryRaw<{ active_assigned: number; completed_performed: number }[]>(actionSql))[0]!;
    expect(staffSnapshot.body.metrics).toMatchObject({
      unassignedTickets: { value: staffSqlResult.unassigned },
      myActiveTickets: { value: staffSqlResult.mine },
      highUrgentTickets: { value: staffSqlResult.high_urgent },
      myActiveActions: { value: actionSqlResult.active_assigned },
    });
    for (const row of statusSql) expect(staffSnapshot.body.statusCounts[row.status].value).toBe(row.count);

    const updatedPath = new URL(requesterSnapshot.body.metrics.recentlyUpdated.href, "http://local.test").search;
    const resolvedPath = new URL(requesterSnapshot.body.metrics.recentlyResolved.href, "http://local.test").search;
    const priorityPath = new URL(staffSnapshot.body.previews.priorityRecentTickets.href, "http://local.test").search;
    const actionFrom = encodeURIComponent(from);
    const actionThrough = encodeURIComponent(through);
    const activeTicketCount = staffSqlResult.unassigned + staffSqlResult.mine;
    const endpoints: Array<{ name: string; run: () => request.Test; verify: (response: SupertestResponse) => void }> = [
      { name: "requester.dashboard", run: () => withAuth(request(app).get("/api/requester/dashboard"), requesterAuth, false), verify: (response) => {
        expect(response.body.metrics).toMatchObject({
          openTickets: { value: requesterSqlResult.open, unit: "tickets" },
          waitingForMe: { value: requesterSqlResult.waiting, unit: "tickets" },
          recentlyUpdated: { value: requesterSqlResult.updated, unit: "tickets" },
          recentlyResolved: { value: requesterSqlResult.resolved, unit: "tickets" },
        });
        const updated = new URL(response.body.metrics.recentlyUpdated.href, "http://local.test");
        const resolved = new URL(response.body.metrics.recentlyResolved.href, "http://local.test");
        expect(updated.searchParams.get("updatedFrom")).toBe(response.body.window.from);
        expect(updated.searchParams.get("updatedThrough")).toBe(response.body.generatedAt);
        expect(resolved.searchParams.get("resolvedFrom")).toBe(response.body.window.from);
        expect(resolved.searchParams.get("resolvedThrough")).toBe(response.body.generatedAt);
        expect(resolved.searchParams.get("statuses")).toBe("RESOLVED,CLOSED");
      } },
      { name: "staff.dashboard", run: () => withAuth(request(app).get("/api/staff/dashboard"), staffAuth, false), verify: (response) => {
        expect(response.body.metrics).toMatchObject(staffSnapshot.body.metrics);
        for (const row of statusSql) expect(response.body.statusCounts[row.status].value).toBe(row.count);
      } },
      { name: "requester.recent-updates", run: () => withAuth(request(app).get(`/api/tickets${updatedPath}`), requesterAuth, false), verify: (response) => expect(response.body.total).toBe(requesterSqlResult.updated) },
      { name: "requester.resolutions", run: () => withAuth(request(app).get(`/api/tickets${resolvedPath}`), requesterAuth, false), verify: (response) => expect(response.body.total).toBe(requesterSqlResult.resolved) },
      { name: "staff.priority-recent", run: () => withAuth(request(app).get(`/api/staff/tickets${priorityPath}`), staffAuth, false), verify: (response) => {
        expect(response.body.total).toBe(activeTicketCount);
        expect(response.body.data.length).toBeGreaterThan(0);
      } },
      { name: "staff.active-assigned-actions", run: () => withAuth(request(app).get("/api/staff/actions?view=active-assigned&pageSize=20"), staffAuth, false), verify: (response) => {
        expect(response.body.total).toBe(actionSqlResult.active_assigned);
        expect(response.body.data.length).toBe(20);
      } },
      { name: "staff.completed-performed-actions", run: () => withAuth(request(app).get(`/api/staff/actions?view=completed-performed&from=${actionFrom}&through=${actionThrough}&pageSize=20`), staffAuth, false), verify: (response) => {
        expect(response.body.total).toBe(actionSqlResult.completed_performed);
        expect(response.body.data.length).toBe(20);
      } },
    ];

    const measurements: Record<string, { warmups: number; samplesMs: number[]; p95Ms: number; firstMeasuredQueryCount: number }> = {};
    for (const endpoint of endpoints) {
      for (let index = 0; index < 3; index += 1) {
        const warmup = await endpoint.run();
        expect(warmup.status).toBe(200);
        endpoint.verify(warmup);
      }
      const samplesMs: number[] = [];
      let firstMeasuredQueryCount = 0;
      for (let index = 0; index < 20; index += 1) {
        const queryOffset = queryEvents.length;
        const started = performance.now();
        const response = await endpoint.run();
        samplesMs.push(Number((performance.now() - started).toFixed(2)));
        expect(response.status).toBe(200);
        endpoint.verify(response);
        if (index === 0) firstMeasuredQueryCount = queryEvents.length - queryOffset;
      }
      expect(firstMeasuredQueryCount, `${endpoint.name} must execute database queries`).toBeGreaterThan(0);
      const p95Ms = elapsedPercentile95(samplesMs);
      expect(p95Ms, `${endpoint.name} p95 must be <= 2000ms`).toBeLessThanOrEqual(2000);
      measurements[endpoint.name] = { warmups: 3, samplesMs, p95Ms, firstMeasuredQueryCount };
    }

    const plans = {
      requesterRecent: await prisma.$queryRaw<{ "QUERY PLAN": string }[]>(Prisma.sql`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
        SELECT "id", "ticketNumber", "summary", "currentStatus", "itPriority", "updatedAt", "resolvedAt"
        FROM "Ticket" WHERE "requesterId" = ${requesterId} AND "updatedAt" >= ${new Date(from)} AND "updatedAt" <= ${new Date(through)}
        ORDER BY "updatedAt" DESC, "id" DESC LIMIT 5
      `),
      activeActions: await prisma.$queryRaw<{ "QUERY PLAN": string }[]>(Prisma.sql`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
        SELECT a."id" FROM "ActionTaken" a JOIN "Ticket" t ON t."id" = a."ticketId"
        WHERE a."assigneeId" = ${staffId} AND a."status" IN ('PLANNED'::"ActionStatus",'IN_PROGRESS'::"ActionStatus")
          AND a."workCycle" = t."workCycle" AND t."currentStatus" IN ('NEW'::"TicketStatus",'OPEN'::"TicketStatus",'IN_PROGRESS'::"TicketStatus",'WAITING_FOR_REQUESTER'::"TicketStatus",'REOPENED'::"TicketStatus")
        ORDER BY a."createdAt" ASC, a."id" ASC LIMIT 20
      `),
      completedActions: await prisma.$queryRaw<{ "QUERY PLAN": string }[]>(Prisma.sql`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
        SELECT a."id", a."ticketId", a."status", a."completedAt" FROM "ActionTaken" a
        WHERE a."performedById" = ${staffId} AND a."status" = 'COMPLETED'::"ActionStatus" AND a."completedAt" >= ${new Date(from)} AND a."completedAt" <= ${new Date(through)}
        ORDER BY a."completedAt" DESC, a."id" DESC LIMIT 20
      `),
    };
    const plansAsText = Object.fromEntries(Object.entries(plans).map(([key, rows]) => [key, rows.map((row) => row["QUERY PLAN"])]));
    const database = await prisma.$queryRaw<{ tickets: number; actions: number; revisions: number; events: number }[]>`
      SELECT
        (SELECT COUNT(*)::int FROM "Ticket") AS tickets,
        (SELECT COUNT(*)::int FROM "ActionTaken") AS actions,
        (SELECT COUNT(*)::int FROM "ActionRevision") AS revisions,
        (SELECT COUNT(*)::int FROM "TicketWorkflowEvent") AS events
    `;
    const evidence = {
      protocol: "3 sequential warmups, 20 sequential complete HTTP samples, p95 nearest-rank (19th of 20); threshold <= 2000 ms",
      environment: {
        schema: SCHEMA,
        container: DATABASE_CONTAINER,
        endpoint: "127.0.0.1:55434 PostgreSQL 16 disposable local container",
        node: process.version,
        platform: `${process.platform}/${process.arch}`,
        cpuCount: os.cpus().length,
        totalMemoryBytes: os.totalmem(),
        postgres: pgInfo[0]?.version,
        currentSchema: pgInfo[0]?.schema,
      },
      cardinality: database[0],
      independentSqlComparisons: {
        requester: { sql: requesterSql.text, parameters: sqlParameters(requesterSql.values), sqlResult: requesterSqlResult, apiCards: requesterSnapshot.body.metrics },
        staffTickets: { sql: staffSql.text, parameters: sqlParameters(staffSql.values), sqlResult: staffSqlResult, apiCards: staffSnapshot.body.metrics },
        actionCounts: { sql: actionSql.text, parameters: sqlParameters(actionSql.values), sqlResult: actionSqlResult, apiActiveCard: staffSnapshot.body.metrics.myActiveActions.value },
        statusCounts: { sql: statusQuery.text, parameters: sqlParameters(statusQuery.values), sqlResult: statusSql, apiCards: staffSnapshot.body.statusCounts },
      },
      measurements,
      representativeExplainAnalyzeBuffers: plansAsText,
    };
    console.info("PERF-01 sanitized evidence", JSON.stringify(evidence));
  }, 300_000);
});
