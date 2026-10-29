import { Prisma, type Role, type TicketStatus } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { HttpError } from "../lib/httpError.js";
import {
  digestRequestBody,
  lockAndReadIdempotencyRecord,
  replayIdempotencyRecord,
  requireIdempotencyKey,
  saveIdempotencySuccess,
  type IdempotencyScope,
} from "../lib/idempotency.js";
import {
  communicationBodySchema,
  staffOwnerMutationSchema,
  staffPriorityMutationSchema,
  staffClaimMutationSchema,
  staffStatusMutationSchema,
  type StaffOwnerMutationInput,
  type StaffPriorityMutationInput,
  type StaffStatusMutationInput,
} from "../lib/validation.js";
import {
  assertCurrentStaffSession,
  lockUsersInIdOrder,
  type LockedOperationalUser,
  type TransactionClient,
} from "./operationalLocks.js";
import {
  serializeAuthor,
  serializeInternalNote,
  serializePublicComment,
  serializeResolutionIndication,
} from "./communications.service.js";
import { actionSnapshot, appendActionRevision } from "./actions.service.js";
import {
  allowedTicketTransitions,
  resolutionGate,
  TICKET_TRANSITIONS,
  type ResolutionGate,
} from "../lib/ticketRules.js";

const FINAL_STATUSES = new Set<TicketStatus>(["CLOSED", "CANCELLED"]);
const ELIGIBLE_OWNER_ROLES = new Set<Role>(["STAFF", "ADMIN"]);

const safeOwnerSelect = {
  id: true,
  fullName: true,
  role: true,
} satisfies Prisma.UserSelect;

type SafeOwner = Prisma.UserGetPayload<{ select: typeof safeOwnerSelect }>;

export function serializeOwner(owner: SafeOwner | null | undefined) {
  if (!owner) return null;
  return { id: owner.id, fullName: owner.fullName, role: owner.role };
}

const staffDetailInclude = {
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
  requester: { select: { id: true, fullName: true, email: true } },
  owner: { select: { id: true, fullName: true, role: true, active: true } },
  resolutionIndicatedBy: { select: safeOwnerSelect },
  publicComments: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { author: { select: safeOwnerSelect } },
  },
  internalNotes: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { author: { select: safeOwnerSelect } },
  },
  attachments: { orderBy: [{ uploadedAt: "asc" }, { id: "asc" }] },
} satisfies Prisma.TicketInclude;

type StaffTicketDetail = Prisma.TicketGetPayload<{ include: typeof staffDetailInclude }>;

function ownerIsEligible(owner: { active: boolean; role: Role } | null | undefined): boolean {
  return Boolean(owner?.active && ELIGIBLE_OWNER_ROLES.has(owner.role));
}

function allowedTransitionsFor(
  status: TicketStatus,
  owner: { active: boolean; role: Role } | null | undefined,
  gate: ResolutionGate
): TicketStatus[] {
  return allowedTicketTransitions(status, ownerIsEligible(owner), gate);
}

function serializeAttachment(attachment: StaffTicketDetail["attachments"][number]) {
  return {
    id: attachment.id,
    originalFilename: attachment.originalFilename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    uploadedAt: attachment.uploadedAt,
    isRemoved: attachment.removedAt !== null,
    removedAt: attachment.removedAt,
    removalReason: attachment.removalReason,
  };
}

export function serializeStaffTicketDetail(ticket: StaffTicketDetail, gate: ResolutionGate, serverTime: Date) {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    summary: ticket.summary,
    description: ticket.description,
    requestedPriority: ticket.requestedPriority,
    itPriority: ticket.itPriority,
    currentStatus: ticket.currentStatus,
    version: ticket.version,
    workCycle: ticket.workCycle,
    resolvedAt: ticket.resolvedAt,
    serverTime,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    category: ticket.category,
    relatedSystem: ticket.relatedSystem,
    requester: ticket.requester,
    owner: serializeOwner(ticket.owner),
    resolutionIndication: serializeResolutionIndication(
      ticket.resolutionIndicatedAt,
      ticket.resolutionIndicatedBy
    ),
    publicComments: ticket.publicComments.map(serializePublicComment),
    internalNotes: ticket.internalNotes.map(serializeInternalNote),
    attachments: ticket.attachments.map(serializeAttachment),
    allowedTransitions: allowedTransitionsFor(ticket.currentStatus, ticket.owner, gate),
    resolutionGate: gate,
  };
}

