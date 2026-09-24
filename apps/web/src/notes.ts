import {
  FAMILIES,
  gatsbys,
  numberWord,
  pct,
  render,
  sig2,
  tokenWords,
  type SharePayload,
} from "@token-damage/core/web";
import { clock12, enUS } from "./format.js";

/** English template of a core note id "family.variant" (the id a share link carries). */
export function englishTemplate(id: string): string | undefined {
  const [family, variant] = id.split(".");
  return FAMILIES.find((f) => f.id === family)?.variants[Number(variant)]?.text;
}

/** Every core note id, for tests and the build's key check. */
export const NOTE_IDS = FAMILIES.flatMap((f) =>
  f.variants.map((_, i) => `${f.id}.${i}`),
);

/** Totals a share link lets us recompute. Commits, durations, weekend share and per-day peaks are not in it. */
function totals(p: SharePayload) {
  const [input, cacheWrite, cacheRead, output] = p.tokens;
  const tokens = input + cacheWrite + cacheRead + output;
  const cacheIn = input + cacheWrite + cacheRead;
  return {
    tokens,
    output,
    perWord: p.words > 0 ? tokens / p.words : null,
    outputShare: tokens > 0 && output > 0 ? output / tokens : null,
    cacheShare: cacheIn > 0 ? cacheRead / cacheIn : null,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const usdEn = (x: number) =>
  `$${x.toLocaleString("en-US", Number.isInteger(x) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Same values as core's `slotsOf`, from what a share link carries. */
export function slotsEn(p: SharePayload): Record<string, string> {
  const t = totals(p);
  const [lo, hi] = p.kwh;
  const range = (a: number, b: number) => `${sig2(a)}–${sig2(b)}`;
  const s: Record<string, string> = {
    tokens: tokenWords(t.tokens),
    words: enUS(p.words),
    sessions: enUS(p.sessions),
    Sessions: cap(numberWord(p.sessions)),
    subagents: enUS(p.subagents),
    listPrice: usdEn(p.list),
    cacheSaving: usdEn(p.saved),
    kwh: `${range(lo, hi)} kWh`,
    fridge: range(lo / 33, hi / 33),
    phone: range((lo * 1000) / 15, (hi * 1000) / 15),
  };
  if (t.perWord !== null) {
    s.ratio = enUS(Math.round(t.perWord));
    s.gatsby = gatsbys(t.perWord / 62_600);
  }
  if (t.outputShare !== null) {
    s.outputShare = pct(t.outputShare);
    s.inputShare = pct(1 - t.outputShare);
    s.readPerOutput = enUS(Math.round((t.tokens - t.output) / t.output));
  }
  if (t.cacheShare !== null) s.cacheShare = pct(t.cacheShare);
  if (p.plan !== undefined) s.multiple = `${p.plan.toFixed(1)}×`;
  if (p.last) s.lastCall = clock12(p.last);
  return s;
}

const RU = "ru-RU";
const ruInt = (n: number) => Math.round(n).toLocaleString(RU);
const ruSig3 = (x: number) =>
  x.toLocaleString(RU, { maximumSignificantDigits: 3 });

/** core's sig2, with a decimal comma. */
function ruSig2(x: number): string {
  if (x === 0 || !Number.isFinite(x)) return String(x);
  const decimals = Math.max(0, 1 - Math.floor(Math.log10(Math.abs(x))));
  return Number(x.toPrecision(2)).toLocaleString(RU, {
    maximumFractionDigits: decimals,
  });
}

/** "1,18 млрд", "187 млн", "15,4 тыс.": always followed by «токенов», which agrees with all three. */
function ruTokens(n: number): string {
  if (n >= 1e9) return `${ruSig3(n / 1e9)} млрд`;
  if (n >= 1e6) return `${ruSig3(n / 1e6)} млн`;
  if (n >= 1e3) return `${ruSig3(n / 1e3)} тыс.`;
  return ruInt(n);
}

function ruPct(share: number): string {
  const p = share * 100;
  return `${p >= 10 ? Math.round(p) : ruSig2(p)}%`;
}

const ruTimes = (n: number) =>
  new Intl.PluralRules(RU).select(n) === "few" ? "раза" : "раз";

/** core's gatsbys, in Russian: 1.29 → "«Великий Гэтсби» и ещё треть сверху". */
export function gatsbysRu(copies: number): string {
  const fractions: [number, string][] = [
    [0, ""],
    [1 / 3, " и ещё треть сверху"],
    [1 / 2, " и ещё половина"],
    [2 / 3, " и ещё две трети"],
    [1, ""],
  ];
  const whole = Math.floor(copies);
  const [frac, tail] = fractions.reduce((best, f) =>
    Math.abs(copies - whole - f[0]) < Math.abs(copies - whole - best[0])
      ? f
      : best,
  );
  const n = whole + (frac === 1 ? 1 : 0);
  const times = n <= 1 ? "" : n === 2 ? " дважды" : ` ${n} ${ruTimes(n)}`;
  return `«Великий Гэтсби»${times}${tail}`;
}

const usdRu = (x: number) =>
  new Intl.NumberFormat(RU, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Number.isInteger(x) ? 0 : 2,
  }).format(x);

/** Russian slot values. Templates put counts after a colon or use «млн/млрд/тыс.» so nouns always agree. */
export function slotsRu(p: SharePayload): Record<string, string> {
  const t = totals(p);
  const [lo, hi] = p.kwh;
  const range = (a: number, b: number) => `${ruSig2(a)}–${ruSig2(b)}`;
  const s: Record<string, string> = {
    tokens: ruTokens(t.tokens),
    words: ruInt(p.words),
    sessions: ruInt(p.sessions),
    Sessions: ruInt(p.sessions),
    subagents: ruInt(p.subagents),
    listPrice: usdRu(p.list),
    cacheSaving: usdRu(p.saved),
    kwh: `${range(lo, hi)} кВт·ч`,
    fridge: range(lo / 33, hi / 33),
    phone: range((lo * 1000) / 15, (hi * 1000) / 15),
  };
  if (t.perWord !== null) {
    s.ratio = ruTokens(t.perWord);
    s.gatsby = gatsbysRu(t.perWord / 62_600);
  }
  if (t.outputShare !== null) {
    s.outputShare = ruPct(t.outputShare);
    s.inputShare = ruPct(1 - t.outputShare);
    s.readPerOutput = ruInt((t.tokens - t.output) / t.output);
  }
  if (t.cacheShare !== null) s.cacheShare = ruPct(t.cacheShare);
  if (p.plan !== undefined)
    s.multiple = `${p.plan.toLocaleString(RU, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`;
  if (p.last) s.lastCall = p.last;
  return s;
}

const SLOTS: Record<string, (p: SharePayload) => Record<string, string>> = {
  ru: slotsRu,
};

/**
 * The adjuster's note for a share link, in the page language when that language has written one,
 * else in English. Undefined when the link has no note or the note needs a fact the link lacks.
 */
export function shareNote(
  p: SharePayload,
  lang: string,
  notes: Record<string, string>,
): { text: string; lang: string } | undefined {
  if (!p.note) return undefined;
  const own = notes[p.note];
  const slots = SLOTS[lang];
  if (own && slots) {
    const text = render(own, slots(p));
    if (text) return { text, lang };
  }
  const english = englishTemplate(p.note);
  const text = english && render(english, slotsEn(p));
  return text ? { text, lang: "en" } : undefined;
}
