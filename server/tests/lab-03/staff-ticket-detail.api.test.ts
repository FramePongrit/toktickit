import { randomUUID } from "node:crypto";
import { access, writeFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request, { type Response } from "supertest";
import { app } from "../testApp.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/security/password.js";
import { deleteFileIfPresent, storedFilePath } from "../../src/lib/paths.js";
import { loginAs, TEST_PASSWORD, withAuth, type AuthSessionFixture } from "../support/auth.js";
import { setStaffTicketOperationsLockTestHook } from "../../src/services/staffTicketOperations.service.js";

const prisma = getPrisma();
const suiteTag = randomUUID().slice(0, 8);
const passwordHashPromise = hashPassword(TEST_PASSWORD);
const statuses = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "REOPENED",
  "CLOSED",
  "CANCELLED",
] as const;
type Status = (typeof statuses)[number];

let categoryId: number;
let relatedSystemId: number;
let requesterId: number;
let otherRequesterId: number;
let staffAId: number;
let staffBId: number;
let inactiveStaffId: number;
let adminId: number;
let requesterAuth: AuthSessionFixture;
let otherRequesterAuth: AuthSessionFixture;
let staffAAuth: AuthSessionFixture;
let staffBAuth: AuthSessionFixture;
let adminAuth: AuthSessionFixture;

const ticketIds: number[] = [];
const userIds: number[] = [];
const storedFiles: string[] = [];

function ticketNumber(label: string): string {
  return `TKT-2026-STAFF-DETAIL-${label}-${suiteTag}`;
}

function safeError(response: Response, status: number, code: string): void {
  expect(response.status).toBe(status);
  expect(response.body.error).toMatchObject({ code });
  expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|csrfToken|SELECT|stack|D:\\private/i);
}

function staffDetail(auth: AuthSessionFixture, ticketId: number) {
  return withAuth(request(app).get(`/api/staff/tickets/${ticketId}`), auth, false);
}

function mutate(auth: AuthSessionFixture, method: "patch", path: string) {
  return withAuth(request(app)[method](path), auth);
}

async function waitForPostgresLockWait(backendPid: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<{ wait_event_type: string | null }[]>`
      SELECT "wait_event_type"
      FROM pg_stat_activity
      WHERE pid = ${backendPid}
    `;
    if (rows[0]?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`PostgreSQL backend ${backendPid} did not enter a lock wait.`);
}

async function makeTicket(overrides: {
  status?: Status;
  ownerId?: number | null;
  requestedPriority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  itPriority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  label?: string;
}) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: ticketNumber(overrides.label ?? randomUUID().slice(0, 6)),
      requesterId,
      categoryId,
      relatedSystemId,
      requestedPriority: overrides.requestedPriority ?? "MEDIUM",
      itPriority: overrides.itPriority ?? overrides.requestedPriority ?? "MEDIUM",
      currentStatus: overrides.status ?? "OPEN",
      ownerId: overrides.ownerId === undefined ? staffAId : overrides.ownerId,
      summary: "Staff detail operations fixture",
      description: "A ticket fixture for the Staff Ticket Detail API contract.",
    },
  });
  ticketIds.push(ticket.id);
  return ticket;
}

beforeAll(async () => {
  const [category, relatedSystem] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { active: true }, orderBy: { id: "asc" } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { active: true }, orderBy: { id: "asc" } }),
  ]);
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
  const passwordHash = await passwordHashPromise;
  const [requester, otherRequester, staffA, staffB, inactiveStaff, admin] = await Promise.all([
    prisma.user.create({ data: { fullName: `Detail Requester ${suiteTag}`, email: `detail.requester.${suiteTag}@example.test`, passwordHash } }),
    prisma.user.create({ data: { fullName: `Detail Other Requester ${suiteTag}`, email: `detail.other.${suiteTag}@example.test`, passwordHash } }),
    prisma.user.create({ data: { fullName: `Detail Staff A ${suiteTag}`, email: `detail.staff.a.${suiteTag}@example.test`, role: "STAFF", passwordHash } }),
    prisma.user.create({ data: { fullName: `Detail Staff B ${suiteTag}`, email: `detail.staff.b.${suiteTag}@example.test`, role: "STAFF", passwordHash } }),
    prisma.user.create({ data: { fullName: `Detail Inactive Staff ${suiteTag}`, email: `detail.inactive.${suiteTag}@example.test`, role: "STAFF", active: false, passwordHash } }),
    prisma.user.create({ data: { fullName: `Detail Admin ${suiteTag}`, email: `detail.admin.${suiteTag}@example.test`, role: "ADMIN", passwordHash } }),
  ]);
  requesterId = requester.id;
  otherRequesterId = otherRequester.id;
  staffAId = staffA.id;
  staffBId = staffB.id;
  inactiveStaffId = inactiveStaff.id;
  adminId = admin.id;
  userIds.push(requesterId, otherRequesterId, staffAId, staffBId, inactiveStaffId, adminId);

  requesterAuth = await loginAs(requester.email);
  otherRequesterAuth = await loginAs(otherRequester.email);
  staffAAuth = await loginAs(staffA.email);
  staffBAuth = await loginAs(staffB.email);
  adminAuth = await loginAs(admin.email);
});

