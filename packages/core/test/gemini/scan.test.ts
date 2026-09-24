import { describe, expect, it } from "vitest";
import {
  createDeduper,
  findChats,
  geminiDirs,
  listPrice,
  modelKey,
  priceFor,
} from "../../src/index.js";
import {
  GEMINI_FIXTURES,
  SUBAGENT,
  TWO_MODELS,
  scanFixtures,
} from "./support.js";

describe("discovery", () => {
  it("uses GEMINI_DATA_DIR alone, comma-separated, trimmed, deduped, ~ expanded", () => {
    expect(geminiDirs({ GEMINI_DATA_DIR: " ~/a, /b ,~/a" }, "/h")).toEqual([
      "/h/a",
      "/b",
    ]);
    expect(geminiDirs({}, "/h")).toEqual(["/h/.gemini/tmp"]);
  });

  it("finds chats and subagent chats, never logs.json", async () => {
    const files = await findChats([GEMINI_FIXTURES, `${GEMINI_FIXTURES}p1`]);
    expect(files).toHaveLength(6);
    expect(files.some((f) => f.path.endsWith("logs.json"))).toBe(false);
    expect(files.find((f) => f.path === SUBAGENT)?.parentSessionId).toBe(
      "f88c20d5-2d60-4f7e-978e-650ccb1c800d",
    );
    expect(files.find((f) => f.path === TWO_MODELS)?.parentSessionId).toBe(
      undefined,
    );
    expect(await findChats(["/nonexistent"])).toEqual([]);
  });
});

describe("scan", () => {
  it("counts a subagent toward the session that started it, without its prompts", async () => {
    const { usage, prompts, stats } = await scanFixtures();
    const sub = usage.filter((e) => e.agentId);
    expect(sub).toHaveLength(1);
    expect(sub[0]).toMatchObject({
      source: "gemini",
      sessionId: "5ab0c0de-0000-4000-8000-000000000003",
      parentSessionId: "f88c20d5-2d60-4f7e-978e-650ccb1c800d",
      input: 4000,
      cacheRead: 8000,
      output: 500,
    });
    expect(prompts.some((p) => p.sessionId.startsWith("5ab0c0de"))).toBe(false);
    expect(stats).toMatchObject({ files: 6, events: usage.length });
  });

  it("dedupes nothing that ccusage counts", async () => {
    const { usage } = await scanFixtures();
    const deduper = createDeduper();
    for (const e of usage) deduper.add(e);
    expect(deduper.result()).toHaveLength(usage.length);
  });

  it("prices Gemini Pro above 200K prompt tokens at the long-context rate", async () => {
    const { usage } = await scanFixtures();
    const long = usage.find((e) => e.messageId === "l-g2")!;
    expect(modelKey(long)).toBe("gemini-2.5-pro|long");
    // 50K fresh at $2.50, 200K cached at $0.25, 1K output at $15 per 1M.
    expect(listPrice({ [modelKey(long)]: { ...long } }).value).toBeCloseTo(
      0.125 + 0.05 + 0.015,
      9,
    );
  });

  it("prices a Gemini model Google no longer lists as the nearest of its tier, marked", () => {
    expect(priceFor("gemini-3-pro-preview")).toMatchObject({
      isFallback: true,
      price: { input: 2, output: 12 },
    });
    expect(priceFor("gemini-2.0-flash-lite")?.isFallback).toBe(true);
    expect(priceFor("gemini-2.0-flash-lite")?.price.input).toBe(0.1);
    expect(priceFor("gemini-3-flash-preview")?.isFallback).toBe(false);
  });
});
