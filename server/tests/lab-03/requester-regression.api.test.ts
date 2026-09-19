import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../testApp.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/security/password.js";
import { storedFilePath } from "../../src/lib/paths.js";
import { loginAs, TEST_PASSWORD, withAuth, type AuthSessionFixture } from "../support/auth.js";

const prisma = getPrisma();
const suiteTag = randomUUID();
const PNG_BYTES = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

let requesterAId: number;
let requesterBId: number;
let requesterAAuth: AuthSessionFixture;
let requesterBAuth: AuthSessionFixture;
let categoryId: number;
let relatedSystemId: number;
let requesterATicketId: number;
let requesterBTicketId: number;
let attachmentId: number;
let attachmentStoredFilename: string;

function ticketBody(overrides: Record<string, unknown> = {}) {
  return {
    categoryId,
    relatedSystemId,
    requestedPriority: "HIGH",
    summary: "Authenticated requester regression fixture",
    description: "A long enough description for authenticated ownership regression tests.",
    ...overrides,
  };
}

beforeAll(async () => {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const [category, relatedSystem, requesterA, requesterB] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { active: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { active: true } }),
    prisma.user.create({
      data: {
        fullName: "Requester Regression A",
        email: `requester-regression-a-${suiteTag}@example.test`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        fullName: "Requester Regression B",
        email: `requester-regression-b-${suiteTag}@example.test`,
        passwordHash,
      },
    }),
  ]);

  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
  requesterAId = requesterA.id;
  requesterBId = requesterB.id;
  requesterAAuth = await loginAs(requesterA.email);
  requesterBAuth = await loginAs(requesterB.email);

  const [ticketA, ticketB] = await Promise.all([
    prisma.ticket.create({
      data: {
        ticketNumber: `TKT-2026-REG-A-${suiteTag.slice(0, 8)}`,
        requesterId: requesterAId,
        categoryId,
        relatedSystemId,
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        summary: "Private ticket for requester A",
        description: "This ticket must remain invisible to requester B.",
      },
    }),
    prisma.ticket.create({
      data: {
        ticketNumber: `TKT-2026-REG-B-${suiteTag.slice(0, 8)}`,
        requesterId: requesterBId,
        categoryId,
        relatedSystemId,
        requestedPriority: "LOW",
        itPriority: "LOW",
        summary: "Private ticket for requester B",
        description: "This ticket must remain invisible to requester A.",
      },
    }),
  ]);
  requesterATicketId = ticketA.id;
  requesterBTicketId = ticketB.id;
});

afterAll(async () => {
  if (attachmentStoredFilename) {
    await fs.promises.rm(storedFilePath(attachmentStoredFilename), { force: true });
  }
  await prisma.attachment.deleteMany({
    where: { ticket: { requesterId: { in: [requesterAId, requesterBId] } } },
  });
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [requesterAId, requesterBId] } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: [requesterAId, requesterBId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [requesterAId, requesterBId] } } });
  await prisma.$disconnect();
});

