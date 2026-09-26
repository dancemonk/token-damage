import { describe, expect, it } from "vitest";
import {
  aggregate,
  buildFacts,
  buildReceipt,
  imagePreview,
  observe,
  receiptLines,
  receiptSvg,
  type Receipt,
  type UsageEvent,
} from "../src/index.js";

const START = Date.parse("2026-09-20T12:00:00Z");
let calls = 0;
const call = (over: Partial<UsageEvent> = {}): UsageEvent => {
  calls++;
  return {
    kind: "usage",
    source: "claude-code",
    sessionId: "s1",
    ts: START + calls * 60_000,
    model: "claude-opus-5",
    input: 1_000,
    cacheWrite: 0,
    cacheWrite1h: 0,
    cacheRead: 9_000,
    output: 500,
    messageId: `m${calls}`,
    dedupeKey: `m${calls}`,
    ...over,
  };
};
const codex = (over: Partial<UsageEvent>) =>
  call({ source: "codex", sessionId: "s2", ...over });

const claudeCall = call();
const solCall = codex({ model: "gpt-5.6-sol", input: 2_000 });
const reviewCall = codex({
  model: "codex-auto-review",
  priceAs: "gpt-5.6-luna",
});
const unknownCall = codex({ model: "o9-preview" });

const days = (start: string, end: string, count: number) => ({
  start,
  end,
  days: count,
  retentionDays: 30,
  retentionIsDefault: true,
});

function receipt(
  usage: UsageEvent[],
  period: Receipt["period"] = days("2026-08-25", "2026-09-23", 30),
): Receipt {
  const agg = aggregate({ usage }, { timeZone: "UTC" });
  const facts = buildFacts({ aggregate: agg, usage, timeZone: "UTC" });
  return buildReceipt({
    trans: "0001",
    period,
    aggregate: agg,
    facts,
    observations: observe(facts),
  });
}
const text = (r: Receipt) => receiptLines(r).map((l) => l.text);

