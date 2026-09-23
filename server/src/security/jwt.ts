import { createHmac, timingSafeEqual } from "node:crypto";
import { systemClock, type Clock } from "./dependencies.js";
import { SESSION_TTL_SECONDS } from "./session.js";

export interface JwtIdentity {
  userId: number;
  sessionId: string;
}

export interface JwtClaims {
  sub: string;
  sid: string;
  iat: number;
  exp: number;
}

export class JwtVerificationError extends Error {
  constructor() {
    super("The authentication token is invalid.");
    this.name = "JwtVerificationError";
  }
}

function signingInput(header: object, payload: object): string {
  return `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${Buffer.from(
    JSON.stringify(payload)
  ).toString("base64url")}`;
}

function signature(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new JwtVerificationError();
  }
}

export class JwtService {
  private readonly secret: string;
  private readonly clock: Clock;

  constructor(options: { secret: string; clock?: Clock }) {
    this.secret = options.secret;
    this.clock = options.clock ?? systemClock;
  }

  sign(identity: JwtIdentity): string {
    if (!Number.isSafeInteger(identity.userId) || identity.userId <= 0 || !identity.sessionId) {
      throw new Error("JWT identity is invalid.");
    }
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const payload: JwtClaims = {
      sub: String(identity.userId),
      sid: identity.sessionId,
      iat,
      exp: iat + SESSION_TTL_SECONDS,
    };
    const input = signingInput({ alg: "HS256", typ: "JWT" }, payload);
    return `${input}.${signature(input, this.secret)}`;
  }

  verify(token: string): JwtClaims {
    const parts = token.split(".");
    if (parts.length !== 3) throw new JwtVerificationError();

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = parseJson(encodedHeader);
    const payload = parseJson(encodedPayload);
    if (
      !header ||
      typeof header !== "object" ||
      (header as Record<string, unknown>).alg !== "HS256" ||
      (header as Record<string, unknown>).typ !== "JWT"
    ) {
      throw new JwtVerificationError();
    }

    const expected = Buffer.from(signature(`${encodedHeader}.${encodedPayload}`, this.secret));
    const provided = Buffer.from(encodedSignature);
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      throw new JwtVerificationError();
    }

    if (!payload || typeof payload !== "object") throw new JwtVerificationError();
    const record = payload as Record<string, unknown>;
    if (Object.keys(record).sort().join(",") !== "exp,iat,sid,sub") {
      throw new JwtVerificationError();
    }
    const issuedAt = record.iat;
    const expiresAt = record.exp;
    if (
      typeof record.sub !== "string" ||
      !/^[1-9]\d*$/.test(record.sub) ||
      typeof record.sid !== "string" ||
      record.sid.length === 0 ||
      typeof issuedAt !== "number" ||
      typeof expiresAt !== "number" ||
      !Number.isSafeInteger(issuedAt) ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= issuedAt
    ) {
      throw new JwtVerificationError();
    }

    const now = Math.floor(this.clock.now().getTime() / 1000);
    if (now >= expiresAt) throw new JwtVerificationError();
    return record as unknown as JwtClaims;
  }
}
