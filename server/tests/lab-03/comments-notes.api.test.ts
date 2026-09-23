import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request, { type Response } from "supertest";
import { app } from "../testApp.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/security/password.js";
import { loginAs, TEST_PASSWORD, withAuth, type AuthSessionFixture } from "../support/auth.js";
import {
  clearResolutionIndicationOnReopened,
  setCommunicationsLockTestHook,
} from "../../src/services/communications.service.js";

const prisma = getPrisma();
const suiteTag = randomUUID();

let categoryId: number;
let relatedSystemId: number;
let requesterAId: number;
let requesterBId: number;
let staffId: number;
let adminId: number;
let activeTicketId: number;
let resolvedTicketId: number;
let closedTicketId: number;
let cancelledTicketId: number;
let requesterAAuth: AuthSessionFixture;
let requesterBAuth: AuthSessionFixture;
let staffAuth: AuthSessionFixture;
let adminAuth: AuthSessionFixture;
const raceTicketIds: number[] = [];

function ticketNumber(label: string): string {
  return `TKT-2026-COMMS-${label}-${suiteTag.slice(0, 8)}`;
}

function iso(value: unknown): void {
  expect(typeof value).toBe("string");
  expect(Number.isNaN(Date.parse(value as string))).toBe(false);
}

async function raceMutationAgainstFinalization(
  finalStatus: "CLOSED" | "CANCELLED",
  label: string,
  mutation: (ticketId: number) => Promise<Response>
): Promise<{ ticketId: number; response: Response }> {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: ticketNumber(`RACE-${finalStatus}-${label}`),
      requesterId: requesterAId,
      categoryId,
      relatedSystemId,
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "OPEN",
      summary: `Finalization race ${finalStatus}`,
      description: "A controlled parent-row lock race for Issue 53.",
    },
  });
  raceTicketIds.push(ticket.id);

  let releaseFinalization!: () => void;
  let signalLockAcquired!: () => void;
  let allowMutationToAttemptLock!: () => void;
  let signalMutationBeforeLock!: () => void;
  let mutationBackendPid: number | undefined;
  const lockAcquired = new Promise<void>((resolve) => {
    signalLockAcquired = resolve;
  });
  const finalizationMayCommit = new Promise<void>((resolve) => {
    releaseFinalization = resolve;
  });
  const mutationBeforeLock = new Promise<void>((resolve) => {
    signalMutationBeforeLock = resolve;
  });
  const mutationMayAttemptLock = new Promise<void>((resolve) => {
    allowMutationToAttemptLock = resolve;
  });

  const finalization = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Ticket" WHERE "id" = ${ticket.id} FOR UPDATE`;
    signalLockAcquired();
    await finalizationMayCommit;
    await tx.ticket.update({ where: { id: ticket.id }, data: { currentStatus: finalStatus } });
  });

  try {
    // The finalizer owns the parent row before the mutation is sent. The
    // narrowly scoped service hook proves that the mutation transaction has
    // reached the lock boundary and supplies its PostgreSQL backend PID.
    await lockAcquired;
    setCommunicationsLockTestHook(async (context) => {
      if (context.ticketId !== ticket.id) return;
      mutationBackendPid = context.backendPid;
      signalMutationBeforeLock();
      await mutationMayAttemptLock;
    });

    const pendingMutation = mutation(ticket.id);
    // Supertest's Test is thenable and starts lazily. Attach a no-op handler
    // so the HTTP request reaches the service lock boundary before the
    // observable PostgreSQL wait-state barrier is polled below.
    void pendingMutation.then(
      () => undefined,
      () => undefined
    );
    await mutationBeforeLock;
    allowMutationToAttemptLock();

    // Observe PostgreSQL's actual wait state before releasing the finalizer;
    // this is the synchronization point, not a wall-clock sleep.
    const waitDeadline = Date.now() + 5000;
    let observedLockWait = false;
    while (Date.now() < waitDeadline) {
      const activity = await prisma.$queryRaw<{ wait_event_type: string | null }[]>`
        SELECT "wait_event_type"
        FROM pg_stat_activity
        WHERE pid = ${mutationBackendPid}
      `;
      if (activity[0]?.wait_event_type === "Lock") {
        observedLockWait = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(observedLockWait).toBe(true);

    releaseFinalization();
    const response = await pendingMutation;
    await finalization;
    return { ticketId: ticket.id, response };
  } finally {
    setCommunicationsLockTestHook(undefined);
    releaseFinalization();
    await finalization.catch(() => undefined);
  }
}

beforeAll(async () => {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const [category, relatedSystem, requesterA, requesterB, staff, admin] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { active: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { active: true } }),
    prisma.user.create({
      data: {
        fullName: "Communications Requester A",
        email: `communications-requester-a-${suiteTag}@example.test`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        fullName: "Communications Requester B",
        email: `communications-requester-b-${suiteTag}@example.test`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        fullName: "Communications Staff",
        email: `communications-staff-${suiteTag}@example.test`,
        role: "STAFF",
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        fullName: "Communications Administrator",
        email: `communications-admin-${suiteTag}@example.test`,
        role: "ADMIN",
        passwordHash,
      },
    }),
  ]);

  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
  requesterAId = requesterA.id;
  requesterBId = requesterB.id;
  staffId = staff.id;
  adminId = admin.id;
  requesterAAuth = await loginAs(requesterA.email);
  requesterBAuth = await loginAs(requesterB.email);
  staffAuth = await loginAs(staff.email);
  adminAuth = await loginAs(admin.email);

  const [active, resolved, closed, cancelled] = await Promise.all([
    prisma.ticket.create({
      data: {
        ticketNumber: ticketNumber("ACTIVE"),
        requesterId: requesterAId,
        categoryId,
        relatedSystemId,
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: "OPEN",
        summary: "Communication active ticket",
        description: "An active ticket for communication and indication tests.",
      },
    }),
    prisma.ticket.create({
      data: {
        ticketNumber: ticketNumber("RESOLVED"),
        requesterId: requesterAId,
        categoryId,
        relatedSystemId,
        requestedPriority: "HIGH",
        itPriority: "HIGH",
        currentStatus: "RESOLVED",
        summary: "Communication resolved ticket",
        description: "A Resolved ticket remains non-final for communication tests.",
      },
    }),
    prisma.ticket.create({
      data: {
        ticketNumber: ticketNumber("CLOSED"),
        requesterId: requesterAId,
        categoryId,
        relatedSystemId,
        requestedPriority: "LOW",
        itPriority: "LOW",
        currentStatus: "CLOSED",
        summary: "Communication closed ticket",
        description: "A Closed ticket is final and read-only for new mutations.",
      },
    }),
    prisma.ticket.create({
      data: {
        ticketNumber: ticketNumber("CANCELLED"),
        requesterId: requesterAId,
        categoryId,
        relatedSystemId,
        requestedPriority: "LOW",
        itPriority: "LOW",
        currentStatus: "CANCELLED",
        summary: "Communication cancelled ticket",
        description: "A Cancelled ticket is final and read-only for new mutations.",
      },
    }),
  ]);
  activeTicketId = active.id;
  resolvedTicketId = resolved.id;
  closedTicketId = closed.id;
  cancelledTicketId = cancelled.id;
});