describe("receipt for several agents", () => {
  const both = receipt([claudeCall, solCall, reviewCall]);

  it("splits the totals by agent, most tokens first", () => {
    expect(both.byAgent.map((a) => [a.agent, a.tokens.value])).toEqual([
      ["codex", 22_000],
      ["claude-code", 10_500],
    ]);
    const sum = both.byAgent.reduce((s, a) => s + a.listPrice.value, 0);
    expect(sum).toBeCloseTo(both.priced.listPrice.value, 9);
  });

  it("prints a BY AGENT block above BY MODEL, only when there are several agents", () => {
    const lines = text(both);
    const at = lines.findIndex((l) => l.startsWith("BY AGENT"));
    const rows = lines.slice(at, at + 5).filter((l) => !/^ {2}[■▪·]/.test(l));
    expect(rows.map((l) => l.slice(0, 24).trim())).toEqual([
      "BY AGENT",
      "codex*",
      "claude code",
    ]);
    expect(lines.findIndex((l) => l.startsWith("BY MODEL"))).toBeGreaterThan(
      at,
    );
    expect(
      text(receipt([claudeCall])).some((l) => l.startsWith("BY AGENT")),
    ).toBe(false);
    expect(text(receipt([solCall])).some((l) => l.startsWith("BY AGENT"))).toBe(
      false,
    );
  });

  it("keeps Codex models apart and marks prices that are a guess", () => {
    expect(both.byModel.map((m) => [m.name, m.estModel ?? false])).toEqual([
      ["gpt-5.6-sol", false],
      ["codex-auto-review", true],
      ["opus", false],
    ]);
    const lines = text(both);
    expect(lines).toContainEqual(
      expect.stringMatching(/^ {2}codex-auto-review\* +10\.5K +≡ \$/),
    );
    expect(lines).toContain("  * est. model: priced as the closest listed one");
    expect(text(receipt([claudeCall])).join("\n")).not.toContain("est. model");
  });

  it("says not priced instead of $0", () => {
    const r = receipt([solCall, unknownCall]);
    expect(r.byModel.find((m) => m.name === "o9-preview")).toMatchObject({
      notPriced: true,
      listPrice: { value: 0 },
    });
    expect(text(r)).toContainEqual(
      expect.stringMatching(/^ {2}o9-preview +10\.5K +not priced$/),
    );
    expect(r.byAgent[0]?.notPriced).toBeUndefined();
  });

  it("shows a price that leaves out unpriced models as a floor", () => {
    const oc = (model: string) =>
      call({ source: "opencode", sessionId: "s9", model });
    const r = receipt([claudeCall, oc("gpt-5.5"), oc("glm-5.2")]);
    expect(r.priced.partlyPriced).toBe(true);
    const agent = (name: string) => r.byAgent.find((a) => a.agent === name);
    expect(agent("opencode")?.partlyPriced).toBe(true);
    expect(agent("claude-code")?.partlyPriced).toBeUndefined();
    expect(r.byModel.find((m) => m.name === "glm-5.2")).toMatchObject({
      notPriced: true,
    });
    const lines = text(r);
    expect(lines).toContainEqual(
      expect.stringMatching(/^ {2}opencode +\S+ +≡ \$\d+\.\d\d\+$/),
    );
    expect(lines.find((l) => l.startsWith("LIST-PRICE VALUE"))).toMatch(/\+$/);
    expect(lines).toContain("  + at least: models not priced are left out");
    expect(text(receipt([claudeCall])).join("\n")).not.toContain("at least");
  });

  it("shortens model names too long for the column, keeping the mark", () => {
    const r = receipt([
      call({
        source: "gemini",
        sessionId: "s3",
        model: "gemini-3.1-pro-preview-customtools",
        input: 900_000,
      }),
      call({
        source: "gemini",
        sessionId: "s3",
        model: "gemini-3-pro-preview",
      }),
    ]);
    const rows = text(r).filter((l) => l.startsWith("  gemini"));
    expect(rows.map((l) => l.slice(0, 24))).toEqual([
      "  gemini-3.1-pro-previ… ",
      "  gemini-3-pro-preview* ",
    ]);
    expect(rows.every((l) => l.length === 48)).toBe(true);
  });

  it("talks about Claude Code's retention only when Claude Code is on the receipt", () => {
    expect(text(both)).toContain("        (30 days — all claude code kept)");
    expect(text(receipt([solCall]))).toContain("                   (30 days)");
  });

  it("names the agents on the card and in its preview", () => {
    expect(receiptSvg(receipt([claudeCall]))).toContain(
      "30 days — all Claude Code kept",
    );
    expect(receiptSvg(both)).toContain(
      "30 days — Codex + Claude Code · all Claude Code kept",
    );
    expect(receiptSvg(receipt([solCall]))).toContain("30 days — Codex<");
    expect(imagePreview(both)[0]).toContain("(Codex + Claude Code)");
  });

  it("fits the card's agents line on the paper, naming the rest as a count", () => {
    const four = receipt(
      [
        claudeCall,
        solCall,
        call({
          source: "gemini",
          sessionId: "s3",
          model: "gemini-3.5-flash",
          input: 500,
        }),
        call({
          source: "opencode",
          sessionId: "s4",
          model: "claude-opus-5",
          input: 100,
        }),
      ],
      { ...days("2026-08-25", "2026-09-23", 30), retentionDays: 20 },
    );
    expect(four.byAgent.map((a) => a.agent)).toEqual([
      "codex",
      "claude-code",
      "gemini",
      "opencode",
    ]);
    // All four names make 84 characters, three make 82, two make 69; the line holds 76.
    expect(receiptSvg(four)).toContain(
      "30 days — Codex + Claude Code + 2 more · Claude Code kept the last 20<",
    );
  });
});

describe("share card", () => {
  it("puts class progress under the stamp, in ink", () => {
    const paper = receiptSvg(receipt([claudeCall]));
    expect(paper).toContain(">1% to FENDER BENDER<");
    expect(paper).toMatch(/<rect [^>]*class="progress"[^>]*fill="#1f1d1a"/);
    const top = receiptSvg(receipt([call({ cacheRead: 6e9 })]));
    expect(top).toContain(">top of the scale<");
  });

  it("fills nothing red: red is for the stamp and the satire, never a fact", () => {
    const paper = receiptSvg(receipt([claudeCall, solCall]));
    expect(paper).not.toMatch(/<rect [^>]*fill="#b3261e"/);
    // Agents writing: paper inside the bar's ink border, and a hollow square in the legend.
    expect(paper).toMatch(/<rect [^>]*fill="#f3efe6" stroke="#1f1d1a"/);
  });

  it("drops the progress row rather than let a long note push the paper off the card", () => {
    const r = receipt([claudeCall]);
    const drawn: boolean[] = [];
    for (let lines = 1; lines <= 12; lines++) {
      // Nine five-letter words fill one 49-column note line.
      const text = Array.from({ length: lines * 9 }, () => "words").join(" ");
      const svg = receiptSvg({ ...r, note: { family: "x", variant: 0, text } });
      const top =
        Number(/<rect x="140" y="([\d.-]+)" width="800"/.exec(svg)?.[1]) - 14;
      const row = svg.includes('class="progress"');
      if (row) expect(top, `${lines} lines`).toBeGreaterThanOrEqual(16);
      drawn.push(row);
    }
    expect(drawn).toContain(true);
    expect(drawn).toContain(false);
  });
});

