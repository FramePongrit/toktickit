import { describe, expect, it } from "vitest";
import { allowedTicketTransitions, resolutionGate, TICKET_TRANSITIONS } from "../../src/lib/ticketRules.js";
import { staffStatusMutationSchema } from "../../src/lib/validation.js";

describe("UNIT-02 — Ticket workflow rules", () => {
  it("keeps the documented matrix and terminal states", () => {
    expect(TICKET_TRANSITIONS).toEqual({
      NEW: ["OPEN", "CANCELLED"],
      OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "CANCELLED"],
      IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
      WAITING_FOR_REQUESTER: ["OPEN", "IN_PROGRESS", "CANCELLED"],
      RESOLVED: ["CLOSED", "REOPENED"],
      REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
      CLOSED: [],
      CANCELLED: [],
    });
    expect(allowedTicketTransitions("CLOSED", true, resolutionGate({ completedCount: 1, unfinishedCount: 0, followUpCount: 0 }, true))).toEqual([]);
    expect(allowedTicketTransitions("NEW", false, resolutionGate({ completedCount: 1, unfinishedCount: 0, followUpCount: 0 }, false))).toEqual([]);
  });

  it("requires completed evidence and no current-cycle unfinished or follow-up Actions", () => {
    const counts = { completedCount: 1, unfinishedCount: 0, followUpCount: 0 };
    expect(resolutionGate(counts, true)).toEqual({ ...counts, canResolve: true, reasons: [] });
    expect(resolutionGate({ completedCount: 0, unfinishedCount: 0, followUpCount: 0 }, true).reasons).toEqual(["NO_COMPLETED_ACTION"]);
    expect(resolutionGate({ completedCount: 1, unfinishedCount: 1, followUpCount: 0 }, true).reasons).toEqual(["UNFINISHED_ACTIONS"]);
    expect(resolutionGate({ completedCount: 1, unfinishedCount: 0, followUpCount: 1 }, true).reasons).toEqual(["FOLLOW_UP_REQUIRED"]);
    expect(resolutionGate({ completedCount: 0, unfinishedCount: 1, followUpCount: 1 }, false).reasons).toEqual([
      "NO_COMPLETED_ACTION", "UNFINISHED_ACTIONS", "FOLLOW_UP_REQUIRED", "OWNER_REQUIRED",
    ]);
    const blocked = resolutionGate({ completedCount: 1, unfinishedCount: 0, followUpCount: 1 }, true);
    expect(allowedTicketTransitions("IN_PROGRESS", true, blocked)).toEqual(["WAITING_FOR_REQUESTER", "CANCELLED"]);
  });

  it("requires a cancellation reason only for Cancelled and keeps Waiting comments scoped", () => {
    const base = { expectedTicketVersion: 1 };
    expect(staffStatusMutationSchema.safeParse({ ...base, status: "CANCELLED" }).success).toBe(false);
    expect(staffStatusMutationSchema.parse({ ...base, status: "CANCELLED", cancelReason: "  Duplicate  " }).cancelReason).toBe("Duplicate");
    expect(staffStatusMutationSchema.safeParse({ ...base, status: "OPEN", cancelReason: "No longer needed" }).success).toBe(false);
    expect(staffStatusMutationSchema.safeParse({ ...base, status: "WAITING_FOR_REQUESTER", publicComment: "Please confirm" }).success).toBe(true);
    expect(staffStatusMutationSchema.safeParse({ ...base, status: "OPEN", publicComment: "Internal" }).success).toBe(false);
  });
});
