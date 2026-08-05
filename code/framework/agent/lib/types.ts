export type PurchaseType = "one_time" | "subscription_initial" | "subscription_renewal";

export type PurchaseStatus = "paid" | "refunded" | "partially_refunded" | "chargeback";

export interface Purchase {
  transactionId: string;
  productId: string;
  productName: string;
  amountCents: number;
  currency: "USD";
  purchasedAt: string;
  type: PurchaseType;
  status: PurchaseStatus;
  refundedAmountCents?: number;
  refundId?: string;
}

export interface Enrollment {
  courseId: string;
  courseName: string;
  progressPercent: number;
  enrolledAt: string;
}

export interface Customer {
  userId: number;
  email: string;
  name: string;
  createdAt: string;
  purchases: Purchase[];
  enrollments: Enrollment[];
  abuseFlags: string[];
}

export interface CustomerMatch {
  userId: number;
  name: string;
  email: string;
  matchType: "exact_email" | "partial_email" | "exact_name" | "partial_name";
}

export interface RefundResult {
  status: "success";
  refundId: string;
  userId: number;
  transactionId: string;
  amountCents: number;
  currency: "USD";
  remainingPaidCents: number;
  purchaseStatus: PurchaseStatus;
}
