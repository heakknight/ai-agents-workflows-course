# Research Crew

A classic CrewAI Python/YAML scaffold for sequential research. The `researcher` uses Brave search to gather information about a prompted topic, then the `reporting_analyst` turns the findings into `report.md`.

## Requirements

- Python `>=3.10,<3.14`
- [uv](https://docs.astral.sh/uv/)
- OpenAI API key
- Brave Search API key

## Install and run

```bash
uv sync
```

Fill the existing placeholders in `.env`:

```dotenv
MODEL=your-model
OPENAI_API_KEY=your-openai-key
BRAVE_API_KEY=your-brave-key
```

Then start the crew and enter a research topic when prompted:

```bash
uv run crewai run
```

The agents run sequentially and write the final report to `report.md`.

## Project layout

- `research_crew/config/agents.yaml` — agent roles, goals, and backstories
- `research_crew/config/tasks.yaml` — research and reporting task definitions
- `research_crew/crew.py` — agents, Brave tool attachment, tasks, and sequential crew
- `research_crew/main.py` — CLI entry points and topic prompt
- `research_crew/tools/` — custom-tool package

This project uses the classic Python/YAML scaffold, which remains supported. For modernization, new CrewAI projects should preferably use the JSON-first scaffold; replace the legacy `BraveSearchTool` with `BraveWebSearchTool`; provide a `.env.example` and ignore `.env`; and optionally adopt a `src/` layout plus tests.
