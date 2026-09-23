import { Prisma, PrismaClient } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import {
  decryptCsrfToken,
  encryptCsrfToken,
  generateCsrfToken,
  hashCsrfToken,
  verifyCsrfToken,
} from "./csrf.js";
import { systemClock, systemRandom, type Clock, type RandomSource } from "./dependencies.js";

export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

export interface SessionUser {
  id: number;
  fullName: string;
  email: string;
  active: boolean;
  role: "REQUESTER" | "STAFF" | "ADMIN";
  mustChangePassword: boolean;
}

export interface ActiveSession {
  id: string;
  userId: number;
  issuedAt: Date;
  expiresAt: Date;
  user: SessionUser;
}

export interface CreatedSession {
  id: string;
  userId: number;
  issuedAt: Date;
  expiresAt: Date;
  csrfToken: string;
}

export interface ReplacedPasswordSession {
  user: SessionUser;
  session: CreatedSession;
}

const sessionUserSelect = {
  id: true,
  fullName: true,
  email: true,
  active: true,
  role: true,
  mustChangePassword: true,
} satisfies Prisma.UserSelect;

type SessionRecordRepository = Pick<PrismaClient, "authSession">;

export class AuthSessionService {
  private readonly repository: PrismaClient;
  private readonly clock: Clock;
  private readonly random: RandomSource;
  private readonly encryptionSecret: string;

  constructor(
    repository: PrismaClient = getPrisma(),
    dependencies: { clock?: Clock; random?: RandomSource; encryptionSecret?: string } = {}
  ) {
    this.repository = repository;
    this.clock = dependencies.clock ?? systemClock;
    this.random = dependencies.random ?? systemRandom;
    this.encryptionSecret = dependencies.encryptionSecret ?? "local-session-test-secret";
  }

  async create(userId: number, issuedAt = this.clock.now()): Promise<CreatedSession> {
    const csrfToken = generateCsrfToken(this.random);
    const expiresAt = new Date(issuedAt.getTime() + SESSION_TTL_MS);
    return this.createWithRepository(this.repository, userId, issuedAt, expiresAt, csrfToken);
  }

  private async createWithRepository(
    repository: SessionRecordRepository,
    userId: number,
    issuedAt: Date,
    expiresAt: Date,
    csrfToken = generateCsrfToken(this.random)
  ): Promise<CreatedSession> {
    const row = await repository.authSession.create({
      data: {
        userId,
        csrfTokenHash: hashCsrfToken(csrfToken),
        csrfTokenCiphertext: encryptCsrfToken(csrfToken, this.encryptionSecret, this.random),
        issuedAt,
        expiresAt,
      },
    });
    return { id: row.id, userId: row.userId, issuedAt: row.issuedAt, expiresAt: row.expiresAt, csrfToken };
  }

  async findActive(sessionId: string, at = this.clock.now()): Promise<ActiveSession | null> {
    if (!sessionId) return null;
    const row = await this.repository.authSession.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            active: true,
            role: true,
            mustChangePassword: true,
          },
        },
      },
    });
    if (!row || row.revokedAt !== null || new Date(row.expiresAt).getTime() <= at.getTime()) {
      return null;
    }
    return {
      id: row.id,
      userId: row.userId,
      issuedAt: new Date(row.issuedAt),
      expiresAt: new Date(row.expiresAt),
      user: row.user as SessionUser,
    };
  }

  async verifyCsrf(sessionId: string, csrfToken: string, at = this.clock.now()): Promise<boolean> {
    const row = await this.repository.authSession.findUnique({
      where: { id: sessionId },
      select: { csrfTokenHash: true, revokedAt: true, expiresAt: true },
    });
    if (!row || row.revokedAt !== null || new Date(row.expiresAt).getTime() <= at.getTime()) {
      return false;
    }
    return verifyCsrfToken(csrfToken, row.csrfTokenHash);
  }

  async getCsrfToken(sessionId: string, at = this.clock.now()): Promise<string | null> {
    const row = await this.repository.authSession.findUnique({
      where: { id: sessionId },
      select: { csrfTokenCiphertext: true, revokedAt: true, expiresAt: true },
    });
    if (!row || row.revokedAt !== null || new Date(row.expiresAt).getTime() <= at.getTime()) {
      return null;
    }
    return row.csrfTokenCiphertext ? decryptCsrfToken(row.csrfTokenCiphertext, this.encryptionSecret) : null;
  }

  async replaceAllAfterPasswordChange(
    userId: number,
    passwordHash: string,
    issuedAt = this.clock.now()
  ): Promise<ReplacedPasswordSession> {
    const expiresAt = new Date(issuedAt.getTime() + SESSION_TTL_MS);
    const csrfToken = generateCsrfToken(this.random);
    return this.repository.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
        select: sessionUserSelect,
      });
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: issuedAt },
      });
      const session = await this.createWithRepository(tx, userId, issuedAt, expiresAt, csrfToken);
      return { user: user as SessionUser, session };
    });
  }

  async revokeOne(sessionId: string, revokedAt = this.clock.now()): Promise<boolean> {
    const result = await this.repository.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt },
    });
    return result.count > 0;
  }

  async revokeAll(userId: number, revokedAt = this.clock.now()): Promise<number> {
    const result = await this.repository.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt },
    });
    return result.count;
  }
}
