import type { Prisma, Role, TicketStatus } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { HttpError } from "../lib/httpError.js";
import {
  communicationBodySchema,
  staffOwnerMutationSchema,
  staffPriorityMutationSchema,
  staffStatusMutationSchema,
  type StaffOwnerMutationInput,
  type StaffPriorityMutationInput,
  type StaffStatusMutationInput,
} from "../lib/validation.js";
import {
  serializeAuthor,
  serializeInternalNote,
  serializePublicComment,
  serializeResolutionIndication,
} from "./communications.service.js";

const FINAL_STATUSES = new Set<TicketStatus>(["CLOSED", "CANCELLED"]);
const ELIGIBLE_OWNER_ROLES = new Set<Role>(["STAFF", "ADMIN"]);

export const STATUS_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  NEW: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["OPEN", "IN_PROGRESS", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  CLOSED: [],
  CANCELLED: [],
};

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
  owner: { active: boolean; role: Role } | null | undefined
): TicketStatus[] {
  return ownerIsEligible(owner) ? [...STATUS_TRANSITIONS[status]] : [];
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

export function serializeStaffTicketDetail(ticket: StaffTicketDetail) {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    summary: ticket.summary,
    description: ticket.description,
    requestedPriority: ticket.requestedPriority,
    itPriority: ticket.itPriority,
    currentStatus: ticket.currentStatus,
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
    allowedTransitions: allowedTransitionsFor(ticket.currentStatus, ticket.owner),
  };
}

interface LockedTicket {
  id: number;
  currentStatus: TicketStatus;
  ownerId: number | null;
  resolutionIndicatedAt: Date | null;
  resolutionIndicatedById: number | null;
}

type TransactionClient = Prisma.TransactionClient;

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
    SELECT "id", "currentStatus", "ownerId", "resolutionIndicatedAt", "resolutionIndicatedById"
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

async function loadCurrentOwner(tx: TransactionClient, ownerId: number | null) {
  if (ownerId === null) return null;
  return tx.user.findUnique({
    where: { id: ownerId },
    select: { id: true, fullName: true, role: true, active: true },
  });
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

async function loadDetail(ticketId: number): Promise<StaffTicketDetail> {
  const ticket = await getPrisma().ticket.findUnique({
    where: { id: ticketId },
    include: staffDetailInclude,
  });
  if (!ticket) {
    throw HttpError.notFound("TICKET_NOT_FOUND", "The requested ticket does not exist.");
  }
  return ticket;
}

export async function getStaffTicketDetail(ticketId: number) {
  return serializeStaffTicketDetail(await loadDetail(ticketId));
}

export async function claimStaffTicket(userId: number, ticketId: number) {
  await getPrisma().$transaction(async (tx) => {
    const caller = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, active: true, role: true },
    });
    const ticket = await lockTicket(tx, ticketId);
    assertNotFinal(ticket.currentStatus);
    if (!caller || !caller.active || !ELIGIBLE_OWNER_ROLES.has(caller.role)) {
      throw HttpError.forbidden("FORBIDDEN", "You do not have permission to use this feature.");
    }
    if (ticket.ownerId !== null) {
      const owner = await tx.user.findUnique({ where: { id: ticket.ownerId }, select: safeOwnerSelect });
      if (owner) throw ownerConflict("TICKET_ALREADY_ASSIGNED", owner);
      throw HttpError.conflict("TICKET_ALREADY_ASSIGNED", "This Ticket already has an owner.");
    }
    await tx.ticket.update({ where: { id: ticketId }, data: { ownerId: userId } });
  });

  const owner = await getPrisma().user.findUniqueOrThrow({ where: { id: userId }, select: safeOwnerSelect });
  return { owner: serializeOwner(owner) };
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
  ticketId: number,
  rawBody: unknown
) {
  // Finality and the operation-state prerequisite intentionally precede body
  // parsing, so a Final/Unassigned Ticket wins over malformed target input.
  await preflightReassign(ticketId);
  const input: StaffOwnerMutationInput = staffOwnerMutationSchema.parse(rawBody);

  const owner = await getPrisma().$transaction(async (tx) => {
    // BR-35 lock order: candidate User first, parent Ticket second.
    await notifyLockTestHook(tx, ticketId, "REASSIGN_BEFORE_CANDIDATE_LOCK");
    const candidates = await tx.$queryRaw<{
      id: number;
      fullName: string;
      role: Role;
      active: boolean;
    }[]>`
      SELECT "id", "fullName", "role", "active"
      FROM "User"
      WHERE "id" = ${input.ownerId}
      FOR UPDATE
    `;
    const candidate = candidates[0];
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
    if (!candidate || !candidate.active || !ELIGIBLE_OWNER_ROLES.has(candidate.role)) {
      throw HttpError.conflict(
        "OWNER_NOT_ELIGIBLE",
        "Select an active IT Staff member or Administrator."
      );
    }

    const updated = await tx.ticket.update({
      where: { id: ticketId },
      data: { ownerId: input.ownerId },
      select: { owner: { select: safeOwnerSelect } },
    });
    return updated.owner;
  });

  return { owner: serializeOwner(owner) };
}

export async function updateStaffItPriority(ticketId: number, rawBody: unknown) {
  const updated = await getPrisma().$transaction(async (tx) => {
    await notifyLockTestHook(tx, ticketId, "IT_PRIORITY_BEFORE_PARENT_LOCK");
    const ticket = await lockTicket(tx, ticketId);
    assertNotFinal(ticket.currentStatus);
    const input: StaffPriorityMutationInput = staffPriorityMutationSchema.parse(rawBody);
    return tx.ticket.update({ where: { id: ticketId }, data: { itPriority: input.itPriority }, select: { itPriority: true } });
  });
  return updated;
}

export async function updateStaffTicketStatus(
  userId: number,
  ticketId: number,
  rawBody: unknown
) {
  const result = await getPrisma().$transaction(async (tx) => {
    const ticket = await lockTicket(tx, ticketId);
    assertNotFinal(ticket.currentStatus);
    const owner = await loadCurrentOwner(tx, ticket.ownerId);
    assertCurrentOwner(owner);

    const input: StaffStatusMutationInput = staffStatusMutationSchema.parse(rawBody);
    const allowed = STATUS_TRANSITIONS[ticket.currentStatus];
    if (!allowed.includes(input.status)) {
      throw HttpError.conflict("INVALID_STATUS_TRANSITION", "This status transition is not permitted.");
    }

    const waiting = input.status === "WAITING_FOR_REQUESTER";
    if (waiting) {
      const { body } = communicationBodySchema.parse({ body: input.publicComment });
      await tx.publicComment.create({ data: { ticketId, authorId: userId, body } });
    } else if (input.publicComment !== undefined) {
      throw HttpError.validationFailed("The submitted data is invalid.", [
        { field: "publicComment", message: "Public Comment is only accepted for Waiting for Requester." },
      ]);
    }

    const updated = await tx.ticket.update({
      where: { id: ticketId },
      data: {
        currentStatus: input.status,
        ...(input.status === "REOPENED" && {
          resolutionIndicatedAt: null,
          resolutionIndicatedById: null,
        }),
      },
      include: {
        resolutionIndicatedBy: { select: safeOwnerSelect },
      },
    });
    return {
      currentStatus: updated.currentStatus,
      resolutionIndication: serializeResolutionIndication(
        updated.resolutionIndicatedAt,
        updated.resolutionIndicatedBy
      ),
      allowedTransitions: allowedTransitionsFor(updated.currentStatus, owner),
    };
  });

  return result;
}
