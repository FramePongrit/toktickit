import { describe, expect, it } from "vitest";
import {
  ACTION_TRANSITIONS,
  ACTION_WRITABLE_TICKET_STATUSES,
  actionDateIsWithinTicket,
  allowedActionTransitions,
} from "../../src/lib/actionRules.js";
import { actionCreateSchema, actionPatchSchema, actionTransitionSchema } from "../../src/lib/validation.js";

describe("UNIT-01 / UNIT-03 — Action rules", () => {
  it("accepts only the documented edges and leaves terminal Actions without outgoing transitions", () => {
    expect(ACTION_TRANSITIONS).toEqual({
      PLANNED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
      IN_PROGRESS: ["COMPLETED", "CANCELLED"],
      COMPLETED: [],
      CANCELLED: [],
    });
    expect(allowedActionTransitions("PLANNED", false, true)).toEqual(["CANCELLED"]);
    expect(allowedActionTransitions("PLANNED", true, true)).toEqual(["IN_PROGRESS", "COMPLETED", "CANCELLED"]);
    expect(allowedActionTransitions("IN_PROGRESS", true, false)).toEqual([]);
  });

  it("limits Action writes to mutable Ticket states and occurrence times", () => {
    expect([...ACTION_WRITABLE_TICKET_STATUSES]).toEqual([
      "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED",
    ]);
    const createdAt = new Date("2026-10-01T00:00:00.000Z");
    const now = new Date("2026-10-26T00:00:00.000Z");
    expect(actionDateIsWithinTicket(createdAt, createdAt, now)).toBe(true);
    expect(actionDateIsWithinTicket(createdAt, now, now)).toBe(true);
    expect(actionDateIsWithinTicket(createdAt, new Date("2026-09-30T23:59:59.999Z"), now)).toBe(false);
    expect(actionDateIsWithinTicket(createdAt, new Date("2026-10-26T00:00:00.001Z"), now)).toBe(false);
  });

  it("normalizes optional text, enforces field boundaries, and rejects forged terminal fields", () => {
    const normalized = actionCreateSchema.parse({
      expectedTicketVersion: 1,
      description: "  Inspect  ",
      followUpNote: "   ",
      attachmentNotes: "",
    });
    expect(normalized).toMatchObject({ description: "Inspect", followUpRequired: false, followUpNote: null, attachmentNotes: null });
    expect(actionCreateSchema.safeParse({ expectedTicketVersion: 1, description: "x".repeat(2000) }).success).toBe(true);
    expect(actionCreateSchema.safeParse({ expectedTicketVersion: 1, description: "x".repeat(2001) }).success).toBe(false);
    const maxText = "x".repeat(2000);
    const overText = "x".repeat(2001);
    const maxAttachmentNotes = "x".repeat(1000);
    const overAttachmentNotes = "x".repeat(1001);
    expect(actionCreateSchema.safeParse({ expectedTicketVersion: 1, description: "Inspect", result: maxText, followUpRequired: true, followUpNote: maxText, attachmentNotes: maxAttachmentNotes }).success).toBe(true);
    expect(actionCreateSchema.safeParse({ expectedTicketVersion: 1, description: "Inspect", result: overText }).success).toBe(false);
    expect(actionCreateSchema.safeParse({ expectedTicketVersion: 1, description: "Inspect", followUpNote: overText }).success).toBe(false);
    expect(actionCreateSchema.safeParse({ expectedTicketVersion: 1, description: "Inspect", attachmentNotes: overAttachmentNotes }).success).toBe(false);
    const patchBase = { expectedTicketVersion: 1, expectedActionVersion: 1, description: "Corrected" };
    expect(actionPatchSchema.safeParse({ ...patchBase, correctionReason: maxAttachmentNotes }).success).toBe(true);
    expect(actionPatchSchema.safeParse({ ...patchBase, correctionReason: overAttachmentNotes }).success).toBe(false);
    expect(actionPatchSchema.safeParse({ ...patchBase, attachmentNotes: maxAttachmentNotes }).success).toBe(true);
    expect(actionPatchSchema.safeParse({ ...patchBase, attachmentNotes: overAttachmentNotes }).success).toBe(false);
    expect(actionPatchSchema.safeParse({ ...patchBase, result: maxText }).success).toBe(true);
    expect(actionPatchSchema.safeParse({ ...patchBase, result: overText }).success).toBe(false);
    expect(actionPatchSchema.safeParse({ ...patchBase, followUpNote: maxText }).success).toBe(true);
    expect(actionPatchSchema.safeParse({ ...patchBase, followUpNote: overText }).success).toBe(false);
    expect(actionTransitionSchema.safeParse({ expectedTicketVersion: 1, expectedActionVersion: 1, status: "COMPLETED", result: maxText, followUpNote: maxText }).success).toBe(true);
    expect(actionTransitionSchema.safeParse({ expectedTicketVersion: 1, expectedActionVersion: 1, status: "COMPLETED", result: overText }).success).toBe(false);
    expect(actionTransitionSchema.safeParse({ expectedTicketVersion: 1, expectedActionVersion: 1, status: "COMPLETED", followUpNote: overText }).success).toBe(false);
    expect(actionCreateSchema.safeParse({
      expectedTicketVersion: 1,
      description: "Inspect",
      actionAt: "2026-10-26T10:00:00.000",
    }).success).toBe(false);
    expect(actionPatchSchema.safeParse({ expectedTicketVersion: 1, expectedActionVersion: 1 }).success).toBe(false);
    expect(actionPatchSchema.safeParse({
      expectedTicketVersion: 1,
      expectedActionVersion: 1,
      description: "Correction",
      performedById: 99,
    }).success).toBe(false);
    expect(actionTransitionSchema.safeParse({ expectedTicketVersion: 1, expectedActionVersion: 1, status: "CANCELLED" }).success).toBe(false);
    expect(actionTransitionSchema.safeParse({
      expectedTicketVersion: 1,
      expectedActionVersion: 1,
      status: "CANCELLED",
      cancelReason: maxAttachmentNotes,
    }).success).toBe(true);
    expect(actionTransitionSchema.safeParse({
      expectedTicketVersion: 1,
      expectedActionVersion: 1,
      status: "CANCELLED",
      cancelReason: `x${"x".repeat(1000)}`,
    }).success).toBe(false);
  });
});
