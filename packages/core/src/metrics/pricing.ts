import type { Source, TokenSums, UsageEvent, Value } from "../types.js";
import prices from "./prices.json" with { type: "json" };

/** USD per 1M tokens. */
export interface ModelPrice {
  input: number;
  cacheWrite: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
}

/** A model's standard price, plus the rows some providers charge per call. */
export interface ModelPrices extends ModelPrice {
  /** Calls over the long-context threshold (OpenAI: 272K input tokens). */
  longContext?: ModelPrice;
  /** OpenAI Fast mode, called priority processing before 2026-07-30. */
  fast?: ModelPrice;
  fastLongContext?: ModelPrice;
}

export interface PriceTable {
  asOf: string;
  models: Record<string, ModelPrices>;
}

export const PRICES: PriceTable = prices;

export interface PriceMatch {
  price: ModelPrice;
  /**
   * Priced as a guess: the nearest known model of the same family, the model a routing alias probably
   * ran on, a model the log did not record, or a tier or context size without a listed price.
   * Show "≡ (est. model)".
   */
  isFallback: boolean;
}

/** Input tokens per call above which a source's provider charges long-context rates. */
export const LONG_CONTEXT_INPUT: Partial<Record<Source, number>> = {
  codex: 272_000,
  gemini: 200_000,
};

/**
 * Key an event's tokens are summed under in `byModel`: the model, plus what changes its price per call
 * (`|as=<model>`, `|fast`, `|long`, `|est`). Plain model names for everything priced the normal way.
 */
export function modelKey(e: UsageEvent): string {
  let key = e.model;
  if (e.priceAs) key += `|as=${e.priceAs}`;
  if (e.serviceTier === "fast") key += "|fast";
  const threshold = LONG_CONTEXT_INPUT[e.source];
  if (
    threshold !== undefined &&
    e.input + e.cacheRead + e.cacheWrite > threshold
  )
    key += "|long";
  if (e.isFallbackModel) key += "|est";
  return key;
}

/** The model name in a `byModel` key. */
export const modelName = (key: string): string => key.split("|")[0] ?? key;

function parseKey(key: string) {
  const [name = key, ...flags] = key.split("|");
  return {
    name,
    as: flags.find((f) => f.startsWith("as="))?.slice(3),
    fast: flags.includes("fast"),
    long: flags.includes("long"),
    est: flags.includes("est"),
  };
}

/** How a key reads in "est. model" and "not priced" notes. */
function label(key: string): string {
  const { name, as } = parseKey(key);
  return as ? `${name} as ${as}` : name;
}

const FAMILIES = ["fable", "mythos", "opus", "sonnet", "haiku"];
/** Gemini tiers, the family a Gemini model is priced by: "gemini-3-pro-preview" is a pro. */
const GEMINI_TIERS = ["flash-lite", "flash", "pro"];
const geminiTier = (model: string) =>
  model.startsWith("gemini-")
    ? GEMINI_TIERS.find((tier) => model.includes(`-${tier}`))
    : undefined;

// "claude-sonnet-4-5-20250929" and "claude-3-5-sonnet" → 4.5 and 3.5; date suffixes are not versions.
function version(model: string): number {
  const [major = 0, minor = 0] = (model.match(/\d+/g) ?? [])
    .filter((d) => d.length < 8)
    .map(Number);
  return major + minor / 10;
}

const withoutDate = (model: string) => model.replace(/-\d{8}$/, "");

/** Exact price, else the nearest version in the same family (Gemini: tier), else undefined (not priced). */
function modelPrices(
  model: string,
  table: PriceTable,
): { prices: ModelPrices; isFallback: boolean } | undefined {
  const exact = table.models[withoutDate(model)];
  if (exact) return { prices: exact, isFallback: false };
  // Codex models OpenAI no longer lists: "gpt-5.2-codex" → gpt-5.2.
  const base = table.models[model.replace(/-codex(?=-|$)/, "")];
  if (model.startsWith("gpt-") && base)
    return { prices: base, isFallback: true };
  const tier = geminiTier(model);
  const family = tier ?? FAMILIES.find((f) => model.includes(f));
  if (!family) return undefined;
  const target = version(model);
  const nearest = Object.keys(table.models)
    .filter((known) =>
      tier ? geminiTier(known) === tier : known.includes(family),
    )
    .sort(
      (a, b) =>
        Math.abs(version(a) - target) - Math.abs(version(b) - target) ||
        version(b) - version(a),
    )[0];
  return nearest
    ? { prices: table.models[nearest] as ModelPrices, isFallback: true }
    : undefined;
}

/**
 * Price of a `byModel` key (see `modelKey`). A long call on a model without a long-context price is a
 * normal call; a fast call without a Fast mode price is priced at its non-fast rate and marked estimated.
 */
export function priceFor(
  key: string,
  table: PriceTable = PRICES,
): PriceMatch | undefined {
  const k = parseKey(key);
  const match = modelPrices(k.as ?? k.name, table);
  if (!match) return undefined;
  const { prices } = match;
  // No long-context row: the model has no long-context premium.
  const long = k.long ? prices.longContext : undefined;
  const fast = k.fast
    ? long
      ? prices.fastLongContext
      : prices.fast
    : undefined;
  return {
    price: fast ?? long ?? prices,
    isFallback:
      match.isFallback ||
      k.as !== undefined ||
      k.est ||
      (k.fast && fast === undefined),
  };
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
  const estimated = new Set<string>();
  const unpriced = new Set<string>();
  for (const [key, t] of Object.entries(byModel)) {
    const match = priceFor(key, table);
    if (!match) {
      unpriced.add(modelName(key));
      continue;
    }
    if (match.isFallback) estimated.add(label(key));
    value += f(t, match.price);
  }
  const notes = [
    estimated.size ? `est. model: ${[...estimated].join(", ")}` : "",
    unpriced.size ? `not priced: ${[...unpriced].join(", ")}` : "",
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
