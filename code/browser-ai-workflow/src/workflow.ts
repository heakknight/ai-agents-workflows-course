export const SUPPORTED_EXTENSIONS = [".pdf", ".txt", ".md"] as const;

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];
export type SupportedFileKind = "pdf" | "text" | "markdown";

export const SUPPORTED_MIME_HINTS = {
  pdf: ["application/pdf"],
  text: ["text/plain"],
  markdown: ["text/markdown", "text/x-markdown", "text/plain"],
} as const satisfies Record<SupportedFileKind, readonly string[]>;

export const FILE_ACCEPT = [
  ...SUPPORTED_EXTENSIONS,
  ...new Set(Object.values(SUPPORTED_MIME_HINTS).flat()),
].join(",");

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 50;
export const MAX_SOURCE_TOKENS = 15_000;
export const MAX_MAP_CHUNKS = 10;
export const MAP_SOURCE_TOKEN_BUDGET = 1_800;
export const MAP_MAX_NEW_TOKENS = 160;
export const REDUCE_MAX_NEW_TOKENS = 256;

const FILE_KIND_BY_EXTENSION: Record<SupportedExtension, SupportedFileKind> = {
  ".pdf": "pdf",
  ".txt": "text",
  ".md": "markdown",
};

export type FileValidationErrorCode =
  | "empty-file"
  | "file-too-large"
  | "unsupported-file-type";

export type WorkflowErrorCode =
  | FileValidationErrorCode
  | "empty-document"
  | "ocr-not-supported"
  | "pdf-page-limit"
  | "source-token-limit"
  | "too-many-chunks"
  | "token-budget-too-small"
  | "webgpu-unavailable"
  | "worker-busy"
  | "parse-failed"
  | "model-load-failed"
  | "generation-failed";

export interface FileDescriptor {
  name: string;
  size: number;
  type?: string;
}

export type FileValidationResult =
  | { ok: true; kind: SupportedFileKind }
  | {
      ok: false;
      error: { code: FileValidationErrorCode; message: string };
    };

export type SummarizeRequest = {
  type: "summarize";
  file: File;
};

export type WorkflowEvent =
  | { type: "parsing" }
  | {
      type: "loading-model";
      file?: string;
      loaded?: number;
      total?: number;
    }
  | {
      type: "summarizing";
      phase: "map";
      current: number;
      total: number;
    }
  | { type: "summarizing"; phase: "reduce" }
  | { type: "result"; summary: string }
  | { type: "error"; code: WorkflowErrorCode; message: string };

export function classifyFile(name: string): SupportedFileKind | null {
  const lowerName = name.trim().toLowerCase();
  const extension = SUPPORTED_EXTENSIONS.find((candidate) =>
    lowerName.endsWith(candidate),
  );

  return extension ? FILE_KIND_BY_EXTENSION[extension] : null;
}

