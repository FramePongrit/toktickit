import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../testApp.js";
import { createApp } from "../../src/app.js";
import { loadSecurityConfig } from "../../src/security/config.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/security/password.js";
import { storedFilePath, UPLOAD_DIR } from "../../src/lib/paths.js";
import { MAX_ATTACHMENT_BYTES } from "../../src/middleware/upload.js";
import { loginAs, TEST_PASSWORD, withAuth, type AuthSessionFixture } from "../support/auth.js";

const prisma = getPrisma();
const suiteTag = randomUUID();
const PNG_BYTES = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

let ownerId: number;
let strangerId: number;
let ownerAuth: AuthSessionFixture;
let strangerAuth: AuthSessionFixture;
let ticketId: number;
let finalTicketId: number;
let finalAttachmentId: number;

function upload(
  target: number,
  filename: string,
  contentType: string,
  bytes: Buffer = PNG_BYTES,
  requesterId: number = ownerId
) {
  const auth = requesterId === ownerId ? ownerAuth : strangerAuth;
  return withAuth(
    request(app)
      .post(`/api/tickets/${target}/attachments`)
      // Let supertest set the multipart boundary; setting Content-Type manually
      // here would produce an invalid request body.
      .attach("file", bytes, { filename, contentType }),
    auth
  );
}

async function uploadedFilenames(): Promise<string[]> {
  const entries = await fs.promises.readdir(UPLOAD_DIR);
  return entries.filter((name) => name !== ".gitkeep").sort();
}

/** Creates a ticket directly so each API test starts with a clean active target. */
async function makeTicket(requesterId: number, summary: string) {
  const [category, relatedSystem] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { active: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { active: true } }),
  ]);
  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-2026-${randomUUID().slice(0, 8)}`,
      requesterId,
      categoryId: category.id,
      relatedSystemId: relatedSystem.id,
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      summary,
      description: "A description long enough to satisfy the minimum length rule.",
    },
  });
}

beforeAll(async () => {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const [owner, stranger] = await Promise.all([
    prisma.user.create({
      data: { fullName: "Attachment Regression Owner", email: `attachment-owner-${suiteTag}@example.test`, passwordHash },
    }),
    prisma.user.create({
      data: { fullName: "Attachment Regression Stranger", email: `attachment-stranger-${suiteTag}@example.test`, passwordHash },
    }),
  ]);
  ownerId = owner.id;
  strangerId = stranger.id;
  ownerAuth = await loginAs(owner.email);
  strangerAuth = await loginAs(stranger.email);

  const [category, relatedSystem] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { active: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { active: true } }),
  ]);
  const finalTicket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-2026-FINAL-${suiteTag.slice(0, 8)}`,
      requesterId: ownerId,
      categoryId: category.id,
      relatedSystemId: relatedSystem.id,
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "CLOSED",
      summary: "Final attachment regression ticket",
      description: "A final ticket used to verify attachment guard precedence.",
    },
  });
  finalTicketId = finalTicket.id;
});

beforeEach(async () => {
  ticketId = (await makeTicket(ownerId, "Authenticated attachment target")).id;
});

afterAll(async () => {
  const attachments = await prisma.attachment.findMany({
    where: { ticket: { requesterId: { in: [ownerId, strangerId] } } },
    select: { storedFilename: true },
  });
  await Promise.all(
    attachments.map((attachment) => fs.promises.rm(storedFilePath(attachment.storedFilename), { force: true }))
  );

  await prisma.attachment.deleteMany({
    where: { ticket: { requesterId: { in: [ownerId, strangerId] } } },
  });
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [ownerId, strangerId] } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: [ownerId, strangerId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, strangerId] } } });
  await prisma.$disconnect();
});

