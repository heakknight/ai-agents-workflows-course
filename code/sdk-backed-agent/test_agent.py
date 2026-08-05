import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from agent import INSTRUCTIONS, MAX_TOOL_ROUNDS, TOOLS, build_tool_functions, run_agent
from agent_tools import MODEL, REASONING, create_pdf, summarize_text


class FakeResponses:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return self._responses.pop(0)


class FakeClient:
    def __init__(self, responses):
        self.responses = FakeResponses(responses)


class AgentToolsTests(unittest.TestCase):
    def test_summarizer_is_stateless_and_disables_storage(self):
        client = FakeClient([SimpleNamespace(status="completed", output_text="A concise summary.")])

        result = summarize_text("Source text", client=client)

        self.assertEqual(result, "A concise summary.")
        request = client.responses.calls[0]
        self.assertEqual(request["model"], "gpt-5.6-sol")
        self.assertEqual(request["reasoning"], {"effort": "high"})
        self.assertIn("<source>\nSource text\n</source>", request["input"])
        self.assertIs(request["store"], False)
        self.assertNotIn("previous_response_id", request)

    def test_pdf_tool_creates_a_real_pdf(self):
        with tempfile.TemporaryDirectory() as directory:
            result = create_pdf(
                "Summary",
                "Overview\n- First point\n- Second point",
                output_dir=directory,
            )
            pdf_path = Path(result["path"])

            self.assertTrue(result["success"])
            self.assertEqual(result["pageCount"], 1)
            self.assertTrue(pdf_path.exists())
            self.assertTrue(pdf_path.read_bytes().startswith(b"%PDF-1.4"))
            self.assertTrue(pdf_path.read_bytes().endswith(b"%%EOF\n"))

    def test_pdf_tool_rejects_empty_content(self):
        with self.assertRaisesRegex(ValueError, "required"):
            create_pdf("Empty", "")

    def test_dispatch_cannot_override_pdf_output_directory(self):
        functions = build_tool_functions(FakeClient([]))
        with self.assertRaises(TypeError):
            functions["create_pdf"]("Title", "Content", output_dir="/tmp/escape")

    def test_sdk_loop_resends_complete_local_history_with_reasoning(self):
        reasoning_item = SimpleNamespace(type="reasoning", id="reasoning-1")
        tool_call = SimpleNamespace(
            type="function_call",
            name="summarize_text",
            arguments='{"text":"Source"}',
            call_id="call-1",
        )
        client = FakeClient(
            [
                SimpleNamespace(output=[reasoning_item, tool_call], output_text=""),
                SimpleNamespace(output=[], output_text="A summary."),
            ]
        )
        calls = []

        answer = run_agent(
            client,
            "Summarize Source",
            tool_functions={
                "summarize_text": lambda text: calls.append(text) or "A summary.",
                "create_pdf": lambda title, content: {},
            },
            log=lambda _message: None,
        )

        self.assertEqual(answer, "A summary.")
        self.assertEqual(calls, ["Source"])
        first_request, second_request = client.responses.calls
        user_item = {"role": "user", "content": "Summarize Source"}
        tool_output = {
            "type": "function_call_output",
            "call_id": "call-1",
            "output": "A summary.",
        }
        self.assertEqual(first_request["input"], [user_item])
        self.assertEqual(second_request["input"], [user_item, reasoning_item, tool_call, tool_output])
        self.assertEqual(first_request["model"], MODEL)
        self.assertEqual(first_request["reasoning"], REASONING)
        self.assertEqual(first_request["tools"], TOOLS)
        self.assertFalse(first_request["parallel_tool_calls"])
        for request in client.responses.calls:
            self.assertEqual(request["include"], ["reasoning.encrypted_content"])
            self.assertIs(request["store"], False)
            self.assertNotIn("previous_response_id", request)

    def test_sdk_loop_rejects_multiple_function_calls_before_execution(self):
        tool_calls = [
            SimpleNamespace(
                type="function_call",
                name="summarize_text",
                arguments=f'{{"text":"Source {index}"}}',
                call_id=f"call-{index}",
            )
            for index in range(2)
        ]
        client = FakeClient([SimpleNamespace(output=tool_calls, output_text="")])
        executed = []

        with self.assertRaisesRegex(RuntimeError, "more than one function call"):
            run_agent(
                client,
                "Summarize sources",
                tool_functions={
                    "summarize_text": lambda text: executed.append(text),
                    "create_pdf": lambda title, content: executed.append(content),
                },
                log=lambda _message: None,
            )

        self.assertEqual(executed, [])
        self.assertFalse(client.responses.calls[0]["parallel_tool_calls"])

    def test_sdk_loop_allows_six_tool_rounds_then_requests_final_answer(self):
        tool_calls = [
            SimpleNamespace(
                type="function_call",
                name="summarize_text",
                arguments=f'{{"text":"Source {index}"}}',
                call_id=f"call-{index}",
            )
            for index in range(MAX_TOOL_ROUNDS)
        ]
        responses = [
            SimpleNamespace(output=[tool_call], output_text="") for tool_call in tool_calls
        ] + [SimpleNamespace(output=[], output_text="Final answer.")]
        client = FakeClient(responses)
        executed = []

        answer = run_agent(
            client,
            "Summarize source",
            tool_functions={
                "summarize_text": lambda text: executed.append(text) or "Summary",
                "create_pdf": lambda title, content: {},
            },
            log=lambda _message: None,
        )

        self.assertEqual(answer, "Final answer.")
        self.assertEqual(len(client.responses.calls), 7)
        self.assertEqual(len(executed), 6)
        self.assertIs(client.responses.calls[-1]["input"][-2], tool_calls[-1])
        self.assertEqual(
            client.responses.calls[-1]["input"][-1],
            {
                "type": "function_call_output",
                "call_id": "call-5",
                "output": "Summary",
            },
        )

    def test_sdk_loop_rejects_seventh_tool_call_before_execution(self):
        responses = [
            SimpleNamespace(
                output=[
                    SimpleNamespace(
                        type="function_call",
                        name="summarize_text",
                        arguments=f'{{"text":"Source {index}"}}',
                        call_id=f"call-{index}",
                    )
                ],
                output_text="",
            )
            for index in range(MAX_TOOL_ROUNDS + 1)
        ]
        client = FakeClient(responses)
        executed = []

        with self.assertRaisesRegex(RuntimeError, "exceeded the 6-round tool limit"):
            run_agent(
                client,
                "Summarize source",
                tool_functions={
                    "summarize_text": lambda text: executed.append(text) or "Summary",
                    "create_pdf": lambda title, content: {},
                },
                log=lambda _message: None,
            )

        self.assertEqual(len(client.responses.calls), 7)
        self.assertEqual(len(executed), 6)

    def test_agent_prompt_defines_summary_and_pdf_behavior(self):
        normalized = " ".join(INSTRUCTIONS.split())

        self.assertIn("Use summarize_text for every summary request", normalized)
        self.assertIn("Use create_pdf only when the user explicitly requests a PDF", normalized)
        self.assertIn("pass only that summary to create_pdf", normalized)
        self.assertIn("include the generated PDF path", normalized)
        self.assertNotIn("teaching", normalized.lower())
        self.assertNotIn("educational", normalized.lower())

    def test_tool_schemas_match_the_two_example_tools(self):
        self.assertEqual([tool["name"] for tool in TOOLS], ["summarize_text", "create_pdf"])
        self.assertTrue(all(tool["strict"] for tool in TOOLS))


if __name__ == "__main__":
    unittest.main()
