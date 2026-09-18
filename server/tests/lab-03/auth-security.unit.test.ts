import express from "express";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { createAuthenticationMiddleware, createCsrfMiddleware } from "../../src/middleware/authentication.js";
import { createDevelopmentSecurityConfig, loadSecurityConfig } from "../../src/security/config.js";
import { serializeAuthCookie } from "../../src/security/cookie.js";
import { hashCsrfToken, verifyCsrfToken } from "../../src/security/csrf.js";
import { JwtService, JwtVerificationError } from "../../src/security/jwt.js";
import {
  BCRYPT_COST,
  comparePassword,
  hashPassword,
  isPasswordReuse,
  validatePassword,
} from "../../src/security/password.js";
import { AuthSessionService, SESSION_TTL_MS, type ActiveSession } from "../../src/security/session.js";
import { LoginThrottle, InMemoryThrottleStorage } from "../../src/security/throttle.js";
import { loadServerEnvironment } from "../../src/security/environment.js";

const VALID_PASSWORD = "ValidPass123";

function fakeClock(start = "2026-01-01T00:00:00.000Z") {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    advance: (milliseconds: number) => {
      current = new Date(current.getTime() + milliseconds);
    },
  };
}

describe("password security", () => {
  it("enforces the approved 10-72 character letter-and-digit contract", () => {
    expect(validatePassword("short1").valid).toBe(false);
    expect(validatePassword("1234567890").valid).toBe(false);
    expect(validatePassword("abcdefghij").valid).toBe(false);
    expect(validatePassword("a1".repeat(5)).valid).toBe(true);
    expect(validatePassword("a1".repeat(36) + "x").valid).toBe(false);
  });

  it("hashes with bcrypt cost 12 and compares without exposing the hash", async () => {
    const hash = await hashPassword(VALID_PASSWORD);

    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await comparePassword(VALID_PASSWORD, hash)).toBe(true);
    expect(await comparePassword("WrongPass123", hash)).toBe(false);
  });

  it("detects reuse of the current password but accepts a different valid password", async () => {
    const hash = await hashPassword(VALID_PASSWORD);

    expect(await isPasswordReuse(VALID_PASSWORD, hash)).toBe(true);
    expect(await isPasswordReuse("DifferentPass456", hash)).toBe(false);
  });

  it("exports the contract cost as twelve", () => {
    expect(BCRYPT_COST).toBe(12);
  });
});

describe("JWT identity/session claims", () => {
  it("signs only identity, session, issued-at, and expiry claims", () => {
    const clock = fakeClock();
    const jwt = new JwtService({ secret: "s".repeat(32), clock });
    const token = jwt.sign({ userId: 7, sessionId: "session-7" });
    const claims = jwt.verify(token);

    expect(Object.keys(claims).sort()).toEqual(["exp", "iat", "sid", "sub"]);
    expect(claims).toMatchObject({ sub: "7", sid: "session-7", iat: 1767225600, exp: 1767254400 });
  });

  it("rejects tampered and expired tokens", () => {
    const clock = fakeClock();
    const jwt = new JwtService({ secret: "s".repeat(32), clock });
    const token = jwt.sign({ userId: 7, sessionId: "session-7" });

    expect(() => jwt.verify(`${token.slice(0, -1)}x`)).toThrow(JwtVerificationError);
    clock.advance(8 * 60 * 60 * 1000);
    expect(() => jwt.verify(token)).toThrow(JwtVerificationError);
  });
});

describe("session-bound CSRF", () => {
  it("hashes and verifies opaque token values without accepting a mismatch", () => {
    const token = "opaque-session-token";
    const hash = hashCsrfToken(token);

    expect(verifyCsrfToken(token, hash)).toBe(true);
    expect(verifyCsrfToken("other-session-token", hash)).toBe(false);
  });
});

describe("AuthSession lifecycle", () => {
  it("creates, looks up, revokes one, and revokes all sessions", async () => {
    const clock = fakeClock();
    const rows = new Map<string, any>();
    let nextId = 1;
    const repository = {
      authSession: {
        create: async ({ data }: any) => {
          const row = { id: `session-${nextId++}`, ...data, revokedAt: null };
          rows.set(row.id, row);
          return row;
        },
        findUnique: async ({ where }: any) => {
          const row = rows.get(where.id);
          return row
            ? {
                ...row,
                user: {
                  id: row.userId,
                  fullName: "Niran Requester",
                  email: "NIRAN@example.test",
                  active: true,
                  role: "REQUESTER",
                  mustChangePassword: false,
                },
              }
            : null;
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const row of rows.values()) {
            if (
              (where.id === undefined || row.id === where.id) &&
              (where.userId === undefined || row.userId === where.userId) &&
              (where.revokedAt === undefined || row.revokedAt === where.revokedAt)
            ) {
              row.revokedAt = data.revokedAt;
              count += 1;
            }
          }
          return { count };
        },
      },
    };
    let randomValue = 7;
    const sessions = new AuthSessionService(repository as any, {
      clock,
      random: { bytes: (size: number) => Buffer.alloc(size, randomValue++) },
    });

    const first = await sessions.create(7);
    const second = await sessions.create(7);
    expect(first.expiresAt.getTime() - first.issuedAt.getTime()).toBe(8 * 60 * 60 * 1000);
    expect(first.csrfToken).not.toBe(second.csrfToken);
    expect(await sessions.findActive(first.id)).toMatchObject({ userId: 7, user: { role: "REQUESTER" } });
    expect(await sessions.verifyCsrf(first.id, first.csrfToken)).toBe(true);

    await sessions.revokeOne(first.id);
    expect(await sessions.findActive(first.id)).toBeNull();
    expect(await sessions.verifyCsrf(first.id, first.csrfToken)).toBe(false);

    const expiring = await sessions.create(7);
    clock.advance(SESSION_TTL_MS);
    expect(await sessions.verifyCsrf(expiring.id, expiring.csrfToken)).toBe(false);
    await sessions.revokeAll(7);
    expect(await sessions.findActive(second.id)).toBeNull();
  });
});

