import { describe, expect, it } from "vitest";
import {
  cacheSaving,
  co2,
  energy,
  formatMultiple,
  formatRange,
  formatSatireUsd,
  formatUsd,
  listPrice,
  listPriceByModel,
  modelKey,
  modelName,
  planMultiple,
  priceFor,
  ramX,
  sig2,
  water,
  withoutCache,
  type PriceTable,
  type TokenSums,
  type UsageEvent,
} from "../src/index.js";

// docs/METRICS.md §Sample data, customer 0041, with the mockups' illustrative family prices.
const ILLUSTRATIVE: PriceTable = {
  asOf: "mockup",
  models: {
    opus: {
      input: 5,
      cacheWrite: 6.25,
      cacheWrite1h: 10,
      cacheRead: 0.5,
      output: 25,
    },
    sonnet: {
      input: 3,
      cacheWrite: 3.75,
      cacheWrite1h: 6,
      cacheRead: 0.3,
      output: 15,
    },
    haiku: {
      input: 1,
      cacheWrite: 1.25,
      cacheWrite1h: 2,
      cacheRead: 0.1,
      output: 5,
    },
  },
};
const MONTH: TokenSums = {
  input: 2.1e6,
  cacheWrite: 38.4e6,
  cacheWrite1h: 0,
  cacheRead: 1138.2e6,
  output: 4.7e6,
};
const MIX = { opus: 0.71, sonnet: 0.24, haiku: 0.05 };
const scale = (t: TokenSums, k: number): TokenSums => ({
  input: t.input * k,
  cacheWrite: t.cacheWrite * k,
  cacheWrite1h: t.cacheWrite1h * k,
  cacheRead: t.cacheRead * k,
  output: t.output * k,
});
const BY_MODEL = Object.fromEntries(
  Object.entries(MIX).map(([m, k]) => [m, scale(MONTH, k)]),
);
const total = (t: TokenSums) => t.input + t.cacheWrite + t.cacheRead + t.output;

describe("sample customer 0041 reproduces exactly", () => {
  it("list price $809.65, per model $665.34 / $134.94 / $9.37", () => {
    expect(formatUsd(listPrice(BY_MODEL, ILLUSTRATIVE))).toBe("$809.65");
    const byModel = listPriceByModel(BY_MODEL, ILLUSTRATIVE);
    expect(
      [byModel.opus, byModel.sonnet, byModel.haiku].map(
        (v) => v && formatUsd(v),
      ),
    ).toEqual(["$665.34", "$134.94", "$9.37"]);
  });

  it("cache saved $4,383.85; without cache $5,193.50", () => {
    expect(formatUsd(cacheSaving(BY_MODEL, ILLUSTRATIVE))).toBe("$4,383.85");
    expect(formatUsd(withoutCache(BY_MODEL, ILLUSTRATIVE))).toBe("$5,193.50");
  });

  it("electricity 26–120 kWh", () => {
    expect(formatRange(energy(MONTH), "kWh")).toBe("26–120 kWh");
  });

  it("RAM-X +$0.0000079", () => {
    expect(total(MONTH)).toBe(1_183_400_000);
    expect(formatSatireUsd(ramX(total(MONTH)))).toBe("+$0.0000079");
  });

  it("4.0× a $200 plan", () => {
    expect(
      formatMultiple(planMultiple(listPrice(BY_MODEL, ILLUSTRATIVE), 200)),
    ).toBe("4.0×");
  });
});

describe("energy method v1", () => {
  it("reproduces Hausfather's log: 3.2B tokens, 96% cache reads, 0.4% output → ~170 kWh (70–330)", () => {
    const tokens = 3.2e9;
    const kwh = energy({
      input: tokens * 0.036,
      cacheWrite: 0,
      cacheWrite1h: 0,
      cacheRead: tokens * 0.96,
      output: tokens * 0.004,
    });
    expect(kwh.value / 170).toBeCloseTo(1, 1);
    expect((kwh.low ?? 0) / 70).toBeCloseTo(1, 1);
    expect((kwh.high ?? 0) / 330).toBeCloseTo(1, 1);
  });

  it("stays near the ~50 kWh per billion tokens anchor on a typical mix", () => {
    const perBillion = energy(MONTH).value / (total(MONTH) / 1e9);
    expect(perBillion).toBeGreaterThan(20);
    expect(perBillion).toBeLessThan(100);
  });

  it("derives water and CO₂ as estimated ranges", () => {
    const kwh = energy(MONTH);
    expect(water(kwh)).toMatchObject({
      tier: "estimated",
      low: (kwh.low ?? 0) * 0.2,
      high: (kwh.high ?? 0) * 2,
    });
    expect(co2(kwh)).toMatchObject({
      tier: "estimated",
      low: (kwh.low ?? 0) * 0.34,
      high: (kwh.high ?? 0) * 0.42,
    });
  });
});

