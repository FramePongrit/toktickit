import type { TicketStatus } from "@prisma/client";

export const TICKET_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  NEW: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["OPEN", "IN_PROGRESS", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  CLOSED: [],
  CANCELLED: [],
};

export type ResolutionGateReason =
  | "NO_COMPLETED_ACTION"
  | "UNFINISHED_ACTIONS"
  | "FOLLOW_UP_REQUIRED"
  | "OWNER_REQUIRED";

export interface ResolutionGate {
  canResolve: boolean;
  reasons: ResolutionGateReason[];
  completedCount: number;
  unfinishedCount: number;
  followUpCount: number;
}

export function resolutionGate(
  counts: Pick<ResolutionGate, "completedCount" | "unfinishedCount" | "followUpCount">,
  ownerIsEligible: boolean
): ResolutionGate {
  const reasons: ResolutionGateReason[] = [];
  if (counts.completedCount === 0) reasons.push("NO_COMPLETED_ACTION");
  if (counts.unfinishedCount > 0) reasons.push("UNFINISHED_ACTIONS");
  if (counts.followUpCount > 0) reasons.push("FOLLOW_UP_REQUIRED");
  if (!ownerIsEligible) reasons.push("OWNER_REQUIRED");
  return { ...counts, canResolve: reasons.length === 0, reasons };
}

export function allowedTicketTransitions(
  status: TicketStatus,
  ownerIsEligible: boolean,
  gate: ResolutionGate
): TicketStatus[] {
  if (!ownerIsEligible) return [];
  return TICKET_TRANSITIONS[status].filter((next) => next !== "RESOLVED" || gate.canResolve);
}