interface LockedTicket {
  id: number;
  currentStatus: TicketStatus;
  workCycle: number;
  resolvedAt: Date | null;
  ownerId: number | null;
  resolutionIndicatedAt: Date | null;
  resolutionIndicatedById: number | null;
  version: number;
  itPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
}

/**
 * Test-only lock observability seam. Production leaves this unset. Tests use
 * PostgreSQL's actual parent/User row locks as barriers instead of sleeps so
 * race outcomes are deterministic and prove the transaction ordering.
 */
export type StaffTicketOperationsLockTestHook = (context: {
  ticketId: number;
  operation: string;
  backendPid: number;
}) => void | Promise<void>;

let staffTicketOperationsLockTestHook: StaffTicketOperationsLockTestHook | undefined;

export function setStaffTicketOperationsLockTestHook(
  hook: StaffTicketOperationsLockTestHook | undefined
): void {
  staffTicketOperationsLockTestHook = hook;
}

async function notifyLockTestHook(
  tx: TransactionClient,
  ticketId: number,
  operation: string
): Promise<void> {
  if (!staffTicketOperationsLockTestHook) return;
  const [{ backendPid }] = await tx.$queryRaw<{ backendPid: number }[]>`
    SELECT pg_backend_pid() AS "backendPid"
  `;
  await staffTicketOperationsLockTestHook({ ticketId, operation, backendPid });
}

async function lockTicket(tx: TransactionClient, ticketId: number): Promise<LockedTicket> {
  const rows = await tx.$queryRaw<LockedTicket[]>`
    SELECT "id", "currentStatus", "ownerId", "workCycle", "resolvedAt", "resolutionIndicatedAt", "resolutionIndicatedById", "version", "itPriority"
    FROM "Ticket"
    WHERE "id" = ${ticketId}
    FOR UPDATE
  `;
  const ticket = rows[0];
  if (!ticket) {
    throw HttpError.notFound("TICKET_NOT_FOUND", "The requested ticket does not exist.");
  }
  return ticket;
}

function assertNotFinal(status: TicketStatus): void {
  if (FINAL_STATUSES.has(status)) {
    throw HttpError.conflict("TICKET_FINAL", "Closed or Cancelled Tickets are read-only.");
  }
}

function lockedOwner(users: Map<number, LockedOperationalUser>, ownerId: number | null) {
  return ownerId === null ? null : users.get(ownerId) ?? null;
}

function assertTicketVersion(expectedVersion: number, ticket: LockedTicket): void {
  if (expectedVersion !== ticket.version) {
    throw HttpError.conflict("STALE_TICKET_VERSION", "This Ticket changed. Reload it before saving.", {
      currentVersion: ticket.version,
      reload: "ticket",
    });
  }
}

function statusScope(actor: { userId: number }, ticketId: number, key: string): IdempotencyScope {
  return {
    userId: actor.userId,
    method: "PATCH",
    canonicalPath: `/staff/tickets/${ticketId}/status`,
    key,
  };
}

function assertCurrentOwner(owner: { active: boolean; role: Role } | null): void {
  if (!ownerIsEligible(owner)) {
    throw HttpError.conflict(
      "TICKET_OWNER_REQUIRED",
      "Assign an active IT Staff member or Administrator before changing status."
    );
  }
}

function ownerConflict(code: "TICKET_ALREADY_ASSIGNED" | "TICKET_OWNER_CHANGED", owner: SafeOwner) {
  const message = code === "TICKET_ALREADY_ASSIGNED"
    ? "This Ticket already has an owner."
    : "Ticket ownership changed. Refresh and try again.";
  return HttpError.conflict(code, message, { owner: serializeOwner(owner) });
}

async function currentCycleGate(
  tx: TransactionClient,
  ticketId: number,
  workCycle: number,
  ownerIsEligible: boolean
): Promise<ResolutionGate> {
  const groups = await tx.actionTaken.groupBy({
    by: ["status", "followUpRequired"],
    where: { ticketId, workCycle },
    _count: { _all: true },
  });
  const counts = { completedCount: 0, unfinishedCount: 0, followUpCount: 0 };
  for (const group of groups) {
    const count = group._count._all;
    if (group.status === "COMPLETED") {
      counts.completedCount += count;
      if (group.followUpRequired) counts.followUpCount += count;
    } else if (group.status === "PLANNED" || group.status === "IN_PROGRESS") {
      counts.unfinishedCount += count;
    }
  }
  return resolutionGate(counts, ownerIsEligible);
}

