import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../testApp.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/security/password.js";
import { loginAs, TEST_PASSWORD, withAuth, type AuthSessionFixture } from "../support/auth.js";
import { setActionLockTestHook } from "../../src/services/actions.service.js";
import { setStaffTicketOperationsLockTestHook } from "../../src/services/staffTicketOperations.service.js";

const prisma = getPrisma();
const suiteTag = randomUUID().slice(0, 8);
const ticketIds: number[] = [];
const userIds: number[] = [];
let requesterId: number;
let otherRequesterId: number;
let staffId: number;
let secondStaffId: number;
let categoryId: number;
let relatedSystemId: number;
let requesterAuth: AuthSessionFixture;
let otherRequesterAuth: AuthSessionFixture;
let staffAuth: AuthSessionFixture;
let secondStaffAuth: AuthSessionFixture;

async function makeTicket(options: {
  status?: "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "RESOLVED" | "REOPENED" | "CLOSED" | "CANCELLED";
  workCycle?: number;
  ownerId?: number | null;
  requester?: number;
} = {}) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-2026-L4W-${suiteTag}-${randomUUID().slice(0, 6)}`,
      requesterId: options.requester ?? requesterId,
      categoryId,
      relatedSystemId,
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: options.status ?? "OPEN",
      workCycle: options.workCycle ?? 1,
      ownerId: options.ownerId === undefined ? staffId : options.ownerId,
      summary: "Lab 4 Ticket workflow fixture",
      description: "A task-owned workflow test Ticket.",
    },
  });
  ticketIds.push(ticket.id);
  return ticket;
}

function createAction(ticketId: number, body: object, key = randomUUID(), auth = staffAuth) {
  return withAuth(request(app).post(`/api/staff/tickets/${ticketId}/actions`), auth)
    .set("Idempotency-Key", key)
    .send(body);
}

function transitionAction(ticketId: number, actionId: number, body: object, key = randomUUID()) {
  return withAuth(request(app).post(`/api/staff/tickets/${ticketId}/actions/${actionId}/transitions`), staffAuth)
    .set("Idempotency-Key", key)
    .send(body);
}

function ticketStatus(ticketId: number, body: object, key = randomUUID()) {
  return withAuth(request(app).patch(`/api/staff/tickets/${ticketId}/status`), staffAuth)
    .set("Idempotency-Key", key)
    .send(body);
}

async function waitForBackendLockWait(backendPid: number): Promise<void> {
  const deadline = Date.now() + 15000;
  let latest: { state: string | null; wait_event_type: string | null; query: string } | undefined;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<{ state: string | null; wait_event_type: string | null; query: string }[]>`
      SELECT state, wait_event_type, left(query, 180) AS query FROM pg_stat_activity WHERE pid = ${backendPid}
    `;
    latest = rows[0];
    if (latest?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`PostgreSQL backend ${backendPid} did not enter a lock wait: ${JSON.stringify(latest)}.`);
}

async function waitForBarrier(barrier: Promise<void>, label: string): Promise<void> {
  await Promise.race([
    barrier,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timed out waiting for ${label}.`)), 15000)),
  ]);
}

beforeAll(async () => {
  const [category, relatedSystem] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { active: true }, orderBy: { id: "asc" } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { active: true }, orderBy: { id: "asc" } }),
  ]);
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const [requester, otherRequester, staff, secondStaff] = await Promise.all([
    prisma.user.create({ data: { fullName: `Workflow Requester ${suiteTag}`, email: `l4w.req.${suiteTag}@example.test`, passwordHash } }),
    prisma.user.create({ data: { fullName: `Other Workflow Requester ${suiteTag}`, email: `l4w.other.${suiteTag}@example.test`, passwordHash } }),
    prisma.user.create({ data: { fullName: `Workflow Staff ${suiteTag}`, email: `l4w.staff.${suiteTag}@example.test`, role: "STAFF", passwordHash } }),
    prisma.user.create({ data: { fullName: `Second Workflow Staff ${suiteTag}`, email: `l4w.staff.second.${suiteTag}@example.test`, role: "STAFF", passwordHash } }),
  ]);
  requesterId = requester.id;
  otherRequesterId = otherRequester.id;
  staffId = staff.id;
  secondStaffId = secondStaff.id;
  userIds.push(requesterId, otherRequesterId, staffId, secondStaffId);
  [requesterAuth, otherRequesterAuth, staffAuth, secondStaffAuth] = await Promise.all([
    loginAs(requester.email), loginAs(otherRequester.email), loginAs(staff.email), loginAs(secondStaff.email),
  ]);
});

