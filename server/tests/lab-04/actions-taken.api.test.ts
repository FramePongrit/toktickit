import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../testApp.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/security/password.js";
import { loginAs, TEST_PASSWORD, withAuth, type AuthSessionFixture } from "../support/auth.js";

const prisma = getPrisma();
const suiteTag = randomUUID().slice(0, 8);
const passwordHashPromise = hashPassword(TEST_PASSWORD);
let requesterId: number;
let otherRequesterId: number;
let staffAId: number;
let staffBId: number;
let inactiveStaffId: number;
let categoryId: number;
let relatedSystemId: number;
let requesterAuth: AuthSessionFixture;
let otherRequesterAuth: AuthSessionFixture;
let staffAAuth: AuthSessionFixture;
let staffBAuth: AuthSessionFixture;
const userIds: number[] = [];
const ticketIds: number[] = [];

function makeTicketNumber(): string {
  return `TKT-2026-L4A-${suiteTag}-${randomUUID().slice(0, 6)}`;
}

async function makeTicket(options: { status?: "NEW" | "OPEN" | "RESOLVED" | "CLOSED"; ownerId?: number | null } = {}) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: makeTicketNumber(),
      requesterId,
      categoryId,
      relatedSystemId,
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: options.status ?? "OPEN",
      ownerId: options.ownerId ?? null,
      summary: "Lab 4 Action API fixture",
      description: "A task-owned Action API test Ticket.",
    },
  });
  ticketIds.push(ticket.id);
  return ticket;
}

function staffPost(ticketId: number, auth = staffAAuth, key = randomUUID()) {
  return withAuth(request(app).post(`/api/staff/tickets/${ticketId}/actions`), auth)
    .set("Idempotency-Key", key);
}

function createBody(expectedTicketVersion: number, description = "Inspect the workstation") {
  return { expectedTicketVersion, description };
}

beforeAll(async () => {
  const [category, relatedSystem] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { active: true }, orderBy: { id: "asc" } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { active: true }, orderBy: { id: "asc" } }),
  ]);
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
  const passwordHash = await passwordHashPromise;
  const [requester, otherRequester, staffA, staffB, inactiveStaff] = await Promise.all([
    prisma.user.create({ data: { fullName: `Action Requester ${suiteTag}`, email: `l4a.req.${suiteTag}@example.test`, passwordHash } }),
    prisma.user.create({ data: { fullName: `Other Action Requester ${suiteTag}`, email: `l4a.other.${suiteTag}@example.test`, passwordHash } }),
    prisma.user.create({ data: { fullName: `Action Staff A ${suiteTag}`, email: `l4a.staff.a.${suiteTag}@example.test`, role: "STAFF", passwordHash } }),
    prisma.user.create({ data: { fullName: `Action Staff B ${suiteTag}`, email: `l4a.staff.b.${suiteTag}@example.test`, role: "STAFF", passwordHash } }),
    prisma.user.create({ data: { fullName: `Inactive Action Staff ${suiteTag}`, email: `l4a.inactive.${suiteTag}@example.test`, role: "STAFF", active: false, passwordHash } }),
  ]);
  requesterId = requester.id;
  otherRequesterId = otherRequester.id;
  staffAId = staffA.id;
  staffBId = staffB.id;
  inactiveStaffId = inactiveStaff.id;
  userIds.push(requesterId, otherRequesterId, staffAId, staffBId, inactiveStaffId);
  [requesterAuth, otherRequesterAuth, staffAAuth, staffBAuth] = await Promise.all([
    loginAs(requester.email), loginAs(otherRequester.email), loginAs(staffA.email), loginAs(staffB.email),
  ]);
});

