import type { Prisma, Role } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { HttpError } from "../lib/httpError.js";
import { communicationBodySchema } from "../lib/validation.js";

const FINAL_STATUSES = new Set(["CLOSED", "CANCELLED"]);

const safeAuthorSelect = {
  id: true,
  fullName: true,
  role: true,
} satisfies Prisma.UserSelect;

type SafeAuthor = Prisma.UserGetPayload<{ select: typeof safeAuthorSelect }>;

export function serializeAuthor(author: SafeAuthor) {
  return {
    id: author.id,
    fullName: author.fullName,
    role: author.role,
  };
}

type PublicCommentWithAuthor = Prisma.PublicCommentGetPayload<{
  include: { author: { select: typeof safeAuthorSelect } };
}>;

type InternalNoteWithAuthor = Prisma.InternalNoteGetPayload<{
  include: { author: { select: typeof safeAuthorSelect } };
}>;

export function serializePublicComment(comment: PublicCommentWithAuthor) {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt,
    author: serializeAuthor(comment.author),
  };
}

export function serializeInternalNote(note: InternalNoteWithAuthor) {
  return {
    id: note.id,
    body: note.body,
    createdAt: note.createdAt,
    author: serializeAuthor(note.author),
  };
}

export function serializeResolutionIndication(
  indicatedAt: Date | null,
  indicatedBy: SafeAuthor | null | undefined
) {
  if (!indicatedAt || !indicatedBy) return null;
  return { indicatedAt, indicatedBy: serializeAuthor(indicatedBy) };
}

type TransactionClient = Prisma.TransactionClient;

/**
 * Test-only observability seam. The hook runs inside the mutation transaction
 * immediately before the parent Ticket lock is attempted; it is unset during
 * normal application execution and does not alter production behavior.
 */
export type CommunicationsLockTestHook = (context: {
  ticketId: number;
  operation: string;
  backendPid: number;
}) => void | Promise<void>;

let communicationsLockTestHook: CommunicationsLockTestHook | undefined;

export function setCommunicationsLockTestHook(hook: CommunicationsLockTestHook | undefined): void {
  communicationsLockTestHook = hook;
}

interface LockedTicket {
  id: number;
  currentStatus: string;
  resolutionIndicatedAt: Date | null;
  resolutionIndicatedById: number | null;
}

/**
 * Ownership is part of the locked lookup for Requesters. This keeps another
 * Requester's Ticket indistinguishable from a missing Ticket and makes the
 * final-state check and append atomic with the insert/update.
 */
