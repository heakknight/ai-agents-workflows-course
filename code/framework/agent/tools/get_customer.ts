import { defineTool } from "eve/tools";
import { z } from "zod";
import { getCustomer } from "../lib/fake_store.js";

const inputSchema = z
  .object({
    email: z
      .string()
      .min(3)
      .max(320)
      .describe("Exact customer email address.")
      .optional(),
    userId: z
      .union([z.number().int().positive(), z.string().min(1).max(30)])
      .describe("Exact Lumenpath user ID. Numeric strings are accepted.")
      .optional(),
  })
  .refine((input) => Boolean(input.email) || Boolean(input.userId), {
    message: "Provide email, userId, or both. If both are supplied, userId is used.",
  });

const purchaseSchema = z.object({
  transactionId: z.string(),
  productId: z.string(),
  productName: z.string(),
  amountCents: z.number(),
  currency: z.literal("USD"),
  purchasedAt: z.string(),
  type: z.enum(["one_time", "subscription_initial", "subscription_renewal"]),
  status: z.enum(["paid", "refunded", "partially_refunded", "chargeback"]),
  refundedAmountCents: z.number().optional(),
  refundId: z.string().optional(),
});

const enrollmentSchema = z.object({
  courseId: z.string(),
  courseName: z.string(),
  progressPercent: z.number(),
  enrolledAt: z.string(),
});

const outputSchema = z.discriminatedUnion("found", [
  z.object({
    found: z.literal(true),
    lookup: z.object({
      email: z.string().optional(),
      userId: z.number().optional(),
    }),
    customer: z.object({
      userId: z.number(),
      email: z.string(),
      name: z.string(),
      createdAt: z.string(),
      abuseFlags: z.array(z.string()),
      purchases: z.array(purchaseSchema),
      enrollments: z.array(enrollmentSchema),
    }),
  }),
  z.object({
    found: z.literal(false),
    code: z.literal("customer_not_found"),
    lookup: z.object({
      email: z.string().optional(),
      userId: z.number().optional(),
    }),
  }),
]);

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseUserId(value: number | string): number {
  if (typeof value === "number") return value;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== value.trim()) {
    throw new Error("Provide a valid positive numeric Lumenpath user ID.");
  }
  return parsed;
}

export default defineTool({
  description:
    "Look up one Lumenpath customer by exact email or user ID and return a bounded support dossier: profile, purchases, enrollments/progress, refund/chargeback status, and abuse flags. Not a broad search tool.",
  inputSchema,
  outputSchema,
  async execute(input) {
    const lookup =
      input.userId !== undefined
        ? { userId: parseUserId(input.userId), email: input.email }
        : { email: input.email };

    if (lookup.userId === undefined && lookup.email) {
      if (!looksLikeEmail(lookup.email)) {
        throw new Error("Provide a valid exact email address.");
      }
    }

    if (lookup.userId === undefined && !lookup.email) {
      throw new Error("Provide email, userId, or both.");
    }

    const result = getCustomer(lookup);
    if (!result.found) {
      return {
        found: false as const,
        code: "customer_not_found" as const,
        lookup: result.lookup,
      };
    }

    return {
      found: true as const,
      lookup: {
        userId: result.customer.userId,
        email: result.customer.email,
      },
      customer: result.customer,
    };
  },
});
