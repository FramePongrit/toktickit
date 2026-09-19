import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request, { type Response } from "supertest";
import { app } from "../testApp.js";
import { getPrisma } from "../../src/prisma.js";
import { comparePassword, hashPassword } from "../../src/security/password.js";
import { setAdminUsersLockTestHook } from "../../src/services/adminUsers.service.js";
import { loginAs, TEST_PASSWORD, withAuth, type AuthSessionFixture } from "../support/auth.js";

const prisma = getPrisma();
const suiteTag = randomUUID().slice(0, 8);
const ADMIN_PASSWORD = TEST_PASSWORD;
const INITIAL_PASSWORD = "InitialPass123";
const RESET_PASSWORD = "ReplacementPass456";

let categoryId: number;
let relatedSystemId: number;
let adminAId: number;
let adminBId: number;
let staffId: number;
let requesterId: number;
let adminAAuth: AuthSessionFixture;
let adminBAuth: AuthSessionFixture;
let staffAuth: AuthSessionFixture;
let requesterAuth: AuthSessionFixture;
const userIds: number[] = [];
const ticketIds: number[] = [];
const createdSessionUserIds: number[] = [];
const restoredAdmins: Array<{ id: number; role: "REQUESTER" | "STAFF" | "ADMIN"; active: boolean }> = [];

function safeError(response: Response, status: number, code = "VALIDATION_FAILED") {
  expect(response.status).toBe(status);
  expect(response.body.error.code).toBe(code);
  expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|csrfToken|SELECT|stack|D:\\|toktickit_session/i);
}

function noSensitiveFields(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(/passwordHash|csrfToken|sessionId|jwt/i);
}

function adminList(auth: AuthSessionFixture, query: Record<string, string> = {}) {
  return withAuth(request(app).get("/api/admin/users").query(query), auth, false);
}

function adminMutation(auth: AuthSessionFixture, method: "post" | "patch", path: string) {
  return withAuth(request(app)[method](path), auth);
}

async function createDbUser(input: {
  fullName: string;
  email: string;
  role?: "REQUESTER" | "STAFF" | "ADMIN";
  active?: boolean;
  mustChangePassword?: boolean;
}) {
  const user = await prisma.user.create({
    data: {
      fullName: input.fullName,
      email: input.email,
      role: input.role ?? "REQUESTER",
      active: input.active ?? true,
      mustChangePassword: input.mustChangePassword ?? false,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
    },
  });
  userIds.push(user.id);
  return user;
}

async function createOwnedTicket(ownerId: number, status: "OPEN" | "CLOSED" = "OPEN") {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `U59-${suiteTag}-${ticketIds.length + 1}`,
      requesterId,
      categoryId,
      relatedSystemId,
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      ownerId,
      summary: `Issue 59 ownership fixture ${ticketIds.length + 1}`,
      description: "Administrator User Management ownership fixture.",
      currentStatus: status,
    },
  });
  ticketIds.push(ticket.id);
  return ticket;
}

async function isolateActiveAdminPair(pairIds: number[]) {
  const otherAdmins = await prisma.user.findMany({
    where: { role: "ADMIN", active: true, id: { notIn: pairIds } },
    select: { id: true, role: true, active: true },
  });
  restoredAdmins.push(...otherAdmins.map((user) => ({ id: user.id, role: user.role, active: user.active })));
  if (otherAdmins.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: otherAdmins.map((user) => user.id) } },
      data: { role: "STAFF" },
    });
  }
}

