import fixed from "./fixed.json" with { type: "json" };
import { enUS } from "./format.js";

/** One receipt, already formatted. Labels come from fixed.json and are never translated. */
export interface ReceiptView {
  trans: string;
  /** Header clock, e.g. "09/24/26 · 11:58 PM". */
  date: string;
  words: number;
  tokens: number;
  days: number;
  price: string;
  saved: string;
  kwh: string;
  ram: string;
  /** Extra priced/measured rows, e.g. plan multiple, latest call. */
  rows?: { label: string; value: string }[];
  /** Adjuster's note; `\n` breaks lines. `lang` marks an English fallback on a translated page. */
  note?: { text: string; lang: string };
  stamps: string[];
  achievements?: string[];
  /** Left part of the fine print: "SAMPLE · CUSTOMER 0041" or "SHARED RECEIPT". */
  who: string;
}

const R = fixed.receipt;

export const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

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
export function receiptPaper(
  v: ReceiptView,
  { count = enUS(v.tokens), slam = false } = {},
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
<div class="r-meta">${esc(R.store)}<br><span class="r-date">${esc(v.date)}</span> · ${esc(R.trans)}${esc(v.trans)}</div>
</div>
${rule}
<div class="r-hero">
<div class="r-typed">${esc(R.typed)} <b>${enUS(v.words)} ${esc(R.words)}</b></div>
<div class="r-n" data-count="${v.tokens}">${esc(count)}</div>
<div class="r-sub">${esc(R.tokensRead)} · ${v.days} ${esc(R.days)}</div>
</div>
${rule}
<div class="r-lines">
${line(R.price, v.price)}
${line(R.saved, v.saved)}
${(v.rows ?? []).map((r) => line(r.label, r.value)).join("\n")}
${line(R.electricity, v.kwh, "estimate")}
${line(R.ram, v.ram, "satire")}
</div>
${rule}
<div class="r-verdict">${note}<div class="stamps">${stamps}</div></div>
${v.achievements?.length ? `<div class="r-ach">${esc(R.achievements)} · ${v.achievements.map(esc).join(" · ")}</div>` : ""}
${rule}
<div class="r-foot">
<div class="legend">${esc(R.legendPriced)} · <span class="estimate">${esc(R.legendEstimate)}</span> · <span class="satire">${esc(R.legendSatire)}</span></div>
<div class="who">${esc(v.who)} · ${esc(R.notYours)}</div>
${barcode()}
</div>
</div>
<div class="perf" aria-hidden="true"><span>${esc(R.tear)}</span></div>
</div>`;
}

/** The tear-off stub with the command and the Copy button. */
export function stub(copy: string, copyLabel: string): string {
  return `<div class="stub">
<div class="stub-body">
<div class="stub-label">${esc(R.yourCopy)}</div>
<div class="stub-cmd"><span class="dollar" aria-hidden="true">$</span><code>${esc(fixed.command)}</code><button type="button" class="cp" data-copy aria-label="${esc(copyLabel)}"><svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="5" y="5" width="9" height="9" rx="1.5"></rect><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"></path></svg><span>${esc(copy)}</span></button></div>
</div>
<div class="stub-edge" aria-hidden="true"></div>
</div>`;
}

/** A sample customer as a receipt view; `note` is resolved by the caller for the page language. */
export function sampleView(
  index: number,
  date: string,
  note: ReceiptView["note"],
): ReceiptView {
  const c = fixed.samples[index % fixed.samples.length]!;
  return {
    trans: c.trans,
    date,
    words: c.words,
    tokens: c.tokens,
    days: 30,
    price: c.price,
    saved: c.saved,
    kwh: c.kwh,
    ram: c.ram,
    note,
    stamps: [c.stamp],
    who: `${R.sample} · ${c.who}`,
  };
}
