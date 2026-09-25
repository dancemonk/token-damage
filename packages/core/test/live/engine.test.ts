import { describe, expect, it } from "vitest";
import { LiveEngine } from "../../src/live/engine.js";
import { T0, min, prompt, usage } from "./support.js";

const engine = (
  now: number,
  state?: ConstructorParameters<typeof LiveEngine>[0]["state"],
) => {
  let clock = now;
  const e = new LiveEngine({ now: () => clock, timeZone: "UTC", state });
  return { e, tick: (to: number) => (clock = to) };
};

describe("LiveEngine", () => {
  it("keeps only today's records", () => {
    const { e } = engine(T0);
    e.add([
      usage({ ts: T0 - 13 * 60 * 60_000 }),
      usage({ ts: T0, input: 5 }),
      prompt({ ts: T0 + 25 * 60 * 60_000 }),
    ]);
    expect(e.snapshot()).toMatchObject({ calls: 1, words: 0 });
    expect(e.from).toBe(Date.UTC(2026, 8, 24));
    expect(e.to).toBe(Date.UTC(2026, 8, 25));
  });

  it("is idempotent under re-adding the same records", () => {
    const { e } = engine(T0);
    const records = [
      prompt({ ts: T0 - min(5), words: 3 }),
      usage({ ts: T0 - min(4), input: 400 }),
    ];
    e.add(records);
    const once = e.snapshot();
    e.add(records);
    expect(e.snapshot()).toEqual({ ...once, now: e.snapshot().now });
    expect(e.snapshot().read).toBe(400);
  });

  it("stamps a class upgrade once", () => {
    const { e } = engine(T0);
    expect(e.add([usage({ ts: T0 - min(2), input: 999_000 })])).toEqual([]);
    const events = e.add([usage({ ts: T0 - min(1), input: 2000 })]);
    expect(events).toEqual([
      { kind: "stamped", ts: T0, name: "FENDER BENDER" },
    ]);
    expect(e.add([usage({ ts: T0, input: 1 })])).toEqual([]);
    expect(e.events()).toHaveLength(1);
  });

  it("never stamps a shrinking pool's downgrade, nor a re-growth back to the stamped class", () => {
    const { e } = engine(T0);
    const grow = e.setPool("gemini", [
      usage({ ts: T0 - min(3), source: "gemini", dedupeKey: "g1", input: 2e7 }),
    ]);
    expect(grow).toEqual([{ kind: "stamped", ts: T0, name: "WATER DAMAGE" }]);

    const shrink = e.setPool("gemini", [
      usage({ ts: T0 - min(2), source: "gemini", dedupeKey: "g2", input: 5e5 }),
    ]);
    expect(shrink).toEqual([]);
    expect(e.snapshot().read).toBe(5e5);

    const regrow = e.setPool("gemini", [
      usage({ ts: T0 - min(1), source: "gemini", dedupeKey: "g3", input: 2e7 }),
    ]);
    expect(regrow).toEqual([]);
    expect(e.events()).toHaveLength(1);

    const past = e.setPool("gemini", [
      usage({ ts: T0, source: "gemini", dedupeKey: "g4", input: 2e8 }),
    ]);
    expect(past).toEqual([{ kind: "stamped", ts: T0, name: "STRUCTURAL" }]);
    expect(e.events()).toHaveLength(2);
  });

  it("keeps the stamped peak across a state round-trip: no re-stamp after reload", () => {
    const { e } = engine(T0);
    e.setPool("gemini", [
      usage({ ts: T0 - min(1), source: "gemini", dedupeKey: "g1", input: 2e8 }),
    ]);
    expect(e.events()).toHaveLength(1);
    const { e: again } = engine(T0, e.state());
    const restamp = again.setPool("gemini", [
      usage({ ts: T0, source: "gemini", dedupeKey: "g1", input: 2e8 }),
    ]);
    expect(restamp).toEqual([]);
    expect(again.events()).toHaveLength(1);
  });

  it("keeps events and limits across a reconcile", () => {
    const { e } = engine(T0);
    e.add([usage({ ts: T0 - min(1), input: 2_000_000 })]);
    e.setLimits({
      fiveHour: { usedPct: 10, resetsAt: T0 + min(60) },
      asOf: T0,
    });
    e.note("library", "four words in. a library out.");
    e.replace([usage({ ts: T0 - min(1), input: 1_500_000 })]);
    expect(e.snapshot().read).toBe(1_500_000);
    expect(e.events().map((x) => x.kind)).toEqual(["stamped", "note"]);
    expect(e.snapshot().limits?.fiveHour?.usedPct).toBe(10);
  });

  it("replaces a rescanned agent's pool instead of accumulating it", () => {
    const { e } = engine(T0);
    e.setPool("codex", [
      usage({ ts: T0 - min(1), source: "codex", dedupeKey: "c1", input: 500 }),
    ]);
    e.setPool("codex", [
      usage({ ts: T0 - min(1), source: "codex", dedupeKey: "c2", input: 300 }),
    ]);
    expect(e.snapshot().read).toBe(300);
    e.add([usage({ ts: T0, input: 100 })]);
    expect(e.snapshot().read).toBe(400);
    const { e: again } = engine(T0, e.state());
    expect(again.snapshot().read).toBe(400);
    again.setPool("codex", []);
    expect(again.snapshot().read).toBe(100);
  });

  it("round-trips its state", () => {
    const { e } = engine(T0);
    e.add([
      prompt({ ts: T0 - min(3), words: 2 }),
      usage({ ts: T0 - min(2), input: 50 }),
    ]);
    e.note("back", "back. the meter never left.");
    const { e: again } = engine(T0, e.state());
    expect(again.snapshot()).toEqual(e.snapshot());
    expect(again.events()).toEqual(e.events());
    expect(again.state()).toEqual(e.state());
  });

  it("tears at midnight and starts a fresh day", () => {
    const { e, tick } = engine(T0);
    e.add([usage({ ts: T0, input: 1234 })]);
    expect(e.rollover()).toBeNull();
    tick(Date.UTC(2026, 8, 25, 0, 0, 1));
    const tear = e.rollover();
    expect(tear).toMatchObject({
      kind: "tear",
      day: "2026-09-24",
      tokens: 1244,
    });
    expect(e.day).toBe("2026-09-25");
    expect(e.snapshot().total).toBe(0);
    expect(e.events()).toEqual([tear]);
    expect(e.rollover()).toBeNull();
  });
});
