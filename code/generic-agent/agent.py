"""A lean versatile agent using native Responses API tools."""

import argparse
import json
from pathlib import Path

from openai import OpenAI
import yaml

from agent_tools import bash, edit_file, read_file, store_memory, write_file

MODEL = "gpt-5.6-sol"
REASONING = {"effort": "high"}
MAX_TOOL_ROUNDS = 50

INSTRUCTIONS = """
You are a versatile agent working in a trusted local environment. Use the
available file and Bash tools when they help complete the user's request.
Follow the supplied AGENTS.md instructions and use listed Agent Skills when
relevant; read a skill's SKILL.md before applying it. Read a listed project
memory before relying on it, and call store_memory when the user asks you to
remember something for future runs. Inspect relevant information before acting,
make only requested changes, preserve unrelated content, and verify your work
when useful. Report results, failures, and uncertainty accurately. Keep the
final answer concise.
""".strip()

TOOLS = [
    {
        "type": "function",
        "name": "read_file",
        "description": "Read a UTF-8 text file. Relative paths use the selected working directory; absolute paths and .. are allowed.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the text file."}
            },
            "required": ["path"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "write_file",
        "description": "Write a complete UTF-8 text file, replacing it if present and creating parent directories.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Destination path."},
                "content": {"type": "string", "description": "Complete file content."},
            },
            "required": ["path", "content"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "edit_file",
        "description": "Replace one exact text fragment that occurs exactly once in a UTF-8 file.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the text file."},
                "old_text": {"type": "string", "description": "Exact text to replace."},
                "new_text": {"type": "string", "description": "Replacement text."},
            },
            "required": ["path", "old_text", "new_text"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "store_memory",
        "description": "Store information for future runs as a Markdown file in the selected project's memory directory.",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "A short title used to name the memory file.",
                },
                "content": {
                    "type": "string",
                    "description": "The information to remember.",
                },
            },
            "required": ["title", "content"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "bash",
        "description": "Run a command with trusted local Bash in the selected working directory with a 30-second timeout. This is not sandboxed.",
        "parameters": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Bash command to run."}
            },
            "required": ["command"],
            "additionalProperties": False,
        },
        "strict": True,
    },
]


def load_startup_context(workdir):
    """Load global/local instructions and catalog global/local Agent Skills."""
    working_directory = Path(workdir).expanduser().resolve()
    home = Path.home()
    sections = []

    for label, path in (
        ("Global instructions", home / ".agents" / "AGENTS.md"),
        ("Project instructions", working_directory / "AGENTS.md"),
    ):
        if path.is_file():
            sections.append(f"## {label}\n\n{path.read_text(encoding='utf-8').strip()}")

    skills = {}
    for root in (
        home / ".agents" / "skills",
        working_directory / ".agents" / "skills",
    ):
        if not root.is_dir():
            continue
        for skill_path in sorted(root.glob("*/SKILL.md")):
            try:
                with skill_path.open(encoding="utf-8") as skill_file:
                    if skill_file.readline().strip() != "---":
                        continue
                    frontmatter = []
                    for line in skill_file:
                        if line.strip() == "---":
                            break
                        frontmatter.append(line)
                    else:
                        continue
                metadata = yaml.safe_load("".join(frontmatter))
            except (OSError, UnicodeError, yaml.YAMLError):
                continue
            if (
                isinstance(metadata, dict)
                and isinstance(metadata.get("name"), str)
                and isinstance(metadata.get("description"), str)
            ):
                skills[metadata["name"]] = {
                    "description": " ".join(metadata["description"].split()),
                    "path": skill_path.resolve(),
                }

    if skills:
        catalog = [
            "## Available Agent Skills",
            "Read a relevant skill's SKILL.md with read_file before applying it.",
        ]
        for name, skill in sorted(skills.items()):
            catalog.append(
                f"- {name}: {skill['description']} (SKILL.md: {skill['path']})"
            )
        sections.append("\n".join(catalog))

    memory_directory = working_directory / "memory"
    if memory_directory.is_dir():
        memories = sorted(memory_directory.glob("*.md"))
        if memories:
            catalog = [
                "## Project Memories",
                "Read a relevant memory with read_file before relying on it.",
            ]
            catalog.extend(f"- {path.stem} (path: {path.resolve()})" for path in memories)
            sections.append("\n".join(catalog))

    if not sections:
        return ""
    return (
        "Startup context follows. Explicit user instructions take precedence; "
        "project instructions take precedence over global instructions.\n\n"
        + "\n\n".join(sections)
    )


def run_agent(client, user_input, *, workdir="."):
    working_directory = Path(workdir).expanduser().resolve()
    startup_context = load_startup_context(working_directory)
    instructions = INSTRUCTIONS
    if startup_context:
        instructions += f"\n\n{startup_context}"
    tools_by_name = {
        "read_file": read_file,
        "write_file": write_file,
        "edit_file": edit_file,
        "store_memory": store_memory,
        "bash": bash,
    }
    history = [{"role": "user", "content": user_input}]
    tool_rounds = 0

    while True:
        response = client.responses.create(
            model=MODEL,
            reasoning=REASONING,
            instructions=instructions,
            tools=TOOLS,
            parallel_tool_calls=False,
            input=list(history),
            include=["reasoning.encrypted_content"],
            store=False,
        )

        history.extend(response.output)
        tool_calls = [
            item for item in response.output if item.type == "function_call"
        ]
        if not tool_calls:
            if not response.output_text.strip():
                raise RuntimeError("The agent returned no final answer.")
            return response.output_text.strip()
        if len(tool_calls) > 1:
            raise RuntimeError(
                "The agent returned more than one function call in a single round."
            )
        if tool_rounds == MAX_TOOL_ROUNDS:
            raise RuntimeError(
                f"Agent exceeded the {MAX_TOOL_ROUNDS}-round tool limit."
            )

        tool_call = tool_calls[0]
        try:
            arguments = json.loads(tool_call.arguments)
            selected_tool = tools_by_name.get(tool_call.name)
            if selected_tool is None:
                raise ValueError(f"Unknown tool: {tool_call.name}")
            result = selected_tool(**arguments, workdir=working_directory)
        except Exception as error:
            result = f"Tool error: {error}"
            print(result)

        history.append(
            {
                "type": "function_call_output",
                "call_id": tool_call.call_id,
                "output": result if isinstance(result, str) else json.dumps(result),
            }
        )
        tool_rounds += 1


def build_parser():
    parser = argparse.ArgumentParser(
        description="Run one request with a versatile trusted-local agent."
    )
    parser.add_argument(
        "--workdir",
        default=".",
        metavar="PATH",
        help="working directory for relative file paths and Bash (default: current directory)",
    )
    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    workdir = Path(args.workdir).expanduser().resolve()
    if not workdir.is_dir():
        parser.error(f"not a directory: {workdir}")

    print(
        "WARNING: trusted-local mode has no sandbox. Model-selected file and "
        "Bash operations run with your full local permissions."
    )
    client = OpenAI()
    user_input = input("You: ")
    answer = run_agent(client, user_input, workdir=workdir)
    print("Agent:", answer)


if __name__ == "__main__":
    main()
