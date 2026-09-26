import fixed from "./fixed.json" with { type: "json" };
import { receiptFormat } from "./format.js";
import type { PoolEntry, T } from "./i18n.js";

/** One receipt, already formatted for the page's language. Labels come from i18n (`receipt.*`). */
export interface ReceiptView {
  /** "TRANS #0041" / "ЧЕК № 0041" comes from `receipt.trans` + this. */
  trans: string;
  /** Header clock, e.g. "09/24/26 · 11:58 PM" / "24.09.26 · 23:58". */
  date: string;
  words: number;
  wordsText: string;
  tokens: number;
  tokensText: string;
  days: number;
  /** Agents that did the work, e.g. "CLAUDE CODE + CODEX"; shared receipts only. */
  agents?: string;
  price: string;
  saved: string;
  /** Fine print under the price rows when models with no list price are left out of the total. */
  partly?: string;
  kwh: string;
  ram: string;
  /** A ✶ pool line with the share filled in, printed red under RAM-X (docs/ROASTS.md §Pool). */
  satire?: string;
  /** A receipt joke from the pool, printed small above the legend. */
  joke?: string;
  /** Extra rows, e.g. plan multiple, latest call; labels already in the page language. */
  rows?: { label: string; value: string }[];
  /** Adjuster's note or aside; `\n` breaks lines. */
  note?: { text: string; lang: string };
  stamps: string[];
  /** How far the total is into its damage class, 0–1, and the line under the stamp: "4% to UNINSURABLE". */
  progress?: { share: number; text: string };
  achievements?: string[];
  /** Left part of the fine print: "SAMPLE · CUSTOMER 0041" or "SHARED RECEIPT". */
  who: string;
  /** Who rang it up. The build's first bill leaves it out and gets the first cashier; later bills pick at random. */
  cashier?: string;
}

export const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** A class name as its i18n key: "ACT OF GOD" → "act-of-god". */
export const classSlug = (name: string) =>
  name.toLowerCase().replace(/ /g, "-");

/**
 * The class-progress line in the page language, rounded down like every bar. `next` is the next class's slug, null
 * at the top of the scale. Takes core's numbers rather than importing core: build.mjs runs this file from dist/.
 */
export function progressView(
  share: number,
  next: string | null,
  t: T,
): ReceiptView["progress"] {
  return {
    share,
    text: next
      ? t("receipt.toNext", {
          pct: Math.floor(share * 100),
          // Non-breaking, so a narrow receipt wraps before the class name, never inside it.
          name: t(`class.${next}`).replace(/ /g, "\u00a0"),
        })
      : t("receipt.topOfScale"),
  };
}

/** The cashiers on duty, in the page language (`receipt.cashiers`, separated by "|"). */
export const cashiers = (t: T): string[] => t("receipt.cashiers").split("|");

/** A cashier for a new bill, each equally likely. */
export function pickCashier(t: T, random: () => number = Math.random): string {
  const all = cashiers(t);
  return all[Math.min(all.length - 1, Math.floor(random() * all.length))]!;
}

/** "STORE 0001 · REG 01 · CASHIER: ARTYOM", the name in its own span so the page can swap it on the first bill. */
function storeLine(t: T, cashier = cashiers(t)[0]!): string {
  const [before = "", after = ""] = t("receipt.store").split("{cashier}");
  return `${esc(before)}<span class="r-cashier">${esc(cashier)}</span>${esc(after)}`;
}

const MARK_PATH =
  "M7 27V11L9 9L11 11L13 9L14 10Q15 4 16 2Q17 6 19 6Q20 5 21 4Q22 8 24 9L25 11V27L24 29L23 27L22 29L21 27L20 29L19 27L18 29L17 27L16 29L15 27L14 29L13 27L12 29L11 27L10 29L9 27L8 29ZM10 15H22V16.5H10ZM10 19H22V20.5H10ZM10 23H17V24.5H10Z";

// Bar width and gap in px, from design/canvas/WebHome.dc.html.
const BARCODE =
  "34 33 44 22 43 42 13 22 14 14 33 44 24 14 12 12 24 13 23 42 42 23 14 13 23 42 23 24 22 14 13 13 32 14 12 22";

const barcode = () =>
  `<div class="barcode" aria-hidden="true">${BARCODE.split(" ")
    .map((p) => `<span style="width:${p[0]}px;margin-right:${p[1]}px"></span>`)
    .join("")}</div>`;

const line = (label: string, value: string, tone = "") =>
  `<div class="line${tone ? ` ${tone}` : ""}"><span>${esc(label)}</span><span class="lead"></span><b>${esc(value)}</b></div>`;

const rule = `<div class="rule"></div>`;

/**
 * The paper down to the perforation. `count` is what the hero number shows (the count-up starts
 * it at 0); `slam` animates the first stamp in.
 */
/** Ink on the dotted leader, as in the terminal: plain ink, never red, because it is a measured fact. */
function progressLine(p: NonNullable<ReceiptView["progress"]>): string {
  const fill =
    p.share > 0
      ? `<span class="r-fill" style="width:${Math.floor(p.share * 100)}%"></span>`
      : "";
  return `<div class="r-progress"><span class="r-track" aria-hidden="true">${fill}</span><span class="r-to">${esc(p.text)}</span></div>`;
}

