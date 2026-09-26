import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  aggregate,
  createDeduper,
  dedupe,
  dedupePrompts,
  IDLE_SPLIT_MS,
  type Aggregate,
  type UsageEvent,
} from "../src/index.js";
import { corpusEvents, corpusPrompts, FIXTURES } from "./claude/support.js";
import { CODEX_FIXTURES, scanFixtures } from "./codex/support.js";
import {
  GEMINI_FIXTURES,
  scanFixtures as scanGeminiFixtures,
} from "./gemini/support.js";
import {
  OPENCODE_FIXTURES,
  scanFixtures as scanOpenCodeFixtures,
} from "./opencode/support.js";
import {
  ANTIGRAVITY_FIXTURES,
  scanFixtures as scanAntigravityFixtures,
} from "./antigravity/support.js";

const iso = (ts: number | null) =>
  ts === null ? null : new Date(ts).toISOString();
const isoSpan = (s: { start: number; end: number } | null) =>
  s && { start: iso(s.start), end: iso(s.end) };

// Expected JSON writes instants as ISO strings for readability.
function readable({ totals, daily, sessions }: Aggregate) {
  return {
    totals: {
      ...totals,
      firstCall: iso(totals.firstCall),
      lastCall: iso(totals.lastCall),
      longestSession: isoSpan(totals.longestSession),
    },
    daily: daily.map((d) => ({
      ...d,
      firstCall: iso(d.firstCall),
      lastCall: iso(d.lastCall),
    })),
    sessions: sessions.map((s) => ({
      ...s,
      start: iso(s.start),
      end: iso(s.end),
      longestStretch: isoSpan(s.longestStretch),
    })),
  };
}

const event = (ts: number, over: Partial<UsageEvent> = {}): UsageEvent => ({
  kind: "usage",
  source: "claude-code",
  sessionId: "s1",
  ts,
  model: "claude-x",
  input: 1,
  cacheWrite: 0,
  cacheWrite1h: 0,
  cacheRead: 0,
  output: 1,
  messageId: `m${ts}`,
  dedupeKey: `m${ts}|r`,
  ...over,
});

