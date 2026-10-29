import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../testApp.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/security/password.js";
import { loginAs, TEST_PASSWORD, withAuth, type AuthSessionFixture } from "../support/auth.js";
import { setActionLockTestHook } from "../../src/services/actions.service.js";
import { setIdempotencyLockTestHook } from "../../src/lib/idempotency.js";
import { setStaffTicketOperationsLockTestHook } from "../../src/services/staffTicketOperations.service.js";

const prisma = getPrisma();
const suiteTag = randomUUID().slice(0, 8);
let requesterId: number;
let staffId: number;
let categoryId: number;
let relatedSystemId: number;
let staffAuth: AuthSessionFixture;
const ticketIds: number[] = [];
const userIds: number[] = [];

async function makeTicket(ownerId: number | null = staffId) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-2026-L4I-${suiteTag}-${randomUUID().slice(0, 6)}`,
      requesterId,
      categoryId,
      relatedSystemId,
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "OPEN",
      ownerId,
      summary: "Lab 4 idempotency fixture",
      description: "A task-owned idempotency test Ticket.",
    },
  });
  ticketIds.push(ticket.id);
  return ticket;
}

function actionCreate(ticketId: number, key: string, body: object) {
  return withAuth(request(app).post(`/api/staff/tickets/${ticketId}/actions`), staffAuth)
    .set("Idempotency-Key", key)
    .send(body);
}

function ticketStatus(ticketId: number, key: string, body: object) {
  return withAuth(request(app).patch(`/api/staff/tickets/${ticketId}/status`), staffAuth)
    .set("Idempotency-Key", key)
    .send(body);
}

async function waitForAdvisoryLockWait(): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const waits = await prisma.$queryRaw<{ pid: number }[]>`
      SELECT pid
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND wait_event_type = 'Lock'
        AND query ILIKE '%pg_advisory_xact_lock%'
    `;
    if (waits.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("No PostgreSQL backend entered an advisory-lock wait.");
}

beforeAll(async () => {
  const [category, relatedSystem] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { active: true }, orderBy: { id: "asc" } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { active: true }, orderBy: { id: "asc" } }),
  ]);
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const [requester, staff] = await Promise.all([
    prisma.user.create({ data: { fullName: `Idempotency Requester ${suiteTag}`, email: `l4i.req.${suiteTag}@example.test`, passwordHash } }),
    prisma.user.create({ data: { fullName: `Idempotency Staff ${suiteTag}`, email: `l4i.staff.${suiteTag}@example.test`, role: "STAFF", passwordHash } }),
  ]);
  requesterId = requester.id;
  staffId = staff.id;
  userIds.push(requesterId, staffId);
  staffAuth = await loginAs(staff.email);
});

afterAll(async () => {
  setIdempotencyLockTestHook(undefined);
  setActionLockTestHook(undefined);
  setStaffTicketOperationsLockTestHook(undefined);
  await prisma.idempotencyRecord.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.ticketWorkflowEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.actionRevision.deleteMany({ where: { action: { ticketId: { in: ticketIds } } } });
  await prisma.actionTaken.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.publicComment.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("API-I01 — serialized idempotent writes", () => {
  it("concurrently creates one Action and replays its committed response after waiting", async () => {
    const ticket = await makeTicket(null);
    const key = randomUUID();
    const body = { expectedTicketVersion: 1, description: "Inspect connectivity" };
    let releaseFirst!: () => void;
    let firstLocked!: () => void;
    const firstMayContinue = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstHasLock = new Promise<void>((resolve) => { firstLocked = resolve; });
    let lockHookCalls = 0;
    setIdempotencyLockTestHook(async (context) => {
      if (context.canonicalPath !== `/staff/tickets/${ticket.id}/actions`) return;
      lockHookCalls += 1;
      if (lockHookCalls === 1) {
        firstLocked();
        await firstMayContinue;
      }
    });
    try {
      const first = actionCreate(ticket.id, key, body);
      void first.then(() => undefined, () => undefined);
      await firstHasLock;
      const second = actionCreate(ticket.id, key, { description: body.description, expectedTicketVersion: 1 });
      void second.then(() => undefined, () => undefined);
      await waitForAdvisoryLockWait();
      releaseFirst();
      const [winner, replay] = await Promise.all([first, second]);
      expect(winner.status).toBe(201);
      expect(replay.status).toBe(201);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.body).toEqual(winner.body);
      expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(1);
      expect(await prisma.actionRevision.count({ where: { action: { ticketId: ticket.id } } })).toBe(1);
      expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).version).toBe(2);
    } finally {
      releaseFirst();
      setIdempotencyLockTestHook(undefined);
    }
  });

  it("concurrently commits a Waiting transition and public comment once; changed payload conflicts before mutable guards", async () => {
    const ticket = await makeTicket();
    const key = randomUUID();
    let releaseFirst!: () => void;
    let firstLocked!: () => void;
    const firstMayContinue = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstHasLock = new Promise<void>((resolve) => { firstLocked = resolve; });
    let lockHookCalls = 0;
    setIdempotencyLockTestHook(async (context) => {
      if (context.canonicalPath !== `/staff/tickets/${ticket.id}/status`) return;
      lockHookCalls += 1;
      if (lockHookCalls === 1) {
        firstLocked();
        await firstMayContinue;
      }
    });
    try {
      const first = ticketStatus(ticket.id, key, { expectedTicketVersion: 1, status: "WAITING_FOR_REQUESTER", publicComment: "Please confirm." });
      void first.then(() => undefined, () => undefined);
      await firstHasLock;
      const second = ticketStatus(ticket.id, key, { publicComment: "Please confirm.", status: "WAITING_FOR_REQUESTER", expectedTicketVersion: 1 });
      void second.then(() => undefined, () => undefined);
      await waitForAdvisoryLockWait();
      releaseFirst();
      const [winner, replay] = await Promise.all([first, second]);
      expect(winner.status).toBe(200);
      expect(replay.status).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.body).toEqual(winner.body);
      expect(await prisma.publicComment.count({ where: { ticketId: ticket.id } })).toBe(1);
      expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).version).toBe(2);

      const changed = await ticketStatus(ticket.id, key, { expectedTicketVersion: 1, status: "OPEN" });
      expect(changed.status).toBe(409);
      expect(changed.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    } finally {
      releaseFirst();
      setIdempotencyLockTestHook(undefined);
    }
  });

  it("rolls back an injected post-effect failure and permits the same key to succeed", async () => {
    const ticket = await makeTicket();
    const key = randomUUID();
    let injected = false;
    setStaffTicketOperationsLockTestHook(async (context) => {
      if (context.ticketId === ticket.id && context.operation === "STATUS_AFTER_WAITING_COMMENT" && !injected) {
        injected = true;
        throw new Error("injected transaction failure");
      }
    });
    try {
      const body = { expectedTicketVersion: 1, status: "WAITING_FOR_REQUESTER", publicComment: "Need details." };
      const failed = await ticketStatus(ticket.id, key, body);
      expect(failed.status).toBe(500);
      expect(await prisma.publicComment.count({ where: { ticketId: ticket.id } })).toBe(0);
      expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).version).toBe(1);
      expect(await prisma.idempotencyRecord.count({ where: { userId: staffId, key } })).toBe(0);

      setStaffTicketOperationsLockTestHook(undefined);
      const retry = await ticketStatus(ticket.id, key, body);
      expect(retry.status).toBe(200);
      expect(await prisma.publicComment.count({ where: { ticketId: ticket.id } })).toBe(1);
      expect(await prisma.idempotencyRecord.count({ where: { userId: staffId, key } })).toBe(1);
    } finally {
      setStaffTicketOperationsLockTestHook(undefined);
    }
  });

  it("rolls back Action create history and version on failure, then replays a successful transition", async () => {
    const ticket = await makeTicket(null);
    const key = randomUUID();
    let injected = false;
    setActionLockTestHook(async (context) => {
      if (context.ticketId === ticket.id && context.operation === "ACTION_AFTER_WRITE" && !injected) {
        injected = true;
        throw new Error("injected Action transaction failure");
      }
    });
    try {
      const body = { expectedTicketVersion: 1, description: "Inspect the connection" };
      const failed = await actionCreate(ticket.id, key, body);
      expect(failed.status).toBe(500);
      expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(0);
      expect(await prisma.actionRevision.count({ where: { action: { ticketId: ticket.id } } })).toBe(0);
      expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).version).toBe(1);
      expect(await prisma.idempotencyRecord.count({ where: { userId: staffId, key } })).toBe(0);

      setActionLockTestHook(undefined);
      const created = await actionCreate(ticket.id, key, body);
      expect(created.status).toBe(201);
      const actionId = created.body.action.id as number;
      const transitionKey = randomUUID();
      const transitionBody = { expectedTicketVersion: 2, expectedActionVersion: 1, status: "IN_PROGRESS" };
      const transitioned = await withAuth(request(app).post(`/api/staff/tickets/${ticket.id}/actions/${actionId}/transitions`), staffAuth)
        .set("Idempotency-Key", transitionKey)
        .send(transitionBody);
      expect(transitioned.status).toBe(200);
      const replay = await withAuth(request(app).post(`/api/staff/tickets/${ticket.id}/actions/${actionId}/transitions`), staffAuth)
        .set("Idempotency-Key", transitionKey)
        .send({ status: "IN_PROGRESS", expectedActionVersion: 1, expectedTicketVersion: 2 });
      expect(replay.status).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.body).toEqual(transitioned.body);
      expect(await prisma.actionRevision.count({ where: { actionId } })).toBe(2);
    } finally {
      setActionLockTestHook(undefined);
    }
  });

  it("rechecks authentication when a live status request waits on the idempotency scope lock", async () => {
    const ticket = await makeTicket();
    const key = randomUUID();
    const body = { expectedTicketVersion: 1, status: "IN_PROGRESS" };
    const success = await ticketStatus(ticket.id, key, body);
    expect(success.status).toBe(200);

    let releaseFirst!: () => void;
    let firstHasLock!: () => void;
    const firstMayContinue = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstLocked = new Promise<void>((resolve) => { firstHasLock = resolve; });
    let hookCalls = 0;
    setIdempotencyLockTestHook(async (context) => {
      if (context.canonicalPath !== `/staff/tickets/${ticket.id}/status`) return;
      hookCalls += 1;
      if (hookCalls === 1) {
        firstHasLock();
        await firstMayContinue;
      }
    });

    try {
      const lockHolder = ticketStatus(ticket.id, key, body);
      void lockHolder.then(() => undefined, () => undefined);
      await firstLocked;
      const waitingReplay = ticketStatus(ticket.id, key, body);
      void waitingReplay.then(() => undefined, () => undefined);
      await waitForAdvisoryLockWait();

      // The replay has passed HTTP authentication and is now waiting on the same
      // transaction-scoped scope lock. Revocation must be observed after it wakes.
      await prisma.authSession.updateMany({ where: { userId: staffId, revokedAt: null }, data: { revokedAt: new Date() } });
      releaseFirst();
      const [holderResult, replayResult] = await Promise.all([lockHolder, waitingReplay]);
      for (const response of [holderResult, replayResult]) {
        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe("UNAUTHENTICATED");
      }
      expect(hookCalls).toBe(2);
      expect(await prisma.publicComment.count({ where: { ticketId: ticket.id } })).toBe(0);
      expect(await prisma.idempotencyRecord.count({ where: { userId: staffId, key } })).toBe(1);
      expect(await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { currentStatus: true, version: true } })).toEqual({
        currentStatus: "IN_PROGRESS",
        version: 2,
      });
    } finally {
      releaseFirst();
      setIdempotencyLockTestHook(undefined);
    }
  });
});
