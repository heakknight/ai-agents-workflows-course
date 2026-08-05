# eve Agent App

This project uses the eve framework. Before writing code, read the relevant guide
from the installed eve package docs at `node_modules/eve/docs/`. If package docs
are unavailable, use https://eve.dev/docs as a fallback.

## This agent

Lumenpath internal customer support assistant:

- Markdown knowledge base under `agent/sandbox/workspace/knowledge-base/`
- Fake customer store in `agent/lib/fake_store.ts`
- Tools: `find_customers`, `get_customer`, `issue_refund` (approval-gated)
- Slack channel with allowlist; local eve channel for TUI/HTTP
- Keep instructions and KB realistic; do not add “this is a demo/course” wording into agent prompts or KB content
