# Billing and Access Playbook

## Missing course access

1. Confirm the exact account email/user ID with `get_customer`.
2. Check whether the related purchase is paid and not fully refunded/chargebacked.
3. Check whether an enrollment exists for the expected course.
4. If purchase exists but enrollment is missing, recommend manual access restoration by the operator.
5. If no matching purchase exists, ask the operator for a receipt or alternate email before drafting a denial.

## Subscription access

1. Distinguish `subscription_initial` from `subscription_renewal` purchases.
2. Active Pro access depends on a recent successful subscription charge and no full refund on the current period.
3. Cancellation stops future renewals; it does not automatically refund the current period.
4. Renewal refund requests outside the original purchase window are generally denied.

## Duplicate charges

1. Compare transaction IDs, timestamps, amounts, and product IDs.
2. If two successful charges are true duplicates, recommend refunding the duplicate transaction.
3. Do not refund both charges unless the operator explicitly directs a full cancellation.

## Receipts

- Point customers to billing history in their Lumenpath account when possible.
- If the operator can resend a receipt internally, draft a short confirmation after they say it was sent.
