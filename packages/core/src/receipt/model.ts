import type { Aggregate } from "../aggregate/index.js";

import { energy } from "../metrics/energy.js";
import {
  cacheSaving,
  listPrice,
  modelName,
  planMultiple,
  priceFor,
  PRICES,
  withoutCache,
  type PriceTable,
} from "../metrics/pricing.js";
import { ramX } from "../metrics/satire.js";
import type { Achievement } from "../roasts/achievements.js";
import type { Facts } from "../roasts/facts.js";
import type { Observations } from "../roasts/engine.js";
import type { Source, TokenSums, Value } from "../types.js";

/** Agent names as the card prints them; the 48-column receipt prints them in lower case. */
export const AGENT_NAMES: Record<Source, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
};

/** Tokens and list price of some `byModel` keys. */
export interface PriceRow {
  tokens: Value;
  listPrice: Value;
  /** Some of it priced as a guess (`PriceMatch.isFallback`): the receipt marks the row with "*". */
  estModel?: true;
  /** None of it has a list price: the receipt says "not priced" rather than $0. */
  notPriced?: true;
  /** Some of it has no list price: `listPrice` leaves those tokens out, so the receipt shows it as "$X+". */
  partlyPriced?: true;
}

/** Everything any output shows. Renderers format; they never compute. */
export interface Receipt {
  version: 1;
  trans: string;
  period: {
    /** Local calendar days, YYYY-MM-DD, inclusive. */
    start: string;
    end: string;
    days: number;
    /** Days Claude Code keeps transcripts; `isDefault` when the user never changed it. */
    retentionDays: number;
    retentionIsDefault: boolean;
  };
  measured: {
    words: Value;
    prompts: Value;
    calls: Value;
    sessions: Value;
    activeDays: Value;
    subagents: Value;
    /** Tokens by type: fresh input, cache writes, cache reads, output. */
    byType: {
      input: Value;
      cacheWrite: Value;
      cacheRead: Value;
      output: Value;
    };
    tokensRead: Value;
    cacheReadShare: Value;
    /** Fresh input plus cache writes, as a share of all tokens. */
    freshShare: Value;
    outputShare: Value;
    tokensWritten: Value;
    latestCall: Value<string> | null;
    /** Local calendar day of the latest call. */
    latestCallDay: string | null;
    longestSessionMinutes: Value | null;
  };
  /** Every agent with usage in the period, most tokens first. */
  byAgent: ({ agent: Source } & PriceRow)[];
  byModel: ({ name: string } & PriceRow)[];
  priced: {
    listPrice: Value;
    /** Some tokens have no list price and are left out of `listPrice` (shown "$X+"). */
    partlyPriced?: true;
    plan: { usd: number; multiple: Value } | null;
    cacheSaved: Value;
    withoutCache: Value;
    mostExpensiveDay: { day: string; listPrice: Value } | null;
  };
  estimated: {
    electricityKwh: Value;
    /** "a fridge running for 1–4 months", or phone charges when that would round to nothing. */
    comparison: { kind: "fridge-months" | "phone-charges"; value: Value };
    waterLiters: Value;
    co2Kg: Value;
    /** Words typed as a share of all tokens, at 1.0–1.6 tokens per word (≈1.33 central). */
    typingShare: Value;
  };
  satire: { ramX: Value };
  damageClass: { name: string; finePrint: string };
  note: { family: string; variant: number; text: string } | null;
  achievements: Achievement[];
  jokes: string[];
  method: { version: "v1"; pricesAsOf: string };
}

export interface ReceiptInput {
  trans: string;
  period: Receipt["period"];
  aggregate: Aggregate;
  facts: Facts;
  observations: Observations;
  planUsd?: number;
  prices?: PriceTable;
}

const measured = (value: number): Value => ({ value, tier: "measured" });
const FAMILIES = ["fable", "mythos", "opus", "sonnet", "haiku"];
const total = (t: TokenSums) => t.input + t.cacheWrite + t.cacheRead + t.output;

function priceRow(
  models: Record<string, TokenSums>,
  prices: PriceTable,
): PriceRow {
  const matches = Object.keys(models).map((key) => priceFor(key, prices));
  return {
    tokens: measured(Object.values(models).reduce((s, t) => s + total(t), 0)),
    listPrice: listPrice(models, prices),
    ...(matches.some((m) => m?.isFallback) && { estModel: true as const }),
    ...(matches.every((m) => !m) && { notPriced: true as const }),
    ...(matches.some((m) => !m) &&
      matches.some((m) => m) && { partlyPriced: true as const }),
  };
}

/** Most tokens first, ties by name. */
const mostTokens =
  <T extends PriceRow>(name: (row: T) => string) =>
  (a: T, b: T) =>
    b.tokens.value - a.tokens.value || (name(a) < name(b) ? -1 : 1);

