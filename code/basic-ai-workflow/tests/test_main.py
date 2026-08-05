from pathlib import Path
from types import SimpleNamespace

import main
import pytest


class FakeResponses:
    def __init__(
        self,
        output_text: str = "- A concise summary",
        *,
        status: str = "completed",
        incomplete_reason: str | None = None,
    ) -> None:
        self.output_text = output_text
        self.status = status
        self.incomplete_reason = incomplete_reason
        self.request = None

    def create(self, **kwargs):
        self.request = kwargs
        incomplete_details = (
            SimpleNamespace(reason=self.incomplete_reason)
            if self.incomplete_reason is not None
            else None
        )
        return SimpleNamespace(
            output_text=self.output_text,
            status=self.status,
            incomplete_details=incomplete_details,
        )


class FakeClient:
    def __init__(
        self,
        output_text: str = "- A concise summary",
        *,
        status: str = "completed",
        incomplete_reason: str | None = None,
    ) -> None:
        self.responses = FakeResponses(
            output_text,
            status=status,
            incomplete_reason=incomplete_reason,
        )


def test_loads_and_trims_literal_text() -> None:
    assert main.load_source(text="  Hello world  ", file_path=None) == "Hello world"


def test_loads_utf8_txt_file(tmp_path: Path) -> None:
    source = tmp_path / "source.txt"
    source.write_text("  Grüße aus München  ", encoding="utf-8")

    assert main.load_source(text=None, file_path=source) == "Grüße aus München"


def test_loads_markdown_file(tmp_path: Path) -> None:
    source = tmp_path / "source.md"
    source.write_text("# Heading\n\nContent", encoding="utf-8")

    assert main.load_source(text=None, file_path=source) == "# Heading\n\nContent"


def test_rejects_non_utf8_file(tmp_path: Path) -> None:
    source = tmp_path / "source.txt"
    source.write_bytes(b"\xff\xfe")

    with pytest.raises(main.WorkflowError, match="not valid UTF-8"):
        main.load_source(text=None, file_path=source)


@pytest.mark.parametrize("name", ["source.docx", "source", "source.pdf"])
def test_rejects_unsupported_file(tmp_path: Path, name: str) -> None:
    source = tmp_path / name
    source.write_text("content", encoding="utf-8")

    with pytest.raises(main.WorkflowError, match=r"\.txt or \.md file"):
        main.load_source(text=None, file_path=source)


def test_rejects_missing_file(tmp_path: Path) -> None:
    with pytest.raises(main.WorkflowError, match="File not found"):
        main.load_source(text=None, file_path=tmp_path / "missing.txt")


@pytest.mark.parametrize("text", ["", "   ", "\n\t"])
def test_rejects_empty_text(text: str) -> None:
    with pytest.raises(main.WorkflowError, match="must not be empty"):
        main.load_source(text=text, file_path=None)


def test_summarize_sends_one_stateless_responses_request() -> None:
    client = FakeClient()

    summary = main.summarize(client, text="Document text", model="gpt-5-nano")

    assert summary == "- A concise summary"
    assert client.responses.request == {
        "model": "gpt-5-nano",
        "instructions": main.SUMMARY_INSTRUCTIONS,
        "input": "Document text",
        "reasoning": {"effort": "low"},
        "max_output_tokens": 1200,
        "store": False,
    }
    assert "tools" not in client.responses.request


def test_rejects_incomplete_api_output_even_when_it_contains_text() -> None:
    client = FakeClient(
        "- A partial summary",
        status="incomplete",
        incomplete_reason="max_output_tokens",
    )

    with pytest.raises(main.WorkflowError, match="max_output_tokens"):
        main.summarize(client, text="Document text", model="gpt-5-nano")


def test_rejects_empty_completed_api_output() -> None:
    with pytest.raises(main.WorkflowError, match="empty summary"):
        main.summarize(FakeClient("  "), text="Document text", model="gpt-5-nano")


def test_writes_summary_and_creates_output_directory(tmp_path: Path) -> None:
    output = tmp_path / "out" / "summary.txt"

    result = main.write_summary("A summary", output)

    assert result == output
    assert output.read_text(encoding="utf-8") == "A summary\n"


def test_main_runs_complete_workflow(monkeypatch, tmp_path: Path, capsys) -> None:
    client = FakeClient()
    output = tmp_path / "out" / "summary.txt"

    class FakeOpenAIContext:
        def __init__(self, *, api_key: str, timeout: float) -> None:
            assert api_key == "test-key"
            assert timeout == 60.0

        def __enter__(self):
            return client

        def __exit__(self, *args) -> None:
            return None

    write_summary = main.write_summary
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(main, "OpenAI", FakeOpenAIContext)
    monkeypatch.setattr(
        main, "write_summary", lambda summary: write_summary(summary, output)
    )

    exit_code = main.main(["--text", "Document text"])

    assert exit_code == 0
    assert output.read_text(encoding="utf-8") == "- A concise summary\n"
    assert str(output) in capsys.readouterr().out


def test_main_requires_api_key(monkeypatch, capsys) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    exit_code = main.main(["--text", "Document text"])

    assert exit_code == 1
    assert "OPENAI_API_KEY is not set" in capsys.readouterr().err
