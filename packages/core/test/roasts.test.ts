import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type Excuse,
  type Detected,
  aggregate,
  buildFacts,
  damageClass,
  classProgress,
  damageFloor,
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
  nextDamageClass,
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
    ...randomDetected(next, logUniform),
  };
}

function randomDetected(
  next: () => number,
  logUniform: (lo: number, hi: number) => number,
): Detected {
  const agentsInOneHour = Math.floor(next() * 5);
  return {
    snobSession:
      next() < 0.7
        ? null
        : {
            output: Math.floor(next() * 1000),
            read: logUniform(1e5, 1e8),
            calls: logUniform(1, 200),
          },
    speedrun:
      next() < 0.7
        ? null
        : { tokens: logUniform(1e5, 1e8), seconds: Math.floor(next() * 300) },
    burstSessions: next() < 0.2 ? null : Math.floor(next() * 20),
    agentsInOneHour,
    agentPair: agentsInOneHour >= 2 ? ["claude-code", "codex"] : null,
    cacheRebuilds: Math.floor(next() * 20),
    unpromptedShare: next() < 0.2 ? null : next(),
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
    // CPU-bound (~2.5 s on a fast machine); CI runners are slower and share cores with other heavy tests.
  }, 60_000);

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

  it("knows the next damage class", () => {
    expect(nextDamageClass(0)).toEqual({ name: "FENDER BENDER", at: 1e6 });
    expect(nextDamageClass(38_200_000)).toEqual({
      name: "STRUCTURAL",
      at: 1e8,
    });
    expect(nextDamageClass(6e9)).toBeNull();
  });

  it("knows the floor of the current damage class", () => {
    expect(damageFloor(0)).toBe(0);
    expect(damageFloor(38_200_000)).toBe(1e7);
    expect(damageFloor(6e9)).toBe(5e9);
  });

  it("knows how far through the current class a total is", () => {
    expect(classProgress(0)).toEqual({
      next: { name: "FENDER BENDER", at: 1e6 },
      progress: 0,
    });
    // WATER DAMAGE runs 1e7 → 1e8: 38.2M is 31.3% of the way.
    expect(classProgress(38_200_000).progress).toBeCloseTo(28.2 / 90, 10);
    expect(classProgress(1e8 - 1).progress).toBeLessThan(1);
    expect(classProgress(1e8)).toEqual({
      next: { name: "ACT OF GOD", at: 1e9 },
      progress: 0,
    });
    expect(classProgress(6e9)).toEqual({ next: null, progress: 1 });
  });

  it("inBand needs every metric known and inside [min, max]", () => {
    expect(inBand({ a: 5 }, { a: [5, 5] })).toBe(true);
    expect(inBand({ a: 6 }, { a: [5, 5] })).toBe(false);
    expect(inBand({ a: null }, { a: [0, 10] })).toBe(false);
    expect(inBand({}, { a: [0, 10] })).toBe(false);
  });
});

