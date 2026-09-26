import { describe, expect, it } from "vitest";
import {
  aggregate,
  buildFacts,
  type PromptEvent,
  type UsageEvent,
} from "../src/index.js";
import { T0, min, prompt, usage } from "./live/support.js";

const sec = (n: number) => n * 1000;
const facts = (u: UsageEvent[], p?: PromptEvent[]) =>
  buildFacts({
    aggregate: aggregate({ usage: u, prompts: p ?? [] }, { timeZone: "UTC" }),
    usage: u,
    ...(p && { prompts: p }),
    timeZone: "UTC",
  });

describe("model snob", () => {
  // Five flagship calls reading 2.5M tokens and writing 212.
  const snob = (session: string, over: Partial<UsageEvent> = {}) =>
    Array.from({ length: 5 }, (_, i) =>
      usage({
        ts: T0 + i * 1000,
        sessionId: session,
        cacheRead: 500_000,
        input: 0,
        output: i === 0 ? 212 : 0,
        ...over,
      }),
    );

  it("finds a typed session that read a lot on a flagship model and wrote almost nothing", () => {
    const f = facts(snob("s1"), [prompt({ ts: T0 - 1000 })]);
    expect(f.snobSession).toEqual({ output: 212, read: 2_500_000, calls: 5 });
  });

  it("ignores cheaper models, fewer calls, more output and untyped sessions", () => {
    const typed = [prompt({ ts: T0 - 1000 })];
    expect(
      facts(snob("s1", { model: "claude-sonnet-4-6" }), typed).snobSession,
    ).toBeNull();
    expect(facts(snob("s1").slice(0, 4), typed).snobSession).toBeNull();
    expect(facts(snob("s1", { output: 100 }), typed).snobSession).toBeNull();
    expect(facts(snob("s9"), typed).snobSession).toBeNull();
  });
});

describe("speedrun", () => {
  const run = (seconds: number) => [
    usage({ ts: T0 + sec(2), cacheRead: 400_000 }),
    usage({ ts: T0 + sec(seconds / 2), cacheRead: 400_000 }),
    usage({ ts: T0 + sec(seconds), cacheRead: 400_000 }),
  ];
  const typed = [prompt({ ts: T0 })];

  it("finds a typed session that read a million tokens in two minutes, timed from the prompt", () => {
    expect(facts(run(94), typed).speedrun).toEqual({
      tokens: 1_200_330,
      seconds: 94,
    });
  });

  it("needs two minutes or less, ten seconds or more, and a million tokens", () => {
    expect(facts(run(121), typed).speedrun).toBeNull();
    expect(facts(run(8), typed).speedrun).toBeNull();
    expect(facts(run(94).slice(0, 2), typed).speedrun).toBeNull();
  });
});

describe("session churn", () => {
  const starts = (minutes: number[]) =>
    minutes.map((m, i) => prompt({ ts: T0 + min(m), sessionId: `s${i}` }));

  it("counts the most typed sessions started inside forty minutes", () => {
    const p = starts([0, 5, 10, 20, 30, 39, 41, 90]);
    expect(facts([usage({ ts: T0 })], p).burstSessions).toBe(6);
  });
});

describe("two agents", () => {
  it("finds two agents working inside the same hour, the busier first", () => {
    const f = facts([
      usage({ ts: T0, input: 1000 }),
      usage({
        ts: T0 + min(50),
        source: "codex",
        sessionId: "c1",
        input: 5000,
      }),
    ]);
    expect(f.agentsInOneHour).toBe(2);
    expect(f.agentPair).toEqual(["codex", "claude-code"]);
  });

  it("does not pair agents more than an hour apart", () => {
    const f = facts([
      usage({ ts: T0 }),
      usage({ ts: T0 + min(61), source: "codex", sessionId: "c1" }),
    ]);
    expect(f.agentsInOneHour).toBe(1);
    expect(f.agentPair).toBeNull();
  });
});

describe("cache rebuilds", () => {
  const hot = (ts: number) => usage({ ts, cacheRead: 300_000 });
  const rebuild = (ts: number, write = 250_000) =>
    usage({ ts, cacheWrite: write, cacheRead: 1_000 });

  it("counts a hot cache written again within four minutes", () => {
    expect(facts([hot(T0), rebuild(T0 + min(3))]).cacheRebuilds).toBe(1);
  });

  it("ignores expiry after the five-minute cache life, small writes, and a warm read", () => {
    expect(facts([hot(T0), rebuild(T0 + min(5))]).cacheRebuilds).toBe(0);
    expect(facts([hot(T0), rebuild(T0 + min(1), 99_000)]).cacheRebuilds).toBe(
      0,
    );
    expect(
      facts([
        hot(T0),
        usage({ ts: T0 + min(1), cacheWrite: 250_000, cacheRead: 290_000 }),
      ]).cacheRebuilds,
    ).toBe(0);
  });

  it("keeps each conversation's cache apart", () => {
    const sub = usage({
      ts: T0 + min(1),
      sessionId: "a1",
      parentSessionId: "s1",
      agentId: "a1",
      cacheWrite: 250_000,
    });
    expect(facts([hot(T0), sub]).cacheRebuilds).toBe(0);
  });
});

describe("unprompted share", () => {
  it("is the share of tokens in sessions nobody typed into", () => {
    const f = facts(
      [
        usage({ ts: T0, input: 3_000, output: 0 }),
        usage({ ts: T0, sessionId: "sdk", input: 1_000, output: 0 }),
      ],
      [prompt({ ts: T0 - 1000 })],
    );
    expect(f.unpromptedShare).toBeCloseTo(0.25);
  });

  it("stays unknown when the caller has no prompts", () => {
    const f = facts([usage({ ts: T0 })]);
    expect(f.unpromptedShare).toBeNull();
    expect(f.burstSessions).toBeNull();
    expect(f.snobSession).toBeNull();
    expect(f.speedrun).toBeNull();
  });
});
