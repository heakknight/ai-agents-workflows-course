import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { issueRefund } from "../lib/fake_store.js";

const inputSchema = z.object({
  userId: z.number().int().positive().describe("Exact Lumenpath user ID."),
  transactionId: z
    .string()
    .min(1)
    .max(80)
    .describe("Exact purchase transaction ID to refund."),
  amountCents: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Optional partial refund amount in cents. Omit to refund the full remaining balance.",
    ),
  reason: z
    .string()
    .min(3)
    .max(500)
    .describe("Short internal reason for the refund decision."),
});

const outputSchema = z.object({
  status: z.literal("success"),
  refundId: z.string(),
  userId: z.number(),
  transactionId: z.string(),
  amountCents: z.number(),
  currency: z.literal("USD"),
  remainingPaidCents: z.number(),
  purchaseStatus: z.enum(["paid", "refunded", "partially_refunded", "chargeback"]),
  diagnostics: z.array(z.string()),
});

export default defineTool({
  description:
    "Issue a full or partial refund against a verified Lumenpath purchase. Verify the customer and transaction with get_customer first. This customer-impacting action always requires human approval before execution.",
  inputSchema,
  outputSchema,
  approval: always(),
  async execute(input) {
    const result = issueRefund(input);
    return {
      ...result,
      diagnostics: [
        "Refund recorded in the customer system.",
        "Call get_customer again if post-refund confirmation is needed.",
      ],
    };
  },
});
