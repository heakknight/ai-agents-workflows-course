#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readSync, renameSync, statSync, unlinkSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PLAYWRIGHT_VERSION = "1.58.2";
const PAPER_FORMATS = new Set(["A3", "A4", "Legal", "Letter"]);
const EXIT_USAGE = 2;
const EXIT_IO = 3;
const EXIT_RENDERER = 4;

function help() {
  console.log(`Usage: node scripts/html-to-pdf.mjs --input REPORT.html --output REPORT.pdf [options]

Export a local self-contained HTML report to PDF using Playwright ${PLAYWRIGHT_VERSION}.

Required:
  --input PATH          Existing local HTML file
  --output PATH         Destination PDF file

Options:
  --paper-format VALUE  A3, A4, Letter, or Legal (default: A4)
  --wait-ms NUMBER      Rendering settle time, 0-30000 (default: 500)
  --overwrite           Replace an existing output only after a successful render
  -h, --help            Show this help

Output:
  A JSON result is written to stdout. Diagnostics are written to stderr.

Exit codes:
  0 success; 2 invalid arguments; 3 filesystem error; 4 renderer/dependency error.`);
}

function fail(message, code) {
  console.error(`html-to-pdf: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const options = { paperFormat: "A4", waitMs: 500, overwrite: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      help();
      process.exit(0);
    }
    if (arg === "--overwrite") {
      options.overwrite = true;
      continue;
    }
    if (["--input", "--output", "--paper-format", "--wait-ms"].includes(arg)) {
      if (index + 1 >= argv.length) {
        fail(`${arg} requires a value`, EXIT_USAGE);
      }
      const value = argv[++index];
      if (arg === "--input") options.input = value;
      if (arg === "--output") options.output = value;
      if (arg === "--paper-format") options.paperFormat = value;
      if (arg === "--wait-ms") options.waitMs = Number(value);
      continue;
    }
    fail(`unknown argument: ${arg}`, EXIT_USAGE);
  }
  return options;
}

function bounded(text, limit = 20_000) {
  if (!text) return "";
  return text.length <= limit ? text : `${text.slice(0, limit)}\n[output truncated]`;
}

const options = parseArgs(process.argv.slice(2));
if (!options.input || !options.output) {
  fail("--input and --output are required; run with --help for usage", EXIT_USAGE);
}
if (!PAPER_FORMATS.has(options.paperFormat)) {
  fail(`unsupported --paper-format ${JSON.stringify(options.paperFormat)}; use A3, A4, Letter, or Legal`, EXIT_USAGE);
}
if (!Number.isInteger(options.waitMs) || options.waitMs < 0 || options.waitMs > 30_000) {
  fail("--wait-ms must be an integer from 0 to 30000", EXIT_USAGE);
}
if (/^[a-z][a-z0-9+.-]*:/i.test(options.input)) {
  fail("--input must be a local filesystem path, not a URL", EXIT_USAGE);
}

const input = resolve(options.input);
const output = resolve(options.output);
if (!existsSync(input)) fail(`input does not exist: ${input}`, EXIT_IO);
if (extname(input).toLowerCase() !== ".html") fail("--input must end in .html", EXIT_USAGE);
if (extname(output).toLowerCase() !== ".pdf") fail("--output must end in .pdf", EXIT_USAGE);
if (input === output) fail("input and output paths must differ", EXIT_USAGE);
if (existsSync(output) && !options.overwrite) {
  fail(`output already exists: ${output}; pass --overwrite to replace it`, EXIT_IO);
}

try {
  mkdirSync(dirname(output), { recursive: true });
} catch (error) {
  fail(`cannot create output directory: ${error.message}`, EXIT_IO);
}

const temporary = resolve(dirname(output), `.${basename(output)}.tmp-${process.pid}-${Date.now()}.pdf`);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const args = [
  "-y",
  `playwright@${PLAYWRIGHT_VERSION}`,
  "pdf",
  "--paper-format",
  options.paperFormat,
  "--wait-for-timeout",
  String(options.waitMs),
  pathToFileURL(input).href,
  temporary,
];

console.error(`html-to-pdf: rendering ${input} as ${options.paperFormat}`);
const result = spawnSync(npx, args, {
  encoding: "utf8",
  maxBuffer: 2_000_000,
  timeout: 180_000,
});

if (result.stdout) console.error(bounded(result.stdout).trimEnd());
if (result.stderr) console.error(bounded(result.stderr).trimEnd());
if (result.error || result.status !== 0) {
  if (existsSync(temporary)) unlinkSync(temporary);
  const reason = result.error?.message || `renderer exited with status ${result.status}`;
  console.error(`html-to-pdf: ${reason}`);
  console.error(`html-to-pdf: if Chromium is missing, run: npx -y playwright@${PLAYWRIGHT_VERSION} install chromium`);
  process.exit(EXIT_RENDERER);
}

try {
  const size = statSync(temporary).size;
  if (size < 5) throw new Error("renderer produced an empty file");
  const descriptor = openSync(temporary, "r");
  const signature = Buffer.alloc(5);
  readSync(descriptor, signature, 0, 5, 0);
  closeSync(descriptor);
  if (signature.toString("ascii") !== "%PDF-") throw new Error("renderer output does not begin with %PDF-");
  if (existsSync(output)) unlinkSync(output);
  renameSync(temporary, output);
  console.log(JSON.stringify({
    status: "pass",
    input,
    output,
    bytes: size,
    paperFormat: options.paperFormat,
    renderer: `playwright@${PLAYWRIGHT_VERSION}`,
  }));
} catch (error) {
  if (existsSync(temporary)) unlinkSync(temporary);
  fail(`could not finalize PDF: ${error.message}`, EXIT_IO);
}
