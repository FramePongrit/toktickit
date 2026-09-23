import { request } from "../lib/http.js";
import type {
  PagedResult,
  Priority,
  PublicComment,
  ResolutionIndication,
  StaffQueueItem,
  TicketOwnerOption,
  TicketDetail,
  TicketListItem,
  InternalNote,
  TicketStatus,
} from "../types/index.js";

// Named exports on their own module so tests can spy on them directly; never
// re-exported through src/api.ts (vi.spyOn cannot redefine a re-exported
// ESM binding).

export interface CreateTicketPayload {
  categoryId: number;
  relatedSystemId: number;
  requestedPriority: Priority;
  summary: string;
  description: string;
}

export function createTicket(payload: CreateTicketPayload): Promise<TicketDetail> {
  return request<TicketDetail>("/api/tickets", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchTicket(id: number): Promise<TicketDetail> {
  return request<TicketDetail>(`/api/tickets/${id}`);
}

export function fetchStaffTicket(id: number): Promise<TicketDetail> {
  return request<TicketDetail>(`/api/staff/tickets/${id}`);
}

export function claimStaffTicket(id: number): Promise<{ owner: TicketOwnerOption }> {
  return request<{ owner: TicketOwnerOption }>(`/api/staff/tickets/${id}/claim`, { method: "PATCH" });
}

export function reassignStaffTicket(
  id: number,
  ownerId: number,
  expectedOwnerId: number
): Promise<{ owner: TicketOwnerOption }> {
  return request<{ owner: TicketOwnerOption }>(`/api/staff/tickets/${id}/owner`, {
    method: "PATCH",
    body: JSON.stringify({ ownerId, expectedOwnerId }),
  });
}

export function updateStaffItPriority(
  id: number,
  itPriority: Priority
): Promise<{ itPriority: Priority }> {
  return request<{ itPriority: Priority }>(`/api/staff/tickets/${id}/it-priority`, {
    method: "PATCH",
    body: JSON.stringify({ itPriority }),
  });
}

export function updateStaffTicketStatus(
  id: number,
  status: TicketStatus,
  publicComment?: string
): Promise<Pick<TicketDetail, "currentStatus" | "resolutionIndication" | "allowedTransitions">> {
  return request<Pick<TicketDetail, "currentStatus" | "resolutionIndication" | "allowedTransitions">>(
    `/api/staff/tickets/${id}/status`,
    { method: "PATCH", body: JSON.stringify({ status, ...(publicComment === undefined ? {} : { publicComment }) }) }
  );
}

export function postStaffPublicComment(id: number, body: string): Promise<PublicComment> {
  return postPublicComment(id, body);
}

export function postInternalNote(id: number, body: string): Promise<InternalNote> {
  return request<InternalNote>(`/api/staff/tickets/${id}/notes`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function fetchPublicComments(id: number): Promise<PublicComment[]> {
  return request<{ data: PublicComment[] }>(`/api/tickets/${id}/comments`).then(
    (response) => response.data
  );
}

export function postPublicComment(id: number, body: string): Promise<PublicComment> {
  return request<PublicComment>(`/api/tickets/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function indicateResolution(id: number): Promise<ResolutionIndication> {
  return request<{ resolutionIndication: ResolutionIndication }>(
    `/api/tickets/${id}/resolution-indication`,
    { method: "PUT", body: JSON.stringify({}) }
  ).then((response) => response.resolutionIndication);
}

export type TicketSortField = "createdAt" | "ticketNumber" | "requestedPriority" | "summary";

export interface TicketQuery {
  page: number;
  pageSize: number;
  q?: string;
  categoryId?: number;
  relatedSystemId?: number;
  priority?: Priority;
  sort: TicketSortField;
  order: "asc" | "desc";
}

export type StaffQueueScope = "active" | "all";
export type StaffQueueSortField = "itPriority" | "createdAt" | "updatedAt" | "ticketNumber" | "status";
export type SortOrder = "asc" | "desc";

export interface StaffQueueQuery {
  scope: StaffQueueScope;
  page: number;
  pageSize: 10 | 20 | 50;
  q?: string;
  status?: import("../types/index.js").TicketStatus;
  itPriority?: Priority;
  categoryId?: number;
  owner?: "me" | "unassigned" | number;
  sort: StaffQueueSortField;
  order: SortOrder;
}

export interface StaffQueueResult {
  data: StaffQueueItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function fetchMyTickets(query: TicketQuery): Promise<PagedResult<TicketListItem>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    // Empty values are omitted rather than sent blank: the server rejects
    // malformed parameters instead of ignoring them.
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  return request<PagedResult<TicketListItem>>(`/api/tickets?${params.toString()}`);
}

export function fetchStaffQueue(query: StaffQueueQuery): Promise<StaffQueueResult> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return request<StaffQueueResult>(`/api/staff/tickets?${params.toString()}`);
}

export function fetchTicketOwners(): Promise<TicketOwnerOption[]> {
  return request<{ data: TicketOwnerOption[] }>("/api/staff/ticket-owners").then((response) => response.data);
}
