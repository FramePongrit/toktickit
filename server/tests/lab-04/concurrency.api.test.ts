import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Prisma } from "@prisma/client";
import { app } from "../testApp.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/security/password.js";
import { loginAs, TEST_PASSWORD, withAuth, type AuthSessionFixture } from "../support/auth.js";
import { setActionLockTestHook } from "../../src/services/actions.service.js";
import { setAdminUsersLockTestHook } from "../../src/services/adminUsers.service.js";
import { setStaffTicketOperationsLockTestHook } from "../../src/services/staffTicketOperations.service.js";

const prisma = getPrisma();
const suiteTag = randomUUID().slice(0, 8);
let requesterId: number;
let staffAId: number;
let staffBId: number;
let categoryId: number;
let relatedSystemId: number;
let staffAAuth: AuthSessionFixture;
let staffBAuth: AuthSessionFixture;
const userIds: number[] = [];
const ticketIds: number[] = [];

async function makeTicket(ownerId: number | null = null) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-2026-L4C-${suiteTag}-${randomUUID().slice(0, 6)}`,
      requesterId,
      categoryId,
      relatedSystemId,
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "OPEN",
      ownerId,
      summary: "Lab 4 concurrency fixture",
      description: "A task-owned concurrent write Ticket.",
    },
  });
  ticketIds.push(ticket.id);
  return ticket;
}

async function waitForBackendLockWait(backendPid: number): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<{ wait_event_type: string | null }[]>`
      SELECT wait_event_type
      FROM pg_stat_activity
      WHERE pid = ${backendPid}
    `;
    if (rows[0]?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`PostgreSQL backend ${backendPid} did not enter a lock wait.`);
}

function lockTicket(tx: Prisma.TransactionClient, ticketId: number) {
  return tx.$queryRaw`SELECT "id" FROM "Ticket" WHERE "id" = ${ticketId} FOR UPDATE`;
}

beforeAll(async () => {
  const [category, relatedSystem] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { active: true }, orderBy: { id: "asc" } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { active: true }, orderBy: { id: "asc" } }),
  ]);
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const [requester, staffA, staffB] = await Promise.all([
    prisma.user.create({ data: { fullName: `Concurrency Requester ${suiteTag}`, email: `l4c.req.${suiteTag}@example.test`, passwordHash } }),
    prisma.user.create({ data: { fullName: `Concurrency Staff A ${suiteTag}`, email: `l4c.staff.a.${suiteTag}@example.test`, role: "STAFF", passwordHash } }),
    prisma.user.create({ data: { fullName: `Concurrency Staff B ${suiteTag}`, email: `l4c.staff.b.${suiteTag}@example.test`, role: "STAFF", passwordHash } }),
  ]);
  requesterId = requester.id;
  staffAId = staffA.id;
  staffBId = staffB.id;
  userIds.push(requesterId, staffAId, staffBId);
  [staffAAuth, staffBAuth] = await Promise.all([loginAs(staffA.email), loginAs(staffB.email)]);
});

afterAll(async () => {
  setActionLockTestHook(undefined);
  setAdminUsersLockTestHook(undefined);
  setStaffTicketOperationsLockTestHook(undefined);
  await prisma.idempotencyRecord.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.actionRevision.deleteMany({ where: { action: { ticketId: { in: ticketIds } } } });
  await prisma.actionTaken.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("API-C01 / API-C02 — operational concurrency", () => {
  it("serializes competing Ticket writes and preserves the same-value Priority no-op", async () => {
    const ticket = await makeTicket();
    let releaseBlocker!: () => void;
    let parentLocked!: () => void;
    const blockerMayCommit = new Promise<void>((resolve) => { releaseBlocker = resolve; });
    const parentLockReady = new Promise<void>((resolve) => { parentLocked = resolve; });
    const parentBlocker = prisma.$transaction(async (tx) => {
      await lockTicket(tx, ticket.id);
      parentLocked();
      await blockerMayCommit;
    });
    await parentLockReady;

    const pendingPids: number[] = [];
    let releaseWriters!: () => void;
    let bothWritersReady!: () => void;
    const writersMayContinue = new Promise<void>((resolve) => { releaseWriters = resolve; });
    const bothAtBoundary = new Promise<void>((resolve) => { bothWritersReady = resolve; });
    setStaffTicketOperationsLockTestHook(async (context) => {
      if (context.ticketId !== ticket.id || context.operation !== "IT_PRIORITY_BEFORE_PARENT_LOCK") return;
      pendingPids.push(context.backendPid);
      if (pendingPids.length === 2) bothWritersReady();
      await writersMayContinue;
    });
    const first = withAuth(request(app).patch(`/api/staff/tickets/${ticket.id}/it-priority`), staffAAuth)
      .send({ itPriority: "HIGH", expectedTicketVersion: 1 });
    const second = withAuth(request(app).patch(`/api/staff/tickets/${ticket.id}/it-priority`), staffBAuth)
      .send({ itPriority: "URGENT", expectedTicketVersion: 1 });
    void first.then(() => undefined, () => undefined);
    void second.then(() => undefined, () => undefined);
    try {
      await bothAtBoundary;
      releaseWriters();
      await Promise.all(pendingPids.map(waitForBackendLockWait));
      releaseBlocker();
      const results = await Promise.all([first, second]);
      expect(results.filter((result) => result.status === 200)).toHaveLength(1);
      const stale = results.find((result) => result.status === 409);
      expect(stale?.body.error).toMatchObject({ code: "STALE_TICKET_VERSION", meta: { currentVersion: 2 } });
      const saved = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(["HIGH", "URGENT"]).toContain(saved.itPriority);
      expect(saved.version).toBe(2);
      const stableUpdatedAt = saved.updatedAt;

      const noOp = await withAuth(request(app).patch(`/api/staff/tickets/${ticket.id}/it-priority`), staffAAuth)
        .send({ itPriority: saved.itPriority, expectedTicketVersion: 2 });
      expect(noOp.status).toBe(200);
      expect(noOp.body).toEqual({ itPriority: saved.itPriority, ticketVersion: 2 });
      const afterNoOp = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(afterNoOp.version).toBe(2);
      expect(afterNoOp.updatedAt).toEqual(stableUpdatedAt);
      const staleNoOp = await withAuth(request(app).patch(`/api/staff/tickets/${ticket.id}/it-priority`), staffAAuth)
        .send({ itPriority: saved.itPriority, expectedTicketVersion: 1 });
      expect(staleNoOp.status).toBe(409);
      expect(staleNoOp.body.error.code).toBe("STALE_TICKET_VERSION");
    } finally {
      releaseWriters();
      releaseBlocker();
      setStaffTicketOperationsLockTestHook(undefined);
      await parentBlocker.catch(() => undefined);
    }
  });

  it("serializes two edits to the same Action and leaves one complete audit revision", async () => {
    const ticket = await makeTicket();
    const created = await withAuth(request(app).post(`/api/staff/tickets/${ticket.id}/actions`), staffAAuth)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedTicketVersion: 1, description: "Shared Action edit race" });
    expect(created.status).toBe(201);
    const actionId = created.body.action.id as number;

    let releaseParent!: () => void;
    let parentLocked!: () => void;
    const parentMayCommit = new Promise<void>((resolve) => { releaseParent = resolve; });
    const parentHasLock = new Promise<void>((resolve) => { parentLocked = resolve; });
    const parentBlocker = prisma.$transaction(async (tx) => {
      await lockTicket(tx, ticket.id);
      parentLocked();
      await parentMayCommit;
    });
    await parentHasLock;

    const writerPids: number[] = [];
    let releaseWriters!: () => void;
    let bothWritersReady!: () => void;
    const writersMayContinue = new Promise<void>((resolve) => { releaseWriters = resolve; });
    const bothAtBoundary = new Promise<void>((resolve) => { bothWritersReady = resolve; });
    setActionLockTestHook(async (context) => {
      if (context.ticketId !== ticket.id || context.operation !== "ACTION_BEFORE_USER_LOCKS") return;
      writerPids.push(context.backendPid);
      if (writerPids.length === 2) bothWritersReady();
      await writersMayContinue;
    });

    const first = withAuth(request(app).patch(`/api/staff/tickets/${ticket.id}/actions/${actionId}`), staffAAuth)
      .send({ expectedTicketVersion: 2, expectedActionVersion: 1, description: "First winning edit" });
    const second = withAuth(request(app).patch(`/api/staff/tickets/${ticket.id}/actions/${actionId}`), staffBAuth)
      .send({ expectedTicketVersion: 2, expectedActionVersion: 1, description: "Second competing edit" });
    void first.then(() => undefined, () => undefined);
    void second.then(() => undefined, () => undefined);

    try {
      await bothAtBoundary;
      releaseWriters();
      await Promise.all(writerPids.map(waitForBackendLockWait));
      releaseParent();
      const [firstResult, secondResult] = await Promise.all([first, second]);
      const results = [firstResult, secondResult];
      expect(results.filter((result) => result.status === 200)).toHaveLength(1);
      const stale = results.find((result) => result.status === 409);
      expect(stale?.body.error.code).toBe("STALE_TICKET_VERSION");
      const saved = await prisma.actionTaken.findUniqueOrThrow({ where: { id: actionId } });
      expect(["First winning edit", "Second competing edit"]).toContain(saved.description);
      expect(saved.version).toBe(2);
      expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).version).toBe(3);
      const revisions = await prisma.actionRevision.findMany({ where: { actionId }, orderBy: { sequence: "asc" } });
      expect(revisions).toHaveLength(2);
      expect(revisions.map(({ sequence, operation }) => ({ sequence, operation }))).toEqual([
        { sequence: 1, operation: "CREATE" },
        { sequence: 2, operation: "EDIT" },
      ]);
      expect((revisions[1].after as { description: string }).description).toBe(saved.description);
    } finally {
      releaseWriters();
      releaseParent();
      setActionLockTestHook(undefined);
      await parentBlocker.catch(() => undefined);
    }
  });

  it("rejects an Action edit that waits behind a parent Ticket becoming final", async () => {
    const ticket = await makeTicket();
    const created = await withAuth(request(app).post(`/api/staff/tickets/${ticket.id}/actions`), staffAAuth)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedTicketVersion: 1, description: "Must remain unchanged after finality" });
    expect(created.status).toBe(201);
    const actionId = created.body.action.id as number;

    let releaseFinality!: () => void;
    let finalityLocked!: () => void;
    const finalityMayCommit = new Promise<void>((resolve) => { releaseFinality = resolve; });
    const finalityHasLock = new Promise<void>((resolve) => { finalityLocked = resolve; });
    const finalizer = prisma.$transaction(async (tx) => {
      await lockTicket(tx, ticket.id);
      finalityLocked();
      await finalityMayCommit;
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { currentStatus: "CLOSED", version: { increment: 1 } },
      });
    });
    await finalityHasLock;

    let actionPid = 0;
    let releaseAction!: () => void;
    let actionAfterUsers!: () => void;
    const actionMayContinue = new Promise<void>((resolve) => { releaseAction = resolve; });
    const actionHasUsers = new Promise<void>((resolve) => { actionAfterUsers = resolve; });
    setActionLockTestHook(async (context) => {
      if (context.ticketId !== ticket.id || context.operation !== "ACTION_AFTER_USER_LOCKS") return;
      actionPid = context.backendPid;
      actionAfterUsers();
      await actionMayContinue;
    });

    const pendingEdit = withAuth(request(app).patch(`/api/staff/tickets/${ticket.id}/actions/${actionId}`), staffAAuth)
      .send({ expectedTicketVersion: 2, expectedActionVersion: 1, description: "Must not overwrite after close" });
    void pendingEdit.then(() => undefined, () => undefined);
    try {
      await actionHasUsers;
      releaseAction();
      await waitForBackendLockWait(actionPid);
      releaseFinality();
      const response = await pendingEdit;
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("TICKET_FINAL");
      expect(await finalizer).toBeUndefined();
      expect(await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { currentStatus: true, version: true } })).toEqual({
        currentStatus: "CLOSED",
        version: 3,
      });
      expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: actionId }, select: { description: true, version: true } })).toEqual({
        description: "Must remain unchanged after finality",
        version: 1,
      });
      expect(await prisma.actionRevision.count({ where: { actionId } })).toBe(1);
    } finally {
      releaseAction();
      releaseFinality();
      setActionLockTestHook(undefined);
      await finalizer.catch(() => undefined);
      await pendingEdit.catch(() => undefined);
    }
  });

  it("rechecks assignee eligibility after a real row-lock wait before starting work", async () => {
    const ticket = await makeTicket();
    const created = await withAuth(request(app).post(`/api/staff/tickets/${ticket.id}/actions`), staffAAuth)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedTicketVersion: 1, description: "Check access point", assigneeId: staffBId });
    expect(created.status).toBe(201);
    const actionId = created.body.action.id as number;

    let releaseDemotion!: () => void;
    let assigneeLocked!: () => void;
    const demotionMayCommit = new Promise<void>((resolve) => { releaseDemotion = resolve; });
    const assigneeLockReady = new Promise<void>((resolve) => { assigneeLocked = resolve; });
    const demotion = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${staffBId} FOR UPDATE`;
      assigneeLocked();
      await demotionMayCommit;
      await tx.user.update({ where: { id: staffBId }, data: { role: "REQUESTER" } });
    });
    await assigneeLockReady;

    let actionPid = 0;
    let releaseAction!: () => void;
    let beforeUsers!: () => void;
    const actionMayLockUsers = new Promise<void>((resolve) => { releaseAction = resolve; });
    const actionAtBoundary = new Promise<void>((resolve) => { beforeUsers = resolve; });
    setActionLockTestHook(async (context) => {
      if (context.ticketId !== ticket.id || context.operation !== "ACTION_BEFORE_USER_LOCKS") return;
      actionPid = context.backendPid;
      beforeUsers();
      await actionMayLockUsers;
    });
    const transition = withAuth(request(app).post(`/api/staff/tickets/${ticket.id}/actions/${actionId}/transitions`), staffAAuth)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedTicketVersion: 2, expectedActionVersion: 1, status: "IN_PROGRESS" });
    void transition.then(() => undefined, () => undefined);
    try {
      await actionAtBoundary;
      releaseAction();
      await waitForBackendLockWait(actionPid);
      releaseDemotion();
      const result = await transition;
      expect(result.status).toBe(409);
      expect(result.body.error.code).toBe("ASSIGNEE_NOT_ELIGIBLE");
      expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: actionId }, select: { status: true, version: true } })).toEqual({ status: "PLANNED", version: 1 });
      expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).version).toBe(2);
      expect(await prisma.actionRevision.count({ where: { actionId } })).toBe(1);
    } finally {
      releaseAction();
      releaseDemotion();
      setActionLockTestHook(undefined);
      await demotion.catch(() => undefined);
    }
  });

  it("keeps Admin roster edits and an Admin-caller/Staff-assignee write in ordered User locks", async () => {
    const passwordHash = await hashPassword(TEST_PASSWORD);
    const [target, admin] = await Promise.all([
      prisma.user.create({ data: { fullName: `Ordered Target ${suiteTag}`, email: `l4c.target.${suiteTag}@example.test`, role: "STAFF", passwordHash } }),
      prisma.user.create({ data: { fullName: `Ordered Admin ${suiteTag}`, email: `l4c.admin.${suiteTag}@example.test`, role: "ADMIN", passwordHash } }),
    ]);
    userIds.push(target.id, admin.id);
    const adminAuth = await loginAs(admin.email);
    const ticket = await makeTicket();
    let releaseAdmin!: () => void;
    let adminRowsLocked!: () => void;
    const adminMayCommit = new Promise<void>((resolve) => { releaseAdmin = resolve; });
    const adminHasRows = new Promise<void>((resolve) => { adminRowsLocked = resolve; });
    setAdminUsersLockTestHook(async (context) => {
      if (context.targetUserId !== target.id || context.operation !== "AFTER_ADMIN_ROSTER_LOCK") return;
      adminRowsLocked();
      await adminMayCommit;
    });
    const edit = withAuth(request(app).patch(`/api/admin/users/${target.id}`), adminAuth).send({ role: "REQUESTER" });
    void edit.then(() => undefined, () => undefined);
    let actionPid = 0;
    let allowAction!: () => void;
    let actionBeforeUsers!: () => void;
    const actionMayLock = new Promise<void>((resolve) => { allowAction = resolve; });
    const actionReady = new Promise<void>((resolve) => { actionBeforeUsers = resolve; });
    setActionLockTestHook(async (context) => {
      if (context.ticketId !== ticket.id || context.operation !== "ACTION_BEFORE_USER_LOCKS") return;
      actionPid = context.backendPid;
      actionBeforeUsers();
      await actionMayLock;
    });
    const create = withAuth(request(app).post(`/api/staff/tickets/${ticket.id}/actions`), adminAuth)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedTicketVersion: 1, description: "Check account", assigneeId: target.id });
    void create.then(() => undefined, () => undefined);
    try {
      await adminHasRows;
      await actionReady;
      allowAction();
      await waitForBackendLockWait(actionPid);
      releaseAdmin();
      const [editResult, createResult] = await Promise.all([edit, create]);
      expect(editResult.status).toBe(200);
      expect(createResult.status).toBe(409);
      expect(createResult.body.error.code).toBe("ASSIGNEE_NOT_ELIGIBLE");
      expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(0);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: target.id }, select: { role: true } })).toEqual({ role: "REQUESTER" });
    } finally {
      allowAction();
      releaseAdmin();
      setAdminUsersLockTestHook(undefined);
      setActionLockTestHook(undefined);
      await Promise.all([edit.catch(() => undefined), create.catch(() => undefined)]);
    }
  });
});