async function lockTicket(
  tx: TransactionClient,
  userId: number,
  role: Role,
  ticketId: number,
  operation: string
): Promise<LockedTicket> {
  if (communicationsLockTestHook) {
    const [{ backendPid }] = await tx.$queryRaw<{ backendPid: number }[]>`
      SELECT pg_backend_pid() AS "backendPid"
    `;
    await communicationsLockTestHook({ ticketId, operation, backendPid });
  }

  const rows = role === "REQUESTER"
    ? await tx.$queryRaw<LockedTicket[]>`
        SELECT "id", "currentStatus", "resolutionIndicatedAt", "resolutionIndicatedById"
        FROM "Ticket"
        WHERE "id" = ${ticketId} AND "requesterId" = ${userId}
        FOR UPDATE
      `
    : await tx.$queryRaw<LockedTicket[]>`
        SELECT "id", "currentStatus", "resolutionIndicatedAt", "resolutionIndicatedById"
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

function assertNotFinal(status: string): void {
  if (FINAL_STATUSES.has(status)) {
    throw HttpError.conflict("TICKET_FINAL", "Closed or Cancelled Tickets are read-only.");
  }
}

const publicCommentInclude = {
  author: { select: safeAuthorSelect },
} satisfies Prisma.PublicCommentInclude;

const internalNoteInclude = {
  author: { select: safeAuthorSelect },
} satisfies Prisma.InternalNoteInclude;

export async function listPublicComments(userId: number, role: Role, ticketId: number) {
  const prisma = getPrisma();
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, ...(role === "REQUESTER" ? { requesterId: userId } : {}) },
    select: { id: true },
  });
  if (!ticket) {
    throw HttpError.notFound("TICKET_NOT_FOUND", "The requested ticket does not exist.");
  }

  const comments = await prisma.publicComment.findMany({
    where: { ticketId },
    include: publicCommentInclude,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return comments.map(serializePublicComment);
}

export async function createPublicComment(
  userId: number,
  role: Role,
  ticketId: number,
  rawBody: unknown
) {
  const created = await getPrisma().$transaction(async (tx) => {
    const ticket = await lockTicket(tx, userId, role, ticketId, "PUBLIC_COMMENT");
    // Finality deliberately precedes body validation for parsed JSON bodies.
    assertNotFinal(ticket.currentStatus);
    const { body } = communicationBodySchema.parse(rawBody);
    return tx.publicComment.create({
      data: { ticketId, authorId: userId, body },
      include: publicCommentInclude,
    });
  });
  return serializePublicComment(created);
}

export async function listInternalNotes(userId: number, role: Role, ticketId: number) {
  if (role === "REQUESTER") {
    throw HttpError.forbidden("FORBIDDEN", "You do not have permission to use this feature.");
  }
  const prisma = getPrisma();
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true } });
  if (!ticket) {
    throw HttpError.notFound("TICKET_NOT_FOUND", "The requested ticket does not exist.");
  }
  const notes = await prisma.internalNote.findMany({
    where: { ticketId },
    include: internalNoteInclude,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return notes.map(serializeInternalNote);
}

export async function createInternalNote(
  userId: number,
  role: Role,
  ticketId: number,
  rawBody: unknown
) {
  if (role === "REQUESTER") {
    throw HttpError.forbidden("FORBIDDEN", "You do not have permission to use this feature.");
  }
  const created = await getPrisma().$transaction(async (tx) => {
    const ticket = await lockTicket(tx, userId, role, ticketId, "INTERNAL_NOTE");
    // Finality deliberately precedes body validation for parsed JSON bodies.
    assertNotFinal(ticket.currentStatus);
    const { body } = communicationBodySchema.parse(rawBody);
    return tx.internalNote.create({
      data: { ticketId, authorId: userId, body },
      include: internalNoteInclude,
    });
  });
  return serializeInternalNote(created);
}

export async function setResolutionIndication(userId: number, ticketId: number) {
  const updated = await getPrisma().$transaction(async (tx) => {
    const ticket = await lockTicket(tx, userId, "REQUESTER", ticketId, "RESOLUTION_INDICATION");
    assertNotFinal(ticket.currentStatus);
    if (ticket.currentStatus === "RESOLVED") {
      throw HttpError.conflict(
        "RESOLUTION_INDICATION_NOT_ALLOWED",
        "A Resolved Ticket cannot receive a Resolution Indication."
      );
    }
    if (ticket.resolutionIndicatedAt || ticket.resolutionIndicatedById) {
      throw HttpError.conflict(
        "RESOLUTION_ALREADY_INDICATED",
        "This Ticket already has an active Resolution Indication."
      );
    }
    return tx.ticket.update({
      where: { id: ticketId },
      data: {
        resolutionIndicatedAt: new Date(),
        resolutionIndicatedById: userId,
      },
      select: {
        resolutionIndicatedAt: true,
        resolutionIndicatedBy: { select: safeAuthorSelect },
      },
    });
  });

  return serializeResolutionIndication(updated.resolutionIndicatedAt, updated.resolutionIndicatedBy);
}

/**
 * Staff status-transition work is owned by a later issue. Its transaction
 * should set currentStatus to REOPENED and call this helper before commit.
 * Keeping the write here makes the clearing rule explicit and reusable without
 * creating a second status-transition API in this issue.
 */
export async function clearResolutionIndicationOnReopened(
  ticketId: number,
  client: Prisma.TransactionClient | ReturnType<typeof getPrisma> = getPrisma()
) {
  await client.ticket.updateMany({
    where: { id: ticketId, currentStatus: "REOPENED" },
    data: { resolutionIndicatedAt: null, resolutionIndicatedById: null },
  });
}