afterAll(async () => {
  await prisma.publicComment.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.internalNote.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.attachment.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await Promise.all(storedFiles.map((filename) => deleteFileIfPresent(storedFilePath(filename))));
  await prisma.$disconnect();
});

describe("Issue #57 — Staff Ticket Detail API-S01", () => {
  it("authorizes Staff/Admin detail reads and returns the complete safe detail", async () => {
    const ticket = await makeTicket({ label: "DETAIL" });
    const storedFilename = `staff-detail-${suiteTag}.txt`;
    storedFiles.push(storedFilename);
    await writeFile(storedFilePath(storedFilename), Buffer.from("detail attachment"));
    const attachment = await prisma.attachment.create({
      data: {
        ticketId: ticket.id,
        originalFilename: "detail.txt",
        storedFilename,
        mimeType: "text/plain",
        sizeBytes: 17,
        uploadedByRequesterId: requesterId,
      },
    });
    await prisma.publicComment.create({ data: { ticketId: ticket.id, authorId: requesterId, body: "Public history" } });
    await prisma.internalNote.create({ data: { ticketId: ticket.id, authorId: staffAId, body: "Private history" } });

    for (const auth of [staffAAuth, adminAuth]) {
      const response = await staffDetail(auth, ticket.id);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: ticket.id,
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: "OPEN",
        owner: { id: staffAId, role: "STAFF" },
        requester: { id: requesterId, email: expect.stringContaining("detail.requester") },
        allowedTransitions: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "CANCELLED"],
      });
      expect(response.body.publicComments).toEqual([
        expect.objectContaining({ body: "Public history", author: expect.objectContaining({ id: requesterId, role: "REQUESTER" }) }),
      ]);
      expect(response.body.internalNotes).toEqual([
        expect.objectContaining({ body: "Private history", author: expect.objectContaining({ id: staffAId, role: "STAFF" }) }),
      ]);
      expect(response.body.attachments).toEqual([
        expect.objectContaining({ id: attachment.id, originalFilename: "detail.txt", isRemoved: false }),
      ]);
      expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    }

    safeError(await staffDetail(requesterAuth, ticket.id), 403, "FORBIDDEN");
    safeError(await staffDetail(staffAAuth, 999999999), 404, "TICKET_NOT_FOUND");
  });

  it("allows Staff/Admin attachment metadata and download but not upload or removal", async () => {
    const ticket = await makeTicket({ label: "ATTACHMENT" });
    const storedFilename = `staff-download-${suiteTag}.png`;
    storedFiles.push(storedFilename);
    const bytes = Buffer.from("staff readable bytes");
    await writeFile(storedFilePath(storedFilename), bytes);
    const attachment = await prisma.attachment.create({
      data: {
        ticketId: ticket.id,
        originalFilename: "download.png",
        storedFilename,
        mimeType: "image/png",
        sizeBytes: bytes.length,
        uploadedByRequesterId: requesterId,
      },
    });

    const metadata = await withAuth(request(app).get(`/api/attachments/${attachment.id}`), staffAAuth, false);
    expect(metadata.status).toBe(200);
    const download = await withAuth(request(app).get(`/api/attachments/${attachment.id}/download`), adminAuth, false);
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toContain("image/png");
    expect(download.body).toEqual(bytes);

    safeError(
      await withAuth(request(app).post(`/api/tickets/${ticket.id}/attachments`), staffAAuth).send({}),
      403,
      "FORBIDDEN"
    );
    safeError(
      await withAuth(request(app).patch(`/api/attachments/${attachment.id}/remove`), adminAuth).send({ removalReason: "No" }),
      403,
      "FORBIDDEN"
    );
  });
});

