import type { TokenSums, Value } from "../types.js";
import prices from "./prices.json" with { type: "json" };

/** USD per 1M tokens. */
export interface ModelPrice {
  input: number;
  cacheWrite: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
}

export interface PriceTable {
  asOf: string;
  models: Record<string, ModelPrice>;
}

export const PRICES: PriceTable = prices;

export interface PriceMatch {
  price: ModelPrice;
  /** Priced as the nearest known model of the same family: show "≡ (est. model)". */
  isFallback: boolean;
}

const FAMILIES = ["fable", "mythos", "opus", "sonnet", "haiku"];

// "claude-sonnet-4-5-20250929" and "claude-3-5-sonnet" → 4.5 and 3.5; date suffixes are not versions.
function version(model: string): number {
  const [major = 0, minor = 0] = (model.match(/\d+/g) ?? [])
    .filter((d) => d.length < 8)
    .map(Number);
  return major + minor / 10;
}

const withoutDate = (model: string) => model.replace(/-\d{8}$/, "");

/** Exact price, else the nearest version in the same family, else undefined (not priced). */
export function priceFor(
  model: string,
  table: PriceTable = PRICES,
): PriceMatch | undefined {
  const exact = table.models[withoutDate(model)];
  if (exact) return { price: exact, isFallback: false };
  const family = FAMILIES.find((f) => model.includes(f));
  if (!family) return undefined;
  const target = version(model);
  const nearest = Object.keys(table.models)
    .filter((known) => known.includes(family))
    .sort(
      (a, b) =>
        Math.abs(version(a) - target) - Math.abs(version(b) - target) ||
        version(b) - version(a),
    )[0];
  return nearest
    ? { price: table.models[nearest] as ModelPrice, isFallback: true }
    : undefined;
}

function cost(t: TokenSums, p: ModelPrice): number {
  const write5m = t.cacheWrite - t.cacheWrite1h;
  return (
    (t.input * p.input +
      write5m * p.cacheWrite +
      t.cacheWrite1h * p.cacheWrite1h +
      t.cacheRead * p.cacheRead +
      t.output * p.output) /
    1e6
  );
}

// Reads priced as fresh input would have cost, minus the premium paid to write the cache.
function saving(t: TokenSums, p: ModelPrice): number {
  const write5m = t.cacheWrite - t.cacheWrite1h;
  return (
    (t.cacheRead * (p.input - p.cacheRead) -
      write5m * (p.cacheWrite - p.input) -
      t.cacheWrite1h * (p.cacheWrite1h - p.input)) /
    1e6
  );
}

function priced(
  byModel: Record<string, TokenSums>,
  table: PriceTable,
  f: (t: TokenSums, p: ModelPrice) => number,
): Value {
  let value = 0;
  const estimated: string[] = [];
  const unpriced: string[] = [];
  for (const [model, t] of Object.entries(byModel)) {
    const match = priceFor(model, table);
    if (!match) {
      unpriced.push(model);
      continue;
    }
    if (match.isFallback) estimated.push(model);
    value += f(t, match.price);
  }
  const notes = [
    estimated.length ? `est. model: ${estimated.join(", ")}` : "",
    unpriced.length ? `not priced: ${unpriced.join(", ")}` : "",
  ].filter(Boolean);
  return {
    value,
    tier: "priced",
    ...(notes.length && { note: notes.join("; ") }),
  };
}

/** API list price of the tokens: "API-equivalent", never "you spent". */
export function listPrice(
  byModel: Record<string, TokenSums>,
  table: PriceTable = PRICES,
): Value {
  return priced(byModel, table, cost);
}

export function listPriceByModel(
  byModel: Record<string, TokenSums>,
  table: PriceTable = PRICES,
): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(byModel).map(([model, t]) => [
      model,
      listPrice({ [model]: t }, table),
    ]),
  );
}

/** What caching saved against paying fresh-input price for every cache read. */
export function cacheSaving(
  byModel: Record<string, TokenSums>,
  table: PriceTable = PRICES,
): Value {
  return priced(byModel, table, saving);
}

export function withoutCache(
  byModel: Record<string, TokenSums>,
  table: PriceTable = PRICES,
): Value {
  return priced(byModel, table, (t, p) => cost(t, p) + saving(t, p));
}

/** List price as a multiple of the user's plan price ("value extracted: 4.0× your plan"). */
export function planMultiple(list: Value, planUsd: number): Value {
  return {
    value: list.value / planUsd,
    tier: "priced",
    note: `plan $${planUsd}`,
  };
}