describe("templates", () => {
  const full: Facts = {
    ...(customers[0]?.facts as Facts),
    commits: 3,
    snobSession: { output: 212, read: 3_000_000, calls: 7 },
    speedrun: { tokens: 1_300_000, seconds: 94 },
    burstSessions: 11,
    agentsInOneHour: 2,
    agentPair: ["claude-code", "codex"],
    cacheRebuilds: 4,
    unpromptedShare: 0.41,
  };

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

describe("observations from session shapes", () => {
  const base = customers[2]?.facts as Facts;
  const families = (over: Partial<Facts>) =>
    observe({ ...base, ...over }).candidates.map((c) => c.family);

  it.each([
    [
      "model-snob",
      { snobSession: { output: 212, read: 3e6, calls: 7 } },
      { snobSession: { output: 212, read: 1.9e6, calls: 7 } },
    ],
    [
      "speedrun",
      { speedrun: { tokens: 1.3e6, seconds: 94 } },
      { speedrun: { tokens: 1.3e6, seconds: 5 } },
    ],
    ["churn", { burstSessions: 6 }, { burstSessions: 5 }],
    [
      "two-agents",
      { agentsInOneHour: 2, agentPair: ["claude-code", "codex"] },
      { agentsInOneHour: 1, agentPair: null },
    ],
    ["cache-rebuild", { cacheRebuilds: 3 }, { cacheRebuilds: 2 }],
    ["unprompted", { unpromptedShare: 0.25 }, { unpromptedShare: 0.24 }],
  ] as [string, Partial<Facts>, Partial<Facts>][])(
    "%s fires on data that earns it, and not just below",
    (id, hit, miss) => {
      expect(families(hit)).toContain(id);
      expect(families(miss)).not.toContain(id);
    },
  );

  it("names the two agents in plain words", () => {
    const note = observe({
      ...base,
      agentsInOneHour: 2,
      agentPair: ["claude-code", "codex"],
    }).candidates.find((c) => c.family === "two-agents");
    expect(note?.text).toMatch(/^Claude Code and Codex/);
  });
});

describe("session-shape copy claims only what was measured", () => {
  const texts = (id: string) =>
    FAMILIES.find((f) => f.id === id)!.variants.map((v) => v.text);

  it("model snob knows the flagship family, not the most expensive model", () => {
    for (const t of texts("model-snob"))
      expect(t).not.toMatch(/most expensive/i);
  });

  it("two agents share an hour; nothing says they overlapped", () => {
    for (const t of texts("two-agents")) expect(t).not.toMatch(/overlap/i);
  });

  it("a speedrun session may hold more than one prompt", () => {
    for (const t of texts("speedrun")) expect(t).not.toMatch(/a prompt,/);
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
    expect(state).toMatchObject({
      version: 1,
      runs: 1,
      families: { iceberg: { lastRun: 1, nextVariant: 1 } },
      jokeCursor: 2,
    });
    // The pool deck keeps line ids only, never the lines themselves.
    expect(state.deck?.used.joke).toHaveLength(2);
    for (const line of [...first.jokes, first.satire?.text, first.news?.text])
      if (line) expect(JSON.stringify(state)).not.toContain(line);
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
      // A hand-edited or broken deck is dropped; the rest of the state stays.
      await saveState({ ...state, deck: { seed: "x" } as never }, path);
      expect(await loadState(path)).toEqual({ ...state, deck: undefined });
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

  it("rules on the new excuses with the period's own numbers", () => {
    const f = c41.facts as Facts;
    const v = (excuse: Excuse, over: Partial<Facts> = {}) =>
      dispute(excuse, { ...f, ...over });
    // cacheShare = cacheRead / (input + cacheWrite + cacheRead)
    expect(
      v("The docs were wrong", { input: 0, cacheWrite: 50, cacheRead: 950 }),
    ).toEqual({
      status: "DENIED",
      text: "DENIED. 95% of the reading was re-reading. The docs didn't change; the questions did.",
    });
    expect(
      v("The docs were wrong", { input: 0, cacheWrite: 500, cacheRead: 500 })
        .status,
    ).toBe("APPROVED");
    expect(v("It was a demo", { sessions: 1 })).toEqual({
      status: "APPROVED",
      text: "APPROVED. One session. A demo. Sure.",
    });
    expect(v("It was a demo", { sessions: 94 })).toEqual({
      status: "DENIED",
      text: "DENIED. 94 sessions. Demos end.",
    });
    expect(v("I was refactoring", { tokens: 1000, output: 4 }).text).toBe(
      "DENIED. Output was 0.4% of the total. Refactoring usually changes something.",
    );
    expect(v("I was refactoring", { tokens: 1000, output: 300 }).status).toBe(
      "APPROVED",
    );
    expect(v("The machines did it", { unpromptedShare: 0.6 })).toEqual({
      status: "APPROVED",
      text: "APPROVED, partly. 60% of the tokens were read in sessions you never typed into. The rest were you.",
    });
    expect(v("The machines did it", { unpromptedShare: 0.1 })).toEqual({
      status: "DENIED",
      text: "DENIED. 10% was unprompted. The rest has your name on it.",
    });
    // Without prompt data the logs can't say who typed what, so no denial.
    expect(v("The machines did it", { unpromptedShare: null }).status).toBe(
      "APPROVED",
    );
  });

  it("never prints NaN or undefined, even for facts built before a field existed", () => {
    for (const c of customers)
      for (const excuse of EXCUSES)
        expect(
          dispute(excuse, c.facts as Facts).text,
          `${c.trans} ${excuse}`,
        ).not.toMatch(/NaN|undefined|Infinity/);
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
      "GONE OUTSIDE",
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