describe("aggregate", () => {
  it("counts a record's model calls, not the record (Grok: one record per turn)", () => {
    const t = Date.UTC(2026, 8, 22, 12);
    const a = aggregate(
      { usage: [event(t, { calls: 13 }), event(t + 1000)] },
      { timeZone: "UTC" },
    );
    expect(a.daily[0]?.calls).toBe(14);
    expect(a.totals.calls).toBe(14);
    expect(a.sessions[0]?.calls).toBe(14);
  });

  it("fixture corpus totals equal the hand-computed expected JSON", async () => {
    const { timeZone, ...expected } = JSON.parse(
      readFileSync(`${FIXTURES}expected.json`, "utf8"),
    );
    const result = aggregate(
      {
        usage: dedupe(await corpusEvents()),
        prompts: dedupePrompts(await corpusPrompts()),
      },
      { timeZone },
    );
    expect(readable(result)).toEqual(expected);
  });

  it("Codex fixture corpus totals equal the expected JSON", async () => {
    const { timeZone, ...expected } = JSON.parse(
      readFileSync(`${CODEX_FIXTURES}expected.json`, "utf8"),
    );
    const { usage, prompts } = await scanFixtures();
    const deduper = createDeduper();
    for (const r of [...usage, ...prompts]) deduper.add(r);
    const result = aggregate(
      { usage: deduper.result(), prompts: deduper.prompts() },
      { timeZone },
    );
    expect(readable(result)).toEqual(expected);
  });

  it("Gemini CLI fixture corpus totals equal the expected JSON", async () => {
    const { timeZone, ...expected } = JSON.parse(
      readFileSync(`${GEMINI_FIXTURES}../expected.json`, "utf8"),
    );
    const { usage, prompts } = await scanGeminiFixtures();
    const deduper = createDeduper();
    for (const r of [...usage, ...prompts]) deduper.add(r);
    const result = aggregate(
      { usage: deduper.result(), prompts: deduper.prompts() },
      { timeZone },
    );
    expect(readable(result)).toEqual(expected);
  });

  it("Antigravity fixture corpus totals equal the expected JSON", async () => {
    const { timeZone, ...expected } = JSON.parse(
      readFileSync(`${ANTIGRAVITY_FIXTURES}../expected.json`, "utf8"),
    );
    const { usage, prompts } = await scanAntigravityFixtures();
    const deduper = createDeduper();
    for (const r of [...usage, ...prompts]) deduper.add(r);
    const result = aggregate(
      { usage: deduper.result(), prompts: deduper.prompts() },
      { timeZone },
    );
    expect(readable(result)).toEqual(expected);
  });

  it("OpenCode fixture corpus totals equal the expected JSON", async () => {
    const { timeZone, ...expected } = JSON.parse(
      readFileSync(`${OPENCODE_FIXTURES}../expected.json`, "utf8"),
    );
    const { usage, prompts } = await scanOpenCodeFixtures();
    const deduper = createDeduper();
    for (const r of [...usage, ...prompts]) deduper.add(r);
    const result = aggregate(
      { usage: deduper.result(), prompts: deduper.prompts() },
      { timeZone },
    );
    expect(readable(result)).toEqual(expected);
  });

  it("assigns days in the given time zone", async () => {
    const events = dedupe(await corpusEvents());
    expect(
      aggregate({ usage: events }, { timeZone: "Asia/Tokyo" }).daily.map(
        (d) => d.day,
      ),
    ).toEqual(["2026-08-23", "2026-09-24"]);
    expect(
      aggregate(
        { usage: events },
        { timeZone: "America/Los_Angeles" },
      ).daily.map((d) => d.day),
    ).toEqual(["2026-08-22", "2026-09-23"]);
  });

  it("splits a session's longest stretch on idle gaps over 1h", () => {
    expect(IDLE_SPLIT_MS).toBe(3_600_000);
    const half = IDLE_SPLIT_MS / 2;
    const resumed = half + IDLE_SPLIT_MS + 1;
    const { sessions, totals } = aggregate(
      {
        usage: [
          event(0),
          event(half),
          event(resumed),
          event(resumed + IDLE_SPLIT_MS),
        ],
      },
      { timeZone: "UTC" },
    );
    expect(sessions[0]?.longestStretch).toEqual({
      start: resumed,
      end: resumed + IDLE_SPLIT_MS,
    });
    expect(totals.longestSession).toEqual(sessions[0]?.longestStretch);
  });

  it("does not split on a gap of exactly the limit", () => {
    const { totals } = aggregate(
      { usage: [event(0), event(IDLE_SPLIT_MS)] },
      {
        timeZone: "UTC",
      },
    );
    expect(totals.longestSession).toEqual({ start: 0, end: IDLE_SPLIT_MS });
  });

  it("attaches subagent events to the parent session", () => {
    const { totals, sessions } = aggregate(
      {
        usage: [
          event(0),
          event(10, {
            sessionId: "child",
            parentSessionId: "s1",
            agentId: "a1",
            isSidechain: true,
          }),
        ],
      },
      { timeZone: "UTC" },
    );
    expect(totals).toMatchObject({ sessions: 1, subagents: 1, calls: 2 });
    expect(sessions).toMatchObject([
      { sessionId: "s1", calls: 2, subagents: 1 },
    ]);
  });

  it("counts a subagent active on two days once overall", () => {
    const day = 86_400_000;
    const { totals, daily } = aggregate(
      { usage: [event(0, { agentId: "a1" }), event(day, { agentId: "a1" })] },
      { timeZone: "UTC" },
    );
    expect(daily.map((d) => d.subagents)).toEqual([1, 1]);
    expect(totals.subagents).toBe(1);
  });

  it("returns empty totals for no events", () => {
    const { totals, daily, sessions } = aggregate(
      { usage: [] },
      { timeZone: "UTC" },
    );
    expect(daily).toEqual([]);
    expect(sessions).toEqual([]);
    expect(totals).toMatchObject({
      calls: 0,
      sessions: 0,
      activeDays: 0,
      firstCall: null,
      longestSession: null,
    });
  });
});
