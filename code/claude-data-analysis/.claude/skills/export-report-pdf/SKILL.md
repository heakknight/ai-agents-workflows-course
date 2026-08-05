---
name: export-report-pdf
description: >-
  Exports an existing self-contained HTML report to a print-ready PDF with a
  pinned headless-browser workflow. Use this skill when the user asks for a PDF
  copy of an HTML analytics report or requests both HTML and PDF deliverables.
  Do not use to author the report (use create-report), analyze data (use
  data-analytics), or read, edit, merge, split, or fill existing PDFs.
compatibility: >-
  Requires Node.js 18+, npx, filesystem access, and network access on the first
  run to obtain pinned Playwright and Chromium dependencies.
---

# Export Report PDF

## Required resources

- Before export, read [`references/print-export-guide.md`](references/print-export-guide.md). It defines prerequisites, print CSS expectations, failure recovery, and visual checks.
- Resolve [`scripts/html-to-pdf.mjs`](scripts/html-to-pdf.mjs) relative to this `SKILL.md`; execute it rather than recreating conversion code.

## Rules

- Start from a completed, validated local HTML file. Use `create-report` first when no HTML report exists.
- Export local files only. Do not use this workflow for arbitrary remote URLs.
- Never overwrite an existing PDF unless the user requested replacement and `--overwrite` is supplied.
- Keep the HTML as the source of truth; do not manually patch the generated PDF.

## Workflow

1. Confirm the HTML report exists and passes the `create-report` validator.
2. Read [`references/print-export-guide.md`](references/print-export-guide.md) and apply its print-readiness checks.
3. Run `node scripts/html-to-pdf.mjs --input <absolute-html-path> --output <absolute-pdf-path>` after resolving the script from this skill directory.
4. If Chromium is missing, run the pinned installation command printed by the script, then retry once.
5. Confirm the script exits `0` and reports a non-empty PDF beginning with `%PDF-`.
6. Visually inspect every PDF page for clipping, awkward page breaks, missing colors, and unreadable charts. Fix the HTML/CSS and re-export when needed.
7. Report both HTML and PDF paths.

## Validation

- Run `node scripts/html-to-pdf.mjs --help`; expect concise usage and documented exit codes.
- Test one representative report using the default A4 format.
- Re-run with an existing output path without `--overwrite`; expect a safe failure.