afterAll(async () => {
  const ticketIds = [activeTicketId, resolvedTicketId, closedTicketId, cancelledTicketId, ...raceTicketIds];
  await prisma.publicComment.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.internalNote.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: [requesterAId, requesterBId, staffId, adminId] } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [requesterAId, requesterBId, staffId, adminId] } } });
  await prisma.$disconnect();
});

describe("Issue #53 — Public Comments", () => {
  it("allows the owner and Staff/Admin to append and read chronological plain-text comments", async () => {
    const first = await withAuth(
      request(app)
        .post(`/api/tickets/${activeTicketId}/comments`)
        .send({
          body: "  first <b>literal</b> comment  ",
          authorId: staffId,
          createdAt: "1900-01-01T00:00:00.000Z",
        }),
      requesterAAuth
    );
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ body: "first <b>literal</b> comment", author: { id: requesterAId, role: "REQUESTER" } });
    expect(first.body.author.email).toBeUndefined();
    iso(first.body.createdAt);

    const second = await withAuth(
      request(app)
        .post(`/api/tickets/${activeTicketId}/comments`)
        .send({ body: "  second comment  " }),
      staffAuth
    );
    expect(second.status).toBe(201);
    expect(second.body.author).toMatchObject({ id: staffId, role: "STAFF" });

    const requesterRead = await withAuth(request(app).get(`/api/tickets/${activeTicketId}/comments`), requesterAAuth, false);
    expect(requesterRead.status).toBe(200);
    expect(requesterRead.body.data.map((comment: { body: string }) => comment.body)).toEqual([
      "first <b>literal</b> comment",
      "second comment",
    ]);
    expect(requesterRead.body.data[0].createdAt <= requesterRead.body.data[1].createdAt).toBe(true);

    const adminRead = await withAuth(request(app).get(`/api/tickets/${activeTicketId}/comments`), adminAuth, false);
    expect(adminRead.status).toBe(200);
    expect(adminRead.body.data).toHaveLength(2);
  });

  it("returns the same safe 404 for another Requester's Ticket and comments", async () => {
    const missing = await withAuth(request(app).get("/api/tickets/999999/comments"), requesterBAuth, false);
    const foreignRead = await withAuth(request(app).get(`/api/tickets/${activeTicketId}/comments`), requesterBAuth, false);
    const foreignWrite = await withAuth(
      request(app).post(`/api/tickets/${activeTicketId}/comments`).send({ body: "not allowed" }),
      requesterBAuth
    );

    expect(missing.status).toBe(404);
    expect(foreignRead.body).toEqual(missing.body);
    expect(foreignWrite.body).toEqual(missing.body);
    expect(foreignRead.body.error.code).toBe("TICKET_NOT_FOUND");
  });

  it("rejects invalid Public Comments and keeps the append-only API free of edit/delete routes", async () => {
    const whitespace = await withAuth(
      request(app).post(`/api/tickets/${activeTicketId}/comments`).send({ body: "   " }),
      requesterAAuth
    );
    const tooLong = await withAuth(
      request(app).post(`/api/tickets/${activeTicketId}/comments`).send({ body: "x".repeat(2001) }),
      requesterAAuth
    );
    const minimum = await withAuth(
      request(app).post(`/api/tickets/${activeTicketId}/comments`).send({ body: "x" }),
      requesterAAuth
    );
    const maximum = await withAuth(
      request(app).post(`/api/tickets/${activeTicketId}/comments`).send({ body: "x".repeat(2000) }),
      requesterAAuth
    );
    const edit = await withAuth(request(app).patch(`/api/tickets/${activeTicketId}/comments/1`).send({ body: "changed" }), requesterAAuth);
    const remove = await withAuth(request(app).delete(`/api/tickets/${activeTicketId}/comments/1`), requesterAAuth);

    expect(whitespace.status).toBe(400);
    expect(tooLong.status).toBe(400);
    expect(minimum.status).toBe(201);
    expect(maximum.status).toBe(201);
    expect(edit.status).toBe(404);
    expect(remove.status).toBe(404);
  });
});

