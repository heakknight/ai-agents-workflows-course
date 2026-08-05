"""Trusted-local file and shell tools for the generic agent."""

import re
import subprocess
from pathlib import Path

BASH_TIMEOUT_SECONDS = 30
MAX_LOG_CHARACTERS = 120


def _path(path, workdir):
    target = Path(path).expanduser()
    return target if target.is_absolute() else Path(workdir) / target


def read_file(path, *, workdir):
    """Read a UTF-8 text file."""
    target = _path(path, workdir)
    print(f"Reading {target}")
    return target.read_text(encoding="utf-8")


def write_file(path, content, *, workdir):
    """Write a complete UTF-8 text file, creating parent directories."""
    target = _path(path, workdir)
    print(f"Writing {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return f"Wrote {target}"


def edit_file(path, old_text, new_text, *, workdir):
    """Replace one uniquely occurring text fragment in a UTF-8 file."""
    target = _path(path, workdir)
    print(f"Editing {target}")
    content = target.read_text(encoding="utf-8")
    matches = content.count(old_text) if old_text else 0
    if matches != 1:
        raise ValueError(f"old_text must occur exactly once; found {matches} matches")
    target.write_text(content.replace(old_text, new_text, 1), encoding="utf-8")
    return f"Edited {target}"


def store_memory(title, content, *, workdir):
    """Store one project memory as a Markdown file."""
    title = " ".join(title.split())
    if not title or not content.strip():
        raise ValueError("Memory title and content are required")
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "memory"
    target = Path(workdir) / "memory" / f"{slug}.md"
    print(f"Writing {target}")
    target.parent.mkdir(exist_ok=True)
    target.write_text(f"# {title}\n\n{content.strip()}\n", encoding="utf-8")
    return f"Stored memory at {target}"


def bash(command, *, workdir):
    """Run a command with local Bash and return its exit code and output."""
    preview = command[:MAX_LOG_CHARACTERS]
    if len(command) > MAX_LOG_CHARACTERS:
        preview += "..."
    print(f"Running Bash: {preview}")
    result = subprocess.run(
        ["bash", "-lc", command],
        cwd=workdir,
        capture_output=True,
        text=True,
        timeout=BASH_TIMEOUT_SECONDS,
        check=False,
    )
    output = f"Exit code: {result.returncode}"
    if result.stdout:
        output += f"\nstdout:\n{result.stdout.rstrip()}"
    if result.stderr:
        output += f"\nstderr:\n{result.stderr.rstrip()}"
    return output
