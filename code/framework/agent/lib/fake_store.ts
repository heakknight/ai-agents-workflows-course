import type {
  Customer,
  CustomerMatch,
  PurchaseStatus,
  RefundResult,
} from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function cloneCustomer(customer: Customer): Customer {
  return structuredClone(customer);
}

/**
 * In-memory demo CRM for Lumenpath support.
 * Seeded with a small fixed roster so refund policy branches are exercisable.
 */
function seedCustomers(): Customer[] {
  return [
    {
      userId: 1001,
      email: "maya.chen@example.com",
      name: "Maya Chen",
      createdAt: daysAgoIso(120),
      abuseFlags: [],
      purchases: [
        {
          transactionId: "txn_1001_a",
          productId: "course_react_fundamentals",
          productName: "React Fundamentals",
          amountCents: 14900,
          currency: "USD",
          purchasedAt: daysAgoIso(5),
          type: "one_time",
          status: "paid",
        },
      ],
      enrollments: [
        {
          courseId: "course_react_fundamentals",
          courseName: "React Fundamentals",
          progressPercent: 12,
          enrolledAt: daysAgoIso(5),
        },
      ],
    },
    {
      userId: 1002,
      email: "jordan.lee@example.com",
      name: "Jordan Lee",
      createdAt: daysAgoIso(200),
      abuseFlags: [],
      purchases: [
        {
          transactionId: "txn_1002_a",
          productId: "course_node_api",
          productName: "Node API Engineering",
          amountCents: 17900,
          currency: "USD",
          purchasedAt: daysAgoIso(18),
          type: "one_time",
          status: "paid",
        },
      ],
      enrollments: [
        {
          courseId: "course_node_api",
          courseName: "Node API Engineering",
          progressPercent: 55,
          enrolledAt: daysAgoIso(18),
        },
      ],
    },
    {
      userId: 1003,
      email: "sam.okonkwo@example.com",
      name: "Sam Okonkwo",
      createdAt: daysAgoIso(90),
      abuseFlags: [],
      purchases: [
        {
          transactionId: "txn_1003_a",
          productId: "course_design_systems",
          productName: "Design Systems in Practice",
          amountCents: 12900,
          currency: "USD",
          purchasedAt: daysAgoIso(12),
          type: "one_time",
          status: "paid",
        },
      ],
      enrollments: [
        {
          courseId: "course_design_systems",
          courseName: "Design Systems in Practice",
          progressPercent: 82,
          enrolledAt: daysAgoIso(12),
        },
      ],
    },
    {
      userId: 1004,
      email: "priya.nair@example.com",
      name: "Priya Nair",
      createdAt: daysAgoIso(400),
      abuseFlags: [],
      purchases: [
        {
          transactionId: "txn_1004_initial",
          productId: "sub_pro_monthly",
          productName: "Lumenpath Pro Monthly",
          amountCents: 3900,
          currency: "USD",
          purchasedAt: daysAgoIso(95),
          type: "subscription_initial",
          status: "paid",
        },
        {
          transactionId: "txn_1004_renewal",
          productId: "sub_pro_monthly",
          productName: "Lumenpath Pro Monthly",
          amountCents: 3900,
          currency: "USD",
          purchasedAt: daysAgoIso(8),
          type: "subscription_renewal",
          status: "paid",
        },
      ],
      enrollments: [
        {
          courseId: "course_react_fundamentals",
          courseName: "React Fundamentals",
          progressPercent: 30,
          enrolledAt: daysAgoIso(90),
        },
        {
          courseId: "course_node_api",
          courseName: "Node API Engineering",
          progressPercent: 10,
          enrolledAt: daysAgoIso(40),
        },
      ],
    },
    {
      userId: 1005,
      email: "alex.rivera@example.com",
      name: "Alex Rivera",
      createdAt: daysAgoIso(60),
      abuseFlags: [],
      purchases: [
        {
          transactionId: "txn_1005_a",
          productId: "course_typescript_pro",
          productName: "TypeScript for Professionals",
          amountCents: 15900,
          currency: "USD",
          purchasedAt: daysAgoIso(9),
          type: "one_time",
          status: "paid",
        },
      ],
      enrollments: [
        {
          courseId: "course_typescript_pro",
          courseName: "TypeScript for Professionals",
          progressPercent: 22,
          enrolledAt: daysAgoIso(9),
        },
      ],
    },
    {
      userId: 1006,
      email: "alex.kim@example.com",
      name: "Alex Kim",
      createdAt: daysAgoIso(45),
      abuseFlags: [],
      purchases: [
        {
          transactionId: "txn_1006_a",
          productId: "course_react_fundamentals",
          productName: "React Fundamentals",
          amountCents: 14900,
          currency: "USD",
          purchasedAt: daysAgoIso(3),
          type: "one_time",
          status: "paid",
        },
      ],
      enrollments: [
        {
          courseId: "course_react_fundamentals",
          courseName: "React Fundamentals",
          progressPercent: 8,
          enrolledAt: daysAgoIso(3),
        },
      ],
    },
    {
      userId: 1007,
      email: "chris.patel@example.com",
      name: "Chris Patel",
      createdAt: daysAgoIso(300),
      abuseFlags: ["repeat_refund_pattern", "prior_chargeback"],
      purchases: [
        {
          transactionId: "txn_1007_old",
          productId: "course_react_fundamentals",
          productName: "React Fundamentals",
          amountCents: 14900,
          currency: "USD",
          purchasedAt: daysAgoIso(80),
          type: "one_time",
          status: "refunded",
          refundedAmountCents: 14900,
          refundId: "rfnd_1007_old",
        },
        {
          transactionId: "txn_1007_cb",
          productId: "course_node_api",
          productName: "Node API Engineering",
          amountCents: 17900,
          currency: "USD",
          purchasedAt: daysAgoIso(50),
          type: "one_time",
          status: "chargeback",
        },
        {
          transactionId: "txn_1007_new",
          productId: "course_design_systems",
          productName: "Design Systems in Practice",
          amountCents: 12900,
          currency: "USD",
          purchasedAt: daysAgoIso(6),
          type: "one_time",
          status: "paid",
        },
      ],
      enrollments: [
        {
          courseId: "course_design_systems",
          courseName: "Design Systems in Practice",
          progressPercent: 15,
          enrolledAt: daysAgoIso(6),
        },
      ],
    },
    {
      userId: 1008,
      email: "riley.brooks@example.com",
      name: "Riley Brooks",
      createdAt: daysAgoIso(150),
      abuseFlags: [],
      purchases: [
        {
          transactionId: "txn_1008_a",
          productId: "course_typescript_pro",
          productName: "TypeScript for Professionals",
          amountCents: 15900,
          currency: "USD",
          purchasedAt: daysAgoIso(45),
          type: "one_time",
          status: "paid",
        },
      ],
      enrollments: [
        {
          courseId: "course_typescript_pro",
          courseName: "TypeScript for Professionals",
          progressPercent: 5,
          enrolledAt: daysAgoIso(45),
        },
      ],
    },
  ];
}

