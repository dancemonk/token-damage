import { aggregate } from "../aggregate/index.js";
import { listPrice, priceFor } from "../metrics/pricing.js";
import {
  damageClass,
  damageFloor,
  nextDamageClass,
} from "../roasts/classes.js";
import type { PromptEvent, TokenSums, UsageEvent, Value } from "../types.js";
import { localDay } from "./day.js";
import { buildTurns, type Turn } from "./turns.js";

export interface LimitWindow {
  usedPct: number;
  resetsAt: number;
}
export interface Limits {
  fiveHour?: LimitWindow;
  sevenDay?: LimitWindow;
  asOf: number;
}

export interface LiveSnapshot {
  day: string;
  now: number;
  tokens: TokenSums;
  read: number;
  written: number;
  total: number;
  words: number;
  calls: number;
  price: Value;
  notPriced: boolean;
  partlyPriced: boolean;
  damage: {
    name: string;
    next: { name: string; at: number } | null;
    pct: number;
  };
  rate: { perMin: number; buckets: number[] };
  turns: Turn[];
  open: Turn | null;
  badges: Record<string, number>;
  lastCall: number | null;
  idleMs: number | null;
  printing: boolean;
  limits: Limits | null;
}

export interface SnapshotInput {
  usage: readonly UsageEvent[];
  prompts: readonly PromptEvent[];
  now: number;
  limits?: Limits | null;
  timeZone?: string;
}

export const RATE_WINDOW_MS = 30 * 60_000;
export const RATE_BUCKETS = 10;
export const PRINTING_MS = 60_000;

const eventTokens = (e: UsageEvent) =>
  e.input + e.cacheWrite + e.cacheRead + e.output;

export function buildSnapshot({
  usage,
  prompts,
  now,
  limits = null,
  timeZone,
}: SnapshotInput): LiveSnapshot {
  const { totals } = aggregate(
    { usage, prompts },
    timeZone ? { timeZone } : {},
  );
  const t = totals.tokens;
  const read = t.input + t.cacheWrite + t.cacheRead;
  const written = t.output;
  const total = read + written;
  const price = listPrice(totals.byModel);
  const matches = Object.keys(totals.byModel).map(
    (k) => priceFor(k) !== undefined,
  );
  const notPriced = matches.length > 0 && matches.every((m) => !m);
  const partlyPriced = matches.some((m) => m) && matches.some((m) => !m);

  const next = nextDamageClass(total);
  const current = damageClass(total);
  const floor = damageFloor(total);
  const pct = next
    ? Math.min(100, Math.max(0, ((total - floor) / (next.at - floor)) * 100))
    : 100;

  const buckets = new Array<number>(RATE_BUCKETS).fill(0);
  const windowStart = now - RATE_WINDOW_MS;
  const width = RATE_WINDOW_MS / RATE_BUCKETS;
  let lastCall: number | null = null;
  for (const e of usage) {
    if (e.ts <= now && (lastCall === null || e.ts > lastCall)) lastCall = e.ts;
    if (e.ts > windowStart && e.ts <= now)
      buckets[
        Math.min(RATE_BUCKETS - 1, Math.floor((e.ts - windowStart) / width))
      ]! += eventTokens(e);
  }
  const perMin = buckets.reduce((a, b) => a + b, 0) / (RATE_WINDOW_MS / 60_000);

  const turns = buildTurns(usage, prompts, now);
  const open =
    turns.filter((x) => x.open).sort((a, b) => b.end - a.end)[0] ?? null;

  const firstSeen = new Map<string, number>();
  const note = (id: string, ts: number) => {
    const seen = firstSeen.get(id);
    if (seen === undefined || ts < seen) firstSeen.set(id, ts);
  };
  for (const p of prompts) note(p.sessionId, p.ts);
  for (const e of usage) note(e.parentSessionId ?? e.sessionId, e.ts);
  const badges: Record<string, number> = {};
  [...firstSeen.entries()]
    .sort((a, b) => a[1] - b[1])
    .forEach(([id], i) => (badges[id] = i + 1));

  return {
    day: localDay(now, timeZone),
    now,
    tokens: t,
    read,
    written,
    total,
    words: totals.wordsTyped,
    calls: totals.calls,
    price,
    notPriced,
    partlyPriced,
    damage: { name: current.name, next, pct },
    rate: { perMin, buckets },
    turns,
    open,
    badges,
    lastCall,
    idleMs: lastCall === null ? null : Math.max(0, now - lastCall),
    printing: lastCall !== null && now - lastCall <= PRINTING_MS,
    limits,
  };
}
