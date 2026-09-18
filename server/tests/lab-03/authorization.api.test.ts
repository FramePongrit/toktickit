import { randomUUID } from "node:crypto";
import { access, writeFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../testApp.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/security/password.js";
import { JwtService } from "../../src/security/jwt.js";
import { SESSION_TTL_MS } from "../../src/security/session.js";
import { createDevelopmentSecurityConfig } from "../../src/security/config.js";
import { deleteFileIfPresent, storedFilePath } from "../../src/lib/paths.js";
import { addAttachment, removeAttachment } from "../../src/services/attachments.service.js";

const prisma = getPrisma();
const suiteTag = randomUUID();
const PASSWORD = "AuthzPass123";
const config = createDevelopmentSecurityConfig();

type Role = "REQUESTER" | "STAFF" | "ADMIN";
type Auth = { cookie: string; csrfToken: string; userId: number };

let categoryId: number;
let relatedSystemId: number;
let requesterAId: number;
let requesterBId: number;
let mandatoryRequesterId: number;
let staffId: number;
let adminId: number;
let inactiveId: number;
let ticketAId: number;
let ticketBId: number;
let attachmentAId: number;
let attachmentStoredFilename: string;
let ownedAttachmentId: number;
let ownedAttachmentStoredFilename: string;
const fixtureUserIds: number[] = [];

function cookieFrom(response: request.Response): string {
  const cookies = response.headers["set-cookie"];
  expect(cookies).toBeDefined();
  return cookies[0].split(";")[0];
}

async function login(userId: number, email: string): Promise<Auth> {
  const response = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
  expect(response.status).toBe(200);
  return { cookie: cookieFrom(response), csrfToken: response.body.csrfToken, userId };
}

function safeError(response: request.Response, status: number, code: string): void {
  expect(response.status).toBe(status);
  expect(response.body).toEqual({ error: expect.objectContaining({ code }) });
  const serialized = JSON.stringify(response.body);
  expect(serialized).not.toContain("passwordHash");
  expect(serialized).not.toContain("csrfTokenHash");
  expect(serialized).not.toContain("stack");
  expect(serialized).not.toContain("SELECT");
  expect(serialized).not.toContain("D:\\private");
}

function ticketBody(overrides: Record<string, unknown> = {}) {
  return {
    categoryId,
    relatedSystemId,
    requestedPriority: "MEDIUM",
    summary: "Authorization fixture ticket",
    description: "A deterministic ticket used to verify server authorization guards.",
    ...overrides,
  };
}

function withAuth(
  builder: request.Test,
  auth: Auth,
  csrf = true
): request.Test {
  builder.set("Cookie", auth.cookie);
  if (csrf) builder.set("X-CSRF-Token", auth.csrfToken);
  return builder;
}

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD);
  const [category, relatedSystem] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { active: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { active: true } }),
  ]);
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;

  const [requesterA, requesterB, mandatory, staff, admin, inactive] = await Promise.all([
    prisma.user.create({
      data: { fullName: "Authorization Requester A", email: `authz-a-${suiteTag}@example.test`, passwordHash },
    }),
    prisma.user.create({
      data: { fullName: "Authorization Requester B", email: `authz-b-${suiteTag}@example.test`, passwordHash },
    }),
    prisma.user.create({
      data: {
        fullName: "Authorization Mandatory Requester",
        email: `authz-mandatory-${suiteTag}@example.test`,
        passwordHash,
        mustChangePassword: true,
      },
    }),
    prisma.user.create({
      data: { fullName: "Authorization Staff", email: `authz-staff-${suiteTag}@example.test`, role: "STAFF", passwordHash },
    }),
    prisma.user.create({
      data: { fullName: "Authorization Administrator", email: `authz-admin-${suiteTag}@example.test`, role: "ADMIN", passwordHash },
    }),
    prisma.user.create({
      data: {
        fullName: "Authorization Inactive",
        email: `authz-inactive-${suiteTag}@example.test`,
        active: false,
        passwordHash,
      },
    }),
  ]);

  requesterAId = requesterA.id;
  requesterBId = requesterB.id;
  mandatoryRequesterId = mandatory.id;
  staffId = staff.id;
  adminId = admin.id;
  inactiveId = inactive.id;
  fixtureUserIds.push(requesterAId, requesterBId, mandatoryRequesterId, staffId, adminId, inactiveId);

  const [ticketA, ticketB] = await Promise.all([
    prisma.ticket.create({
      data: {
        ticketNumber: `TKT-${new Date().getFullYear()}-AUTHZA-${suiteTag.slice(0, 8)}`,
        requesterId: requesterAId,
        categoryId,
        relatedSystemId,
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        summary: "Requester A private ticket",
        description: "Ticket A belongs only to requester A for ownership tests.",
      },
    }),
    prisma.ticket.create({
      data: {
        ticketNumber: `TKT-${new Date().getFullYear()}-AUTHZB-${suiteTag.slice(0, 8)}`,
        requesterId: requesterBId,
        categoryId,
        relatedSystemId,
        requestedPriority: "HIGH",
        itPriority: "HIGH",
        summary: "Requester B private ticket",
        description: "Ticket B belongs only to requester B for ownership tests.",
      },
    }),
  ]);
  ticketAId = ticketA.id;
  ticketBId = ticketB.id;

  attachmentStoredFilename = `authz-${suiteTag}.png`;
  ownedAttachmentStoredFilename = `authz-owned-${suiteTag}.png`;
  await Promise.all([
    writeFile(storedFilePath(attachmentStoredFilename), Buffer.from("fixture-bytes")),
    writeFile(storedFilePath(ownedAttachmentStoredFilename), Buffer.from("owned-bytes")),
  ]);
  const attachment = await prisma.attachment.create({
    data: {
      ticketId: ticketBId,
      originalFilename: "private-proof.png",
      storedFilename: attachmentStoredFilename,
      mimeType: "image/png",
      sizeBytes: 13,
      uploadedByRequesterId: requesterBId,
    },
  });
  attachmentAId = attachment.id;
  const ownedAttachment = await prisma.attachment.create({
    data: {
      ticketId: ticketAId,
      originalFilename: "owned-proof.png",
      storedFilename: ownedAttachmentStoredFilename,
      mimeType: "image/png",
      sizeBytes: 11,
      uploadedByRequesterId: requesterAId,
    },
  });
  ownedAttachmentId = ownedAttachment.id;
});

