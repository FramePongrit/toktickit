import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BCRYPT_COST, LEGACY_INITIAL_PASSWORD, seedDatabase } from "../../prisma/seed.js";
import { storedFilePath } from "../../src/lib/paths.js";
import { allocateTicketNumber } from "../../src/services/ticketNumber.service.js";

const LAB3_WORKFLOW_MIGRATION = "20260918120000_lab3_user_workflow";
const LAB3_CSRF_MIGRATION = "20260918130000_auth_session_csrf_ciphertext";
const LAB3_REVOKE_MIGRATION = "20260918140000_revoke_legacy_auth_sessions";
const LAB4_WORKFLOW_MIGRATION = "20261024000000_lab4_actions_workflow";
const LAB3_MIGRATIONS = [
  LAB3_WORKFLOW_MIGRATION,
  LAB3_CSRF_MIGRATION,
  LAB3_REVOKE_MIGRATION,
] as const;
const LAB2_BASE_REF = "103e4be";
const FIXTURE_YEAR = 2026;
const LEGACY_ATTACHMENT_TIMESTAMP = new Date("2026-08-01T09:00:00.000Z");
const SERVER_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SOURCE_PRISMA_DIRECTORY = path.join(SERVER_ROOT, "prisma");

let adminClient: PrismaClient | undefined;
let lab3Client: PrismaClient | undefined;
let freshLab3Client: PrismaClient | undefined;
let harnessSchema: string | undefined;
let freshSchema: string | undefined;
let harnessUrl: string | undefined;
let freshUrl: string | undefined;
let temporaryPrismaDirectory: string | undefined;
let legacyUserId: number;
let legacyTicketId: number;
let legacyResolvedTicketId: number;
let legacyWaitingTicketId: number;
let legacyAttachmentId: number;
let legacyTicketNumber: string;
let legacyResolvedTicketNumber: string;
const legacyWaitingTicketNumber = "TKT-2026-000104";
let legacyStoredFilename: string;
let legacyAuthSessionId: string;
let expiredLegacyAuthSessionId: string;
let revokedLegacyAuthSessionId: string;
let ciphertextLegacyAuthSessionId: string;
const LEGACY_SESSION_EXPIRY = new Date("2099-09-18T17:00:00.000Z");
const EXPIRED_SESSION_EXPIRY = new Date("2020-09-18T17:00:00.000Z");
const LEGACY_REVOKED_AT = new Date("2026-09-18T12:00:00.000Z");
const LEGACY_CIPHERTEXT = "existing-encrypted-csrf-value";
let migrationProducedNullCredential = false;
let migrationProducedNoMandatoryChange = false;

function harnessUnavailable(message: string): Error {
  return new Error(`MIGRATION_HARNESS_UNAVAILABLE: ${message}`);
}

function isolatedSchemaUrl(databaseUrl: string, schema: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

function validateTestDatabase(databaseUrl: string): void {
  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) || databaseName !== "lab4test") {
    throw harnessUnavailable("use the dedicated loopback lab4test database; migration tests create and drop task-owned schemas.");
  }
}

function safeCommandOutput(value: unknown): string {
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value ?? "");
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgresql://[redacted]@")
    .replace(/(password\s*[=:]\s*)\S+/gi, "$1[redacted]")
    .trim()
    .slice(0, 4_000);
}

function runMigrateDeploy(schemaPath: string, databaseUrl: string, phase: string): void {
  const prismaCli = path.join(SERVER_ROOT, "node_modules", "prisma", "build", "index.js");

  try {
    execFileSync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], {
      cwd: SERVER_ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    });
  } catch (error) {
    const commandError = error as Error & { stdout?: Buffer | string; stderr?: Buffer | string };
    const diagnostic = [commandError.stdout, commandError.stderr, commandError.message]
      .map(safeCommandOutput)
      .filter(Boolean)
      .join("\n");
    throw new Error(
      `MIGRATION_HARNESS_MIGRATE_FAILED: prisma migrate deploy failed during ${phase}.\n${diagnostic}`
    );
  }
}

function loadLab2Schema(): string {
  try {
    return execFileSync(
      "git",
      ["show", `${LAB2_BASE_REF}:server/prisma/schema.prisma`],
      { cwd: SERVER_ROOT, encoding: "utf8" }
    );
  } catch {
    throw harnessUnavailable(
      `the checked-out repository must retain ${LAB2_BASE_REF} so the actual Lab 2 schema can be deployed.`
    );
  }
}