// Rows follow the name people pick: Claude Code's /model takes a family ("opus" covers claude-opus-5 and
// claude-opus-5-5), Codex takes the full model name (gpt-5.6-sol and gpt-5.6-luna stay apart).
function byFamily(
  byModel: Record<string, TokenSums>,
  prices: PriceTable,
): Receipt["byModel"] {
  const groups = new Map<string, Record<string, TokenSums>>();
  for (const [model, t] of Object.entries(byModel)) {
    const name = FAMILIES.find((f) => model.includes(f)) ?? modelName(model);
    groups.set(name, { ...groups.get(name), [model]: t });
  }
  return [...groups]
    .map(([name, models]) => ({ name, ...priceRow(models, prices) }))
    .sort(mostTokens((row) => row.name));
}

function byAgent(
  bySource: Partial<Record<Source, Record<string, TokenSums>>>,
  prices: PriceTable,
): Receipt["byAgent"] {
  return (Object.entries(bySource) as [Source, Record<string, TokenSums>][])
    .map(([agent, models]) => ({ agent, ...priceRow(models, prices) }))
    .sort(mostTokens((row) => row.agent));
}

export function buildReceipt({
  trans,
  period,
  aggregate,
  facts,
  observations,
  planUsd,
  prices = PRICES,
}: ReceiptInput): Receipt {
  const { totals, daily } = aggregate;
  const t = totals.tokens;
  const list = listPrice(totals.byModel, prices);
  const kwh = energy(t);
  const high = kwh.high ?? kwh.value;
  const low = kwh.low ?? kwh.value;
  const comparison: Receipt["estimated"]["comparison"] =
    high / 33 >= 1
      ? {
          kind: "fridge-months",
          value: {
            value: kwh.value / 33,
            tier: "estimated",
            low: Math.max(1, Math.round(low / 33)),
            high: Math.round(high / 33),
          },
        }
      : {
          kind: "phone-charges",
          value: {
            value: (kwh.value * 1000) / 15,
            tier: "estimated",
            low: (low * 1000) / 15,
            high: (high * 1000) / 15,
          },
        };
  let mostExpensiveDay: Receipt["priced"]["mostExpensiveDay"] = null;
  for (const d of daily) {
    const price = listPrice(d.byModel, prices);
    if (
      d.calls > 0 &&
      (!mostExpensiveDay || price.value > mostExpensiveDay.listPrice.value)
    ) {
      mostExpensiveDay = { day: d.day, listPrice: price };
    }
  }
  const all = total(t);
  return {
    version: 1,
    trans,
    period,
    measured: {
      words: measured(totals.wordsTyped),
      prompts: measured(totals.prompts),
      calls: measured(totals.calls),
      sessions: measured(totals.sessions),
      activeDays: measured(facts.activeDays),
      subagents: measured(totals.subagents),
      byType: {
        input: measured(t.input),
        cacheWrite: measured(t.cacheWrite),
        cacheRead: measured(t.cacheRead),
        output: measured(t.output),
      },
      tokensRead: measured(t.input + t.cacheWrite + t.cacheRead),
      cacheReadShare: measured(all > 0 ? t.cacheRead / all : 0),
      freshShare: measured(all > 0 ? (t.input + t.cacheWrite) / all : 0),
      outputShare: measured(all > 0 ? t.output / all : 0),
      tokensWritten: measured(t.output),
      latestCall: facts.lastCall && {
        value: facts.lastCall.label,
        tier: "measured",
      },
      latestCallDay: facts.lastCall?.day ?? null,
      longestSessionMinutes:
        facts.longestSessionMin === null
          ? null
          : measured(facts.longestSessionMin),
    },
    byAgent: byAgent(totals.bySource, prices),
    byModel: byFamily(totals.byModel, prices),
    priced: {
      listPrice: list,
      ...(Object.keys(totals.byModel).some((key) => !priceFor(key, prices)) && {
        partlyPriced: true as const,
      }),
      plan: planUsd
        ? { usd: planUsd, multiple: planMultiple(list, planUsd) }
        : null,
      cacheSaved: cacheSaving(totals.byModel, prices),
      withoutCache: withoutCache(totals.byModel, prices),
      mostExpensiveDay,
    },
    estimated: {
      electricityKwh: kwh,
      comparison,
      waterLiters: {
        value: kwh.value * 1.1,
        tier: "estimated",
        low: low * 0.2,
        high: high * 2,
      },
      co2Kg: {
        value: kwh.value * 0.38,
        tier: "estimated",
        low: low * 0.34,
        high: high * 0.42,
      },
      typingShare: {
        value: all > 0 ? (totals.wordsTyped * 4) / 3 / all : 0,
        tier: "estimated",
        low: all > 0 ? totals.wordsTyped / all : 0,
        high: all > 0 ? (totals.wordsTyped * 1.6) / all : 0,
      },
    },
    satire: { ramX: ramX(all) },
    damageClass: observations.damageClass,
    note: observations.note && {
      family: observations.note.family,
      variant: observations.note.variant,
      text: observations.note.text,
    },
    achievements: observations.achievements,
    jokes: observations.jokes,
    method: { version: "v1", pricesAsOf: prices.asOf },
  };
}
