import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  draw,
  emptyState,
  newDeck,
  nextState,
  observe,
  POOL_EN,
  type Facts,
} from "../src/index.js";

const customers = JSON.parse(
  readFileSync(new URL("../fixtures/samples.json", import.meta.url), "utf8"),
).customers as { facts: Facts }[];

describe("the deck", () => {
  const ids = Array.from({ length: 13 }, (_, i) => `x.${i}`);

  it("never repeats a line within a round, over 1000 draws", () => {
    let deck = newDeck(42);
    const drawn: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const next = draw(deck, "x", ids);
      deck = next.deck;
      drawn.push(next.id!);
    }
    for (let r = 0; r + ids.length <= drawn.length; r += ids.length)
      expect(new Set(drawn.slice(r, r + ids.length)).size).toBe(ids.length);
  });

  it("never repeats across a reshuffle", () => {
    for (let seed = 0; seed < 200; seed++) {
      let deck = newDeck(seed);
      let prev = "";
      for (let i = 0; i < ids.length * 3; i++) {
        const next = draw(deck, "x", ids);
        expect(next.id).not.toBe(prev);
        prev = next.id!;
        deck = next.deck;
      }
    }
  });

  it("passes over a line that doesn't fit and keeps it for later", () => {
    let deck = newDeck(7);
    const seen = new Set<string>();
    for (let i = 0; i < ids.length - 1; i++) {
      const next = draw(deck, "x", ids, (id) => id !== "x.3");
      expect(next.id).not.toBe("x.3");
      seen.add(next.id!);
      deck = next.deck;
    }
    expect(seen.size).toBe(ids.length - 1);
    expect(draw(deck, "x", ids).id).toBe("x.3");
  });

  it("is the same for the same seed and differs across seeds", () => {
    const first = (seed: number) => draw(newDeck(seed), "x", ids).id;
    expect(first(1)).toBe(first(1));
    expect(
      new Set(Array.from({ length: 20 }, (_, s) => first(s))).size,
    ).toBeGreaterThan(5);
  });
});

describe("the English pool", () => {
  const SLOTS = new Set([
    "share",
    "cacheSaving",
    "plan",
    "venture",
    "lastCall",
  ]);

  it("has about a hundred lines of each promised kind, with unique ids", () => {
    const count = (k: string) => POOL_EN.filter((l) => l.kind === k).length;
    expect(count("satire")).toBeGreaterThanOrEqual(25);
    expect(count("joke")).toBeGreaterThanOrEqual(40);
    expect(count("news")).toBeGreaterThanOrEqual(20);
    expect(new Set(POOL_EN.map((l) => l.id)).size).toBe(POOL_EN.length);
  });

  it.each(POOL_EN)("$id follows the rules", (line) => {
    expect(line.text).not.toMatch(/!/);
    expect(line.text.length).toBeLessThanOrEqual(140);
    for (const [, slot] of line.text.matchAll(/\{(\w+)\}/g))
      expect(SLOTS.has(slot!), slot).toBe(true);
    if (line.kind === "satire") {
      expect(line.text).toContain("{share}");
      expect(line.size).toBeGreaterThan(0);
    }
    if (line.kind !== "joke") expect(line.source?.url).toMatch(/^https:\/\//);
    // "2024-09", "2024", or "-" for a standing fact (the site's /method list reads all three).
    if (line.source) expect(line.source.date).toMatch(/^(\d{4}(-\d{2})?|-)$/);
    if (line.kind === "news")
      expect(line.text).toMatch(/^(\w{3} )?\d{4}|^Q\d \d{4}/);
  });
});

describe("pool lines on receipts", () => {
  it("print no repeats over ten consecutive CLI runs", () => {
    const facts = customers[0]!.facts;
    let state = emptyState();
    const seen: string[] = [];
    for (let run = 0; run < 10; run++) {
      const o = observe(facts, state);
      seen.push(...o.jokes, o.satire!.text, o.news!.text);
      state = nextState(state, o);
    }
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("fill the share with a tiny, made-up number", () => {
    const o = observe(customers[0]!.facts);
    expect(o.satire?.text).toMatch(/\d\.\d*\d/);
    expect(o.satire?.text).not.toContain("{share}");
  });
});
