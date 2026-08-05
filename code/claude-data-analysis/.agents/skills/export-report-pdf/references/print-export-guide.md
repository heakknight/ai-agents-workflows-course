# Print export guide

Read this before converting an HTML report to PDF.

## Prerequisites

The bundled script requires Node.js 18+ and `npx`. It invokes a pinned Playwright release so runs do not silently change behavior.

The first use may require network access and a Chromium download:

```bash
npx -y playwright@1.58.2 install chromium
```

If dependencies cannot be downloaded, stop and report the missing prerequisite. Do not substitute an untested renderer without telling the user.

## Prepare the HTML

- Validate the report with `create-report` before export.
- Keep all CSS, SVG, fonts, and images local or inline.
- Use `@page` for paper size and margins where precise pagination matters.
- Add `break-inside: avoid` to KPI cards, compact tables, and methodology blocks that should stay together.
- Avoid fixed viewport heights, sticky positioning, and content that depends on hover or animation.
- Use `print-color-adjust: exact` when essential backgrounds or chart colors must print.
- Ensure wide tables fit the selected paper format; prefer simplifying the table over shrinking text excessively.

## Script behavior

Run the script by resolving `scripts/html-to-pdf.mjs` relative to its `SKILL.md`:

```bash
node scripts/html-to-pdf.mjs \
  --input /absolute/path/report.html \
  --output /absolute/path/report.pdf \
  --paper-format A4
```

Useful options:

- `--paper-format A4|A3|Letter|Legal` selects a supported paper size.
- `--wait-ms 500` allows local fonts or rendering work to settle.
- `--overwrite` explicitly replaces an existing output.

The script emits one JSON object to stdout. Dependency progress and errors go to stderr.

## Failure recovery

- **Chromium executable missing:** run the pinned installation command above, then retry once.
- **Input rejected:** provide an existing local `.html` file; remote URLs are intentionally unsupported.
- **Output exists:** choose another path or use `--overwrite` only when replacement is intended.
- **Timeout:** remove network-dependent resources, increase `--wait-ms` only when justified, and retry.
- **Broken pagination:** fix print CSS in the HTML and regenerate; do not edit the PDF directly.

## Visual verification

Inspect every page and confirm:

- No clipped headings, KPI values, chart labels, or table columns.
- Cards and methodology blocks do not split awkwardly.
- Colors, borders, and SVG charts render correctly.
- Text is selectable and remains readable at normal zoom.
- Page count and orientation are reasonable for the content.
- The PDF contains the same metrics and methodology as the validated HTML.
