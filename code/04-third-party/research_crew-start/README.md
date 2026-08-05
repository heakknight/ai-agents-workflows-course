# Research Crew Starter

A starter [CrewAI](https://crewai.com) project using the classic Python/YAML scaffold. It defines two agents (`researcher` and `reporting_analyst`) and two tasks executed sequentially, with the final task writing `report.md`. No web-search tool is configured yet; the included custom-tool file is only an unattached stub.

## Requirements

- Python `>=3.10,<3.14`
- [uv](https://docs.astral.sh/uv/)
- An OpenAI API key

## Install and run

```bash
uv sync
```

In the existing `.env`, replace the placeholder values for `MODEL` and `OPENAI_API_KEY`, then run:

```bash
uv run crewai run
```

## Key paths

- `src/research_crew/config/agents.yaml` — agent definitions
- `src/research_crew/config/tasks.yaml` — task definitions
- `src/research_crew/crew.py` — agents, tasks, process, and output setup
- `src/research_crew/main.py` — runtime inputs and command entry points
- `src/research_crew/tools/` — tool implementations or stubs

## Possible modernization

- Prefer CrewAI's JSON-first project format for new projects; the classic Python/YAML scaffold remains supported.
- Commit a `.env.example` and ignore the real `.env`.
- Add a research/web-search tool and automated tests.
