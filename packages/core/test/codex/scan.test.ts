import { describe, expect, it } from "vitest";
import { createDeduper } from "../../src/index.js";
import { scanFixtures } from "./support.js";

const ROOT_OF_FORK = "019fee34-f718-7561-b7a9-1140d0565f41";

describe("scanCodex", () => {
  it("reads every fixture rollout and counts what it skipped", async () => {
    const { stats } = await scanFixtures();
    expect(stats).toMatchObject({
      files: 11,
      events: 28,
      prompts: 11,
      malformed: 1,
      // 3 copies of the parent in the fork, 4 lines of the rewritten burst.
      replayed: 7,
      fallback: 1,
    });
    expect(stats.versions).toEqual({
      "0.30.0": 2,
      "0.130.0": 8,
      "0.143.0": 2,
      "0.144.0-alpha.4": 1,
      "0.147.0-alpha.6.5": 6,
      "0.153.4": 3,
      "0.155.1": 6,
    });
  });

  it("maps Codex tokens: fresh input excludes cached input, output includes reasoning", async () => {
    const { usage } = await scanFixtures();
    const first = usage.find(
      (e) => e.ts === Date.parse("2026-05-10T23:20:20.704Z"),
    );
    expect(first).toMatchObject({
      source: "codex",
      sessionId: "019e1430-d753-78a1-99b7-4e745cc2f417",
      model: "gpt-5.5",
      input: 14441 - 11648,
      cacheRead: 11648,
      cacheWrite: 0,
      cacheWrite1h: 0,
      output: 96,
      version: "0.130.0",
    });
  });

  it("attributes subagents to their root session", async () => {
    const { usage } = await scanFixtures();
    const fork = usage.filter((e) => e.parentSessionId === ROOT_OF_FORK);
    expect(new Set(fork.map((e) => e.agentId))).toEqual(
      new Set([
        "019ff385-c2c0-7bd2-a53d-73fa2dcdbd48",
        "019ff38c-8a1e-7f72-9eb9-a1903b32bfdc",
      ]),
    );
    // The parent's 4 events, then the fork's own 2; its 3 copies are dropped.
    expect(fork.map((e) => e.input + e.cacheRead + e.output)).toEqual([
      22095, 23194, 23594, 95909, 21894, 22327,
    ]);
  });

  it("keeps the auto-review alias as the model name and prices it by date", async () => {
    const { usage } = await scanFixtures();
    expect(usage.filter((e) => e.model === "codex-auto-review")).toMatchObject([
      {
        sessionId: "019f4c2a-3591-7420-8e6b-20ca621cf67e",
        parentSessionId: "019f4c29-7a09-77e0-97c5-0f104d86a576",
        // 2026-07-10: before the move to GPT-5.6 Luna.
        priceAs: "gpt-5.4",
      },
    ]);
  });

  it("dedupes the archived copy and counts only prompts people typed", async () => {
    const { usage, prompts } = await scanFixtures();
    const deduper = createDeduper();
    for (const r of [...usage, ...prompts]) deduper.add(r);
    expect(deduper.result()).toHaveLength(24);
    const typed = deduper.prompts();
    // 2 + 2 sanitized one-word prompts, 4 invented ones; subagent prompts never appear.
    expect(typed.map((p) => p.words)).toEqual([1, 1, 1, 1, 8, 4, 4, 3]);
    expect(new Set(typed.map((p) => p.sessionId))).toEqual(
      new Set([
        "019e1430-d753-78a1-99b7-4e745cc2f417",
        "01a0bacd-b82b-7cb1-8dca-739c09d03936",
        "01a0c5f0-0000-7000-8000-000000000001",
      ]),
    );
  });
});