afterAll(async () => {
  await prisma.idempotencyRecord.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.ticketWorkflowEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.actionRevision.deleteMany({ where: { action: { ticketId: { in: ticketIds } } } });
  await prisma.actionTaken.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.publicComment.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.internalNote.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("Issue #86 — Action API and audit", () => {
  it("creates a default Planned Action, supports collaboration, and serves paginated Staff and safe Requester reads", async () => {
    const ticket = await makeTicket();
    const key = randomUUID();
    const body = { ...createBody(1), assigneeId: staffBId };
    const created = await staffPost(ticket.id, staffAAuth, key).send(body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      ticketVersion: 2,
      action: {
        ticketId: ticket.id,
        workCycle: 1,
        status: "PLANNED",
        description: "Inspect the workstation",
        assignee: { id: staffBId },
        createdBy: { id: staffAId },
        assigneeEligible: true,
        version: 1,
        permissions: { canEdit: true, allowedTransitions: ["IN_PROGRESS", "COMPLETED", "CANCELLED"] },
      },
    });
    const actionId = created.body.action.id as number;
    const revision = await prisma.actionRevision.findFirstOrThrow({ where: { actionId } });
    expect(revision).toMatchObject({ sequence: 1, operation: "CREATE", actorId: staffAId, before: null });
    expect((revision.after as { assigneeId: number }).assigneeId).toBe(staffBId);

    const replay = await staffPost(ticket.id, staffAAuth, key).send(body);
    expect(replay.status).toBe(201);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(replay.body).toEqual(created.body);
    expect(await prisma.actionRevision.count({ where: { actionId } })).toBe(1);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).version).toBe(2);

    const changedBody = await staffPost(ticket.id, staffAAuth, key).send({ ...body, description: "Different data" });
    expect(changedBody.status).toBe(409);
    expect(changedBody.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");

    for (const query of ["", "?page=1&pageSize=10"]) {
      const list = await withAuth(request(app).get(`/api/staff/tickets/${ticket.id}/actions${query}`), staffAAuth, false);
      expect(list.status).toBe(200);
      expect(list.body).toMatchObject({ total: 1, ticketVersion: 2, workCycle: 1, data: [expect.objectContaining({ id: actionId })] });
    }
    const detail = await withAuth(request(app).get(`/api/staff/tickets/${ticket.id}/actions/${actionId}`), staffBAuth, false);
    expect(detail.status).toBe(200);
    expect(detail.body.action.id).toBe(actionId);
    for (const query of ["", "?page=1&pageSize=10"]) {
      const history = await withAuth(request(app).get(`/api/staff/tickets/${ticket.id}/actions/${actionId}/history${query}`), staffAAuth, false);
      expect(history.status).toBe(200);
      expect(history.body.total).toBe(1);
      expect(history.body.data).toHaveLength(1);
      expect(history.body.data[0].sequence).toBe(1);
      expect(history.body.data[0].actor.id).toBe(staffAId);
    }

    const requesterTicket = await makeTicket();
    await prisma.ticket.update({ where: { id: requesterTicket.id }, data: { requesterId } });
    const requesterAction = await staffPost(requesterTicket.id).send(createBody(1));
    expect(requesterAction.status).toBe(201);
    const requesterList = await withAuth(request(app).get(`/api/tickets/${requesterTicket.id}/actions?page=1&pageSize=10`), requesterAuth, false);
    expect(requesterList.status).toBe(200);
    expect(requesterList.body.data[0]).not.toHaveProperty("version");
    expect(requesterList.body.data[0]).not.toHaveProperty("permissions");
    expect(requesterList.body.data[0]).not.toHaveProperty("assigneeEligible");
    const foreign = await withAuth(request(app).get(`/api/tickets/${requesterTicket.id}/actions`), otherRequesterAuth, false);
    expect(foreign.status).toBe(404);
    const requesterHistory = await withAuth(request(app).get(`/api/staff/tickets/${requesterTicket.id}/actions/${requesterAction.body.action.id}/history`), requesterAuth, false);
    expect(requesterHistory.status).toBe(403);
  });

  it("denies Requester writes, requires CSRF for Staff writes, and scopes Action ids to their Ticket", async () => {
    const ticket = await makeTicket();
    const otherTicket = await makeTicket();
    const created = await staffPost(ticket.id).send(createBody(1));
    expect(created.status).toBe(201);
    const actionId = created.body.action.id as number;

    const requesterCreate = await withAuth(request(app).post(`/api/staff/tickets/${ticket.id}/actions`), requesterAuth)
      .set("Idempotency-Key", randomUUID())
      .send(createBody(2, "Requester must not create Actions"));
    expect(requesterCreate.status).toBe(403);
    expect(requesterCreate.body.error.code).toBe("FORBIDDEN");

    const requesterPatch = await withAuth(request(app).patch(`/api/staff/tickets/${ticket.id}/actions/${actionId}`), requesterAuth)
      .send({ expectedTicketVersion: 2, expectedActionVersion: 1, description: "Requester must not edit Actions" });
    expect(requesterPatch.status).toBe(403);
    expect(requesterPatch.body.error.code).toBe("FORBIDDEN");

    const missingCsrf = await withAuth(request(app).patch(`/api/staff/tickets/${ticket.id}/actions/${actionId}`), staffAAuth, false)
      .send({ expectedTicketVersion: 2, expectedActionVersion: 1, description: "Missing CSRF token" });
    expect(missingCsrf.status).toBe(403);
    expect(missingCsrf.body.error.code).toBe("CSRF_INVALID");

    const foreignRead = await withAuth(request(app).get(`/api/staff/tickets/${otherTicket.id}/actions/${actionId}`), staffAAuth, false);
    expect(foreignRead.status).toBe(404);
    expect(foreignRead.body.error.code).toBe("ACTION_NOT_FOUND");
    const foreignPatch = await withAuth(request(app).patch(`/api/staff/tickets/${otherTicket.id}/actions/${actionId}`), staffAAuth)
      .send({ expectedTicketVersion: 1, expectedActionVersion: 1, description: "Cross-ticket Action id" });
    expect(foreignPatch.status).toBe(404);
    expect(foreignPatch.body.error.code).toBe("ACTION_NOT_FOUND");

    expect(await prisma.actionRevision.count({ where: { actionId } })).toBe(1);
    expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: actionId }, select: { description: true, version: true } })).toEqual({
      description: "Inspect the workstation",
      version: 1,
    });
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).version).toBe(2);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: otherTicket.id } })).version).toBe(1);
  });

  it("validates dates, effective follow-up values, and assignee eligibility without partial writes", async () => {
    const ticket = await makeTicket();
    const badFollowUp = await staffPost(ticket.id).send({ ...createBody(1), followUpRequired: true });
    expect(badFollowUp.status).toBe(400);
    expect(badFollowUp.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: "followUpNote" })]));
    const beforeTicket = await staffPost(ticket.id).send({ ...createBody(1), actionAt: "2020-01-01T00:00:00.000Z" });
    expect(beforeTicket.status).toBe(400);
    const ineligible = await staffPost(ticket.id).send({ ...createBody(1), assigneeId: inactiveStaffId });
    expect(ineligible.status).toBe(409);
    expect(ineligible.body.error.code).toBe("ASSIGNEE_NOT_ELIGIBLE");
    expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(0);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).version).toBe(1);

    const textTicket = await makeTicket();
    const xss = await staffPost(textTicket.id).send({
      expectedTicketVersion: 1,
      description: "  <script>alert(1)</script>  ",
      followUpNote: "   ",
      attachmentNotes: "",
    });
    expect(xss.status).toBe(201);
    expect(xss.body.action).toMatchObject({ description: "<script>alert(1)</script>", followUpNote: null, attachmentNotes: null });
  });

  it("audits edits, enforces expected versions and completes with the actual collaborating performer", async () => {
    const ticket = await makeTicket();
    const created = await staffPost(ticket.id).send({ ...createBody(1), assigneeId: staffBId, followUpRequired: true, followUpNote: "Verify with requester" });
    const actionId = created.body.action.id as number;
    const edited = await withAuth(request(app).patch(`/api/staff/tickets/${ticket.id}/actions/${actionId}`), staffAAuth)
      .send({ expectedTicketVersion: 2, expectedActionVersion: 1, description: "  Repaired the connection  " });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ ticketVersion: 3, action: { description: "Repaired the connection", version: 2, followUpRequired: true, followUpNote: "Verify with requester" } });
    const revisions = await prisma.actionRevision.findMany({ where: { actionId }, orderBy: { sequence: "asc" } });
    expect(revisions).toHaveLength(2);
    expect(revisions[1]).toMatchObject({ sequence: 2, operation: "EDIT", actorId: staffAId });
    expect((revisions[1].before as { description: string }).description).toBe("Inspect the workstation");
    expect((revisions[1].after as { description: string }).description).toBe("Repaired the connection");

    const stale = await withAuth(request(app).patch(`/api/staff/tickets/${ticket.id}/actions/${actionId}`), staffAAuth)
      .send({ expectedTicketVersion: 2, expectedActionVersion: 1, description: "Lost update" });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ code: "STALE_TICKET_VERSION", meta: { currentVersion: 3 } });
    const invalidEffective = await withAuth(request(app).patch(`/api/staff/tickets/${ticket.id}/actions/${actionId}`), staffAAuth)
      .send({ expectedTicketVersion: 3, expectedActionVersion: 2, followUpNote: null });
    expect(invalidEffective.status).toBe(400);
    expect(invalidEffective.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: "followUpNote" })]));

    const started = await withAuth(request(app).post(`/api/staff/tickets/${ticket.id}/actions/${actionId}/transitions`), staffAAuth)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedTicketVersion: 3, expectedActionVersion: 2, status: "IN_PROGRESS" });
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    expect(started.body.action).toMatchObject({ status: "IN_PROGRESS", performedBy: null, version: 3 });
    const completedKey = randomUUID();
    const completed = await withAuth(request(app).post(`/api/staff/tickets/${ticket.id}/actions/${actionId}/transitions`), staffAAuth)
      .set("Idempotency-Key", completedKey)
      .send({ expectedTicketVersion: 4, expectedActionVersion: 3, status: "COMPLETED", result: "Connection restored", followUpRequired: false });
    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({ ticketVersion: 5, action: { status: "COMPLETED", performedBy: { id: staffAId }, assignee: { id: staffBId }, completedAt: expect.any(String), followUpRequired: false, version: 4 } });
    const retry = await withAuth(request(app).post(`/api/staff/tickets/${ticket.id}/actions/${actionId}/transitions`), staffAAuth)
      .set("Idempotency-Key", completedKey)
      .send({ status: "COMPLETED", result: "Connection restored", followUpRequired: false, expectedActionVersion: 3, expectedTicketVersion: 4 });
    expect(retry.status).toBe(200);
    expect(retry.headers["idempotency-replayed"]).toBe("true");
    expect(retry.body).toEqual(completed.body);
    expect(await prisma.actionRevision.count({ where: { actionId } })).toBe(4);

    const terminalWithoutReason = await withAuth(request(app).patch(`/api/staff/tickets/${ticket.id}/actions/${actionId}`), staffAAuth)
      .send({ expectedTicketVersion: 5, expectedActionVersion: 4, description: "Clarified result" });
    expect(terminalWithoutReason.status).toBe(400);
    const corrected = await withAuth(request(app).patch(`/api/staff/tickets/${ticket.id}/actions/${actionId}`), staffAAuth)
      .send({ expectedTicketVersion: 5, expectedActionVersion: 4, description: "Clarified result", correctionReason: "Clarified the record after review" });
    expect(corrected.status).toBe(200);
    expect(corrected.body).toMatchObject({ ticketVersion: 6, action: { version: 5, description: "Clarified result", status: "COMPLETED" } });
    expect((await prisma.actionRevision.findFirstOrThrow({ where: { actionId, sequence: 5 } })).reason).toBe("Clarified the record after review");
    const terminalReassign = await withAuth(request(app).patch(`/api/staff/tickets/${ticket.id}/actions/${actionId}`), staffAAuth)
      .send({ expectedTicketVersion: 6, expectedActionVersion: 5, assigneeId: staffAId, correctionReason: "Must remain immutable" });
    expect(terminalReassign.status).toBe(400);
    expect(await prisma.actionRevision.count({ where: { actionId } })).toBe(5);
  });

  it("allows direct Planned completion, requires a cancellation reason, and keeps earlier cycles read-only", async () => {
    const ticket = await makeTicket();
    const direct = await staffPost(ticket.id).send({ ...createBody(1), assigneeId: staffBId });
    const directId = direct.body.action.id as number;
    const missingResult = await withAuth(request(app).post(`/api/staff/tickets/${ticket.id}/actions/${directId}/transitions`), staffAAuth)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedTicketVersion: 2, expectedActionVersion: 1, status: "COMPLETED" });
    expect(missingResult.status).toBe(400);
    const completed = await withAuth(request(app).post(`/api/staff/tickets/${ticket.id}/actions/${directId}/transitions`), staffAAuth)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedTicketVersion: 2, expectedActionVersion: 1, status: "COMPLETED", result: "Connection restored" });
    expect(completed.status).toBe(200);
    expect(completed.body.action).toMatchObject({ status: "COMPLETED", assignee: { id: staffBId }, performedBy: { id: staffAId } });

    const invalidTerminalEdge = await withAuth(request(app).post(`/api/staff/tickets/${ticket.id}/actions/${directId}/transitions`), staffAAuth)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedTicketVersion: 3, expectedActionVersion: 2, status: "IN_PROGRESS" });
    expect(invalidTerminalEdge.status).toBe(409);
    expect(invalidTerminalEdge.body.error.code).toBe("INVALID_ACTION_TRANSITION");
    expect(await prisma.actionRevision.count({ where: { actionId: directId } })).toBe(2);
    expect((await prisma.actionTaken.findUniqueOrThrow({ where: { id: directId }, select: { status: true, version: true } })).status).toBe("COMPLETED");
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).version).toBe(3);

    const toCancel = await staffPost(ticket.id).send({ ...createBody(3), description: "Cancel this operation" });
    const cancelId = toCancel.body.action.id as number;
    const missingReason = await withAuth(request(app).post(`/api/staff/tickets/${ticket.id}/actions/${cancelId}/transitions`), staffAAuth)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedTicketVersion: 4, expectedActionVersion: 1, status: "CANCELLED" });
    expect(missingReason.status).toBe(400);
    const cancelled = await withAuth(request(app).post(`/api/staff/tickets/${ticket.id}/actions/${cancelId}/transitions`), staffAAuth)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedTicketVersion: 4, expectedActionVersion: 1, status: "CANCELLED", cancelReason: "Duplicate task" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.action).toMatchObject({ status: "CANCELLED", cancelledBy: { id: staffAId }, cancelReason: "Duplicate task", cancelledAt: expect.any(String), performedBy: null });

    await prisma.ticket.update({ where: { id: ticket.id }, data: { workCycle: 2 } });
    const oldCycle = await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        workCycle: 1,
        description: "Historical cycle Action",
        actionAt: ticket.createdAt,
        assigneeId: staffBId,
        createdById: staffAId,
      },
    });
    const staleCycle = await withAuth(request(app).patch(`/api/staff/tickets/${ticket.id}/actions/${oldCycle.id}`), staffAAuth)
      .send({ expectedTicketVersion: 5, expectedActionVersion: 1, description: "Attempt old-cycle write" });
    expect(staleCycle.status).toBe(409);
    expect(staleCycle.body.error.code).toBe("ACTION_CYCLE_READ_ONLY");
    const earlierCycleRead = await withAuth(request(app).get(`/api/tickets/${ticket.id}/actions`), requesterAuth, false);
    expect(earlierCycleRead.status).toBe(200);
    expect(earlierCycleRead.body.data.some((action: { id: number; workCycle: number }) => action.id === oldCycle.id && action.workCycle === 1)).toBe(true);
  });

  it("rejects Action writes on Resolved and final parent Tickets before malformed fields", async () => {
    for (const status of ["RESOLVED", "CLOSED"] as const) {
      const ticket = await makeTicket({ status });
      const response = await staffPost(ticket.id).send({ expectedTicketVersion: 1, status: "BROKEN" });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(status === "RESOLVED" ? "TICKET_ACTIONS_READ_ONLY" : "TICKET_FINAL");
      expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(0);
    }
  });
});
