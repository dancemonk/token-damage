import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  aggregate,
  buildFacts,
  damageClass,
  dedupe,
  dedupePrompts,
  dispute,
  disputeStamp,
  emptyState,
  EXCUSES,
  FAMILIES,
  inBand,
  loadState,
  metricsOf,
  nextState,
  observe,
  render,
  saveState,
  slotsOf,
  type Facts,
} from "../src/index.js";
import { corpusEvents, corpusPrompts, FIXTURES } from "./claude/support.js";

interface Sample {
  trans: string;
  name: string;
  expected: { note: string; class: string };
  facts: Facts;
}
const { customers } = JSON.parse(
  readFileSync(join(FIXTURES, "..", "samples.json"), "utf8"),
) as {
  customers: Sample[];
};

describe("sample customers", () => {
  it.each(customers)(
    "$trans $name: top note and damage class match docs/METRICS.md",
    ({ facts, expected }) => {
      const result = observe(facts);
      expect(result.note?.text).toBe(expected.note);
      expect(result.damageClass.name).toBe(expected.class);
    },
  );

  it.each(customers)("$trans: output is frozen", ({ trans, facts }) => {
    const verdicts = EXCUSES.map(
      (excuse) =>
        disputeStamp(trans, excuse, dispute(excuse, facts)) +
        " | " +
        dispute(excuse, facts).text,
    );
    expect({ ...observe(facts), verdicts }).toMatchSnapshot();
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

function randomFacts(next: () => number): Facts {
  const logUniform = (lo: number, hi: number) =>
    Math.round(lo * (hi / lo) ** next());
  const tokens = logUniform(1e3, 2e10);
  const output = Math.round(tokens * next() * 0.03);
  const cacheRead = Math.round((tokens - output) * next());
  const cacheWrite = Math.round((tokens - output - cacheRead) * next());
  const sessions = logUniform(1, 800);
  const periodDays = logUniform(1, 31);
  const minutes = Math.floor(next() * 1440) + 360;
  const hour = Math.floor(minutes / 60) % 24;
  const low = (tokens / 1e9) * 20;
  return {
    tokens,
    input: tokens - output - cacheRead - cacheWrite,
    cacheWrite,
    cacheRead,
    output,
    words: next() < 0.1 ? 0 : logUniform(1, 1e5),
    prompts: logUniform(1, 5000),
    calls: logUniform(1, 1e5),
    sessions,
    activeDays: Math.min(periodDays, logUniform(1, 31)),
    periodDays,
    subagents: logUniform(1, 3000) - 1,
    maxSubagentsInDay: logUniform(1, 300) - 1,
    lastCall:
      next() < 0.1 ? null : { label: `${hour}:00`, minutes, day: "2026-09-01" },
    longestSessionMin: next() < 0.1 ? null : logUniform(1, 1440),
    weekendShare: next(),
    sessionsAfterMidnight: Math.floor(next() * sessions),
    allSessionsEndBeforeNoon: next() < 0.3,
    longestIdleDays: Math.floor(next() * periodDays),
    cacheLordWeek: next() < 0.3,
    sessionSpansThreeDays: next() < 0.1,
    listPriceUsd: next() < 0.1 ? null : tokens / 1e6,
    cacheSavingUsd: next() < 0.1 ? null : tokens / 2e5,
    planUsd:
      next() < 0.5 ? null : ([20, 100, 200][Math.floor(next() * 3)] ?? 200),
    kwh: next() < 0.1 ? null : { low, high: low * 5 },
    commits: next() < 0.5 ? null : Math.floor(next() * 40),
  };
}

describe("severity bands", () => {
  it("no template ever fires on data outside its band (5,000 random periods)", () => {
    const next = random(7);
    let fired = 0;
    for (let i = 0; i < 5000; i++) {
      const facts = randomFacts(next);
      const metrics = metricsOf(facts);
      for (const note of observe(facts).candidates) {
        const family = FAMILIES.find((f) => f.id === note.family);
        const variant = family?.variants[note.variant];
        expect(family && variant).toBeTruthy();
        expect(inBand(metrics, family?.band ?? {})).toBe(true);
        expect(inBand(metrics, variant?.band ?? {})).toBe(true);
        fired++;
      }
    }
    expect(fired).toBeGreaterThan(5000);
  });

  it("keeps the harshest lines for the data that earns them", () => {
    const base = customers[2]?.facts as Facts;
    expect(
      observe({ ...base, tokens: 4.99e9 }).candidates.map((c) => c.family),
    ).not.toContain("uninsurable");
    expect(
      observe({
        ...base,
        lastCall: { label: "12:59 AM", minutes: 1499, day: "2026-09-01" },
      }).candidates.map((c) => c.family),
    ).not.toContain("late-night");
    expect(damageClass(2e6).name).toBe("FENDER BENDER");
    expect(damageClass(4.99e9).name).toBe("ACT OF GOD");
    expect(damageClass(5e9).name).toBe("UNINSURABLE");
    expect(damageClass(0).name).toBe("PAPER CUT");
  });

  it("inBand needs every metric known and inside [min, max]", () => {
    expect(inBand({ a: 5 }, { a: [5, 5] })).toBe(true);
    expect(inBand({ a: 6 }, { a: [5, 5] })).toBe(false);
    expect(inBand({ a: null }, { a: [0, 10] })).toBe(false);
    expect(inBand({}, { a: [0, 10] })).toBe(false);
  });
});

describe("templates", () => {
  const full = { ...(customers[0]?.facts as Facts), commits: 3 };

  it("every family has at least 5 variants and every variant renders", () => {
    for (const family of FAMILIES) {
      expect(family.variants.length, family.id).toBeGreaterThanOrEqual(5);
      for (const v of family.variants)
        expect(render(v.text, slotsOf(full)), v.text).toBeDefined();
    }
  });

  it("follows the voice rules: no exclamation marks, no emoji", () => {
    for (const v of FAMILIES.flatMap((f) => f.variants)) {
      expect(v.text).not.toMatch(/!/);
      expect(v.text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe("cooldown", () => {
  it("rotates the note on the next receipt and keeps no text in state", () => {
    const facts = customers[0]?.facts as Facts;
    const first = observe(facts);
    const state = nextState(emptyState(), first);
    const second = observe(facts, state);
    expect(second.note?.text).not.toBe(first.note?.text);
    expect(JSON.stringify(state)).not.toContain(first.note?.text ?? "");
    expect(state).toEqual({
      version: 1,
      runs: 1,
      families: { iceberg: { lastRun: 1, nextVariant: 1 } },
      jokeCursor: 2,
    });
  });

  it("never prints more than two jokes, and none that repeats the note", () => {
    for (const { facts } of customers) {
      const { jokes, note } = observe(facts);
      expect(jokes.length).toBeLessThanOrEqual(2);
      expect(jokes).not.toContain(note?.text);
    }
  });

  it("round-trips through the state file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "td-state-"));
    try {
      const path = join(dir, "nested", "state.json");
      expect(await loadState(path)).toEqual(emptyState());
      const state = nextState(
        emptyState(),
        observe(customers[0]?.facts as Facts),
      );
      await saveState(state, path);
      expect(await loadState(path)).toEqual(state);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("dispute", () => {
  const [c41, , c43] = customers as [Sample, Sample, Sample, Sample];

  it("quotes the user's own numbers", () => {
    expect(dispute("It was research", c41.facts).text).toBe(
      "DENIED. 1.18 billion tokens. Research rarely happens at 3:47 AM.",
    );
    expect(dispute("The agent did it by itself", c41.facts).text).toBe(
      "DENIED. You typed 14,690 words of instructions. You're the manager.",
    );
  });

  it("does not deny what the logs don't show", () => {
    expect(dispute("It was one last fix", c41.facts).status).toBe("DENIED");
    expect(dispute("It was one last fix", c43.facts).status).toBe("APPROVED");
  });

  it("stamps the claim", () => {
    expect(
      disputeStamp(
        "0041",
        "I was learning",
        dispute("I was learning", c41.facts),
      ),
    ).toBe('CLAIM #0041 · "I was learning" · APPROVED');
  });
});

describe("buildFacts", () => {
  it("computes facts from the fixture corpus", async () => {
    const usage = dedupe(await corpusEvents());
    const prompts = dedupePrompts(await corpusPrompts());
    const facts = buildFacts({
      aggregate: aggregate({ usage, prompts }, { timeZone: "UTC" }),
      usage,
      timeZone: "UTC",
    });
    expect(facts).toMatchObject({
      tokens: 348_051,
      words: 39,
      prompts: 8,
      sessions: 2,
      activeDays: 2,
      periodDays: 33,
      longestIdleDays: 31,
      lastCall: { label: "11:59 PM", minutes: 1439, day: "2026-09-23" },
      allSessionsEndBeforeNoon: false,
      sessionSpansThreeDays: false,
      commits: null,
    });
    expect(facts.weekendShare).toBeCloseTo(27_130 / 348_051);
    expect(observe(facts).achievements.map((a) => a.name)).toEqual([
      "TOUCH GRASS",
    ]);
  });

  it("treats 00:00–05:59 as the night before when finding the last call", async () => {
    const usage = dedupe(await corpusEvents());
    const facts = buildFacts({
      aggregate: aggregate({ usage }, { timeZone: "Asia/Tokyo" }),
      usage,
      timeZone: "Asia/Tokyo",
    });
    // 23:59:23 UTC is 08:59 in Tokyo; 16:56 UTC is 01:56 the next day, which counts as later.
    expect(facts.lastCall).toEqual({
      label: "1:56 AM",
      minutes: 1556,
      day: "2026-08-23",
    });
  });
});
