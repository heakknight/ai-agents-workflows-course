# Primitive tool-using agent

A deliberately manual Python agent loop that asks the model for JSON tool requests and can summarize text or create a PDF. It shows the mechanics without native function-calling support.

## Run

```bash
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
export OPENAI_API_KEY="your-key"
python agent.py
```

Run the tests with `python -m unittest -v`.
