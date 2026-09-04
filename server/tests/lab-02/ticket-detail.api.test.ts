import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

const prisma = getPrisma();
const suiteTag = randomUUID();

let ownerId: number;
let strangerId: number;
let inactiveId: number;
let ownedTicketId: number;
let strangerTicketId: number;

function detail(ticketId: number | string, requesterId: number | null = ownerId) {
  const req = request(app).get(`/api/tickets/${ticketId}`);
  return requesterId === null ? req : req.set("X-Requester-Id", String(requesterId));
}

beforeAll(async () => {
  const [owner, stranger, inactive] = await Promise.all([
    prisma.requesterUser.create({
      data: { fullName: "Detail Owner", email: `detail-owner-${suiteTag}@lab2.local` },
    }),
    prisma.requesterUser.create({
      data: { fullName: "Detail Stranger", email: `detail-stranger-${suiteTag}@lab2.local` },
    }),
    prisma.requesterUser.create({
      data: {
        fullName: "Detail Inactive",
        email: `detail-inactive-${suiteTag}@lab2.local`,
        active: false,
      },
    }),
  ]);
  ownerId = owner.id;
  strangerId = stranger.id;
  inactiveId = inactive.id;

  const category = await prisma.category.findFirstOrThrow({ where: { active: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { active: true } });

  const base = {
    categoryId: category.id,
    relatedSystemId: relatedSystem.id,
    requestedPriority: "HIGH" as const,
    description: "A description long enough to satisfy the minimum length rule.",
  };

  const owned = await prisma.ticket.create({
    data: {
      ...base,
      ticketNumber: `TKT-2026-98${randomUUID().slice(0, 4)}`,
      requesterId: ownerId,
      summary: "Owned ticket used for detail assertions",
    },
  });
  ownedTicketId = owned.id;

  const stray = await prisma.ticket.create({
    data: {
      ...base,
      ticketNumber: `TKT-2026-99${randomUUID().slice(0, 4)}`,
      requesterId: strangerId,
      summary: "Ticket belonging to somebody else",
    },
  });
  strangerTicketId = stray.id;

  // One active and one removed attachment, so the detail response can be
  // checked to include removed attachments as metadata (BR-33).
  await prisma.attachment.createMany({
    data: [
      {
        ticketId: ownedTicketId,
        originalFilename: "evidence.pdf",
        storedFilename: `${randomUUID()}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 2048,
        uploadedByRequesterId: ownerId,
      },
      {
        ticketId: ownedTicketId,
        originalFilename: "wrong-screenshot.png",
        storedFilename: `${randomUUID()}.png`,
        mimeType: "image/png",
        sizeBytes: 4096,
        uploadedByRequesterId: ownerId,
        removedAt: new Date(),
        removedByRequesterId: ownerId,
        removalReason: "Uploaded the wrong screenshot",
      },
    ],
  });
});

afterAll(async () => {
  await prisma.attachment.deleteMany({
    where: { ticketId: { in: [ownedTicketId, strangerTicketId] } },
  });
  await prisma.ticket.deleteMany({
    where: { requesterId: { in: [ownerId, strangerId, inactiveId] } },
  });
  await prisma.requesterUser.deleteMany({
    where: { id: { in: [ownerId, strangerId, inactiveId] } },
  });
  await prisma.$disconnect();
});

describe("GET /api/tickets/:id — owner", () => {
  it("API-33: returns every specified field for a ticket the caller owns", async () => {
    const res = await detail(ownedTicketId);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: ownedTicketId,
      summary: "Owned ticket used for detail assertions",
      currentStatus: "NEW",
      requestedPriority: "HIGH",
    });
    expect(res.body.ticketNumber).toMatch(/^TKT-/);
    expect(res.body.description).toBeTruthy();
    expect(res.body.createdAt).toBeTruthy();
    expect(res.body.category).toMatchObject({ id: expect.any(Number), name: expect.any(String) });
    expect(res.body.relatedSystem).toMatchObject({ id: expect.any(Number), name: expect.any(String) });
    expect(res.body.requester).toMatchObject({ id: ownerId, fullName: "Detail Owner" });
  });

  it("does not expose the requester's password hash or role", async () => {
    const res = await detail(ownedTicketId);

    expect(res.body.requester).not.toHaveProperty("passwordHash");
    expect(res.body.requester).not.toHaveProperty("active");
  });

  it("API-37: includes removed attachments as metadata, flagged as removed", async () => {
    const res = await detail(ownedTicketId);

    expect(res.body.attachments).toHaveLength(2);

    const active = res.body.attachments.find((a: any) => !a.isRemoved);
    const removed = res.body.attachments.find((a: any) => a.isRemoved);

    expect(active.originalFilename).toBe("evidence.pdf");
    expect(active.removedAt).toBeNull();
    expect(active.removalReason).toBeNull();

    // Metadata stays visible after removal; only access to the bytes is
    // revoked, which the download endpoint enforces (BR-33).
    expect(removed.originalFilename).toBe("wrong-screenshot.png");
    expect(removed.removalReason).toBe("Uploaded the wrong screenshot");
    expect(removed.removedAt).toBeTruthy();

    // The stored filename is an internal detail and must not leak.
    expect(active).not.toHaveProperty("storedFilename");
  });
});

describe("GET /api/tickets/:id — ownership", () => {
  it("API-34: reports a ticket owned by another requester as not found", async () => {
    const res = await detail(strangerTicketId);

    // 404 rather than 403 is deliberate. A 403 would confirm the ticket
    // exists, so a requester could walk the id space and learn exactly which
    // ids another requester owns — how many tickets they have and roughly when
    // they were created. 404 is indistinguishable from a nonexistent id and so
    // discloses nothing. See BR-13 and api-spec.md §3 before treating this as
    // a defect.
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("TICKET_NOT_FOUND");
  });

  it("API-35: reports a nonexistent ticket identically to an unowned one", async () => {
    const missing = await detail(999_999);
    const unowned = await detail(strangerTicketId);

    expect(missing.status).toBe(unowned.status);
    expect(missing.body).toEqual(unowned.body);
  });

  it("still returns the ticket to its real owner", async () => {
    const res = await detail(strangerTicketId, strangerId);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBe("Ticket belonging to somebody else");
  });
});

describe("GET /api/tickets/:id — invalid identifiers", () => {
  it("API-36: rejects an identifier that is not a positive integer", async () => {
    const res = await detail("abc");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("API-36: rejects a zero identifier", async () => {
    const res = await detail(0);

    expect(res.status).toBe(400);
  });

  it("API-36: rejects a negative identifier", async () => {
    const res = await detail(-1);

    expect(res.status).toBe(400);
  });
});

describe("GET /api/tickets/:id — requester identity", () => {
  it("API-38: rejects a request with no identity header", async () => {
    const res = await detail(ownedTicketId, null);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("REQUESTER_HEADER_MISSING");
  });

  it("API-38: rejects a malformed identity header", async () => {
    const res = await request(app)
      .get(`/api/tickets/${ownedTicketId}`)
      .set("X-Requester-Id", "not-a-number");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("REQUESTER_HEADER_INVALID");
  });

  it("API-38: rejects an identity that cannot be resolved", async () => {
    const res = await detail(ownedTicketId, 999_999);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("REQUESTER_NOT_FOUND");
  });

  it("API-38: refuses an inactive requester before reaching the ticket", async () => {
    const res = await detail(ownedTicketId, inactiveId);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("REQUESTER_INACTIVE");
  });
});
