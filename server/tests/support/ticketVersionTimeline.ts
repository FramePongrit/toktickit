import type { PrismaClient } from "@prisma/client";
import { expect } from "vitest";

/** Check Ticket writes chronologically; a parent cancellation increments once even when it appends many child revisions. */
export async function expectTicketVersionTimeline(db: PrismaClient, ticketId: number, requireCreatedEvent = true): Promise<void> {
  const ticket = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  const [events, actions] = await Promise.all([
    db.ticketWorkflowEvent.findMany({ where: { ticketId } }),
    db.actionTaken.findMany({ where: { ticketId }, include: { revisions: true } }),
  ]);
  const created = events.find((event) => event.kind === "CREATED");
  if (requireCreatedEvent) {
    expect(created).toBeDefined();
    expect(created?.ticketVersion).toBe(1);
  } else if (created) {
    expect(created.ticketVersion).toBe(1);
  }
  const operations = [
    ...events.filter((event) => event.kind === "TRANSITION").map((event) => ({
      occurredAt: event.occurredAt,
      ticketEvent: event,
    })),
    ...actions.flatMap((action) => action.revisions
      .filter((revision) => revision.operation !== "TICKET_CANCEL")
      .map((revision) => ({ occurredAt: revision.occurredAt, ticketEvent: null }))),
  ].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());

  let version = 1;
  for (const operation of operations) {
    version += 1;
    if (operation.ticketEvent) expect(operation.ticketEvent.ticketVersion).toBe(version);
  }
  expect(ticket.version).toBe(version);
}
