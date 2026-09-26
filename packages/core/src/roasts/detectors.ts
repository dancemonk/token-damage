// Observations the raw events hold but the aggregate does not: per-session shapes, overlaps between agents, cache
// rebuilds. Pure; numbers and ids only, never text. docs/ROASTS.md §Adjuster's notes.
import type { PromptEvent, Source, UsageEvent } from "../types.js";

export interface Detected {
  /** A typed session that read a lot on flagship models only and wrote almost nothing. */
  snobSession: { output: number; read: number; calls: number } | null;
  /** The biggest typed session over within two minutes of its first prompt. */
  speedrun: { tokens: number; seconds: number } | null;
  /** Most typed sessions started inside any forty minutes; null without prompts. */
  burstSessions: number | null;
  /** Most distinct agents with calls inside any hour. */
  agentsInOneHour: number;
  /** The two busiest agents (by tokens) in that hour, when there were two or more. */
  agentPair: [Source, Source] | null;
  /** Calls that wrote a hot cache again, minutes after reading it: something upstream changed. */
  cacheRebuilds: number;
  /** Share of tokens in sessions nobody typed a prompt into; null without prompts. */
  unpromptedShare: number | null;
}

const FLAGSHIP = /opus|fable|mythos/i;
const MIN_MS = 60_000;
const rootOf = (e: UsageEvent) => e.parentSessionId ?? e.sessionId;
const readOf = (e: UsageEvent) => e.input + e.cacheWrite + e.cacheRead;
const tokensOf = (e: UsageEvent) => readOf(e) + e.output;

function groupBy<T>(
  items: readonly T[],
  key: (t: T) => string,
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

function snob(
  roots: Map<string, UsageEvent[]>,
  typed: Set<string>,
): Detected["snobSession"] {
  let best: Detected["snobSession"] = null;
  for (const [root, events] of roots) {
    if (!typed.has(root) || events.length < 5) continue;
    if (!events.every((e) => FLAGSHIP.test(e.model))) continue;
    const read = events.reduce((s, e) => s + readOf(e), 0);
    const output = events.reduce((s, e) => s + e.output, 0);
    if (read < 2e6 || output >= 500) continue;
    if (
      !best ||
      output < best.output ||
      (output === best.output && read > best.read)
    )
      best = { output, read, calls: events.length };
  }
  return best;
}

function speedrun(
  roots: Map<string, UsageEvent[]>,
  firstPrompt: Map<string, number>,
): Detected["speedrun"] {
  let best: Detected["speedrun"] = null;
  for (const [root, events] of roots) {
    const prompted = firstPrompt.get(root);
    if (prompted === undefined || events.length < 3) continue;
    // Loops, not Math.max(...times): one long session can hold more calls than a spread may pass.
    let tokens = 0;
    let first = prompted;
    let last = -Infinity;
    for (const e of events) {
      tokens += tokensOf(e);
      if (e.ts < first) first = e.ts;
      if (e.ts > last) last = e.ts;
    }
    const seconds = Math.round((last - first) / 1000);
    if (tokens < 1e6 || seconds < 10 || seconds > 120) continue;
    if (!best || tokens > best.tokens) best = { tokens, seconds };
  }
  return best;
}

function burst(firstPrompt: Map<string, number>): number {
  const starts = [...firstPrompt.values()].sort((a, b) => a - b);
  let most = 0;
  for (let i = 0, j = 0; j < starts.length; j++) {
    while ((starts[j] as number) - (starts[i] as number) >= 40 * MIN_MS) i++;
    most = Math.max(most, j - i + 1);
  }
  return most;
}

function agents(
  usage: readonly UsageEvent[],
): Pick<Detected, "agentsInOneHour" | "agentPair"> {
  const sorted = [...usage].sort((a, b) => a.ts - b.ts);
  const calls = new Map<Source, number>();
  const tokens = new Map<Source, number>();
  let most = 0;
  let pair: Detected["agentPair"] = null;
  for (let i = 0, j = 0; j < sorted.length; j++) {
    const e = sorted[j] as UsageEvent;
    calls.set(e.source, (calls.get(e.source) ?? 0) + 1);
    tokens.set(e.source, (tokens.get(e.source) ?? 0) + tokensOf(e));
    while (e.ts - (sorted[i] as UsageEvent).ts > 60 * MIN_MS) {
      const old = sorted[i++] as UsageEvent;
      calls.set(old.source, (calls.get(old.source) ?? 0) - 1);
      tokens.set(old.source, (tokens.get(old.source) ?? 0) - tokensOf(old));
    }
    const present = [...calls].filter(([, n]) => n > 0).map(([s]) => s);
    if (present.length > most) {
      most = present.length;
      const busiest = present.sort(
        (a, b) => (tokens.get(b) ?? 0) - (tokens.get(a) ?? 0),
      );
      pair = most >= 2 ? [busiest[0] as Source, busiest[1] as Source] : null;
    }
  }
  return { agentsInOneHour: most, agentPair: pair };
}

function rebuilds(usage: readonly UsageEvent[]): number {
  let count = 0;
  // One cache per conversation: the main thread and each subagent keep their own.
  for (const events of groupBy(
    usage,
    (e) => `${e.sessionId}|${e.agentId ?? ""}`,
  ).values()) {
    events.sort((a, b) => a.ts - b.ts);
    for (let k = 1; k < events.length; k++) {
      const prev = events[k - 1] as UsageEvent;
      const cur = events[k] as UsageEvent;
      // Inside the default five-minute cache life, a hot cache written again instead of read.
      if (
        cur.ts - prev.ts <= 4 * MIN_MS &&
        cur.cacheWrite >= 100_000 &&
        prev.cacheRead >= 100_000 &&
        cur.cacheRead < prev.cacheRead / 2
      )
        count++;
    }
  }
  return count;
}

/** Everything above for one period. Prompt-dependent facts are null when the caller has no prompts. */
export function detect(
  usage: readonly UsageEvent[],
  prompts?: readonly PromptEvent[],
): Detected {
  const roots = groupBy(usage, rootOf);
  const both = agents(usage);
  const cacheRebuilds = rebuilds(usage);
  if (!prompts)
    return {
      snobSession: null,
      speedrun: null,
      burstSessions: null,
      ...both,
      cacheRebuilds,
      unpromptedShare: null,
    };
  const firstPrompt = new Map<string, number>();
  for (const p of prompts)
    firstPrompt.set(
      p.sessionId,
      Math.min(p.ts, firstPrompt.get(p.sessionId) ?? Infinity),
    );
  const typed = new Set(firstPrompt.keys());
  const all = usage.reduce((s, e) => s + tokensOf(e), 0);
  const unprompted = usage
    .filter((e) => !typed.has(rootOf(e)))
    .reduce((s, e) => s + tokensOf(e), 0);
  return {
    snobSession: snob(roots, typed),
    speedrun: speedrun(roots, firstPrompt),
    burstSessions: burst(firstPrompt),
    ...both,
    cacheRebuilds,
    unpromptedShare: all > 0 ? unprompted / all : 0,
  };
}
