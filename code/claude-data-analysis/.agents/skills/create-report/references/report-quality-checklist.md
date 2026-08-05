# Report quality checklist

Read this after authoring and before delivery. Fix applicable failures, then run `scripts/validate-report.py`.

## Content integrity

- Every displayed figure matches the supplied analysis result and rounding convention.
- Titles, period labels, chart labels, table headings, and units are unambiguous.
- Takeaways interpret the displayed evidence without adding unsupported claims.
- Empty or irrelevant template sections are removed.
- No `{{TOKEN}}`, sample number, placeholder label, or instructional comment remains.

## Methodology

The footer states, in compact form:

- **Source:** exact input file or table.
- **Filters:** date, status, geography, segment, and exclusions that materially affect the result.
- **Metrics:** formulas and denominators for reported KPIs.
- **Caveats:** missingness, partial periods, sample limits, grain assumptions, or quality exceptions.

## Privacy

- Remove names, email addresses, street addresses, postal codes, and other row-level PII unless explicitly requested.
- Prefer customer IDs only when row-level identification is necessary.
- Describe sensitive-data quality issues using aggregate counts or rates.

## Standalone and accessibility

- The report loads through `file://` without a server or network connection.
- CSS and SVG are inline; there are no CDNs, remote fonts, scripts, images, or stylesheets.
- The document has a meaningful `<title>`, one primary `<h1>`, and a declared language.
- Sections use semantic headings and tables use header cells.
- Charts have a concise accessible name and do not rely on color alone for their meaning.
- Text and key chart labels have sufficient contrast.

## Visual inspection

Inspect the rendered report, not only its source:

- Desktop width: no overlaps, clipped labels, broken grids, or unexpected horizontal scrolling.
- Narrow width near 390px: cards stack, tables remain usable, and text stays readable.
- KPI values and the primary finding are visible near the top.
- Dense tables, long labels, and currency values align consistently.
- Print preview has sensible page breaks and retains essential colors.

## Delivery

- Run the validator until it exits `0`; use `--allow-pii` only when the user explicitly requested raw PII.
- Open the final saved path once more after the last edit.
- Report the output path and any material caveat that remains.
