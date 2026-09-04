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
