import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASIDE_ODDS, pickAside } from "../src/asides.js";
import { TEAR } from "../src/timeline.js";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

describe("the tear timeline", () => {
  const keyframes = /@keyframes tdTearOff \{([\s\S]*?)\n\}/.exec(css)![1]!;
  const stops = [...keyframes.matchAll(/^\s*(\d+)% \{/gm)].map((m) =>
    Number(m[1]),
  );

  it("matches the tdTearOff keyframes the sound and specks are synced to", () => {
    expect(stops).toEqual([0, TEAR.crack * 100, TEAR.snap * 100, 100]);
  });

  it("matches the .tearoff duration", () => {
    const rule = /\.tearoff \{[^}]*animation: tdTearOff ([\d.]+)s/.exec(css)!;
    expect(Number(rule[1]) * 1000).toBe(TEAR.ms);
  });
});

describe("Saint Petersburg asides", () => {
  const asides = { "spb.1": "a", "spb.2": "b", "spb.3": "", "spb.4": " " };
  const always = () => 0;

  it("never replace the first print", () => {
    expect(
      pickAside(asides, { printed: 0, shown: false, last: null }, always),
    ).toBeNull();
  });

  it("show at most once per visit", () => {
    expect(
      pickAside(asides, { printed: 3, shown: true, last: null }, always),
    ).toBeNull();
  });

  it("never repeat the last one, even across visits", () => {
    for (let i = 0; i < 50; i++) {
      const rng = (() => {
        const seq = [0, Math.random()];
        return () => seq.shift() ?? 0;
      })();
      expect(
        pickAside(asides, { printed: 1, shown: false, last: "spb.1" }, rng),
      ).toBe("spb.2");
    }
  });

  it("skip empty slots", () => {
    const only = { "spb.9": "", "spb.10": "  " };
    expect(
      pickAside(only, { printed: 1, shown: false, last: null }, always),
    ).toBeNull();
  });

  it("stay rare: about one in five prints", () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    let hits = 0;
    const tries = 5000;
    for (let i = 0; i < tries; i++)
      if (pickAside(asides, { printed: 1, shown: false, last: null }, rng))
        hits++;
    expect(hits / tries).toBeGreaterThan(ASIDE_ODDS - 0.03);
    expect(hits / tries).toBeLessThan(ASIDE_ODDS + 0.03);
  });

  it("at most one in a visit of many prints", () => {
    let shown = false;
    let count = 0;
    for (let printed = 1; printed < 50; printed++) {
      const id = pickAside(asides, { printed, shown, last: null }, Math.random);
      if (id) {
        shown = true;
        count++;
      }
    }
    expect(count).toBeLessThanOrEqual(1);
  });
});
