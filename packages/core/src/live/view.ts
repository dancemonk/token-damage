import { formatUsd } from "../metrics/format.js";
import { listPrice, priceFor } from "../metrics/pricing.js";
import {
  compactTokens,
  monthDay,
  n,
  wrap,
  type Line,
} from "../receipt/text.js";
import type { Source, TokenSums } from "../types.js";
import type { TapeEvent } from "./engine.js";
import type { LiveSnapshot } from "./snapshot.js";
import type { Turn } from "./turns.js";

export interface ViewOptions {
  width: number;
  height: number;
  timeZone?: string;
  noLogs?: boolean;
}

export const MIN_WIDTH = 40;
export const FULL_HEIGHT = 12;
export const IDLE_GAP_MS = 600_000;
const STAMP_RED_MS = 60_000;
const SPARKS = "▁▂▃▄▅▆▇█";

// Short on purpose: the receipt's AGENT_NAMES ("claude code", "gemini cli") do not fit the 10-column agent cell.
export const AGENT_SHORT: Record<Source, string> = {
  "claude-code": "claude",
  codex: "codex",
  gemini: "gemini",
  opencode: "opencode",
};

export const clip = (t: string, w: number) =>
  t.length <= w ? t : `${t.slice(0, Math.max(0, w - 1))}…`;

function fit(left: string, right: string, width: number): string {
  if (!right) return clip(left, width);
  const room = width - right.length - 1;
  if (room < 1) return clip(left, width);
  const l = clip(left, room);
  return l + " ".repeat(width - l.length - right.length) + right;
}

function center(text: string, fill: string, width: number): string {
  const t = clip(` ${text} `, width);
  const side = Math.max(0, width - t.length);
  const left = fill
    .repeat(Math.ceil(side / 2 / fill.length))
    .slice(0, Math.floor(side / 2));
  const right = fill
    .repeat(Math.ceil(side / fill.length))
    .slice(0, side - left.length);
  return left + t + right;
}

export function sparkline(values: readonly number[]): string {
  const max = Math.max(0, ...values);
  return values
    .map((v) => SPARKS[max === 0 ? 0 : Math.min(7, Math.round((v / max) * 7))])
    .join("");
}

export function duration(ms: number): string {
  const total = Math.floor(ms / 60_000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function priceOf(byModel: Record<string, TokenSums>): string {
  const keys = Object.keys(byModel);
  if (keys.length === 0) return `≡ ${formatUsd({ value: 0, tier: "priced" })}`;
  const matches = keys.map((k) => priceFor(k) !== undefined);
  if (matches.every((m) => !m)) return "not priced";
  return `≡ ${formatUsd(listPrice(byModel))}${matches.some((m) => !m) ? "+" : ""}`;
}

export const turnPrice = (t: Turn): string => priceOf(t.byModel);

const threshold = (at: number) => (at >= 1e9 ? `${at / 1e9}B` : `${at / 1e6}M`);

export function clock(ts: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(timeZone && { timeZone }),
  }).format(ts);
}

export function todayPrice(s: LiveSnapshot): string {
  return s.notPriced
    ? "not priced"
    : `≡ ${formatUsd(s.price)}${s.partlyPriced ? "+" : ""}`;
}

function resetLabel(ts: number, now: number, timeZone?: string): string {
  const day = (x: number) =>
    new Intl.DateTimeFormat("en-CA", { ...(timeZone && { timeZone }) }).format(
      x,
    );
  if (day(ts) === day(now)) return clock(ts, timeZone);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    ...(timeZone && { timeZone }),
  })
    .format(ts)
    .toLowerCase();
}

function who(t: Turn, s: LiveSnapshot): string {
  const multi = Object.keys(s.badges).length > 1;
  const badge =
    multi && s.badges[t.sessionId] !== undefined
      ? `·${s.badges[t.sessionId]}`
      : "";
  return `${AGENT_SHORT[t.source]}${badge}${t.interns ? `+${t.interns}` : ""}`;
}

const words = (t: Turn) => `${t.words === null ? "—" : n(t.words)} words`;

interface Cols {
  price: boolean;
  spark: boolean;
}

