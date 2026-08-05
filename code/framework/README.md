# Eve customer-support agent

A fictional Lumenpath support agent built with Eve. It can search fake customers, consult a Markdown knowledge base, draft replies, and request approval before simulated refunds.

## Run

```bash
npm install
cp .env.example .env
# Add OPENAI_API_KEY to .env
npm run dev
```

Run `npm run check` for type checking and tests. Slack integration is optional.
