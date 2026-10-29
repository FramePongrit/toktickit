import { request } from "../lib/http.js";
import type { PagedResult, Role, TicketStatus, TicketOwnerOption } from "../types/index.js";

export type ActionStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type ActionTransition = Extract<ActionStatus, "IN_PROGRESS" | "COMPLETED" | "CANCELLED">;

export interface ActionPerson {
  id: number;
  fullName: string;
}

export interface TicketAction {
  id: number;
  ticketId: number;
  workCycle: number;
  status: ActionStatus;
  description: string;
  result: string | null;
  actionAt: string;
  assignee: ActionPerson;
  assigneeEligible?: boolean;
  createdBy: ActionPerson;
  performedBy: ActionPerson | null;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  version?: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: ActionPerson | null;
  cancelReason: string | null;
  permissions?: { canEdit: boolean; allowedTransitions: ActionTransition[] };
}

export interface ActionPage extends PagedResult<TicketAction> {
  ticketVersion?: number;
  workCycle?: number;
}

export type ActionSnapshot = Record<string, unknown> | null;

export interface ActionRevision {
  id: number;
  actionId: number;
  sequence: number;
  operation: "CREATE" | "EDIT" | "TRANSITION" | "TICKET_CANCEL";
  actor: ActionPerson;
  occurredAt: string;
  reason: string | null;
  before: ActionSnapshot;
  after: ActionSnapshot;
}

export interface PublicWorkflowEvent {
  id: number;
  kind: "CREATED" | "TRANSITION" | "BASELINE";
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  workCycle: number;
  actor: ActionPerson | null;
  occurredAt: string;
  reason: string | null;
  publicCommentId: number | null;
  label?: string;
}

export interface ActionWriteResult {
  action: TicketAction;
  ticketVersion: number;
}

export interface ActionInput {
  expectedTicketVersion: number;
  description: string;
  actionAt?: string;
  assigneeId: number;
  result?: string;
  followUpRequired: boolean;
  followUpNote?: string;
  attachmentNotes?: string;
}

export interface ActionPatchInput {
  expectedTicketVersion: number;
  expectedActionVersion: number;
  description?: string;
  actionAt?: string;
  assigneeId?: number;
  result?: string;
  followUpRequired?: boolean;
  followUpNote?: string;
  attachmentNotes?: string;
  correctionReason?: string;
}

export type ActionTransitionInput =
  | { expectedTicketVersion: number; expectedActionVersion: number; status: "IN_PROGRESS" }
  | {
      expectedTicketVersion: number;
      expectedActionVersion: number;
      status: "COMPLETED";
      result?: string;
      actionAt?: string;
      followUpRequired?: boolean;
      followUpNote?: string;
    }
  | { expectedTicketVersion: number; expectedActionVersion: number; status: "CANCELLED"; cancelReason: string };

function queryPath(path: string, page: number, pageSize: number): string {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return `${path}?${query.toString()}`;
}

export function fetchStaffActions(ticketId: number, page: number, pageSize: number): Promise<ActionPage> {
  return request<ActionPage>(queryPath(`/api/staff/tickets/${ticketId}/actions`, page, pageSize));
}

export function fetchRequesterActions(ticketId: number, page: number, pageSize: number): Promise<ActionPage> {
  return request<ActionPage>(queryPath(`/api/tickets/${ticketId}/actions`, page, pageSize));
}

export function fetchStaffAction(ticketId: number, actionId: number): Promise<{ action: TicketAction; ticketVersion: number }> {
  return request(`/api/staff/tickets/${ticketId}/actions/${actionId}`);
}

export function fetchStaffActionHistory(ticketId: number, actionId: number, page: number, pageSize: number): Promise<PagedResult<ActionRevision>> {
  return request(queryPath(`/api/staff/tickets/${ticketId}/actions/${actionId}/history`, page, pageSize));
}

export function fetchStaffWorkflow(ticketId: number, page: number, pageSize: number): Promise<PagedResult<PublicWorkflowEvent>> {
  return request(queryPath(`/api/staff/tickets/${ticketId}/workflow`, page, pageSize));
}

export function fetchRequesterWorkflow(ticketId: number, page: number, pageSize: number): Promise<PagedResult<PublicWorkflowEvent>> {
  return request(queryPath(`/api/tickets/${ticketId}/workflow`, page, pageSize));
}

export function createStaffAction(ticketId: number, input: ActionInput, key: string): Promise<ActionWriteResult> {
  return request(`/api/staff/tickets/${ticketId}/actions`, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(input),
  });
}

export function patchStaffAction(ticketId: number, actionId: number, input: ActionPatchInput): Promise<ActionWriteResult> {
  return request(`/api/staff/tickets/${ticketId}/actions/${actionId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function transitionStaffAction(ticketId: number, actionId: number, input: ActionTransitionInput, key: string): Promise<ActionWriteResult> {
  return request(`/api/staff/tickets/${ticketId}/actions/${actionId}/transitions`, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(input),
  });
}

export function fetchEligibleActionOwners(): Promise<TicketOwnerOption[]> {
  return request<{ data: TicketOwnerOption[] }>("/api/staff/ticket-owners").then((response) => response.data);
}

export type ActionViewerRole = Extract<Role, "STAFF" | "ADMIN" | "REQUESTER">;