async function insertLab2Fixture(client: PrismaClient): Promise<void> {
  const timestamp = LEGACY_ATTACHMENT_TIMESTAMP;
  const suffix = randomUUID().replaceAll("-", "").slice(0, 6);
  const ticketSequence = 900_000 + (parseInt(suffix, 16) % 100_000);
  const categoryId = 710_001;
  const relatedSystemId = 710_002;
  legacyUserId = 710_003;
  legacyTicketId = 710_004;
  legacyResolvedTicketId = 710_009;
  legacyWaitingTicketId = 710_010;
  legacyAttachmentId = 710_005;
  legacyStoredFilename = `migration-upgrade-${suffix}.txt`;
  legacyTicketNumber = `TKT-2026-${String(ticketSequence).padStart(6, "0")}`;
  legacyResolvedTicketNumber = `TKT-2026-${String(ticketSequence - 1).padStart(6, "0")}`;

  await fs.writeFile(storedFilePath(legacyStoredFilename), "historical attachment fixture");

  await client.$executeRawUnsafe(
    `INSERT INTO "Category" ("id", "name", "active", "createdAt") VALUES ($1, $2, $3, $4)`,
    categoryId,
    `Migration Category ${suffix}`,
    true,
    timestamp
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "RelatedSystem" ("id", "name", "active", "createdAt") VALUES ($1, $2, $3, $4)`,
    relatedSystemId,
    `Migration System ${suffix}`,
    true,
    timestamp
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "RequesterUser" ("id", "fullName", "email", "department", "active", "role", "passwordHash", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6::"Role", $7, $8, $9)`,
    legacyUserId,
    "Migrated Legacy Requester",
    `migration-legacy-${suffix}@lab3.local`,
    "Historical Department",
    true,
    "REQUESTER",
    null,
    timestamp,
    timestamp
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "Ticket" ("id", "ticketNumber", "requesterId", "categoryId", "relatedSystemId", "requestedPriority", "summary", "description", "currentStatus", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6::"Priority", $7, $8, $9::"TicketStatus", $10, $11)`,
    legacyTicketId,
    legacyTicketNumber,
    legacyUserId,
    categoryId,
    relatedSystemId,
    "HIGH",
    "Legacy ticket retained through migration",
    "Historical ticket data used to verify in-place migration behavior.",
    "NEW",
    timestamp,
    timestamp
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "Attachment" ("id", "ticketId", "originalFilename", "storedFilename", "mimeType", "sizeBytes", "uploadedByRequesterId", "uploadedAt", "removedAt", "removedByRequesterId", "removalReason")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    legacyAttachmentId,
    legacyTicketId,
    "historical.txt",
    legacyStoredFilename,
    "text/plain",
    29,
    legacyUserId,
    timestamp,
    timestamp,
    legacyUserId,
    "Historical fixture"
  );
}

async function insertIssue48LegacySession(client: PrismaClient): Promise<void> {
  legacyAuthSessionId = `issue48-session-${randomUUID().replaceAll("-", "")}`;
  expiredLegacyAuthSessionId = `issue48-expired-${randomUUID().replaceAll("-", "")}`;
  revokedLegacyAuthSessionId = `issue48-revoked-${randomUUID().replaceAll("-", "")}`;
  ciphertextLegacyAuthSessionId = `issue48-ciphertext-${randomUUID().replaceAll("-", "")}`;
  await client.$executeRawUnsafe(
    `INSERT INTO "AuthSession" ("id", "userId", "csrfTokenHash", "issuedAt", "expiresAt", "revokedAt")
     VALUES ($1, $2, $3, $4, $5, NULL)`,
    legacyAuthSessionId,
    legacyUserId,
    "legacy-csrf-hash",
    new Date("2026-09-18T09:00:00.000Z"),
    LEGACY_SESSION_EXPIRY
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "AuthSession" ("id", "userId", "csrfTokenHash", "issuedAt", "expiresAt", "revokedAt")
     VALUES ($1, $2, $3, $4, $5, NULL)`,
    expiredLegacyAuthSessionId,
    legacyUserId,
    "expired-legacy-csrf-hash",
    new Date("2020-09-18T09:00:00.000Z"),
    EXPIRED_SESSION_EXPIRY
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "AuthSession" ("id", "userId", "csrfTokenHash", "issuedAt", "expiresAt", "revokedAt")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    revokedLegacyAuthSessionId,
    legacyUserId,
    "revoked-legacy-csrf-hash",
    new Date("2026-09-18T09:00:00.000Z"),
    LEGACY_SESSION_EXPIRY,
    LEGACY_REVOKED_AT
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "AuthSession" ("id", "userId", "csrfTokenHash", "issuedAt", "expiresAt", "revokedAt")
     VALUES ($1, $2, $3, $4, $5, NULL)`,
    ciphertextLegacyAuthSessionId,
    legacyUserId,
    "ciphertext-legacy-csrf-hash",
    new Date("2026-09-18T09:00:00.000Z"),
    LEGACY_SESSION_EXPIRY
  );
}

async function populateLegacyCiphertextSession(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe(
    `UPDATE "AuthSession" SET "csrfTokenCiphertext" = $1 WHERE "id" = $2`,
    LEGACY_CIPHERTEXT,
    ciphertextLegacyAuthSessionId
  );
}

async function insertLegacyResolvedTicket(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe(
    `INSERT INTO "Ticket" ("id", "ticketNumber", "requesterId", "categoryId", "relatedSystemId", "requestedPriority", "itPriority", "summary", "description", "currentStatus", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6::"Priority", $7::"Priority", $8, $9, $10::"TicketStatus", $11, $12)`,
    legacyResolvedTicketId,
    legacyResolvedTicketNumber,
    legacyUserId,
    710_001,
    710_002,
    "HIGH",
    "URGENT",
    "Legacy resolved Ticket retained through migration",
    "The historical status is known but its resolution time is not.",
    "RESOLVED",
    new Date(LEGACY_ATTACHMENT_TIMESTAMP.getTime() + 60 * 60 * 1000),
    new Date(LEGACY_ATTACHMENT_TIMESTAMP.getTime() + 60 * 60 * 1000)
  );
}

async function insertLegacyWaitingTicket(client: PrismaClient): Promise<void> {
  const createdAt = new Date(LEGACY_ATTACHMENT_TIMESTAMP.getTime() + 2 * 60 * 60 * 1000);
  await client.$executeRawUnsafe(
    `INSERT INTO "Ticket" ("id", "ticketNumber", "requesterId", "categoryId", "relatedSystemId", "requestedPriority", "itPriority", "summary", "description", "currentStatus", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6::"Priority", $6::"Priority", $7, $8, $9::"TicketStatus", $10, $11)`,
    legacyWaitingTicketId,
    legacyWaitingTicketNumber,
    legacyUserId,
    710_001,
    710_002,
    "MEDIUM",
    "Legacy waiting ticket without an attached public comment",
    "The historical transition does not retain its original public comment.",
    "WAITING_FOR_REQUESTER",
    createdAt,
    createdAt
  );
}

async function cleanupHarness(): Promise<void> {
  await lab3Client?.$disconnect();
  lab3Client = undefined;
  await freshLab3Client?.$disconnect();
  freshLab3Client = undefined;

  if (adminClient && harnessSchema) {
    await adminClient.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${harnessSchema}" CASCADE`);
  }
  if (adminClient && freshSchema) {
    await adminClient.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${freshSchema}" CASCADE`);
  }
  await adminClient?.$disconnect();
  adminClient = undefined;

  if (temporaryPrismaDirectory) {
    await fs.rm(temporaryPrismaDirectory, { recursive: true, force: true });
  }
  if (legacyStoredFilename) {
    await fs.rm(storedFilePath(legacyStoredFilename), { force: true });
  }
}

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw harnessUnavailable("DATABASE_URL is required.");
  }
  validateTestDatabase(databaseUrl);

  harnessSchema = `lab3_migration_${randomUUID().replaceAll("-", "")}`;
  harnessUrl = isolatedSchemaUrl(databaseUrl, harnessSchema);
  adminClient = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    await adminClient.$connect();
    await adminClient.$executeRawUnsafe(`CREATE SCHEMA "${harnessSchema}"`);
  } catch {
    await adminClient.$disconnect();
    adminClient = undefined;
    throw harnessUnavailable(
      "a reachable PostgreSQL instance and CREATE SCHEMA privilege are required for the disposable migration database."
    );
  }

  try {
    temporaryPrismaDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "toktickit-migration-"));
    const temporaryPrisma = path.join(temporaryPrismaDirectory, "prisma");
    await fs.cp(SOURCE_PRISMA_DIRECTORY, temporaryPrisma, { recursive: true });
    const lab3Schema = await fs.readFile(path.join(temporaryPrisma, "schema.prisma"), "utf8");
    for (const migration of [...LAB3_MIGRATIONS, LAB4_WORKFLOW_MIGRATION]) {
      await fs.rm(path.join(temporaryPrisma, "migrations", migration), {
        recursive: true,
        force: true,
      });
    }
    await fs.writeFile(path.join(temporaryPrisma, "schema.prisma"), loadLab2Schema());

    // Production uses prisma migrate deploy. Applying this copied Lab 2-only
    // migration set and the exact base schema gives the fixture the real
    // pre-upgrade shape.
    runMigrateDeploy(path.join(temporaryPrisma, "schema.prisma"), harnessUrl, "Lab 2 setup");

    const legacyClient = new PrismaClient({ datasources: { db: { url: harnessUrl } } });
    try {
      await legacyClient.$connect();
      await insertLab2Fixture(legacyClient);
    } finally {
      await legacyClient.$disconnect();
    }

    for (const migration of LAB3_MIGRATIONS) {
      await fs.cp(
        path.join(SOURCE_PRISMA_DIRECTORY, "migrations", migration),
        path.join(temporaryPrisma, "migrations", migration),
        { recursive: true }
      );
      if (migration === LAB3_WORKFLOW_MIGRATION) {
        await fs.writeFile(path.join(temporaryPrisma, "schema.prisma"), lab3Schema);
        runMigrateDeploy(
          path.join(temporaryPrisma, "schema.prisma"),
          harnessUrl,
          "Lab 3 workflow upgrade"
        );

        const workflowClient = new PrismaClient({ datasources: { db: { url: harnessUrl } } });
        try {
          await workflowClient.$connect();
          await insertIssue48LegacySession(workflowClient);
        } finally {
          await workflowClient.$disconnect();
        }
      }
      if (migration === LAB3_CSRF_MIGRATION) {
        await fs.writeFile(path.join(temporaryPrisma, "schema.prisma"), lab3Schema);
        runMigrateDeploy(
          path.join(temporaryPrisma, "schema.prisma"),
          harnessUrl,
          "Lab 3 CSRF ciphertext upgrade"
        );

        const ciphertextClient = new PrismaClient({ datasources: { db: { url: harnessUrl } } });
        try {
          await ciphertextClient.$connect();
          await populateLegacyCiphertextSession(ciphertextClient);
        } finally {
          await ciphertextClient.$disconnect();
        }
      }
    }

    await fs.writeFile(path.join(temporaryPrisma, "schema.prisma"), lab3Schema);
    runMigrateDeploy(path.join(temporaryPrisma, "schema.prisma"), harnessUrl, "Lab 3 legacy-session revoke upgrade");

    const preLab4Client = new PrismaClient({ datasources: { db: { url: harnessUrl } } });
    try {
      await preLab4Client.$connect();
      await insertLegacyResolvedTicket(preLab4Client);
      await insertLegacyWaitingTicket(preLab4Client);
    } finally {
      await preLab4Client.$disconnect();
    }

    await fs.cp(
      path.join(SOURCE_PRISMA_DIRECTORY, "migrations", LAB4_WORKFLOW_MIGRATION),
      path.join(temporaryPrisma, "migrations", LAB4_WORKFLOW_MIGRATION),
      { recursive: true }
    );
    runMigrateDeploy(path.join(temporaryPrisma, "schema.prisma"), harnessUrl, "Lab 4 workflow upgrade");

    lab3Client = new PrismaClient({ datasources: { db: { url: harnessUrl } } });
    await lab3Client.$connect();

    const migratedUser = await lab3Client.user.findUniqueOrThrow({ where: { id: legacyUserId } });
    migrationProducedNullCredential = migratedUser.passwordHash === null;
    migrationProducedNoMandatoryChange = migratedUser.mustChangePassword === false;

    freshSchema = `lab3_fresh_${randomUUID().replaceAll("-", "")}`;
    freshUrl = isolatedSchemaUrl(databaseUrl, freshSchema);
    await adminClient.$executeRawUnsafe(`CREATE SCHEMA "${freshSchema}"`);
    runMigrateDeploy(path.join(temporaryPrisma, "schema.prisma"), freshUrl, "fresh Lab 3 setup");
    freshLab3Client = new PrismaClient({ datasources: { db: { url: freshUrl } } });
    await freshLab3Client.$connect();
  } catch (error) {
    await cleanupHarness();
    throw error;
  }
}, 120_000);

