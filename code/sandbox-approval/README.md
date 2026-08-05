# Path-confined approval agent

A Python support-agent example with file access limited to `sandbox/` and a fake refund tool. Larger simulated refunds require explicit human approval.

## Run

```bash
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
export OPENAI_API_KEY="your-key"
python agent.py
```

Run the tests with `python -m unittest -v`.
