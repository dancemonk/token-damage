import type { Aggregate } from "../aggregate/index.js";
import { energy } from "../metrics/energy.js";
import {
  cacheSaving,
  listPrice,
  PRICES,
  type PriceTable,
} from "../metrics/pricing.js";
import type { PromptEvent, UsageEvent } from "../types.js";
import { detect, type Detected, type EarlierPrompt } from "./detectors.js";

/** Measured, priced and estimated facts the observation engine may cite. Aggregates only, never text. */
export interface Facts extends Detected {
  tokens: number;
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
  words: number;
  prompts: number;
  calls: number;
  sessions: number;
  activeDays: number;
  /** Calendar days from the first to the last active day, inclusive. */
  periodDays: number;
  subagents: number;
  maxSubagentsInDay: number;
  /** Latest call by clock time; 00:00–05:59 counts as the night before (1:00 AM = 1500 minutes). */
  lastCall: {
    label: string;
    minutes: number;
    /** Local calendar day, YYYY-MM-DD. */ day: string;
  } | null;
  longestSessionMin: number | null;
  /** Share of tokens on Saturdays and Sundays. */
  weekendShare: number;
  sessionsAfterMidnight: number;
  allSessionsEndBeforeNoon: boolean;
  /** Most consecutive calendar days without a model call, inside the period. */
  longestIdleDays: number;
  /** Some 7-day window with 4+ active days took over 95% of its input from cache. */
  cacheLordWeek: boolean;
  sessionSpansThreeDays: boolean;
  listPriceUsd: number | null;
  cacheSavingUsd: number | null;
  planUsd: number | null;
  kwh: { low: number; high: number } | null;
  /** V1, read from local git; null when unknown. */
  commits: number | null;
}

export interface FactsInput {
  aggregate: Aggregate;
  usage: readonly UsageEvent[];
  /** Typed prompts; without them the facts that need to know who typed what stay unknown. */
  prompts?: readonly PromptEvent[];
  /** Prompts from before the period (session and agent only), so carried-over sessions count as typed. */
  earlierPrompts?: readonly EarlierPrompt[];
  timeZone?: string;
  planUsd?: number;
  commits?: number;
  prices?: PriceTable;
}

const DAY_MS = 86_400_000;
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / DAY_MS;

function clock(timeZone: string) {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "numeric",
    minute: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return (ts: number) => {
    const parts = Object.fromEntries(
      format.formatToParts(ts).map((p) => [p.type, p.value]),
    );
    return {
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      day: `${parts.year}-${parts.month}-${parts.day}`,
    };
  };
}

