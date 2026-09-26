import { sig2 } from "../metrics/format.js";
import type { Facts } from "./facts.js";
import { metricsOf } from "./facts.js";
import { AGENT_NAMES } from "../agents.js";

const WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const numberWord = (n: number) => WORDS[n] ?? n.toLocaleString("en-US");
const sig3 = (x: number) => Number(x.toPrecision(3)).toLocaleString("en-US");

/** Gatsby ≈ 62,600 tokens. 1.29 → "The Great Gatsby, and a third of it again"; rounds to thirds and halves. */
export function gatsbys(copies: number): string {
  const fractions: [number, string][] = [
    [0, ""],
    [1 / 3, ", and a third of it again"],
    [1 / 2, ", and half of it again"],
    [2 / 3, ", and two thirds of it again"],
    [1, ""],
  ];
  const whole = Math.floor(copies);
  const [frac, tail] = fractions.reduce((best, f) =>
    Math.abs(copies - whole - f[0]) < Math.abs(copies - whole - best[0])
      ? f
      : best,
  );
  const n = whole + (frac === 1 ? 1 : 0);
  const times = n <= 1 ? "" : n === 2 ? " twice" : ` ${numberWord(n)} times`;
  return `The Great Gatsby${times}${tail}`;
}

/** "187 million", "1.18 billion", "212,000". */
export function tokenWords(n: number): string {
  if (n >= 1e9) return `${sig3(n / 1e9)} billion`;
  if (n >= 1e6) return `${sig3(n / 1e6)} million`;
  return Math.round(n).toLocaleString("en-US");
}

export function pct(share: number): string {
  const p = share * 100;
  return `${p >= 10 ? Math.round(p) : sig2(p)}%`;
}

export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  return h === 0
    ? part(m, "minute")
    : m === 0
      ? part(h, "hour")
      : `${part(h, "hour")} ${part(m, "minute")}`;
}

const usd = (x: number) =>
  `$${x.toLocaleString("en-US", Number.isInteger(x) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const range = (lo: number, hi: number) => `${sig2(lo)}–${sig2(hi)}`;

/** Slot values for templates; a slot is missing when its fact is unknown. */
export function slotsOf(f: Facts): Record<string, string> {
  const m = metricsOf(f);
  const s: Record<string, string> = {
    tokens: tokenWords(f.tokens),
    words: f.words.toLocaleString("en-US"),
    sessions: f.sessions.toLocaleString("en-US"),
    Sessions: cap(numberWord(f.sessions)),
    subagents: f.subagents.toLocaleString("en-US"),
    subagentsDay: f.maxSubagentsInDay.toLocaleString("en-US"),
    weekendShare: pct(f.weekendShare),
  };
  if (m.tokensPerWord !== null && m.tokensPerWord !== undefined) {
    s.ratio = Math.round(m.tokensPerWord).toLocaleString("en-US");
    s.gatsby = gatsbys(m.tokensPerWord / 62_600);
  }
  if (m.outputShare) {
    s.outputShare = pct(m.outputShare);
    s.inputShare = pct(1 - m.outputShare);
    s.readPerOutput = Math.round(
      (f.tokens - f.output) / f.output,
    ).toLocaleString("en-US");
  }
  if (m.cacheShare !== null && m.cacheShare !== undefined)
    s.cacheShare = pct(m.cacheShare);
  if (f.lastCall) s.lastCall = f.lastCall.label;
  if (f.longestSessionMin !== null) s.duration = duration(f.longestSessionMin);
  if (f.commits !== null) {
    s.commits = numberWord(f.commits);
    s.Commits = cap(numberWord(f.commits));
    if (f.commits > 0) s.tokensPerCommit = tokenWords(f.tokens / f.commits);
  }
  if (f.listPriceUsd !== null) s.listPrice = usd(f.listPriceUsd);
  if (f.cacheSavingUsd !== null) s.cacheSaving = usd(f.cacheSavingUsd);
  if (f.planUsd !== null) s.plan = usd(f.planUsd);
  if (m.planMultiple) s.multiple = `${m.planMultiple.toFixed(1)}×`;
  if (
    f.planUsd !== null &&
    f.listPriceUsd !== null &&
    f.listPriceUsd > f.planUsd
  ) {
    s.venture = usd(Math.round((f.listPriceUsd - f.planUsd) * 100) / 100);
  }
  if (f.kwh) {
    s.kwh = `${range(f.kwh.low, f.kwh.high)} kWh`;
    s.fridge = range(f.kwh.low / 33, f.kwh.high / 33);
    s.phone = range((f.kwh.low * 1000) / 15, (f.kwh.high * 1000) / 15);
  }
  if (f.snobSession) {
    s.snobOutput = f.snobSession.output.toLocaleString("en-US");
    s.snobRead = tokenWords(f.snobSession.read);
  }
  if (f.speedrun) {
    s.speedrunTokens = tokenWords(f.speedrun.tokens);
    s.speedrunSeconds = String(f.speedrun.seconds);
  }
  if (f.burstSessions) s.BurstSessions = cap(numberWord(f.burstSessions));
  if (f.agentPair)
    s.agentPair = `${AGENT_NAMES[f.agentPair[0]]} and ${AGENT_NAMES[f.agentPair[1]]}`;
  if (f.cacheRebuilds) s.cacheRebuilds = numberWord(f.cacheRebuilds);
  if (f.unpromptedShare) s.unpromptedShare = pct(f.unpromptedShare);
  return s;
}

/** Fills {slot}s; undefined when any slot is missing. */
export function render(
  template: string,
  slots: Record<string, string>,
): string | undefined {
  let missing = false;
  const text = template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = slots[name];
    if (value === undefined) missing = true;
    return value ?? "";
  });
  return missing ? undefined : text;
}