describe("Issue #52 — authenticated Requester regression", () => {
  it("API-R01: derives creation ownership from the authenticated User and preserves Requested Priority", async () => {
    const response = await withAuth(
      request(app)
        .post("/api/tickets")
        .send(ticketBody({ requesterId: requesterBId, itPriority: "LOW" })),
      requesterAAuth
    );

    expect(response.status).toBe(201);
    expect(response.body.requester.id).toBe(requesterAId);
    expect(response.body.requestedPriority).toBe("HIGH");
    expect(response.body.itPriority).toBe("HIGH");

    const saved = await prisma.ticket.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(saved.requesterId).toBe(requesterAId);
    expect(saved.requestedPriority).toBe("HIGH");
    expect(saved.itPriority).toBe("HIGH");
  });

  it("API-R02: allows a Requester to read its own Ticket detail", async () => {
    const response = await withAuth(
      request(app).get(`/api/tickets/${requesterATicketId}`),
      requesterAAuth,
      false
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: requesterATicketId,
      requester: { id: requesterAId, fullName: "Requester Regression A" },
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "NEW",
    });
  });

  it("API-R03: keeps Requested Priority immutable on the Requester's public write surface", async () => {
    const attemptedUpdate = await withAuth(
      request(app)
        .patch(`/api/tickets/${requesterATicketId}`)
        .send({ requestedPriority: "URGENT", itPriority: "LOW" }),
      requesterAAuth
    );

    expect(attemptedUpdate.status).toBe(404);
    expect(attemptedUpdate.body.error.code).toBe("ROUTE_NOT_FOUND");

    const unchanged = await prisma.ticket.findUniqueOrThrow({ where: { id: requesterATicketId } });
    expect(unchanged.requestedPriority).toBe("MEDIUM");
    expect(unchanged.itPriority).toBe("MEDIUM");
  });

  it("API-R04: ignores requesterId query input and returns only the authenticated User's tickets", async () => {
    const response = await withAuth(
      request(app)
        .get("/api/tickets")
        .query({ requesterId: requesterAId, pageSize: 50 }),
      requesterBAuth,
      false
    );

    expect(response.status).toBe(200);
    expect(response.body.data.map((ticket: { id: number }) => ticket.id)).toEqual([requesterBTicketId]);
    expect(response.body.data.map((ticket: { id: number }) => ticket.id)).not.toContain(requesterATicketId);
  });

  it("API-R05: requires the session CSRF token for a Requester mutation", async () => {
    const response = await withAuth(
      request(app).post("/api/tickets").send(ticketBody()),
      requesterAAuth,
      false
    );

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("CSRF_INVALID");
  });

  it("API-R06: authenticates Attachment download/removal and keeps foreign resources indistinguishable", async () => {
    const missing = await withAuth(request(app).get("/api/tickets/999999"), requesterBAuth, false);
    const foreign = await withAuth(
      request(app).get(`/api/tickets/${requesterATicketId}`),
      requesterBAuth,
      false
    );

    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
    expect(foreign.body.error.code).toBe("TICKET_NOT_FOUND");

    const upload = await withAuth(
      request(app)
        .post(`/api/tickets/${requesterATicketId}/attachments`)
        .attach("file", PNG_BYTES, { filename: "private.png", contentType: "image/png" }),
      requesterAAuth
    );
    expect(upload.status).toBe(201);
    attachmentId = upload.body.id;
    const attachment = await prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } });
    attachmentStoredFilename = attachment.storedFilename;

    const foreignAttachment = await withAuth(
      request(app).get(`/api/attachments/${attachmentId}`),
      requesterBAuth,
      false
    );
    expect(foreignAttachment.status).toBe(404);
    expect(foreignAttachment.body.error.code).toBe("ATTACHMENT_NOT_FOUND");

    const ownDownload = await withAuth(
      request(app).get(`/api/attachments/${attachmentId}/download`),
      requesterAAuth,
      false
    );
    expect(ownDownload.status).toBe(200);
    expect(ownDownload.headers["content-type"]).toContain("image/png");
    expect(ownDownload.headers["content-disposition"]).toContain('filename="private.png"');
    expect(Buffer.from(ownDownload.body).equals(PNG_BYTES)).toBe(true);

    const ownRemoval = await withAuth(
      request(app)
        .patch(`/api/attachments/${attachmentId}/remove`)
        .send({ removalReason: "Requester regression cleanup" }),
      requesterAAuth
    );
    expect(ownRemoval.status).toBe(200);
    expect(ownRemoval.body).toMatchObject({
      id: attachmentId,
      isRemoved: true,
      removalReason: "Requester regression cleanup",
    });

    const removed = await prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } });
    expect(removed.removedAt).not.toBeNull();
    expect(removed.removedByRequesterId).toBe(requesterAId);

    const ownerAfterRemoval = await withAuth(
      request(app).get(`/api/attachments/${attachmentId}/download`),
      requesterAAuth,
      false
    );
    expect(ownerAfterRemoval.status).toBe(410);
    expect(ownerAfterRemoval.body.error.code).toBe("ATTACHMENT_REMOVED");

    const foreignDownload = await withAuth(
      request(app).get(`/api/attachments/${attachmentId}/download`),
      requesterBAuth,
      false
    );
    expect(foreignDownload.status).toBe(404);
    expect(foreignDownload.body.error.code).toBe("ATTACHMENT_NOT_FOUND");

    const foreignRemoval = await withAuth(
      request(app)
        .patch(`/api/attachments/${attachmentId}/remove`)
        .send({ removalReason: "Should not be accepted" }),
      requesterBAuth
    );
    expect(foreignRemoval.status).toBe(404);
    expect(foreignRemoval.body.error.code).toBe("ATTACHMENT_NOT_FOUND");

    const alreadyRemoved = await withAuth(
      request(app)
        .patch(`/api/attachments/${attachmentId}/remove`)
        .send({ removalReason: "Second removal" }),
      requesterAAuth
    );
    expect(alreadyRemoved.status).toBe(409);
    expect(alreadyRemoved.body.error.code).toBe("ALREADY_REMOVED");
  });

  it("API-R07: has no Development Requester selector endpoint", async () => {
    const response = await request(app).get("/api/dev-requesters");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
  });
});