describe("Issue #57 — Claim and Reassign API-S02", () => {
  it("lets exactly one concurrent Claim acquire an unassigned Ticket", async () => {
    const ticket = await makeTicket({ ownerId: null, label: "CLAIM-RACE" });
    const responses = await Promise.all([
      mutate(staffAAuth, "patch", `/api/staff/tickets/${ticket.id}/claim`).send({}),
      mutate(adminAuth, "patch", `/api/staff/tickets/${ticket.id}/claim`).send({}),
    ]);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    const loser = responses.find((response) => response.status === 409);
    expect(loser?.body.error.code).toBe("TICKET_ALREADY_ASSIGNED");
    expect(loser?.body.error.meta.owner).toMatchObject({ role: expect.stringMatching(/STAFF|ADMIN/) });
    const saved = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect([staffAId, adminId]).toContain(saved.ownerId);
    expect(saved.currentStatus).toBe("OPEN");
  });

  it("reassigns only an owned Ticket with an eligible target and protects stale ownership", async () => {
    const ticket = await makeTicket({ label: "REASSIGN" });
    const reassigned = await mutate(staffAAuth, "patch", `/api/staff/tickets/${ticket.id}/owner`).send({
      ownerId: staffBId,
      expectedOwnerId: staffAId,
    });
    expect(reassigned.status).toBe(200);
    expect(reassigned.body.owner).toEqual({ id: staffBId, fullName: expect.stringContaining("Detail Staff B"), role: "STAFF" });
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).currentStatus).toBe("OPEN");

    const stale = await mutate(staffAAuth, "patch", `/api/staff/tickets/${ticket.id}/owner`).send({
      ownerId: adminId,
      expectedOwnerId: staffAId,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toEqual({
      code: "TICKET_OWNER_CHANGED",
      message: "Ticket ownership changed. Refresh and try again.",
      meta: { owner: { id: staffBId, fullName: expect.stringContaining("Detail Staff B"), role: "STAFF" } },
    });
  });

  it("uses parent-row serialization for a controlled concurrent Reassign race", async () => {
    const ticket = await makeTicket({ label: "REASSIGN-RACE" });
    let candidatesReady!: () => void;
    let releaseCandidates!: () => void;
    let candidateCount = 0;
    const bothCandidatesLocked = new Promise<void>((resolve) => {
      candidatesReady = resolve;
    });
    const releaseParentAttempts = new Promise<void>((resolve) => {
      releaseCandidates = resolve;
    });

    setStaffTicketOperationsLockTestHook(async (context) => {
      if (context.ticketId !== ticket.id || context.operation !== "REASSIGN_AFTER_CANDIDATE_LOCK") return;
      candidateCount += 1;
      if (candidateCount === 2) candidatesReady();
      await releaseParentAttempts;
    });

    try {
      const first = mutate(staffAAuth, "patch", `/api/staff/tickets/${ticket.id}/owner`).send({
        ownerId: staffBId,
        expectedOwnerId: staffAId,
      });
      const second = mutate(adminAuth, "patch", `/api/staff/tickets/${ticket.id}/owner`).send({
        ownerId: adminId,
        expectedOwnerId: staffAId,
      });
      void first.then(() => undefined, () => undefined);
      void second.then(() => undefined, () => undefined);
      await bothCandidatesLocked;
      releaseCandidates();
      const responses = await Promise.all([first, second]);
      expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
      const loser = responses.find((response) => response.status === 409);
      expect(loser?.body.error).toMatchObject({
        code: "TICKET_OWNER_CHANGED",
        meta: { owner: expect.objectContaining({ role: expect.stringMatching(/STAFF|ADMIN/) }) },
      });
      const saved = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect([staffBId, adminId]).toContain(saved.ownerId);
    } finally {
      releaseCandidates();
      setStaffTicketOperationsLockTestHook(undefined);
    }
  });

  it("serializes Reassign against target demotion in both BR-35 interleavings", async () => {
    const targetFirstTicket = await makeTicket({ label: "DEMOTION-FIRST" });
    let releaseDemotion!: () => void;
    let demotionLocked!: () => void;
    let demotionBackendPid = 0;
    const demotionMayCommit = new Promise<void>((resolve) => {
      releaseDemotion = resolve;
    });
    const targetLockReady = new Promise<void>((resolve) => {
      demotionLocked = resolve;
    });
    const demotionFirst = prisma.$transaction(async (tx) => {
      const [{ backendPid }] = await tx.$queryRaw<{ backendPid: number }[]>`
        SELECT pg_backend_pid() AS "backendPid"
      `;
      demotionBackendPid = backendPid;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${staffBId} FOR UPDATE`;
      demotionLocked();
      await demotionMayCommit;
      await tx.user.update({ where: { id: staffBId }, data: { role: "REQUESTER" } });
      return "DEMOTION_COMMITTED";
    });

    let allowCandidateAttempt!: () => void;
    let reassignBeforeCandidate!: () => void;
    const candidateAttemptAllowed = new Promise<void>((resolve) => {
      allowCandidateAttempt = resolve;
    });
    const candidateBoundary = new Promise<void>((resolve) => {
      reassignBeforeCandidate = resolve;
    });
    let reassignBackendPid = 0;
    setStaffTicketOperationsLockTestHook(async (context) => {
      if (context.ticketId !== targetFirstTicket.id || context.operation !== "REASSIGN_BEFORE_CANDIDATE_LOCK") return;
      reassignBackendPid = context.backendPid;
      reassignBeforeCandidate();
      await candidateAttemptAllowed;
    });

    try {
      await targetLockReady;
      const pendingReassign = mutate(staffAAuth, "patch", `/api/staff/tickets/${targetFirstTicket.id}/owner`).send({
        ownerId: staffBId,
        expectedOwnerId: staffAId,
      });
      void pendingReassign.then(() => undefined, () => undefined);
      await candidateBoundary;
      allowCandidateAttempt();
      await waitForPostgresLockWait(reassignBackendPid);
      releaseDemotion();
      const response = await pendingReassign;
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("OWNER_NOT_ELIGIBLE");
      expect(await demotionFirst).toBe("DEMOTION_COMMITTED");
      await prisma.user.update({ where: { id: staffBId }, data: { role: "STAFF", active: true } });
    } finally {
      allowCandidateAttempt();
      releaseDemotion();
      setStaffTicketOperationsLockTestHook(undefined);
      await demotionFirst.catch(() => undefined);
      await prisma.user.update({ where: { id: staffBId }, data: { role: "STAFF", active: true } });
    }

    const reassignFirstTicket = await makeTicket({ label: "REASSIGN-FIRST" });
    let releaseParentBoundary!: () => void;
    let candidateLockReady!: () => void;
    const parentBoundaryReleased = new Promise<void>((resolve) => {
      releaseParentBoundary = resolve;
    });
    const candidateLockBoundary = new Promise<void>((resolve) => {
      candidateLockReady = resolve;
    });
    let demotionAttemptStarted!: () => void;
    const demotionAttempt = new Promise<void>((resolve) => {
      demotionAttemptStarted = resolve;
    });
    let secondDemotionBackendPid = 0;

    setStaffTicketOperationsLockTestHook(async (context) => {
      if (context.ticketId !== reassignFirstTicket.id || context.operation !== "REASSIGN_AFTER_CANDIDATE_LOCK") return;
      candidateLockReady();
      await parentBoundaryReleased;
    });

    const pendingReassign = mutate(staffAAuth, "patch", `/api/staff/tickets/${reassignFirstTicket.id}/owner`).send({
      ownerId: staffBId,
      expectedOwnerId: staffAId,
    });
    void pendingReassign.then(() => undefined, () => undefined);
    await candidateLockBoundary;

    const demotionAfterReassign = prisma.$transaction(async (tx) => {
      const [{ backendPid }] = await tx.$queryRaw<{ backendPid: number }[]>`
        SELECT pg_backend_pid() AS "backendPid"
      `;
      secondDemotionBackendPid = backendPid;
      demotionAttemptStarted();
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${staffBId} FOR UPDATE`;
      const ownedNonFinal = await tx.ticket.count({
        where: { ownerId: staffBId, currentStatus: { notIn: ["CLOSED", "CANCELLED"] } },
      });
      return ownedNonFinal > 0 ? "USER_OWNS_NON_FINAL_TICKETS" : "DEMOTION_COMMITTED";
    });

    try {
      await demotionAttempt;
      await waitForPostgresLockWait(secondDemotionBackendPid);
      releaseParentBoundary();
      const response = await pendingReassign;
      expect(response.status).toBe(200);
      expect(response.body.owner.id).toBe(staffBId);
      expect(await demotionAfterReassign).toBe("USER_OWNS_NON_FINAL_TICKETS");
      expect((await prisma.user.findUniqueOrThrow({ where: { id: staffBId } })).role).toBe("STAFF");
    } finally {
      releaseParentBoundary();
      setStaffTicketOperationsLockTestHook(undefined);
      await demotionAfterReassign.catch(() => undefined);
    }
  });

  it("serializes Reassign against real Administrator deactivation in both BR-35 interleavings", async () => {
    const deactivateFirstTicket = await makeTicket({ label: "ADMIN-DEACTIVATE-FIRST" });
    let releaseDeactivation!: () => void;
    let deactivationLocked!: () => void;
    const deactivationMayCommit = new Promise<void>((resolve) => {
      releaseDeactivation = resolve;
    });
    const deactivationHasLock = new Promise<void>((resolve) => {
      deactivationLocked = resolve;
    });
    const deactivationFirst = prisma.$transaction(async (tx) => {
      const [{ backendPid }] = await tx.$queryRaw<{ backendPid: number }[]>`
        SELECT pg_backend_pid() AS "backendPid"
      `;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${adminId} FOR UPDATE`;
      deactivationLocked();
      await deactivationMayCommit;
      await tx.user.update({ where: { id: adminId }, data: { active: false } });
      return backendPid;
    });

    let allowCandidateAttempt!: () => void;
    let reassignBeforeCandidate!: () => void;
    const candidateAttemptAllowed = new Promise<void>((resolve) => {
      allowCandidateAttempt = resolve;
    });
    const candidateBoundary = new Promise<void>((resolve) => {
      reassignBeforeCandidate = resolve;
    });
    let reassignBackendPid = 0;
    setStaffTicketOperationsLockTestHook(async (context) => {
      if (context.ticketId !== deactivateFirstTicket.id || context.operation !== "REASSIGN_BEFORE_CANDIDATE_LOCK") return;
      reassignBackendPid = context.backendPid;
      reassignBeforeCandidate();
      await candidateAttemptAllowed;
    });

    try {
      await deactivationHasLock;
      const pendingReassign = mutate(staffAAuth, "patch", `/api/staff/tickets/${deactivateFirstTicket.id}/owner`).send({
        ownerId: adminId,
        expectedOwnerId: staffAId,
      });
      void pendingReassign.then(() => undefined, () => undefined);
      await candidateBoundary;
      allowCandidateAttempt();
      await waitForPostgresLockWait(reassignBackendPid);
      releaseDeactivation();
      const response = await pendingReassign;
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("OWNER_NOT_ELIGIBLE");
      await deactivationFirst;
      expect((await prisma.user.findUniqueOrThrow({ where: { id: adminId } })).active).toBe(false);
    } finally {
      allowCandidateAttempt();
      releaseDeactivation();
      setStaffTicketOperationsLockTestHook(undefined);
      await deactivationFirst.catch(() => undefined);
      await prisma.user.update({ where: { id: adminId }, data: { active: true } });
    }

    const reassignFirstTicket = await makeTicket({ label: "ADMIN-REASSIGN-FIRST" });
    let releaseParentBoundary!: () => void;
    let candidateLockReady!: () => void;
    const parentBoundaryReleased = new Promise<void>((resolve) => {
      releaseParentBoundary = resolve;
    });
    const candidateLockBoundary = new Promise<void>((resolve) => {
      candidateLockReady = resolve;
    });
    let deactivationAttemptStarted!: () => void;
    const deactivationAttempt = new Promise<void>((resolve) => {
      deactivationAttemptStarted = resolve;
    });

    setStaffTicketOperationsLockTestHook(async (context) => {
      if (context.ticketId !== reassignFirstTicket.id || context.operation !== "REASSIGN_AFTER_CANDIDATE_LOCK") return;
      candidateLockReady();
      await parentBoundaryReleased;
    });

    const pendingReassign = mutate(staffAAuth, "patch", `/api/staff/tickets/${reassignFirstTicket.id}/owner`).send({
      ownerId: adminId,
      expectedOwnerId: staffAId,
    });
    void pendingReassign.then(() => undefined, () => undefined);
    await candidateLockBoundary;

    let deactivationBackendPid = 0;
    const deactivationAfterReassign = prisma.$transaction(async (tx) => {
      const [{ backendPid }] = await tx.$queryRaw<{ backendPid: number }[]>`
        SELECT pg_backend_pid() AS "backendPid"
      `;
      deactivationBackendPid = backendPid;
      deactivationAttemptStarted();
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${adminId} FOR UPDATE`;
      const ownedNonFinal = await tx.ticket.count({
        where: { ownerId: adminId, currentStatus: { notIn: ["CLOSED", "CANCELLED"] } },
      });
      if (ownedNonFinal > 0) return "USER_OWNS_NON_FINAL_TICKETS";
      await tx.user.update({ where: { id: adminId }, data: { active: false } });
      return "DEACTIVATION_COMMITTED";
    });

    try {
      await deactivationAttempt;
      await waitForPostgresLockWait(deactivationBackendPid);
      releaseParentBoundary();
      const response = await pendingReassign;
      expect(response.status).toBe(200);
      expect(response.body.owner.id).toBe(adminId);
      expect(await deactivationAfterReassign).toBe("USER_OWNS_NON_FINAL_TICKETS");
      expect((await prisma.user.findUniqueOrThrow({ where: { id: adminId } })).active).toBe(true);
    } finally {
      releaseParentBoundary();
      setStaffTicketOperationsLockTestHook(undefined);
      await deactivationAfterReassign.catch(() => undefined);
      await prisma.user.update({ where: { id: adminId }, data: { active: true } });
    }
  });

  it("uses the same safe OWNER_NOT_ELIGIBLE response for absent, inactive, and Requester targets", async () => {
    const ticket = await makeTicket({ label: "OWNER-TARGETS" });
    const responses = await Promise.all(
      [999999999, inactiveStaffId, requesterId].map((ownerId) =>
        mutate(staffAAuth, "patch", `/api/staff/tickets/${ticket.id}/owner`).send({ ownerId, expectedOwnerId: staffAId })
      )
    );
    for (const response of responses) {
      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: { code: "OWNER_NOT_ELIGIBLE", message: "Select an active IT Staff member or Administrator." },
      });
    }
  });

  it("checks Final and Unassigned state before Reassign payload/target validation", async () => {
    const unassigned = await makeTicket({ ownerId: null, label: "UNASSIGNED" });
    safeError(
      await mutate(staffAAuth, "patch", `/api/staff/tickets/${unassigned.id}/owner`).send({ ownerId: "bad" }),
      409,
      "TICKET_UNASSIGNED"
    );
    const finalTicket = await makeTicket({ status: "CLOSED", label: "FINAL-OWNER" });
    safeError(
      await mutate(staffAAuth, "patch", `/api/staff/tickets/${finalTicket.id}/owner`).send({ ownerId: requesterId }),
      409,
      "TICKET_FINAL"
    );
  });
});