describe("tiers", () => {
  it("labels every value with its truth tier", () => {
    expect(listPrice(BY_MODEL, ILLUSTRATIVE).tier).toBe("priced");
    expect(cacheSaving(BY_MODEL, ILLUSTRATIVE).tier).toBe("priced");
    expect(energy(MONTH).tier).toBe("estimated");
    expect(ramX(1).tier).toBe("satire");
    expect(ramX(1).note).toMatch(/made up/);
  });
});

describe("priceFor", () => {
  it("matches known models exactly, with or without a date suffix", () => {
    expect(priceFor("claude-opus-5")).toMatchObject({
      isFallback: false,
      price: { input: 5, output: 25 },
    });
    expect(priceFor("claude-opus-4-7-20260101")).toMatchObject({
      isFallback: false,
    });
  });

  it("knows the older models by their real price, dated ids included", () => {
    expect(priceFor("claude-sonnet-4-5-20250929")).toMatchObject({
      isFallback: false,
      price: { input: 3 },
    });
    expect(priceFor("claude-opus-4-1-20250805")).toMatchObject({
      isFallback: false,
      price: { input: 15, output: 75 },
    });
    expect(priceFor("claude-opus-4-20250514")).toMatchObject({
      isFallback: false,
      price: { input: 15 },
    });
    expect(priceFor("claude-3-5-haiku-20241022")).toMatchObject({
      isFallback: false,
      price: { input: 0.8 },
    });
  });

  it("prices unknown models as the nearest version of their family", () => {
    expect(priceFor("claude-sonnet-4-7")).toMatchObject({
      isFallback: true,
      price: { input: 3 },
    });
    expect(priceFor("claude-sonnet-5-1")).toMatchObject({
      isFallback: true,
      price: { input: 2 },
    });
    expect(priceFor("claude-3-haiku")).toMatchObject({
      isFallback: true,
      price: { input: 0.8 },
    });
  });

  it("leaves models with no known family unpriced, and says so", () => {
    expect(priceFor("unknown")).toBeUndefined();
    const t = {
      input: 1e6,
      cacheWrite: 0,
      cacheWrite1h: 0,
      cacheRead: 0,
      output: 0,
    };
    const v = listPrice({
      "claude-opus-5": t,
      unknown: t,
      "claude-sonnet-4-7": t,
    });
    expect(v.value).toBe(5 + 3);
    expect(v.note).toBe("est. model: claude-sonnet-4-7; not priced: unknown");
  });
});

describe("1-hour cache writes", () => {
  const writes = (cacheWrite1h: number) => ({
    "claude-opus-5": {
      input: 0,
      cacheWrite: 1e6,
      cacheWrite1h,
      cacheRead: 0,
      output: 0,
    },
  });

  it("cost 2× input instead of 1.25×", () => {
    expect(listPrice(writes(0)).value).toBe(6.25);
    expect(listPrice(writes(1e6)).value).toBe(10);
  });

  it("carry their larger premium into the cache saving", () => {
    expect(cacheSaving(writes(0)).value).toBe(-1.25);
    expect(cacheSaving(writes(1e6)).value).toBe(-5);
  });
});

