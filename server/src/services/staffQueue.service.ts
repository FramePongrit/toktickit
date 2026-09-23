import type { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { HttpError } from "../lib/httpError.js";
import type { StaffQueueQuery } from "../lib/validation.js";
import { serializeResolutionIndication } from "./communications.service.js";

const ACTIVE_STATUSES = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] as const;
const ELIGIBLE_OWNER_ROLES = ["STAFF", "ADMIN"] as const;

const queueSelect = {
  id: true,
  ticketNumber: true,
  summary: true,
  requestedPriority: true,
  itPriority: true,
  currentStatus: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  requester: { select: { id: true, fullName: true, email: true } },
  owner: { select: { id: true, fullName: true, role: true } },
  resolutionIndicatedAt: true,
  resolutionIndicatedBy: { select: { id: true, fullName: true, role: true } },
} satisfies Prisma.TicketSelect;

type QueueTicket = Prisma.TicketGetPayload<{ select: typeof queueSelect }>;

export function serializeQueueTicket(ticket: QueueTicket) {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    summary: ticket.summary,
    requestedPriority: ticket.requestedPriority,
    itPriority: ticket.itPriority,
    currentStatus: ticket.currentStatus,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    category: ticket.category,
    requester: ticket.requester,
    owner: ticket.owner,
    resolutionIndication: serializeResolutionIndication(
      ticket.resolutionIndicatedAt,
      ticket.resolutionIndicatedBy
    ),
  };
}

function ownerValidationError(): HttpError {
  return HttpError.validationFailed("The submitted data is invalid.", [
    { field: "owner", message: "Owner must identify an active Staff or Administrator." },
  ]);
}

async function resolveOwnerFilter(owner: StaffQueueQuery["owner"], currentUserId: number) {
  if (!owner || owner === "unassigned") return owner;
  if (owner === "me") return currentUserId;

  const ownerId = Number(owner);
  const eligible = await getPrisma().user.findFirst({
    where: { id: ownerId, active: true, role: { in: [...ELIGIBLE_OWNER_ROLES] } },
    select: { id: true },
  });
  if (!eligible) throw ownerValidationError();
  return ownerId;
}

function buildQueueWhere(
  query: StaffQueueQuery,
  resolvedOwner: StaffQueueQuery["owner"] | number | undefined
): Prisma.TicketWhereInput {
  const filters: Prisma.TicketWhereInput[] = [];
  if (query.scope === "active") filters.push({ currentStatus: { in: [...ACTIVE_STATUSES] } });
  if (query.status) filters.push({ currentStatus: query.status });
  if (query.itPriority) filters.push({ itPriority: query.itPriority });
  if (query.categoryId !== undefined) filters.push({ categoryId: query.categoryId });
  if (typeof resolvedOwner === "number") filters.push({ ownerId: resolvedOwner });
  if (resolvedOwner === "unassigned") filters.push({ ownerId: null });
  if (query.q) {
    filters.push({
      OR: [
        { ticketNumber: { contains: query.q, mode: "insensitive" } },
        { summary: { contains: query.q, mode: "insensitive" } },
        { requester: { fullName: { contains: query.q, mode: "insensitive" } } },
        { requester: { email: { contains: query.q, mode: "insensitive" } } },
      ],
    });
  }
  return filters.length === 1 ? filters[0] : { AND: filters };
}

function buildQueueOrder(query: StaffQueueQuery): Prisma.TicketOrderByWithRelationInput[] {
  const primary = query.sort === "status"
    ? { currentStatus: query.order }
    : { [query.sort]: query.order };
  if (query.sort === "itPriority" || query.sort === "status") {
    return [primary, { createdAt: "asc" }, { id: "asc" }];
  }
  return [primary, { id: "asc" }];
}

export async function listEligibleTicketOwners() {
  const users = await getPrisma().user.findMany({
    where: { active: true, role: { in: [...ELIGIBLE_OWNER_ROLES] } },
    select: { id: true, fullName: true, role: true },
    orderBy: [{ fullName: "asc" }, { id: "asc" }],
  });

  // PostgreSQL's default collation is not the contract's case-insensitive order.
  return [...users].sort((left, right) => {
    const byName = left.fullName.toLocaleLowerCase().localeCompare(right.fullName.toLocaleLowerCase());
    return byName || left.id - right.id;
  });
}

export async function listStaffQueue(userId: number, query: StaffQueueQuery) {
  const resolvedOwner = await resolveOwnerFilter(query.owner, userId);
  const where = buildQueueWhere(query, resolvedOwner);
  const [rows, total] = await getPrisma().$transaction([
    getPrisma().ticket.findMany({
      where,
      select: queueSelect,
      orderBy: buildQueueOrder(query),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    getPrisma().ticket.count({ where }),
  ]);

  return {
    data: rows.map(serializeQueueTicket),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
}
