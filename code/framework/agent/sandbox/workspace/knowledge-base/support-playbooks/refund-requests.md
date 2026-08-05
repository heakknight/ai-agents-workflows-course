# Refund Requests Playbook

## Standard flow

1. Identify the exact account email or user ID.
2. Call `get_customer` when an exact identifier is available.
3. Read `policies/support-policies.md`.
4. Verify purchase date, request date, initial purchase vs renewal, course progress, transaction status, prior refunds/chargebacks, and abuse flags.
5. Choose one direction:
   - process full refund;
   - process partial refund;
   - deny refund with reason;
   - verify more internal data first.
6. If issuing a refund, call `issue_refund` with the exact `userId`, `transactionId`, optional `amountCents`, and an internal reason. Wait for approval and success before confirming to the customer.
7. Draft customer-facing text only when the decision is ready, the refund tool succeeded, or the operator explicitly asks for a holding reply.

## Decision guide

- Within 30 days, <= 40% completed, no abuse indicators: full refund when customer asks.
- Within 30 days and progress > 40% but < 70%: consider/process partial refund depending on context and goodwill.
- Progress >= 70%: deny unless the operator provides an exceptional decision.
- Subscription renewal outside the original purchase window: generally deny and explain cancellation/renewal policy.
- Purchase older than 30 days with no verified earlier request: deny as outside the refund window.
- Repeat refund pattern, prior chargeback, or other abuse flags: recommend denial/restriction.
- Missing purchase/progress/request-date data: not ready; ask the operator for internal verification.

## Partial refund guidance

- Prefer a clear percentage or dollar amount tied to progress and goodwill.
- Common starting point for mid-progress cases: 50% of the paid amount, adjusted by operator judgment.
- Always pass `amountCents` explicitly for partial refunds.

## Processed refund replies

Only draft a confirmation that a refund was issued if `issue_refund` returned success or the operator explicitly states it was already processed.
