import { describe, expect, it } from "vitest";
import { aggregate } from "../../src/index.js";
import { buildSnapshot } from "../../src/live/snapshot.js";
import { T0, min, prompt, usage } from "./support.js";

const events = [
  usage({ ts: T0 - min(40), input: 1000, cacheRead: 9000, output: 100 }),
  usage({ ts: T0 - min(8), input: 2000, output: 50 }),
  usage({
    ts: T0 - min(2),
    sessionId: "s2",
    input: 3000,
    cacheWrite: 500,
    output: 20,
  }),
];
const prompts = [
  prompt({ ts: T0 - min(45), words: 12 }),
  prompt({ ts: T0 - min(3), sessionId: "s2", words: 4 }),
];

describe("buildSnapshot", () => {
  const s = buildSnapshot({ usage: events, prompts, now: T0, timeZone: "UTC" });

  it("totals exactly like the receipt", () => {
    const { totals } = aggregate(
      { usage: events, prompts },
      { timeZone: "UTC" },
    );
    expect(s.tokens).toEqual(totals.tokens);
    expect(s.read).toBe(15_500);
    expect(s.written).toBe(170);
    expect(s.total).toBe(15_670);
    expect(s.words).toBe(16);
    expect(s.calls).toBe(3);
    expect(s.day).toBe("2026-09-24");
  });

  it("prices at list price and knows what it could not price", () => {
    expect(s.price.tier).toBe("priced");
    expect(s.price.value).toBeGreaterThan(0);
    expect(s.notPriced).toBe(false);
    expect(s.partlyPriced).toBe(false);
    const odd = buildSnapshot({
      usage: [
        ...events,
        usage({ ts: T0 - min(1), model: "mystery-9000", input: 10 }),
      ],
      prompts,
      now: T0,
      timeZone: "UTC",
    });
    expect(odd.partlyPriced).toBe(true);
  });

  it("names the class and the distance to the next one", () => {
    expect(s.damage.name).toBe("PAPER CUT");
    expect(s.damage.next).toEqual({ name: "FENDER BENDER", at: 1e6 });
    expect(s.damage.pct).toBeCloseTo(1.567, 2);
  });

  it("buckets the last 30 minutes into ten sparkline cells", () => {
    expect(s.rate.buckets).toHaveLength(10);
    // -8 min → bucket 7 (minutes 22–25 of the window); -2 min → bucket 9. The -40 min event is outside.
    expect(s.rate.buckets[7]).toBe(2050);
    expect(s.rate.buckets[9]).toBe(3520);
    expect(s.rate.buckets.reduce((a, b) => a + b, 0)).toBe(5570);
    expect(s.rate.perMin).toBeCloseTo(5570 / 30, 5);
  });

  it("badges sessions in order of first appearance and picks the open turn", () => {
    expect(s.badges).toEqual({ s1: 1, s2: 2 });
    expect(s.open?.sessionId).toBe("s2");
    expect(s.open?.words).toBe(4);
    expect(s.turns).toHaveLength(2);
  });

  it("knows idle state", () => {
    expect(s.lastCall).toBe(T0 - min(2));
    expect(s.idleMs).toBe(min(2));
    expect(s.printing).toBe(false);
    const busy = buildSnapshot({
      usage: events,
      prompts,
      now: T0 - min(2) + 30_000,
      timeZone: "UTC",
    });
    expect(busy.printing).toBe(true);
    const empty = buildSnapshot({
      usage: [],
      prompts: [],
      now: T0,
      timeZone: "UTC",
    });
    expect(empty).toMatchObject({
      lastCall: null,
      idleMs: null,
      printing: false,
      open: null,
      total: 0,
    });
    expect(empty.damage.name).toBe("PAPER CUT");
  });

  it("ignores future-dated events for idle state but includes them in totals", () => {
    const withFuture = buildSnapshot({
      usage: [
        usage({ ts: T0 - min(5), input: 1000, output: 100 }),
        usage({ ts: T0 + min(10), input: 2000, output: 200 }),
      ],
      prompts: [],
      now: T0,
      timeZone: "UTC",
    });
    expect(withFuture.lastCall).toBe(T0 - min(5));
    expect(withFuture.idleMs).toBe(min(5));
    expect(withFuture.printing).toBe(false);
    expect(withFuture.total).toBe(3300);
  });

  it("passes limits through untouched", () => {
    const limits = {
      fiveHour: { usedPct: 58, resetsAt: T0 + min(120) },
      asOf: T0,
    };
    expect(
      buildSnapshot({
        usage: [],
        prompts: [],
        now: T0,
        limits,
        timeZone: "UTC",
      }).limits,
    ).toEqual(limits);
    expect(s.limits).toBeNull();
  });
});
