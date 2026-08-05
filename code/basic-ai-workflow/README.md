# Basic AI workflow

A fixed Python workflow that sends text to OpenAI for summarization and writes the result to `out/summary.txt`. It demonstrates a predictable workflow rather than an autonomous agent.

## Run

```bash
uv sync
export OPENAI_API_KEY="your-key"
uv run python main.py --text "Text to summarize"
```

Run the tests with `uv run pytest`.
