import { Prisma } from "@prisma/client";
import type { Prisma as PrismaTypes } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { ACTIVE_TICKET_STATUSES, ALL_TICKET_STATUSES, RESOLVED_TICKET_STATUSES, dashboardWindow, hrefForActiveRequesterTickets, hrefWithResolvedWindow, hrefWithWindow, ticketPrioritiesWhere, ticketResolvedAtRangeWhere, ticketStatusesWhere, ticketUpdatedAtRangeWhere } from "../lib/dashboardRules.js";
import type { StaffActionsQuery } from "../lib/validation.js";

const requesterTicketSelect = {
  id: true,
  ticketNumber: true,
  summary: true,
  currentStatus: true,
  itPriority: true,
  updatedAt: true,
  resolvedAt: true,
} satisfies PrismaTypes.TicketSelect;

const staffTicketSelect = {
  id: true,
  ticketNumber: true,
  summary: true,
  requestedPriority: true,
  itPriority: true,
  currentStatus: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  requester: { select: { id: true, fullName: true } },
  owner: { select: { id: true, fullName: true } },
} satisfies PrismaTypes.TicketSelect;

const staffActionSelect = {
  id: true,
  ticketId: true,
  workCycle: true,
  description: true,
  status: true,
  assignee: { select: { id: true, fullName: true } },
  performedBy: { select: { id: true, fullName: true } },
  completedAt: true,
  ticket: { select: { ticketNumber: true, currentStatus: true, workCycle: true } },
} satisfies PrismaTypes.ActionTakenSelect;

let dashboardClock = () => new Date();

export function setDashboardClockForTest(clock: (() => Date) | undefined): void {
  dashboardClock = clock ?? (() => new Date());
}

type StaffActionRow = PrismaTypes.ActionTakenGetPayload<{ select: typeof staffActionSelect }>;

function serializeStaffAction(action: StaffActionRow) {
  return {
    id: action.id,
    ticketId: action.ticketId,
    ticketNumber: action.ticket.ticketNumber,
    description: action.description,
    status: action.status,
    workCycle: action.workCycle,
    assignee: action.assignee,
    performedBy: action.performedBy,
    completedAt: action.completedAt,
    ticket: {
      currentStatus: action.ticket.currentStatus,
      workCycle: action.ticket.workCycle,
    },
  };
}

