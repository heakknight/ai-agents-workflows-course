import {
  LogLevel,
  env,
  pipeline,
  type Message,
  type ProgressInfo,
} from "@huggingface/transformers";
import initLiteParse, { LiteParse } from "@llamaindex/liteparse-wasm";

import {
  MAP_MAX_NEW_TOKENS,
  MAX_PDF_PAGES,
  REDUCE_MAX_NEW_TOKENS,
  WorkflowPolicyError,
  normalizeText,
  prepareSourceChunks,
  runSequentialMapReduce,
  validateFile,
  type SummarizeRequest,
  type SupportedFileKind,
  type WorkflowErrorCode,
  type WorkflowEvent,
} from "./workflow.ts";

export const MODEL_ID = "onnx-community/gemma-4-E2B-it-ONNX";
export const MODEL_REVISION =
  "9f4bef82ea6e296bc69f8a2f5939f73af81b07a6";

const MIN_PDF_TEXT_CHARACTERS = 20;
const TEXT_ONLY_SESSION_PREFIXES = [
  "onnx/embed_tokens",
  "onnx/decoder_model_merged",
] as const;

const MAP_PROMPT = (source: string) => `Summarize the source text below accurately and concisely. Preserve its main facts and conclusions. Do not add information that is not present in the source. Return only the summary.\n\nSOURCE TEXT\n${source}\n\nSUMMARY`;

const REDUCE_PROMPT = (summaries: readonly string[]) => `Combine the ordered partial summaries below into one accurate, concise document summary. Preserve the main facts and conclusions, remove repetition, and do not add information. Return only the final summary.\n\nPARTIAL SUMMARIES\n${summaries
  .map((summary, index) => `${index + 1}. ${summary}`)
  .join("\n\n")}\n\nFINAL SUMMARY`;

type WorkerScope = {
  navigator: Navigator;
  postMessage: (event: WorkflowEvent) => void;
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<SummarizeRequest>) => void,
  ) => void;
};

const workerScope = self as unknown as WorkerScope;

// Transformers.js 4.2.0 does not forward `revision` to its file-discovery
// preflight. Pinning the worker's public URL template as well as the pipeline
// option keeps every Hub request on the immutable model commit.
env.remotePathTemplate = `{model}/resolve/${MODEL_REVISION}/`;
env.logLevel = LogLevel.NONE;

class WorkerFailure extends Error {
  readonly code: WorkflowErrorCode;

  constructor(code: WorkflowErrorCode, message: string) {
    super(message);
    this.name = "WorkerFailure";
    this.code = code;
  }
}

function post(event: WorkflowEvent): void {
  workerScope.postMessage(event);
}

function postFailure(
  error: unknown,
  fallbackCode: WorkflowErrorCode,
  fallbackMessage: string,
): void {
  if (error instanceof WorkerFailure || error instanceof WorkflowPolicyError) {
    post({ type: "error", code: error.code, message: error.message });
    return;
  }

  post({ type: "error", code: fallbackCode, message: fallbackMessage });
}

function hasWebGpu(navigator: Navigator): boolean {
  return "gpu" in navigator && Boolean(navigator.gpu);
}

let liteParseReady: ReturnType<typeof initLiteParse> | null = null;

async function ensureLiteParse(): Promise<void> {
  liteParseReady ??= initLiteParse();
  try {
    await liteParseReady;
  } catch (error) {
    liteParseReady = null;
    throw error;
  }
}

async function extractPdfText(file: File): Promise<string> {
  await ensureLiteParse();

  const parser = new LiteParse({
    ocrEnabled: false,
    outputFormat: "text",
    maxPages: MAX_PDF_PAGES + 1,
    quiet: true,
  });

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await parser.parse(bytes);

    if (result.pages.length > MAX_PDF_PAGES) {
      throw new WorkerFailure(
        "pdf-page-limit",
        `PDFs are limited to ${MAX_PDF_PAGES} pages.`,
      );
    }

    const text = normalizeText(result.text);
    if (text.length < MIN_PDF_TEXT_CHARACTERS) {
      throw new WorkerFailure(
        "ocr-not-supported",
        "No usable PDF text layer was found. Scanned PDFs and OCR are not supported.",
      );
    }

    return text;
  } finally {
    parser.free();
  }
}

async function extractDocumentText(
  file: File,
  kind: SupportedFileKind,
): Promise<string> {
  if (kind === "pdf") {
    return extractPdfText(file);
  }

  const text = normalizeText(await file.text());
  if (!text) {
    throw new WorkerFailure(
      "empty-document",
      "The document does not contain any text to summarize.",
    );
  }

  return text;
}

