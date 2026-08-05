# Generic trusted-local agent

A small Python Responses API agent with file, edit, memory, and Bash tools. It is intentionally unrestricted, so run it only in a workspace and with prompts you trust.

## Run

```bash
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
export OPENAI_API_KEY="your-key"
uv run agent.py --workdir /path/to/workspace
```

Run the tests with `python -m unittest -v`.
