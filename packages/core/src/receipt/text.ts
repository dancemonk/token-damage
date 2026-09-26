import { formatRange, formatUsd, sig2 } from "../metrics/format.js";
import type { Value } from "../types.js";
import { bar, sparkline } from "./glyphs.js";
import { AGENT_NAMES, type PriceRow, type Receipt } from "./model.js";

export const WIDTH = 48;

/** One printed line and how to colour it: rules muted, estimates ochre, satire and the stamp red. */
export interface Line {
  text: string;
  style?: "muted" | "ochre" | "red" | "stamp" | "bold";
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
export const monthDay = (day: string) =>
  `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
export const n = (x: number) => Math.round(x).toLocaleString("en-US");

const center = (text: string): string =>
  " ".repeat(Math.max(0, Math.floor((WIDTH - text.length) / 2))) + text;
const leader = (label: string, value: string): string =>
  `${label} ${".".repeat(Math.max(1, WIDTH - label.length - value.length - 2))} ${value}`;
const spaced = (text: string) =>
  text
    .split(" ")
    .map((word) => word.split("").join(" "))
    .join("   ");

export function compactTokens(x: number): string {
  if (x >= 1e9) return `${(x / 1e9).toFixed(2)}B`;
  if (x >= 1e6) return `${(x / 1e6).toFixed(1)}M`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(1)}K`;
  return n(x);
}

export function wrap(text: string, width: number): string[] {
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

/** Wrapped with later lines two columns in, so two short paragraphs in a row stay apart. */
const hang = (text: string): string[] =>
  wrap(text, 44).map((line, i) => (i ? `  ${line}` : line));

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

// "$X+": the price leaves out tokens with no list price, so it is at least that.
const priced = (v: Value, partly?: true) =>
  `≡ ${formatUsd(v)}${partly ? "+" : ""}`;

// A row name fits 21 columns (24 less the indent and a space before the tokens); longer names end in "…".
function rowName(name: string, estModel?: true): string {
  const mark = estModel ? "*" : "";
  const room = 21 - mark.length;
  return (name.length > room ? `${name.slice(0, room - 1)}…` : name) + mark;
}

// A split of one row needs no bar: it is the whole.
function table(heading: string, rows: [string, PriceRow][]): Line[] {
  const sum = rows.reduce((s, [, row]) => s + row.tokens.value, 0);
  return [
    {
      text: `${heading.padEnd(24)}${"TOKENS".padStart(6)}${"LIST PRICE".padStart(18)}`,
    },
    ...rows.flatMap(([name, row]): Line[] => {
      const share = sum > 0 ? row.tokens.value / sum : 0;
      return [
        {
          text: `${`  ${rowName(name, row.estModel)}`.padEnd(24)}${compactTokens(row.tokens.value).padStart(6)}${(row.notPriced ? "not priced" : priced(row.listPrice, row.partlyPriced)).padStart(18)}`,
        },
        ...(rows.length > 1
          ? [
              {
                text: `  ${bar(share, 40)}${`${Math.round(share * 100)}%`.padStart(5)}`,
              },
            ]
          : []),
      ];
    }),
  ];
}

/**
 * Daily tokens as one mark per `k` days, grouped from the newest day back so only the oldest mark is partial. `▲`
 * names the tallest mark (the newest on a tie): a token fact, like the chart, never the priced busiest day.
 */
function byDay(r: Receipt): Line[] {
  const daily = r.measured.daily;
  if (daily.length < 2) return [];
  const k = Math.ceil(daily.length / 44);
  const marks: { tokens: number; first: string; last: string }[] = [];
  for (let end = daily.length; end > 0; end -= k) {
    const span = daily.slice(Math.max(0, end - k), end);
    marks.unshift({
      tokens: span.reduce((sum, d) => sum + d.tokens.value, 0),
      first: span[0]!.day,
      last: span.at(-1)!.day,
    });
  }
  const out: Line[] = [
    {
      text: leader("BY DAY", k === 1 ? "1 day = 1 mark" : `${k} days = 1 mark`),
    },
    {
      text: `  ${sparkline(
        marks.map((m) => m.tokens),
        { zero: "·" },
      )}`,
    },
  ];
  const top = marks.reduce(
    (best, m, i) =>
      m.tokens > 0 && m.tokens >= marks[best]!.tokens ? i : best,
    0,
  );
  const tallest = marks[top]!;
  if (tallest.tokens > 0) {
    const col = 2 + top;
    const label =
      tallest.first === tallest.last
        ? monthDay(tallest.first)
        : tallest.first.slice(0, 7) === tallest.last.slice(0, 7)
          ? `${monthDay(tallest.first)}–${Number(tallest.last.slice(8, 10))}`
          : `${monthDay(tallest.first)}–${monthDay(tallest.last)}`;
    out.push({
      text:
        col + 2 + label.length <= WIDTH
          ? `${" ".repeat(col)}▲ ${label}`
          : `${" ".repeat(col - label.length - 1)}${label} ▲`,
    });
  }
  return out;
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
    ...(m.tokensRead.value > 0
      ? [{ text: `  ${bar(m.cacheReadShare.value, 44)}` }]
      : []),
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
    ...(r.priced.partlyPriced
      ? [
          {
            text: "  + at least: models not priced are left out",
            style: "muted" as const,
          },
        ]
      : []),
    rule("-"),
    {
      text: leader(
        "LIST-PRICE VALUE (API-EQUIV.)",
        priced(r.priced.listPrice, r.priced.partlyPriced),
      ),
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

  out.push(...byDay(r));

  const stamp = `   ${spaced(r.damageClass.name)}   `;
  const dc = r.damageClass;
  out.push(
    rule("-"),
    { text: "DAMAGE CLASS" },
    { text: center(`┏${"━".repeat(stamp.length)}┓`), style: "stamp" },
    { text: center(`┃${stamp}┃`), style: "stamp" },
    { text: center(`┗${"━".repeat(stamp.length)}┛`), style: "stamp" },
    {
      text: dc.next
        ? `  ${bar(dc.progress, 24)}  ${Math.floor(dc.progress * 100)}% to ${dc.next.name}`
        : `  ${bar(1, 24)}  top of the scale`,
    },
  );
  if (r.achievements.length > 0) {
    out.push(rule("-"), { text: "ACHIEVEMENTS" });
    for (const a of r.achievements) {
      const name = `  ${a.name}`;
      const why = a.trigger.toLowerCase();
      // A leader when it fits with room for two dots; otherwise the reason goes on its own lines.
      if (WIDTH - name.length - why.length - 2 >= 2)
        out.push({ text: leader(name, why) });
      else
        out.push(
          { text: name },
          ...wrap(why, WIDTH - 4).map((t) => ({ text: `    ${t}` })),
        );
    }
  }
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
    ...(r.poolSatire
      ? hang(`✶ ${r.poolSatire.text.toLowerCase()}`).map((text) => ({
          text,
          style: "red" as const,
        }))
      : []),
    { text: "✶ satire. economists were not consulted.", style: "red" },
    ...(r.jokes.length
      ? [
          rule("-"),
          ...r.jokes.flatMap((j) =>
            hang(j.toLowerCase()).map((text) => ({
              text,
              style: "muted" as const,
            })),
          ),
        ]
      : []),
    ...(r.news
      ? [
          rule("-"),
          ...hang(`meanwhile, ${r.news.text.toLowerCase()}`).map((text) => ({
            text,
            style: "muted" as const,
          })),
        ]
      : []),
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
  bold: ["\x1b[1m", "\x1b[22m"],
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
