import json

from openai import OpenAI

from agent_tools import issue_refund, read_file, write_file

MODEL = "gpt-5.6-sol"
REASONING = {"effort": "high"}
MAX_TOOL_ROUNDS = 6

INSTRUCTIONS = """
You are a concise customer-support agent working with fake order data. Read files
or write requested reports only through the provided tools. To refund an order,
call issue_refund with only its order_id. The host loads orders.json, checks that
the order exists and is eligible, derives the trusted amount and reason, and
requests human approval when required. Never claim that a file write or refund
succeeded unless its tool result has ok=true. If a tool fails or approval is
denied, say so clearly.
""".strip()

TOOLS = [
    {
        "type": "function",
        "name": "read_file",
        "description": "Read one UTF-8 text file from the fixed local sandbox.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "A path relative to the sandbox directory.",
                }
            },
            "required": ["path"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "write_file",
        "description": "Create or overwrite any UTF-8 text file whose path stays inside the fixed local sandbox.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "A destination path relative to the sandbox directory.",
                },
                "content": {
                    "type": "string",
                    "description": "The complete text to write.",
                },
            },
            "required": ["path", "content"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "issue_refund",
        "description": "Validate a fake order and simulate its trusted refund under host approval policy.",
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "The order identifier to refund.",
                }
            },
            "required": ["order_id"],
            "additionalProperties": False,
        },
        "strict": True,
    },
]


def run_agent(client, user_input):
    tools_by_name = {
        "read_file": read_file,
        "write_file": write_file,
        "issue_refund": issue_refund,
    }
    history = [{"role": "user", "content": user_input}]
    tool_rounds = 0
    while True:
        response = client.responses.create(
            model=MODEL,
            reasoning=REASONING,
            instructions=INSTRUCTIONS,
            tools=TOOLS,
            parallel_tool_calls=False,
            input=list(history),
            include=["reasoning.encrypted_content"],
            store=False,
        )

        history.extend(response.output)
        tool_calls = [item for item in response.output if item.type == "function_call"]
        if not tool_calls:
            if not response.output_text.strip():
                raise RuntimeError("The agent returned no final answer.")
            return response.output_text.strip()
        if len(tool_calls) > 1:
            raise RuntimeError("The agent returned more than one function call in a single round.")
        if tool_rounds == MAX_TOOL_ROUNDS:
            raise RuntimeError(f"Agent exceeded the {MAX_TOOL_ROUNDS}-round tool limit.")

        tool_call = tool_calls[0]
        arguments = json.loads(tool_call.arguments)
        selected_tool = tools_by_name.get(tool_call.name)
        if selected_tool is None:
            raise ValueError(f"Unknown tool requested: {tool_call.name}")
        result = selected_tool(**arguments)
        history.append(
            {
                "type": "function_call_output",
                "call_id": tool_call.call_id,
                "output": json.dumps(result),
            }
        )
        tool_rounds += 1


def main():
    client = OpenAI()
    user_input = input("You: ")
    answer = run_agent(client, user_input)
    print("Agent:", answer)


if __name__ == "__main__":
    main()