afterAll(async () => {
  setStaffTicketOperationsLockTestHook(undefined);
  setActionLockTestHook(undefined);
  await prisma.idempotencyRecord.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.ticketWorkflowEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.actionRevision.deleteMany({ where: { action: { ticketId: { in: ticketIds } } } });
  await prisma.actionTaken.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.publicComment.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.internalNote.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.attachment.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("Issue #87 — Ticket workflow gate and history", () => {
  it("writes CREATED with Ticket creation and returns only a stable public workflow projection", async () => {
    const created = await withAuth(request(app).post("/api/tickets"), requesterAuth).send({
      categoryId,
      relatedSystemId,
      requestedPriority: "MEDIUM",
      summary: "Created workflow timeline",
      description: "The create event is part of the same Ticket transaction.",
    });
    expect(created.status).toBe(201);
    const ticketId = created.body.id as number;
    ticketIds.push(ticketId);
    expect(created.body).toMatchObject({ workCycle: 1, resolvedAt: null });
    const createdEvent = await prisma.ticketWorkflowEvent.findFirstOrThrow({ where: { ticketId } });
    expect(createdEvent).toMatchObject({
      kind: "CREATED",
      fromStatus: null,
      toStatus: "NEW",
      workCycle: 1,
      actorId: requesterId,
      ticketVersion: 1,
    });

    const ticket = await makeTicket({ status: "WAITING_FOR_REQUESTER" });
    const occurredAt = new Date("2026-10-28T03:00:00.000Z");
    const baseline = await prisma.ticketWorkflowEvent.create({
      data: {
        ticketId: ticket.id,
        kind: "BASELINE",
        fromStatus: null,
        toStatus: "WAITING_FOR_REQUESTER",
        workCycle: 1,
        actorId: null,
        occurredAt,
        ticketVersion: 1,
      },
    });
    const tied = [];
    for (let index = 0; index < 11; index += 1) {
      tied.push(await prisma.ticketWorkflowEvent.create({
        data: {
          ticketId: ticket.id,
          kind: "TRANSITION",
          fromStatus: "NEW",
          toStatus: "OPEN",
          workCycle: 1,
          actorId: staffId,
          occurredAt,
          ticketVersion: index + 2,
        },
      }));
    }
    await prisma.internalNote.create({ data: { ticketId: ticket.id, authorId: staffId, body: "Never in a workflow response." } });

    const page1 = await withAuth(request(app).get(`/api/staff/tickets/${ticket.id}/workflow`).query({ pageSize: 10 }), staffAuth, false);
    expect(page1.status).toBe(200);
    expect(page1.body).toMatchObject({ page: 1, pageSize: 10, total: 12, totalPages: 2 });
    expect(page1.body.data.map((event: { id: number }) => event.id)).toEqual([baseline.id, ...tied.map((event) => event.id)].slice(0, 10));
    expect(page1.body.data[0]).toEqual({
      id: baseline.id,
      kind: "BASELINE",
      fromStatus: null,
      toStatus: "WAITING_FOR_REQUESTER",
      workCycle: 1,
      actor: null,
      occurredAt: occurredAt.toISOString(),
      reason: null,
      publicCommentId: null,
      label: "Lab 4 migration snapshot; original transition time unknown",
    });
    expect(Object.keys(page1.body.data[1]).sort()).toEqual([
      "actor", "fromStatus", "id", "kind", "occurredAt", "publicCommentId", "reason", "toStatus", "workCycle",
    ]);
    expect(JSON.stringify(page1.body)).not.toContain("actorId");
    expect(JSON.stringify(page1.body)).not.toContain("ticketVersion");
    expect(JSON.stringify(page1.body)).not.toContain("Never in a workflow response");

    const page2 = await withAuth(request(app).get(`/api/tickets/${ticket.id}/workflow`).query({ page: 2, pageSize: 10 }), requesterAuth, false);
    expect(page2.status).toBe(200);
    expect(page2.body.data.map((event: { id: number }) => event.id)).toEqual([tied[9].id, tied[10].id]);
    const other = await withAuth(request(app).get(`/api/tickets/${ticket.id}/workflow`), otherRequesterAuth, false);
    expect(other.status).toBe(404);
    const defaultPage = await withAuth(request(app).get(`/api/tickets/${ticketId}/workflow`), requesterAuth, false);
    expect(defaultPage.body).toMatchObject({ page: 1, pageSize: 10, total: 1 });
    expect(defaultPage.body.data[0]).toMatchObject({ kind: "CREATED", actor: { id: requesterId } });
  });

  it("gates resolution on current-cycle work, retains the legacy close exception, and reopens once", async () => {
    const ticket = await makeTicket({ status: "IN_PROGRESS" });
    const completed = await createAction(ticket.id, {
      expectedTicketVersion: 1,
      description: "Completed work with a required follow-up",
      followUpRequired: true,
      followUpNote: "Confirm with the Requester",
    });
    expect(completed.status).toBe(201);
    const completedActionId = completed.body.action.id as number;
    const completedTransition = await transitionAction(ticket.id, completedActionId, {
      expectedTicketVersion: 2,
      expectedActionVersion: 1,
      status: "COMPLETED",
      result: "Configuration restored",
      followUpRequired: true,
      followUpNote: "Confirm with the Requester",
    });
    expect(completedTransition.status).toBe(200);

    const unfinished = await createAction(ticket.id, { expectedTicketVersion: 3, description: "Pending current-cycle work" });
    const unfinishedActionId = unfinished.body.action.id as number;
    const cancelledFollowUp = await createAction(ticket.id, {
      expectedTicketVersion: 4,
      description: "Cancelled follow-up must not block resolution",
      followUpRequired: true,
      followUpNote: "No longer needed",
    });
    const cancelledActionId = cancelledFollowUp.body.action.id as number;
    const cancelled = await transitionAction(ticket.id, cancelledActionId, {
      expectedTicketVersion: 5,
      expectedActionVersion: 1,
      status: "CANCELLED",
      cancelReason: "Superseded by the completed work",
    });
    expect(cancelled.status).toBe(200);

    const indicated = await withAuth(request(app).put(`/api/tickets/${ticket.id}/resolution-indication`), requesterAuth).send({});
    expect(indicated.status).toBe(200);
    const blockedDetail = await withAuth(request(app).get(`/api/staff/tickets/${ticket.id}`), staffAuth, false);
    expect(blockedDetail.body.resolutionGate).toEqual({
      canResolve: false,
      reasons: ["UNFINISHED_ACTIONS", "FOLLOW_UP_REQUIRED"],
      completedCount: 1,
      unfinishedCount: 1,
      followUpCount: 1,
    });
    expect(blockedDetail.body.allowedTransitions).not.toContain("RESOLVED");
    const blocked = await ticketStatus(ticket.id, { expectedTicketVersion: 6, status: "RESOLVED" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatchObject({ code: "RESOLUTION_GATE_FAILED", meta: { resolutionGate: blockedDetail.body.resolutionGate } });
    expect(await prisma.ticketWorkflowEvent.count({ where: { ticketId: ticket.id } })).toBe(0);

    const corrected = await withAuth(request(app).patch(`/api/staff/tickets/${ticket.id}/actions/${completedActionId}`), staffAuth)
      .send({
        expectedTicketVersion: 6,
        expectedActionVersion: 2,
        followUpRequired: false,
        followUpNote: null,
        correctionReason: "The Requester confirmed no further follow-up is needed",
      });
    expect(corrected.status).toBe(200);
    const finished = await transitionAction(ticket.id, unfinishedActionId, {
      expectedTicketVersion: 7,
      expectedActionVersion: 1,
      status: "COMPLETED",
      result: "Pending change applied",
    });
    expect(finished.status).toBe(200);
    const readyDetail = await withAuth(request(app).get(`/api/staff/tickets/${ticket.id}`), staffAuth, false);
    expect(readyDetail.body.resolutionGate).toEqual({ canResolve: true, reasons: [], completedCount: 2, unfinishedCount: 0, followUpCount: 0 });
    expect(readyDetail.body.allowedTransitions).toContain("RESOLVED");

    const resolved = await ticketStatus(ticket.id, { expectedTicketVersion: 8, status: "RESOLVED" });
    expect(resolved.status).toBe(200);
    expect(resolved.body).toMatchObject({ currentStatus: "RESOLVED", ticketVersion: 9, workCycle: 1, resolvedAt: expect.any(String) });
    const resolvedAt = resolved.body.resolvedAt as string;
    const reopenKey = randomUUID();
    const reopenBody = { expectedTicketVersion: 9, status: "REOPENED" };
    const reopened = await ticketStatus(ticket.id, reopenBody, reopenKey);
    expect(reopened.status).toBe(200);
    expect(reopened.body).toMatchObject({ currentStatus: "REOPENED", ticketVersion: 10, workCycle: 2, resolvedAt: null, resolutionIndication: null });
    const replay = await ticketStatus(ticket.id, reopenBody, reopenKey);
    expect(replay.status).toBe(200);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(replay.body).toEqual(reopened.body);
    expect(await prisma.ticketWorkflowEvent.count({ where: { ticketId: ticket.id } })).toBe(2);
    const events = await prisma.ticketWorkflowEvent.findMany({ where: { ticketId: ticket.id }, orderBy: { id: "asc" } });
    expect(events).toMatchObject([
      { fromStatus: "IN_PROGRESS", toStatus: "RESOLVED", workCycle: 1, ticketVersion: 9 },
      { fromStatus: "RESOLVED", toStatus: "REOPENED", workCycle: 2, ticketVersion: 10 },
    ]);
    expect(events[0].occurredAt.toISOString()).toBe(resolvedAt);
    const newCycle = await withAuth(request(app).get(`/api/staff/tickets/${ticket.id}`), staffAuth, false);
    expect(newCycle.body.resolutionGate).toEqual({ canResolve: false, reasons: ["NO_COMPLETED_ACTION"], completedCount: 0, unfinishedCount: 0, followUpCount: 0 });
    expect(newCycle.body.allowedTransitions).not.toContain("RESOLVED");
    const oldActionWrite = await withAuth(request(app).patch(`/api/staff/tickets/${ticket.id}/actions/${completedActionId}`), staffAuth)
      .send({ expectedTicketVersion: 10, expectedActionVersion: 3, description: "Old cycle edit", correctionReason: "Must remain locked" });
    expect(oldActionWrite.status).toBe(409);
    expect(oldActionWrite.body.error.code).toBe("ACTION_CYCLE_READ_ONLY");

    const cycle2Cancelled = await createAction(ticket.id, {
      expectedTicketVersion: 10,
      description: "Cancelled-only current-cycle work",
      followUpRequired: true,
      followUpNote: "Cancelled work has no remaining follow-up",
    });
    const cancelledOnly = await transitionAction(ticket.id, cycle2Cancelled.body.action.id, {
      expectedTicketVersion: 11,
      expectedActionVersion: 1,
      status: "CANCELLED",
      cancelReason: "No work was required in the new cycle",
    });
    expect(cancelledOnly.status).toBe(200);
    const cancelledOnlyDetail = await withAuth(request(app).get(`/api/staff/tickets/${ticket.id}`), staffAuth, false);
    expect(cancelledOnlyDetail.body.resolutionGate).toEqual({
      canResolve: false,
      reasons: ["NO_COMPLETED_ACTION"],
      completedCount: 0,
      unfinishedCount: 0,
      followUpCount: 0,
    });
    const cancelledOnlyResolve = await ticketStatus(ticket.id, { expectedTicketVersion: 12, status: "RESOLVED" });
    expect(cancelledOnlyResolve.status).toBe(409);
    expect(cancelledOnlyResolve.body.error.meta.resolutionGate.reasons).toEqual(["NO_COMPLETED_ACTION"]);
    expect(await prisma.ticketWorkflowEvent.count({ where: { ticketId: ticket.id } })).toBe(2);

    const cycle2Completed = await createAction(ticket.id, { expectedTicketVersion: 12, description: "New-cycle resolution evidence" });
    const cycle2Complete = await transitionAction(ticket.id, cycle2Completed.body.action.id, {
      expectedTicketVersion: 13,
      expectedActionVersion: 1,
      status: "COMPLETED",
      result: "New-cycle work is complete",
    });
    expect(cycle2Complete.status).toBe(200);
    const resolvedAgain = await ticketStatus(ticket.id, { expectedTicketVersion: 14, status: "RESOLVED" });
    expect(resolvedAgain.status).toBe(200);
    expect(resolvedAgain.body).toMatchObject({ currentStatus: "RESOLVED", ticketVersion: 15, workCycle: 2, resolvedAt: expect.any(String) });
    const reopenAgainKey = randomUUID();
    const reopenAgainBody = { expectedTicketVersion: 15, status: "REOPENED" };
    const reopenedAgain = await ticketStatus(ticket.id, reopenAgainBody, reopenAgainKey);
    expect(reopenedAgain.status).toBe(200);
    expect(reopenedAgain.body).toMatchObject({ currentStatus: "REOPENED", ticketVersion: 16, workCycle: 3, resolvedAt: null });
    const reopenAgainReplay = await ticketStatus(ticket.id, reopenAgainBody, reopenAgainKey);
    expect(reopenAgainReplay.headers["idempotency-replayed"]).toBe("true");
    expect(reopenAgainReplay.body).toEqual(reopenedAgain.body);
    const allEvents = await prisma.ticketWorkflowEvent.findMany({ where: { ticketId: ticket.id }, orderBy: { id: "asc" } });
    expect(allEvents).toMatchObject([
      { toStatus: "RESOLVED", workCycle: 1, ticketVersion: 9 },
      { toStatus: "REOPENED", workCycle: 2, ticketVersion: 10 },
      { toStatus: "RESOLVED", workCycle: 2, ticketVersion: 15 },
      { toStatus: "REOPENED", workCycle: 3, ticketVersion: 16 },
    ]);

    const legacyResolved = await makeTicket({ status: "RESOLVED" });
    const legacyClose = await ticketStatus(legacyResolved.id, { expectedTicketVersion: 1, status: "CLOSED" });
    expect(legacyClose.status).toBe(200);
    expect(legacyClose.body).toMatchObject({ currentStatus: "CLOSED", resolvedAt: null, workCycle: 1 });
    expect((await withAuth(request(app).get(`/api/staff/tickets/${legacyResolved.id}/workflow`), staffAuth, false)).status).toBe(200);
    expect((await withAuth(request(app).get(`/api/tickets/${legacyResolved.id}/workflow`), requesterAuth, false)).status).toBe(200);
    expect((await withAuth(request(app).get(`/api/tickets/${legacyResolved.id}/workflow`), otherRequesterAuth, false)).status).toBe(404);
    const legacyResolvedAt = new Date("2026-10-27T11:30:00.000Z");
    const legacyWithTime = await makeTicket({ status: "RESOLVED" });
    await prisma.ticket.update({ where: { id: legacyWithTime.id }, data: { resolvedAt: legacyResolvedAt } });
    const closeWithTime = await ticketStatus(legacyWithTime.id, { expectedTicketVersion: 1, status: "CLOSED" });
    expect(closeWithTime.status).toBe(200);
    expect(closeWithTime.body.resolvedAt).toBe(legacyResolvedAt.toISOString());
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: legacyWithTime.id }, select: { resolvedAt: true } })).toEqual({ resolvedAt: legacyResolvedAt });
  });

  it("cancels only unfinished current-cycle Actions with shared actor/time/reason and audit revisions", async () => {
    const ticket = await makeTicket({ status: "OPEN", workCycle: 2 });
    let ticketVersion = 1;
    const planned = await createAction(ticket.id, { expectedTicketVersion: ticketVersion, description: "Current-cycle planned Action" });
    ticketVersion = planned.body.ticketVersion as number;
    const plannedId = planned.body.action.id as number;
    const inProgress = await createAction(ticket.id, { expectedTicketVersion: ticketVersion, description: "Current-cycle in-progress Action" });
    ticketVersion = inProgress.body.ticketVersion as number;
    const inProgressId = inProgress.body.action.id as number;
    const started = await transitionAction(ticket.id, inProgressId, {
      expectedTicketVersion: ticketVersion,
      expectedActionVersion: 1,
      status: "IN_PROGRESS",
    });
    expect(started.status).toBe(200);
    ticketVersion = started.body.ticketVersion as number;

    const completed = await createAction(ticket.id, { expectedTicketVersion: ticketVersion, description: "Current-cycle completed work" });
    ticketVersion = completed.body.ticketVersion as number;
    const completedId = completed.body.action.id as number;
    const completion = await transitionAction(ticket.id, completedId, {
      expectedTicketVersion: ticketVersion,
      expectedActionVersion: 1,
      status: "COMPLETED",
      result: "Work finished before cancellation",
    });
    expect(completion.status).toBe(200);
    ticketVersion = completion.body.ticketVersion as number;

    const previouslyCancelled = await createAction(ticket.id, {
      expectedTicketVersion: ticketVersion,
      description: "Already-cancelled current-cycle work",
      followUpRequired: true,
      followUpNote: "No follow-up remains",
    });
    ticketVersion = previouslyCancelled.body.ticketVersion as number;
    const previouslyCancelledId = previouslyCancelled.body.action.id as number;
    const priorCancellation = await transitionAction(ticket.id, previouslyCancelledId, {
      expectedTicketVersion: ticketVersion,
      expectedActionVersion: 1,
      status: "CANCELLED",
      cancelReason: "Cancelled before Ticket withdrawal",
    });
    expect(priorCancellation.status).toBe(200);
    ticketVersion = priorCancellation.body.ticketVersion as number;

    const completedBefore = await prisma.actionTaken.findUniqueOrThrow({ where: { id: completedId } });
    const priorCancelledBefore = await prisma.actionTaken.findUniqueOrThrow({ where: { id: previouslyCancelledId } });
    const terminalRevisionsBefore = await prisma.actionRevision.findMany({
      where: { actionId: { in: [completedId, previouslyCancelledId] } },
      orderBy: [{ actionId: "asc" }, { sequence: "asc" }],
    });
    const oldCycle = await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        workCycle: 1,
        status: "IN_PROGRESS",
        description: "Earlier-cycle work remains historical",
        actionAt: ticket.createdAt,
        assigneeId: staffId,
        createdById: staffId,
      },
    });
    const key = randomUUID();
    const cancelled = await ticketStatus(ticket.id, {
      expectedTicketVersion: ticketVersion,
      status: "CANCELLED",
      cancelReason: "Requester withdrew the work",
    }, key);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ currentStatus: "CANCELLED", ticketVersion: ticketVersion + 1, workCycle: 2 });
    const currentActions = await prisma.actionTaken.findMany({ where: { ticketId: ticket.id, workCycle: 2 }, orderBy: { id: "asc" } });
    expect(currentActions).toHaveLength(4);
    expect(currentActions.map((action) => action.status)).toEqual(["CANCELLED", "CANCELLED", "COMPLETED", "CANCELLED"]);
    const newlyCancelled = currentActions.filter((action) => action.id === plannedId || action.id === inProgressId);
    expect(newlyCancelled).toHaveLength(2);
    expect(newlyCancelled.every((action) => action.cancelledById === staffId && action.cancelReason === "Requester withdrew the work" && action.cancelledAt?.getTime() === newlyCancelled[0].cancelledAt?.getTime())).toBe(true);
    expect(currentActions.map((action) => action.version)).toEqual([2, 3, 2, 2]);
    expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: oldCycle.id }, select: { status: true, version: true } })).toEqual({ status: "IN_PROGRESS", version: 1 });
    expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: completedId } })).toEqual(completedBefore);
    expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: previouslyCancelledId } })).toEqual(priorCancelledBefore);
    const revisions = await prisma.actionRevision.findMany({ where: { actionId: { in: [plannedId, inProgressId] } }, orderBy: [{ actionId: "asc" }, { sequence: "asc" }] });
    expect(revisions.filter((revision) => revision.operation === "TICKET_CANCEL")).toHaveLength(2);
    expect(revisions.filter((revision) => revision.operation === "TICKET_CANCEL").every((revision) => revision.actorId === staffId && revision.reason === "Requester withdrew the work" && revision.occurredAt.getTime() === newlyCancelled[0].cancelledAt?.getTime())).toBe(true);
    expect(await prisma.actionRevision.findMany({ where: { actionId: { in: [completedId, previouslyCancelledId] } }, orderBy: [{ actionId: "asc" }, { sequence: "asc" }] })).toEqual(terminalRevisionsBefore);
    const event = await prisma.ticketWorkflowEvent.findFirstOrThrow({ where: { ticketId: ticket.id } });
    expect(event).toMatchObject({ fromStatus: "OPEN", toStatus: "CANCELLED", workCycle: 2, actorId: staffId, reason: "Requester withdrew the work", ticketVersion: ticketVersion + 1 });
    expect(event.occurredAt.getTime()).toBe(newlyCancelled[0].cancelledAt?.getTime());
    const replay = await ticketStatus(ticket.id, { expectedTicketVersion: ticketVersion, status: "CANCELLED", cancelReason: "Requester withdrew the work" }, key);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(replay.body).toEqual(cancelled.body);
    expect(await prisma.ticketWorkflowEvent.count({ where: { ticketId: ticket.id } })).toBe(1);

    const staffFinalRead = await withAuth(request(app).get(`/api/staff/tickets/${ticket.id}/workflow`), staffAuth, false);
    const requesterFinalRead = await withAuth(request(app).get(`/api/tickets/${ticket.id}/workflow`), requesterAuth, false);
    const foreignFinalRead = await withAuth(request(app).get(`/api/tickets/${ticket.id}/workflow`), otherRequesterAuth, false);
    expect(staffFinalRead.status).toBe(200);
    expect(requesterFinalRead.status).toBe(200);
    expect(foreignFinalRead.status).toBe(404);
  });

  it("rolls back cancellation and Waiting comment when revision/event writes fail after effects", async () => {
    const cancelTicket = await makeTicket();
    const action = await createAction(cancelTicket.id, { expectedTicketVersion: 1, description: "Rollback cancellation child" });
    const actionId = action.body.action.id as number;
    const cancelKey = randomUUID();
    let failRevision = true;
    setStaffTicketOperationsLockTestHook(async (context) => {
      if (context.ticketId === cancelTicket.id && context.operation === "STATUS_AFTER_CANCEL_ACTION_REVISION" && failRevision) {
        failRevision = false;
        throw new Error("injected cancellation revision failure");
      }
    });
    try {
      const body = { expectedTicketVersion: 2, status: "CANCELLED", cancelReason: "Rollback proof" };
      const failed = await ticketStatus(cancelTicket.id, body, cancelKey);
      expect(failed.status).toBe(500);
      expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: actionId }, select: { status: true, version: true } })).toEqual({ status: "PLANNED", version: 1 });
      expect(await prisma.actionRevision.count({ where: { actionId } })).toBe(1);
      expect(await prisma.ticketWorkflowEvent.count({ where: { ticketId: cancelTicket.id } })).toBe(0);
      expect(await prisma.ticket.findUniqueOrThrow({ where: { id: cancelTicket.id }, select: { currentStatus: true, version: true } })).toEqual({ currentStatus: "OPEN", version: 2 });
      expect(await prisma.idempotencyRecord.count({ where: { userId: staffId, key: cancelKey } })).toBe(0);

      setStaffTicketOperationsLockTestHook(undefined);
      const retry = await ticketStatus(cancelTicket.id, body, cancelKey);
      expect(retry.status).toBe(200);
      expect((await prisma.actionTaken.findUniqueOrThrow({ where: { id: actionId } })).status).toBe("CANCELLED");
      expect(await prisma.ticketWorkflowEvent.count({ where: { ticketId: cancelTicket.id } })).toBe(1);
    } finally {
      setStaffTicketOperationsLockTestHook(undefined);
    }

    const waitingTicket = await makeTicket();
    const waitingKey = randomUUID();
    let failEvent = true;
    setStaffTicketOperationsLockTestHook(async (context) => {
      if (context.ticketId === waitingTicket.id && context.operation === "STATUS_AFTER_WORKFLOW_EVENT" && failEvent) {
        failEvent = false;
        throw new Error("injected waiting event failure");
      }
    });
    try {
      const body = { expectedTicketVersion: 1, status: "WAITING_FOR_REQUESTER", publicComment: "Please provide the requested details." };
      const failed = await ticketStatus(waitingTicket.id, body, waitingKey);
      expect(failed.status).toBe(500);
      expect(await prisma.publicComment.count({ where: { ticketId: waitingTicket.id } })).toBe(0);
      expect(await prisma.ticketWorkflowEvent.count({ where: { ticketId: waitingTicket.id } })).toBe(0);
      expect(await prisma.ticket.findUniqueOrThrow({ where: { id: waitingTicket.id }, select: { currentStatus: true, version: true } })).toEqual({ currentStatus: "OPEN", version: 1 });
      expect(await prisma.idempotencyRecord.count({ where: { userId: staffId, key: waitingKey } })).toBe(0);

      setStaffTicketOperationsLockTestHook(undefined);
      const retry = await ticketStatus(waitingTicket.id, body, waitingKey);
      expect(retry.status).toBe(200);
      const comment = await prisma.publicComment.findFirstOrThrow({ where: { ticketId: waitingTicket.id } });
      const event = await prisma.ticketWorkflowEvent.findFirstOrThrow({ where: { ticketId: waitingTicket.id } });
      expect(event).toMatchObject({ fromStatus: "OPEN", toStatus: "WAITING_FOR_REQUESTER", publicCommentId: comment.id, actorId: staffId });
      expect(event.occurredAt).toEqual(comment.createdAt);
    } finally {
      setStaffTicketOperationsLockTestHook(undefined);
    }

    const eventFailureTicket = await makeTicket();
    const eventFailureAction = await createAction(eventFailureTicket.id, {
      expectedTicketVersion: 1,
      description: "Rollback all cancelled children when the event write fails",
    });
    const eventFailureActionId = eventFailureAction.body.action.id as number;
    const eventFailureKey = randomUUID();
    let failCancellationEvent = true;
    setStaffTicketOperationsLockTestHook(async (context) => {
      if (context.ticketId === eventFailureTicket.id && context.operation === "STATUS_AFTER_WORKFLOW_EVENT" && failCancellationEvent) {
        failCancellationEvent = false;
        throw new Error("injected cancellation event failure");
      }
    });
    try {
      const body = { expectedTicketVersion: 2, status: "CANCELLED", cancelReason: "Event rollback proof" };
      const failed = await ticketStatus(eventFailureTicket.id, body, eventFailureKey);
      expect(failed.status).toBe(500);
      expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: eventFailureActionId }, select: { status: true, version: true } })).toEqual({ status: "PLANNED", version: 1 });
      expect(await prisma.actionRevision.count({ where: { actionId: eventFailureActionId } })).toBe(1);
      expect(await prisma.ticketWorkflowEvent.count({ where: { ticketId: eventFailureTicket.id } })).toBe(0);
      expect(await prisma.ticket.findUniqueOrThrow({ where: { id: eventFailureTicket.id }, select: { currentStatus: true, version: true } })).toEqual({ currentStatus: "OPEN", version: 2 });
      expect(await prisma.idempotencyRecord.count({ where: { userId: staffId, key: eventFailureKey } })).toBe(0);
      setStaffTicketOperationsLockTestHook(undefined);
      const retry = await ticketStatus(eventFailureTicket.id, body, eventFailureKey);
      expect(retry.status).toBe(200);
      expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: eventFailureActionId }, select: { status: true, version: true } })).toEqual({ status: "CANCELLED", version: 2 });
      expect(await prisma.ticketWorkflowEvent.count({ where: { ticketId: eventFailureTicket.id } })).toBe(1);
    } finally {
      setStaffTicketOperationsLockTestHook(undefined);
    }
  });

  it("serializes Resolve/Cancel/Close against a real Action-write lock wait", async () => {
    async function statusWins(ticketId: number, expectedTicketVersion: number, status: "RESOLVED" | "CANCELLED" | "CLOSED", actionError: string, cancelReason?: string) {
      let releaseStatus!: () => void;
      let parentLocked!: () => void;
      const statusMayContinue = new Promise<void>((resolve) => { releaseStatus = resolve; });
      const statusHasParent = new Promise<void>((resolve) => { parentLocked = resolve; });
      setStaffTicketOperationsLockTestHook(async (context) => {
        if (context.ticketId === ticketId && context.operation === "STATUS_AFTER_PARENT_LOCK") {
          parentLocked();
          await statusMayContinue;
        }
      });
      const body = { expectedTicketVersion, status, ...(cancelReason ? { cancelReason } : {}) };
      const finalizing = ticketStatus(ticketId, body);
      void finalizing.then(() => undefined, () => undefined);
      let writing!: ReturnType<typeof createAction>;
      let writerPid = 0;
      let writerAtUsers!: () => void;
      const writerHasUsers = new Promise<void>((resolve) => { writerAtUsers = resolve; });
      try {
        await waitForBarrier(statusHasParent, "status parent lock");
        setActionLockTestHook((context) => {
          if (context.ticketId === ticketId && context.operation === "ACTION_AFTER_USER_LOCKS") {
            writerPid = context.backendPid;
            writerAtUsers();
          }
        });
        writing = createAction(ticketId, { expectedTicketVersion, description: "Concurrent Action creation" }, randomUUID(), secondStaffAuth);
        void writing.then(() => undefined, () => undefined);
        await waitForBarrier(writerHasUsers, "Action User locks");
        await waitForBackendLockWait(writerPid);
        releaseStatus();
        const [statusResult, actionResult] = await Promise.all([finalizing, writing]);
        expect(statusResult.status).toBe(200);
        expect(actionResult.status).toBe(409);
        expect(actionResult.body.error.code).toBe(actionError);
        expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).currentStatus).toBe(status);
        expect(await prisma.actionTaken.count({ where: { ticketId, createdById: secondStaffId } })).toBe(0);
      } finally {
        releaseStatus();
        setStaffTicketOperationsLockTestHook(undefined);
        setActionLockTestHook(undefined);
        await Promise.all([finalizing.catch(() => undefined), ...(writing ? [writing.catch(() => undefined)] : [])]);
      }
    }

    const resolving = await makeTicket({ status: "IN_PROGRESS" });
    const evidence = await createAction(resolving.id, { expectedTicketVersion: 1, description: "Resolution evidence" });
    const completed = await transitionAction(resolving.id, evidence.body.action.id, {
      expectedTicketVersion: 2,
      expectedActionVersion: 1,
      status: "COMPLETED",
      result: "Work complete",
    });
    expect(completed.status).toBe(200);
    await statusWins(resolving.id, 3, "RESOLVED", "TICKET_ACTIONS_READ_ONLY");

    const cancelling = await makeTicket({ status: "OPEN" });
    await statusWins(cancelling.id, 1, "CANCELLED", "TICKET_FINAL", "Requester withdrew the request");

    const closingLegacy = await makeTicket({ status: "RESOLVED" });
    await statusWins(closingLegacy.id, 1, "CLOSED", "TICKET_FINAL");
  }, 40000);

  it("includes an Action that commits first in the subsequent atomic cancellation", async () => {
    const ticket = await makeTicket({ status: "OPEN" });
    let releaseAction!: () => void;
    let actionParentLocked!: () => void;
    const actionMayContinue = new Promise<void>((resolve) => { releaseAction = resolve; });
    const actionHasParent = new Promise<void>((resolve) => { actionParentLocked = resolve; });
    setActionLockTestHook(async (context) => {
      if (context.ticketId === ticket.id && context.operation === "ACTION_AFTER_PARENT_LOCK") {
        actionParentLocked();
        await actionMayContinue;
      }
    });
    const actionWrite = createAction(ticket.id, { expectedTicketVersion: 1, description: "Action committed before cancellation" }, randomUUID(), secondStaffAuth);
    void actionWrite.then(() => undefined, () => undefined);
    let statusPid = 0;
    let statusHasUsers!: () => void;
    const statusUsersReady = new Promise<void>((resolve) => { statusHasUsers = resolve; });
    setStaffTicketOperationsLockTestHook((context) => {
      if (context.ticketId === ticket.id && context.operation === "STATUS_AFTER_USER_LOCKS") {
        statusPid = context.backendPid;
        statusHasUsers();
      }
    });
    let cancellation!: ReturnType<typeof ticketStatus>;
    try {
      await waitForBarrier(actionHasParent, "Action parent lock");
      setStaffTicketOperationsLockTestHook((context) => {
        if (context.ticketId === ticket.id && context.operation === "STATUS_AFTER_USER_LOCKS") {
          statusPid = context.backendPid;
          statusHasUsers();
        }
      });
      cancellation = ticketStatus(ticket.id, {
        expectedTicketVersion: 2,
        status: "CANCELLED",
        cancelReason: "Work was withdrawn",
      });
      void cancellation.then(() => undefined, () => undefined);
      await waitForBarrier(statusUsersReady, "status User locks");
      await waitForBackendLockWait(statusPid);
      releaseAction();
      const [actionResult, statusResult] = await Promise.all([actionWrite, cancellation]);
      expect(actionResult.status).toBe(201);
      expect(statusResult.status).toBe(200);
      expect(statusResult.body.ticketVersion).toBe(3);
      const actionId = actionResult.body.action.id as number;
      expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: actionId } })).toMatchObject({
        status: "CANCELLED",
        version: 2,
        cancelledById: staffId,
        cancelReason: "Work was withdrawn",
      });
      expect(await prisma.actionRevision.count({ where: { actionId } })).toBe(2);
      expect(await prisma.ticketWorkflowEvent.count({ where: { ticketId: ticket.id, toStatus: "CANCELLED" } })).toBe(1);
    } finally {
      releaseAction();
      setActionLockTestHook(undefined);
      setStaffTicketOperationsLockTestHook(undefined);
      await Promise.all([actionWrite.catch(() => undefined), ...(cancellation ? [cancellation.catch(() => undefined)] : [])]);
    }
  }, 40000);
});