export async function getStaffTicketDetail(ticketId: number) {
  const result = await getPrisma().$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, include: staffDetailInclude });
    if (!ticket) throw HttpError.notFound("TICKET_NOT_FOUND", "The requested ticket does not exist.");
    const gate = await currentCycleGate(tx, ticket.id, ticket.workCycle, ownerIsEligible(ticket.owner));
    return { ticket, gate };
  });
  return serializeStaffTicketDetail(result.ticket, result.gate, new Date());
}

export async function claimStaffTicket(
  actor: { userId: number; sessionId: string },
  ticketId: number,
  rawBody: unknown
) {
  const parsed = staffClaimMutationSchema.safeParse(rawBody);
  return getPrisma().$transaction(async (tx) => {
    const users = await lockUsersInIdOrder(tx, [actor.userId]);
    const caller = await assertCurrentStaffSession(tx, actor.userId, actor.sessionId, users);
    const ticket = await lockTicket(tx, ticketId);
    assertNotFinal(ticket.currentStatus);
    if (!ELIGIBLE_OWNER_ROLES.has(caller.role)) {
      throw HttpError.forbidden("FORBIDDEN", "You do not have permission to use this feature.");
    }
    if (ticket.ownerId !== null) {
      const owner = await tx.user.findUnique({ where: { id: ticket.ownerId }, select: safeOwnerSelect });
      if (owner) throw ownerConflict("TICKET_ALREADY_ASSIGNED", owner);
      throw HttpError.conflict("TICKET_ALREADY_ASSIGNED", "This Ticket already has an owner.");
    }
    if (!parsed.success) throw parsed.error;
    assertTicketVersion(parsed.data.expectedTicketVersion, ticket);
    const updated = await tx.ticket.update({
      where: { id: ticketId },
      data: { ownerId: actor.userId, version: { increment: 1 } },
      select: { version: true },
    });
    return { owner: serializeOwner(caller), ticketVersion: updated.version };
  });
}

async function preflightReassign(ticketId: number): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    const ticket = await lockTicket(tx, ticketId);
    assertNotFinal(ticket.currentStatus);
    if (ticket.ownerId === null) {
      throw HttpError.conflict("TICKET_UNASSIGNED", "Assign this Ticket with Claim before reassigning it.");
    }
  });
}

export async function reassignStaffTicket(
  actor: { userId: number; sessionId: string },
  ticketId: number,
  rawBody: unknown
) {
  // Finality and the operation-state prerequisite intentionally precede body
  // parsing, so a Final/Unassigned Ticket wins over malformed target input.
  await preflightReassign(ticketId);
  const input: StaffOwnerMutationInput = staffOwnerMutationSchema.parse(rawBody);

  return getPrisma().$transaction(async (tx) => {
    // Match Action writes: all prerequisite Users are locked by id before the Ticket.
    await notifyLockTestHook(tx, ticketId, "REASSIGN_BEFORE_CANDIDATE_LOCK");
    const users = await lockUsersInIdOrder(tx, [actor.userId, input.expectedOwnerId, input.ownerId]);
    await assertCurrentStaffSession(tx, actor.userId, actor.sessionId, users);
    const candidate = users.get(input.ownerId);
    await notifyLockTestHook(tx, ticketId, "REASSIGN_AFTER_CANDIDATE_LOCK");
    const ticket = await lockTicket(tx, ticketId);
    assertNotFinal(ticket.currentStatus);
    if (ticket.ownerId === null) {
      throw HttpError.conflict("TICKET_UNASSIGNED", "Assign this Ticket with Claim before reassigning it.");
    }
    if (ticket.ownerId !== input.expectedOwnerId) {
      const currentOwner = await tx.user.findUnique({ where: { id: ticket.ownerId }, select: safeOwnerSelect });
      if (currentOwner) throw ownerConflict("TICKET_OWNER_CHANGED", currentOwner);
      throw HttpError.conflict("TICKET_OWNER_CHANGED", "Ticket ownership changed. Refresh and try again.");
    }
    assertTicketVersion(input.expectedTicketVersion, ticket);
    if (!candidate || !candidate.active || !ELIGIBLE_OWNER_ROLES.has(candidate.role)) {
      throw HttpError.conflict(
        "OWNER_NOT_ELIGIBLE",
        "Select an active IT Staff member or Administrator."
      );
    }

    const updated = await tx.ticket.update({
      where: { id: ticketId },
      data: { ownerId: input.ownerId, version: { increment: 1 } },
      select: { owner: { select: safeOwnerSelect }, version: true },
    });
    return { owner: serializeOwner(updated.owner), ticketVersion: updated.version };
  });
}

