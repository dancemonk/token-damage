import { formatRange, formatUsd } from "../metrics/format.js";
import type { Excuse, Verdict } from "../roasts/dispute.js";
import { AGENT_NAMES, type Receipt } from "./model.js";

export const SHARE_BASE = "https://tokendamage.com/r#v1.";

/**
 * Everything a share link may carry. Aggregates only: no text, no paths, no project
 * names, no time zone. A key outside this list is a bug; `decodeShare` rejects it.
 */
export const SHARE_WHITELIST = [
  "start",
  "end",
  "tokens",
  "calls",
  "sessions",
  "days",
  "subagents",
  "words",
  "list",
  "saved",
  "plan",
  "kwh",
  "class",
  "ach",
  "dispute",
  "note",
  "last",
] as const;

export interface SharePayload {
  start: string;
  end: string;
  /** [fresh input, cache write, cache read, output] */
  tokens: [number, number, number, number];
  calls: number;
  sessions: number;
  days: number;
  subagents: number;
  words: number;
  /** List price and cache saving, USD. */
  list: number;
  saved: number;
  /** Plan multiple, when the user gave a plan. */
  plan?: number;
  kwh: [number, number];
  class: string;
  ach: string[];
  /** [excuse id, verdict] */
  dispute?: [string, string];
  /** Adjuster's note as family.variant; the site re-renders the text from the numbers. */
  note?: string;
  /** Latest call, 24-hour clock rounded to 5 minutes. */
  last?: string;
}

export const EXCUSE_IDS: Record<Excuse, string> = {
  "It was research": "research",
  "The agent did it by itself": "agent",
  "It was one last fix": "last-fix",
  "I was learning": "learning",
  "Everyone does it": "everyone",
  "I accept the damage": "accept",
};

const cents = (x: number) => Math.round(x * 100) / 100;
const two = (x: number) => Number(x.toPrecision(2));

function roundedClock(label: string): string | undefined {
  const m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(label);
  if (!m) return undefined;
  const minutes =
    ((Number(m[1]) % 12) + (m[3] === "PM" ? 12 : 0)) * 60 + Number(m[2]);
  const rounded = (Math.round(minutes / 5) * 5) % 1440;
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}

export function sharePayload(
  r: Receipt,
  dispute?: { excuse: Excuse; verdict: Verdict },
): SharePayload {
  const t = r.measured.byType;
  const kwh = r.estimated.electricityKwh;
  const last =
    r.measured.latestCall && roundedClock(r.measured.latestCall.value);
  return {
    start: r.period.start,
    end: r.period.end,
    tokens: [
      t.input.value,
      t.cacheWrite.value,
      t.cacheRead.value,
      t.output.value,
    ],
    calls: r.measured.calls.value,
    sessions: r.measured.sessions.value,
    days: r.measured.activeDays.value,
    subagents: r.measured.subagents.value,
    words: r.measured.words.value,
    list: cents(r.priced.listPrice.value),
    saved: cents(r.priced.cacheSaved.value),
    ...(r.priced.plan && {
      plan: Math.round(r.priced.plan.multiple.value * 10) / 10,
    }),
    kwh: [two(kwh.low ?? kwh.value), two(kwh.high ?? kwh.value)],
    class: r.damageClass.name,
    ach: r.achievements.map((a) => a.id),
    ...(dispute && {
      dispute: [EXCUSE_IDS[dispute.excuse], dispute.verdict.status] as [
        string,
        string,
      ],
    }),
    ...(r.note && { note: `${r.note.family}.${r.note.variant}` }),
    ...(last && { last }),
  };
}

const toBase64Url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromBase64Url = (s: string) =>
  new TextDecoder().decode(
    Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
      c.charCodeAt(0),
    ),
  );

/** The data lives in the fragment, which browsers never send to the server. */
export const shareUrl = (payload: SharePayload) =>
  SHARE_BASE + toBase64Url(JSON.stringify(payload));

/** Payload from a share URL; null when it is malformed or carries any key outside the whitelist. */
export function decodeShare(url: string): SharePayload | null {
  if (!url.startsWith(SHARE_BASE)) return null;
  try {
    const payload = JSON.parse(
      fromBase64Url(url.slice(SHARE_BASE.length)),
    ) as Record<string, unknown>;
    const allowed = new Set<string>(SHARE_WHITELIST);
    return Object.keys(payload).every((k) => allowed.has(k))
      ? (payload as unknown as SharePayload)
      : null;
  } catch {
    return null;
  }
}

/** Privacy preview for a share link: every field, as it will be sent. */
export function sharePreview(p: SharePayload): string[] {
  const rows: [string, string][] = [
    ["period", `${p.start} – ${p.end}`],
    [
      "tokens (input, cache write, cache read, output)",
      p.tokens.map((x) => x.toLocaleString("en-US")).join(", "),
    ],
    [
      "model calls · sessions · active days",
      `${p.calls} · ${p.sessions} · ${p.days}`,
    ],
    ["subagents · words typed", `${p.subagents} · ${p.words}`],
    ["list price · cache saved", `$${p.list} · $${p.saved}`],
    ...(p.plan !== undefined
      ? ([["plan multiple", `${p.plan}×`]] as [string, string][])
      : []),
    ["electricity (kWh)", `${p.kwh[0]}–${p.kwh[1]}`],
    ["damage class", p.class],
    ["achievements", p.ach.join(", ") || "none"],
    ...(p.dispute
      ? ([["dispute", p.dispute.join(" · ")]] as [string, string][])
      : []),
    ...(p.note
      ? ([["adjuster's note (id only)", p.note]] as [string, string][])
      : []),
    ...(p.last
      ? ([["latest call (rounded)", p.last]] as [string, string][])
      : []),
  ];
  return rows.map(([k, v]) => `  ${k}: ${v}`);
}

/** Privacy preview for the image: what the card prints, nothing else. */
export function imagePreview(r: Receipt): string[] {
  const m = r.measured;
  return [
    `  statement ${r.period.start} – ${r.period.end} (${r.byAgent.map((a) => AGENT_NAMES[a.agent]).join(" + ")}), ${m.tokensRead.value + m.tokensWritten.value} tokens, ${m.words.value} words typed`,
    "  who did the reading: cache reads, fresh context, output, your typing (shares)",
    `  list price ${formatUsd(r.priced.listPrice)}, cache saved ${formatUsd(r.priced.cacheSaved)}${r.priced.plan ? `, plan $${r.priced.plan.usd}` : ""}`,
    `  electricity ${formatRange(r.estimated.electricityKwh, "kWh")}, latest call ${m.latestCall?.value ?? "—"}, ${m.subagents.value} subagents`,
    `  damage class ${r.damageClass.name}${r.note ? `, adjuster's note: "${r.note.text}"` : ""}`,
    "  world check (public facts), RAM-X satire, method and price date",
  ];
}
