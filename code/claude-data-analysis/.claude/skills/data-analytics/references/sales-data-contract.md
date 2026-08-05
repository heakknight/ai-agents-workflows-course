# Sales data contract

Read this before calculating metrics from `sales.csv`.

## Dataset grain and fields

Treat each row as one order only after confirming `order_id` is unique. If an order ID repeats, determine whether the file has line-item grain and aggregate to orders before calculating order counts or AOV.

| Role | Fields | Handling |
|---|---|---|
| Identifiers | `order_id`, `customer_id`, `product_id` | Keep as strings. Count distinct IDs when the metric requires entities rather than rows. |
| Time | `order_date`, `order_time` | Parse explicitly. Use `order_date` for period grouping unless the user requests another basis. |
| Dimensions | `region`, `category`, `product_name`, `sales_channel`, `payment_method`, `order_status` | Inspect actual values before filtering. Do not silently normalize unknown categories. |
| Units and money | `quantity`, `unit_price`, `discount_pct`, `discount_amount`, `subtotal`, `tax_rate_pct`, `tax_amount`, `total_amount` | Parse numerically and report malformed values. `total_amount` is the order value after discounts and including tax. |
| Currency | `currency` | Confirm the currency set before summing. Do not combine currencies without an explicit conversion rule. |
| Attribution | `sales_rep` | Measure missingness before rep-level analysis; do not rank representatives from incomplete attribution without a caveat. |

## Sensitive fields

The source contains customer PII: `customer_name`, `customer_email`, `shipping_address`, `city`, `state`, and `postal_code`.

- Do not include row-level PII in analysis output or reports unless the user explicitly requests it.
- Prefer customer IDs and aggregated geography.
- Report quality issues as counts or percentages, not as examples containing personal data.

## Default metric definitions

Project instructions remain authoritative when the user supplies no override.

| Metric | Definition |
|---|---|
| Revenue | Sum `total_amount` for orders whose `order_status` is `Completed` or `Shipped`. |
| Units sold | Sum `quantity` over the same revenue-eligible orders. |
| Orders | Distinct `order_id` over the eligible population. |
| Average order value | Revenue divided by eligible distinct orders. State the denominator. |
| Customers | Distinct `customer_id` over the stated population. State whether the population is revenue-eligible or all orders. |
| Status rate | Distinct orders in the named status divided by all distinct orders in the stated period. |
| Revenue share | Group revenue divided by total revenue under identical status, date, and currency filters. |

Do not label `Processing` value as revenue unless the user explicitly changes the recognition rule. Keep `Cancelled` and `Refunded` value separate from recognized revenue.

## Time conventions

- Derive the data's minimum and maximum dates on every run; do not hardcode them.
- Interpret “last month” as the previous calendar month relative to the latest date in the data, then state that anchor date.
- Compare like-for-like complete periods. Flag partial periods instead of treating them as directly comparable.
- Round money to 2 decimals and percentages to 1 decimal for presentation; calculate with unrounded values.

## Required quality checks

Before reporting, verify and record material exceptions:

1. Required columns exist and numeric/date fields parse successfully.
2. `order_id` uniqueness matches the assumed grain.
3. Null counts are acceptable for every field used in the calculation.
4. `quantity` and monetary fields do not contain unexplained negative or impossible values.
5. `subtotal + tax_amount` approximately equals `total_amount`, allowing normal cent rounding.
6. Status and currency values match the populations used by the metric.
7. Filters do not unintentionally remove all rows from a subgroup or comparison period.
8. Aggregated totals reconcile to the overall filtered total within rounding tolerance.