function reportModelProgress(info: ProgressInfo): void {
  if (
    "file" in info &&
    info.file.startsWith("onnx/") &&
    !TEXT_ONLY_SESSION_PREFIXES.some((prefix) => info.file.startsWith(prefix))
  ) {
    throw new Error("Transformers.js requested a non-text model session.");
  }

  if (info.status === "progress") {
    post({
      type: "loading-model",
      file: info.file,
      loaded: info.loaded,
      total: info.total,
    });
  } else if (
    info.status === "initiate" ||
    info.status === "download" ||
    info.status === "done"
  ) {
    post({ type: "loading-model", file: info.file });
  }
}

function createTextGenerator() {
  return pipeline("text-generation", MODEL_ID, {
    revision: MODEL_REVISION,
    device: "webgpu",
    dtype: "q4f16",
    progress_callback: reportModelProgress,
  });
}

type TextGenerator = Awaited<ReturnType<typeof createTextGenerator>>;

let generatorPromise: Promise<TextGenerator> | null = null;

async function getTextGenerator(): Promise<TextGenerator> {
  generatorPromise ??= createTextGenerator();
  try {
    return await generatorPromise;
  } catch (error) {
    generatorPromise = null;
    throw error;
  }
}

function countTokens(generator: TextGenerator, text: string): number {
  const encoded = generator.tokenizer(text, { add_special_tokens: false });
  const tokenCount = encoded.input_ids.dims.at(-1);

  if (tokenCount === undefined) {
    throw new Error("Tokenizer returned no token dimension.");
  }

  return tokenCount;
}

async function generateSummary(
  generator: TextGenerator,
  prompt: string,
  maxNewTokens: number,
): Promise<string> {
  const messages: Message[] = [{ role: "user", content: prompt }];
  const output = await generator(messages, {
    max_new_tokens: maxNewTokens,
    do_sample: false,
    return_full_text: false,
    tokenizer_encode_kwargs: { enable_thinking: false },
  });
  const content = output.at(0)?.generated_text.at(-1)?.content;
  const summary = typeof content === "string" ? normalizeText(content) : "";

  if (!summary) {
    throw new Error("Generation returned no summary.");
  }

  return summary;
}

async function processRequest(request: SummarizeRequest): Promise<void> {
  const validation = validateFile(request.file);
  if (!validation.ok) {
    post({ type: "error", ...validation.error });
    return;
  }

  post({ type: "parsing" });

  let text: string;
  try {
    text = await extractDocumentText(request.file, validation.kind);
  } catch (error) {
    postFailure(
      error,
      "parse-failed",
      "The document could not be parsed in this browser.",
    );
    return;
  }

  if (!hasWebGpu(workerScope.navigator)) {
    post({
      type: "error",
      code: "webgpu-unavailable",
      message:
        "This demo requires WebGPU in a supported desktop Chromium browser.",
    });
    return;
  }

  post({ type: "loading-model" });

  let generator: TextGenerator;
  try {
    generator = await getTextGenerator();
  } catch {
    post({
      type: "error",
      code: "model-load-failed",
      message:
        "Gemma 4 could not be loaded with WebGPU. Check browser and GPU compatibility, then try again.",
    });
    return;
  }

  let chunks: string[];
  try {
    chunks = await prepareSourceChunks(text, (source) =>
      countTokens(generator, source),
    );
  } catch (error) {
    postFailure(
      error,
      "generation-failed",
      "The document could not be tokenized for summarization.",
    );
    return;
  }

  try {
    const summary = await runSequentialMapReduce(
      chunks,
      {
        map: (chunk) =>
          generateSummary(generator, MAP_PROMPT(chunk), MAP_MAX_NEW_TOKENS),
        reduce: (partialSummaries) => {
          post({ type: "summarizing", phase: "reduce" });
          return generateSummary(
            generator,
            REDUCE_PROMPT(partialSummaries),
            REDUCE_MAX_NEW_TOKENS,
          );
        },
      },
      (current, total) => {
        post({ type: "summarizing", phase: "map", current, total });
      },
    );

    post({ type: "result", summary });
  } catch {
    post({
      type: "error",
      code: "generation-failed",
      message: "Gemma 4 could not complete the summary. Please try again.",
    });
  }
}

let busy = false;

workerScope.addEventListener("message", (event) => {
  if (event.data.type !== "summarize") {
    return;
  }

  if (busy) {
    post({
      type: "error",
      code: "worker-busy",
      message: "A document is already being processed.",
    });
    return;
  }

  busy = true;
  void processRequest(event.data)
    .catch(() => {
      post({
        type: "error",
        code: "generation-failed",
        message: "The browser worker could not complete the workflow.",
      });
    })
    .finally(() => {
      busy = false;
    });
});
