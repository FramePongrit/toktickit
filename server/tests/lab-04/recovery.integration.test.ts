import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import request from "supertest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEGACY_INITIAL_PASSWORD, seedDatabase } from "../../prisma/seed.js";

const SERVER_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PRISMA_DIRECTORY = path.join(SERVER_ROOT, "prisma");
const TEST_DATABASE = "lab4test";
const PG_CONTAINER = process.env.LAB4_PG_CONTAINER;

let baseUrl: string | undefined;
let dbUser: string | undefined;
let dbPassword: string | undefined;
let sourceDatabase: string | undefined;
let restoredDatabase: string | undefined;
let sourcePrisma: PrismaClient | undefined;
let restoredPrisma: PrismaClient | undefined;
let applicationPrisma: PrismaClient | undefined;
let artifactDirectory: string | undefined;
let storedFilename: string | undefined;

function originalUploadPath(filename: string): string {
  return path.join(SERVER_ROOT, "uploads", filename);
}

function validateTestEnvironment(value: string): URL {
  const url = new URL(value);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) || databaseName !== TEST_DATABASE) {
    throw new Error("RECOVERY_HARNESS_UNAVAILABLE: use the dedicated loopback lab4test database.");
  }
  if (!PG_CONTAINER || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(PG_CONTAINER)) {
    throw new Error("RECOVERY_HARNESS_UNAVAILABLE: set LAB4_PG_CONTAINER to the dedicated test PostgreSQL container.");
  }
  return url;
}

function databaseUrlFor(name: string): string {
  const url = new URL(baseUrl!);
  url.pathname = `/${name}`;
  url.searchParams.set("schema", "public");
  return url.toString();
}

function containerTool(tool: string, args: string[], input?: Buffer): Buffer {
  try {
    return execFileSync(
      "docker",
      [
        "exec",
        ...(input ? ["-i"] : []),
        "-e",
        `PGPASSWORD=${dbPassword ?? ""}`,
        PG_CONTAINER!,
        tool,
        "--username",
        dbUser!,
        ...args,
      ],
      { input, maxBuffer: 128 * 1024 * 1024, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"] }
    );
  } catch (error) {
    const commandError = error as Error & { stdout?: Buffer | string; stderr?: Buffer | string };
    const diagnostic = [commandError.stdout, commandError.stderr]
      .map((part) => String(part ?? "").replaceAll(dbPassword ?? "\0", "[redacted]"))
      .filter(Boolean)
      .join("\n")
      .slice(0, 4_000);
    throw new Error(`RECOVERY_HARNESS_TOOL_FAILED: ${tool}.\n${diagnostic}`);
  }
}

function migrateDeploy(databaseUrl: string): void {
  try {
    execFileSync(
      process.execPath,
      [path.join(SERVER_ROOT, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy", "--schema", path.join(PRISMA_DIRECTORY, "schema.prisma")],
      { cwd: SERVER_ROOT, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" }
    );
  } catch (error) {
    const commandError = error as Error & { stdout?: Buffer | string; stderr?: Buffer | string };
    throw new Error(
      `RECOVERY_HARNESS_MIGRATE_FAILED: ${[commandError.stdout, commandError.stderr]
        .map((part) => String(part ?? "").replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgresql://[redacted]@"))
        .filter(Boolean)
        .join("\n")
        .slice(0, 4_000)}`
    );
  }
}

async function inventory(prisma: PrismaClient) {
  const counts = await Promise.all([
    prisma.user.count(),
    prisma.category.count(),
    prisma.relatedSystem.count(),
    prisma.ticket.count(),
    prisma.ticketCounter.count(),
    prisma.authSession.count(),
    prisma.publicComment.count(),
    prisma.internalNote.count(),
    prisma.attachment.count(),
    prisma.actionTaken.count(),
    prisma.actionRevision.count(),
    prisma.ticketWorkflowEvent.count(),
    prisma.idempotencyRecord.count(),
  ]);
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: "jennifer.anderson@kmutt.ac.th" },
    select: { id: true, email: true, active: true, role: true, passwordHash: true, mustChangePassword: true },
  });
  const session = await prisma.authSession.findFirstOrThrow({
    where: { userId: user.id, id: { startsWith: "lab4-recovery-" } },
  });
  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { ticketNumber: "TKT-2026-000101" },
    select: { id: true, requesterId: true, summary: true, currentStatus: true, workCycle: true, version: true, resolvedAt: true },
  });
  const attachment = await prisma.attachment.findUniqueOrThrow({
    where: { storedFilename: storedFilename! },
  });
  return {
    counts,
    user: { ...user, passwordHash: createHash("sha256").update(user.passwordHash ?? "").digest("hex") },
    session: {
      id: session.id,
      userId: session.userId,
      csrfTokenHash: createHash("sha256").update(session.csrfTokenHash).digest("hex"),
      csrfTokenCiphertext: session.csrfTokenCiphertext,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
    },
    ticket,
    attachment,
  };
}