afterAll(async () => {
  await prisma.authSession.deleteMany({ where: { userId: { in: fixtureUserIds } } });
  await prisma.attachment.deleteMany({ where: { ticketId: { in: [ticketAId, ticketBId] } } });
  await prisma.ticket.deleteMany({ where: { id: { in: [ticketAId, ticketBId] } } });
  await prisma.user.deleteMany({ where: { id: { in: fixtureUserIds } } });
  await deleteFileIfPresent(storedFilePath(attachmentStoredFilename));
  await deleteFileIfPresent(storedFilePath(ownedAttachmentStoredFilename));
  vi.restoreAllMocks();
});

describe("API-Z01 — authentication, current state, and guard precedence", () => {
  it("returns generic JSON transport failure before authentication or resource work", async () => {
    const response = await request(app)
      .post(`/api/tickets/${ticketAId}/attachments`)
      .set("Content-Type", "application/json")
      .send("{ invalid json");

    safeError(response, 400, "VALIDATION_FAILED");
    expect(response.body.error.details).toBeUndefined();
  });

  it("returns generic multipart transport failure before authentication or resource work", async () => {
    const response = await request(app)
      .post(`/api/tickets/${ticketAId}/attachments`)
      .set("Content-Type", "multipart/form-data; boundary=authz-boundary")
      .send("--authz-boundary\r\n");

    safeError(response, 400, "VALIDATION_FAILED");
  });

  it("rejects missing, forged, orphaned, revoked, and expired sessions as 401", async () => {
    safeError(await request(app).get("/api/tickets"), 401, "UNAUTHENTICATED");

    const jwt = new JwtService({ secret: config.jwtSecret });
    const forged = jwt.sign({ userId: requesterAId, sessionId: `forged-${suiteTag}` });
    safeError(
      await request(app).get("/api/tickets").set("Cookie", `${config.cookie.name}=${forged}`),
      401,
      "UNAUTHENTICATED"
    );

    const orphaned = jwt.sign({ userId: requesterAId, sessionId: `orphan-${suiteTag}` });
    safeError(
      await request(app).get("/api/tickets").set("Cookie", `${config.cookie.name}=${orphaned}`),
      401,
      "UNAUTHENTICATED"
    );

    const elapsedJwt = new JwtService({
      secret: config.jwtSecret,
      clock: { now: () => new Date(Date.now() - SESSION_TTL_MS - 1_000) },
    }).sign({ userId: requesterAId, sessionId: `elapsed-${suiteTag}` });
    // This token is correctly signed with the server secret; only its JWT exp
    // is elapsed. Verification must reject it before any session lookup.
    safeError(
      await request(app).get("/api/tickets").set("Cookie", `${config.cookie.name}=${elapsedJwt}`),
      401,
      "UNAUTHENTICATED"
    );

    const auth = await login(requesterAId, `authz-a-${suiteTag}@example.test`);
    const session = await prisma.authSession.findFirstOrThrow({ where: { userId: requesterAId, revokedAt: null }, orderBy: { issuedAt: "desc" } });
    await prisma.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    safeError(await request(app).get("/api/tickets").set("Cookie", auth.cookie), 401, "UNAUTHENTICATED");

    const expiredAuth = await login(requesterAId, `authz-a-${suiteTag}@example.test`);
    const expiredSession = await prisma.authSession.findFirstOrThrow({ where: { userId: requesterAId, revokedAt: null }, orderBy: { issuedAt: "desc" } });
    await prisma.authSession.update({ where: { id: expiredSession.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    safeError(await request(app).get("/api/tickets").set("Cookie", expiredAuth.cookie), 401, "UNAUTHENTICATED");
  });

  it("re-reads mandatory-password, active, and current Role state on every request", async () => {
    const mandatoryAuth = await login(mandatoryRequesterId, `authz-mandatory-${suiteTag}@example.test`);
    safeError(await request(app).get("/api/tickets").set("Cookie", mandatoryAuth.cookie), 403, "PASSWORD_CHANGE_REQUIRED");
    expect((await request(app).get("/api/auth/me").set("Cookie", mandatoryAuth.cookie)).status).toBe(200);

    const auth = await login(requesterAId, `authz-a-${suiteTag}@example.test`);
    await prisma.user.update({ where: { id: requesterAId }, data: { active: false } });
    safeError(await request(app).get("/api/tickets").set("Cookie", auth.cookie), 403, "USER_INACTIVE");
    await prisma.user.update({ where: { id: requesterAId }, data: { active: true, role: "STAFF" } });
    safeError(await request(app).get("/api/tickets").set("Cookie", auth.cookie), 403, "FORBIDDEN");
    await prisma.user.update({ where: { id: requesterAId }, data: { role: "REQUESTER" } });
  });

  it("checks Role before CSRF and CSRF before requester domain work", async () => {
    const staff = await login(staffId, `authz-staff-${suiteTag}@example.test`);
    safeError(
      await request(app).post("/api/tickets").set("Cookie", staff.cookie).send(ticketBody()),
      403,
      "FORBIDDEN"
    );

    const requester = await login(requesterAId, `authz-a-${suiteTag}@example.test`);
    safeError(
      await request(app).post("/api/tickets").set("Cookie", requester.cookie).send(ticketBody()),
      403,
      "CSRF_INVALID"
    );
  });
});

describe("API-Z02 — Requester ownership and identity authority", () => {
  it("allows only the authenticated Requester to read their own Ticket", async () => {
    const requesterA = await login(requesterAId, `authz-a-${suiteTag}@example.test`);
    const own = await request(app).get(`/api/tickets/${ticketAId}`).set("Cookie", requesterA.cookie);
    expect(own.status).toBe(200);
    expect(own.body.requester.id).toBe(requesterAId);

    const other = await request(app).get(`/api/tickets/${ticketBId}`).set("Cookie", requesterA.cookie);
    safeError(other, 404, "TICKET_NOT_FOUND");
  });

  it("uses indistinguishable 404s for another Requester's Attachment metadata, download, remove, and upload", async () => {
    const requesterA = await login(requesterAId, `authz-a-${suiteTag}@example.test`);

    safeError(
      await request(app).get(`/api/attachments/${attachmentAId}`).set("Cookie", requesterA.cookie),
      404,
      "ATTACHMENT_NOT_FOUND"
    );
    safeError(
      await request(app).get(`/api/attachments/${attachmentAId}/download`).set("Cookie", requesterA.cookie),
      404,
      "ATTACHMENT_NOT_FOUND"
    );
    safeError(
      await withAuth(request(app).patch(`/api/attachments/${attachmentAId}/remove`), requesterA).send({ removalReason: "Not my file" }),
      404,
      "ATTACHMENT_NOT_FOUND"
    );

    const response = await withAuth(request(app).post(`/api/tickets/${ticketBId}/attachments`), requesterA)
      .attach("file", Buffer.from("not-owned"), "not-owned.png");
    safeError(response, 404, "TICKET_NOT_FOUND");
    expect(await prisma.attachment.count({ where: { ticketId: ticketBId, originalFilename: "not-owned.png" } })).toBe(0);
  });

  it("never accepts a client requesterId as ownership authority", async () => {
    const requesterA = await login(requesterAId, `authz-a-${suiteTag}@example.test`);
    const response = await withAuth(request(app).post("/api/tickets"), requesterA).send(
      ticketBody({ requesterId: requesterBId })
    );
    expect(response.status).toBe(201);
    expect(response.body.requester.id).toBe(requesterAId);
    await prisma.ticket.delete({ where: { id: response.body.id } });
  });

  it("serializes Attachment upload and removal against a concurrent Final transition", async () => {
    const uploadStoredFilename = `authz-race-upload-${suiteTag}.png`;
    await writeFile(storedFilePath(uploadStoredFilename), Buffer.from("staged-upload"));
    const uploadFile = {
      fieldname: "file",
      originalname: "race-upload.png",
      encoding: "7bit",
      mimetype: "image/png",
      destination: "",
      filename: uploadStoredFilename,
      path: storedFilePath(uploadStoredFilename),
      size: 13,
    } as Express.Multer.File;

    let releaseUpload!: () => void;
    let uploadLockReady!: () => void;
    const uploadReady = new Promise<void>((resolve) => {
      uploadLockReady = resolve;
    });
    const uploadFinalizer = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Ticket" WHERE "id" = ${ticketAId} FOR UPDATE`;
      uploadLockReady();
      await new Promise<void>((resolve) => {
        releaseUpload = resolve;
      });
      await tx.ticket.update({ where: { id: ticketAId }, data: { currentStatus: "CLOSED" } });
    });
    await uploadReady;
    const pendingUpload = addAttachment(requesterAId, ticketAId, uploadFile);
    await new Promise((resolve) => setTimeout(resolve, 25));
    releaseUpload();
    await expect(pendingUpload).rejects.toMatchObject({ code: "TICKET_FINAL" });
    await uploadFinalizer;
    await expect(access(storedFilePath(uploadStoredFilename))).rejects.toThrow();
    expect(await prisma.attachment.count({ where: { ticketId: ticketAId, storedFilename: uploadStoredFilename } })).toBe(0);

    await prisma.ticket.update({ where: { id: ticketAId }, data: { currentStatus: "NEW" } });

    let releaseRemove!: () => void;
    let removeLockReady!: () => void;
    const removeReady = new Promise<void>((resolve) => {
      removeLockReady = resolve;
    });
    const removeFinalizer = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Ticket" WHERE "id" = ${ticketAId} FOR UPDATE`;
      removeLockReady();
      await new Promise<void>((resolve) => {
        releaseRemove = resolve;
      });
      await tx.ticket.update({ where: { id: ticketAId }, data: { currentStatus: "CLOSED" } });
    });
    await removeReady;
    const pendingRemoval = removeAttachment(requesterAId, ownedAttachmentId, { removalReason: "Race test" });
    await new Promise((resolve) => setTimeout(resolve, 25));
    releaseRemove();
    await expect(pendingRemoval).rejects.toMatchObject({ code: "TICKET_FINAL" });
    await removeFinalizer;
    const attachmentAfterRace = await prisma.attachment.findUniqueOrThrow({ where: { id: ownedAttachmentId } });
    expect(attachmentAfterRace.removedAt).toBeNull();
    await prisma.ticket.update({ where: { id: ticketAId }, data: { currentStatus: "NEW" } });
  });

  it("allows Staff and Administrator to read Attachment data without Requester ownership", async () => {
    const staff = await login(staffId, `authz-staff-${suiteTag}@example.test`);
    const admin = await login(adminId, `authz-admin-${suiteTag}@example.test`);
    for (const auth of [staff, admin]) {
      expect((await request(app).get(`/api/attachments/${attachmentAId}`).set("Cookie", auth.cookie)).status).toBe(200);
      expect((await request(app).get(`/api/attachments/${attachmentAId}/download`).set("Cookie", auth.cookie)).status).toBe(200);
    }
  });
});

