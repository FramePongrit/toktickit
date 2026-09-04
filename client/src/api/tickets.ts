import { request } from "../lib/http.js";
import type { Priority, TicketDetail } from "../types/index.js";

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
