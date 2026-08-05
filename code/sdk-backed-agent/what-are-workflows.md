# Workflows, Tools, and an SDK-Backed AI Agent

An AI-powered workflow follows a developer-defined sequence and uses a model inside fixed steps. An AI agent gives the model limited freedom to choose what the application should do next.

The distinction is about **control flow**, not merely whether the program calls an AI model.

## Why This Example Is Agentic

This program exposes two strict Responses API function tools:

- `summarize_text(text)` summarizes supplied source text through a separate model call;
- `create_pdf(title, content)` creates a deterministic local PDF.

The model can return a native `function_call`, inspect the correlated `function_call_output`, choose another tool, or produce its final response. It may use one tool, sequence both tools, or finish without another call.

```text
user goal
  -> model chooses a function call
  -> Python runs the selected tool
  -> correlated function_call_output returns to the model
  -> model chooses again or finishes
```

Because the model selects part of the execution path, the outer loop is an agent. It executes at most six tool-bearing responses, then makes one final-answer request so the model can consume the sixth result. A seventh tool call is rejected before execution. `parallel_tool_calls=False` keeps dependent operations explicit.

## What the SDK Provides

Unlike `../primitive-agent/`, this version uses the Responses API's native tool protocol:

- each tool has a JSON Schema;
- strict mode rejects missing or extra model-generated arguments;
- tool requests arrive as typed `function_call` items;
- each result is returned with the matching `call_id`;
- each complete `response.output` is appended to local history, including its reasoning items; and
- the next request replays that history plus correlated `function_call_output` items.

The agent requests encrypted reasoning content so reasoning items can be replayed with the rest of each complete output. Every request sets `store=False`, and the in-process history supplies all conversation context.

Python still owns execution. A function call from the model is only a request; the program verifies the tool name, parses the arguments, runs local code, and sends the result back.

Native tools make the protocol more reliable, but they do not remove the need for permission boundaries or application-level validation.

## The Tools Are Deterministic Workflows

The outer loop is agentic, but each tool follows fixed code:

```text
summarize_text
  -> validate non-empty text
  -> apply fixed summarizer instructions
  -> make one model request
  -> return plain-text summary

create_pdf
  -> validate content and size
  -> generate a safe filename
  -> build PDF bytes
  -> write under generated-pdfs/
  -> return metadata and path
```

The public schema exposes PDF creation only as `create_pdf(title, content)`. The dispatch table mirrors that boundary, so model-generated calls cannot supply the helper-only `output_dir` parameter or redirect files outside the project output directory.

## Workflow Versus Agent

| Workflow | AI agent |
| --- | --- |
| Follows developer-defined stages | Selects at least some actions dynamically |
| Uses fixed transitions | Can react to tool results |
| Calls a model at known points | May choose when and which tools to call |
| Stops at a programmed endpoint | May decide when its answer is complete |
| Easier to predict and test | More flexible but less predictable |

Agent systems commonly combine both patterns: a model-directed loop orchestrates narrow tools, while normal code keeps each tool predictable and permission-limited.

## Constrained Agency

This teaching agent is deliberately bounded:

- exactly two strict tools are available;
- parallel tool calls are disabled;
- at most six tool-bearing responses execute, followed by one final-answer request;
- unknown tool names are rejected;
- source text is treated as untrusted data;
- PDF content is capped at 12,000 characters;
- generated filenames are controlled by code; and
- PDF dispatch cannot override `generated-pdfs/`.

The model selects among available actions, but it cannot invent a new executable capability.

## A Practical Rule

Ask:

> Does the model only produce a result inside a predefined step, or does it decide what the program should do next?

Here the model emits native tool calls or the final answer, so the outer program is agentic. The individual summarization and PDF functions remain deterministic workflows.
