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

/** A reason is required so the removal is explainable to whoever reads it later (BR-34). */
export const removeAttachmentSchema = z.object({
  removalReason: z
    .string({ error: "A removal reason is required." })
    .trim()
    .min(3, "The removal reason must be at least 3 characters.")
    .max(200, "The removal reason must be at most 200 characters."),
});

/**
 * Communication bodies are deliberately plain strings. The API stores and
 * returns the literal value; consumers must render it as text rather than
 * interpreting it as HTML. Trimming is part of validation so whitespace-only
 * messages cannot become append-only records.
 */
export const communicationBodySchema = z.object({
  body: z
    .string({ error: "Message body is required." })
    .trim()
    .min(1, "Message body must not be blank.")
    .max(2000, "Message body must be at most 2,000 characters."),
});

export type CommunicationBodyInput = z.infer<typeof communicationBodySchema>;

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

export const TICKET_STATUSES = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "REOPENED",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
] as const;

export const STAFF_QUEUE_SORT_FIELDS = [
  "itPriority",
  "createdAt",
  "updatedAt",
  "ticketNumber",
  "status",
] as const;

const trimmedOptionalParam = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (value === undefined || value === "") return undefined;
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed === "" ? undefined : trimmed;
    }
    return value;
  }, schema.optional());

const suppliedTrimmedOptionalParam = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    schema.optional()
  );

const staffQueueOwner = z
  .string()
  .refine(
    (value) => value === "me" || value === "unassigned" || /^[1-9]\d*$/.test(value),
    "Owner must be me, unassigned, or a positive whole number."
  );

/** Exact query contract for the Staff Queue. Values are rejected, never clamped. */
export const staffQueueQuerySchema = z
  .object({
    scope: trimmedOptionalParam(z.enum(["active", "all"], {
      error: "Scope must be active or all.",
    })),
    // An omitted q means no search. Once q is supplied, trimming it to an
    // empty string is still invalid rather than silently changing the query.
    q: suppliedTrimmedOptionalParam(
      z
        .string()
        .min(1, "Search text must not be blank.")
        .max(100, "Search text must be at most 100 characters.")
    ),
    status: trimmedOptionalParam(z.enum(TICKET_STATUSES, {
      error: `Status must be one of ${TICKET_STATUSES.join(", ")}.`,
    })),
    itPriority: trimmedOptionalParam(z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"], {
      error: "IT Priority must be one of LOW, MEDIUM, HIGH or URGENT.",
    })),
    categoryId: trimmedOptionalParam(numericParam("Category")),
    owner: trimmedOptionalParam(staffQueueOwner),
    sort: trimmedOptionalParam(z.enum(STAFF_QUEUE_SORT_FIELDS, {
      error: `Sort must be one of ${STAFF_QUEUE_SORT_FIELDS.join(", ")}.`,
    })),
    order: trimmedOptionalParam(z.enum(["asc", "desc"], {
      error: "Order must be asc or desc.",
    })),
    page: trimmedOptionalParam(numericParam("Page")),
    pageSize: trimmedOptionalParam(
      z
        .string()
        .transform(Number)
        .refine(
          (value) => (TICKET_PAGE_SIZES as readonly number[]).includes(value),
          `Page size must be one of ${TICKET_PAGE_SIZES.join(", ")}.`
        )
    ),
  })
  .strict()
  .transform((query) => {
    const sort = query.sort ?? "itPriority";
    return {
      ...query,
      scope: query.scope ?? "active",
      sort,
      order: query.order ?? (sort === "itPriority" ? "desc" : "asc"),
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 10,
    };
  });

export type StaffQueueQuery = z.infer<typeof staffQueueQuerySchema>;

const ticketStatus = z.enum(TICKET_STATUSES, {
  error: `Status must be one of ${TICKET_STATUSES.join(", ")}.`,
});

const positiveIntegerBody = (label: string) =>
  z.number({ error: `${label} is required.` }).int(`${label} must be a whole number.`).positive(`${label} is required.`);

export const staffOwnerMutationSchema = z
  .object({
    ownerId: positiveIntegerBody("Owner"),
    expectedOwnerId: positiveIntegerBody("Expected Owner"),
  })
  .strict()
  .refine((value) => value.ownerId !== value.expectedOwnerId, {
    path: ["ownerId"],
    message: "Owner and Expected Owner must be different.",
  });

export type StaffOwnerMutationInput = z.infer<typeof staffOwnerMutationSchema>;

export const staffPriorityMutationSchema = z
  .object({
    itPriority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"], {
      error: "IT Priority must be one of LOW, MEDIUM, HIGH or URGENT.",
    }),
  })
  .strict();

export type StaffPriorityMutationInput = z.infer<typeof staffPriorityMutationSchema>;

export const staffStatusMutationSchema = z
  .object({
    status: ticketStatus,
    publicComment: z.string().optional(),
  })
  .strict();

export type StaffStatusMutationInput = z.infer<typeof staffStatusMutationSchema>;