describe("cookie and startup configuration", () => {
  it("loads the documented .env path without overriding injected environment values", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "toktickit-env-"));
    const envPath = path.join(directory, ".env");
    await writeFile(
      envPath,
      [
        "JWT_SECRET=file-secret-that-is-only-used-by-this-test-123456",
        "CLIENT_ORIGIN=https://from-file.example",
        "PORT=3100",
      ].join("\n")
    );
    const injected: NodeJS.ProcessEnv = { PORT: "3200", NODE_ENV: "production" };

    try {
      loadServerEnvironment({ path: envPath, environment: injected });

      expect(injected.JWT_SECRET).toBe("file-secret-that-is-only-used-by-this-test-123456");
      expect(injected.CLIENT_ORIGIN).toBe("https://from-file.example");
      expect(injected.PORT).toBe("3200");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("serializes the required auth cookie attributes", () => {
    const config = createDevelopmentSecurityConfig();
    const cookie = serializeAuthCookie("jwt-value", config.cookie);

    expect(cookie).toContain("toktickit_session=jwt-value");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=28800");
    expect(cookie).not.toContain("Secure");
  });

  it("requires a strong JWT secret and an exact HTTP(S) client origin", () => {
    expect(() => loadSecurityConfig({ CLIENT_ORIGIN: "http://localhost:5173" })).toThrow();
    expect(() => loadSecurityConfig({ JWT_SECRET: "s".repeat(32), CLIENT_ORIGIN: "*" })).toThrow();
    expect(() => loadSecurityConfig({ JWT_SECRET: "s".repeat(32), CLIENT_ORIGIN: "http://localhost:5173/path" })).toThrow();
    expect(() =>
      loadSecurityConfig({
        NODE_ENV: "production",
        CLIENT_ORIGIN: "https://client.example",
      })
    ).toThrow("JWT_SECRET");
    expect(() =>
      loadSecurityConfig({
        NODE_ENV: "production",
        JWT_SECRET: "s".repeat(32),
        CLIENT_ORIGIN: "https://client.example",
        COOKIE_SECURE: "false",
      })
    ).toThrow("COOKIE_SECURE");
    const unspecifiedEnvironment = loadSecurityConfig({
      JWT_SECRET: "s".repeat(32),
      CLIENT_ORIGIN: "https://client.example",
    });
    expect(unspecifiedEnvironment.clientOrigin).toBe("https://client.example");
    expect(unspecifiedEnvironment.cookie.secure).toBe(true);
  });
});

describe("credentialed exact-origin CORS", () => {
  it("allows the configured origin and required methods/headers for preflight", async () => {
    const origin = "http://localhost:5173";
    const res = await request(createApp(loadSecurityConfig({
      JWT_SECRET: "s".repeat(32),
      CLIENT_ORIGIN: origin,
    })))
      .options("/api/tickets/1/attachments")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "Content-Type, X-CSRF-Token, Accept");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(origin);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-allow-methods"]).toContain("PATCH");
    expect(res.headers["access-control-allow-methods"]).toContain("OPTIONS");
    expect(res.headers["access-control-allow-headers"]).toContain("X-CSRF-Token");
    expect(res.headers["access-control-allow-headers"]).not.toContain("boundary");
  });

  it("does not reflect an arbitrary origin", async () => {
    const res = await request(createApp(createDevelopmentSecurityConfig()))
      .options("/api/tickets/1/attachments")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });
});

describe("login throttle", () => {
  it("throttles five failures for a normalized email, expires the window, and clears on success", () => {
    const clock = fakeClock();
    const throttle = new LoginThrottle({ clock, storage: new InMemoryThrottleStorage() });
    const email = "  NIRAN@EXAMPLE.TEST ";

    for (let i = 0; i < 4; i += 1) {
      expect(throttle.recordFailure(email).throttled).toBe(false);
    }
    expect(throttle.recordFailure(email).throttled).toBe(true);
    expect(throttle.isThrottled("niran@example.test")).toBe(true);

    clock.advance(15 * 60 * 1000 + 1);
    expect(throttle.isThrottled(email)).toBe(false);
    throttle.recordFailure(email);
    throttle.clear(email);
    expect(throttle.isThrottled(email)).toBe(false);
  });
});

