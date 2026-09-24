import {
  ACHIEVEMENT_NAMES,
  SHARE_BASE,
  damageClass,
  decodeShare,
  formatRange,
  formatSatireUsd,
  formatUsd,
  ramX,
  type SharePayload,
} from "@token-damage/core/web";
import fixed from "./fixed.json" with { type: "json" };
import { clock12, periodDays } from "./format.js";
import { shareNote } from "./notes.js";
import type { ReceiptView } from "./receipt.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^\d{2}:\d{2}$/;
const VERDICTS = new Set(["DENIED", "APPROVED", "SIGNED"]);
const count = (x: unknown) =>
  typeof x === "number" && Number.isFinite(x) && x >= 0;

/** decodeShare checks the keys; this checks the shapes, so a hand-edited link can't break the page. */
function valid(p: SharePayload): boolean {
  return (
    ISO.test(p.start) &&
    ISO.test(p.end) &&
    Array.isArray(p.tokens) &&
    p.tokens.length === 4 &&
    p.tokens.every(count) &&
    [p.calls, p.sessions, p.days, p.subagents, p.words, p.list, p.saved].every(
      count,
    ) &&
    Array.isArray(p.kwh) &&
    p.kwh.length === 2 &&
    p.kwh.every(count) &&
    (p.plan === undefined || count(p.plan)) &&
    Array.isArray(p.ach) &&
    (p.dispute === undefined ||
      (Array.isArray(p.dispute) && p.dispute.length === 2)) &&
    (p.note === undefined || typeof p.note === "string") &&
    (p.last === undefined || HHMM.test(p.last))
  );
}

/** The payload of a `/r#v1.…` fragment, or null when it is missing, malformed or not v1. */
export function readShare(hash: string): SharePayload | null {
  if (!hash.startsWith("#v1.")) return null;
  const p = decodeShare(SHARE_BASE + hash.slice("#v1.".length));
  return p && valid(p) ? p : null;
}

export const totalTokens = (p: SharePayload) =>
  p.tokens.reduce((a, b) => a + b, 0);

/** "09/24/26 · 03:40 AM", the receipt header, from the period end and the rounded latest call. */
function headerDate(end: string, last?: string): string {
  const [y, m, d] = end.split("-");
  const day = `${m}/${d}/${y!.slice(2)}`;
  if (!last) return day;
  const [time = "", ampm = ""] = clock12(last).split(" ");
  return `${day} · ${time.padStart(5, "0")} ${ampm}`;
}

/**
 * A friend's receipt. Nothing the link carries is printed as text: class and RAM-X are recomputed
 * from the tokens, achievements and verdicts are looked up, the note is a template id.
 */
export function shareView(
  p: SharePayload,
  lang: string,
  notes: Record<string, string>,
): ReceiptView {
  const R = fixed.receipt;
  const total = totalTokens(p);
  const priced = (value: number) => formatUsd({ value, tier: "priced" });
  const verdict = p.dispute?.[1];
  const rows: { label: string; value: string }[] = [];
  if (p.plan !== undefined)
    rows.push({ label: R.plan, value: `${p.plan.toFixed(1)}×` });
  if (p.last) rows.push({ label: R.latestCall, value: clock12(p.last) });
  return {
    trans: String(total % 10_000).padStart(4, "0"),
    date: headerDate(p.end, p.last),
    words: p.words,
    tokens: total,
    days: periodDays(p.start, p.end),
    price: priced(p.list),
    saved: priced(p.saved),
    rows,
    kwh: formatRange(
      {
        value: (p.kwh[0] + p.kwh[1]) / 2,
        low: p.kwh[0],
        high: p.kwh[1],
        tier: "estimated",
      },
      "kWh",
    ),
    ram: formatSatireUsd(ramX(total)),
    note: shareNote(p, lang, notes),
    stamps: [
      damageClass(total).name,
      ...(verdict && VERDICTS.has(verdict) ? [verdict] : []),
    ],
    achievements: p.ach.flatMap((id) => {
      const name = (ACHIEVEMENT_NAMES as Record<string, string>)[id];
      return name ? [name] : [];
    }),
    who: R.shared,
  };
}
