import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from agent import MAX_TOOL_ROUNDS, TOOLS, run_agent
from agent_tools import issue_refund, read_file, request_refund_approval, write_file


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


def tool_call(name, arguments, call_id="call-1"):
    return SimpleNamespace(
        type="function_call",
        name=name,
        arguments=json.dumps(arguments),
        call_id=call_id,
    )


def response(output=None, text=""):
    return SimpleNamespace(output=output or [], output_text=text)


def write_orders(root):
    (root / "orders.json").write_text(
        json.dumps(
            {
                "orders": [
                    {
                        "order_id": "small",
                        "refund_eligible": True,
                        "refund_amount_cents": 850,
                        "refund_reason": "Damaged item",
                    },
                    {
                        "order_id": "large",
                        "refund_eligible": True,
                        "refund_amount_cents": 2499,
                        "refund_reason": "Missing parts",
                    },
                    {
                        "order_id": "ineligible",
                        "refund_eligible": False,
                        "refund_amount_cents": 500,
                        "refund_reason": "Final sale",
                    },
                ]
            }
        ),
        encoding="utf-8",
    )


class FileToolTests(unittest.TestCase):
    def test_reads_writes_and_logs_nested_utf8_files(self):
        with tempfile.TemporaryDirectory() as directory, patch(
            "agent_tools.SANDBOX_ROOT", Path(directory)
        ), patch("builtins.print") as logged:
            result = write_file("reports/note.txt", "héllo")
            loaded = read_file("reports/note.txt")

        self.assertEqual(result, {"ok": True, "path": "reports/note.txt"})
        self.assertEqual(loaded["content"], "héllo")
        self.assertEqual(
            [call.args[0] for call in logged.call_args_list],
            [
                "Writing sandbox/reports/note.txt",
                "Reading sandbox/reports/note.txt",
            ],
        )

    def test_rejects_escapes_but_allows_any_filename_inside_the_sandbox(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch("agent_tools.SANDBOX_ROOT", root):
                self.assertFalse(read_file("../outside.txt")["ok"])
                self.assertFalse(write_file("/tmp/outside.txt", "bad")["ok"])
                self.assertFalse(read_file(".")["ok"])
                self.assertTrue(write_file("orders.json", "agent-owned")["ok"])
            self.assertEqual((root / "orders.json").read_text(), "agent-owned")

    def test_rejects_symlink_escape(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside:
            root = Path(directory)
            outside_path = Path(outside)
            try:
                (root / "escape").symlink_to(outside_path, target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest("Symlinks are unavailable")

            with patch("agent_tools.SANDBOX_ROOT", root):
                result = write_file("escape/new.txt", "bad")

            self.assertFalse(result["ok"])
            self.assertFalse((outside_path / "new.txt").exists())


class RefundPolicyTests(unittest.TestCase):
    def test_small_refund_uses_host_values_without_approval(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_orders(root)
            with patch("agent_tools.ORDERS_PATH", root / "orders.json"), patch(
                "agent_tools.request_refund_approval"
            ) as approval, patch(
                "agent_tools.simulate_refund", return_value={"ok": True}
            ) as simulate:
                result = issue_refund("small")

        self.assertEqual(result, {"ok": True})
        approval.assert_not_called()
        simulate.assert_called_once_with(
            order_id="small", amount_cents=850, reason="Damaged item"
        )

    def test_large_refund_uses_host_values_and_requires_approval(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_orders(root)
            with patch("agent_tools.ORDERS_PATH", root / "orders.json"), patch(
                "agent_tools.request_refund_approval", return_value=True
            ) as approval, patch(
                "agent_tools.simulate_refund", return_value={"ok": True}
            ) as simulate:
                result = issue_refund("large")

        expected = {
            "order_id": "large",
            "amount_cents": 2499,
            "reason": "Missing parts",
        }
        self.assertEqual(result, {"ok": True})
        approval.assert_called_once_with(expected)
        simulate.assert_called_once_with(**expected)

    def test_denial_is_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_orders(root)
            with patch("agent_tools.ORDERS_PATH", root / "orders.json"), patch(
                "agent_tools.request_refund_approval", return_value=False
            ), patch("agent_tools.simulate_refund") as simulate:
                result = issue_refund("large")

        self.assertFalse(result["ok"])
        simulate.assert_not_called()

    def test_missing_and_ineligible_orders_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_orders(root)
            with patch("agent_tools.ORDERS_PATH", root / "orders.json"), patch(
                "agent_tools.request_refund_approval"
            ) as approval, patch("agent_tools.simulate_refund") as simulate:
                missing = issue_refund("missing")
                ineligible = issue_refund("ineligible")

        self.assertIn("not found", missing["message"])
        self.assertIn("not eligible", ineligible["message"])
        approval.assert_not_called()
        simulate.assert_not_called()

    def test_human_approval_accepts_only_explicit_yes(self):
        refund = {"order_id": "large", "amount_cents": 2499, "reason": "Missing parts"}
        with patch("builtins.print"), patch("builtins.input", return_value="YES"):
            self.assertTrue(request_refund_approval(refund))
        with patch("builtins.print"), patch("builtins.input", return_value="sure"):
            self.assertFalse(request_refund_approval(refund))
        with patch("builtins.print"), patch("builtins.input", side_effect=EOFError):
            self.assertFalse(request_refund_approval(refund))


class AgentLoopTests(unittest.TestCase):
    def test_replays_complete_history_and_reasoning(self):
        reasoning = SimpleNamespace(type="reasoning", id="reasoning-1")
        call = tool_call("issue_refund", {"order_id": "small"})
        client = FakeClient(
            [response([reasoning, call]), response(text="Refund simulated.")]
        )

        with patch("agent.issue_refund", return_value={"ok": True}), patch(
            "builtins.print"
        ):
            answer = run_agent(client, "Refund small")

        self.assertEqual(answer, "Refund simulated.")
        first, second = client.responses.calls
        user = {"role": "user", "content": "Refund small"}
        self.assertEqual(first["input"], [user])
        self.assertEqual(second["input"][:3], [user, reasoning, call])
        self.assertEqual(second["input"][-1]["call_id"], "call-1")
        for request in client.responses.calls:
            self.assertFalse(request["parallel_tool_calls"])
            self.assertEqual(request["include"], ["reasoning.encrypted_content"])
            self.assertFalse(request["store"])
            self.assertNotIn("previous_response_id", request)

    def test_rejects_multiple_calls_before_execution(self):
        calls = [
            tool_call("read_file", {"path": f"{index}.txt"}, f"call-{index}")
            for index in range(2)
        ]
        client = FakeClient([response(calls)])
        with patch("agent.read_file") as mocked_read:
            with self.assertRaisesRegex(RuntimeError, "more than one function call"):
                run_agent(client, "Read two files")
        mocked_read.assert_not_called()

    def test_six_tool_rounds_then_final_and_rejects_seventh(self):
        calls = [
            tool_call("read_file", {"path": f"{index}.txt"}, f"call-{index}")
            for index in range(MAX_TOOL_ROUNDS + 1)
        ]
        complete = FakeClient(
            [response([call]) for call in calls[:MAX_TOOL_ROUNDS]]
            + [response(text="Done")]
        )
        with patch("agent.read_file", return_value={"ok": True}), patch(
            "builtins.print"
        ):
            self.assertEqual(run_agent(complete, "Work"), "Done")

        rejected = FakeClient([response([call]) for call in calls])
        with patch("agent.read_file", return_value={"ok": True}) as mocked_read, patch(
            "builtins.print"
        ):
            with self.assertRaisesRegex(RuntimeError, "exceeded the 6-round tool limit"):
                run_agent(rejected, "Work")
        self.assertEqual(mocked_read.call_count, MAX_TOOL_ROUNDS)


class DefinitionTests(unittest.TestCase):
    def test_strict_schemas(self):
        expected = {
            "read_file": {"path"},
            "write_file": {"path", "content"},
            "issue_refund": {"order_id"},
        }
        self.assertEqual([tool["name"] for tool in TOOLS], list(expected))
        for tool in TOOLS:
            parameters = tool["parameters"]
            self.assertTrue(tool["strict"])
            self.assertFalse(parameters["additionalProperties"])
            self.assertEqual(set(parameters["properties"]), expected[tool["name"]])
            self.assertEqual(set(parameters["required"]), expected[tool["name"]])


if __name__ == "__main__":
    unittest.main()