export function receiptPaper(
  v: ReceiptView,
  t: T,
  { count = v.tokensText, slam = false } = {},
): string {
  const stamps = v.stamps
    .map(
      (s, i) =>
        `<div class="stamp${i === 0 && slam ? " slam" : ""}${i > 0 ? " stamp-2" : ""}">${esc(s)}</div>`,
    )
    .join("");
  const note = v.note
    ? `<div class="note" lang="${esc(v.note.lang)}">${v.note.text.split("\n").map(esc).join("<br>")}</div>`
    : `<div class="note"></div>`;
  return `<div class="teeth" aria-hidden="true"></div>
<div class="paper">
<div class="paper-grain" aria-hidden="true"></div>
<div class="paper-body">
<div class="r-head">
<div class="r-brand"><svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><path d="${MARK_PATH}" fill="currentColor" fill-rule="evenodd"></path></svg><span>${esc(fixed.brand)}</span></div>
<div class="r-meta">${storeLine(t, v.cashier)}<br><span class="r-date">${esc(v.date)}</span> · ${esc(t("receipt.trans"))}${esc(v.trans)}</div>
</div>
${rule}
<div class="r-hero">
<div class="r-typed">${esc(t("receipt.typed"))} <b>${esc(v.wordsText)} ${esc(t("receipt.words", {}, v.words))}</b></div>
<div class="r-n" data-count="${v.tokens}">${esc(count)}</div>
<div class="r-sub">${esc(t("receipt.tokensRead"))} · ${v.days} ${esc(t("receipt.days", {}, v.days))}${v.agents === undefined ? "" : ` · ${esc(v.agents)}`}</div>
</div>
${rule}
<div class="r-lines">
${line(t("receipt.price"), v.price)}
${line(t("receipt.saved"), v.saved)}
${v.partly === undefined ? "" : `<p class="r-partly">${esc(v.partly)}</p>`}
${(v.rows ?? []).map((r) => line(r.label, r.value)).join("\n")}
${line(t("receipt.electricity"), v.kwh, "estimate")}
${line(t("receipt.ram"), v.ram, "satire")}
${v.satire === undefined ? "" : `<p class="pool-satire">✶ ${esc(v.satire)}</p>`}
</div>
${rule}
<div class="r-verdict">${note}<div class="stamps">${stamps}</div></div>
${v.progress ? progressLine(v.progress) : ""}
${v.achievements?.length ? `<div class="r-ach">${esc(t("receipt.achievements"))} · ${v.achievements.map(esc).join(" · ")}</div>` : ""}
${rule}
<div class="r-foot">
${v.joke === undefined ? "" : `<p class="pool-joke">${esc(v.joke)}</p>`}
<div class="legend">${esc(t("receipt.legendPriced"))} · <span class="estimate">${esc(t("receipt.legendEstimate"))}</span> · <span class="satire">${esc(t("receipt.legendSatire"))}</span></div>
<div class="who">${esc(v.who)} · ${esc(t("receipt.notYours"))}</div>
${barcode()}
</div>
</div>
<div class="perf" aria-hidden="true"><span>${esc(t("receipt.tear"))}</span></div>
</div>`;
}

/** The tear-off stub with the command and the Copy button. */
export function stub(t: T): string {
  return `<div class="stub">
<div class="stub-body">
<div class="stub-label">${esc(t("receipt.yourCopy"))}</div>
<div class="stub-cmd"><span class="dollar" aria-hidden="true">$</span><code>${esc(fixed.command)}</code><button type="button" class="cp" data-copy aria-label="${esc(t("home.stub.copy.label"))}"><svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="5" y="5" width="9" height="9" rx="1.5"></rect><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"></path></svg><span>${esc(t("home.stub.copy"))}</span></button></div>
</div>
<div class="stub-edge" aria-hidden="true"></div>
</div>`;
}

/** A sample customer as a receipt view in the page language; `note` is resolved by the caller. */
export function sampleView(
  index: number,
  t: T,
  locale: string,
  date: Date,
  note: ReceiptView["note"],
): ReceiptView {
  const c = fixed.samples[index % fixed.samples.length]!;
  const f = receiptFormat(locale);
  return {
    trans: c.trans,
    date: f.clock(date),
    words: c.words,
    wordsText: f.int(c.words),
    tokens: c.tokens,
    tokensText: f.int(c.tokens),
    days: 30,
    price: f.usd(c.price),
    saved: f.usd(c.saved),
    kwh: f.range(c.kwh[0]!, c.kwh[1]!, t("receipt.kwh")),
    ram: f.satire(c.ram),
    note,
    stamps: [t(`class.${c.class}`)],
    progress: progressView(c.progress, c.next, t),
    who: `${t("receipt.sample")} · ${t(`receipt.who.${c.trans}`)}`,
  };
}

/** A pool satire line with the reader's share in the page's number format. */
export const fillShare = (text: string, share: string) =>
  text.replace("{share}", share);

/** The inside of a news line: kicker, the dated fact in plain ink, and its source. */
export function newsLine(line: PoolEntry, t: T): string {
  const source = line.source
    ? ` <a href="${esc(line.source.url)}" rel="noopener">${esc(t("pool.source"))}</a>`
    : "";
  return `<span class="news-k">${esc(t("pool.meanwhile"))}</span> ${esc(line.text)}${source}`;
}
