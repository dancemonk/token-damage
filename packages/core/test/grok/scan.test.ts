import { describe, expect, it } from "vitest";
import { grokRoots } from "../../src/adapters/grok/discover.js";
import { priceFor } from "../../src/metrics/pricing.js";
import { GROK_FIXTURES, scanFixtures } from "./support.js";

describe("grokRoots", () => {
  it("uses GROK_HOME when it holds a path, else ~/.grok", () => {
    expect(grokRoots({ GROK_HOME: " ~/g " }, "/h")).toEqual(["/h/g"]);
    expect(grokRoots({ GROK_HOME: " " }, "/h")).toEqual(["/h/.grok"]);
    expect(grokRoots({}, "/h")).toEqual(["/h/.grok"]);
  });
});

describe("scanGrok on the fixture", () => {
  it("reads every session, counts a resumed copy once and joins a prompt's chunks", async () => {
    const { usage, prompts, stats } = await scanFixtures();
    expect(stats).toMatchObject({ files: 5, duplicates: 2, malformed: 0 });
    const traps = usage.filter((e) => e.sessionId === "trap-a");
    expect(
      traps.map((e) => [
        e.model,
        e.input,
        e.cacheWrite,
        e.cacheRead,
        e.output,
        e.calls,
      ]),
    ).toEqual([
      ["grok-4.5", 350, 50, 100, 20, 1],
      ["grok-4.7", 200, 0, 800, 40, 3],
      ["grok-4.7", 300, 0, 0, 5, 2],
      ["grok-4.7", 150, 0, 50, 7, 1],
    ]);
    expect(
      prompts.filter((p) => p.sessionId === "trap-a").map((p) => p.words),
    ).toEqual([4]);
    const real = usage.filter((e) => !e.sessionId.startsWith("trap"));
    expect(
      real.map((e) => [e.model, e.input, e.cacheRead, e.output, e.calls]),
    ).toEqual([["grok-4.7", 279_623, 462_080, 3_962, 13]]);
    expect(GROK_FIXTURES).toMatch(/fixtures\/grok\/grok\/$/);
  });
});

describe("Grok prices", () => {
  it("price the real turn at exactly what Grok recorded it cost", () => {
    const match = priceFor("grok-4.7");
    expect(match?.isFallback).toBe(false);
    const p = match!.price;
    const usd =
      (279_623 * p.input + 462_080 * p.cacheRead + 3_962 * p.output) / 1e6;
    // costUsdTicks 8,140,580,000 / 1e10 in the owner's log.
    expect(usd).toBeCloseTo(0.814058, 9);
  });
});