export function clockLabel(hour: number, minute: number): string {
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

/** Facts for one receipt period, from deduped events and their aggregate. */
export function buildFacts({
  aggregate,
  usage,
  prompts,
  earlierPrompts,
  timeZone,
  planUsd,
  commits,
  prices = PRICES,
}: FactsInput): Facts {
  const { totals, daily, sessions } = aggregate;
  const at = clock(
    timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const t = totals.tokens;
  const tokens = t.input + t.cacheWrite + t.cacheRead + t.output;

  let lastCall: Facts["lastCall"] = null;
  for (const e of usage) {
    const { hour, minute, day } = at(e.ts);
    const minutes = (hour < 6 ? hour + 24 : hour) * 60 + minute;
    if (!lastCall || minutes > lastCall.minutes)
      lastCall = { label: clockLabel(hour, minute), minutes, day };
  }

  const dayTokens = (d: (typeof daily)[number]) =>
    Object.values(d.byModel).reduce(
      (s, m) => s + m.input + m.cacheWrite + m.cacheRead + m.output,
      0,
    );
  const weekend = daily
    .filter((d) => [0, 6].includes(new Date(`${d.day}T00:00:00Z`).getUTCDay()))
    .reduce((s, d) => s + dayTokens(d), 0);

  const active = daily.filter((d) => d.calls > 0);
  const first = active[0];
  const last = active.at(-1);
  let longestIdleDays = 0;
  for (let i = 1; i < active.length; i++) {
    longestIdleDays = Math.max(
      longestIdleDays,
      dayNumber((active[i] as (typeof active)[number]).day) -
        dayNumber((active[i - 1] as (typeof active)[number]).day) -
        1,
    );
  }

  let cacheLordWeek = false;
  for (const start of active) {
    const window = active.filter(
      (d) => dayNumber(d.day) - dayNumber(start.day) < 7 && d.day >= start.day,
    );
    const sums = window.flatMap((d) => Object.values(d.byModel));
    const read = sums.reduce((s, m) => s + m.cacheRead, 0);
    const allInput = sums.reduce(
      (s, m) => s + m.input + m.cacheWrite + m.cacheRead,
      0,
    );
    if (window.length >= 4 && allInput > 0 && read / allInput > 0.95)
      cacheLordWeek = true;
  }

  const ends = sessions.map((s) => ({ start: at(s.start), end: at(s.end) }));
  const kwh = tokens > 0 ? energy(t) : null;
  const byModel = totals.byModel;
  return {
    tokens,
    input: t.input,
    cacheWrite: t.cacheWrite,
    cacheRead: t.cacheRead,
    output: t.output,
    words: totals.wordsTyped,
    prompts: totals.prompts,
    calls: totals.calls,
    sessions: totals.sessions,
    activeDays: active.length,
    periodDays:
      first && last ? dayNumber(last.day) - dayNumber(first.day) + 1 : 0,
    subagents: totals.subagents,
    maxSubagentsInDay: Math.max(0, ...daily.map((d) => d.subagents)),
    lastCall,
    longestSessionMin:
      totals.longestSession &&
      (totals.longestSession.end - totals.longestSession.start) / 60_000,
    weekendShare: tokens > 0 ? weekend / tokens : 0,
    sessionsAfterMidnight: ends.filter((s) => s.start.hour < 6).length,
    allSessionsEndBeforeNoon:
      ends.length > 0 &&
      ends.every((s) => s.end.day === s.start.day && s.end.hour < 12),
    longestIdleDays,
    cacheLordWeek,
    sessionSpansThreeDays: ends.some(
      (s) => dayNumber(s.end.day) - dayNumber(s.start.day) >= 2,
    ),
    listPriceUsd: tokens > 0 ? listPrice(byModel, prices).value : null,
    cacheSavingUsd: tokens > 0 ? cacheSaving(byModel, prices).value : null,
    planUsd: planUsd ?? null,
    kwh: kwh && { low: kwh.low ?? kwh.value, high: kwh.high ?? kwh.value },
    commits: commits ?? null,
    ...detect(usage, prompts, earlierPrompts),
  };
}

/** Numbers the bands and strengths are written against. Null when a fact is unknown. */
export function metricsOf(f: Facts): Record<string, number | null> {
  return {
    tokens: f.tokens,
    words: f.words,
    tokensPerWord: f.words > 0 ? f.tokens / f.words : null,
    outputShare: f.tokens > 0 ? f.output / f.tokens : null,
    cacheShare:
      f.input + f.cacheWrite + f.cacheRead > 0
        ? f.cacheRead / (f.input + f.cacheWrite + f.cacheRead)
        : null,
    lastCallMinutes: f.lastCall?.minutes ?? null,
    longestSessionMin: f.longestSessionMin,
    sessions: f.sessions,
    activeDays: f.activeDays,
    periodDays: f.periodDays,
    commits: f.commits,
    tokensPerCommit:
      f.commits === null
        ? null
        : f.commits === 0
          ? Infinity
          : f.tokens / f.commits,
    planMultiple:
      f.planUsd && f.listPriceUsd !== null ? f.listPriceUsd / f.planUsd : null,
    maxSubagentsInDay: f.maxSubagentsInDay,
    weekendShare: f.weekendShare,
    tokensPerWeek:
      f.periodDays > 0 ? (f.tokens / Math.max(f.periodDays, 7)) * 7 : null,
    allSessionsEndBeforeNoon: f.allSessionsEndBeforeNoon ? 1 : 0,
    kwhHigh: f.kwh?.high ?? null,
    // `?? null`: facts built before these existed (sample customers, old callers) leave them unknown.
    snobOutput: f.snobSession?.output ?? null,
    snobRead: f.snobSession?.read ?? null,
    speedrunTokens: f.speedrun?.tokens ?? null,
    speedrunSeconds: f.speedrun?.seconds ?? null,
    burstSessions: f.burstSessions ?? null,
    agentsInOneHour: f.agentsInOneHour ?? null,
    cacheRebuilds: f.cacheRebuilds ?? null,
    unpromptedShare: f.unpromptedShare ?? null,
  };
}