let customers: Customer[] = seedCustomers();
let refundSeq = 1;

export function resetFakeStore(): void {
  customers = seedCustomers();
  refundSeq = 1;
}

export function listCustomers(): Customer[] {
  return customers.map(cloneCustomer);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function findCustomers(
  query: string,
  maxResults = 10,
): { query: string; matches: CustomerMatch[]; truncated: boolean } {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length < 2) {
    return { query, matches: [], truncated: false };
  }

  const matches: CustomerMatch[] = [];
  for (const customer of customers) {
    const email = normalize(customer.email);
    const name = normalize(customer.name);

    let matchType: CustomerMatch["matchType"] | null = null;
    if (email === normalizedQuery) matchType = "exact_email";
    else if (email.includes(normalizedQuery)) matchType = "partial_email";
    else if (name === normalizedQuery) matchType = "exact_name";
    else if (name.includes(normalizedQuery)) matchType = "partial_name";

    if (matchType) {
      matches.push({
        userId: customer.userId,
        name: customer.name,
        email: customer.email,
        matchType,
      });
    }
  }

  const rank: Record<CustomerMatch["matchType"], number> = {
    exact_email: 0,
    exact_name: 1,
    partial_email: 2,
    partial_name: 3,
  };
  matches.sort((a, b) => rank[a.matchType] - rank[b.matchType] || a.userId - b.userId);

  const limited = matches.slice(0, maxResults);
  return {
    query,
    matches: limited,
    truncated: matches.length > limited.length,
  };
}

export function getCustomer(input: {
  email?: string;
  userId?: number;
}):
  | { found: true; customer: Customer }
  | { found: false; code: "customer_not_found"; lookup: { email?: string; userId?: number } } {
  if (input.userId !== undefined) {
    const customer = customers.find((entry) => entry.userId === input.userId);
    if (!customer) {
      return {
        found: false,
        code: "customer_not_found",
        lookup: { userId: input.userId, email: input.email },
      };
    }
    return { found: true, customer: cloneCustomer(customer) };
  }

  if (input.email) {
    const email = normalize(input.email);
    const customer = customers.find((entry) => normalize(entry.email) === email);
    if (!customer) {
      return {
        found: false,
        code: "customer_not_found",
        lookup: { email: input.email },
      };
    }
    return { found: true, customer: cloneCustomer(customer) };
  }

  throw new Error("Provide email, userId, or both.");
}

export function issueRefund(input: {
  userId: number;
  transactionId: string;
  amountCents?: number;
  reason: string;
}): RefundResult {
  const customer = customers.find((entry) => entry.userId === input.userId);
  if (!customer) {
    throw new Error(`No customer found for userId ${input.userId}.`);
  }

  const purchase = customer.purchases.find(
    (entry) => entry.transactionId === input.transactionId,
  );
  if (!purchase) {
    throw new Error(
      `No purchase ${input.transactionId} found for userId ${input.userId}.`,
    );
  }

  if (purchase.status === "chargeback") {
    throw new Error("Cannot refund a transaction that already has a chargeback.");
  }
  if (purchase.status === "refunded") {
    throw new Error("Transaction is already fully refunded.");
  }

  const alreadyRefunded = purchase.refundedAmountCents ?? 0;
  const remaining = purchase.amountCents - alreadyRefunded;
  if (remaining <= 0) {
    throw new Error("No refundable balance remains on this transaction.");
  }

  const amountCents = input.amountCents ?? remaining;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("amountCents must be a positive integer.");
  }
  if (amountCents > remaining) {
    throw new Error(
      `amountCents ${amountCents} exceeds remaining refundable balance ${remaining}.`,
    );
  }

  const nextRefunded = alreadyRefunded + amountCents;
  const nextStatus: PurchaseStatus =
    nextRefunded >= purchase.amountCents ? "refunded" : "partially_refunded";
  const refundId = `rfnd_${String(refundSeq++).padStart(4, "0")}`;

  purchase.refundedAmountCents = nextRefunded;
  purchase.status = nextStatus;
  purchase.refundId = refundId;

  // Reason is accepted for operator audit trails; demo store does not persist notes.
  void input.reason;

  return {
    status: "success",
    refundId,
    userId: customer.userId,
    transactionId: purchase.transactionId,
    amountCents,
    currency: "USD",
    remainingPaidCents: purchase.amountCents - nextRefunded,
    purchaseStatus: nextStatus,
  };
}
