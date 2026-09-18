import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { app } from "../testApp.js";
import { loadSecurityConfig } from "../../src/security/config.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword, validatePassword } from "../../src/security/password.js";
import { LEGACY_INITIAL_PASSWORD } from "../../prisma/seed.js";

const prisma = getPrisma();
const suiteTag = randomUUID();
const ACTIVE_PASSWORD = "ValidPass123";
const CHANGED_PASSWORD = "ChangedPass456";
const SECOND_CHANGED_PASSWORD = "ChangedAgain789";

let activeUserId: number;
let inactiveUserId: number;
let legacyUserId: number;
let activeEmail: string;
let inactiveEmail: string;
const legacyEmail = "jennifer.anderson@kmutt.ac.th";
let legacyOriginalState: { passwordHash: string | null; mustChangePassword: boolean };

type Cookie = string;

function cookieFrom(response: request.Response): Cookie {
  const cookies = response.headers["set-cookie"];
  expect(cookies).toBeDefined();
  return cookies[0].split(";")[0];
}

function noSensitiveFields(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain("passwordHash");
  expect(serialized).not.toContain("csrfTokenHash");
  expect(serialized).not.toContain("jwtSecret");
}

async function login(email: string, password: string) {
  const response = await request(app).post("/api/auth/login").send({ email, password });
  return { response, cookie: response.status === 200 ? cookieFrom(response) : null };
}

async function me(cookie: Cookie) {
  return request(app).get("/api/auth/me").set("Cookie", cookie);
}

beforeAll(async () => {
  activeEmail = `auth-active-${suiteTag}@example.test`;
  inactiveEmail = `auth-inactive-${suiteTag}@example.test`;
  const [active, inactive] = await Promise.all([
    prisma.user.create({
      data: {
        fullName: "Auth Active User",
        email: activeEmail,
        passwordHash: await hashPassword(ACTIVE_PASSWORD),
        mustChangePassword: false,
      },
    }),
    prisma.user.create({
      data: {
        fullName: "Auth Inactive User",
        email: inactiveEmail,
        active: false,
        passwordHash: await hashPassword(ACTIVE_PASSWORD),
        mustChangePassword: false,
      },
    }),
  ]);
  activeUserId = active.id;
  inactiveUserId = inactive.id;

  const legacy = await prisma.user.findUniqueOrThrow({ where: { email: legacyEmail } });
  legacyUserId = legacy.id;
  legacyOriginalState = {
    passwordHash: legacy.passwordHash,
    mustChangePassword: legacy.mustChangePassword,
  };
  await prisma.user.update({
    where: { id: legacyUserId },
    data: {
      passwordHash: await hashPassword(LEGACY_INITIAL_PASSWORD),
      mustChangePassword: true,
      active: true,
      role: "REQUESTER",
    },
  });
});

afterAll(async () => {
  await prisma.authSession.deleteMany({
    where: { userId: { in: [activeUserId, inactiveUserId, legacyUserId] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: [activeUserId, inactiveUserId] } } });
  await prisma.user.update({ where: { id: legacyUserId }, data: legacyOriginalState });
  await prisma.$disconnect();
});

describe("UNIT-A01 — auth password contract", () => {
  it("accepts only trimmed 10-72 character passwords with a letter and digit", () => {
    expect(validatePassword("short1").valid).toBe(false);
    expect(validatePassword("1234567890").valid).toBe(false);
    expect(validatePassword("abcdefghij").valid).toBe(false);
    expect(validatePassword("a1".repeat(5)).valid).toBe(true);
    expect(validatePassword("a1".repeat(36) + "x").valid).toBe(false);
  });
});

