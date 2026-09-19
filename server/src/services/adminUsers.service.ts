import { Prisma, type Role } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { HttpError } from "../lib/httpError.js";
import {
  adminCreateUserSchema,
  adminEditUserSchema,
  adminResetPasswordSchema,
  adminUsersQuerySchema,
  type AdminCreateUserInput,
  type AdminEditUserInput,
  type AdminResetPasswordInput,
  type AdminUsersQuery,
} from "../lib/validation.js";
import { normalizeEmail } from "../security/identity.js";
import { hashPassword, validatePassword } from "../security/password.js";

const safeUserSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  active: true,
  mustChangePassword: true,
} satisfies Prisma.UserSelect;

type SafeUser = Prisma.UserGetPayload<{ select: typeof safeUserSelect }>;

const eligibleOwnerRoles = new Set<Role>(["STAFF", "ADMIN"]);

function serializeUser(user: SafeUser) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function duplicateEmail(): HttpError {
  return HttpError.conflict("EMAIL_ALREADY_EXISTS", "A User with this email already exists.");
}

function normalizePasswordInput(input: { initialPassword: string; confirmation: string }): string {
  const initialPassword = input.initialPassword.trim();
  const confirmation = input.confirmation.trim();
  const details = [];
  const passwordResult = validatePassword(initialPassword);
  const confirmationResult = validatePassword(confirmation);
  if (!passwordResult.valid) {
    details.push({ field: "initialPassword", message: passwordResult.issues.join(" ") });
  }
  if (!confirmationResult.valid) {
    details.push({ field: "confirmation", message: confirmationResult.issues.join(" ") });
  }
  if (initialPassword !== confirmation) {
    details.push({ field: "confirmation", message: "Confirmation must match Initial Password." });
  }
  if (details.length > 0) {
    throw HttpError.validationFailed("The submitted data is invalid.", details);
  }
  return initialPassword;
}

type LockedUser = {
  id: number;
  fullName: string;
  email: string;
  active: boolean;
  role: Role;
  mustChangePassword: boolean;
};

type TransactionClient = Prisma.TransactionClient;
type AdminUsersLockOperation = "BEFORE_ADMIN_ROSTER_LOCK" | "AFTER_ADMIN_ROSTER_LOCK";

/**
 * Test-only observability seam. Production leaves this unset; the API suite
 * uses it to pause after the Administrator roster lock and prove that a
 * concurrent safety mutation cannot pass the lock out of order.
 */
export type AdminUsersLockTestHook = (context: {
  targetUserId: number;
  operation: AdminUsersLockOperation;
  backendPid: number;
}) => void | Promise<void>;

let adminUsersLockTestHook: AdminUsersLockTestHook | undefined;

export function setAdminUsersLockTestHook(hook: AdminUsersLockTestHook | undefined): void {
  adminUsersLockTestHook = hook;
}

async function lockActiveAdministratorRoster(tx: TransactionClient): Promise<void> {
  await tx.$queryRaw<{ id: number }[]>`
    SELECT "id"
    FROM "User"
    WHERE "active" = true AND "role" = 'ADMIN'::"Role"
    ORDER BY "id" ASC
    FOR UPDATE
  `;
}

async function notifyAdminUsersLockTestHook(
  tx: TransactionClient,
  targetUserId: number,
  operation: AdminUsersLockOperation
): Promise<void> {
  if (!adminUsersLockTestHook) return;
  const [{ backendPid }] = await tx.$queryRaw<{ backendPid: number }[]>`
    SELECT pg_backend_pid() AS "backendPid"
  `;
  await adminUsersLockTestHook({
    targetUserId,
    operation,
    backendPid,
  });
}

async function lockUser(tx: TransactionClient, userId: number): Promise<LockedUser> {
  const rows = await tx.$queryRaw<LockedUser[]>`
    SELECT "id", "fullName", "email", "active", "role", "mustChangePassword"
    FROM "User"
    WHERE "id" = ${userId}
    FOR UPDATE
  `;
  const user = rows[0];
  if (!user) throw HttpError.notFound("USER_NOT_FOUND", "The requested User does not exist.");
  return user;
}

async function lockOwnedNonFinalTickets(tx: TransactionClient, userId: number): Promise<number> {
  const rows = await tx.$queryRaw<{ id: number }[]>`
    SELECT "id"
    FROM "Ticket"
    WHERE "ownerId" = ${userId}
      AND "currentStatus" NOT IN ('CLOSED'::"TicketStatus", 'CANCELLED'::"TicketStatus")
    ORDER BY "id" ASC
    FOR UPDATE
  `;
  return rows.length;
}