afterAll(async () => {
  await cleanupHarness();
});

describe("MIG-01 — actual Lab 2 through Lab 4 upgrade", () => {
  it("renames in place, preserves historical relations/files, copies IT Priority, then backfills credentials", async () => {
    const prisma = lab3Client!;
    const userBeforeSeed = await prisma.user.findUniqueOrThrow({ where: { id: legacyUserId } });
    const ticketBeforeSeed = await prisma.ticket.findUniqueOrThrow({ where: { id: legacyTicketId } });
    const attachmentBeforeSeed = await prisma.attachment.findUniqueOrThrow({ where: { id: legacyAttachmentId } });

    expect(userBeforeSeed.id).toBe(legacyUserId);
    expect(migrationProducedNullCredential).toBe(true);
    expect(migrationProducedNoMandatoryChange).toBe(true);
    expect(ticketBeforeSeed.id).toBe(legacyTicketId);
    expect(ticketBeforeSeed.requesterId).toBe(legacyUserId);
    expect(ticketBeforeSeed.itPriority === ticketBeforeSeed.requestedPriority).toBe(true);
    expect(ticketBeforeSeed.workCycle).toBe(1);
    expect(ticketBeforeSeed.version).toBe(1);
    expect(ticketBeforeSeed.resolvedAt).toBeNull();
    expect(await prisma.actionTaken.count({ where: { ticketId: legacyTicketId } })).toBe(0);
    const baseline = await prisma.ticketWorkflowEvent.findMany({ where: { ticketId: legacyTicketId } });
    expect(baseline).toHaveLength(1);
    expect(baseline[0]).toMatchObject({
      workCycle: 1,
      kind: "BASELINE",
      fromStatus: null,
      toStatus: "NEW",
      actorId: null,
      ticketVersion: 1,
    });
    const resolvedLegacyTicket = await prisma.ticket.findUniqueOrThrow({ where: { id: legacyResolvedTicketId } });
    expect(resolvedLegacyTicket.ticketNumber).toBe(legacyResolvedTicketNumber);
    expect(resolvedLegacyTicket.currentStatus).toBe("RESOLVED");
    expect(resolvedLegacyTicket.workCycle).toBe(1);
    expect(resolvedLegacyTicket.version).toBe(1);
    expect(resolvedLegacyTicket.resolvedAt).toBeNull();
    expect(await prisma.actionTaken.count({ where: { ticketId: legacyResolvedTicketId } })).toBe(0);
    expect(await prisma.ticketWorkflowEvent.findMany({ where: { ticketId: legacyResolvedTicketId } })).toMatchObject([
      { kind: "BASELINE", fromStatus: null, toStatus: "RESOLVED", actorId: null, ticketVersion: 1 },
    ]);
    const waitingLegacyTicket = await prisma.ticket.findUniqueOrThrow({ where: { id: legacyWaitingTicketId } });
    expect(waitingLegacyTicket.ticketNumber).toBe(legacyWaitingTicketNumber);
    expect(waitingLegacyTicket.currentStatus).toBe("WAITING_FOR_REQUESTER");
    expect(await prisma.ticketWorkflowEvent.findMany({ where: { ticketId: legacyWaitingTicketId } })).toMatchObject([
      { kind: "BASELINE", toStatus: "WAITING_FOR_REQUESTER", actorId: null, ticketVersion: 1 },
    ]);
    expect(await prisma.publicComment.count({ where: { ticketId: legacyWaitingTicketId } })).toBe(0);
    expect(await prisma.actionTaken.count({ where: { ticketId: legacyWaitingTicketId } })).toBe(0);
    expect(attachmentBeforeSeed.id).toBe(legacyAttachmentId);
    expect(attachmentBeforeSeed.ticketId).toBe(legacyTicketId);
    expect(attachmentBeforeSeed.originalFilename).toBe("historical.txt");
    expect(attachmentBeforeSeed.storedFilename).toBe(legacyStoredFilename);
    expect(attachmentBeforeSeed.mimeType).toBe("text/plain");
    expect(attachmentBeforeSeed.sizeBytes).toBe(29);
    expect(attachmentBeforeSeed.uploadedByRequesterId).toBe(legacyUserId);
    expect(attachmentBeforeSeed.uploadedAt).toEqual(LEGACY_ATTACHMENT_TIMESTAMP);
    expect(attachmentBeforeSeed.removedByRequesterId).toBe(legacyUserId);
    expect(attachmentBeforeSeed.removedAt).toEqual(LEGACY_ATTACHMENT_TIMESTAMP);
    expect(attachmentBeforeSeed.removalReason).toBe("Historical fixture");
    const legacySession = await prisma.authSession.findUniqueOrThrow({ where: { id: legacyAuthSessionId } });
    expect(legacySession.csrfTokenCiphertext).toBeNull();
    expect(legacySession.revokedAt).not.toBeNull();
    const expiredSession = await prisma.authSession.findUniqueOrThrow({ where: { id: expiredLegacyAuthSessionId } });
    expect(expiredSession.expiresAt).toEqual(EXPIRED_SESSION_EXPIRY);
    expect(expiredSession.revokedAt).toBeNull();
    const revokedSession = await prisma.authSession.findUniqueOrThrow({ where: { id: revokedLegacyAuthSessionId } });
    expect(revokedSession.expiresAt).toEqual(LEGACY_SESSION_EXPIRY);
    expect(revokedSession.revokedAt).toEqual(LEGACY_REVOKED_AT);
    const ciphertextSession = await prisma.authSession.findUniqueOrThrow({ where: { id: ciphertextLegacyAuthSessionId } });
    expect(ciphertextSession.csrfTokenCiphertext).toBe(LEGACY_CIPHERTEXT);
    expect(ciphertextSession.revokedAt).toBeNull();
    expect(await fs.readFile(storedFilePath(legacyStoredFilename), "utf8")).toBe(
      "historical attachment fixture"
    );

    await seedDatabase(prisma);
    const userAfterSeed = await prisma.user.findUniqueOrThrow({ where: { id: legacyUserId } });
    expect(
      typeof userAfterSeed.passwordHash === "string" && /^\$2[aby]\$12\$/.test(userAfterSeed.passwordHash)
    ).toBe(true);
    expect(await bcrypt.compare(LEGACY_INITIAL_PASSWORD, userAfterSeed.passwordHash ?? "")).toBe(true);
    expect(userAfterSeed.mustChangePassword).toBe(true);

    const reopenedDemo = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: "TKT-2026-000110" } });
    const resolvedDemo = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: "TKT-2026-000111" } });
    expect(reopenedDemo).toMatchObject({ currentStatus: "REOPENED", workCycle: 2, resolvedAt: null });
    expect(resolvedDemo.currentStatus).toBe("RESOLVED");
    expect(await prisma.actionTaken.count({ where: { ticketId: reopenedDemo.id } })).toBe(5);
    expect(await prisma.actionTaken.count({ where: { ticketId: resolvedDemo.id } })).toBe(1);
    expect(await prisma.actionTaken.count({ where: { ticketId: legacyTicketId } })).toBe(0);
    expect(await prisma.actionTaken.count({ where: { ticketId: legacyResolvedTicketId } })).toBe(0);
    expect(await prisma.ticketWorkflowEvent.findMany({ where: { ticketId: legacyResolvedTicketId } })).toMatchObject([
      { kind: "BASELINE", toStatus: "RESOLVED", actorId: null, ticketVersion: 1 },
    ]);
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: legacyWaitingTicketId } })).toMatchObject({
      currentStatus: "WAITING_FOR_REQUESTER",
      workCycle: 1,
      version: 1,
    });
    expect(await prisma.publicComment.count({ where: { ticketId: legacyWaitingTicketId } })).toBe(0);
    expect(await prisma.actionTaken.count({ where: { ticketId: legacyWaitingTicketId } })).toBe(0);
  });

  it("preserves a directly established changed credential across a repeat seed", async () => {
    const prisma = lab3Client!;
    const changedHash = await bcrypt.hash("ChangedFixture123!", BCRYPT_COST);
    await prisma.user.update({
      where: { id: legacyUserId },
      data: { passwordHash: changedHash, mustChangePassword: false },
    });

    const publicCommentCount = await prisma.publicComment.count();
    const internalNoteCount = await prisma.internalNote.count();
    await seedDatabase(prisma);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: legacyUserId } });
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: legacyTicketId } });
    const attachment = await prisma.attachment.findUniqueOrThrow({ where: { id: legacyAttachmentId } });

    expect(user.passwordHash === changedHash).toBe(true);
    expect(user.mustChangePassword).toBe(false);
    expect(ticket.id).toBe(legacyTicketId);
    expect(ticket.ticketNumber).toBe(legacyTicketNumber);
    expect(ticket.requesterId).toBe(legacyUserId);
    expect(attachment.id).toBe(legacyAttachmentId);
    expect(attachment.ticketId).toBe(legacyTicketId);
    expect(attachment.originalFilename).toBe("historical.txt");
    expect(attachment.storedFilename).toBe(legacyStoredFilename);
    expect(attachment.mimeType).toBe("text/plain");
    expect(attachment.sizeBytes).toBe(29);
    expect(attachment.uploadedByRequesterId).toBe(legacyUserId);
    expect(attachment.uploadedAt).toEqual(LEGACY_ATTACHMENT_TIMESTAMP);
    expect(attachment.removedByRequesterId).toBe(legacyUserId);
    expect(attachment.removedAt).toEqual(LEGACY_ATTACHMENT_TIMESTAMP);
    expect(attachment.removalReason).toBe("Historical fixture");
    expect(await fs.readFile(storedFilePath(legacyStoredFilename), "utf8")).toBe(
      "historical attachment fixture"
    );
    expect(await prisma.publicComment.count()).toBe(publicCommentCount);
    expect(await prisma.internalNote.count()).toBe(internalNoteCount);
  });
});