describe("API-A01 — Login and current User", () => {
  it("normalizes email and returns only SafeUser plus the session CSRF token", async () => {
    const { response, cookie } = await login(`  ${activeEmail.toUpperCase()}  `, ACTIVE_PASSWORD);

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(cookie).toContain("toktickit_session=");
    const setCookie = response.headers["set-cookie"][0];
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Max-Age=28800");
    expect(response.body.user).toEqual({
      id: activeUserId,
      fullName: "Auth Active User",
      email: activeEmail,
      role: "REQUESTER",
      active: true,
      mustChangePassword: false,
    });
    expect(response.body.csrfToken).toEqual(expect.any(String));
    noSensitiveFields(response.body);
  });

  it("uses the same safe generic response for unknown and wrong credentials", async () => {
    const unknown = await login(`unknown-${suiteTag}@example.test`, ACTIVE_PASSWORD);
    const wrong = await login(activeEmail, "WrongPass123");

    expect(unknown.response.status).toBe(401);
    expect(wrong.response.status).toBe(401);
    expect(unknown.response.body).toEqual(wrong.response.body);
    expect(unknown.response.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(unknown.response.headers["set-cookie"]).toBeUndefined();
    expect(wrong.response.headers["set-cookie"]).toBeUndefined();
    noSensitiveFields(unknown.response.body);
  });

  it("returns current database identity and the same CSRF token on reload", async () => {
    const { response: loginResponse, cookie } = await login(activeEmail, ACTIVE_PASSWORD);
    const response = await me(cookie!);

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.user).toEqual(loginResponse.body.user);
    expect(response.body.csrfToken).toBe(loginResponse.body.csrfToken);
    noSensitiveFields(response.body);
  });
});

describe("API-A02 — inactive and throttled Login", () => {
  it("reveals inactivity only after a valid password and never sets a cookie", async () => {
    const response = await login(inactiveEmail, ACTIVE_PASSWORD);

    expect(response.response.status).toBe(403);
    expect(response.response.body.error.code).toBe("USER_INACTIVE");
    expect(response.response.headers["set-cookie"]).toBeUndefined();
    noSensitiveFields(response.response.body);
  });

  it("throttles the fifth failed credential attempt per normalized email", async () => {
    const email = `throttled-${suiteTag}@example.test`;
    const responses = [];
    for (let index = 0; index < 5; index += 1) {
      responses.push(await login(` ${email.toUpperCase()} `, "WrongPass123"));
    }

    expect(responses.slice(0, 4).every(({ response }) => response.status === 401)).toBe(true);
    expect(responses[4].response.status).toBe(429);
    expect(responses[4].response.body.error.code).toBe("LOGIN_THROTTLED");
    expect(responses[4].response.headers["set-cookie"]).toBeUndefined();
  });
});

