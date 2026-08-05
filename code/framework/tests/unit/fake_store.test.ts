import { afterEach, describe, expect, it } from "vitest";
import {
  findCustomers,
  getCustomer,
  issueRefund,
  resetFakeStore,
} from "../../agent/lib/fake_store.js";

afterEach(() => {
  resetFakeStore();
});

describe("findCustomers", () => {
  it("returns multiple candidates for ambiguous names", () => {
    const result = findCustomers("Alex");
    expect(result.matches.length).toBeGreaterThanOrEqual(2);
    expect(result.matches.every((match) => match.name.includes("Alex"))).toBe(true);
  });

  it("matches exact email", () => {
    const result = findCustomers("maya.chen@example.com");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.userId).toBe(1001);
    expect(result.matches[0]?.matchType).toBe("exact_email");
  });
});

describe("getCustomer", () => {
  it("returns a dossier by email", () => {
    const result = getCustomer({ email: "jordan.lee@example.com" });
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.customer.enrollments[0]?.progressPercent).toBe(55);
  });

  it("returns not found for unknown ids", () => {
    const result = getCustomer({ userId: 999999 });
    expect(result).toEqual({
      found: false,
      code: "customer_not_found",
      lookup: { userId: 999999 },
    });
  });
});

describe("issueRefund", () => {
  it("issues a full refund and updates purchase status", () => {
    const refund = issueRefund({
      userId: 1001,
      transactionId: "txn_1001_a",
      reason: "Within policy window, low progress",
    });
    expect(refund.status).toBe("success");
    expect(refund.amountCents).toBe(14900);
    expect(refund.purchaseStatus).toBe("refunded");

    const customer = getCustomer({ userId: 1001 });
    expect(customer.found).toBe(true);
    if (!customer.found) return;
    expect(customer.customer.purchases[0]?.status).toBe("refunded");
  });

  it("supports partial refunds", () => {
    const refund = issueRefund({
      userId: 1002,
      transactionId: "txn_1002_a",
      amountCents: 8950,
      reason: "Mid-progress goodwill partial",
    });
    expect(refund.purchaseStatus).toBe("partially_refunded");
    expect(refund.remainingPaidCents).toBe(8950);
  });

  it("rejects refunds on chargebacks", () => {
    expect(() =>
      issueRefund({
        userId: 1007,
        transactionId: "txn_1007_cb",
        reason: "Should fail",
      }),
    ).toThrow(/chargeback/i);
  });
});