describe("database-authoritative authentication middleware", () => {
  it("uses current database identity and stops mandatory-change users before domain work", async () => {
    const clock = fakeClock();
    const jwt = new JwtService({ secret: "s".repeat(32), clock });
    const token = jwt.sign({ userId: 7, sessionId: "session-7" });
    const authApp = express();
    authApp.use(express.json());
    authApp.get(
      "/protected",
      createAuthenticationMiddleware({
        jwt,
        sessions: {
          findActive: async () => ({
            id: "session-7",
            userId: 7,
            issuedAt: clock.now(),
            expiresAt: new Date(clock.now().getTime() + 1000),
            user: {
              id: 7,
              fullName: "Niran",
              email: "niran@example.test",
              active: true,
              role: "ADMIN",
              mustChangePassword: true,
            },
          }),
        } as any,
        allowPasswordChangeRequired: false,
      }),
      (_req, res) => res.json({ ok: true })
    );
    authApp.use((error: unknown, _req: any, res: any, _next: any) => {
      const httpError = error as { status: number; code: string; message: string };
      res.status(httpError.status).json({ error: { code: httpError.code, message: httpError.message } });
    });

    const response = await request(authApp).get("/protected").set("Cookie", `toktickit_session=${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("rejects a CSRF failure before the domain handler runs", async () => {
    let domainCalls = 0;
    const csrfApp = express();
    csrfApp.use((req, _res, next) => {
      req.auth = {
        sessionId: "session-7",
        userId: 7,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
        user: {
          id: 7,
          fullName: "Niran",
          email: "niran@example.test",
          active: true,
          role: "REQUESTER",
          mustChangePassword: false,
        },
      };
      next();
    });
    csrfApp.post(
      "/mutate",
      createCsrfMiddleware({
        sessions: { verifyCsrf: async () => false } as any,
      }),
      (_req, res) => {
        domainCalls += 1;
        res.sendStatus(204);
      }
    );
    csrfApp.use(errorHandler);

    const response = await request(csrfApp).post("/mutate");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("CSRF_INVALID");
    expect(domainCalls).toBe(0);
  });
});

describe("authentication middleware request boundary", () => {
  function makeProbe(
    clock = fakeClock(),
    findActive: (sessionId: string) => Promise<ActiveSession | null> = async (sessionId) => ({
      id: sessionId,
      userId: 7,
      issuedAt: clock.now(),
      expiresAt: new Date(clock.now().getTime() + SESSION_TTL_MS),
      user: {
        id: 7,
        fullName: "Niran",
        email: "niran@example.test",
        active: true,
        role: "REQUESTER",
        mustChangePassword: false,
      },
    })
  ) {
    const jwt = new JwtService({ secret: "s".repeat(32), clock });
    const probe = express();
    let domainCalls = 0;
    probe.get(
      "/protected",
      createAuthenticationMiddleware({
        jwt,
        sessions: { findActive, verifyCsrf: async () => false },
      }),
      (_req, res) => {
        domainCalls += 1;
        res.json({ ok: true });
      }
    );
    probe.use(errorHandler);
    return { clock, jwt, probe, domainCalls: () => domainCalls };
  }

  async function expectUnauthenticated(response: request.Response) {
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  }

  it("rejects a missing authentication cookie", async () => {
    const { probe, domainCalls } = makeProbe();

    await expectUnauthenticated(await request(probe).get("/protected"));
    expect(domainCalls()).toBe(0);
  });

  it("rejects a forged JWT at the request boundary", async () => {
    const { jwt, probe, domainCalls } = makeProbe();
    const token = jwt.sign({ userId: 7, sessionId: "session-7" });
    const forged = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    await expectUnauthenticated(await request(probe).get("/protected").set("Cookie", `toktickit_session=${forged}`));
    expect(domainCalls()).toBe(0);
  });

  it("rejects an expired JWT at the request boundary", async () => {
    const { clock, jwt, probe, domainCalls } = makeProbe();
    const token = jwt.sign({ userId: 7, sessionId: "session-7" });
    clock.advance(SESSION_TTL_MS);

    await expectUnauthenticated(await request(probe).get("/protected").set("Cookie", `toktickit_session=${token}`));
    expect(domainCalls()).toBe(0);
  });

  it("rejects a valid JWT whose AuthSession was revoked", async () => {
    const { jwt, probe, domainCalls } = makeProbe(undefined, async () => null);
    const token = jwt.sign({ userId: 7, sessionId: "revoked-session" });

    await expectUnauthenticated(await request(probe).get("/protected").set("Cookie", `toktickit_session=${token}`));
    expect(domainCalls()).toBe(0);
  });

  it("rejects an orphaned JWT whose AuthSession no longer exists", async () => {
    const { jwt, probe, domainCalls } = makeProbe(undefined, async () => null);
    const token = jwt.sign({ userId: 7, sessionId: "missing-session" });

    await expectUnauthenticated(await request(probe).get("/protected").set("Cookie", `toktickit_session=${token}`));
    expect(domainCalls()).toBe(0);
  });
});
