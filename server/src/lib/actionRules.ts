import type { ActionStatus, TicketStatus } from "@prisma/client";

export const ACTION_TRANSITIONS: Record<ActionStatus, readonly ActionStatus[]> = {
  PLANNED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const ACTION_WRITABLE_TICKET_STATUSES = new Set<TicketStatus>([
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "REOPENED",
]);

export function allowedActionTransitions(
  status: ActionStatus,
  assigneeEligible: boolean,
  writable: boolean
): ActionStatus[] {
  if (!writable) return [];
  return ACTION_TRANSITIONS[status].filter(
    (destination) => destination === "CANCELLED" || assigneeEligible
  );
}

export function actionDateIsWithinTicket(ticketCreatedAt: Date, actionAt: Date, now: Date): boolean {
  return actionAt.getTime() >= ticketCreatedAt.getTime() && actionAt.getTime() <= now.getTime();
}