describe("Issue #53 — Internal Notes", () => {
  it("allows only Staff/Admin to append and read chronological Internal Notes", async () => {
    const staffPost = await withAuth(
      request(app).post(`/api/staff/tickets/${activeTicketId}/notes`).send({ body: "  staff-only note  " }),
      staffAuth
    );
    const adminPost = await withAuth(
      request(app).post(`/api/staff/tickets/${activeTicketId}/notes`).send({ body: "admin-only note" }),
      adminAuth
    );
    const staffRead = await withAuth(request(app).get(`/api/staff/tickets/${activeTicketId}/notes`), staffAuth, false);
    const requesterRead = await withAuth(request(app).get(`/api/staff/tickets/${activeTicketId}/notes`), requesterAAuth, false);
    const requesterPost = await withAuth(
      request(app).post(`/api/staff/tickets/${activeTicketId}/notes`).send({ body: "must not be visible" }),
      requesterAAuth
    );

    expect(staffPost.status).toBe(201);
    expect(adminPost.status).toBe(201);
    expect(staffRead.status).toBe(200);
    expect(staffRead.body.data.map((note: { body: string }) => note.body)).toEqual(["staff-only note", "admin-only note"]);
    expect(staffRead.body.data[0].author.email).toBeUndefined();
    expect(requesterRead.status).toBe(403);
    expect(JSON.stringify(requesterRead.body)).not.toContain("staff-only note");
    expect(requesterPost.status).toBe(403);
  });

  it("validates Internal Note boundaries and does not permit unauthenticated access", async () => {
    const whitespace = await withAuth(
      request(app).post(`/api/staff/tickets/${activeTicketId}/notes`).send({ body: " " }),
      staffAuth
    );
    const tooLong = await withAuth(
      request(app).post(`/api/staff/tickets/${activeTicketId}/notes`).send({ body: "n".repeat(2001) }),
      staffAuth
    );
    const unauthenticated = await request(app).get(`/api/staff/tickets/${activeTicketId}/notes`);

    expect(whitespace.status).toBe(400);
    expect(tooLong.status).toBe(400);
    expect(unauthenticated.status).toBe(401);
  });
});

