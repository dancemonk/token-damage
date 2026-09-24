/**
 * Numbers in page text follow the page locale. Numbers on receipt paper never do: they use
 * `enUS` so a receipt looks the same in every language, like the CLI and the PNG.
 */
export const enUS = (n: number) => n.toLocaleString("en-US");

/** "1.18B" / "1,18 млрд". */
export const compact = (n: number, locale: string) =>
  new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumSignificantDigits: 3,
  }).format(n);

export const number = (
  n: number,
  locale: string,
  options: Intl.NumberFormatOptions = {},
) => new Intl.NumberFormat(locale, options).format(n);

/** "September 2026" / "сентябрь 2026 г." */
export const monthYear = (isoDate: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));

/** Receipt header clock, always US style: "09/24/26 · 11:58 PM". */
export function receiptClock(d: Date): string {
  const p2 = (x: number) => String(x).padStart(2, "0");
  const h12 = d.getHours() % 12 || 12;
  return `${p2(d.getMonth() + 1)}/${p2(d.getDate())}/${String(d.getFullYear()).slice(2)} · ${p2(h12)}:${p2(d.getMinutes())} ${d.getHours() < 12 ? "AM" : "PM"}`;
}

/** "03:40" (24-hour, as in share links) → "3:40 AM", the CLI's label. */
export function clock12(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Days from start to end, both included. */
export function periodDays(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}
