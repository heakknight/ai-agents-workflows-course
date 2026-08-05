import { defineTool } from "eve/tools";
import { z } from "zod";
import { findCustomers } from "../lib/fake_store.js";

const inputSchema = z.object({
  query: z
    .string()
    .min(2)
    .max(120)
    .describe("Customer name, partial name, full email, or email fragment."),
  maxResults: z.number().int().min(1).max(25).optional(),
});

const outputSchema = z.object({
  query: z.string(),
  matches: z.array(
    z.object({
      userId: z.number(),
      name: z.string(),
      email: z.string(),
      matchType: z.enum(["exact_email", "partial_email", "exact_name", "partial_name"]),
    }),
  ),
  truncated: z.boolean(),
  diagnostics: z.array(z.string()),
});

export default defineTool({
  description:
    "Find possible Lumenpath customers by name, partial name, full email, or email fragment. Returns bounded candidate IDs/emails only. Not authoritative for refunds or final account-specific decisions — confirm with get_customer first.",
  inputSchema,
  outputSchema,
  async execute(input) {
    const result = findCustomers(input.query, input.maxResults);
    return {
      ...result,
      diagnostics:
        result.matches.length === 0
          ? ["No candidates matched the query."]
          : result.truncated
            ? ["Result set truncated; ask the operator to narrow the identifier."]
            : ["Candidate search completed."],
    };
  },
});
