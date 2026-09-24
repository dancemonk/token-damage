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
  planMultiple,
  priceFor,
  ramX,
  sig2,
  water,
  withoutCache,
  type PriceTable,
  type TokenSums,
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

  it("prices unknown models as the nearest version of their family", () => {
    expect(priceFor("claude-sonnet-4-5-20250929")).toMatchObject({
      isFallback: true,
      price: { input: 3 },
    });
    expect(priceFor("claude-sonnet-5-1")).toMatchObject({
      isFallback: true,
      price: { input: 2 },
    });
    expect(priceFor("claude-3-5-haiku")).toMatchObject({
      isFallback: true,
      price: { input: 1 },
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
      "claude-sonnet-4-5": t,
    });
    expect(v.value).toBe(5 + 3);
    expect(v.note).toBe("est. model: claude-sonnet-4-5; not priced: unknown");
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