describe("achievements on the receipt", () => {
  const withAch = (list: Receipt["achievements"]) => ({
    ...receipt([claudeCall]),
    achievements: list,
  });
  const lastFix = {
    id: "one-last-fix",
    name: "ONE LAST FIX",
    trigger: "Last model call at 3:47 AM",
    hidden: false,
  };
  const bilingual = {
    id: "bilingual",
    name: "BILINGUAL",
    trigger: "Codex and Claude Code within one hour",
    hidden: false,
  };

  it("prints them under the stamp, a leader when it fits and two lines when it doesn't", () => {
    const lines = text(withAch([lastFix, bilingual]));
    const at = lines.indexOf("ACHIEVEMENTS");
    expect(at).toBeGreaterThan(lines.findIndex((l) => l.includes("┗")));
    expect(lines.slice(at, at + 4)).toEqual([
      "ACHIEVEMENTS",
      "  ONE LAST FIX ...... last model call at 3:47 am",
      "  BILINGUAL",
      "    codex and claude code within one hour",
    ]);
    for (const l of lines) expect([...l].length).toBeLessThanOrEqual(48);
  });

  it("prints no block when nothing was earned", () => {
    expect(text(withAch([]))).not.toContain("ACHIEVEMENTS");
  });

  it("puts their names on the share card in one compact row", () => {
    const svg = receiptSvg(withAch([lastFix, bilingual]));
    expect(svg).toContain(">ACHIEVEMENTS<");
    expect(svg).toContain(">ONE LAST FIX · BILINGUAL<");
  });
});

describe("receipt facts for bars", () => {
  it("lists every day of the period, oldest first, with zero for quiet days", () => {
    const r = receipt([claudeCall, solCall]);
    expect(r.measured.daily).toHaveLength(30);
    expect(r.measured.daily[0]?.day).toBe("2026-08-25");
    expect(r.measured.daily.at(-1)?.day).toBe("2026-09-23");
    const busy = r.measured.daily.find((d) => d.day === "2026-09-20");
    expect(busy?.tokens).toEqual({ value: 10_500 + 11_500, tier: "measured" });
    expect(r.measured.daily.filter((d) => d.tokens.value === 0)).toHaveLength(
      29,
    );
  });

  it("daily tokens add up to every token on the receipt", () => {
    const r = receipt([claudeCall, solCall, reviewCall, unknownCall]);
    const b = r.measured.byType;
    expect(r.measured.daily.reduce((sum, d) => sum + d.tokens.value, 0)).toBe(
      b.input.value + b.cacheWrite.value + b.cacheRead.value + b.output.value,
    );
  });

  it("says how far through its damage class the receipt is", () => {
    expect(receipt([claudeCall]).damageClass).toMatchObject({
      name: "PAPER CUT",
      next: { name: "FENDER BENDER", at: 1e6 },
      progress: 10_500 / 1e6,
    });
    expect(receipt([call({ cacheRead: 6e9 })]).damageClass).toMatchObject({
      name: "UNINSURABLE",
      next: null,
      progress: 1,
    });
  });
});

