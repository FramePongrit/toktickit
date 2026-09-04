import { z } from "zod";

const positiveInt = (label: string) =>
  z.number({ error: `${label} is required.` }).int(`${label} must be a whole number.`).positive(`${label} is required.`);

/**
 * Bounds are justified in specification.md D-08: the lower bounds reject
 * placeholder input such as "help", 200 keeps a summary readable in one list
 * column, and 5000 accommodates a pasted log excerpt without unbounded payloads.
 *
 * Trimming happens before length checks, so "     " fails the minimum rather
 * than passing as five characters (BR-21).
 *
 * ticketNumber, currentStatus and requesterId are deliberately absent: they are
 * system-generated, and unknown keys are stripped rather than rejected, so a
 * client that sends them is ignored rather than errored (BR-04).
 */
export const createTicketSchema = z.object({
  categoryId: positiveInt("Category"),
  relatedSystemId: positiveInt("Related System"),
  requestedPriority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"], {
    error: "Requested Priority must be one of LOW, MEDIUM, HIGH or URGENT.",
  }),
  summary: z
    .string({ error: "Summary is required." })
    .trim()
    .min(5, "Summary must be at least 5 characters.")
    .max(200, "Summary must be at most 200 characters."),
  description: z
    .string({ error: "Description is required." })
    .trim()
    .min(10, "Description must be at least 10 characters.")
    .max(5000, "Description must be at most 5000 characters."),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

/** Path parameters arrive as strings; this both validates and converts. */
export const idParamSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/, "The identifier must be a positive whole number.")
    .transform(Number),
});

export const TICKET_SORT_FIELDS = [
  "createdAt",
  "ticketNumber",
  "requestedPriority",
  "summary",
] as const;

export const TICKET_PAGE_SIZES = [10, 20, 50] as const;

/** An absent query parameter is the default; an empty string is treated as absent. */
const optionalParam = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? undefined : v), schema.optional());

const numericParam = (label: string) =>
  z
    .string()
    .regex(/^[1-9]\d*$/, `${label} must be a positive whole number.`)
    .transform(Number);

/**
 * Invalid parameters are rejected rather than clamped. Silent correction cannot
 * be asserted by a test, so `pageSize=7` is a 400 rather than quietly becoming
 * 10 (BR-20).
 *
 * There is deliberately no `requesterId` parameter: ownership comes from the
 * identity middleware alone, which is the whole point of enforcing it in the
 * backend (BR-16).
 */
export const listTicketsQuerySchema = z.object({
  page: optionalParam(numericParam("Page")).transform((v) => v ?? 1),
  pageSize: optionalParam(
    z
      .string()
      .transform(Number)
      .refine(
        (n) => (TICKET_PAGE_SIZES as readonly number[]).includes(n),
        `Page size must be one of ${TICKET_PAGE_SIZES.join(", ")}.`
      )
  ).transform((v) => v ?? 10),
  q: optionalParam(z.string().max(100, "Search text must be at most 100 characters.")),
  categoryId: optionalParam(numericParam("Category")),
  relatedSystemId: optionalParam(numericParam("Related System")),
  priority: optionalParam(
    z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"], {
      error: "Priority must be one of LOW, MEDIUM, HIGH or URGENT.",
    })
  ),
  sort: optionalParam(
    z.enum(TICKET_SORT_FIELDS, {
      error: `Sort must be one of ${TICKET_SORT_FIELDS.join(", ")}.`,
    })
  ).transform((v) => v ?? "createdAt"),
  order: optionalParam(
    z.enum(["asc", "desc"], { error: "Order must be asc or desc." })
  ).transform((v) => v ?? "desc"),
});

export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