describe("API-A03 — migrated legacy Requester password lifecycle", () => {
  it("rejects a no-cookie requester-header bypass outside the explicit Lab2 test app", async () => {
    const productionApp = createApp(
      loadSecurityConfig({
        NODE_ENV: "production",
        JWT_SECRET: "production-test-secret-that-is-at-least-32-chars",
        CLIENT_ORIGIN: "https://client.example",
        COOKIE_SECURE: "true",
      })
    );
    const response = await request(productionApp)
      .get("/api/tickets")
      .set("X-Requester-Id", String(activeUserId));

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("gates normal APIs, changes the Initial Password, revokes old sessions, and supports reload/logout", async () => {
    const first = await login(legacyEmail, LEGACY_INITIAL_PASSWORD);
    expect(first.response.status).toBe(200);

    const blocked = await request(app)
      .get("/api/tickets")
      .set("Cookie", first.cookie!)
      .set("X-Requester-Id", String(legacyUserId));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    const spoofed = await request(app)
      .get("/api/tickets")
      .set("Cookie", first.cookie!)
      .set("X-Requester-Id", String(activeUserId));
    expect(spoofed.status).toBe(403);
    expect(spoofed.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    const noSession = await request(app)
      .get("/api/tickets")
      .set("X-Requester-Id", String(legacyUserId));
    expect(noSession.status).toBe(403);
    expect(noSession.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    const missingCsrf = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", first.cookie!)
      .send({
        currentPassword: LEGACY_INITIAL_PASSWORD,
        newPassword: CHANGED_PASSWORD,
        confirmation: CHANGED_PASSWORD,
      });
    expect(missingCsrf.status).toBe(403);
    expect(missingCsrf.body.error.code).toBe("CSRF_INVALID");

    const changed = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", first.cookie!)
      .set("X-CSRF-Token", first.response.body.csrfToken)
      .send({
        currentPassword: LEGACY_INITIAL_PASSWORD,
        newPassword: CHANGED_PASSWORD,
        confirmation: CHANGED_PASSWORD,
      });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
    expect(changed.body.csrfToken).not.toBe(first.response.body.csrfToken);
    expect(changed.headers["cache-control"]).toBe("no-store");
    noSensitiveFields(changed.body);

    const oldSession = await me(first.cookie!);
    expect(oldSession.status).toBe(401);

    const oldPassword = await login(legacyEmail, LEGACY_INITIAL_PASSWORD);
    expect(oldPassword.response.status).toBe(401);
    expect(oldPassword.response.body.error.code).toBe("INVALID_CREDENTIALS");

    const currentSession = await me(cookieFrom(changed));
    expect(currentSession.status).toBe(200);
    expect(currentSession.body.csrfToken).toBe(changed.body.csrfToken);

    const currentSessionRow = await prisma.authSession.findFirstOrThrow({
      where: { userId: legacyUserId, revokedAt: null },
      orderBy: { issuedAt: "desc" },
    });
    const missingLogoutCsrf = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookieFrom(changed));
    expect(missingLogoutCsrf.status).toBe(403);
    expect(missingLogoutCsrf.body.error.code).toBe("CSRF_INVALID");
    expect(
      (await prisma.authSession.findUniqueOrThrow({ where: { id: currentSessionRow.id } })).revokedAt
    ).toBeNull();

    const logout = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookieFrom(changed))
      .set("X-CSRF-Token", changed.body.csrfToken);
    expect(logout.status).toBe(204);
    expect(logout.headers["set-cookie"][0]).toContain("Max-Age=0");
    expect((await me(cookieFrom(changed))).status).toBe(401);
  });

  it("rejects reuse, mismatched confirmation, and invalid password boundaries without replacing the session", async () => {
    const { response: loginResponse, cookie } = await login(legacyEmail, CHANGED_PASSWORD);
    expect(loginResponse.status).toBe(200);
    const csrfToken = loginResponse.body.csrfToken;

    const cases = [
      { newPassword: CHANGED_PASSWORD, confirmation: CHANGED_PASSWORD, field: "newPassword" },
      { newPassword: "short1", confirmation: "short1", field: "newPassword" },
      { newPassword: "NoDigitsHere", confirmation: "NoDigitsHere", field: "newPassword" },
      { newPassword: SECOND_CHANGED_PASSWORD, confirmation: "Mismatch789", field: "confirmation" },
    ];
    for (const input of cases) {
      const response = await request(app)
        .post("/api/auth/change-password")
        .set("Cookie", cookie!)
        .set("X-CSRF-Token", csrfToken)
        .send({ currentPassword: CHANGED_PASSWORD, ...input });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_FAILED");
      expect(response.body.error.details.map((detail: { field: string }) => detail.field)).toContain(input.field);
      noSensitiveFields(response.body);
    }

    const stillCurrent = await me(cookie!);
    expect(stillCurrent.status).toBe(200);
    expect(stillCurrent.body.csrfToken).toBe(csrfToken);
  });

  it("revokes every other session and creates a fresh current-device session", async () => {
    const first = await login(legacyEmail, CHANGED_PASSWORD);
    const second = await login(legacyEmail, CHANGED_PASSWORD);
    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);

    const changed = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", first.cookie!)
      .set("X-CSRF-Token", first.response.body.csrfToken)
      .send({
        currentPassword: CHANGED_PASSWORD,
        newPassword: SECOND_CHANGED_PASSWORD,
        confirmation: SECOND_CHANGED_PASSWORD,
      });
    expect(changed.status).toBe(200);
    expect((await me(second.cookie!)).status).toBe(401);
    expect((await me(cookieFrom(changed))).status).toBe(200);
  });

  it("rejects an expired session and invalid CSRF token before domain work", async () => {
    const loggedIn = await login(legacyEmail, SECOND_CHANGED_PASSWORD);
    const cookie = loggedIn.cookie!;
    const sessionId = (await prisma.authSession.findFirstOrThrow({
      where: { userId: legacyUserId, revokedAt: null },
      orderBy: { issuedAt: "desc" },
    })).id;

    const csrfFailure = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", "wrong-token");
    expect(csrfFailure.status).toBe(403);
    expect(csrfFailure.body.error.code).toBe("CSRF_INVALID");

    await prisma.authSession.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    const expired = await me(cookie);
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe("UNAUTHENTICATED");
  });
});