describe("OpenAI prices", () => {
  const call = (over: Partial<UsageEvent> = {}): UsageEvent => ({
    kind: "usage",
    source: "codex",
    sessionId: "s",
    ts: Date.parse("2026-09-01T00:00:00Z"),
    model: "gpt-5.6-terra",
    input: 1000,
    cacheWrite: 0,
    cacheWrite1h: 0,
    cacheRead: 200_000,
    output: 500,
    messageId: "m",
    dedupeKey: "m",
    ...over,
  });
  const million = {
    input: 1e6,
    cacheWrite: 0,
    cacheWrite1h: 0,
    cacheRead: 1e6,
    output: 1e6,
  };

  it("keys calls by what changes their price", () => {
    expect(modelKey(call())).toBe("gpt-5.6-terra");
    // 272,001 input tokens, cached ones included.
    expect(modelKey(call({ input: 72_001 }))).toBe("gpt-5.6-terra|long");
    expect(modelKey(call({ serviceTier: "fast" }))).toBe("gpt-5.6-terra|fast");
    expect(modelKey(call({ serviceTier: "standard" }))).toBe("gpt-5.6-terra");
    expect(
      modelKey(call({ model: "codex-auto-review", priceAs: "gpt-5.4" })),
    ).toBe("codex-auto-review|as=gpt-5.4");
    expect(modelKey(call({ model: "gpt-5", isFallbackModel: true }))).toBe(
      "gpt-5|est",
    );
    // Only OpenAI charges by context size here.
    expect(modelKey(call({ source: "claude-code", input: 900_000 }))).toBe(
      "gpt-5.6-terra",
    );
    expect(modelName("codex-auto-review|as=gpt-5.4|fast")).toBe(
      "codex-auto-review",
    );
  });

  it("prices standard, long-context, Fast mode and fast long-context calls from their own rows", () => {
    const usd = (key: string) => listPrice({ [key]: million }).value;
    // input + cached input + output, per 1M.
    expect(usd("gpt-5.6-terra")).toBeCloseTo(2 + 0.2 + 12);
    expect(usd("gpt-5.6-terra|long")).toBeCloseTo(4 + 0.4 + 18);
    expect(usd("gpt-5.6-terra|fast")).toBeCloseTo(4 + 0.4 + 24);
    expect(usd("gpt-5.6-terra|fast|long")).toBeCloseTo(8 + 0.8 + 36);
    expect(usd("gpt-5.5|long")).toBeCloseTo(10 + 1 + 45);
    // No long-context row: a long call costs what a short one does.
    expect(usd("gpt-5.4-mini|long")).toBeCloseTo(0.75 + 0.075 + 4.5);
  });

  it("marks guesses: aliases, unrecorded models, and tiers without a listed price", () => {
    expect(priceFor("codex-auto-review|as=gpt-5.4")).toMatchObject({
      isFallback: true,
      price: { input: 2.5, cacheRead: 0.25, output: 15 },
    });
    expect(priceFor("gpt-5|est")?.isFallback).toBe(true);
    // gpt-5.5 lists no Fast mode long-context row: the standard long row, marked.
    expect(priceFor("gpt-5.5|fast|long")).toMatchObject({
      isFallback: true,
      price: { input: 10 },
    });
    expect(priceFor("gpt-5.6-terra|fast|long")?.isFallback).toBe(false);
    const v = listPrice({
      "codex-auto-review|as=gpt-5.4": million,
      "codex-auto-review|as=gpt-5.6-luna": million,
      "gpt-5.6-sol": million,
    });
    expect(v.note).toBe(
      "est. model: codex-auto-review as gpt-5.4, codex-auto-review as gpt-5.6-luna",
    );
  });

  it("prices Codex models OpenAI no longer lists as their base model, marked", () => {
    expect(priceFor("gpt-5.2-codex")).toMatchObject({
      isFallback: true,
      price: { input: 1.75, output: 14 },
    });
    expect(priceFor("gpt-5.3-codex")).toMatchObject({
      isFallback: false,
      price: { input: 1.75 },
    });
    expect(priceFor("gpt-5.1-codex-max")).toBeUndefined();
  });

  it("bills cache writes as input where OpenAI lists no cache-write price", () => {
    const writes = { ...million, cacheRead: 0, output: 0, input: 0 };
    writes.cacheWrite = 1e6;
    expect(listPrice({ "gpt-5.5": writes }).value).toBe(5);
    expect(listPrice({ "gpt-5.6-sol": writes }).value).toBe(5);
  });
});

describe("sig2", () => {
  it("rounds to two significant figures without exponents", () => {
    expect([25.84, 122.26, 0.0937, 7.8696e-6, 1003, 0].map(sig2)).toEqual([
      "26",
      "120",
      "0.094",
      "0.0000079",
      "1,000",
      "0",
    ]);
  });
});
