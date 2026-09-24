import { describe, expect, it } from "vitest";
import { dedupe, type UsageEvent } from "../../src/index.js";
import { corpusEvents, parseFixture } from "./support.js";

const event = (over: Partial<UsageEvent>): UsageEvent => ({
  kind: "usage",
  source: "claude-code",
  sessionId: "s1",
  ts: 1_000,
  model: "claude-x",
  input: 0,
  cacheWrite: 0,
  cacheWrite1h: 0,
  cacheRead: 0,
  output: 0,
  messageId: "m1",
  dedupeKey: "m1|r1",
  ...over,
});

describe("dedupe", () => {
  it("regression, undercount (ccusage #888): streaming snapshots keep the final output, not the first", async () => {
    const [kept, ...rest] = dedupe(
      await parseFixture("2.1.237/streaming-duplicate.jsonl"),
    );
    expect(rest).toEqual([]);
    expect(kept?.output).toBe(395);
  });

  it("regression, overcount: parallel tool-use lines count once, not summed", async () => {
    const events = await parseFixture("2.1.281/parallel-tool-use.jsonl");
    expect(events).toHaveLength(3);
    const kept = dedupe(events);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({
      output: 712,
      cacheRead: 22730,
      cacheWrite: 34013,
    });
  });

  it("regression, overcount (ccusage #913): a /btw replay of a main-thread message is dropped", async () => {
    const kept = dedupe(await parseFixture("2.1.281/sidechain-replay.jsonl"));
    expect(kept).toHaveLength(1);
    expect(kept[0]?.isSidechain).toBeUndefined();
    expect(kept[0]?.cacheRead).toBe(62003);
  });

  it("keeps distinct sidechain responses (subagent work is real)", async () => {
    const kept = dedupe(
      await parseFixture(
        `2.1.281/subagent/4aaff5d2-be7b-4975-9f06-ceeb9fcdd99a/subagents/agent-a17725cd7adf9ae7d.jsonl`,
      ),
    );
    expect(kept.map((e) => e.output)).toEqual([160, 121]);
  });

  it("takes the per-field maximum across duplicates", () => {
    const kept = dedupe([
      event({ output: 10, cacheRead: 5 }),
      event({ ts: 2_000, output: 3, cacheRead: 9, input: 4 }),
    ]);
    expect(kept).toEqual([event({ output: 10, cacheRead: 9, input: 4 })]);
  });

  it("keeps the earliest copy's session when a resumed session repeats a response", () => {
    const original = event({ sessionId: "original", ts: 1_000, output: 5 });
    const copy = event({ sessionId: "resumed", ts: 9_000, output: 5 });
    expect(dedupe([copy, original])).toEqual([original]);
  });

  it("keeps requestless responses from different sessions apart", () => {
    const a = event({ sessionId: "a", dedupeKey: "m1|session:a" });
    const b = event({ sessionId: "b", dedupeKey: "m1|session:b" });
    expect(dedupe([a, b])).toHaveLength(2);
  });

  it("drops a sidechain copy even when it arrives first", () => {
    const replay = event({ isSidechain: true, dedupeKey: "m1|r2", ts: 500 });
    const main = event({});
    expect(dedupe([replay, main])).toEqual([main]);
  });
});

// Deterministic pseudo-random numbers so failures reproduce.
function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

describe("dedupe properties", () => {
  it("is order-independent and unaffected by extra copies", async () => {
    const events = await corpusEvents();
    const expected = dedupe(events);
    for (let seed = 1; seed <= 50; seed++) {
      const next = random(seed);
      const copies = events.filter(() => next() < 0.3);
      expect(dedupe(shuffled([...events, ...copies], next))).toEqual(expected);
    }
  });

  it("is idempotent", async () => {
    const once = dedupe(await corpusEvents());
    expect(dedupe(once)).toEqual(once);
  });
});
