import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  readJsonChat,
  tokensOf,
  usageOf,
} from "../../src/adapters/gemini/parse.js";
import { emptyGeminiStats } from "../../src/index.js";
import { LEGACY, read, RESUMED, TRAPS, TWO_MODELS } from "./support.js";

const tokens = (over: Record<string, unknown>) =>
  tokensOf({ input: 0, output: 0, cached: 0, thoughts: 0, tool: 0, ...over })!;

describe("tokens", () => {
  it("accepts ccusage's key names, truncates fractions and ignores strings and negatives", () => {
    expect(
      tokensOf({
        prompt_tokens: 300.9,
        candidates: "70",
        candidates_tokens: 30,
        cached_tokens: -5,
        reasoning: 4,
        total_tokens: 334,
      }),
    ).toEqual({
      input: 300,
      output: 30,
      cached: 0,
      thoughts: 4,
      tool: 0,
      total: 334,
    });
    // Any `total` key hides `total_tokens`.
    expect(tokensOf({ total: null, total_tokens: 9 })?.total).toBeUndefined();
    expect(tokensOf("x")).toBeUndefined();
  });

  it("takes cached input out of input only when the total counts it there", () => {
    // Gemini CLI: total = input + output + thoughts + tool, cached inside input.
    expect(
      usageOf(
        tokens({
          input: 3000,
          output: 100,
          cached: 1000,
          thoughts: 50,
          tool: 20,
          total: 3170,
        }),
      ),
    ).toEqual({ input: 2020, cacheRead: 1000, output: 150 });
    // Total adds cached on top: input was fresh already.
    expect(
      usageOf(tokens({ input: 1000, output: 100, cached: 400, total: 1500 })),
    ).toEqual({ input: 1000, cacheRead: 400, output: 100 });
  });

  it("puts tokens only the total has into output when there is none, else thinking", () => {
    expect(usageOf(tokens({ input: 500, total: 800 }))).toEqual({
      input: 500,
      cacheRead: 0,
      output: 300,
    });
    expect(
      usageOf(tokens({ input: 500, output: 50, thoughts: 10, total: 700 })),
    ).toEqual({ input: 500, cacheRead: 0, output: 200 });
    expect(usageOf(tokens({ total: 0 }))).toBeUndefined();
  });
});

describe("JSONL chat", () => {
  it("reads the traps file the way ccusage does", async () => {
    const stats = emptyGeminiStats();
    const { records, subagent } = await read(TRAPS, stats);
    expect(subagent).toBe(false);
    expect(
      records.map((r) =>
        r.kind === "usage"
          ? [r.id, r.model, r.usage.input, r.usage.cacheRead, r.usage.output]
          : [r.id, r.words],
      ),
    ).toEqual([
      // displayContent is what the user typed; the tool-result-only message is no prompt.
      ["t-u1", 2],
      // t-g0 has no model and nothing before it names one: dropped. t-g1's first copy has no tokens.
      ["t-g1", "gemini-3-pro-preview", 2020, 1000, 150],
      // No model of its own: the last one named carries forward.
      ["t-g2", "gemini-3-pro-preview", 1000, 400, 100],
      ["t-g3", "gemini-2.5-flash", 500, 0, 300],
      ["t-g4", "gemini-2.5-flash", 500, 0, 200],
      ["t-g5", "gemini-2.5-flash", 600, 0, 0],
      // t-g6 used nothing; t-g7 has created_at and other key names. $set messages are never read.
      ["t-g7", "gemini-2.5-flash", 300, 0, 30],
    ]);
    expect(records.every((r) => r.sessionId.startsWith("7a0c0de2"))).toBe(true);
    expect(records.at(-1)?.ts).toBe(Date.parse("2025-10-03T10:00:10.000Z"));
    expect(stats).toMatchObject({ lines: 15, malformed: 1 });
  });

  it("keeps the last copy of a response written again, in the first copy's place", async () => {
    const stats = emptyGeminiStats();
    const { records } = await read(TWO_MODELS, stats);
    const usage = records.filter((r) => r.kind === "usage");
    expect(stats.rewritten).toBe(1);
    expect(usage).toHaveLength(4);
    expect(new Set(usage.map((r) => r.id)).size).toBe(4);
  });

  it("counts a response once when its tokens arrive in a later copy, across a resume", async () => {
    const stats = emptyGeminiStats();
    const { records } = await read(RESUMED, stats);
    const usage = records.filter((r) => r.kind === "usage");
    expect(usage).toHaveLength(8);
    expect(new Set(usage.map((r) => r.id)).size).toBe(8);
    expect(stats.rewritten).toBe(0);
  });
});

describe("JSON chat (older Gemini CLI)", () => {
  it("reads messages, dates untimed ones at the session start, drops model-less ones", () => {
    const { records } = readJsonChat(
      readFileSync(LEGACY, "utf8"),
      "stem",
      0,
      emptyGeminiStats(),
    );
    expect(
      records.map((r) =>
        r.kind === "usage"
          ? [r.id, r.ts, r.usage.input, r.usage.cacheRead, r.usage.output]
          : [r.id, r.words],
      ),
    ).toEqual([
      ["l-u1", 3],
      ["l-g1", Date.parse("2025-10-02T09:00:10.000Z"), 5000, 0, 300],
      ["l-g2", Date.parse("2025-10-02T09:00:00.000Z"), 50000, 200000, 1000],
    ]);
  });

  it("reads nothing from a file that is not a chat", () => {
    const stats = emptyGeminiStats();
    expect(readJsonChat("[]", "s", 0, stats).records).toEqual([]);
    expect(readJsonChat("{", "s", 0, stats).records).toEqual([]);
    expect(stats.malformed).toBe(1);
  });
});
