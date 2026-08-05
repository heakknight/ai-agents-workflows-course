import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from agent import (
    INSTRUCTIONS,
    MAX_TOOL_ROUNDS,
    MODEL,
    REASONING,
    TOOLS,
    load_startup_context,
    run_agent,
)
from agent_tools import bash, edit_file, read_file, store_memory, write_file


class FakeResponses:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.responses.pop(0)


class FakeClient:
    def __init__(self, responses):
        self.responses = FakeResponses(responses)


def tool_call(call_id, name="read_file", arguments='{"path":"example.txt"}'):
    return SimpleNamespace(
        type="function_call", call_id=call_id, name=name, arguments=arguments
    )


class AgentTests(unittest.TestCase):
    def test_five_tool_schemas_are_strict(self):
        self.assertEqual(
            [tool["name"] for tool in TOOLS],
            ["read_file", "write_file", "edit_file", "store_memory", "bash"],
        )
        for tool in TOOLS:
            schema = tool["parameters"]
            self.assertTrue(tool["strict"])
            self.assertFalse(schema["additionalProperties"])
            self.assertEqual(set(schema["required"]), set(schema["properties"]))

    def test_file_and_bash_tools_use_the_working_directory_and_log_actions(self):
        with tempfile.TemporaryDirectory() as directory, patch(
            "builtins.print"
        ) as logged:
            write_file("nested/a.txt", "one\ntwo\n", workdir=directory)
            self.assertEqual(read_file("nested/a.txt", workdir=directory), "one\ntwo\n")
            edit_file("nested/a.txt", "two", "TWO", workdir=directory)
            self.assertEqual(
                (Path(directory) / "nested/a.txt").read_text(), "one\nTWO\n"
            )
            self.assertIn(str(Path(directory)), bash("pwd", workdir=directory))
            bash("printf ok # " + "x" * 200, workdir=directory)
            store_memory("User preference", "Prefers concise answers.", workdir=directory)
            self.assertEqual(
                (Path(directory) / "memory" / "user-preference.md").read_text(),
                "# User preference\n\nPrefers concise answers.\n",
            )

        messages = [call.args[0] for call in logged.call_args_list]
        self.assertTrue(any(message.startswith("Reading ") for message in messages))
        self.assertTrue(any(message.startswith("Writing ") for message in messages))
        self.assertTrue(any(message.startswith("Editing ") for message in messages))
        bash_logs = [message for message in messages if message.startswith("Running Bash: ")]
        self.assertTrue(bash_logs[-1].endswith("..."))
        self.assertLessEqual(len(bash_logs[-1]), len("Running Bash: ") + 123)

    def test_edit_requires_one_match(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "a.txt"
            target.write_text("same same", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "found 2 matches"):
                edit_file("a.txt", "same", "new", workdir=directory)
            self.assertEqual(target.read_text(encoding="utf-8"), "same same")

    def test_loads_global_and_project_instructions_and_skill_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            home = root / "home"
            workdir = root / "work"
            (home / ".agents" / "skills" / "research").mkdir(parents=True)
            (workdir / ".agents" / "skills" / "research").mkdir(parents=True)
            (home / ".agents" / "AGENTS.md").write_text("Global rules")
            (workdir / "AGENTS.md").write_text("Project rules")
            (workdir / "memory").mkdir()
            memory_file = workdir / "memory" / "preferences.md"
            memory_file.write_text("# Preferences\n\nMEMORY BODY")
            (home / ".agents" / "skills" / "research" / "SKILL.md").write_text(
                "---\nname: research\ndescription: Global description\n---\nGLOBAL BODY"
            )
            local_skill = workdir / ".agents" / "skills" / "research" / "SKILL.md"
            local_skill.write_text(
                "---\nname: research\ndescription: Local description\n---\nLOCAL BODY"
            )

            with patch("agent.Path.home", return_value=home):
                context = load_startup_context(workdir)

            self.assertIn("Global rules", context)
            self.assertIn("Project rules", context)
            self.assertIn("research: Local description", context)
            self.assertIn(str(local_skill.resolve()), context)
            self.assertNotIn("Global description", context)
            self.assertNotIn("LOCAL BODY", context)
            self.assertIn(f"preferences (path: {memory_file.resolve()})", context)
            self.assertNotIn("MEMORY BODY", context)

    def test_loop_replays_complete_history_and_reasoning(self):
        reasoning = SimpleNamespace(type="reasoning", id="reasoning-1")
        call = tool_call("call-1")
        client = FakeClient(
            [
                SimpleNamespace(output=[reasoning, call], output_text=""),
                SimpleNamespace(output=[], output_text="Done."),
            ]
        )

        with tempfile.TemporaryDirectory() as directory, patch(
            "agent.read_file", return_value="contents"
        ), patch("builtins.print"):
            answer = run_agent(client, "Read the file", workdir=directory)

        self.assertEqual(answer, "Done.")
        first, second = client.responses.calls
        user_item = {"role": "user", "content": "Read the file"}
        tool_output = {
            "type": "function_call_output",
            "call_id": "call-1",
            "output": "contents",
        }
        self.assertEqual(first["input"], [user_item])
        self.assertEqual(second["input"], [user_item, reasoning, call, tool_output])
        for request in (first, second):
            self.assertEqual(request["model"], MODEL)
            self.assertEqual(request["reasoning"], REASONING)
            self.assertTrue(request["instructions"].startswith(INSTRUCTIONS))
            self.assertEqual(request["tools"], TOOLS)
            self.assertFalse(request["parallel_tool_calls"])
            self.assertEqual(request["include"], ["reasoning.encrypted_content"])
            self.assertFalse(request["store"])
            self.assertNotIn("previous_response_id", request)

    def test_tool_errors_are_returned_to_the_model(self):
        client = FakeClient(
            [
                SimpleNamespace(output=[tool_call("call-1")], output_text=""),
                SimpleNamespace(output=[], output_text="Recovered."),
            ]
        )
        with tempfile.TemporaryDirectory() as directory, patch(
            "agent.read_file", side_effect=FileNotFoundError("example.txt")
        ), patch("builtins.print"):
            answer = run_agent(client, "Read it", workdir=directory)

        self.assertEqual(answer, "Recovered.")
        self.assertIn("Tool error:", client.responses.calls[1]["input"][-1]["output"])

    def test_multiple_calls_are_rejected_before_execution(self):
        client = FakeClient(
            [SimpleNamespace(output=[tool_call("call-1"), tool_call("call-2")], output_text="")]
        )
        with tempfile.TemporaryDirectory() as directory, patch(
            "agent.read_file"
        ) as mocked_read:
            with self.assertRaisesRegex(RuntimeError, "more than one function call"):
                run_agent(client, "Read twice", workdir=directory)
        mocked_read.assert_not_called()

    def test_tool_round_limit_allows_a_final_answer_and_rejects_one_more_tool(self):
        calls = [tool_call(f"call-{index}") for index in range(MAX_TOOL_ROUNDS + 1)]
        complete = FakeClient(
            [
                SimpleNamespace(output=[call], output_text="")
                for call in calls[:MAX_TOOL_ROUNDS]
            ]
            + [SimpleNamespace(output=[], output_text="Finished.")]
        )
        with tempfile.TemporaryDirectory() as directory, patch(
            "agent.read_file", return_value="content"
        ), patch("builtins.print"):
            self.assertEqual(
                run_agent(complete, "Use tools", workdir=directory), "Finished."
            )

        rejected = FakeClient(
            [SimpleNamespace(output=[call], output_text="") for call in calls]
        )
        with tempfile.TemporaryDirectory() as directory, patch(
            "agent.read_file", return_value="content"
        ) as mocked_read, patch("builtins.print"):
            with self.assertRaisesRegex(
                RuntimeError, f"exceeded the {MAX_TOOL_ROUNDS}-round tool limit"
            ):
                run_agent(rejected, "Use tools", workdir=directory)
        self.assertEqual(mocked_read.call_count, MAX_TOOL_ROUNDS)


if __name__ == "__main__":
    unittest.main()
