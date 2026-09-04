import { getPrisma } from "../prisma.js";
import { HttpError } from "../lib/httpError.js";
import { deleteFileIfPresent, storedFilePath } from "../lib/paths.js";
import { MAX_ACTIVE_ATTACHMENTS } from "../middleware/upload.js";
import { serializeAttachment } from "./tickets.service.js";

/**
 * Resolves a ticket the caller owns, or refuses. Used before an upload so that
 * no file is written for a ticket that is not the caller's.
 *
 * Like ticket detail, a ticket owned by someone else is reported as not found
 * rather than forbidden, so ids cannot be enumerated (BR-13).
 */
export async function assertTicketIsOwned(requesterId: number, ticketId: number): Promise<void> {
  const ticket = await getPrisma().ticket.findFirst({
    where: { id: ticketId, requesterId },
    select: { id: true },
  });

  if (!ticket) {
    throw HttpError.notFound("TICKET_NOT_FOUND", "The requested ticket does not exist.");
  }
}

/** Loads an attachment only if the caller owns its parent ticket. */
async function findOwnedAttachment(requesterId: number, attachmentId: number) {
  const attachment = await getPrisma().attachment.findFirst({
    where: { id: attachmentId, ticket: { requesterId } },
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
  const prisma = getPrisma();

  try {
    // Counting and inserting share a transaction. "At most five active" is a
    // count, not a uniqueness property, so no database constraint expresses it
    // — it is an application-level invariant (BR-31).
    const created = await prisma.$transaction(async (tx) => {
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
    // The file reached disk before this handler ran, so a rejection here would
    // otherwise leave it orphaned with no row pointing at it (BR-40).
    await deleteFileIfPresent(storedFilePath(file.filename));
    throw error;
  }
}

export async function getAttachmentMetadata(requesterId: number, attachmentId: number) {
  // Works for removed attachments too: their metadata stays visible, only the
  // content becomes unreachable.
  return serializeAttachment(await findOwnedAttachment(requesterId, attachmentId));
}

export async function getDownloadableAttachment(requesterId: number, attachmentId: number) {
  const attachment = await findOwnedAttachment(requesterId, attachmentId);

  if (attachment.removedAt !== null) {
    // 410 rather than 404 here: the caller owns this attachment and already
    // knows it exists from the ticket detail response, so nothing leaks, and a
    // precise status lets the client say why (api-spec §3).
    throw HttpError.gone("ATTACHMENT_REMOVED", "This attachment was removed and can no longer be downloaded.");
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
  removalReason: string
) {
  const attachment = await findOwnedAttachment(requesterId, attachmentId);

  if (attachment.removedAt !== null) {
    // A silently idempotent 200 would hide a double submission from the caller
    // and from the tests (BR-35).
    throw HttpError.conflict("ALREADY_REMOVED", "This attachment has already been removed.");
  }

  // Soft removal: the row stays and the bytes stay on disk. Only access is
  // revoked (BR-32).
  const updated = await getPrisma().attachment.update({
    where: { id: attachmentId },
    data: {
      removedAt: new Date(),
      removedByRequesterId: requesterId,
      removalReason,
    },
  });

  return serializeAttachment(updated);
}
