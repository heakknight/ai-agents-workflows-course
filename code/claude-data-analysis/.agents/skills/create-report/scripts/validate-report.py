#!/usr/bin/env python3
"""Validate a self-contained analytics HTML report."""

from __future__ import annotations

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from typing import Dict, List, Sequence, Set, Tuple

EXIT_VALIDATION = 1
EXIT_USAGE_OR_IO = 2
DEFAULT_MAX_BYTES = 5_000_000


class ReportParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tags: List[Tuple[str, Dict[str, str]]] = []
        self.classes: Set[str] = set()
        self.lang = ""
        self.title_parts: List[str] = []
        self.h1_parts: List[str] = []
        self.method_parts: List[str] = []
        self.all_text_parts: List[str] = []
        self.attribute_values: List[str] = []
        self._in_title = 0
        self._in_h1 = 0
        self._method_depth = 0

    def handle_starttag(self, tag: str, attrs: Sequence[Tuple[str, str | None]]) -> None:
        values = {name.lower(): value or "" for name, value in attrs}
        tag = tag.lower()
        self.tags.append((tag, values))
        self.attribute_values.extend(values.values())
        class_names = set(values.get("class", "").split())
        self.classes.update(class_names)
        if tag == "html":
            self.lang = values.get("lang", "").strip()
        if tag == "title":
            self._in_title += 1
        if tag == "h1":
            self._in_h1 += 1
        if tag == "footer" and "method" in class_names:
            self._method_depth = 1
        elif self._method_depth:
            self._method_depth += 1

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "title" and self._in_title:
            self._in_title -= 1
        if tag == "h1" and self._in_h1:
            self._in_h1 -= 1
        if self._method_depth:
            self._method_depth -= 1

    def handle_data(self, data: str) -> None:
        self.all_text_parts.append(data)
        if self._in_title:
            self.title_parts.append(data)
        if self._in_h1:
            self.h1_parts.append(data)
        if self._method_depth:
            self.method_parts.append(data)


TOKEN_RE = re.compile(r"\{\{[A-Z][A-Z0-9_]*\}\}")
EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
CSS_IMPORT_RE = re.compile(r"@import\b", re.IGNORECASE)
CSS_URL_RE = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.IGNORECASE | re.DOTALL)
PLACEHOLDER_PHRASES = (
    "one-line summary of the finding",
    "key insight in one sentence",
    "replace this svg with real values",
    "report title",
)


def normalize_text(parts: Sequence[str]) -> str:
    return " ".join(" ".join(parts).split())


