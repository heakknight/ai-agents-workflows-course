# Workflows, Tools, and AI Agents

An AI-powered workflow follows a developer-defined sequence and uses a model inside one or more fixed steps. An AI agent goes further: the model can choose at least part of what the application should do next.

That distinction is about **control flow**, not about whether a model is present.

## The Agent in This Project

The main n8n workflow receives a chat request and gives an AI Agent node exactly two tools:

- `summarize_text(text)` calls a separate, guarded summarization workflow;
- `create_pdf(title, content)` creates a deterministic local PDF.

The model can decide to:

- call only `summarize_text` for a normal summary;
- call only `create_pdf` for supplied content that should become a PDF;
- call `summarize_text` and then pass its result to `create_pdf`; or
- return a final chat response without another tool call.

The selected path therefore is not fully programmed in advance. The model chooses among allowed actions based on the user's goal and the results returned by earlier tool calls. That makes the main workflow agentic.

```text
chat request
  -> AI agent
      -> maybe summarize_text
      -> maybe create_pdf
      -> maybe use one result in the next call
  -> final response
```

## The Tools Are Still Workflows

An agent does not make ordinary application logic disappear. Each tool has a narrow, predictable implementation:

```text
summarize_text
  -> receive text
  -> apply fixed summarizer instructions
  -> call the configured model
  -> return summary

create_pdf
  -> validate title and content
  -> generate a safe filename
  -> build PDF bytes
  -> write only under generated-pdfs/
  -> return the exact path
```

These helper workflows do not choose what to do next. The agent chooses **which** helper to invoke; normal n8n nodes control **how** each helper performs its job.

This composition is common in agent systems:

- model-directed orchestration at the top;
- deterministic, permission-limited tools underneath.

## Workflow Versus Agent

| Workflow | AI agent |
| --- | --- |
| Follows developer-defined stages | Selects at least some actions dynamically |
| Uses fixed transitions and conditions | Can react to tool results |
| Calls a model at known points | May choose when and which tools to call |
| Stops at a programmed endpoint | May decide when its answer is complete |
| Easier to predict and test | More flexible but less predictable |

Compare this project with `../basic-visual-ai-workflow/`. That project always validates an upload, extracts text, summarizes once, and displays the result. This project instead receives a broader request and lets the model choose between two capabilities.

## Constrained Agency

Being agentic does not mean unrestricted autonomy. The harness around the model still defines the boundaries:

- only two tools are available;
- helper inputs have explicit fields;
- the summarizer treats supplied text as untrusted data;
- PDF creation is allowed only for explicit PDF requests;
- PDF content is capped at 12,000 characters;
- filesystem access is restricted to `generated-pdfs/`;
- the private chat trigger is not published; and
- credentials remain in ignored, encrypted local n8n state.

The model chooses among permitted actions, but it cannot invent a new executable tool or bypass the code behind an existing one.

## Why Use an Agent Here?

A fixed workflow could implement three separate buttons for "summarize," "create PDF," and "summarize to PDF." The agent instead interprets a natural-language goal and composes the available capabilities when needed.

That flexibility is useful for teaching tool selection and multi-step orchestration. It also introduces costs:

- more model calls may be made;
- the exact sequence can vary;
- tool descriptions and instructions must be clear;
- permissions and stopping behavior require attention; and
- tests must cover tool boundaries as well as individual operations.

If a single fixed sequence solves the task, a workflow is usually simpler. Use an agent when model-directed action selection provides real value.

## A Practical Rule

Ask:

> Does the model only produce a result inside a predefined step, or does it decide what the application should do next?

In this project, the AI Agent node can choose and sequence tools. The helper tools remain deterministic workflows, while the top-level system has agentic behavior.
