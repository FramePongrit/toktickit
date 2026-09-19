import { request } from "../lib/http.js";
import type {
  PagedResult,
  Priority,
  PublicComment,
  ResolutionIndication,
  TicketDetail,
  TicketListItem,
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
