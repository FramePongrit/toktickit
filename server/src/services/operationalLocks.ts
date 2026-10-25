import { Prisma } from "@prisma/client";
import { HttpError } from "../lib/httpError.js";

export type TransactionClient = Prisma.TransactionClient;

export interface LockedOperationalUser {
  id: number;
  fullName: string;
  email: string;
  active: boolean;
  role: "REQUESTER" | "STAFF" | "ADMIN";
  mustChangePassword: boolean;
}

export async function lockUsersInIdOrder(
  tx: TransactionClient,
  userIds: number[]
): Promise<Map<number, LockedOperationalUser>> {
  const ids = [...new Set(userIds)].sort((left, right) => left - right);
  if (ids.length === 0) return new Map();
  const users = await tx.$queryRaw<LockedOperationalUser[]>`
    SELECT "id", "fullName", "email", "active", "role", "mustChangePassword"
    FROM "User"
    WHERE "id" IN (${Prisma.join(ids)})
    ORDER BY "id" ASC
    FOR UPDATE
  `;
  return new Map(users.map((user) => [user.id, user]));
}

export async function assertCurrentStaffSession(
  tx: TransactionClient,
  userId: number,
  sessionId: string,
  users: Map<number, LockedOperationalUser>
): Promise<LockedOperationalUser> {
  const sessions = await tx.$queryRaw<{ id: string; userId: number; expiresAt: Date; revokedAt: Date | null }[]>`
    SELECT "id", "userId", "expiresAt", "revokedAt"
    FROM "AuthSession"
    WHERE "id" = ${sessionId}
    FOR UPDATE
  `;
  const session = sessions[0];
  if (!session || session.userId !== userId || session.revokedAt !== null || session.expiresAt.getTime() <= Date.now()) {
    throw HttpError.unauthorized("UNAUTHENTICATED", "Authentication is required.");
  }
  const user = users.get(userId);
  if (!user) throw HttpError.unauthorized("UNAUTHENTICATED", "Authentication is required.");
  if (!user.active) throw HttpError.forbidden("USER_INACTIVE", "This User is inactive.");
  if (user.mustChangePassword) {
    throw HttpError.forbidden("PASSWORD_CHANGE_REQUIRED", "Change the Initial Password before using this feature.");
  }
  if (user.role !== "STAFF" && user.role !== "ADMIN") {
    throw HttpError.forbidden("FORBIDDEN", "You do not have permission to use this feature.");
  }
  return user;
}
