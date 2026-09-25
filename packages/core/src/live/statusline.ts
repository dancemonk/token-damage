import { compactTokens, n, type Line } from "../receipt/text.js";
import type { TapeEvent } from "./engine.js";
import type { LimitWindow, Limits, LiveSnapshot } from "./snapshot.js";
import type { Turn } from "./turns.js";
import { clip, clock, duration, todayPrice, turnPrice } from "./view.js";

export interface StatusInput {
  sessionId: string | null;
  contextPct: number | null;
  limits: Limits | null;
}

export interface StatusOptions {
  rows: 1 | 2 | 3;
  width: number;
  timeZone?: string;
}

export const FALLBACK_ROW = "token damage · (reading)";

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const num = (x: unknown) =>
  typeof x === "number" && Number.isFinite(x) ? x : null;

function window(x: unknown): LimitWindow | undefined {
  if (!isObj(x)) return undefined;
  const used = num(x.used_percentage);
  const resets = num(x.resets_at);
  return used === null || resets === null
    ? undefined
    : { usedPct: used, resetsAt: resets * 1000 };
}

/** Claude Code's status-line JSON → the three things we use. The transcript path is never kept. */
export function parseStatusInput(raw: string, now: number): StatusInput {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return { sessionId: null, contextPct: null, limits: null };
  }
  if (!isObj(doc)) return { sessionId: null, contextPct: null, limits: null };
  const sessionId = typeof doc.session_id === "string" ? doc.session_id : null;
  const contextPct = isObj(doc.context_window)
    ? num(doc.context_window.used_percentage)
    : null;
  let limits: Limits | null = null;
  if (isObj(doc.rate_limits)) {
    const fiveHour = window(doc.rate_limits.five_hour);
    const sevenDay = window(doc.rate_limits.seven_day);
    if (fiveHour || sevenDay)
      limits = {
        ...(fiveHour && { fiveHour }),
        ...(sevenDay && { sevenDay }),
        asOf: now,
      };
  }
  return { sessionId, contextPct, limits };
}

const join = (parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" · ");
const wordsOf = (t: Turn) => `${t.words === null ? "—" : n(t.words)} words`;

function sessionRow(s: LiveSnapshot, input: StatusInput): string {
  const ctx =
    input.contextPct !== null && `ctx ${Math.round(input.contextPct)}%`;
  const mine = s.turns.filter((t) => t.sessionId === input.sessionId);
  const open = mine.find((t) => t.open);
  if (open) {
    const interns =
      open.interns > 0 &&
      `+${open.interns} ${open.interns === 1 ? "intern" : "interns"}`;
    return join([
      `▸ ${wordsOf(open)} → ${compactTokens(open.read)} read ${turnPrice(open)}`,
      interns,
      ctx,
    ]);
  }
  const last = [...mine].reverse().find((t) => t.calls > 0);
  if (!last) return join(["▸ nothing yet in this session", ctx]);
  return join([
    `▸ idle ${duration(s.now - last.end)} · last turn ${turnPrice(last)}`,
    ctx,
  ]);
}

function limitsText(
  l: Limits | null,
  withResets: boolean,
  timeZone?: string,
): string | false {
  if (!l) return false;
  const five =
    l.fiveHour &&
    `5h ${Math.round(l.fiveHour.usedPct)}%${withResets ? ` resets ${clock(l.fiveHour.resetsAt, timeZone)}` : ""}`;
  const seven =
    withResets && l.sevenDay && `7d ${Math.round(l.sevenDay.usedPct)}%`;
  return join([five, seven]) || false;
}

/** docs/superpowers/specs/2026-09-24-live-design.md §Surface 2. */
export function statuslineRows(
  s: LiveSnapshot,
  input: StatusInput,
  events: readonly TapeEvent[],
  o: StatusOptions,
): Line[] {
  if (o.rows === 1) {
    const open = s.turns.find((t) => t.sessionId === input.sessionId && t.open);
    const turn = open
      ? `▸ ${wordsOf(open)} → ${compactTokens(open.read)} ${turnPrice(open)}`
      : `today ${compactTokens(s.total)} ${todayPrice(s)}`;
    return [
      {
        text: clip(
          join([
            s.damage.name,
            turn,
            limitsText(input.limits, false, o.timeZone),
          ]),
          o.width,
        ),
      },
    ];
  }
  const rows: Line[] = [
    { text: clip(sessionRow(s, input), o.width) },
    {
      text: clip(
        join([
          s.damage.name,
          `today ${compactTokens(s.total)} ${todayPrice(s)}`,
          limitsText(input.limits, true, o.timeZone),
        ]),
        o.width,
      ),
    },
  ];
  if (o.rows === 3) {
    const note = [...events].reverse().find((e) => e.kind === "note");
    if (note && note.kind === "note")
      rows.push({ text: clip(`✶ ${note.text}`, o.width), style: "red" });
  }
  return rows;
}
