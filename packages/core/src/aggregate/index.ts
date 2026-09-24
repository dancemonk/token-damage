import type {
  DailyTotals,
  SessionSummary,
  Source,
  Span,
  TokenSums,
  Totals,
  UsageEvent,
} from "../types.js";

/** Idle gaps longer than this split a session when measuring its longest stretch. */
export const IDLE_SPLIT_MS = 60 * 60 * 1000;

export interface AggregateOptions {
  /** IANA time zone for calendar days; defaults to the machine's. */
  timeZone?: string;
}

export interface Aggregate {
  totals: Totals;
  daily: DailyTotals[];
  sessions: SessionSummary[];
}

const zero = (): TokenSums => ({
  input: 0,
  cacheWrite: 0,
  cacheRead: 0,
  output: 0,
});

function plus(sums: TokenSums, t: TokenSums): void {
  sums.input += t.input;
  sums.cacheWrite += t.cacheWrite;
  sums.cacheRead += t.cacheRead;
  sums.output += t.output;
}

function add<K extends string>(
  into: Partial<Record<K, TokenSums>>,
  key: K,
  t: TokenSums,
): void {
  plus((into[key] ??= zero()), t);
}

// Every UTC offset is a multiple of 15 minutes, so all instants in a 15-minute bucket share a local day.
function dayFormatter(timeZone: string): (ts: number) => string {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const cache = new Map<number, string>();
  return (ts) => {
    const bucket = Math.floor(ts / 900_000);
    let day = cache.get(bucket);
    if (day === undefined) {
      const part = (type: string) =>
        format.formatToParts(ts).find((p) => p.type === type)?.value;
      day = `${part("year")}-${part("month")}-${part("day")}`;
      cache.set(bucket, day);
    }
    return day;
  };
}

function longestStretch(sorted: number[]): Span {
  let best: Span = { start: sorted[0] ?? 0, end: sorted[0] ?? 0 };
  let start = best.start;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1] as number;
    const ts = sorted[i] as number;
    if (ts - prev > IDLE_SPLIT_MS) start = ts;
    if (ts - start > best.end - best.start) best = { start, end: ts };
  }
  return best;
}

interface DayState extends DailyTotals {
  sessionKeys: Set<string>;
  agentKeys: Set<string>;
}

interface SessionState {
  times: number[];
  agentKeys: Set<string>;
}

/** Deduped events → daily totals, overall totals and sessions. Subagent events count toward their parent session. */
export function aggregate(
  events: readonly UsageEvent[],
  options: AggregateOptions = {},
): Aggregate {
  const dayOf = dayFormatter(
    options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const days = new Map<string, DayState>();
  const sessions = new Map<string, SessionState>();
  const allAgents = new Set<string>();

  for (const e of events) {
    const sessionId = e.parentSessionId ?? e.sessionId;
    const agentKey = e.agentId && `${sessionId}/${e.agentId}`;
    const day = dayOf(e.ts);
    let d = days.get(day);
    if (!d) {
      d = {
        day,
        byModel: {},
        bySource: {},
        calls: 0,
        sessions: 0,
        subagents: 0,
        wordsTyped: 0,
        firstCall: e.ts,
        lastCall: e.ts,
        sessionKeys: new Set(),
        agentKeys: new Set(),
      };
      days.set(day, d);
    }
    add(d.byModel, e.model, e);
    add<Source>(d.bySource, e.source, e);
    d.calls++;
    d.firstCall = Math.min(d.firstCall, e.ts);
    d.lastCall = Math.max(d.lastCall, e.ts);
    d.sessionKeys.add(sessionId);

    let s = sessions.get(sessionId);
    if (!s) sessions.set(sessionId, (s = { times: [], agentKeys: new Set() }));
    s.times.push(e.ts);

    if (agentKey) {
      d.agentKeys.add(agentKey);
      s.agentKeys.add(agentKey);
      allAgents.add(agentKey);
    }
  }

  const daily: DailyTotals[] = [...days.values()]
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .map(({ sessionKeys, agentKeys, ...d }) => ({
      ...d,
      sessions: sessionKeys.size,
      subagents: agentKeys.size,
    }));

  const summaries: SessionSummary[] = [...sessions].map(([sessionId, s]) => {
    const times = s.times.sort((a, b) => a - b);
    return {
      sessionId,
      start: times[0] as number,
      end: times.at(-1) as number,
      calls: times.length,
      subagents: s.agentKeys.size,
      longestStretch: longestStretch(times),
    };
  });
  summaries.sort(
    (a, b) => a.start - b.start || (a.sessionId < b.sessionId ? -1 : 1),
  );

  const totals: Totals = {
    tokens: zero(),
    byModel: {},
    bySource: {},
    calls: 0,
    sessions: summaries.length,
    activeDays: daily.length,
    subagents: allAgents.size,
    wordsTyped: 0,
    firstCall: daily[0]?.firstCall ?? null,
    lastCall: daily.at(-1)?.lastCall ?? null,
    longestSession: null,
  };
  for (const d of daily) {
    totals.calls += d.calls;
    totals.wordsTyped += d.wordsTyped;
    for (const [model, t] of Object.entries(d.byModel)) {
      add(totals.byModel, model, t);
      plus(totals.tokens, t);
    }
    for (const [source, t] of Object.entries(d.bySource) as [
      Source,
      TokenSums,
    ][])
      add(totals.bySource, source, t);
  }
  for (const { longestStretch: span } of summaries) {
    const best = totals.longestSession;
    if (!best || span.end - span.start > best.end - best.start)
      totals.longestSession = span;
  }
  return { totals, daily, sessions: summaries };
}
