import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";

const SERVER_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PRISMA_DIRECTORY = path.join(SERVER_ROOT, "prisma");
const TEST_DATABASE = "lab4test";

let admin: PrismaClient | undefined;
let prisma: PrismaClient | undefined;
let schema: string | undefined;
let temporaryDirectory: string | undefined;

function isolatedUrl(base: string, schemaName: string): string {
  const url = new URL(base);
  url.searchParams.set("schema", schemaName);
  return url.toString();
}

function validateTestDatabase(value: string): void {
  const url = new URL(value);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) || databaseName !== TEST_DATABASE) {
    throw new Error("MIGRATION_HARNESS_UNAVAILABLE: use the dedicated loopback lab4test database.");
  }
}

function safeOutput(value: unknown): string {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgresql://[redacted]@")
    .replace(/(password\s*[=:]\s*)\S+/gi, "$1[redacted]")
    .trim()
    .slice(0, 4_000);
}

function migrateDeploy(schemaPath: string, databaseUrl: string, phase: string): void {
  try {
    execFileSync(
      process.execPath,
      [path.join(SERVER_ROOT, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy", "--schema", schemaPath],
      { cwd: SERVER_ROOT, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" }
    );
  } catch (error) {
    const commandError = error as Error & { stdout?: Buffer | string; stderr?: Buffer | string };
    const details = [commandError.stdout, commandError.stderr]
      .map(safeOutput)
      .filter(Boolean)
      .join("\n");
    throw new Error(`MIGRATION_HARNESS_MIGRATE_FAILED: ${phase}.\n${details}`);
  }
}

async function cleanup(): Promise<void> {
  await prisma?.$disconnect();
  prisma = undefined;
  if (admin && schema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin?.$disconnect();
  admin = undefined;
  if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true });
}

async function expectTicketVersionTimeline(db: PrismaClient, ticketNumber: string): Promise<void> {
  const ticket = await db.ticket.findUniqueOrThrow({ where: { ticketNumber } });
  const [events, actions] = await Promise.all([
    db.ticketWorkflowEvent.findMany({ where: { ticketId: ticket.id } }),
    db.actionTaken.findMany({ where: { ticketId: ticket.id }, include: { revisions: true } }),
  ]);
  const created = events.find((event) => event.kind === "CREATED");
  expect(created?.ticketVersion).toBe(1);

  const operations = [
    ...events.filter((event) => event.kind === "TRANSITION").map((event) => ({
      occurredAt: event.occurredAt,
      ticketEvent: event,
    })),
    ...actions.flatMap((action) => action.revisions.map((revision) => ({
      occurredAt: revision.occurredAt,
      ticketEvent: null,
    }))),
  ].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());

  let version = 1;
  for (const operation of operations) {
    version += 1;
    if (operation.ticketEvent) expect(operation.ticketEvent.ticketVersion).toBe(version);
  }
  expect(ticket.version).toBe(version);
}

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("MIGRATION_HARNESS_UNAVAILABLE: DATABASE_URL is required.");
  validateTestDatabase(databaseUrl);

  schema = `lab4_migration_${randomUUID().replaceAll("-", "")}`;
  const schemaUrl = isolatedUrl(databaseUrl, schema);
  admin = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    await admin.$connect();
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "toktickit-lab4-migration-"));
    const copiedPrisma = path.join(temporaryDirectory, "prisma");
    await fs.cp(PRISMA_DIRECTORY, copiedPrisma, { recursive: true });
    migrateDeploy(path.join(copiedPrisma, "schema.prisma"), schemaUrl, "fresh Lab 4 migrations");
    prisma = new PrismaClient({ datasources: { db: { url: schemaUrl } } });
    await prisma.$connect();
  } catch (error) {
    await cleanup();
    throw error;
  }
}, 120_000);

afterAll(async () => cleanup());