describe("Issue #53 — finality and Resolution Indication", () => {
  it("allows historical reads but rejects new messages on Closed and Cancelled Tickets before body validation", async () => {
    await prisma.publicComment.create({ data: { ticketId: closedTicketId, authorId: requesterAId, body: "historical public comment" } });
    await prisma.internalNote.create({ data: { ticketId: closedTicketId, authorId: staffId, body: "historical internal note" } });
    const closedPublicRead = await withAuth(request(app).get(`/api/tickets/${closedTicketId}/comments`), requesterAAuth, false);
    const closedNotesRead = await withAuth(request(app).get(`/api/staff/tickets/${closedTicketId}/notes`), staffAuth, false);
    const closedComment = await withAuth(request(app).post(`/api/tickets/${closedTicketId}/comments`).send({ body: " " }), requesterAAuth);
    const cancelledNote = await withAuth(request(app).post(`/api/staff/tickets/${cancelledTicketId}/notes`).send({ body: " " }), staffAuth);

    expect(closedPublicRead.status).toBe(200);
    expect(closedPublicRead.body.data[0].body).toBe("historical public comment");
    expect(closedNotesRead.status).toBe(200);
    expect(closedNotesRead.body.data[0].body).toBe("historical internal note");
    expect(closedComment.status).toBe(409);
    expect(closedComment.body.error.code).toBe("TICKET_FINAL");
    expect(cancelledNote.status).toBe(409);
    expect(cancelledNote.body.error.code).toBe("TICKET_FINAL");
  });

  for (const finalStatus of ["CLOSED", "CANCELLED"] as const) {
    it(`serializes ${finalStatus} before a Public Comment mutation`, async () => {
      const { ticketId, response } = await raceMutationAgainstFinalization(
        finalStatus,
        "PUBLIC-COMMENT",
        (id) => withAuth(
          request(app).post(`/api/tickets/${id}/comments`).send({ body: "loser comment" }),
          requesterAAuth
        )
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("TICKET_FINAL");
      expect(await prisma.publicComment.count({ where: { ticketId } })).toBe(0);
      expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).currentStatus).toBe(finalStatus);
    });

    it(`serializes ${finalStatus} before an Internal Note mutation`, async () => {
      const { ticketId, response } = await raceMutationAgainstFinalization(
        finalStatus,
        "INTERNAL-NOTE",
        (id) => withAuth(
          request(app).post(`/api/staff/tickets/${id}/notes`).send({ body: "loser note" }),
          staffAuth
        )
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("TICKET_FINAL");
      expect(await prisma.internalNote.count({ where: { ticketId } })).toBe(0);
      expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).currentStatus).toBe(finalStatus);
    });

    it(`serializes ${finalStatus} before a Resolution Indication mutation`, async () => {
      const { ticketId, response } = await raceMutationAgainstFinalization(
        finalStatus,
        "RESOLUTION-INDICATION",
        (id) => withAuth(
          request(app).put(`/api/tickets/${id}/resolution-indication`).send({}),
          requesterAAuth
        )
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("TICKET_FINAL");
      const saved = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
      expect(saved.currentStatus).toBe(finalStatus);
      expect(saved.resolutionIndicatedAt).toBeNull();
      expect(saved.resolutionIndicatedById).toBeNull();
    });
  }

  it("records one backend-authored indication without changing status and rejects duplicates", async () => {
    const indicated = await withAuth(
      request(app).put(`/api/tickets/${activeTicketId}/resolution-indication`).send({ authorId: staffId, indicatedAt: "1900-01-01T00:00:00.000Z" }),
      requesterAAuth
    );
    const duplicate = await withAuth(
      request(app).put(`/api/tickets/${activeTicketId}/resolution-indication`).send({}),
      requesterAAuth
    );
    const saved = await prisma.ticket.findUniqueOrThrow({ where: { id: activeTicketId } });

    expect(indicated.status).toBe(200);
    expect(indicated.body.resolutionIndication.indicatedBy).toMatchObject({ id: requesterAId, role: "REQUESTER" });
    expect(indicated.body.resolutionIndication.indicatedBy.email).toBeUndefined();
    iso(indicated.body.resolutionIndication.indicatedAt);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("RESOLUTION_ALREADY_INDICATED");
    expect(saved.currentStatus).toBe("OPEN");
  });

  it("rejects indication on Resolved or Final Tickets, with Resolved winning duplicate detection", async () => {
    const resolved = await withAuth(
      request(app).put(`/api/tickets/${resolvedTicketId}/resolution-indication`).send({}),
      requesterAAuth
    );
    await prisma.ticket.update({
      where: { id: resolvedTicketId },
      data: { resolutionIndicatedAt: new Date(), resolutionIndicatedById: requesterAId },
    });
    const resolvedWithExisting = await withAuth(
      request(app).put(`/api/tickets/${resolvedTicketId}/resolution-indication`).send({}),
      requesterAAuth
    );
    const final = await withAuth(
      request(app).put(`/api/tickets/${closedTicketId}/resolution-indication`).send({}),
      requesterAAuth
    );
    const staff = await withAuth(
      request(app).put(`/api/tickets/${activeTicketId}/resolution-indication`).send({}),
      staffAuth
    );

    expect(resolved.status).toBe(409);
    expect(resolved.body.error.code).toBe("RESOLUTION_INDICATION_NOT_ALLOWED");
    expect(resolvedWithExisting.status).toBe(409);
    expect(resolvedWithExisting.body.error.code).toBe("RESOLUTION_INDICATION_NOT_ALLOWED");
    expect(final.status).toBe(409);
    expect(final.body.error.code).toBe("TICKET_FINAL");
    expect(staff.status).toBe(403);
  });

  it("exposes indication and Public Comments in the Requester Detail/List representations", async () => {
    const detail = await withAuth(request(app).get(`/api/tickets/${activeTicketId}`), requesterAAuth, false);
    const list = await withAuth(request(app).get("/api/tickets").query({ pageSize: 50 }), requesterAAuth, false);
    const listRow = list.body.data.find((ticket: { id: number }) => ticket.id === activeTicketId);

    expect(detail.status).toBe(200);
    expect(detail.body.resolutionIndication).toMatchObject({ indicatedBy: { id: requesterAId } });
    expect(detail.body.publicComments).toEqual(expect.any(Array));
    expect(list.status).toBe(200);
    expect(listRow.resolutionIndication).toMatchObject({ indicatedBy: { id: requesterAId } });
  });

  it("provides the domain seam used by the future Staff Reopened transition to clear the indication", async () => {
    await prisma.ticket.update({
      where: { id: resolvedTicketId },
      data: { currentStatus: "REOPENED", resolutionIndicatedAt: new Date(), resolutionIndicatedById: requesterAId },
    });
    await clearResolutionIndicationOnReopened(resolvedTicketId);
    const reopened = await prisma.ticket.findUniqueOrThrow({ where: { id: resolvedTicketId } });

    expect(reopened.currentStatus).toBe("REOPENED");
    expect(reopened.resolutionIndicatedAt).toBeNull();
    expect(reopened.resolutionIndicatedById).toBeNull();
  });
});
