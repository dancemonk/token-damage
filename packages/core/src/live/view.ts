import { AGENT_SHORT } from "../agents.js";
import { formatUsd } from "../metrics/format.js";
import { listPrice, priceFor } from "../metrics/pricing.js";
import {
  compactTokens,
  monthDay,
  n,
  wrap,
  type Line,
} from "../receipt/text.js";
import { bar, sparkline } from "../receipt/glyphs.js";
import type { TokenSums } from "../types.js";
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
/** The widest a glance-row bar gets, as the receipt's class progress bar. */
const BAR_MAX = 24;

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

/** Token sums per model across several turns, so a folded row is priced like any other. */
function mergedModels(turns: readonly Turn[]): Record<string, TokenSums> {
  const out: Record<string, TokenSums> = {};
  for (const t of turns)
    for (const [key, v] of Object.entries(t.byModel)) {
      const sums = (out[key] ??= {
        input: 0,
        cacheWrite: 0,
        cacheWrite1h: 0,
        cacheRead: 0,
        output: 0,
      });
      sums.input += v.input;
      sums.cacheWrite += v.cacheWrite;
      sums.cacheWrite1h += v.cacheWrite1h;
      sums.cacheRead += v.cacheRead;
      sums.output += v.output;
    }
  return out;
}

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
  // Session numbers tell your own windows apart; runs nobody typed a prompt for don't count.
  const multi =
    new Set(s.turns.filter((x) => x.words !== null).map((x) => x.sessionId))
      .size > 1;
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
    // The leader is the progress bar, as on the receipt; capped so a wide pane does not get a 150-glyph bar.
    cls =
      dots >= 2
        ? left + bar(d.pct / 100, Math.min(dots, BAR_MAX)) + right
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
    const stale =
      s.now - l.asOf > 60_000 ? ` · as of ${clock(l.asOf, o.timeZone)}` : "";
    // One row per window, bars the same width so they line up; plain text when they would be under 5 wide.
    const windows = (
      [
        ["5h", l.fiveHour],
        ["7d", l.sevenDay],
      ] as const
    ).flatMap(([name, x]) => (x ? [{ name, x }] : []));
    const tails = windows.map(
      ({ x }, i) =>
        `  resets ${resetLabel(x.resetsAt, s.now, o.timeZone)}${i === 0 ? stale : ""}`,
    );
    const size = Math.min(
      BAR_MAX,
      w - 11 - 5 - Math.max(...tails.map((t) => t.length)),
    );
    if (size >= 5) {
      windows.forEach(({ name, x }, i) =>
        rows.push({
          text: `${i === 0 ? "limits  " : "        "}${name} ${bar(x.usedPct / 100, size)} ${`${Math.round(x.usedPct)}%`.padStart(4)}${tails[i]}`,
        }),
      );
      return rows;
    }
    const parts: string[] = [];
    if (l.fiveHour)
      parts.push(
        `5h ${Math.round(l.fiveHour.usedPct)}% resets ${resetLabel(l.fiveHour.resetsAt, s.now, o.timeZone)}`,
      );
    if (l.sevenDay)
      parts.push(
        `7d ${Math.round(l.sevenDay.usedPct)}% resets ${resetLabel(l.sevenDay.resetsAt, s.now, o.timeZone)}`,
      );
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
// `hang` does the same thing at its fixed WIDTH (docs/LIVE.md §Tape).
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
  const row = (
    at: number,
    name: string,
    did: string,
    read: number,
    price: string,
  ) =>
    fit(
      `${clock(at, o.timeZone)}  ${name.padEnd(10)} ${did.padStart(11)} → ${compactTokens(read).padStart(6)}`,
      cols.price ? price : "",
      w,
    );
  // Only prompts someone typed; runs with no prompt are summed in one row under the header (quietRow).
  for (const t of [...s.turns].sort((a, b) => a.start - b.start)) {
    // A prompt the model never ran on (a slash command, an interrupt) read nothing: no row.
    if (t.open || t.words === null || t.calls === 0) continue;
    items.push({
      ts: t.start,
      end: t.end,
      lines: [
        { text: row(t.start, who(t, s), words(t), t.read, turnPrice(t)) },
      ],
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

/**
 * Today's runs nobody typed a prompt for (Agent SDK scripts, or a session carried over from yesterday), summed in
 * one muted row so the list stays about what you typed and the money still adds up; null when there are none.
 */
function quietRow(s: LiveSnapshot, o: ViewOptions, cols: Cols): Line | null {
  const quiet = s.turns.filter((t) => !t.open && t.words === null);
  if (quiet.length === 0) return null;
  const read = quiet.reduce((sum, t) => sum + t.read, 0);
  return {
    text: fit(
      `       ${quiet.length} ${quiet.length === 1 ? "run" : "runs"} with no prompt today → ${compactTokens(read)}`,
      cols.price ? priceOf(mergedModels(quiet)) : "",
      o.width,
    ),
    style: "muted",
  };
}

/** The pane: docs/LIVE.md §Surface 1. */
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
  const quiet = quietRow(s, o, cols);
  const room = Math.max(0, o.height - top.length - 3 - (quiet ? 1 : 0));
  const rows = tape(s, events, o, cols).slice(-room);
  const blank = Array.from({ length: room - rows.length }, (): Line => ({
    text: "",
  }));
  return [
    ...top,
    rule,
    header,
    ...(quiet ? [quiet] : []),
    ...blank,
    ...rows,
    footer,
  ];
}

export { sparkline };