describe("MIG-02 — Lab 4 seed is additive and repeatable", () => {
  it("seeds workflow coverage, then preserves changed credentials and user work", async () => {
    const db = prisma!;
    await seedDatabase(db);

    const tickets = await db.ticket.findMany({ orderBy: { id: "asc" } });
    const actions = await db.actionTaken.findMany({
      include: { assignee: { select: { active: true } }, revisions: true, ticket: { select: { ticketNumber: true } } },
    });
    expect(tickets.map((ticket) => ticket.currentStatus)).toEqual(
      expect.arrayContaining(["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "REOPENED", "CLOSED", "CANCELLED"])
    );
    expect(new Set(tickets.map((ticket) => ticket.requestedPriority))).toEqual(
      new Set(["LOW", "MEDIUM", "HIGH", "URGENT"])
    );
    expect(tickets.some((ticket) => ticket.ownerId === null)).toBe(true);
    expect(actions.filter((action) => action.ticket.ticketNumber === "TKT-2026-000101")).toHaveLength(0);
    expect(actions.filter((action) => action.ticket.ticketNumber === "TKT-2026-000102")).toHaveLength(1);
    expect(actions.filter((action) => action.ticket.ticketNumber === "TKT-2026-000103")).toHaveLength(3);
    expect(new Set(actions.map((action) => action.status))).toEqual(
      new Set(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
    );
    expect(actions.some((action) => action.followUpRequired && Boolean(action.followUpNote?.trim()))).toBe(true);
    expect(actions.some((action) => !action.assignee.active && action.status === "COMPLETED")).toBe(true);
    expect(actions.some((action) => action.ticket.ticketNumber === "TKT-2026-000110" && action.workCycle === 2 && !action.assignee.active && ["PLANNED", "IN_PROGRESS"].includes(action.status))).toBe(true);
    expect(actions.filter((action) => action.ticket.ticketNumber === "TKT-2026-000110")).toHaveLength(5);
    expect(actions.filter((action) => action.ticket.ticketNumber === "TKT-2026-000111")).toHaveLength(1);
    expect(actions.some((action) => action.ticket.ticketNumber === "TKT-2026-000106" && action.workCycle === 1)).toBe(true);
    expect(actions.some((action) => action.ticket.ticketNumber === "TKT-2026-000106" && action.workCycle === 2)).toBe(true);
    expect(actions.every((action) => action.revisions.length === action.version)).toBe(true);
    expect(await db.ticket.count({ where: { requester: { email: "no.ticket.requester@kmutt.ac.th" } } })).toBe(0);

    const reopened = await db.ticket.findUniqueOrThrow({ where: { ticketNumber: "TKT-2026-000110" } });
    const resolvedEvent = await db.ticketWorkflowEvent.findFirstOrThrow({
      where: { ticketId: reopened.id, toStatus: "RESOLVED" },
    });
    const reopenedEvent = await db.ticketWorkflowEvent.findFirstOrThrow({
      where: { ticketId: reopened.id, toStatus: "REOPENED" },
    });
    const firstCycleAction = await db.actionTaken.findFirstOrThrow({
      where: { ticketId: reopened.id, workCycle: 1 },
    });
    expect(reopened.resolvedAt).toBeNull();
    expect(firstCycleAction.completedAt?.getTime()).toBeLessThan(resolvedEvent.occurredAt.getTime());
    expect(reopenedEvent.workCycle).toBe(2);
    expect(await db.actionTaken.findFirstOrThrow({ where: { ticketId: reopened.id, workCycle: 2 } }).then((action) => action.createdAt.getTime())).toBeGreaterThan(reopenedEvent.occurredAt.getTime());
    await expectTicketVersionTimeline(db, "TKT-2026-000110");
    await expectTicketVersionTimeline(db, "TKT-2026-000111");

    const requester = await db.user.findUniqueOrThrow({ where: { email: "jennifer.anderson@kmutt.ac.th" } });
    const changedHash = await bcrypt.hash("ChangedForLab4Fixture123!", 12);
    await db.user.update({
      where: { id: requester.id },
      data: { passwordHash: changedHash, mustChangePassword: false },
    });
    const editedTicket = await db.ticket.findUniqueOrThrow({ where: { ticketNumber: "TKT-2026-000102" } });
    await db.ticket.update({ where: { id: editedTicket.id }, data: { summary: "Local work survives a seed rerun" } });
    const editedAction = await db.actionTaken.findFirstOrThrow({ where: { ticketId: editedTicket.id } });
    await db.actionTaken.update({ where: { id: editedAction.id }, data: { description: "User edited Action description" } });
    const editedPublicComment = await db.publicComment.findFirstOrThrow({
      where: { ticket: { ticketNumber: "TKT-2026-000104" } },
    });
    await db.publicComment.update({ where: { id: editedPublicComment.id }, data: { body: "User edited public comment" } });
    await db.internalNote.create({
      data: { ticketId: editedTicket.id, authorId: requester.id, body: "User-owned note" },
    });

    const beforeRepeat = {
      tickets: await db.ticket.count(),
      actions: await db.actionTaken.count(),
      revisions: await db.actionRevision.count(),
      events: await db.ticketWorkflowEvent.count(),
      comments: await db.publicComment.count(),
      notes: await db.internalNote.count(),
    };
    await seedDatabase(db);
    await seedDatabase(db);

    expect({
      tickets: await db.ticket.count(),
      actions: await db.actionTaken.count(),
      revisions: await db.actionRevision.count(),
      events: await db.ticketWorkflowEvent.count(),
      comments: await db.publicComment.count(),
      notes: await db.internalNote.count(),
    }).toEqual(beforeRepeat);
    expect(await db.user.findUniqueOrThrow({ where: { id: requester.id } })).toMatchObject({
      passwordHash: changedHash,
      mustChangePassword: false,
    });
    expect((await db.ticket.findUniqueOrThrow({ where: { id: editedTicket.id } })).summary).toBe(
      "Local work survives a seed rerun"
    );
    expect((await db.actionTaken.findUniqueOrThrow({ where: { id: editedAction.id } })).description).toBe(
      "User edited Action description"
    );
    expect((await db.publicComment.findUniqueOrThrow({ where: { id: editedPublicComment.id } })).body).toBe(
      "User edited public comment"
    );
    expect(await db.internalNote.count({ where: { ticketId: editedTicket.id, body: "User-owned note" } })).toBe(1);
  });
});

describe("MIG-01 — fresh schema constraints", () => {
  it("rejects invalid cycle/version, terminal, follow-up, revision, event and idempotency records", async () => {
    const db = prisma!;
    const ticket = await db.ticket.findUniqueOrThrow({ where: { ticketNumber: "TKT-2026-000102" } });
    const completed = await db.actionTaken.findFirstOrThrow({
      where: { ticket: { ticketNumber: "TKT-2026-000105" }, status: "COMPLETED" },
    });
    const cancelled = await db.actionTaken.findFirstOrThrow({
      where: { ticket: { ticketNumber: "TKT-2026-000103" }, status: "CANCELLED" },
    });
    const planned = await db.actionTaken.findFirstOrThrow({
      where: { ticket: { ticketNumber: "TKT-2026-000102" }, status: "PLANNED" },
    });
    const revision = await db.actionRevision.findFirstOrThrow({ where: { actionId: completed.id } });
    const actor = await db.user.findUniqueOrThrow({ where: { email: "niran.support@kmutt.ac.th" } });

    await expect(db.$executeRaw`UPDATE "Ticket" SET "workCycle" = 0 WHERE "id" = ${ticket.id}`).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE "Ticket" SET "version" = 0 WHERE "id" = ${ticket.id}`).rejects.toThrow();
    await expect(
      db.$executeRaw`UPDATE "ActionTaken" SET "followUpRequired" = true, "followUpNote" = NULL WHERE "id" = ${planned.id}`
    ).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE "ActionTaken" SET "result" = NULL WHERE "id" = ${completed.id}`).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE "ActionTaken" SET "cancelledAt" = NULL WHERE "id" = ${cancelled.id}`).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE "ActionTaken" SET "cancelledById" = NULL WHERE "id" = ${cancelled.id}`).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE "ActionTaken" SET "cancelReason" = '   ' WHERE "id" = ${cancelled.id}`).rejects.toThrow();
    await expect(
      db.actionRevision.create({
        data: {
          actionId: completed.id,
          sequence: revision.sequence,
          operation: "EDIT",
          actorId: revision.actorId,
          after: {},
        },
      })
    ).rejects.toThrow();
    await expect(
      db.ticketWorkflowEvent.create({
        data: {
          ticketId: ticket.id,
          workCycle: 1,
          kind: "TRANSITION",
          fromStatus: "OPEN",
          toStatus: "IN_PROGRESS",
          actorId: null,
          ticketVersion: 1,
        },
      })
    ).rejects.toThrow();
    await expect(
      db.ticketWorkflowEvent.create({
        data: {
          ticketId: ticket.id,
          workCycle: 1,
          kind: "TRANSITION",
          fromStatus: "IN_PROGRESS",
          toStatus: "WAITING_FOR_REQUESTER",
          actorId: actor.id,
          ticketVersion: 2,
        },
      })
    ).rejects.toThrow();
    await expect(db.actionTaken.delete({ where: { id: completed.id } })).rejects.toThrow();

    const idempotency = {
      userId: actor.id,
      method: "POST",
      canonicalPath: "/api/tickets",
      key: randomUUID(),
      payloadDigest: "a".repeat(64),
      httpStatus: 201,
      response: {},
    };
    await db.idempotencyRecord.create({ data: idempotency });
    await expect(db.idempotencyRecord.create({ data: idempotency })).rejects.toThrow();
    await expect(
      db.idempotencyRecord.create({ data: { ...idempotency, key: "00000000-0000-0000-0000-000000000000" } })
    ).rejects.toThrow();
    await expect(
      db.idempotencyRecord.create({ data: { ...idempotency, key: randomUUID(), httpStatus: 500 } })
    ).rejects.toThrow();
  });
});