async function cleanupDatabase(name: string | undefined): Promise<void> {
  if (!name || !PG_CONTAINER || !dbUser) return;
  containerTool("dropdb", ["--if-exists", name]);
}

beforeAll(async () => {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("RECOVERY_HARNESS_UNAVAILABLE: DATABASE_URL is required.");
  const url = validateTestEnvironment(value);
  baseUrl = value;
  dbUser = decodeURIComponent(url.username);
  dbPassword = decodeURIComponent(url.password);
  sourceDatabase = `lab4_recovery_source_${randomUUID().replaceAll("-", "")}`;
  restoredDatabase = `lab4_recovery_restored_${randomUUID().replaceAll("-", "")}`;
  artifactDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "toktickit-lab4-recovery-"));
  await fs.mkdir(path.join(artifactDirectory, "attachments"), { recursive: true });
  storedFilename = `lab4-recovery-${randomUUID()}.txt`;

  try {
    containerTool("createdb", ["--template", "template0", sourceDatabase]);
    containerTool("createdb", ["--template", "template0", restoredDatabase]);
    const sourceUrl = databaseUrlFor(sourceDatabase);
    migrateDeploy(sourceUrl);
    sourcePrisma = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
    await sourcePrisma.$connect();
    await seedDatabase(sourcePrisma);

    const requester = await sourcePrisma.user.findUniqueOrThrow({ where: { email: "jennifer.anderson@kmutt.ac.th" } });
    const ticket = await sourcePrisma.ticket.findUniqueOrThrow({ where: { ticketNumber: "TKT-2026-000101" } });
    await sourcePrisma.authSession.create({
      data: {
        id: `lab4-recovery-${randomUUID()}`,
        userId: requester.id,
        csrfTokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
        csrfTokenCiphertext: "recovery-fixture-encrypted-token",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const bytes = Buffer.from("Lab 4 isolated recovery attachment fixture\n", "utf8");
    await fs.writeFile(originalUploadPath(storedFilename), bytes);
    await sourcePrisma.attachment.create({
      data: {
        ticketId: ticket.id,
        originalFilename: "recovery-fixture.txt",
        storedFilename,
        mimeType: "text/plain",
        sizeBytes: bytes.length,
        uploadedByRequesterId: requester.id,
      },
    });
    await fs.copyFile(originalUploadPath(storedFilename), path.join(artifactDirectory, "attachments", storedFilename));
  } catch (error) {
    await sourcePrisma?.$disconnect();
    await cleanupDatabase(sourceDatabase);
    await cleanupDatabase(restoredDatabase);
    if (storedFilename) await fs.rm(originalUploadPath(storedFilename), { force: true });
    if (artifactDirectory) await fs.rm(artifactDirectory, { recursive: true, force: true });
    throw error;
  }
}, 180_000);

afterAll(async () => {
  await sourcePrisma?.$disconnect();
  await restoredPrisma?.$disconnect();
  await cleanupDatabase(sourceDatabase);
  await cleanupDatabase(restoredDatabase);
  if (storedFilename) await fs.rm(originalUploadPath(storedFilename), { force: true });
  if (artifactDirectory) await fs.rm(artifactDirectory, { recursive: true, force: true });
});

describe("MIG-03 — isolated database and attachment recovery", () => {
  it("restores a custom-format database backup and matching file bytes without changing the source", async () => {
    const sourceBefore = await inventory(sourcePrisma!);
    const backupPath = path.join(artifactDirectory!, "toktickit-lab4.dump");
    const dump = containerTool("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--dbname", sourceDatabase!]);
    await fs.writeFile(backupPath, dump);
    const backupDigest = createHash("sha256").update(await fs.readFile(backupPath)).digest("hex");

    containerTool(
      "pg_restore",
      ["--clean", "--if-exists", "--no-owner", "--no-acl", "--exit-on-error", "--dbname", restoredDatabase!],
      await fs.readFile(backupPath)
    );
    const restoredUrl = databaseUrlFor(restoredDatabase!);
    restoredPrisma = new PrismaClient({ datasources: { db: { url: restoredUrl } } });
    await restoredPrisma.$connect();

    const recoveredUploadRoot = path.join(artifactDirectory!, "restored-uploads");
    const recoveredFile = path.join(recoveredUploadRoot, storedFilename!);
    await fs.mkdir(recoveredUploadRoot);
    await fs.copyFile(path.join(artifactDirectory!, "attachments", storedFilename!), recoveredFile);
    const recoveredBytes = await fs.readFile(recoveredFile);
    const sourceBytes = await fs.readFile(originalUploadPath(storedFilename!));
    expect(createHash("sha256").update(recoveredBytes).digest("hex")).toBe(
      createHash("sha256").update(sourceBytes).digest("hex")
    );

    expect(await inventory(restoredPrisma)).toEqual(sourceBefore);
    expect(await bcrypt.compare(LEGACY_INITIAL_PASSWORD, (await restoredPrisma.user.findUniqueOrThrow({
      where: { email: "jennifer.anderson@kmutt.ac.th" },
    })).passwordHash ?? "")).toBe(true);
    expect(await fs.readFile(backupPath)).toEqual(dump);
    expect(createHash("sha256").update(await fs.readFile(backupPath)).digest("hex")).toBe(backupDigest);

    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousUploadDir = process.env.UPLOAD_DIR;
    process.env.DATABASE_URL = restoredUrl;
    process.env.UPLOAD_DIR = recoveredUploadRoot;
    try {
      const [{ createApp }, { loadSecurityConfig }, { getPrisma }] = await Promise.all([
        import("../../src/app.js"),
        import("../../src/security/config.js"),
        import("../../src/prisma.js"),
      ]);
      applicationPrisma = getPrisma();
      const app = createApp(loadSecurityConfig({
        NODE_ENV: "test",
        JWT_SECRET: "lab4-recovery-test-secret-with-more-than-32-characters",
        CLIENT_ORIGIN: "http://localhost:5173",
      }));
      const login = await request(app)
        .post("/api/auth/login")
        .send({ email: "jennifer.anderson@kmutt.ac.th", password: LEGACY_INITIAL_PASSWORD });
      expect(login.status).toBe(200);
      expect(login.body.user.mustChangePassword).toBe(true);
      const oldCookie = login.headers["set-cookie"][0].split(";")[0];
      const changePasswordBody = {
        currentPassword: LEGACY_INITIAL_PASSWORD,
        newPassword: "RecoveredLab4Pass123!",
        confirmation: "RecoveredLab4Pass123!",
      };
      const missingCsrf = await request(app)
        .post("/api/auth/change-password")
        .set("Cookie", oldCookie)
        .send(changePasswordBody);
      expect(missingCsrf.status).toBe(403);
      expect(missingCsrf.body.error.code).toBe("CSRF_INVALID");

      const changed = await request(app)
        .post("/api/auth/change-password")
        .set("Cookie", oldCookie)
        .set("X-CSRF-Token", login.body.csrfToken)
        .send(changePasswordBody);
      expect(changed.status).toBe(200);
      expect(changed.body.user.mustChangePassword).toBe(false);
      const newCookie = changed.headers["set-cookie"][0].split(";")[0];
      expect((await request(app).get("/api/auth/me").set("Cookie", oldCookie)).status).toBe(401);
      expect((await request(app).get("/api/auth/me").set("Cookie", newCookie)).status).toBe(200);

      const recoveredAttachment = await restoredPrisma!.attachment.findUniqueOrThrow({
        where: { storedFilename: storedFilename! },
      });
      const metadata = await request(app)
        .get(`/api/attachments/${recoveredAttachment.id}`)
        .set("Cookie", newCookie);
      expect(metadata.status).toBe(200);
      expect(metadata.body).toMatchObject({
        id: recoveredAttachment.id,
        originalFilename: "recovery-fixture.txt",
        mimeType: "text/plain",
        sizeBytes: recoveredBytes.length,
        isRemoved: false,
      });
      const download = await request(app)
        .get(`/api/attachments/${recoveredAttachment.id}/download`)
        .set("Cookie", newCookie)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
          response.on("end", () => callback(null, Buffer.concat(chunks)));
        });
      expect(download.status).toBe(200);
      expect(Buffer.isBuffer(download.body)).toBe(true);
      expect(download.body.equals(recoveredBytes)).toBe(true);
    } finally {
      await applicationPrisma?.$disconnect();
      applicationPrisma = undefined;
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousUploadDir === undefined) delete process.env.UPLOAD_DIR;
      else process.env.UPLOAD_DIR = previousUploadDir;
    }

    expect(await inventory(sourcePrisma!)).toEqual(sourceBefore);

  });
});
