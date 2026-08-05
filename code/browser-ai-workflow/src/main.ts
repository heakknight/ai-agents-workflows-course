import "./styles.css";

import {
  FILE_ACCEPT,
  validateFile,
  type SummarizeRequest,
  type WorkflowEvent,
} from "./workflow.ts";

type ViewState = "idle" | "working" | "result" | "error";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing interface element: ${selector}`);
  }
  return element;
}

const app = requireElement<HTMLElement>("#app");
const fileInput = requireElement<HTMLInputElement>("#document-file");
const dropRegion = requireElement<HTMLDivElement>("#drop-region");
const statusRow = requireElement<HTMLDivElement>("#status-row");
const statusText = requireElement<HTMLParagraphElement>("#status");
const spinner = requireElement<HTMLSpanElement>(".spinner");
const errorText = requireElement<HTMLParagraphElement>("#error");
const summaryCard = requireElement<HTMLElement>("#summary-card");
const summaryText = requireElement<HTMLParagraphElement>("#summary");

fileInput.accept = FILE_ACCEPT;

let viewState: ViewState = "idle";
let dragDepth = 0;

function setDragActive(active: boolean): void {
  dropRegion.classList.toggle("is-drag-active", active && viewState !== "working");
}

function setViewState(nextState: ViewState): void {
  viewState = nextState;
  const working = nextState === "working";

  app.dataset.state = nextState;
  fileInput.disabled = working;
  dropRegion.dataset.disabled = String(working);
  dropRegion.setAttribute("aria-disabled", String(working));
  dropRegion.setAttribute("aria-busy", String(working));
  spinner.hidden = !working;

  if (working) {
    dragDepth = 0;
    setDragActive(false);
  }
}

function setStatus(message: string): void {
  statusText.textContent = message;
  statusRow.hidden = false;
}

function clearOutput(): void {
  errorText.textContent = "";
  errorText.hidden = true;
  summaryText.textContent = "";
  summaryCard.hidden = true;
}

function showError(message: string): void {
  summaryText.textContent = "";
  summaryCard.hidden = true;
  statusText.textContent = "";
  statusRow.hidden = true;
  errorText.textContent = message;
  errorText.hidden = false;
  setViewState("error");
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function displayFileName(file: string): string {
  return file.split("/").at(-1) || file;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled worker event: ${String(value)}`);
}

function handleWorkerMessage(event: MessageEvent<WorkflowEvent>): void {
  const message = event.data;

  switch (message.type) {
    case "parsing":
      setStatus("Reading and parsing the document…");
      break;
    case "loading-model": {
      if (
        message.file &&
        message.loaded !== undefined &&
        message.total !== undefined &&
        message.total > 0
      ) {
        setStatus(
          `Downloading ${displayFileName(message.file)}: ${formatBytes(message.loaded)} of ${formatBytes(message.total)}…`,
        );
      } else if (message.file) {
        setStatus(`Loading ${displayFileName(message.file)}…`);
      } else {
        setStatus("Loading Gemma 4…");
      }
      break;
    }
    case "summarizing":
      setStatus(
        message.phase === "map"
          ? `Summarizing section ${message.current} of ${message.total}…`
          : "Creating the final summary…",
      );
      break;
    case "result":
      errorText.textContent = "";
      errorText.hidden = true;
      summaryText.textContent = message.summary;
      summaryCard.hidden = false;
      setStatus("Summary ready.");
      setViewState("result");
      break;
    case "error":
      showError(message.message);
      break;
    default:
      assertNever(message);
  }
}

function handleWorkerError(event: ErrorEvent): void {
  event.preventDefault();

  const failedWorker = worker;
  if (failedWorker === null || event.currentTarget !== failedWorker) {
    return;
  }

  failedWorker.terminate();
  worker = null;
  showError(
    "The processing worker stopped unexpectedly. Reload the page if another attempt does not start.",
  );
}

function createWorker(): Worker {
  const nextWorker = new Worker(
    new URL("./processing.worker.ts", import.meta.url),
    { type: "module" },
  );
  nextWorker.addEventListener("message", handleWorkerMessage);
  nextWorker.addEventListener("error", handleWorkerError);
  return nextWorker;
}

let worker: Worker | null = createWorker();

function submitFile(file: File): void {
  fileInput.value = "";

  if (viewState === "working") {
    return;
  }

  const validation = validateFile(file);
  if (!validation.ok) {
    showError(validation.error.message);
    return;
  }

  if (worker === null) {
    worker = createWorker();
  }

  clearOutput();
  setViewState("working");
  setStatus("Preparing the document…");

  const request: SummarizeRequest = { type: "summarize", file };
  worker.postMessage(request);
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.item(0);
  if (file) {
    submitFile(file);
  }
});

function isFileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

dropRegion.addEventListener("dragenter", (event) => {
  if (!isFileDrag(event)) {
    return;
  }

  event.preventDefault();
  if (viewState === "working") {
    return;
  }

  dragDepth += 1;
  setDragActive(true);
});

dropRegion.addEventListener("dragover", (event) => {
  if (!isFileDrag(event)) {
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = viewState === "working" ? "none" : "copy";
  }
});

dropRegion.addEventListener("dragleave", (event) => {
  if (viewState === "working" || dragDepth === 0) {
    return;
  }

  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    setDragActive(false);
  }
});

dropRegion.addEventListener("drop", (event) => {
  if (!isFileDrag(event)) {
    return;
  }

  event.preventDefault();
  dragDepth = 0;
  setDragActive(false);

  if (viewState === "working") {
    return;
  }

  const file = event.dataTransfer?.files.item(0);
  if (file) {
    submitFile(file);
  }
});
