import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  aggregate,
  dedupe,
  IDLE_SPLIT_MS,
  type Aggregate,
  type UsageEvent,
} from "../src/index.js";
import { corpusEvents, FIXTURES } from "./claude/support.js";

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
  source: "claude-code",
  sessionId: "s1",
  ts,
  model: "claude-x",
  input: 1,
  cacheWrite: 0,
  cacheRead: 0,
  output: 1,
  messageId: `m${ts}`,
  dedupeKey: `m${ts}|r`,
  ...over,
});

describe("aggregate", () => {
  it("fixture corpus totals equal the hand-computed expected JSON", async () => {
    const { timeZone, ...expected } = JSON.parse(
      readFileSync(`${FIXTURES}expected.json`, "utf8"),
    );
    const result = aggregate(dedupe(await corpusEvents()), { timeZone });
    expect(readable(result)).toEqual(expected);
  });

  it("assigns days in the given time zone", async () => {
    const events = dedupe(await corpusEvents());
    expect(
      aggregate(events, { timeZone: "Asia/Tokyo" }).daily.map((d) => d.day),
    ).toEqual(["2026-08-23", "2026-09-24"]);
    expect(
      aggregate(events, { timeZone: "America/Los_Angeles" }).daily.map(
        (d) => d.day,
      ),
    ).toEqual(["2026-08-22", "2026-09-23"]);
  });

  it("splits a session's longest stretch on idle gaps over 1h", () => {
    expect(IDLE_SPLIT_MS).toBe(3_600_000);
    const half = IDLE_SPLIT_MS / 2;
    const resumed = half + IDLE_SPLIT_MS + 1;
    const { sessions, totals } = aggregate(
      [event(0), event(half), event(resumed), event(resumed + IDLE_SPLIT_MS)],
      { timeZone: "UTC" },
    );
    expect(sessions[0]?.longestStretch).toEqual({
      start: resumed,
      end: resumed + IDLE_SPLIT_MS,
    });
    expect(totals.longestSession).toEqual(sessions[0]?.longestStretch);
  });

  it("does not split on a gap of exactly the limit", () => {
    const { totals } = aggregate([event(0), event(IDLE_SPLIT_MS)], {
      timeZone: "UTC",
    });
    expect(totals.longestSession).toEqual({ start: 0, end: IDLE_SPLIT_MS });
  });

  it("attaches subagent events to the parent session", () => {
    const { totals, sessions } = aggregate(
      [
        event(0),
        event(10, {
          sessionId: "child",
          parentSessionId: "s1",
          agentId: "a1",
          isSidechain: true,
        }),
      ],
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
      [event(0, { agentId: "a1" }), event(day, { agentId: "a1" })],
      { timeZone: "UTC" },
    );
    expect(daily.map((d) => d.subagents)).toEqual([1, 1]);
    expect(totals.subagents).toBe(1);
  });

  it("returns empty totals for no events", () => {
    const { totals, daily, sessions } = aggregate([], { timeZone: "UTC" });
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