export async function updateStaffItPriority(
  actor: { userId: number; sessionId: string },
  ticketId: number,
  rawBody: unknown
) {
  const updated = await getPrisma().$transaction(async (tx) => {
    await notifyLockTestHook(tx, ticketId, "IT_PRIORITY_BEFORE_PARENT_LOCK");
    const users = await lockUsersInIdOrder(tx, [actor.userId]);
    await assertCurrentStaffSession(tx, actor.userId, actor.sessionId, users);
    const ticket = await lockTicket(tx, ticketId);
    assertNotFinal(ticket.currentStatus);
    const input: StaffPriorityMutationInput = staffPriorityMutationSchema.parse(rawBody);
    assertTicketVersion(input.expectedTicketVersion, ticket);
    if (input.itPriority === ticket.itPriority) {
      return { itPriority: ticket.itPriority, ticketVersion: ticket.version };
    }
    return tx.ticket.update({
      where: { id: ticketId },
      data: { itPriority: input.itPriority, version: { increment: 1 } },
      select: { itPriority: true, version: true },
    }).then(({ itPriority, version }) => ({ itPriority, ticketVersion: version }));
  });
  return updated;
}

export async function updateStaffTicketStatus(
  actor: { userId: number; sessionId: string },
  ticketId: number,
  rawBody: unknown,
  rawIdempotencyKey: string | undefined
) {
  const key = requireIdempotencyKey(rawIdempotencyKey);
  const parsed = staffStatusMutationSchema.safeParse(rawBody);
  const digest = digestRequestBody(rawBody);
  const scope = statusScope(actor, ticketId, key);
  let lastOwnerId: number | null | undefined;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await getPrisma().$transaction(async (tx) => {
        const existing = await lockAndReadIdempotencyRecord(tx, scope);
        if (existing) {
          const users = await lockUsersInIdOrder(tx, [actor.userId]);
          await assertCurrentStaffSession(tx, actor.userId, actor.sessionId, users);
          await lockTicket(tx, ticketId);
          return replayIdempotencyRecord(existing, digest);
        }

        const parentSnapshot = await tx.ticket.findUnique({ where: { id: ticketId }, select: { ownerId: true } });
        if (!parentSnapshot) throw HttpError.notFound("TICKET_NOT_FOUND", "The requested ticket does not exist.");
        lastOwnerId = parentSnapshot.ownerId;
        const users = await lockUsersInIdOrder(tx, [actor.userId, ...(lastOwnerId === null ? [] : [lastOwnerId])]);
        await assertCurrentStaffSession(tx, actor.userId, actor.sessionId, users);
        await notifyLockTestHook(tx, ticketId, "STATUS_AFTER_USER_LOCKS");
        const ticket = await lockTicket(tx, ticketId);
        if (ticket.ownerId !== lastOwnerId) throw new OwnerSnapshotChanged();
        await notifyLockTestHook(tx, ticketId, "STATUS_AFTER_PARENT_LOCK");
        assertNotFinal(ticket.currentStatus);
        const owner = lockedOwner(users, ticket.ownerId);
        assertCurrentOwner(owner);
        if (!parsed.success) throw parsed.error;
        const input: StaffStatusMutationInput = parsed.data;
        assertTicketVersion(input.expectedTicketVersion, ticket);
        const allowed = TICKET_TRANSITIONS[ticket.currentStatus];
        if (!allowed.includes(input.status)) {
          throw HttpError.conflict("INVALID_STATUS_TRANSITION", "This status transition is not permitted.");
        }
        const gate = await currentCycleGate(tx, ticket.id, ticket.workCycle, ownerIsEligible(owner));
        if (input.status === "RESOLVED" && !gate.canResolve) {
          throw HttpError.conflict("RESOLUTION_GATE_FAILED", "Complete the current-cycle work before resolving this Ticket.", {
            resolutionGate: gate,
          });
        }

        const now = new Date();
        let publicCommentId: number | null = null;
        const waiting = input.status === "WAITING_FOR_REQUESTER";
        if (waiting) {
          const { body } = communicationBodySchema.parse({ body: input.publicComment });
          const comment = await tx.publicComment.create({
            data: { ticketId, authorId: actor.userId, body, createdAt: now },
            select: { id: true },
          });
          publicCommentId = comment.id;
          await notifyLockTestHook(tx, ticketId, "STATUS_AFTER_WAITING_COMMENT");
        }

        if (input.status === "CANCELLED") {
          const unfinished = await tx.$queryRaw<Prisma.ActionTakenGetPayload<{}>[]>`
            SELECT *
            FROM "ActionTaken"
            WHERE "ticketId" = ${ticketId}
              AND "workCycle" = ${ticket.workCycle}
              AND "status" IN ('PLANNED'::"ActionStatus", 'IN_PROGRESS'::"ActionStatus")
            ORDER BY "id" ASC
            FOR UPDATE
          `;
          for (const action of unfinished) {
            const before = actionSnapshot(action);
            const cancelled = await tx.actionTaken.update({
              where: { id: action.id },
              data: {
                status: "CANCELLED",
                performedById: null,
                completedAt: null,
                cancelledAt: now,
                cancelledById: actor.userId,
                cancelReason: input.cancelReason!,
                version: { increment: 1 },
                updatedAt: now,
              },
            });
            await appendActionRevision(
              tx,
              cancelled,
              "TICKET_CANCEL",
              actor.userId,
              before,
              input.cancelReason!,
              now
            );
            await notifyLockTestHook(tx, ticketId, "STATUS_AFTER_CANCEL_ACTION_REVISION");
          }
        }

        const updated = await tx.ticket.update({
          where: { id: ticketId },
          data: {
            currentStatus: input.status,
            version: { increment: 1 },
            ...(input.status === "RESOLVED" && { resolvedAt: now }),
            ...(input.status === "REOPENED" && {
              workCycle: { increment: 1 },
              resolvedAt: null,
              resolutionIndicatedAt: null,
              resolutionIndicatedById: null,
            }),
          },
          include: {
            resolutionIndicatedBy: { select: safeOwnerSelect },
          },
        });
        await tx.ticketWorkflowEvent.create({
          data: {
            ticketId,
            workCycle: updated.workCycle,
            kind: "TRANSITION",
            fromStatus: ticket.currentStatus,
            toStatus: updated.currentStatus,
            actorId: actor.userId,
            occurredAt: now,
            publicCommentId,
            reason: input.status === "CANCELLED" ? input.cancelReason! : null,
            ticketVersion: updated.version,
          },
        });
        await notifyLockTestHook(tx, ticketId, "STATUS_AFTER_WORKFLOW_EVENT");
        const updatedGate = await currentCycleGate(tx, ticket.id, updated.workCycle, ownerIsEligible(owner));
        const body = {
          currentStatus: updated.currentStatus,
          resolutionIndication: serializeResolutionIndication(
            updated.resolutionIndicatedAt,
            updated.resolutionIndicatedBy
          ),
          allowedTransitions: allowedTransitionsFor(updated.currentStatus, owner, updatedGate),
          ticketVersion: updated.version,
          workCycle: updated.workCycle,
          resolvedAt: updated.resolvedAt,
          resolutionGate: updatedGate,
        };
        await saveIdempotencySuccess(tx, scope, digest, 200, body);
        return { status: 200, body, replayed: false as const };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      return result;
    } catch (error) {
      if (!(error instanceof OwnerSnapshotChanged)) throw error;
    }
  }
  throw HttpError.conflict("TICKET_OWNER_CHANGED", "Ticket ownership changed. Refresh and try again.", {
    ownerId: lastOwnerId ?? null,
  });
}

class OwnerSnapshotChanged extends Error {}
