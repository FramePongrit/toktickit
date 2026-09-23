import type { Role, Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { HttpError } from "../lib/httpError.js";
import { removeAttachmentSchema } from "../lib/validation.js";
import { deleteFileIfPresent, storedFilePath } from "../lib/paths.js";
import { isPermittedFile, MAX_ACTIVE_ATTACHMENTS } from "../middleware/upload.js";
import { serializeAttachment } from "./tickets.service.js";

const FINAL_STATUSES = new Set<string>(["CLOSED", "CANCELLED"]);

type TransactionClient = Prisma.TransactionClient;

interface LockedOwnedTicket {
  id: number;
  currentStatus: string;
}

function assertNonFinal(status: string): void {
  if (FINAL_STATUSES.has(status)) {
    throw HttpError.conflict("TICKET_FINAL", "Closed or Cancelled Tickets are read-only.");
  }
}

/**
 * Locks the parent Ticket before any upload-side state or payload decision.
 * Every future finalization path must use the same parent-row serialization
 * contract, so a final transition cannot commit between this check and the
 * Attachment insert.
 */
async function lockOwnedTicket(
  tx: TransactionClient,
  requesterId: number,
  ticketId: number
): Promise<LockedOwnedTicket> {
  const rows = await tx.$queryRaw<LockedOwnedTicket[]>`
    SELECT "id", "currentStatus"
    FROM "Ticket"
    WHERE "id" = ${ticketId} AND "requesterId" = ${requesterId}
    FOR UPDATE
  `;

  const ticket = rows[0];
  if (!ticket) {
    throw HttpError.notFound("TICKET_NOT_FOUND", "The requested ticket does not exist.");
  }
  assertNonFinal(ticket.currentStatus);
  return ticket;
}

interface LockedAttachment {
  attachmentId: number;
  ticketId: number;
  currentStatus: string;
  removedAt: Date | null;
}

/** Locks both the visible Attachment and its parent Ticket for removal. */
async function lockOwnedAttachment(
  tx: TransactionClient,
  requesterId: number,
  attachmentId: number
): Promise<LockedAttachment> {
  const rows = await tx.$queryRaw<LockedAttachment[]>`
    SELECT
      a."id" AS "attachmentId",
      a."ticketId" AS "ticketId",
      a."removedAt" AS "removedAt",
      t."currentStatus" AS "currentStatus"
    FROM "Attachment" AS a
    INNER JOIN "Ticket" AS t ON t."id" = a."ticketId"
    WHERE a."id" = ${attachmentId} AND t."requesterId" = ${requesterId}
    FOR UPDATE OF a, t
  `;

  const attachment = rows[0];
  if (!attachment) {
    throw HttpError.notFound("ATTACHMENT_NOT_FOUND", "The requested attachment does not exist.");
  }
  assertNonFinal(attachment.currentStatus);
  return attachment;
}

/**
 * Resolves a Requester's Ticket and applies the final-state guard. The
 * ownership predicate is part of the lookup, so another Requester's Ticket
 * remains indistinguishable from an absent Ticket.
 */
export async function assertTicketIsOwned(requesterId: number, ticketId: number) {
  const ticket = await getPrisma().ticket.findFirst({
    where: { id: ticketId, requesterId },
    select: { id: true, currentStatus: true },
  });

  if (!ticket) {
    throw HttpError.notFound("TICKET_NOT_FOUND", "The requested ticket does not exist.");
  }
  assertNonFinal(ticket.currentStatus);
  return ticket;
}

const attachmentInclude = {
  ticket: { select: { id: true, requesterId: true, currentStatus: true } },
} satisfies Prisma.AttachmentInclude;

/** Loads an attachment using the role-specific visibility predicate. */
async function findVisibleAttachment(userId: number, role: Role, attachmentId: number) {
  const attachment = await getPrisma().attachment.findFirst({
    where: {
      id: attachmentId,
      ...(role === "REQUESTER" ? { ticket: { requesterId: userId } } : {}),
    },
    include: attachmentInclude,
  });

  if (!attachment) {
    throw HttpError.notFound("ATTACHMENT_NOT_FOUND", "The requested attachment does not exist.");
  }

  return attachment;
}

export async function addAttachment(
  requesterId: number,
  ticketId: number,
  file: Express.Multer.File
) {
  try {
    const prisma = getPrisma();
    const created = await prisma.$transaction(async (tx) => {
      await lockOwnedTicket(tx, requesterId, ticketId);

      // Payload validation follows the locked ownership/finality check. A
      // concurrent finalization therefore cannot be hidden by an invalid file
      // payload, and all losers still clean their staged file in the caller.
      if (!isPermittedFile(file.originalname, file.mimetype)) {
        throw new HttpError(
          415,
          "UNSUPPORTED_FILE_TYPE",
          "Only JPG, JPEG, PNG, WEBP and PDF files are accepted."
        );
      }

      const activeCount = await tx.attachment.count({
        where: { ticketId, removedAt: null },
      });

      if (activeCount >= MAX_ACTIVE_ATTACHMENTS) {
        throw HttpError.conflict(
          "ATTACHMENT_LIMIT_REACHED",
          `A ticket may have at most ${MAX_ACTIVE_ATTACHMENTS} active attachments.`
        );
      }

      return tx.attachment.create({
        data: {
          ticketId,
          originalFilename: file.originalname,
          storedFilename: file.filename,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          uploadedByRequesterId: requesterId,
        },
      });
    });

    return serializeAttachment(created);
  } catch (error) {
    // The file reached disk before this handler ran, so every rejection here
    // must remove it before the safe error reaches the client.
    await deleteFileIfPresent(storedFilePath(file.filename));
    throw error;
  }
}

export async function getAttachmentMetadata(userId: number, role: Role, attachmentId: number) {
  const attachment = await findVisibleAttachment(userId, role, attachmentId);
  return serializeAttachment(attachment);
}

export async function getDownloadableAttachment(userId: number, role: Role, attachmentId: number) {
  const attachment = await findVisibleAttachment(userId, role, attachmentId);

  if (attachment.removedAt !== null) {
    throw HttpError.gone(
      "ATTACHMENT_REMOVED",
      "This attachment was removed and can no longer be downloaded."
    );
  }

  return {
    absolutePath: storedFilePath(attachment.storedFilename),
    originalFilename: attachment.originalFilename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
  };
}

export async function removeAttachment(
  requesterId: number,
  attachmentId: number,
  rawBody: unknown
) {
  return getPrisma().$transaction(async (tx) => {
    const attachment = await lockOwnedAttachment(tx, requesterId, attachmentId);

    // Final and already-removed state checks intentionally precede body
    // validation, as required by the shared mutation precedence contract.
    if (attachment.removedAt !== null) {
      throw HttpError.conflict("ALREADY_REMOVED", "This attachment has already been removed.");
    }

    const { removalReason } = removeAttachmentSchema.parse(rawBody);
    const updated = await tx.attachment.update({
      where: { id: attachmentId },
      data: {
        removedAt: new Date(),
        removedByRequesterId: requesterId,
        removalReason,
      },
    });

    return serializeAttachment(updated);
  });
}
