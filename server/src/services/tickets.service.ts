import type { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { HttpError, type FieldIssue } from "../lib/httpError.js";
import { allocateTicketNumber } from "./ticketNumber.service.js";
import type { CreateTicketInput } from "../lib/validation.js";

/** The relations every ticket-detail response includes. */
const detailInclude = {
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
  requester: { select: { id: true, fullName: true, email: true, department: true } },
  attachments: { orderBy: { uploadedAt: "asc" } },
} satisfies Prisma.TicketInclude;

type TicketWithDetail = Prisma.TicketGetPayload<{ include: typeof detailInclude }>;

export function serializeAttachment(attachment: TicketWithDetail["attachments"][number]) {
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

export function serializeTicketDetail(ticket: TicketWithDetail) {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    summary: ticket.summary,
    description: ticket.description,
    requestedPriority: ticket.requestedPriority,
    currentStatus: ticket.currentStatus,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    category: ticket.category,
    relatedSystem: ticket.relatedSystem,
    requester: ticket.requester,
    attachments: ticket.attachments.map(serializeAttachment),
  };
}

/**
 * An unknown or inactive reference id is a field-level validation failure, not
 * a missing resource: the fault is in a value the form submitted, so it belongs
 * with the other messages the form renders below its fields (BR-23, D-09).
 */
async function assertReferenceDataIsUsable(input: CreateTicketInput): Promise<void> {
  const prisma = getPrisma();
  const [category, relatedSystem] = await Promise.all([
    prisma.category.findFirst({ where: { id: input.categoryId, active: true }, select: { id: true } }),
    prisma.relatedSystem.findFirst({
      where: { id: input.relatedSystemId, active: true },
      select: { id: true },
    }),
  ]);

  const details: FieldIssue[] = [];
  if (!category) {
    details.push({ field: "categoryId", message: "Select a valid category." });
  }
  if (!relatedSystem) {
    details.push({ field: "relatedSystemId", message: "Select a valid related system." });
  }

  if (details.length > 0) {
    throw HttpError.validationFailed("The submitted data is invalid.", details);
  }
}

export async function createTicket(requesterId: number, input: CreateTicketInput) {
  await assertReferenceDataIsUsable(input);

  const prisma = getPrisma();

  // Allocation and insert share one transaction so the counter is never
  // advanced for a ticket that fails to save.
  const created = await prisma.$transaction(async (tx) => {
    const ticketNumber = await allocateTicketNumber(tx, new Date().getFullYear());

    return tx.ticket.create({
      data: {
        ticketNumber,
        requesterId,
        categoryId: input.categoryId,
        relatedSystemId: input.relatedSystemId,
        requestedPriority: input.requestedPriority,
        summary: input.summary,
        description: input.description,
        // currentStatus defaults to NEW in the schema (BR-02).
      },
      include: detailInclude,
    });
  });

  return serializeTicketDetail(created);
}
