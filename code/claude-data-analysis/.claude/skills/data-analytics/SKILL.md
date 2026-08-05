---
name: data-analytics
description: >-
  Performs structured, reproducible analysis on local datasets with explicit
  metrics and sanity checks. Use this skill when answering business or data
  questions, computing KPIs, exploring CSVs or tables, or deriving quantitative
  insights. Do not use for HTML/report styling alone (use create-report) or for
  non-analytics coding tasks.
---

# Data Analytics

## Required reference

- Before analyzing this project's sales data, read [`references/sales-data-contract.md`](references/sales-data-contract.md). It defines the data grain, field roles, sensitive columns, metric formulas, and required quality checks.

## Rules

- Use only project data. Never invent numbers.
- Inspect schema, date range, and key values before calculating.
- Define each metric before reporting it. Honor project instructions when present.
- Prefer small scripts (Python/pandas or SQL) over opaque manual math.
- Keep the unit of analysis consistent (day vs month, order vs customer, etc.).
- Lead with the answer; keep supporting detail brief.

## Workflow

1. Restate the question: metric, filters, time range, and breakdown.
2. Read [`references/sales-data-contract.md`](references/sales-data-contract.md) before using `sales.csv`; apply its definitions and checks.
3. Profile the relevant files and columns: types, nulls, categories, and date bounds.
4. Apply explicit metric logic and filters; run the calculation.
5. Sanity-check row counts, date bounds, excluded statuses, currencies, duplicates, and outliers.
6. Report: direct answer → short breakdown → one-line methodology note containing source, filters, definition, and caveats.

## When reporting

If the user wants a polished HTML report or dashboard page, hand off to `create-report` with the final numbers and definitions. Do not style the report in this skill.