describe("Issue #57 — IT Priority API-S03", () => {
  it("updates IT Priority independently from Requested Priority", async () => {
    const ticket = await makeTicket({ requestedPriority: "LOW", itPriority: "LOW", label: "PRIORITY" });
    const response = await mutate(staffAAuth, "patch", `/api/staff/tickets/${ticket.id}/it-priority`).send({ itPriority: "URGENT" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ itPriority: "URGENT" });
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { requestedPriority: true, itPriority: true } })).toEqual({ requestedPriority: "LOW", itPriority: "URGENT" });
  });

  it("validates non-final priority but gives Final precedence over an invalid value", async () => {
    const active = await makeTicket({ label: "PRIORITY-VALIDATION" });
    safeError(await mutate(staffAAuth, "patch", `/api/staff/tickets/${active.id}/it-priority`).send({ itPriority: "INVALID" }), 400, "VALIDATION_FAILED");
    const finalTicket = await makeTicket({ status: "CANCELLED", label: "PRIORITY-FINAL" });
    safeError(await mutate(staffAAuth, "patch", `/api/staff/tickets/${finalTicket.id}/it-priority`).send({ itPriority: "INVALID" }), 409, "TICKET_FINAL");
  });

  it("makes an IT Priority mutation lose to a controlled concurrent Final transition", async () => {
    const ticket = await makeTicket({ requestedPriority: "LOW", itPriority: "LOW", label: "PRIORITY-FINAL-RACE" });
    let releaseFinalization!: () => void;
    let finalizerLocked!: () => void;
    const finalizationMayCommit = new Promise<void>((resolve) => {
      releaseFinalization = resolve;
    });
    const finalizerHasLock = new Promise<void>((resolve) => {
      finalizerLocked = resolve;
    });
    let finalizerBackendPid = 0;
    const finalization = prisma.$transaction(async (tx) => {
      const [{ backendPid }] = await tx.$queryRaw<{ backendPid: number }[]>`
        SELECT pg_backend_pid() AS "backendPid"
      `;
      finalizerBackendPid = backendPid;
      await tx.$queryRaw`SELECT "id" FROM "Ticket" WHERE "id" = ${ticket.id} FOR UPDATE`;
      finalizerLocked();
      await finalizationMayCommit;
      await tx.ticket.update({ where: { id: ticket.id }, data: { currentStatus: "CLOSED" } });
    });

    let allowPriorityLock!: () => void;
    let priorityReachedBoundary!: () => void;
    const priorityLockAllowed = new Promise<void>((resolve) => {
      allowPriorityLock = resolve;
    });
    const priorityBoundary = new Promise<void>((resolve) => {
      priorityReachedBoundary = resolve;
    });
    let priorityBackendPid = 0;
    setStaffTicketOperationsLockTestHook(async (context) => {
      if (context.ticketId !== ticket.id || context.operation !== "IT_PRIORITY_BEFORE_PARENT_LOCK") return;
      priorityBackendPid = context.backendPid;
      priorityReachedBoundary();
      await priorityLockAllowed;
    });

    try {
      await finalizerHasLock;
      const pendingPriority = mutate(staffAAuth, "patch", `/api/staff/tickets/${ticket.id}/it-priority`).send({ itPriority: "URGENT" });
      void pendingPriority.then(() => undefined, () => undefined);
      await priorityBoundary;
      allowPriorityLock();
      await waitForPostgresLockWait(priorityBackendPid);
      releaseFinalization();
      const response = await pendingPriority;
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("TICKET_FINAL");
      await finalization;
      expect(await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { currentStatus: true, itPriority: true } })).toEqual({ currentStatus: "CLOSED", itPriority: "LOW" });
    } finally {
      allowPriorityLock();
      releaseFinalization();
      setStaffTicketOperationsLockTestHook(undefined);
      await finalization.catch(() => undefined);
    }
  });
});

