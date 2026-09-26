import {
  ACHIEVEMENT_NAMES,
  AGENT_NAMES,
  classProgress,
  damageClass,
  decodeShare,
  ramX,
  SHARE_BASE,
  type SharePayload,
  type Source,
} from "@token-damage/core/web";
import { periodDays, receiptFormat } from "./format.js";
import type { T } from "./i18n.js";
import { shareNote } from "./notes.js";
import { classSlug, progressView, type ReceiptView } from "./receipt.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^(\d{2}):(\d{2})$/;
const VERDICTS = new Set(["DENIED", "APPROVED", "SIGNED"]);
/** A quadrillion: more than any one person's tokens, dollars or kWh, and far from overflowing a sum. */
const MAX = 1e15;
const count = (x: unknown) =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= MAX;
/** A real calendar day ("2026-02-30" and "2026-99-99" are not). */
const day = (s: unknown): s is string => {
  if (typeof s !== "string" || !ISO.test(s)) return false;
  const ms = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().startsWith(s);
};
const clock = (s: unknown) => {
  const m = typeof s === "string" ? HHMM.exec(s) : null;
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
};
const strings = (x: unknown) =>
  Array.isArray(x) && x.every((v) => typeof v === "string");

/** decodeShare checks the keys; this checks the shapes, so a hand-edited link can't break the page. */
function valid(p: SharePayload): boolean {
  return (
    day(p.start) &&
    day(p.end) &&
    // The start comes first, and no period runs past ten years.
    p.start <= p.end &&
    periodDays(p.start, p.end) <= 3660 &&
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
    strings(p.ach) &&
    (p.dispute === undefined ||
      (strings(p.dispute) && p.dispute.length === 2)) &&
    (p.note === undefined || typeof p.note === "string") &&
    (p.last === undefined || clock(p.last)) &&
    // Loose on purpose: a newer CLI may know more agents than this site, and unknown ids are dropped at render.
    (p.agents === undefined ||
      (strings(p.agents) &&
        p.agents.length >= 1 &&
        p.agents.length <= 16 &&
        new Set(p.agents).size === p.agents.length)) &&
    (p.partly === undefined || p.partly === true)
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
  const reached = classProgress(total);
  // Names come from core's table; an id the site does not know (a newer agent, or anything crafted) is left out.
  const agents = (p.agents ?? []).flatMap((id) =>
    Object.hasOwn(AGENT_NAMES, id)
      ? [AGENT_NAMES[id as Source].toUpperCase()]
      : [],
  );
  return {
    trans: String(total % 10_000).padStart(4, "0"),
    date: f.clock(when, "UTC"),
    words: p.words,
    wordsText: f.int(p.words),
    tokens: total,
    tokensText: f.int(total),
    days: periodDays(p.start, p.end),
    price: f.usd(p.list) + (p.partly ? "+" : ""),
    saved: f.usd(p.saved),
    rows,
    kwh: f.range(p.kwh[0], p.kwh[1], t("receipt.kwh")),
    ram: f.satire(ramX(total).value),
    note: shareNote(p, lang, notes),
    stamps: [
      t(`class.${classSlug(damageClass(total).name)}`),
      ...(verdict && VERDICTS.has(verdict)
        ? [t(`verdict.${verdict.toLowerCase()}`)]
        : []),
    ],
    ...(agents.length > 0 && { agents: agents.join(" + ") }),
    ...(p.partly && { partly: t("receipt.partly") }),
    progress: progressView(
      reached.progress,
      reached.next && classSlug(reached.next.name),
      t,
    ),
    achievements: p.ach.flatMap((id) =>
      // Own keys only: "constructor" is `in` every object.
      Object.hasOwn(ACHIEVEMENT_NAMES, id) ? [t(`ach.${id}`)] : [],
    ),
    who: t("receipt.shared"),
  };
}
