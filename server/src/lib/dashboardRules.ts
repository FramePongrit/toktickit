import type { Priority, Prisma, TicketStatus } from "@prisma/client";

export const ACTIVE_TICKET_STATUSES = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "REOPENED",
] as const satisfies readonly TicketStatus[];

export const ALL_TICKET_STATUSES = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "REOPENED",
  "CLOSED",
  "CANCELLED",
] as const satisfies readonly TicketStatus[];

export const RESOLVED_TICKET_STATUSES = ["RESOLVED", "CLOSED"] as const satisfies readonly TicketStatus[];

export function ticketStatusesWhere(statuses: readonly TicketStatus[]): Prisma.TicketWhereInput {
  return { currentStatus: { in: [...statuses] } };
}

export function ticketPrioritiesWhere(priorities: readonly Priority[]): Prisma.TicketWhereInput {
  return { itPriority: { in: [...priorities] } };
}

export function ticketUpdatedAtRangeWhere(from?: Date, through?: Date): Prisma.TicketWhereInput {
  return from || through ? { updatedAt: {
    ...(from && { gte: from }),
    ...(through && { lte: through }),
  } } : {};
}

export function ticketResolvedAtRangeWhere(from?: Date, through?: Date): Prisma.TicketWhereInput {
  return from || through ? { resolvedAt: {
    ...(from && { gte: from }),
    ...(through && { lte: through }),
  } } : {};
}

export interface DashboardWindow {
  timeZone: "Asia/Bangkok";
  from: string;
  through: string;
}

/** Seven inclusive Bangkok calendar days ending at the single request snapshot time. */
export function dashboardWindow(asOf: Date): DashboardWindow {
  const bangkok = new Date(asOf.getTime() + 7 * 60 * 60 * 1000);
  const start = Date.UTC(
    bangkok.getUTCFullYear(),
    bangkok.getUTCMonth(),
    bangkok.getUTCDate() - 6,
  ) - 7 * 60 * 60 * 1000;
  return {
    timeZone: "Asia/Bangkok",
    from: new Date(start).toISOString(),
    through: asOf.toISOString(),
  };
}

export function hrefWithWindow(path: string, from: string, through: string): string {
  return `${path}?updatedFrom=${encodeURIComponent(from)}&updatedThrough=${encodeURIComponent(through)}&sort=updatedAt&order=desc`;
}

export function hrefWithResolvedWindow(from: string, through: string): string {
  return `/tickets?statuses=${encodeURIComponent(RESOLVED_TICKET_STATUSES.join(","))}&resolvedFrom=${encodeURIComponent(from)}&resolvedThrough=${encodeURIComponent(through)}&sort=resolvedAt&order=desc`;
}

export function hrefForActiveRequesterTickets(): string {
  return `/tickets?statuses=${encodeURIComponent(ACTIVE_TICKET_STATUSES.join(","))}`;
}