async function waitForPostgresLockWait(backendPid: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rows = await prisma.$queryRaw<{ waitEventType: string | null }[]>`
      SELECT "wait_event_type" AS "waitEventType"
      FROM pg_stat_activity
      WHERE "pid" = ${backendPid}
    `;
    if (rows[0]?.waitEventType === "Lock") return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Backend ${backendPid} did not become observable as a PostgreSQL lock waiter.`);
}

beforeAll(async () => {
  categoryId = (await prisma.category.findFirstOrThrow({ where: { active: true }, orderBy: { id: "asc" } })).id;
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { active: true }, orderBy: { id: "asc" } })).id;

  const [adminA, adminB, staff, requester] = await Promise.all([
    createDbUser({ fullName: `Issue 59 Admin Alpha ${suiteTag}`, email: `issue59.admin.alpha.${suiteTag}@example.test`, role: "ADMIN" }),
    createDbUser({ fullName: `Issue 59 Admin Beta ${suiteTag}`, email: `issue59.admin.beta.${suiteTag}@example.test`, role: "ADMIN" }),
    createDbUser({ fullName: `Issue 59 Staff ${suiteTag}`, email: `issue59.staff.${suiteTag}@example.test`, role: "STAFF" }),
    createDbUser({ fullName: `Issue 59 Requester ${suiteTag}`, email: `issue59.requester.${suiteTag}@example.test` }),
  ]);
  adminAId = adminA.id;
  adminBId = adminB.id;
  staffId = staff.id;
  requesterId = requester.id;
  adminAAuth = await loginAs(adminA.email);
  adminBAuth = await loginAs(adminB.email);
  staffAuth = await loginAs(staff.email);
  requesterAuth = await loginAs(requester.email);
});

afterAll(async () => {
  if (restoredAdmins.length > 0) {
    await Promise.all(restoredAdmins.map((user) => prisma.user.update({
      where: { id: user.id },
      data: { role: user.role, active: user.active },
    })));
  }
  if (ticketIds.length > 0) await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  const sessionUserIds = [...new Set([...userIds, ...createdSessionUserIds])];
  if (sessionUserIds.length > 0) await prisma.authSession.deleteMany({ where: { userId: { in: sessionUserIds } } });
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("Issue #59 — Administrator User Management API", () => {
  it("API-U01: restricts access and returns all Users in deterministic safe order", async () => {
    safeError(await request(app).get("/api/admin/users"), 401, "UNAUTHENTICATED");
    safeError(await adminList(staffAuth), 403, "FORBIDDEN");
    safeError(await adminList(requesterAuth), 403, "FORBIDDEN");

    const response = await adminList(adminAAuth, { q: "  issue 59 admin  " });
    expect(response.status).toBe(200);
    expect(response.body.data.map((user: { id: number }) => user.id)).toEqual([adminAId, adminBId]);
    expect(response.body.data.map((user: { fullName: string }) => user.fullName)).toEqual([
      `Issue 59 Admin Alpha ${suiteTag}`,
      `Issue 59 Admin Beta ${suiteTag}`,
    ]);
    for (const user of response.body.data) {
      expect(Object.keys(user).sort()).toEqual(["active", "email", "fullName", "id", "mustChangePassword", "role"]);
      noSensitiveFields(user);
    }
  });

  it("API-U01: searches normalized name/email, applies the single Role filter, and rejects unknown query input", async () => {
    const alpha = await createDbUser({ fullName: `Issue 59 Search Alpha ${suiteTag}`, email: `issue59.search.alpha.${suiteTag}@example.test`, role: "STAFF" });
    const inactive = await createDbUser({ fullName: `Issue 59 Search Inactive ${suiteTag}`, email: `issue59.search.inactive.${suiteTag}@example.test`, role: "STAFF", active: false });
    const byEmail = await adminList(adminAAuth, { q: `  SEARCH.ALPHA.${suiteTag}@EXAMPLE.TEST ` });
    expect(byEmail.status).toBe(200);
    expect(byEmail.body.data.map((user: { id: number }) => user.id)).toEqual([alpha.id]);

    const staff = await adminList(adminAAuth, { q: `issue 59 search`, role: "STAFF" });
    expect(staff.status).toBe(200);
    expect(staff.body.data.map((user: { id: number }) => user.id)).toEqual([alpha.id, inactive.id]);
    expect(staff.body.data.every((user: { role: string }) => user.role === "STAFF")).toBe(true);
    safeError(await adminList(adminAAuth, { unsupported: "value" }), 400);
    safeError(await adminList(adminAAuth, { q: "   " }), 400);
    safeError(await adminList(adminAAuth, { role: "OWNER" }), 400);
  });

  it("API-U02: creates every Role/active combination with a mandatory next-login change", async () => {
    const cases = [
      ["REQUESTER", true],
      ["STAFF", false],
      ["ADMIN", true],
    ] as const;
    for (const [role, active] of cases) {
      const email = `issue59.created.${role.toLowerCase()}.${suiteTag}@example.test`;
      const response = await adminMutation(adminAAuth, "post", "/api/admin/users")
        .send({ fullName: `Issue 59 Created ${role} ${suiteTag}`, email: `  ${email.toUpperCase()} `, role, active, initialPassword: INITIAL_PASSWORD, confirmation: ` ${INITIAL_PASSWORD} ` });
      expect(response.status).toBe(201);
      expect(response.body.user).toMatchObject({ email, role, active, mustChangePassword: true });
      noSensitiveFields(response.body);
      const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(stored.passwordHash).not.toBe(INITIAL_PASSWORD);
      expect(stored.passwordHash).toMatch(/^\$2[aby]?\$12\$/);
      expect(await comparePassword(INITIAL_PASSWORD, stored.passwordHash!)).toBe(true);
      userIds.push(stored.id);
    }
  });

  it("API-U02: rejects normalized duplicate email, invalid Role/password, and unsupported fields safely", async () => {
    const duplicateEmail = `issue59.duplicate.${suiteTag}@example.test`;
    const first = await adminMutation(adminAAuth, "post", "/api/admin/users")
      .send({ fullName: "Issue 59 Duplicate", email: duplicateEmail, role: "REQUESTER", active: true, initialPassword: INITIAL_PASSWORD, confirmation: INITIAL_PASSWORD });
    expect(first.status).toBe(201);
    userIds.push(first.body.user.id);
    const duplicate = await adminMutation(adminAAuth, "post", "/api/admin/users")
      .send({ fullName: "Issue 59 Duplicate Again", email: ` ${duplicateEmail.toUpperCase()} `, role: "REQUESTER", active: true, initialPassword: INITIAL_PASSWORD, confirmation: INITIAL_PASSWORD });
    safeError(duplicate, 409, "EMAIL_ALREADY_EXISTS");
    safeError(await adminMutation(adminAAuth, "post", "/api/admin/users").send({ fullName: "Bad", email: `bad.${suiteTag}@example.test`, role: "OWNER", active: true, initialPassword: INITIAL_PASSWORD, confirmation: INITIAL_PASSWORD }), 400);
    safeError(await adminMutation(adminAAuth, "post", "/api/admin/users").send({ fullName: "Bad", email: `bad2.${suiteTag}@example.test`, role: "REQUESTER", active: true, initialPassword: "short", confirmation: "short" }), 400);
    safeError(await adminMutation(adminAAuth, "post", "/api/admin/users").send({ fullName: "Bad", email: `bad3.${suiteTag}@example.test`, role: "REQUESTER", active: true, initialPassword: INITIAL_PASSWORD, confirmation: INITIAL_PASSWORD, passwordHash: "leak" }), 400);
  });

  it("API-U03: permits own name/email edits but blocks own Role and active-state changes", async () => {
    const renamed = await adminMutation(adminAAuth, "patch", `/api/admin/users/${adminAId}`)
      .send({ fullName: `Issue 59 Admin Renamed ${suiteTag}`, email: `issue59.admin.renamed.${suiteTag}@example.test` });
    expect(renamed.status).toBe(200);
    expect(renamed.body.user).toMatchObject({ id: adminAId, fullName: `Issue 59 Admin Renamed ${suiteTag}`, email: `issue59.admin.renamed.${suiteTag}@example.test`, role: "ADMIN", active: true });
    safeError(await adminMutation(adminAAuth, "patch", `/api/admin/users/${adminAId}`).send({ role: "STAFF" }), 409, "ADMIN_SELF_PROTECTION");
    safeError(await adminMutation(adminAAuth, "patch", `/api/admin/users/${adminAId}`).send({ active: false }), 409, "ADMIN_SELF_PROTECTION");
  });

  it("API-U03: rejects mixed-case whitespace email collisions and empty/invalid edit payloads", async () => {
    const first = await createDbUser({ fullName: `Issue 59 Email First ${suiteTag}`, email: `issue59.email.first.${suiteTag}@example.test` });
    const second = await createDbUser({ fullName: `Issue 59 Email Second ${suiteTag}`, email: `issue59.email.second.${suiteTag}@example.test` });
    const collision = await adminMutation(adminAAuth, "patch", `/api/admin/users/${first.id}`)
      .send({ email: `  ${second.email.toUpperCase()}  ` });
    safeError(collision, 409, "EMAIL_ALREADY_EXISTS");

    safeError(await adminMutation(adminAAuth, "patch", `/api/admin/users/${staffId}`).send({}), 400);
    safeError(await adminMutation(adminAAuth, "patch", `/api/admin/users/${staffId}`).send({ role: "OWNER" }), 400);
    safeError(await adminMutation(adminAAuth, "patch", `/api/admin/users/${staffId}`).send({ active: "yes" }), 400);
    safeError(await adminMutation(adminAAuth, "patch", `/api/admin/users/${staffId}`).send({ passwordHash: "leak" }), 400);
  });

  it("API-U03: preserves eligible ownership for Admin-to-Staff and reports safe non-final ownership conflicts", async () => {
    const eligibleAdmin = await createDbUser({ fullName: `Issue 59 Eligible Admin ${suiteTag}`, email: `issue59.eligible.${suiteTag}@example.test`, role: "ADMIN" });
    await createOwnedTicket(eligibleAdmin.id, "OPEN");
    const demoted = await adminMutation(adminAAuth, "patch", `/api/admin/users/${eligibleAdmin.id}`).send({ role: "STAFF" });
    expect(demoted.status).toBe(200);
    expect(demoted.body.user.role).toBe("STAFF");
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketIds[ticketIds.length - 1] } })).ownerId).toBe(eligibleAdmin.id);

    const ownedStaff = await createDbUser({ fullName: `Issue 59 Owned Staff ${suiteTag}`, email: `issue59.owned.staff.${suiteTag}@example.test`, role: "STAFF" });
    await createOwnedTicket(ownedStaff.id, "OPEN");
    const inactive = await adminMutation(adminAAuth, "patch", `/api/admin/users/${ownedStaff.id}`).send({ active: false });
    safeError(inactive, 409, "USER_OWNS_NON_FINAL_TICKETS");
    expect(inactive.body.error.meta.nonFinalOwnedTicketCount).toBe(1);
    const requesterRole = await adminMutation(adminAAuth, "patch", `/api/admin/users/${ownedStaff.id}`).send({ role: "REQUESTER" });
    safeError(requesterRole, 409, "USER_OWNS_NON_FINAL_TICKETS");
    expect(requesterRole.body.error.meta.nonFinalOwnedTicketCount).toBe(1);
    noSensitiveFields(inactive.body);
  });

  it("API-U03: allows activation, permits historical Final ownership, and revokes sessions on deactivation/Role change", async () => {
    const inactive = await createDbUser({ fullName: `Issue 59 Inactive Staff ${suiteTag}`, email: `issue59.inactive.staff.${suiteTag}@example.test`, role: "STAFF", active: false });
    const activated = await adminMutation(adminAAuth, "patch", `/api/admin/users/${inactive.id}`).send({ active: true });
    expect(activated.status).toBe(200);
    expect(activated.body.user.active).toBe(true);

    const historical = await createDbUser({ fullName: `Issue 59 Historical Staff ${suiteTag}`, email: `issue59.historical.staff.${suiteTag}@example.test`, role: "STAFF" });
    await createOwnedTicket(historical.id, "CLOSED");
    const deactivatedHistorical = await adminMutation(adminAAuth, "patch", `/api/admin/users/${historical.id}`).send({ active: false });
    expect(deactivatedHistorical.status).toBe(200);
    expect(deactivatedHistorical.body.user.active).toBe(false);

    const sessionTarget = await createDbUser({ fullName: `Issue 59 Session Target ${suiteTag}`, email: `issue59.session.target.${suiteTag}@example.test`, role: "STAFF" });
    const targetAuth = await loginAs(sessionTarget.email);
    createdSessionUserIds.push(sessionTarget.id);
    const roleChanged = await adminMutation(adminAAuth, "patch", `/api/admin/users/${sessionTarget.id}`).send({ role: "REQUESTER" });
    expect(roleChanged.status).toBe(200);
    expect((await withAuth(request(app).get("/api/auth/me"), targetAuth, false)).status).toBe(401);

    const deactivateTarget = await createDbUser({ fullName: `Issue 59 Deactivate Target ${suiteTag}`, email: `issue59.deactivate.target.${suiteTag}@example.test`, role: "STAFF" });
    const deactivateAuth = await loginAs(deactivateTarget.email);
    createdSessionUserIds.push(deactivateTarget.id);
    const deactivated = await adminMutation(adminAAuth, "patch", `/api/admin/users/${deactivateTarget.id}`).send({ active: false });
    expect(deactivated.status).toBe(200);
    expect((await withAuth(request(app).get("/api/auth/me"), deactivateAuth, false)).status).toBe(401);
  });

  it("API-U03: serializes two active-Administrator demotions so one loses with LAST_ACTIVE_ADMINISTRATOR", async () => {
    const first = await createDbUser({ fullName: `Issue 59 Concurrent Demotion A ${suiteTag}`, email: `issue59.concurrent.demotion.a.${suiteTag}@example.test`, role: "ADMIN" });
    const second = await createDbUser({ fullName: `Issue 59 Concurrent Demotion B ${suiteTag}`, email: `issue59.concurrent.demotion.b.${suiteTag}@example.test`, role: "ADMIN" });
    const firstAuth = await loginAs(first.email);
    const secondAuth = await loginAs(second.email);
    await isolateActiveAdminPair([first.id, second.id]);

    const [aToB, bToA] = await Promise.all([
      adminMutation(firstAuth, "patch", `/api/admin/users/${second.id}`).send({ role: "STAFF" }),
      adminMutation(secondAuth, "patch", `/api/admin/users/${first.id}`).send({ role: "STAFF" }),
    ]);
    const responses = [aToB, bToA];
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    const loser = responses.find((response) => response.status !== 200);
    expect(loser?.status).toBe(409);
    expect(loser?.body.error.code).toBe("LAST_ACTIVE_ADMINISTRATOR");
    const activeAdmins = await prisma.user.count({ where: { role: "ADMIN", active: true } });
    expect(activeAdmins).toBeGreaterThanOrEqual(1);
  });

  it("API-U03: deterministically serializes concurrent two-Administrator deactivation with a roster-lock barrier", async () => {
    const first = await createDbUser({ fullName: `Issue 59 Concurrent Deactivation A ${suiteTag}`, email: `issue59.concurrent.deactivation.a.${suiteTag}@example.test`, role: "ADMIN" });
    const second = await createDbUser({ fullName: `Issue 59 Concurrent Deactivation B ${suiteTag}`, email: `issue59.concurrent.deactivation.b.${suiteTag}@example.test`, role: "ADMIN" });
    const firstAuth = await loginAs(first.email);
    const secondAuth = await loginAs(second.email);
    await isolateActiveAdminPair([first.id, second.id]);

    let releaseFirst!: () => void;
    let resolveRosterLock!: () => void;
    const rosterLockReached = new Promise<void>((resolve) => { resolveRosterLock = resolve; });
    let resolveSecondRosterAttempt!: () => void;
    const secondRosterAttempt = new Promise<void>((resolve) => { resolveSecondRosterAttempt = resolve; });
    let secondBackendPid: number | undefined;
    let firstPauseConsumed = false;
    setAdminUsersLockTestHook(async (context) => {
      if (context.operation === "BEFORE_ADMIN_ROSTER_LOCK" && context.targetUserId === first.id) {
        secondBackendPid = context.backendPid;
        resolveSecondRosterAttempt();
        return;
      }
      if (context.operation === "AFTER_ADMIN_ROSTER_LOCK" && !firstPauseConsumed) {
        firstPauseConsumed = true;
        resolveRosterLock();
        await new Promise<void>((resolve) => { releaseFirst = resolve; });
      }
    });

    try {
      const firstRequest = adminMutation(firstAuth, "patch", `/api/admin/users/${second.id}`).send({ active: false });
      const firstResponsePromise = firstRequest.then((response) => response);
      await rosterLockReached;

      let secondSettled = false;
      const secondRequest = adminMutation(secondAuth, "patch", `/api/admin/users/${first.id}`)
        .send({ active: false })
        .then((response) => {
          secondSettled = true;
          return response;
        });
      await secondRosterAttempt;
      expect(secondBackendPid).toEqual(expect.any(Number));
      await waitForPostgresLockWait(secondBackendPid!);
      expect(secondSettled).toBe(false);

      releaseFirst();
      const [firstResponse, secondResponse] = await Promise.all([firstResponsePromise, secondRequest]);
      const responses = [firstResponse, secondResponse];
      expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
      const loser = responses.find((response) => response.status !== 200);
      expect(loser?.status).toBe(409);
      expect(loser?.body.error.code).toBe("LAST_ACTIVE_ADMINISTRATOR");
      expect(await prisma.user.count({ where: { role: "ADMIN", active: true, id: { in: [first.id, second.id] } } })).toBe(1);
    } finally {
      setAdminUsersLockTestHook(undefined);
      if (releaseFirst) releaseFirst();
    }
  }, 15000);

  it("API-U04: resets another User's password, forces next-login change, and revokes all sessions", async () => {
    const resetOperator = await createDbUser({ fullName: `Issue 59 Reset Operator ${suiteTag}`, email: `issue59.reset.operator.${suiteTag}@example.test`, role: "ADMIN" });
    const resetAuth = await loginAs(resetOperator.email);
    const target = await createDbUser({ fullName: `Issue 59 Reset Target ${suiteTag}`, email: `issue59.reset.target.${suiteTag}@example.test`, role: "STAFF" });
    const oldAuth = await loginAs(target.email);
    createdSessionUserIds.push(target.id);
    const reset = await adminMutation(resetAuth, "post", `/api/admin/users/${target.id}/reset-password`)
      .send({ initialPassword: RESET_PASSWORD, confirmation: RESET_PASSWORD });
    expect(reset.status).toBe(200);
    expect(reset.body.user).toMatchObject({ id: target.id, mustChangePassword: true });
    noSensitiveFields(reset.body);
    expect((await withAuth(request(app).get("/api/auth/me"), oldAuth, false)).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: target.email, password: TEST_PASSWORD })).status).toBe(401);
    const newLogin = await request(app).post("/api/auth/login").send({ email: target.email, password: RESET_PASSWORD });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.user.mustChangePassword).toBe(true);

    safeError(await adminMutation(resetAuth, "post", `/api/admin/users/${resetOperator.id}/reset-password`).send({ initialPassword: RESET_PASSWORD, confirmation: RESET_PASSWORD }), 409, "ADMIN_SELF_PROTECTION");
    safeError(await adminMutation(resetAuth, "post", "/api/admin/users/999999999/reset-password").send({ initialPassword: RESET_PASSWORD, confirmation: RESET_PASSWORD }), 404, "USER_NOT_FOUND");
  });
});