describe("MIG-02 — idempotent workflow seed", () => {
  it("seeds a separate fresh Lab 4 schema without duplicates and advances, but never lowers, the 2026 ticket counter", async () => {
    const prisma = freshLab3Client!;
    await seedDatabase(prisma);

    const seededUsers = await prisma.user.findMany({ select: { email: true, role: true, active: true } });
    expect(seededUsers.filter((user) => user.role === "REQUESTER" && user.active)).toHaveLength(5);
    expect(seededUsers.filter((user) => user.role === "REQUESTER" && !user.active)).toHaveLength(1);
    expect(seededUsers.filter((user) => user.role === "STAFF" && user.active)).toHaveLength(3);
    expect(seededUsers.filter((user) => user.role === "STAFF" && !user.active)).toHaveLength(1);
    expect(seededUsers.filter((user) => user.role === "ADMIN" && user.active)).toHaveLength(1);

    const beforeRepeat = {
      users: seededUsers.length,
      categories: await prisma.category.count(),
      systems: await prisma.relatedSystem.count(),
      tickets: await prisma.ticket.count(),
      comments: await prisma.publicComment.count(),
      notes: await prisma.internalNote.count(),
    };
    await seedDatabase(prisma);
    expect({
      users: await prisma.user.count(),
      categories: await prisma.category.count(),
      systems: await prisma.relatedSystem.count(),
      tickets: await prisma.ticket.count(),
      comments: await prisma.publicComment.count(),
      notes: await prisma.internalNote.count(),
    }).toEqual(beforeRepeat);
    expect(new Set((await prisma.user.findMany({ select: { email: true } })).map((user) => user.email)).size).toBe(
      beforeRepeat.users
    );
    expect(new Set((await prisma.category.findMany({ select: { name: true } })).map((category) => category.name)).size).toBe(
      beforeRepeat.categories
    );
    expect(
      new Set((await prisma.relatedSystem.findMany({ select: { name: true } })).map((system) => system.name)).size
    ).toBe(beforeRepeat.systems);
    expect(
      new Set((await prisma.ticket.findMany({ select: { ticketNumber: true } })).map((ticket) => ticket.ticketNumber)).size
    ).toBe(beforeRepeat.tickets);

    const fixtureTickets = await prisma.ticket.findMany({
      where: { ticketNumber: { in: Array.from({ length: 11 }, (_, index) => `TKT-2026-${String(101 + index).padStart(6, "0")}`) } },
      select: { currentStatus: true, itPriority: true, requestedPriority: true, ownerId: true },
    });
    expect(fixtureTickets).toHaveLength(11);
    expect(fixtureTickets.every((ticket) => ticket.itPriority === ticket.requestedPriority)).toBe(true);
    expect(fixtureTickets.some((ticket) => ticket.ownerId === null)).toBe(true);
    expect(new Set(fixtureTickets.map((ticket) => ticket.currentStatus))).toEqual(
      new Set(["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "REOPENED", "CLOSED", "CANCELLED"])
    );

    const seededCounter = await prisma.ticketCounter.findUniqueOrThrow({ where: { year: FIXTURE_YEAR } });
    expect(seededCounter.lastValue).toBeGreaterThanOrEqual(111);

    const actions = await prisma.actionTaken.findMany({
      include: { assignee: { select: { email: true, active: true } }, revisions: true, ticket: { select: { ticketNumber: true } } },
    });
    expect(actions.filter((action) => action.ticket.ticketNumber === "TKT-2026-000101")).toHaveLength(0);
    expect(actions.filter((action) => action.ticket.ticketNumber === "TKT-2026-000102")).toHaveLength(1);
    expect(actions.filter((action) => action.ticket.ticketNumber === "TKT-2026-000103")).toHaveLength(3);
    expect(new Set(actions.map((action) => action.status))).toEqual(
      new Set(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
    );
    expect(actions.some((action) => action.followUpRequired && Boolean(action.followUpNote?.trim()))).toBe(true);
    expect(actions.some((action) => !action.assignee.active && action.status === "COMPLETED")).toBe(true);
    expect(actions.some((action) => action.ticket.ticketNumber === "TKT-2026-000110" && action.workCycle === 2 && !action.assignee.active && ["PLANNED", "IN_PROGRESS"].includes(action.status))).toBe(true);
    expect(actions.some((action) => action.ticket.ticketNumber === "TKT-2026-000106" && action.workCycle === 1)).toBe(true);
    expect(actions.some((action) => action.ticket.ticketNumber === "TKT-2026-000106" && action.workCycle === 2)).toBe(true);
    expect(actions.filter((action) => action.ticket.ticketNumber === "TKT-2026-000110")).toHaveLength(5);
    expect(actions.filter((action) => action.ticket.ticketNumber === "TKT-2026-000111")).toHaveLength(1);
    expect(actions.every((action) => action.revisions.length === action.version)).toBe(true);
    const reopenedFixture = await prisma.ticket.findUniqueOrThrow({
      where: { ticketNumber: "TKT-2026-000110" },
      include: { workflowEvents: true, actions: { include: { revisions: true } } },
    });
    expect(reopenedFixture.resolvedAt).toBeNull();
    const resolvedEvent = reopenedFixture.workflowEvents.find((event) => event.toStatus === "RESOLVED");
    const reopenedEvent = reopenedFixture.workflowEvents.find((event) => event.toStatus === "REOPENED");
    const historicalAction = reopenedFixture.actions.find((action) => action.workCycle === 1);
    const currentCycleActions = reopenedFixture.actions.filter((action) => action.workCycle === 2);
    expect(resolvedEvent).toBeDefined();
    expect(reopenedEvent?.workCycle).toBe(2);
    expect(historicalAction?.completedAt?.getTime()).toBeLessThan(resolvedEvent!.occurredAt.getTime());
    expect(currentCycleActions.every((action) => action.createdAt.getTime() > reopenedEvent!.occurredAt.getTime())).toBe(true);
    expect(reopenedFixture.version).toBe(
      1 + reopenedFixture.workflowEvents.filter((event) => event.kind === "TRANSITION").length +
        reopenedFixture.actions.reduce((total, action) => total + action.version, 0)
    );
    const zeroMetricsRequester = await prisma.user.findUniqueOrThrow({
      where: { email: "no.ticket.requester@kmutt.ac.th" },
      include: { tickets: true },
    });
    expect(zeroMetricsRequester.tickets).toHaveLength(0);

    await prisma.ticketCounter.update({ where: { year: FIXTURE_YEAR }, data: { lastValue: 250 } });
    const actionCountBeforeRepeat = await prisma.actionTaken.count();
    const eventCountBeforeRepeat = await prisma.ticketWorkflowEvent.count();
    await seedDatabase(prisma);
    expect(await prisma.actionTaken.count()).toBe(actionCountBeforeRepeat);
    expect(await prisma.ticketWorkflowEvent.count()).toBe(eventCountBeforeRepeat);
    const preservedCounter = await prisma.ticketCounter.findUniqueOrThrow({ where: { year: FIXTURE_YEAR } });
    expect(preservedCounter.lastValue).toBe(250);

    const allocated = await prisma.$transaction((tx) => allocateTicketNumber(tx, FIXTURE_YEAR));
    expect(allocated).toBe("TKT-2026-000251");
  });
});