def validate(path: Path, max_bytes: int, allow_pii: bool) -> dict:
    errors: List[str] = []
    warnings: List[str] = []

    if not path.exists():
        raise FileNotFoundError(f"Input does not exist: {path}")
    if not path.is_file():
        raise OSError(f"Input is not a file: {path}")
    size = path.stat().st_size
    if size > max_bytes:
        raise OSError(f"Input is {size} bytes; maximum allowed is {max_bytes} bytes")

    try:
        source = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise OSError(f"Input is not valid UTF-8: {exc}") from exc

    parser = ReportParser()
    try:
        parser.feed(source)
        parser.close()
    except Exception as exc:  # HTMLParser errors are uncommon but should be actionable.
        errors.append(f"HTML parsing failed: {exc}")

    lower = source.lower()
    tags = {tag for tag, _ in parser.tags}
    title = normalize_text(parser.title_parts)
    h1 = normalize_text(parser.h1_parts)
    method = normalize_text(parser.method_parts).lower()

    if not re.match(r"\s*<!doctype\s+html", source, re.IGNORECASE):
        errors.append("Missing <!DOCTYPE html> declaration")
    if not parser.lang:
        errors.append("The <html> element must declare a language")
    if "meta" not in tags or "charset" not in lower:
        errors.append("Missing charset metadata")
    if not title:
        errors.append("Missing a non-empty <title>")
    if not h1:
        errors.append("Missing a non-empty <h1>")
    if "kpis" not in parser.classes:
        errors.append("Missing the KPI section (.kpis)")
    if not method:
        errors.append("Missing methodology footer (<footer class=\"method\">)")
    else:
        for required in ("source", "filter", "metric", "caveat"):
            if required not in method:
                errors.append(f"Methodology footer is missing a {required!r} note")

    unresolved = sorted(set(TOKEN_RE.findall(source)))
    if unresolved:
        errors.append("Unresolved template tokens: " + ", ".join(unresolved[:20]))

    remaining_placeholders = [phrase for phrase in PLACEHOLDER_PHRASES if phrase in lower]
    if remaining_placeholders:
        errors.append("Placeholder content remains: " + ", ".join(remaining_placeholders))

    for tag, attrs in parser.tags:
        if tag == "script":
            errors.append("Script elements are not allowed in standalone reports")
        event_handlers = sorted(name for name, value in attrs.items() if name.startswith("on") and value.strip())
        if event_handlers:
            errors.append(f"Inline event handlers are not allowed in <{tag}>: {', '.join(event_handlers)}")
        src = attrs.get("src", "").strip()
        srcset = attrs.get("srcset", "").strip()
        href = attrs.get("href", "").strip()
        xlink_href = attrs.get("xlink:href", "").strip()
        data = attrs.get("data", "").strip()
        poster = attrs.get("poster", "").strip()
        if src and not src.startswith("data:"):
            errors.append(f"External resource in <{tag}> src: {src}")
        if srcset:
            errors.append(f"External resource in <{tag}> srcset: {srcset}")
        if tag not in {"a", "area"} and href and not href.startswith(("#", "data:")):
            errors.append(f"External resource in <{tag}> href: {href}")
        if xlink_href and not xlink_href.startswith(("#", "data:")):
            errors.append(f"External resource in <{tag}> xlink:href: {xlink_href}")
        if tag in {"iframe", "object"} and data and not data.startswith("data:"):
            errors.append(f"External embedded resource in <{tag}>: {data}")
        if poster and not poster.startswith("data:"):
            errors.append(f"External poster resource in <{tag}>: {poster}")
    if CSS_IMPORT_RE.search(source):
        errors.append("CSS @import is not allowed; inline the stylesheet")
    for _, css_url in CSS_URL_RE.findall(source):
        value = css_url.strip()
        if value and not value.startswith(("data:", "#")):
            errors.append(f"External CSS url() resource: {value}")

    decoded_content = " ".join(parser.all_text_parts + parser.attribute_values)
    emails = {value.lower() for value in EMAIL_RE.findall(source)}
    emails.update(value.lower() for value in EMAIL_RE.findall(decoded_content))
    email_count = len(emails)
    if email_count:
        message = f"Found {email_count} email-like value(s); raw PII requires explicit approval and --allow-pii"
        (warnings if allow_pii else errors).append(message)

    errors = list(dict.fromkeys(errors))
    warnings = list(dict.fromkeys(warnings))
    return {
        "status": "pass" if not errors else "fail",
        "input": str(path.resolve()),
        "bytes": size,
        "errors": errors,
        "warnings": warnings,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate a self-contained analytics HTML report and emit JSON.",
        epilog="Exit codes: 0=pass, 1=validation failure, 2=usage or I/O error.",
    )
    parser.add_argument("--input", required=True, type=Path, help="HTML report to validate")
    parser.add_argument(
        "--max-bytes",
        type=int,
        default=DEFAULT_MAX_BYTES,
        help=f"maximum input size (default: {DEFAULT_MAX_BYTES})",
    )
    parser.add_argument(
        "--allow-pii",
        action="store_true",
        help="allow email-like values only when the user explicitly requested raw PII",
    )
    args = parser.parse_args()
    if args.max_bytes < 1:
        parser.error("--max-bytes must be at least 1")
    return args


def main() -> int:
    args = parse_args()
    try:
        result = validate(args.input, args.max_bytes, args.allow_pii)
    except (OSError, FileNotFoundError) as exc:
        print(f"validate-report: {exc}", file=sys.stderr)
        return EXIT_USAGE_OR_IO

    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["status"] == "pass" else EXIT_VALIDATION


if __name__ == "__main__":
    raise SystemExit(main())
