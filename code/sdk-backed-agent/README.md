# SDK-backed tool-using agent

A Python Responses API agent that uses native function tools for text summarization and PDF creation. It demonstrates the model/tool loop with complete local history replay and API-side storage disabled.

## Run

```bash
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
export OPENAI_API_KEY="your-key"
python agent.py
```

Run the tests with `python -m unittest -v`.