async function activeAdministratorCount(tx: TransactionClient): Promise<number> {
  const rows = await tx.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS "count"
    FROM "User"
    WHERE "active" = true AND "role" = 'ADMIN'::"Role"
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function listAdminUsers(rawQuery: unknown) {
  const query: AdminUsersQuery = adminUsersQuerySchema.parse(rawQuery);
  const users = await getPrisma().user.findMany({
    where: {
      ...(query.q && {
        OR: [
          { fullName: { contains: query.q, mode: "insensitive" } },
          { email: { contains: query.q, mode: "insensitive" } },
        ],
      }),
      ...(query.role && { role: query.role }),
    },
    select: safeUserSelect,
    orderBy: [{ fullName: "asc" }, { id: "asc" }],
  });
  return { data: users.map(serializeUser) };
}

export async function createAdminUser(rawInput: unknown) {
  const input: AdminCreateUserInput = adminCreateUserSchema.parse(rawInput);
  const initialPassword = normalizePasswordInput(input);
  const passwordHash = await hashPassword(initialPassword);
  try {
    const user = await getPrisma().user.create({
      data: {
        fullName: input.fullName,
        email: normalizeEmail(input.email),
        role: input.role,
        active: input.active,
        passwordHash,
        mustChangePassword: true,
      },
      select: safeUserSelect,
    });
    return { user: serializeUser(user) };
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicateEmail();
    throw error;
  }
}

export async function editAdminUser(actorId: number, userId: number, rawInput: unknown) {
  const input: AdminEditUserInput = adminEditUserSchema.parse(rawInput);
  try {
    const user = await getPrisma().$transaction(async (tx) => {
      const hasRoleOrActiveChange = "role" in input || "active" in input;
      if (hasRoleOrActiveChange) {
        await notifyAdminUsersLockTestHook(tx, userId, "BEFORE_ADMIN_ROSTER_LOCK");
        await lockActiveAdministratorRoster(tx);
        await notifyAdminUsersLockTestHook(tx, userId, "AFTER_ADMIN_ROSTER_LOCK");
      }
      const current = await lockUser(tx, userId);

      if (actorId === userId && ("role" in input || "active" in input)) {
        throw HttpError.conflict(
          "ADMIN_SELF_PROTECTION",
          "Administrators cannot change their own Role or active state."
        );
      }

      const nextRole = input.role ?? current.role;
      const nextActive = input.active ?? current.active;
      const becomesIneligibleOwner = !nextActive || !eligibleOwnerRoles.has(nextRole);
      if (hasRoleOrActiveChange && becomesIneligibleOwner) {
        const nonFinalOwnedTicketCount = await lockOwnedNonFinalTickets(tx, userId);
        if (nonFinalOwnedTicketCount > 0) {
          throw HttpError.conflict(
            "USER_OWNS_NON_FINAL_TICKETS",
            "Reassign this User's non-final Tickets before deactivation or changing their Role to Requester.",
            { nonFinalOwnedTicketCount }
          );
        }
      }

      const reducesActiveAdministrator =
        current.active && current.role === "ADMIN" && (nextRole !== "ADMIN" || !nextActive);
      if (reducesActiveAdministrator && (await activeAdministratorCount(tx)) <= 1) {
        throw HttpError.conflict(
          "LAST_ACTIVE_ADMINISTRATOR",
          "At least one active Administrator must remain."
        );
      }

      if (input.email && input.email !== current.email) {
        const duplicate = await tx.user.findFirst({
          where: { email: normalizeEmail(input.email), NOT: { id: userId } },
          select: { id: true },
        });
        if (duplicate) throw duplicateEmail();
      }

      const roleChanged = nextRole !== current.role;
      const activeChanged = nextActive !== current.active;
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          ...(input.fullName !== undefined && { fullName: input.fullName }),
          ...(input.email !== undefined && { email: normalizeEmail(input.email) }),
          ...(input.role !== undefined && { role: input.role }),
          ...(input.active !== undefined && { active: input.active }),
        },
        select: safeUserSelect,
      });
      if (roleChanged || activeChanged) {
        await tx.authSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return updated;
    });
    return { user: serializeUser(user) };
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicateEmail();
    throw error;
  }
}

export async function resetAdminUserPassword(actorId: number, userId: number, rawInput: unknown) {
  const input: AdminResetPasswordInput = adminResetPasswordSchema.parse(rawInput);
  if (actorId === userId) {
    throw HttpError.conflict("ADMIN_SELF_PROTECTION", "Administrators cannot reset their own password here.");
  }
  const initialPassword = normalizePasswordInput(input);
  const passwordHash = await hashPassword(initialPassword);

  const user = await getPrisma().$transaction(async (tx) => {
    await lockUser(tx, userId);
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: true },
    });
    await tx.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return tx.user.findUniqueOrThrow({ where: { id: userId }, select: safeUserSelect });
  });
  return { user: serializeUser(user) };
}