describe("bars", () => {
  const on = (day: string, over: Partial<UsageEvent> = {}) =>
    call({ ts: Date.parse(`${day}T12:00:00Z`), ...over });
  const after = (lines: string[], start: string) =>
    lines[
      lines.findIndex((l) => l.trimStart().startsWith(start.trimStart())) + 1
    ];
  const barRow = /^ {2}[■▪·]{40} +\d+%$/;

  it("never prints past 48 columns", () => {
    for (const r of [
      receipt([claudeCall, solCall, reviewCall, unknownCall]),
      receipt([call({ cacheRead: 6e9 })]),
      receipt(
        [on("2026-08-11"), on("2026-09-23")],
        days("2026-08-11", "2026-09-23", 44),
      ),
    ])
      for (const line of text(r))
        expect([...line].length).toBeLessThanOrEqual(48);
  });

  it("draws the cache share under its percentage, rounded down", () => {
    // 9,000 of 10,500 tokens re-read: 85.7% of 44 squares is 37.7, printed as 37.
    expect(after(text(receipt([claudeCall])), "  re-read from cache")).toBe(
      `  ${"■".repeat(37)}${"·".repeat(7)}`,
    );
    const empty = text(receipt([call({ input: 0, cacheRead: 0, output: 0 })]));
    expect(after(empty, "  re-read from cache")).toMatch(/^TOKENS WRITTEN/);
  });

  it("gives each row of a split its share of the tokens", () => {
    const lines = text(receipt([claudeCall, solCall]));
    expect(lines.filter((l) => barRow.test(l))).toHaveLength(4);
    // opus 10,500 of 22,000 tokens: 47.7%, 19 of 40 squares.
    expect(after(lines, "  opus")).toBe(
      `  ${"■".repeat(19)}${"·".repeat(21)}  48%`,
    );
    expect(text(receipt([claudeCall])).filter((l) => barRow.test(l))).toEqual(
      [],
    );
  });

  it("shows how far the total is into its damage class", () => {
    expect(after(text(receipt([claudeCall])), "┗")).toBe(
      `  ▪${"·".repeat(23)}  1% to FENDER BENDER`,
    );
    expect(after(text(receipt([call({ cacheRead: 6e9 })])), "┗")).toBe(
      `  ${"■".repeat(24)}  top of the scale`,
    );
  });

  it("draws one mark per day, a dot for a quiet day, and points at the busiest", () => {
    const lines = text(receipt([claudeCall]));
    expect(lines).toContain("BY DAY .......................... 1 day = 1 mark");
    expect(after(lines, "BY DAY")).toBe(`  ${"·".repeat(26)}█${"·".repeat(3)}`);
    expect(lines[lines.findIndex((l) => l.startsWith("BY DAY")) + 2]).toBe(
      `${" ".repeat(28)}▲ sep 20`,
    );
  });

  it("puts the busiest day's label on the left when the right would run off", () => {
    const lines = text(
      receipt(
        [on("2026-08-11"), on("2026-09-23", { cacheRead: 90_000 })],
        days("2026-08-11", "2026-09-23", 44),
      ),
    );
    expect(lines[lines.findIndex((l) => l.startsWith("BY DAY")) + 2]).toBe(
      `${" ".repeat(38)}sep 23 ▲`,
    );
  });

  it("groups long periods from the newest day back, so only the oldest mark is partial", () => {
    const lines = text(
      receipt(
        [on("2026-09-21", { cacheRead: 90_000 }), on("2026-09-23")],
        days("2026-06-16", "2026-09-23", 100),
      ),
    );
    expect(lines).toContain("BY DAY ......................... 3 days = 1 mark");
    // 100 days in 3s from the newest: 33 whole marks and a 1-day one at the start. Sep 21–23 share the last mark.
    expect(after(lines, "BY DAY")).toBe(`  ${"·".repeat(33)}█`);
  });

  it("points at the day with the most tokens, not the most expensive one", () => {
    // Sep 10 reads 200k cached tokens (cheap); Sep 20 writes 50k output tokens (dear).
    const r = receipt([
      on("2026-09-10", { cacheRead: 200_000 }),
      on("2026-09-20", { output: 50_000 }),
    ]);
    expect(r.priced.mostExpensiveDay?.day).toBe("2026-09-20");
    const lines = text(r);
    expect(lines[lines.findIndex((l) => l.startsWith("BY DAY")) + 2]).toBe(
      `${" ".repeat(18)}▲ sep 10`,
    );
  });

  it("names the days a long period's tallest mark covers", () => {
    const lines = text(
      receipt(
        [on("2026-09-21", { cacheRead: 90_000 }), on("2026-09-23")],
        days("2026-06-16", "2026-09-23", 100),
      ),
    );
    expect(lines[lines.findIndex((l) => l.startsWith("BY DAY")) + 2]).toBe(
      `${" ".repeat(35)}▲ sep 21–23`,
    );
  });

  it("leaves out the day chart for a one-day receipt", () => {
    const lines = text(
      receipt([claudeCall], days("2026-09-20", "2026-09-20", 1)),
    );
    expect(lines.some((l) => l.startsWith("BY DAY"))).toBe(false);
  });

  it("prints every bar in plain ink", () => {
    const bars = /^ {2}[■▪·▁▂▃▄▅▆▇█]{8,}|^ +(▲ [a-z]{3} \d+|[a-z]{3} \d+ ▲)$/;
    const lines = receiptLines(receipt([claudeCall, solCall]));
    const drawn = lines.filter((l) => bars.test(l.text));
    expect(drawn.length).toBeGreaterThanOrEqual(8);
    for (const line of drawn) expect(line.style, line.text).toBeUndefined();
  });
});