describe("API-Z03 — direct Role boundaries and restricted representations", () => {
  it("denies Staff and Administrator on Requester Ticket/Attachment mutations", async () => {
    const staff = await login(staffId, `authz-staff-${suiteTag}@example.test`);
    const admin = await login(adminId, `authz-admin-${suiteTag}@example.test`);
    for (const auth of [staff, admin]) {
      safeError(await request(app).get("/api/tickets").set("Cookie", auth.cookie), 403, "FORBIDDEN");
      safeError(await request(app).get(`/api/tickets/${ticketAId}`).set("Cookie", auth.cookie), 403, "FORBIDDEN");
      safeError(
        await request(app).post(`/api/tickets/${ticketAId}/attachments`).set("Cookie", auth.cookie).attach("file", Buffer.from("staff"), "staff.png"),
        403,
        "FORBIDDEN"
      );
      safeError(
        await request(app).patch(`/api/attachments/${attachmentAId}/remove`).set("Cookie", auth.cookie).send({ removalReason: "No" }),
        403,
        "FORBIDDEN"
      );
    }
  });

  it("denies Requester direct Internal Note and User Management paths without a representation", async () => {
    const requester = await login(requesterAId, `authz-a-${suiteTag}@example.test`);
    const notes = await request(app).get(`/api/staff/tickets/${ticketAId}/notes`).set("Cookie", requester.cookie);
    safeError(notes, 403, "FORBIDDEN");
    expect(JSON.stringify(notes.body)).not.toContain("InternalNote");

    const users = await request(app).get("/api/admin/users").set("Cookie", requester.cookie);
    safeError(users, 403, "FORBIDDEN");
    expect(JSON.stringify(users.body)).not.toContain("password");

    expect((await request(app).get("/api/dev-requesters")).status).toBe(404);
  });

  it("lets Administrator pass the Staff boundary while preserving feature scope", async () => {
    const admin = await login(adminId, `authz-admin-${suiteTag}@example.test`);
    const staffFeature = await request(app).get(`/api/staff/tickets/${ticketAId}`).set("Cookie", admin.cookie);
    safeError(staffFeature, 404, "ROUTE_NOT_FOUND");

    const staff = await login(staffId, `authz-staff-${suiteTag}@example.test`);
    const adminFeature = await request(app).get("/api/admin/users").set("Cookie", staff.cookie);
    safeError(adminFeature, 403, "FORBIDDEN");
  });
});

describe("API-Z04 — scrubbed unexpected failures", () => {
  it("maps an unexpected Ticket service failure to exactly 500 INTERNAL_ERROR", async () => {
    const requester = await login(requesterAId, `authz-a-${suiteTag}@example.test`);
    const findFirst = vi.spyOn(prisma.ticket, "findFirst").mockRejectedValueOnce(
      new Error("SELECT passwordHash FROM User; D:\\private\\stack.ts")
    );

    const response = await request(app).get(`/api/tickets/${ticketAId}`).set("Cookie", requester.cookie);
    safeError(response, 500, "INTERNAL_ERROR");
    expect(response.body.error).toEqual({ code: "INTERNAL_ERROR", message: "An unexpected error occurred." });
    findFirst.mockRestore();
  });
});
