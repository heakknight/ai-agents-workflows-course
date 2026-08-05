---
name: create-report
description: >-
  Builds polished, self-contained HTML analytics reports from provided findings
  using a fixed style template. Use this skill when asked for a report, HTML
  summary, stakeholder readout, dashboard page, or styled presentation of
  analysis results. Do not use to perform the underlying analysis (use
  data-analytics), export an existing report to PDF (use export-report-pdf), or
  build slide decks.
---

# Create Report

## Required resources

- Before authoring, read and copy [`assets/report-template.html`](assets/report-template.html). It is the reusable output skeleton and visual system.
- Before finalizing, read [`references/report-quality-checklist.md`](references/report-quality-checklist.md). It defines content, privacy, accessibility, standalone, and visual checks.
- Resolve [`scripts/validate-report.py`](scripts/validate-report.py) relative to this `SKILL.md` and run it against every completed report.

## Rules

- Analyze first. If numbers are missing, use `data-analytics` before writing HTML.
- Copy the template to the output path, then replace every `{{TOKEN}}`; keep its structure and CSS tokens.
- Self-contained HTML only: inline CSS/SVG, no CDNs, remote assets, or build step. It must open via `file://`.
- Do not invent or recalculate metrics here; present the supplied findings.
- Omit raw PII unless the user explicitly requests it. Only then may the validator use `--allow-pii`.

## Workflow

1. Confirm title, period, KPIs, breakdowns, and methodology notes from the analysis.
2. Read and copy [`assets/report-template.html`](assets/report-template.html) to `reports/<topic>-<period>.html`; create `reports/` if needed.
3. Replace all template tokens. Fill the header, KPI cards, chart, table, takeaways, and methodology footer.
4. Remove unused optional sections instead of leaving examples or placeholder content.
5. Read [`references/report-quality-checklist.md`](references/report-quality-checklist.md) and apply every relevant check.
6. Run `python3 scripts/validate-report.py --input <absolute-report-path>` after resolving the script from this skill directory. Fix errors and rerun until it exits `0`; add `--allow-pii` only for an explicit raw-PII request.
7. Open the report through `file://` and visually inspect desktop and narrow layouts. If the user also needs PDF, use `export-report-pdf` after HTML validation.

## Style

- Put KPIs above the fold; use one primary chart unless more are requested.
- Use tables for exact values and charts for trends or composition.
- Use the template's CSS variables; do not introduce a competing visual system.
- Keep copy sparse: labels, numbers, and one-line takeaways.
- Always include a methodology footer with source, filters, metric definitions, and caveats.
