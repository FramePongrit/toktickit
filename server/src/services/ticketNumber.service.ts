import type { Prisma } from "@prisma/client";

export const TICKET_NUMBER_PATTERN = /^TKT-\d{4}-\d{6}$/;

export function formatTicketNumber(year: number, sequence: number): string {
  return `TKT-${year}-${String(sequence).padStart(6, "0")}`;
}

/**
 * Allocates the next ticket number for `year`, and must be called inside the
 * same transaction that inserts the ticket.
 *
 * The UPDATE ... RETURNING takes a row lock on that year's counter for the rest
 * of the transaction, so concurrent creates serialise on it and each receives a
 * distinct value. That is why this needs no retry loop.
 *
 * MAX(ticketNumber)+1 was rejected because two concurrent readers can observe
 * the same maximum — a real race that passes tests only by luck. A PostgreSQL
 * sequence was rejected because it cannot restart per calendar year without a
 * scheduled job or a sequence per year. See specification.md §7.
 */
export async function allocateTicketNumber(
  tx: Prisma.TransactionClient,
  year: number
): Promise<string> {
  // The counter row is seeded for the current year, but a ticket created in a
  // year that has not been seeded must still work.
  await tx.$executeRaw`
    INSERT INTO "TicketCounter" ("year", "lastValue")
    VALUES (${year}, 0)
    ON CONFLICT ("year") DO NOTHING
  `;

  const rows = await tx.$queryRaw<{ lastValue: number }[]>`
    UPDATE "TicketCounter"
    SET "lastValue" = "lastValue" + 1
    WHERE "year" = ${year}
    RETURNING "lastValue"
  `;

  return formatTicketNumber(year, rows[0].lastValue);
}