function glance(s: LiveSnapshot, o: ViewOptions, cols: Cols): Line[] {
  const w = o.width;
  const d = s.damage;
  let cls: string;
  if (!d.next) cls = clip(`${d.name}   top of the scale`, w);
  else {
    const left = `${d.name}   next ${d.next.name} at ${threshold(d.next.at)} `;
    const right = ` ${Math.floor(d.pct)}%`;
    const dots = w - left.length - right.length;
    cls =
      dots >= 2
        ? left + "·".repeat(dots) + right
        : clip(`${d.name} · ${Math.floor(d.pct)}% to ${d.next.name}`, w);
  }
  const today = fit(
    `today   ${n(s.words)} words → ${compactTokens(s.read)} read`,
    cols.price ? todayPrice(s) : "",
    w,
  );

  let now: string;
  if (s.open) {
    now = fit(
      `now     ${who(s.open, s)} · ${words(s.open)} → ${compactTokens(s.open.read)} ▸`,
      cols.price ? turnPrice(s.open) : "",
      w,
    );
  } else if (s.lastCall === null) {
    now = clip("now     nothing yet today", w);
  } else {
    const last = [...s.turns].reverse().find((t) => t.calls > 0);
    const tail = cols.price && last ? ` · last turn ${turnPrice(last)}` : "";
    now = clip(`now     idle ${duration(s.idleMs ?? 0)}${tail}`, w);
  }

  const state =
    s.lastCall === null
      ? "● waiting"
      : s.printing
        ? "● printing"
        : `● idle ${duration(s.idleMs ?? 0)}`;
  const spark = cols.spark ? ` ${sparkline(s.rate.buckets)}` : "";
  const rate = clip(
    `rate    ${compactTokens(s.rate.perMin)}/min${spark}   ${state}`,
    w,
  );

  const rows: Line[] = [
    { text: cls, style: "bold" },
    { text: today },
    { text: now, style: "bold" },
    { text: rate },
  ];
  const l = s.limits;
  if (l && (l.fiveHour || l.sevenDay)) {
    const parts: string[] = [];
    if (l.fiveHour)
      parts.push(
        `5h ${Math.round(l.fiveHour.usedPct)}% resets ${resetLabel(l.fiveHour.resetsAt, s.now, o.timeZone)}`,
      );
    if (l.sevenDay)
      parts.push(
        `7d ${Math.round(l.sevenDay.usedPct)}% resets ${resetLabel(l.sevenDay.resetsAt, s.now, o.timeZone)}`,
      );
    const stale =
      s.now - l.asOf > 60_000 ? ` · as of ${clock(l.asOf, o.timeZone)}` : "";
    rows.push({ text: clip(`limits  ${parts.join(" · ")}${stale}`, w) });
  }
  return rows;
}

interface Item {
  ts: number;
  end: number;
  lines: Line[];
}

// Wrapped at width - 2 so a continuation line's 2-space hang still fits within width; the receipt's own
// `hang` does the same thing at its fixed WIDTH (docs/superpowers/specs/2026-09-24-live-design.md §Tape).
function hang(text: string, width: number): string[] {
  return wrap(text, width - 2).map((line, i) => (i ? `  ${line}` : line));
}

function tape(
  s: LiveSnapshot,
  events: readonly TapeEvent[],
  o: ViewOptions,
  cols: Cols,
): Line[] {
  const w = o.width;
  const items: Item[] = [];
  for (const t of s.turns) {
    if (t.open) continue;
    const left = `${clock(t.start, o.timeZone)}  ${who(t, s).padEnd(10)} ${words(t).padStart(11)} → ${compactTokens(t.read).padStart(6)}`;
    items.push({
      ts: t.start,
      end: t.end,
      lines: [{ text: fit(left, cols.price ? turnPrice(t) : "", w) }],
    });
  }
  for (const e of events) {
    if (e.kind === "stamped") {
      const head = `${clock(e.ts, o.timeZone)}  ━━ stamped ${e.name} `;
      const text = clip(head + "━".repeat(Math.max(2, w - head.length)), w);
      items.push({
        ts: e.ts,
        end: e.ts,
        lines: [
          s.now - e.ts < STAMP_RED_MS ? { text, style: "red" } : { text },
        ],
      });
    } else if (e.kind === "note") {
      items.push({
        ts: e.ts,
        end: e.ts,
        lines: hang(`✶ ${e.text}`, w).map((text) => ({
          text: clip(text, w),
          style: "red" as const,
        })),
      });
    } else {
      const price = formatUsd({ value: e.price, tier: "priced" });
      items.push({
        ts: e.ts,
        end: e.ts,
        lines: [
          {
            text: center(
              `✂ tear here · ${monthDay(e.day)} · ≡ ${price}`,
              "- ",
              w,
            ),
            style: "muted",
          },
        ],
      });
    }
  }
  items.sort((a, b) => a.ts - b.ts);
  const out: Line[] = [];
  items.forEach((item, i) => {
    const prev = items[i - 1];
    if (prev && item.ts - prev.end > IDLE_GAP_MS)
      out.push({
        text: center(`idle ${duration(item.ts - prev.end)}`, "· ", w),
        style: "muted",
      });
    out.push(...item.lines);
  });
  if (out.length === 0)
    out.push({
      text: o.noLogs
        ? "no agent logs yet. start one."
        : "nothing printed yet today.",
      style: "muted",
    });
  return out;
}

/** The pane: docs/superpowers/specs/2026-09-24-live-design.md §Surface 1. */
export function liveLines(
  s: LiveSnapshot,
  events: readonly TapeEvent[],
  o: ViewOptions,
): Line[] {
  if (o.width < MIN_WIDTH)
    return [{ text: clip("token damage · widen me", o.width), style: "muted" }];
  const cols: Cols = { price: o.width >= 50, spark: o.width >= 45 };
  const top = glance(s, o, cols);
  if (o.height < FULL_HEIGHT) return top.slice(0, Math.max(1, o.height));
  const w = o.width;
  const rule: Line = { text: "─".repeat(w), style: "muted" };
  const header: Line = {
    text: fit(
      `time   ${"agent".padEnd(10)} ${"you typed".padStart(11)} → it read`,
      cols.price ? "list" : "",
      w,
    ),
    style: "muted",
  };
  const footer: Line = {
    text: fit(
      "",
      cols.price ? "≡ list price · ✶ satire · q quit" : "✶ satire · q quit",
      w,
    ),
    style: "muted",
  };
  const room = Math.max(0, o.height - top.length - 3);
  const rows = tape(s, events, o, cols).slice(-room);
  const blank = Array.from({ length: room - rows.length }, (): Line => ({
    text: "",
  }));
  return [...top, rule, header, ...blank, ...rows, footer];
}