export async function getRequesterDashboard(requesterId: number) {
  const asOf = dashboardClock();
  const window = dashboardWindow(asOf);
  const from = new Date(window.from);
  const requester = { requesterId };
  const active = ticketStatusesWhere(ACTIVE_TICKET_STATUSES);
  const updatedWhere = { requesterId, ...ticketUpdatedAtRangeWhere(from, asOf) };
  const resolvedWhere = {
    requesterId,
    ...ticketStatusesWhere(RESOLVED_TICKET_STATUSES),
    ...ticketResolvedAtRangeWhere(from, asOf),
  };

  const data = await getPrisma().$transaction(async (tx) => {
    const [openTickets, waitingForMe, recentlyUpdated, recentlyResolved, recentUpdatedRows, recentResolvedRows] = await Promise.all([
      tx.ticket.count({ where: { ...requester, ...active } }),
      tx.ticket.count({ where: { ...requester, currentStatus: "WAITING_FOR_REQUESTER" } }),
      tx.ticket.count({ where: updatedWhere }),
      tx.ticket.count({ where: resolvedWhere }),
      tx.ticket.findMany({ where: updatedWhere, select: requesterTicketSelect, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 5 }),
      tx.ticket.findMany({ where: resolvedWhere, select: requesterTicketSelect, orderBy: [{ resolvedAt: "desc" }, { id: "desc" }], take: 5 }),
    ]);
    return { openTickets, waitingForMe, recentlyUpdated, recentlyResolved, recentUpdatedRows, recentResolvedRows };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  const { recentUpdatedRows, recentResolvedRows, ...counts } = data;
  const updatedHref = hrefWithWindow("/tickets", window.from, window.through);
  const resolvedHref = hrefWithResolvedWindow(window.from, window.through);
  return {
    generatedAt: asOf.toISOString(),
    window,
    metrics: {
      openTickets: { value: counts.openTickets, unit: "tickets", href: hrefForActiveRequesterTickets() },
      waitingForMe: { value: counts.waitingForMe, unit: "tickets", href: "/tickets?status=WAITING_FOR_REQUESTER" },
      recentlyUpdated: { value: counts.recentlyUpdated, unit: "tickets", href: updatedHref },
      recentlyResolved: { value: counts.recentlyResolved, unit: "tickets", href: resolvedHref },
    },
    previews: {
      recentUpdated: { data: recentUpdatedRows, href: updatedHref },
      recentResolved: { data: recentResolvedRows, href: resolvedHref },
    },
  };
}

function activeAssignedActionPredicate(userId: number) {
  const activeStatuses = Prisma.join(ACTIVE_TICKET_STATUSES.map((status) => Prisma.sql`${status}::"TicketStatus"`));
  return Prisma.sql`
    a."assigneeId" = ${userId}
    AND a."status" IN ('PLANNED'::"ActionStatus", 'IN_PROGRESS'::"ActionStatus")
    AND a."workCycle" = t."workCycle"
    AND t."currentStatus" IN (${activeStatuses})
`;
}

function activeActionCountQuery(userId: number) {
  return Prisma.sql`
    SELECT COUNT(*)::int AS "count"
    FROM "ActionTaken" a
    JOIN "Ticket" t ON t."id" = a."ticketId"
    WHERE ${activeAssignedActionPredicate(userId)}
  `;
}

export async function getStaffDashboard(userId: number) {
  const asOf = dashboardClock();
  const window = dashboardWindow(asOf);
  const from = new Date(window.from);
  const active = ticketStatusesWhere(ACTIVE_TICKET_STATUSES);
  const performedWhere = { performedById: userId, status: "COMPLETED" as const, completedAt: { gte: from, lte: asOf } };

  const data = await getPrisma().$transaction(async (tx) => {
    const [unassignedTickets, myActiveTickets, highUrgentTickets, actionCountRows, statusGroups, priorityRecentTickets, myCompletedActions] = await Promise.all([
      tx.ticket.count({ where: { ...active, ownerId: null } }),
      tx.ticket.count({ where: { ...active, ownerId: userId } }),
      tx.ticket.count({ where: { AND: [active, ticketPrioritiesWhere(["HIGH", "URGENT"])] } }),
      tx.$queryRaw<{ count: number }[]>(activeActionCountQuery(userId)),
      tx.ticket.groupBy({ by: ["currentStatus"], _count: { _all: true } }),
      tx.ticket.findMany({ where: active, select: staffTicketSelect, orderBy: [{ itPriority: "desc" }, { updatedAt: "desc" }, { id: "desc" }], take: 5 }),
      tx.actionTaken.findMany({ where: performedWhere, select: staffActionSelect, orderBy: [{ completedAt: "desc" }, { id: "desc" }], take: 5 }),
    ]);
    const statusCounts = Object.fromEntries(ALL_TICKET_STATUSES.map((status) => [status, 0])) as Record<(typeof ALL_TICKET_STATUSES)[number], number>;
    for (const group of statusGroups) statusCounts[group.currentStatus] = group._count._all;
    return { unassignedTickets, myActiveTickets, highUrgentTickets, myActiveActions: actionCountRows[0]?.count ?? 0, statusCounts, priorityRecentTickets, myCompletedActions };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  const statusCounts = Object.fromEntries(ALL_TICKET_STATUSES.map((status) => [status, {
    value: data.statusCounts[status],
    unit: "tickets",
    href: `/staff/tickets?scope=all&status=${status}`,
  }])) as Record<(typeof ALL_TICKET_STATUSES)[number], { value: number; unit: string; href: string }>;
  const completedHref = `/staff/dashboard?actions=completed-performed&from=${encodeURIComponent(window.from)}&through=${encodeURIComponent(window.through)}`;
  return {
    generatedAt: asOf.toISOString(),
    window,
    metrics: {
      unassignedTickets: { value: data.unassignedTickets, unit: "tickets", href: "/staff/tickets?scope=active&owner=unassigned" },
      myActiveTickets: { value: data.myActiveTickets, unit: "tickets", href: "/staff/tickets?scope=active&owner=me" },
      myActiveActions: { value: data.myActiveActions, unit: "actions", href: "/staff/dashboard?actions=active-assigned" },
      highUrgentTickets: { value: data.highUrgentTickets, unit: "tickets", href: "/staff/tickets?scope=active&itPriorities=HIGH%2CURGENT" },
    },
    statusCounts,
    previews: {
      priorityRecentTickets: {
        data: data.priorityRecentTickets,
        href: "/staff/tickets?scope=active&sort=priorityRecent",
      },
      myCompletedActions: {
        data: data.myCompletedActions.map(serializeStaffAction),
        href: completedHref,
      },
    },
  };
}

export async function listStaffDashboardActions(userId: number, query: StaffActionsQuery) {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const skip = (query.page - 1) * query.pageSize;
    if (query.view === "active-assigned") {
      const sql = Prisma.sql`
        SELECT a."id"
        FROM "ActionTaken" a
        JOIN "Ticket" t ON t."id" = a."ticketId"
        WHERE ${activeAssignedActionPredicate(userId)}
        ORDER BY a."createdAt" ASC, a."id" ASC
        LIMIT ${query.pageSize} OFFSET ${skip}
      `;
      const [counts, ids] = await Promise.all([
        tx.$queryRaw<{ count: number }[]>(activeActionCountQuery(userId)),
        tx.$queryRaw<{ id: number }[]>(sql),
      ]);
      const rows = ids.length ? await tx.actionTaken.findMany({
        where: { id: { in: ids.map((row) => row.id) } },
        select: staffActionSelect,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }) : [];
      return pageOf(rows.map(serializeStaffAction), query.page, query.pageSize, counts[0]?.count ?? 0);
    }

    const where = {
      performedById: userId,
      status: "COMPLETED" as const,
      completedAt: { gte: query.from!, lte: query.through! },
    };
    const [rows, total] = await Promise.all([
      tx.actionTaken.findMany({ where, select: staffActionSelect, orderBy: [{ completedAt: "desc" }, { id: "desc" }], skip, take: query.pageSize }),
      tx.actionTaken.count({ where }),
    ]);
    return pageOf(rows.map(serializeStaffAction), query.page, query.pageSize, total);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

function pageOf<T>(data: T[], page: number, pageSize: number, total: number) {
  return { data, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
