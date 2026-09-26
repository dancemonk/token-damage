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

function receipt(usage: UsageEvent[]): Receipt {
  const agg = aggregate({ usage }, { timeZone: "UTC" });
  const facts = buildFacts({ aggregate: agg, usage, timeZone: "UTC" });
  return buildReceipt({
    trans: "0001",
    period: {
      start: "2026-08-25",
      end: "2026-09-23",
      days: 30,
      retentionDays: 30,
      retentionIsDefault: true,
    },
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
    expect(lines.slice(at, at + 3).map((l) => l.slice(0, 24).trim())).toEqual([
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
