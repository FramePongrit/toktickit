import type { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { HttpError } from "../lib/httpError.js";
import { actionListQuerySchema } from "../lib/validation.js";

const workflowEventInclude = {
  actor: { select: { id: true, fullName: true } },
} satisfies Prisma.TicketWorkflowEventInclude;

type WorkflowEvent = Prisma.TicketWorkflowEventGetPayload<{ include: typeof workflowEventInclude }>;

function serializeWorkflowEvent(event: WorkflowEvent) {
  return {
    id: event.id,
    kind: event.kind,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    workCycle: event.workCycle,
    actor: event.actor,
    occurredAt: event.occurredAt,
    reason: event.reason,
    publicCommentId: event.publicCommentId,
    ...(event.kind === "BASELINE" && {
      label: "Lab 4 migration snapshot; original transition time unknown",
    }),
  };
}

async function pageTicketWorkflow(ticketId: number, rawQuery: unknown) {
  const query = actionListQuerySchema.parse(rawQuery);
  const where = { ticketId };
  const prisma = getPrisma();
  const [rows, total] = await prisma.$transaction([
    prisma.ticketWorkflowEvent.findMany({
      where,
      include: workflowEventInclude,
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.ticketWorkflowEvent.count({ where }),
  ]);
  return {
    data: rows.map(serializeWorkflowEvent),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
}

export async function listStaffTicketWorkflow(ticketId: number, rawQuery: unknown) {
  const ticket = await getPrisma().ticket.findUnique({ where: { id: ticketId }, select: { id: true } });
  if (!ticket) throw HttpError.notFound("TICKET_NOT_FOUND", "The requested ticket does not exist.");
  return pageTicketWorkflow(ticketId, rawQuery);
}

export async function listRequesterTicketWorkflow(requesterId: number, ticketId: number, rawQuery: unknown) {
  const ticket = await getPrisma().ticket.findFirst({
    where: { id: ticketId, requesterId },
    select: { id: true },
  });
  if (!ticket) throw HttpError.notFound("TICKET_NOT_FOUND", "The requested ticket does not exist.");
  return pageTicketWorkflow(ticketId, rawQuery);
}
