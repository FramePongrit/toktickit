import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { UPLOAD_DIR, storedFilePath } from "../../src/lib/paths.js";
import { isPermittedFile, MAX_ATTACHMENT_BYTES } from "../../src/middleware/upload.js";

const prisma = getPrisma();
const suiteTag = randomUUID();

let ownerId: number;
let strangerId: number;
let ticketId: number;
let strangerTicketId: number;

// A tiny but valid-looking payload; the API validates the extension and the
// declared MIME type, not the bytes (D-11).
const PNG_BYTES = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

function upload(
  target: number,
  filename: string,
  contentType: string,
  bytes: Buffer = PNG_BYTES,
  requesterId: number = ownerId
) {
  return (
    request(app)
      .post(`/api/tickets/${target}/attachments`)
      .set("X-Requester-Id", String(requesterId))
      // Never set Content-Type by hand here: supertest owns the multipart
      // boundary, and overriding it corrupts the body.
      .attach("file", bytes, { filename, contentType })
  );
}

async function uploadedFilenames(): Promise<string[]> {
  const entries = await fs.promises.readdir(UPLOAD_DIR);
  return entries.filter((name) => name !== ".gitkeep");
}

/** Creates a ticket owned by `requesterId` directly, bypassing the create endpoint. */
async function makeTicket(requesterId: number, summary: string) {
  const category = await prisma.category.findFirstOrThrow({ where: { active: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { active: true } });
  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-2026-${randomUUID().slice(0, 8)}`,
      requesterId,
      categoryId: category.id,
      relatedSystemId: relatedSystem.id,
      requestedPriority: "MEDIUM",
      summary,
      description: "A description long enough to satisfy the minimum length rule.",
    },
  });
}

beforeAll(async () => {
  const [owner, stranger] = await Promise.all([
    prisma.requesterUser.create({
      data: { fullName: "Attach Owner", email: `attach-owner-${suiteTag}@lab2.local` },
    }),
    prisma.requesterUser.create({
      data: { fullName: "Attach Stranger", email: `attach-stranger-${suiteTag}@lab2.local` },
    }),
  ]);
  ownerId = owner.id;
  strangerId = stranger.id;

  strangerTicketId = (await makeTicket(strangerId, "Stranger ticket")).id;
});

beforeEach(async () => {
  // A fresh ticket per test, so the five-attachment limit and the counts are
  // never affected by what an earlier test left behind.
  ticketId = (await makeTicket(ownerId, "Attachment target ticket")).id;
});

afterAll(async () => {
  // Delete the stored files this suite wrote before dropping the rows that
  // name them, or the filenames are lost and the files leak.
  const attachments = await prisma.attachment.findMany({
    where: { ticket: { requesterId: { in: [ownerId, strangerId] } } },
    select: { storedFilename: true },
  });
  await Promise.all(
    attachments.map((a) => fs.promises.rm(storedFilePath(a.storedFilename), { force: true }))
  );

  await prisma.attachment.deleteMany({
    where: { ticket: { requesterId: { in: [ownerId, strangerId] } } },
  });
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [ownerId, strangerId] } } });
  await prisma.requesterUser.deleteMany({ where: { id: { in: [ownerId, strangerId] } } });
  await prisma.$disconnect();
});

describe("Attachment type rules", () => {
  it("UNIT-03: accepts a permitted extension with a matching MIME type", () => {
    expect(isPermittedFile("photo.PNG", "image/png")).toBe(true);
    expect(isPermittedFile("scan.pdf", "application/pdf")).toBe(true);
    expect(isPermittedFile("shot.jpeg", "image/jpeg")).toBe(true);
    expect(isPermittedFile("art.webp", "image/webp")).toBe(true);
  });

  it("UNIT-03: rejects when either the extension or the MIME type is wrong", () => {
    // Both must pass, so a renamed file and a spoofed type each fail.
    expect(isPermittedFile("payload.exe", "application/octet-stream")).toBe(false);
    expect(isPermittedFile("payload.exe", "image/png")).toBe(false);
    expect(isPermittedFile("photo.png", "text/plain")).toBe(false);
  });
});

describe("POST /api/tickets/:id/attachments — upload", () => {
  it("API-39: accepts each permitted file type", async () => {
    const cases: [string, string][] = [
      ["evidence.png", "image/png"],
      ["evidence.jpg", "image/jpeg"],
      ["evidence.webp", "image/webp"],
      ["evidence.pdf", "application/pdf"],
    ];

    for (const [filename, contentType] of cases) {
      const res = await upload(ticketId, filename, contentType);
      expect(res.status).toBe(201);
      expect(res.body.originalFilename).toBe(filename);
      expect(res.body.isRemoved).toBe(false);
    }
  });

  it("API-40: refuses a file larger than the maximum and leaves nothing behind", async () => {
    const before = await uploadedFilenames();
    const oversized = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1024);

    const res = await upload(ticketId, "huge.png", "image/png", oversized);

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("FILE_TOO_LARGE");
    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(0);
    expect(await uploadedFilenames()).toEqual(before);
  });

  it("API-41: refuses a disallowed extension", async () => {
    const res = await upload(ticketId, "payload.exe", "application/octet-stream");

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(0);
  });

  it("API-42: refuses a permitted extension carrying a disallowed MIME type", async () => {
    const res = await upload(ticketId, "sneaky.png", "text/plain");

    expect(res.status).toBe(415);
    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(0);
  });

  it("API-46: refuses a request with no file part", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set("X-Requester-Id", String(ownerId))
      .field("unrelated", "value");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("NO_FILE");
  });

  it("API-47: stores under a generated name, keeping the requester's name as metadata only", async () => {
    const res = await upload(ticketId, "../../escape-attempt.png", "image/png");

    expect(res.status).toBe(201);

    const saved = await prisma.attachment.findUniqueOrThrow({ where: { id: res.body.id } });
    // A traversal sequence in the requester's filename must not reach the path.
    expect(saved.storedFilename).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(saved.storedFilename).not.toContain("..");
    expect(fs.existsSync(storedFilePath(saved.storedFilename))).toBe(true);
    // The internal name is never serialised to the client.
    expect(res.body).not.toHaveProperty("storedFilename");
  });

  it("API-43: refuses a sixth active attachment", async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await upload(ticketId, `file-${i}.png`, "image/png")).status).toBe(201);
    }

    const before = await uploadedFilenames();
    const res = await upload(ticketId, "one-too-many.png", "image/png");

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ATTACHMENT_LIMIT_REACHED");
    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(5);

    // API-48: the rejected file reached disk before the count was checked, so
    // it must have been cleaned up rather than left orphaned (BR-40).
    expect(await uploadedFilenames()).toEqual(before);
  });

  it("API-44: allows a new upload once a removed attachment frees a slot", async () => {
    const uploaded = [];
    for (let i = 0; i < 5; i += 1) {
      uploaded.push((await upload(ticketId, `file-${i}.png`, "image/png")).body);
    }

    expect((await upload(ticketId, "blocked.png", "image/png")).status).toBe(409);

    const removal = await request(app)
      .patch(`/api/attachments/${uploaded[0].id}/remove`)
      .set("X-Requester-Id", String(ownerId))
      .send({ removalReason: "Freeing a slot" });
    expect(removal.status).toBe(200);

    // Removed attachments do not count toward the limit (BR-31).
    expect((await upload(ticketId, "now-allowed.png", "image/png")).status).toBe(201);
  });

  it("API-45: refuses an upload to a ticket owned by somebody else", async () => {
    const before = await uploadedFilenames();

    const res = await upload(strangerTicketId, "intrusion.png", "image/png");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("TICKET_NOT_FOUND");
    // Ownership is checked before the file is written, so nothing lands on disk.
    expect(await uploadedFilenames()).toEqual(before);
  });
});

describe("GET /api/attachments/:id — metadata", () => {
  it("returns metadata for an attachment the caller owns", async () => {
    const created = (await upload(ticketId, "evidence.pdf", "application/pdf")).body;

    const res = await request(app)
      .get(`/api/attachments/${created.id}`)
      .set("X-Requester-Id", String(ownerId));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: created.id,
      originalFilename: "evidence.pdf",
      mimeType: "application/pdf",
      isRemoved: false,
    });
  });

  it("API-56: refuses metadata for an attachment on another requester's ticket", async () => {
    const created = (await upload(ticketId, "private.png", "image/png")).body;

    const res = await request(app)
      .get(`/api/attachments/${created.id}`)
      .set("X-Requester-Id", String(strangerId));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ATTACHMENT_NOT_FOUND");
  });
});

describe("GET /api/attachments/:id/download", () => {
  it("API-49: serves an active attachment with its original filename", async () => {
    const created = (await upload(ticketId, "evidence.png", "image/png")).body;

    const res = await request(app)
      .get(`/api/attachments/${created.id}/download`)
      .set("X-Requester-Id", String(ownerId));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.headers["content-disposition"]).toContain('filename="evidence.png"');
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.from(res.body).equals(PNG_BYTES)).toBe(true);
  });

  it("API-50: refuses to serve a removed attachment", async () => {
    const created = (await upload(ticketId, "mistake.png", "image/png")).body;

    await request(app)
      .patch(`/api/attachments/${created.id}/remove`)
      .set("X-Requester-Id", String(ownerId))
      .send({ removalReason: "Uploaded the wrong screenshot" });

    const res = await request(app)
      .get(`/api/attachments/${created.id}/download`)
      .set("X-Requester-Id", String(ownerId));

    // 410 rather than 404: the caller owns it and already knows it exists from
    // the ticket detail response, so a precise status leaks nothing and lets
    // the client explain why (api-spec §3).
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("ATTACHMENT_REMOVED");
  });

  it("API-51: refuses a download for another requester's attachment", async () => {
    const created = (await upload(ticketId, "confidential.pdf", "application/pdf")).body;

    const res = await request(app)
      .get(`/api/attachments/${created.id}/download`)
      .set("X-Requester-Id", String(strangerId));

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/attachments/:id/remove — soft removal", () => {
  it("API-52: records who removed it, when, and why, keeping the row", async () => {
    const created = (await upload(ticketId, "wrong.png", "image/png")).body;

    const res = await request(app)
      .patch(`/api/attachments/${created.id}/remove`)
      .set("X-Requester-Id", String(ownerId))
      .send({ removalReason: "Uploaded the wrong screenshot" });

    expect(res.status).toBe(200);
    expect(res.body.isRemoved).toBe(true);
    expect(res.body.removalReason).toBe("Uploaded the wrong screenshot");

    const saved = await prisma.attachment.findUniqueOrThrow({ where: { id: created.id } });
    expect(saved.removedAt).not.toBeNull();
    expect(saved.removedByRequesterId).toBe(ownerId);
  });

  it("API-57: leaves the stored file on disk, since removal revokes access rather than destroying data", async () => {
    const created = (await upload(ticketId, "keep-bytes.png", "image/png")).body;
    const saved = await prisma.attachment.findUniqueOrThrow({ where: { id: created.id } });

    await request(app)
      .patch(`/api/attachments/${created.id}/remove`)
      .set("X-Requester-Id", String(ownerId))
      .send({ removalReason: "No longer relevant" });

    expect(fs.existsSync(storedFilePath(saved.storedFilename))).toBe(true);
  });

  it("API-53: requires a removal reason", async () => {
    const created = (await upload(ticketId, "reasonless.png", "image/png")).body;

    const res = await request(app)
      .patch(`/api/attachments/${created.id}/remove`)
      .set("X-Requester-Id", String(ownerId))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");

    const saved = await prisma.attachment.findUniqueOrThrow({ where: { id: created.id } });
    expect(saved.removedAt).toBeNull();
  });

  it("API-54: rejects a reason shorter than the minimum", async () => {
    const created = (await upload(ticketId, "short-reason.png", "image/png")).body;

    const res = await request(app)
      .patch(`/api/attachments/${created.id}/remove`)
      .set("X-Requester-Id", String(ownerId))
      .send({ removalReason: "no" });

    expect(res.status).toBe(400);
  });

  it("API-55: reports a second removal as a conflict rather than succeeding quietly", async () => {
    const created = (await upload(ticketId, "double.png", "image/png")).body;
    const remove = () =>
      request(app)
        .patch(`/api/attachments/${created.id}/remove`)
        .set("X-Requester-Id", String(ownerId))
        .send({ removalReason: "Removing this one" });

    expect((await remove()).status).toBe(200);

    // A silently idempotent 200 would hide a double submission (BR-35).
    const second = await remove();
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("ALREADY_REMOVED");
  });

  it("API-56: refuses removal by a requester who does not own the ticket", async () => {
    const created = (await upload(ticketId, "not-yours.png", "image/png")).body;

    const res = await request(app)
      .patch(`/api/attachments/${created.id}/remove`)
      .set("X-Requester-Id", String(strangerId))
      .send({ removalReason: "Trying to remove someone else's file" });

    expect(res.status).toBe(404);

    const saved = await prisma.attachment.findUniqueOrThrow({ where: { id: created.id } });
    expect(saved.removedAt).toBeNull();
  });
});

describe("Attachment endpoints — requester identity", () => {
  it("rejects a request with no identity header", async () => {
    const res = await request(app).get("/api/attachments/1");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("REQUESTER_HEADER_MISSING");
  });
});