export function validateFile(file: FileDescriptor): FileValidationResult {
  if (file.size === 0) {
    return {
      ok: false,
      error: { code: "empty-file", message: "The selected file is empty." },
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error: {
        code: "file-too-large",
        message: "The selected file exceeds the 20 MiB limit.",
      },
    };
  }

  // Browser MIME values are only hints; the supported extension is authoritative.
  const kind = classifyFile(file.name);
  if (!kind) {
    return {
      ok: false,
      error: {
        code: "unsupported-file-type",
        message: "Select a PDF, TXT, or Markdown file.",
      },
    };
  }

  return { ok: true, kind };
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type TokenCounter = (text: string) => number | Promise<number>;

export class WorkflowPolicyError extends Error {
  readonly code: Extract<
    WorkflowErrorCode,
    "source-token-limit" | "too-many-chunks" | "token-budget-too-small"
  >;

  constructor(code: WorkflowPolicyError["code"], message: string) {
    super(message);
    this.name = "WorkflowPolicyError";
    this.code = code;
  }
}

async function splitWordToBudget(
  word: string,
  countTokens: TokenCounter,
  budget: number,
): Promise<string[]> {
  const characters = Array.from(word);
  const pieces: string[] = [];
  let offset = 0;

  while (offset < characters.length) {
    let low = 1;
    let high = characters.length - offset;
    let bestLength = 0;

    while (low <= high) {
      const length = Math.floor((low + high) / 2);
      const candidate = characters.slice(offset, offset + length).join("");

      if ((await countTokens(candidate)) <= budget) {
        bestLength = length;
        low = length + 1;
      } else {
        high = length - 1;
      }
    }

    if (bestLength === 0) {
      throw new WorkflowPolicyError(
        "token-budget-too-small",
        "The token budget cannot hold the smallest source unit.",
      );
    }

    pieces.push(characters.slice(offset, offset + bestLength).join(""));
    offset += bestLength;
  }

  return pieces;
}

async function splitParagraphToBudget(
  paragraph: string,
  countTokens: TokenCounter,
  budget: number,
): Promise<string[]> {
  if ((await countTokens(paragraph)) <= budget) {
    return [paragraph];
  }

  const pieces: string[] = [];
  let current = "";

  for (const word of paragraph.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if ((await countTokens(candidate)) <= budget) {
      current = candidate;
      continue;
    }

    if (current) {
      pieces.push(current);
      current = "";
    }

    if ((await countTokens(word)) <= budget) {
      current = word;
      continue;
    }

    const wordPieces = await splitWordToBudget(word, countTokens, budget);
    pieces.push(...wordPieces.slice(0, -1));
    current = wordPieces.at(-1) ?? "";
  }

  if (current) {
    pieces.push(current);
  }

  return pieces;
}

export async function packParagraphs(
  paragraphs: readonly string[],
  countTokens: TokenCounter,
  budget: number,
): Promise<string[]> {
  if (!Number.isFinite(budget) || budget < 1) {
    throw new RangeError("Token budget must be a positive number.");
  }

  const units: Array<{ text: string; separator: string }> = [];

  for (const sourceParagraph of paragraphs) {
    const paragraph = normalizeText(sourceParagraph);
    if (!paragraph) {
      continue;
    }

    const pieces = await splitParagraphToBudget(
      paragraph,
      countTokens,
      budget,
    );

    pieces.forEach((text, index) => {
      units.push({ text, separator: index === 0 ? "\n\n" : " " });
    });
  }

  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (!current) {
      return;
    }

    chunks.push(current);
    current = "";

    if (chunks.length > MAX_MAP_CHUNKS) {
      throw new WorkflowPolicyError(
        "too-many-chunks",
        `The document requires more than ${MAX_MAP_CHUNKS} summary chunks.`,
      );
    }
  };

  for (const unit of units) {
    if (!current) {
      current = unit.text;
      continue;
    }

    const candidate = `${current}${unit.separator}${unit.text}`;
    if ((await countTokens(candidate)) <= budget) {
      current = candidate;
    } else {
      pushCurrent();
      current = unit.text;
    }
  }

  pushCurrent();
  return chunks;
}

export async function prepareSourceChunks(
  text: string,
  countTokens: TokenCounter,
): Promise<string[]> {
  const sourceTokenCount = await countTokens(text);
  if (sourceTokenCount > MAX_SOURCE_TOKENS) {
    throw new WorkflowPolicyError(
      "source-token-limit",
      `The document exceeds the ${MAX_SOURCE_TOKENS.toLocaleString()}-token source limit.`,
    );
  }

  return packParagraphs(
    text.split(/\n{2,}/),
    countTokens,
    MAP_SOURCE_TOKEN_BUDGET,
  );
}

export interface SummaryPasses {
  map: (chunk: string, index: number, total: number) => Promise<string>;
  reduce: (summaries: readonly string[]) => Promise<string>;
}

export async function runSequentialMapReduce(
  chunks: readonly string[],
  passes: SummaryPasses,
  onMapStart?: (current: number, total: number) => void,
): Promise<string> {
  if (chunks.length === 0) {
    throw new RangeError("At least one source chunk is required.");
  }

  const summaries: string[] = [];
  for (const [index, chunk] of chunks.entries()) {
    onMapStart?.(index + 1, chunks.length);
    summaries.push(await passes.map(chunk, index, chunks.length));
  }

  return passes.reduce(summaries);
}
