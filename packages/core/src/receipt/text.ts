import { formatRange, formatUsd, sig2 } from "../metrics/format.js";
import type { Value } from "../types.js";
import { AGENT_NAMES, type PriceRow, type Receipt } from "./model.js";

export const WIDTH = 48;

/** One printed line and how to colour it: rules muted, estimates ochre, satire and the stamp red. */
export interface Line {
  text: string;
  style?: "muted" | "ochre" | "red" | "stamp";
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const monthDay = (day: string) =>
  `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
const n = (x: number) => Math.round(x).toLocaleString("en-US");

const center = (text: string): string =>
  " ".repeat(Math.max(0, Math.floor((WIDTH - text.length) / 2))) + text;
const leader = (label: string, value: string): string =>
  `${label} ${".".repeat(Math.max(1, WIDTH - label.length - value.length - 2))} ${value}`;
const spaced = (text: string) =>
  text
    .split(" ")
    .map((word) => word.split("").join(" "))
    .join("   ");

function compactTokens(x: number): string {
  if (x >= 1e9) return `${(x / 1e9).toFixed(2)}B`;
  if (x >= 1e6) return `${(x / 1e6).toFixed(1)}M`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(1)}K`;
  return n(x);
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function period(p: Receipt["period"]): string {
  const [sy, ey] = [p.start.slice(0, 4), p.end.slice(0, 4)];
  return sy === ey
    ? `${monthDay(p.start)} – ${monthDay(p.end)}, ${ey}`
    : `${monthDay(p.start)}, ${sy} – ${monthDay(p.end)}, ${ey}`;
}

// The only retention setting we read is Claude Code's, so the note is about Claude Code alone.
function kept(r: Receipt): string {
  const p = r.period;
  if (!r.byAgent.some((a) => a.agent === "claude-code"))
    return `(${p.days} days)`;
  return p.days <= p.retentionDays
    ? `(${p.days} days — all claude code kept)`
    : `(${p.days} days — claude code kept the last ${p.retentionDays})`;
}

const priced = (v: Value) => `≡ ${formatUsd(v)}`;

function table(heading: string, rows: [string, PriceRow][]): Line[] {
  return [
    {
      text: `${heading.padEnd(24)}${"TOKENS".padStart(6)}${"LIST PRICE".padStart(18)}`,
    },
    ...rows.map(([name, row]) => ({
      text: `${`  ${name}${row.estModel ? "*" : ""}`.padEnd(24)}${compactTokens(row.tokens.value).padStart(6)}${(row.notPriced ? "not priced" : priced(row.listPrice)).padStart(18)}`,
    })),
  ];
}

/** The 48-column customer copy (docs/CLI.md §The receipt). */
export function receiptLines(r: Receipt): Line[] {
  const rule = (ch: string): Line => ({
    text: ch.repeat(WIDTH),
    style: "muted",
  });
  const m = r.measured;
  const out: Line[] = [
    rule("="),
    { text: center("T O K E N   D A M A G E") },
    { text: center("customer copy") },
    { text: center(`statement · ${period(r.period)}`) },
    { text: center(kept(r)), style: "muted" },
    rule("="),
    { text: leader("WORDS YOU TYPED", n(m.words.value)) },
    { text: leader("MODEL CALLS", n(m.calls.value)) },
    { text: leader("TOKENS READ BY AGENTS", n(m.tokensRead.value)) },
    {
      text: leader(
        "  re-read from cache",
        `${(m.cacheReadShare.value * 100).toFixed(1)}%`,
      ),
    },
    { text: leader("TOKENS WRITTEN BY AGENTS", n(m.tokensWritten.value)) },
    rule("-"),
    // One agent needs no split: its totals are the lines above.
    ...(r.byAgent.length > 1
      ? [
          ...table(
            "BY AGENT",
            r.byAgent.map((a): [string, PriceRow] => [
              AGENT_NAMES[a.agent].toLowerCase(),
              a,
            ]),
          ),
          rule("-"),
        ]
      : []),
    ...table(
      "BY MODEL",
      r.byModel.map((m): [string, PriceRow] => [m.name, m]),
    ),
    ...(r.byModel.some((m) => m.estModel)
      ? [
          {
            text: "  * est. model: priced as the closest listed one",
            style: "muted" as const,
          },
        ]
      : []),
    rule("-"),
    {
      text: leader("LIST-PRICE VALUE (API-EQUIV.)", priced(r.priced.listPrice)),
    },
  ];
  if (r.priced.plan) {
    out.push(
      { text: leader("YOUR PLAN", `$${r.priced.plan.usd.toFixed(2)}/mo`) },
      {
        text: leader(
          "  value extracted",
          `${r.priced.plan.multiple.value.toFixed(1)}× your plan`,
        ),
      },
    );
  }
  const e = r.estimated;
  const cmp =
    e.comparison.kind === "fridge-months"
      ? leader(
          "  a fridge running for",
          `≈ ${e.comparison.value.low}–${e.comparison.value.high} months`,
        )
      : leader(
          "  phone charges",
          `≈ ${sig2(e.comparison.value.low ?? 0)}–${sig2(e.comparison.value.high ?? 0)}`,
        );
  out.push(
    { text: leader("CACHE SAVED YOU", priced(r.priced.cacheSaved)) },
    {
      text: leader("  without cache, this was", priced(r.priced.withoutCache)),
    },
    rule("-"),
    { text: "SURCHARGE (ESTIMATE, SHOWN AS A RANGE)", style: "ochre" },
    {
      text: leader(
        "  ELECTRICITY",
        `≈ ${formatRange(e.electricityKwh, "kWh")}`,
      ),
      style: "ochre",
    },
    { text: cmp, style: "ochre" },
    rule("-"),
  );
  if (m.latestCall && m.latestCallDay) {
    out.push({
      text: leader(
        "LATEST CALL",
        `${m.latestCall.value}, ${monthDay(m.latestCallDay).toUpperCase()}`,
      ),
    });
  }
  if (m.longestSessionMinutes) {
    const minutes = Math.round(m.longestSessionMinutes.value);
    const h = Math.floor(minutes / 60);
    out.push({
      text: leader(
        "LONGEST SESSION",
        h > 0 ? `${h}h ${minutes % 60}m` : `${minutes}m`,
      ),
    });
  }
  out.push({ text: leader("INTERNS HIRED (SUBAGENTS)", n(m.subagents.value)) });
  const day = r.priced.mostExpensiveDay;
  if (day)
    out.push({
      text: leader(
        "MOST EXPENSIVE DAY",
        `${monthDay(day.day).toUpperCase()} · ${priced(day.listPrice)}`,
      ),
    });

  const stamp = `   ${spaced(r.damageClass.name)}   `;
  out.push(
    rule("-"),
    { text: "DAMAGE CLASS" },
    { text: center(`┏${"━".repeat(stamp.length)}┓`), style: "stamp" },
    { text: center(`┃${stamp}┃`), style: "stamp" },
    { text: center(`┗${"━".repeat(stamp.length)}┛`), style: "stamp" },
  );
  if (r.note) {
    out.push(
      rule("-"),
      { text: "ADJUSTER'S NOTE" },
      ...wrap(r.note.text.toLowerCase(), 42).map((text) => ({
        text: `  ${text}`,
      })),
    );
  }
  out.push(
    rule("-"),
    {
      text: leader("✶ RAM-X", `▲ +$${sig2(r.satire.ramX.value)}/stick`),
      style: "red",
    },
    { text: "✶ satire. economists were not consulted.", style: "red" },
    rule("="),
    {
      text: center("≡ list-price equiv · ≈ estimate · ✶ satire"),
      style: "muted",
    },
    {
      text: center(
        `method ${r.method.version} · prices as of ${r.method.pricesAsOf}`,
      ),
      style: "muted",
    },
  );
  return out;
}

const ANSI: Record<NonNullable<Line["style"]>, [string, string]> = {
  muted: ["\x1b[90m", "\x1b[39m"],
  ochre: ["\x1b[33m", "\x1b[39m"],
  red: ["\x1b[31m", "\x1b[39m"],
  stamp: ["\x1b[1;31m", "\x1b[22;39m"],
};

export function paint(line: Line, color: boolean): string {
  if (!color || !line.style) return line.text;
  const [on, off] = ANSI[line.style];
  return `${on}${line.text}${off}`;
}

export const receiptText = (r: Receipt, color = false) =>
  receiptLines(r)
    .map((l) => paint(l, color))
    .join("\n");
