import { numberWord } from "../roasts/slots.js";
import type { LiveSnapshot } from "./snapshot.js";
import { OPEN_WINDOW_MS, type Turn } from "./turns.js";

export type VoiceFamily =
  | "window"
  | "library"
  | "swarm"
  | "re-read"
  | "one-last-fix"
  | "back"
  | "quiet";
export interface Trigger {
  family: VoiceFamily;
  key: string;
}
export interface VoiceState {
  fired: string[];
  lastAt: number | null;
  next: Partial<Record<VoiceFamily, number>>;
}

export const emptyVoice = (): VoiceState => ({
  fired: [],
  lastAt: null,
  next: {},
});
export const COOLDOWN_MS = 600_000;
const PRIORITY: VoiceFamily[] = [
  "window",
  "library",
  "swarm",
  "re-read",
  "one-last-fix",
  "back",
  "quiet",
];

/** docs/ROASTS.md voice: dry, measured, no digits (numbers only as words), no exclamation marks. */
export const LIVE_LINES: Record<VoiceFamily, readonly string[]> = {
  library: [
    "{words} in. a library out. the usual.",
    "you wrote {words}. it went and read the archives.",
    "{words} of instruction. the whole building is now on file.",
    "short prompt. long reading list.",
    "{words}. the agent took that as a research grant.",
  ],
  swarm: [
    "interns hired. none of them were asked to.",
    "the agent has delegated. the delegates have delegated.",
    "a small department has formed around your prompt.",
    "more interns than the task had verbs.",
    "staffing up. the meter noticed first.",
  ],
  "re-read": [
    "same pages, read again. the cache is doing the heavy lifting.",
    "it keeps re-reading what it just read. thorough, or lost.",
    "the reread count suggests a very good book.",
    "cache hit, cache hit, cache hit. the adjuster has seen this pattern before.",
    "re-reading at a discount is still re-reading.",
  ],
  back: [
    "back. the meter never left.",
    "welcome back. nothing was billed while you were gone. now it is.",
    "the break is over. the claim reopens.",
    "you returned. so did the tokens.",
    "an hour off. the agent picked up exactly where the bill left off.",
  ],
  "one-last-fix": [
    "it is past three. in most states even the bars have closed.",
    "late call logged. the adjuster is also awake, reluctantly.",
    "the one last fix, again.",
    "nothing good is merged at this hour. things are merely committed.",
    "still up. the servers do not mind. the adjuster does.",
  ],
  window: [
    "the five-hour window is nearly used. claude said so, not us.",
    "close to the limit. we only report what claude reports.",
    "the window is almost full. nobody here is forecasting anything.",
    "near the cap. the adjuster suggests a walk, not a prediction.",
    "most of the window is gone. this is a reading, not a warning.",
  ],
  quiet: [
    "quiet afternoon. suspicious.",
    "no calls for hours. the meter is getting nervous.",
    "silence on the line. either focus or lunch.",
    "a long pause. the adjuster files it under unusual.",
    "nothing billed for a while. the building is enjoying it.",
  ],
};

const HOUR_MS = 3_600_000;

function hourOf(ts: number, timeZone?: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      ...(timeZone && { timeZone }),
    }).format(ts),
  );
}

const cacheShare = (t: Turn) => {
  let read = 0;
  let cached = 0;
  for (const m of Object.values(t.byModel)) {
    read += m.input + m.cacheWrite + m.cacheRead;
    cached += m.cacheRead;
  }
  return read === 0 ? 0 : cached / read;
};

/** Measured facts that deserve a remark; docs/superpowers/specs/2026-09-24-live-design.md §Voice. */
export function detect(
  prev: LiveSnapshot | null,
  next: LiveSnapshot,
  opts: { timeZone?: string } = {},
): Trigger[] {
  const since = prev ? prev.now : next.now - OPEN_WINDOW_MS;
  const fresh = (t: Turn) => t.end > since && t.calls > 0;
  const out: Trigger[] = [];

  const w = next.limits?.fiveHour;
  if (w && w.usedPct >= 90)
    out.push({ family: "window", key: `window:${w.resetsAt}` });

  const o = next.open;
  if (o && fresh(o) && o.words !== null && o.words <= 10 && o.read >= 5e6)
    out.push({ family: "library", key: `library:${o.sessionId}:${o.start}` });

  for (const t of next.turns)
    if (fresh(t) && t.interns >= 3)
      out.push({ family: "swarm", key: `swarm:${t.sessionId}:${t.start}` });

  const bySession = new Map<string, Turn[]>();
  for (const t of next.turns)
    if (t.calls > 0)
      bySession.set(t.sessionId, [...(bySession.get(t.sessionId) ?? []), t]);
  for (const [session, turns] of bySession) {
    const last3 = turns.slice(-3);
    if (
      last3.length === 3 &&
      fresh(last3[2] as Turn) &&
      last3.every((t) => cacheShare(t) > 0.95)
    )
      out.push({ family: "re-read", key: `reread:${session}` });
  }

  if (
    prev?.lastCall != null &&
    next.lastCall != null &&
    next.lastCall > prev.lastCall &&
    next.lastCall - prev.lastCall > HOUR_MS
  )
    out.push({ family: "back", key: `back:${next.lastCall}` });

  if (next.lastCall !== null && next.lastCall > since) {
    const h = hourOf(next.lastCall, opts.timeZone);
    if (h >= 3 && h < 6)
      out.push({ family: "one-last-fix", key: `late:${next.day}` });
  }

  if (next.lastCall !== null && (next.idleMs ?? 0) >= 3 * HOUR_MS) {
    const h = hourOf(next.now, opts.timeZone);
    if (h >= 9 && h < 18)
      out.push({ family: "quiet", key: `quiet:${next.lastCall}` });
  }
  return out;
}

function offset(day: string, family: VoiceFamily, length: number): number {
  let h = 0;
  for (const c of `${day}|${family}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % length;
}

function wordsIn(n: number | null | undefined): string {
  if (n === null || n === undefined) return "a few words";
  const word = numberWord(n);
  if (/\d/.test(word)) return "a few words";
  return `${word} ${n === 1 ? "word" : "words"}`;
}

/** At most one remark per cooldown, the highest-priority unfired trigger, next variant of its family. */
export function speak(
  triggers: readonly Trigger[],
  state: VoiceState,
  now: number,
  ctx: { day: string; words?: number | null },
): { note: { family: VoiceFamily; text: string } | null; state: VoiceState } {
  if (state.lastAt !== null && now - state.lastAt < COOLDOWN_MS)
    return { note: null, state };
  const fired = new Set(state.fired);
  const pick = [...triggers]
    .filter((t) => !fired.has(t.key))
    .sort((a, b) => PRIORITY.indexOf(a.family) - PRIORITY.indexOf(b.family))[0];
  if (!pick) return { note: null, state };
  const lines = LIVE_LINES[pick.family];
  const i =
    state.next[pick.family] ?? offset(ctx.day, pick.family, lines.length);
  const text = (lines[i % lines.length] as string).replace(
    "{words}",
    wordsIn(ctx.words),
  );
  return {
    note: { family: pick.family, text },
    state: {
      fired: [...state.fired, pick.key],
      lastAt: now,
      next: { ...state.next, [pick.family]: (i + 1) % lines.length },
    },
  };
}
