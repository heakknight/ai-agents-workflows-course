import { describe, expect, it } from "vitest";

import {
  MAP_MAX_NEW_TOKENS,
  MAP_SOURCE_TOKEN_BUDGET,
  MAX_FILE_SIZE_BYTES,
  MAX_MAP_CHUNKS,
  MAX_PDF_PAGES,
  MAX_SOURCE_TOKENS,
  REDUCE_MAX_NEW_TOKENS,
  classifyFile,
  normalizeText,
  packParagraphs,
  prepareSourceChunks,
  runSequentialMapReduce,
  validateFile,
  type FileDescriptor,
} from "./workflow.ts";

const file = (
  name: string,
  size = 1,
  type?: string,
): FileDescriptor => ({ name, size, type });

const countWords = async (text: string): Promise<number> => {
  const normalized = text.trim();
  return normalized ? normalized.split(/\s+/).length : 0;
};

describe("workflow policy", () => {
  it("exposes the fixed document and model-work limits", () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(20 * 1024 * 1024);
    expect(MAX_PDF_PAGES).toBe(50);
    expect(MAX_SOURCE_TOKENS).toBe(15_000);
    expect(MAX_MAP_CHUNKS).toBe(10);
    expect(MAP_SOURCE_TOKEN_BUDGET).toBe(1_800);
    expect(MAP_MAX_NEW_TOKENS).toBe(160);
    expect(REDUCE_MAX_NEW_TOKENS).toBe(256);
  });
});

describe("file classification and validation", () => {
  it.each([
    ["report.pdf", "pdf"],
    ["notes.txt", "text"],
    ["README.MD", "markdown"],
  ] as const)("classifies %s as %s", (name, expectedKind) => {
    expect(classifyFile(name)).toBe(expectedKind);
    expect(validateFile(file(name))).toEqual({
      ok: true,
      kind: expectedKind,
    });
  });

  it.each([
    file("notes.txt", 12),
    file("notes.txt", 12, ""),
    file("notes.txt", 12, "application/octet-stream"),
    file("notes.md", 12, "text/plain"),
    file("report.pdf", 12, "text/plain"),
  ])("accepts a supported extension despite MIME uncertainty", (candidate) => {
    expect(validateFile(candidate).ok).toBe(true);
  });

  it("does not treat a supported MIME hint as a supported extension", () => {
    const result = validateFile(file("notes.csv", 12, "text/plain"));

    expect(result).toMatchObject({
      ok: false,
      error: { code: "unsupported-file-type" },
    });
  });

  it("returns a semantic error for an empty file", () => {
    const result = validateFile(file("notes.txt", 0));

    expect(result).toMatchObject({
      ok: false,
      error: { code: "empty-file" },
    });
  });

  it("returns a semantic error for an oversized file", () => {
    const result = validateFile(
      file("notes.txt", MAX_FILE_SIZE_BYTES + 1, "text/plain"),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "file-too-large" },
    });
  });
});

describe("normalizeText", () => {
  it("normalizes line endings, horizontal whitespace, and blank lines", () => {
    expect(
      normalizeText(
        "  First\t  paragraph \r\n\r\n\r\n Second\u00a0paragraph  \rLast line  ",
      ),
    ).toBe("First paragraph\n\nSecond paragraph\nLast line");
  });

  it("normalizes whitespace-only text to an empty string", () => {
    expect(normalizeText(" \t\r\n\n ")).toBe("");
  });
});

describe("source chunk preparation", () => {
  it("rejects a source above the fixed token limit without truncating", async () => {
    await expect(
      prepareSourceChunks("complete source", () => MAX_SOURCE_TOKENS + 1),
    ).rejects.toMatchObject({ code: "source-token-limit" });
  });

  it("uses the fixed map-source budget", async () => {
    const source = Array.from({ length: MAP_SOURCE_TOKEN_BUDGET + 1 }, () =>
      "word",
    ).join(" ");

    const chunks = await prepareSourceChunks(source, countWords);

    expect(chunks).toHaveLength(2);
    expect(await countWords(chunks[0] ?? "")).toBe(MAP_SOURCE_TOKEN_BUDGET);
    expect(await countWords(chunks[1] ?? "")).toBe(1);
  });
});

describe("sequential map/reduce", () => {
  it("maps in source order and performs exactly one final reduction", async () => {
    const calls: string[] = [];
    let activeMaps = 0;
    let maxActiveMaps = 0;
    let reduceCalls = 0;

    const result = await runSequentialMapReduce(
      ["first", "second", "third"],
      {
        map: async (chunk, index, total) => {
          activeMaps += 1;
          maxActiveMaps = Math.max(maxActiveMaps, activeMaps);
          calls.push(`map:${index + 1}/${total}:${chunk}`);
          await Promise.resolve();
          activeMaps -= 1;
          return `summary-${chunk}`;
        },
        reduce: async (summaries) => {
          reduceCalls += 1;
          calls.push(`reduce:${summaries.join("|")}`);
          return "final";
        },
      },
    );

    expect(result).toBe("final");
    expect(maxActiveMaps).toBe(1);
    expect(reduceCalls).toBe(1);
    expect(calls).toEqual([
      "map:1/3:first",
      "map:2/3:second",
      "map:3/3:third",
      "reduce:summary-first|summary-second|summary-third",
    ]);
  });
});

describe("packParagraphs", () => {
  it("preserves source order while packing paragraphs within the budget", async () => {
    const chunks = await packParagraphs(
      ["one two", "three", "four five", "six"],
      countWords,
      3,
    );

    expect(chunks).toEqual(["one two\n\nthree", "four five\n\nsix"]);
    expect(chunks.flatMap((chunk) => chunk.split(/\s+/))).toEqual([
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
    ]);

    for (const chunk of chunks) {
      expect(await countWords(chunk)).toBeLessThanOrEqual(3);
    }
  });

  it("splits an overlong paragraph without exceeding the budget", async () => {
    const chunks = await packParagraphs(
      ["one two three four five six seven"],
      countWords,
      3,
    );

    expect(chunks).toEqual(["one two three", "four five six", "seven"]);
  });

  it("splits an overlong unbroken source unit", async () => {
    const countCharacters = (text: string) => Array.from(text).length;

    await expect(
      packParagraphs(["abcdefgh"], countCharacters, 3),
    ).resolves.toEqual(["abc", "def", "gh"]);
  });

  it("rejects input that would require more than ten chunks", async () => {
    const paragraphs = Array.from(
      { length: MAX_MAP_CHUNKS + 1 },
      (_, index) => `paragraph-${index}`,
    );

    await expect(
      packParagraphs(paragraphs, countWords, 1),
    ).rejects.toMatchObject({
      code: "too-many-chunks",
    });
  });
});
