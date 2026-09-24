import {
  ACHIEVEMENT_NAMES,
  SHARE_BASE,
  damageClass,
  decodeShare,
  ramX,
  type SharePayload,
} from "@token-damage/core/web";
import { periodDays, receiptFormat } from "./format.js";
import type { T } from "./i18n.js";
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

/**
 * A friend's receipt. Nothing the link carries is printed as text: class and RAM-X are recomputed
 * from the tokens, achievements and verdicts are looked up, the note is a template id.
 */
export function shareView(
  p: SharePayload,
  lang: string,
  notes: Record<string, string>,
  t: T,
  locale: string,
): ReceiptView {
  const f = receiptFormat(locale);
  const total = totalTokens(p);
  const verdict = p.dispute?.[1];
  const rows: { label: string; value: string }[] = [];
  if (p.plan !== undefined)
    rows.push({ label: t("receipt.plan"), value: f.multiple(p.plan) });
  if (p.last)
    rows.push({ label: t("receipt.latestCall"), value: f.time(p.last) });
  // The period's last day at the latest call, read as wall time (the link carries no time zone).
  const when = new Date(`${p.end}T${p.last ?? "00:00"}:00Z`);
  const slug = (name: string) => name.toLowerCase().replace(/ /g, "-");
  return {
    trans: String(total % 10_000).padStart(4, "0"),
    date: f.clock(when, "UTC"),
    words: p.words,
    wordsText: f.int(p.words),
    tokens: total,
    tokensText: f.int(total),
    days: periodDays(p.start, p.end),
    price: f.usd(p.list),
    saved: f.usd(p.saved),
    rows,
    kwh: f.range(p.kwh[0], p.kwh[1], t("receipt.kwh")),
    ram: f.satire(ramX(total).value),
    note: shareNote(p, lang, notes),
    stamps: [
      t(`class.${slug(damageClass(total).name)}`),
      ...(verdict && VERDICTS.has(verdict)
        ? [t(`verdict.${verdict.toLowerCase()}`)]
        : []),
    ],
    achievements: p.ach.flatMap((id) =>
      id in ACHIEVEMENT_NAMES ? [t(`ach.${id}`)] : [],
    ),
    who: t("receipt.shared"),
  };
}