describe("Issue #52 — authenticated Attachment regression", () => {
  it("API-AT01: accepts only the configured origin for credentialed multipart preflight", async () => {
    const origin = "http://localhost:5173";
    const configured = await request(
      createApp(loadSecurityConfig({ JWT_SECRET: "s".repeat(32), CLIENT_ORIGIN: origin }))
    )
      .options(`/api/tickets/${ticketId}/attachments`)
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "Content-Type, X-CSRF-Token");

    expect(configured.status).toBe(204);
    expect(configured.headers["access-control-allow-origin"]).toBe(origin);
    expect(configured.headers["access-control-allow-credentials"]).toBe("true");

    const arbitrary = await request(app)
      .options(`/api/tickets/${ticketId}/attachments`)
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST");
    expect(arbitrary.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("API-AT02: cleans the staged file after a malformed multipart parser rejection", async () => {
    const before = await uploadedFilenames();
    const response = await withAuth(
      request(app)
        .post(`/api/tickets/${ticketId}/attachments`)
        .set("Content-Type", "multipart/form-data; boundary=broken-boundary")
        .send(
          '--broken-boundary\r\nContent-Disposition: form-data; name="file"; filename="broken.png"\r\nContent-Type: image/png\r\n\r\npartial'
        ),
      ownerAuth
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(0);
    expect(await uploadedFilenames()).toEqual(before);
  });

  it("API-AT03: enforces allowed extension and MIME type and cleans rejected files", async () => {
    const before = await uploadedFilenames();

    const wrongExtension = await upload(ticketId, "payload.exe", "application/octet-stream");
    expect(wrongExtension.status).toBe(415);
    expect(wrongExtension.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");

    const wrongMime = await upload(ticketId, "sneaky.png", "text/plain");
    expect(wrongMime.status).toBe(415);
    expect(wrongMime.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");

    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(0);
    expect(await uploadedFilenames()).toEqual(before);
  });

  it("API-AT04: enforces the 5 MB limit and cleans the staged file", async () => {
    const before = await uploadedFilenames();
    const response = await upload(
      ticketId,
      "too-large.png",
      "image/png",
      Buffer.alloc(MAX_ATTACHMENT_BYTES + 1)
    );

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("FILE_TOO_LARGE");
    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(0);
    expect(await uploadedFilenames()).toEqual(before);
  });

  it("API-AT05: rejects NO_FILE without creating an Attachment", async () => {
    const response = await withAuth(
      request(app).post(`/api/tickets/${ticketId}/attachments`).field("unrelated", "value"),
      ownerAuth
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("NO_FILE");
    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(0);
  });

  it("API-AT06: permits five active Attachments and cleans a rejected sixth file", async () => {
    for (let index = 0; index < 5; index += 1) {
      const created = await upload(ticketId, `evidence-${index}.png`, "image/png");
      expect(created.status).toBe(201);
      expect(created.body.isRemoved).toBe(false);
    }

    const before = await uploadedFilenames();
    const sixth = await upload(ticketId, "sixth.png", "image/png");

    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe("ATTACHMENT_LIMIT_REACHED");
    expect(await prisma.attachment.count({ where: { ticketId, removedAt: null } })).toBe(5);
    expect(await uploadedFilenames()).toEqual(before);
  });

  it("API-AT07: authenticates download and soft-removal ownership", async () => {
    const created = await upload(ticketId, "private.png", "image/png");
    expect(created.status).toBe(201);

    const attachment = await prisma.attachment.findUniqueOrThrow({ where: { id: created.body.id } });
    const ownerDownload = await withAuth(
      request(app).get(`/api/attachments/${attachment.id}/download`),
      ownerAuth,
      false
    );
    expect(ownerDownload.status).toBe(200);
    expect(ownerDownload.headers["content-type"]).toContain("image/png");
    expect(ownerDownload.headers["content-disposition"]).toContain('filename="private.png"');
    expect(Buffer.from(ownerDownload.body).equals(PNG_BYTES)).toBe(true);

    const foreignDownload = await withAuth(
      request(app).get(`/api/attachments/${attachment.id}/download`),
      strangerAuth,
      false
    );
    expect(foreignDownload.status).toBe(404);
    expect(foreignDownload.body.error.code).toBe("ATTACHMENT_NOT_FOUND");

    const missingReason = await withAuth(
      request(app).patch(`/api/attachments/${attachment.id}/remove`).send({}),
      ownerAuth
    );
    expect(missingReason.status).toBe(400);
    expect(missingReason.body.error.code).toBe("VALIDATION_FAILED");

    const shortReason = await withAuth(
      request(app)
        .patch(`/api/attachments/${attachment.id}/remove`)
        .send({ removalReason: "no" }),
      ownerAuth
    );
    expect(shortReason.status).toBe(400);
    expect((await prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } })).removedAt).toBeNull();

    const removed = await withAuth(
      request(app)
        .patch(`/api/attachments/${attachment.id}/remove`)
        .send({ removalReason: "Requester no longer needs this file" }),
      ownerAuth
    );
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({
      id: attachment.id,
      isRemoved: true,
      removalReason: "Requester no longer needs this file",
    });

    const saved = await prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } });
    expect(saved.removedAt).not.toBeNull();
    expect(saved.removedByRequesterId).toBe(ownerId);
    expect(fs.existsSync(storedFilePath(saved.storedFilename))).toBe(true);

    const removedDownload = await withAuth(
      request(app).get(`/api/attachments/${attachment.id}/download`),
      ownerAuth,
      false
    );
    expect(removedDownload.status).toBe(410);
    expect(removedDownload.body.error.code).toBe("ATTACHMENT_REMOVED");

    const foreignRemoval = await withAuth(
      request(app)
        .patch(`/api/attachments/${attachment.id}/remove`)
        .send({ removalReason: "Foreign requester" }),
      strangerAuth
    );
    expect(foreignRemoval.status).toBe(404);
    expect(foreignRemoval.body.error.code).toBe("ATTACHMENT_NOT_FOUND");

    const alreadyRemoved = await withAuth(
      request(app)
        .patch(`/api/attachments/${attachment.id}/remove`)
        .send({ removalReason: "Second removal" }),
      ownerAuth
    );
    expect(alreadyRemoved.status).toBe(409);
    expect(alreadyRemoved.body.error.code).toBe("ALREADY_REMOVED");
  });

  it("API-AT08: applies the Final guard before upload type validation", async () => {
    const before = await uploadedFilenames();
    const response = await withAuth(
      request(app)
        .post(`/api/tickets/${finalTicketId}/attachments`)
        .attach("file", PNG_BYTES, { filename: "wrong.png", contentType: "text/plain" }),
      ownerAuth
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("TICKET_FINAL");
    expect(await prisma.attachment.count({ where: { ticketId: finalTicketId } })).toBe(0);
    expect(await uploadedFilenames()).toEqual(before);
  });

  it("API-AT09: applies the Final guard before removal payload validation", async () => {
    const storedFilename = `${randomUUID()}.png`;
    await fs.promises.writeFile(storedFilePath(storedFilename), PNG_BYTES);
    const attachment = await prisma.attachment.create({
      data: {
        ticketId: finalTicketId,
        originalFilename: "final.png",
        storedFilename,
        mimeType: "image/png",
        sizeBytes: PNG_BYTES.length,
        uploadedByRequesterId: ownerId,
      },
    });
    finalAttachmentId = attachment.id;

    const response = await withAuth(
      request(app).patch(`/api/attachments/${attachment.id}/remove`).send({}),
      ownerAuth
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("TICKET_FINAL");
    expect((await prisma.attachment.findUniqueOrThrow({ where: { id: finalAttachmentId } })).removedAt).toBeNull();
  });
});