describe("Issue #57 — Status API-S04", () => {
  const allowedEdges: Array<[Status, Status]> = [
    ["NEW", "OPEN"], ["NEW", "CANCELLED"],
    ["OPEN", "IN_PROGRESS"], ["OPEN", "WAITING_FOR_REQUESTER"], ["OPEN", "CANCELLED"],
    ["IN_PROGRESS", "WAITING_FOR_REQUESTER"], ["IN_PROGRESS", "RESOLVED"], ["IN_PROGRESS", "CANCELLED"],
    ["WAITING_FOR_REQUESTER", "OPEN"], ["WAITING_FOR_REQUESTER", "IN_PROGRESS"], ["WAITING_FOR_REQUESTER", "CANCELLED"],
    ["RESOLVED", "CLOSED"], ["RESOLVED", "REOPENED"],
    ["REOPENED", "IN_PROGRESS"], ["REOPENED", "WAITING_FOR_REQUESTER"], ["REOPENED", "RESOLVED"], ["REOPENED", "CANCELLED"],
  ];

  it("allows every documented status edge with the Waiting comment rule", async () => {
    for (const [from, to] of allowedEdges) {
      const ticket = await makeTicket({ status: from, label: `EDGE-${from}-${to}` });
      const response = await mutate(staffAAuth, "patch", `/api/staff/tickets/${ticket.id}/status`).send({
        status: to,
        ...(to === "WAITING_FOR_REQUESTER" ? { publicComment: "  Please provide the requested information.  " } : {}),
      });
      expect(response.status, `${from} -> ${to}`).toBe(200);
      expect(response.body.currentStatus).toBe(to);
      if (to === "WAITING_FOR_REQUESTER") {
        expect(await prisma.publicComment.count({ where: { ticketId: ticket.id } })).toBe(1);
        expect((await prisma.publicComment.findFirstOrThrow({ where: { ticketId: ticket.id } })).body).toBe("Please provide the requested information.");
      }
    }
  });

  it("rejects every absent edge and requires an active eligible Owner before status/body validation", async () => {
    for (const from of statuses) {
      const ticket = await makeTicket({ status: from, label: `ABSENT-${from}` });
      const response = await mutate(staffAAuth, "patch", `/api/staff/tickets/${ticket.id}/status`).send({ status: "NEW" });
      expect(response.status, from).toBe(from === "CLOSED" || from === "CANCELLED" ? 409 : (from === "NEW" ? 409 : 409));
      expect(response.body.error.code).toBe(from === "CLOSED" || from === "CANCELLED" ? "TICKET_FINAL" : "INVALID_STATUS_TRANSITION");
    }

    const noOwner = await makeTicket({ ownerId: null, status: "OPEN", label: "NO-OWNER" });
    const response = await mutate(staffAAuth, "patch", `/api/staff/tickets/${noOwner.id}/status`).send({ status: "BROKEN", publicComment: "   " });
    safeError(response, 409, "TICKET_OWNER_REQUIRED");
  });

  it("commits Waiting for Requester and its Public Comment atomically", async () => {
    const ticket = await makeTicket({ status: "OPEN", label: "WAITING-ATOMIC" });
    const invalid = await mutate(staffAAuth, "patch", `/api/staff/tickets/${ticket.id}/status`).send({ status: "WAITING_FOR_REQUESTER", publicComment: "   " });
    safeError(invalid, 400, "VALIDATION_FAILED");
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).currentStatus).toBe("OPEN");
    expect(await prisma.publicComment.count({ where: { ticketId: ticket.id } })).toBe(0);

    const success = await mutate(staffAAuth, "patch", `/api/staff/tickets/${ticket.id}/status`).send({ status: "WAITING_FOR_REQUESTER", publicComment: "Need a reply" });
    expect(success.status).toBe(200);
    expect(success.body.currentStatus).toBe("WAITING_FOR_REQUESTER");
    expect((await prisma.publicComment.findFirstOrThrow({ where: { ticketId: ticket.id } })).authorId).toBe(staffAId);

    const extra = await mutate(staffAAuth, "patch", `/api/staff/tickets/${ticket.id}/status`).send({ status: "OPEN", publicComment: "Not allowed here" });
    safeError(extra, 400, "VALIDATION_FAILED");
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).currentStatus).toBe("WAITING_FOR_REQUESTER");
  });

  it("clears Resolution Indication only on Resolved -> Reopened", async () => {
    const ticket = await makeTicket({ status: "RESOLVED", label: "REOPEN" });
    await prisma.ticket.update({ where: { id: ticket.id }, data: { resolutionIndicatedAt: new Date(), resolutionIndicatedById: requesterId } });
    const response = await mutate(staffAAuth, "patch", `/api/staff/tickets/${ticket.id}/status`).send({ status: "REOPENED" });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ currentStatus: "REOPENED", resolutionIndication: null });
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { resolutionIndicatedAt: true, resolutionIndicatedById: true } })).toEqual({ resolutionIndicatedAt: null, resolutionIndicatedById: null });
  });

  it("keeps Closed and Cancelled Tickets terminal for every Staff mutation", async () => {
    for (const status of ["CLOSED", "CANCELLED"] as const) {
      const ticket = await makeTicket({ status, label: `TERMINAL-${status}` });
      safeError(await mutate(staffAAuth, "patch", `/api/staff/tickets/${ticket.id}/claim`).send({}), 409, "TICKET_FINAL");
      safeError(await mutate(staffAAuth, "patch", `/api/staff/tickets/${ticket.id}/owner`).send({ ownerId: requesterId, expectedOwnerId: staffAId }), 409, "TICKET_FINAL");
      safeError(await mutate(staffAAuth, "patch", `/api/staff/tickets/${ticket.id}/it-priority`).send({ itPriority: "INVALID" }), 409, "TICKET_FINAL");
      safeError(await mutate(staffAAuth, "patch", `/api/staff/tickets/${ticket.id}/status`).send({ status: "REOPENED", publicComment: "" }), 409, "TICKET_FINAL");
    }
  });
});
