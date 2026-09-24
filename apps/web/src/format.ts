/** Everything on a page, receipts included, follows the page locale ("1,183,400,000" / "1 183 400 000"). */

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

/** Days from start to end, both included. */
export function periodDays(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

/** Receipt figures in the page's locale. */
export interface ReceiptFormat {
  int(n: number): string;
  usd(x: number): string;
  /** Satire money: "+$0.0000079" / "+0,0000079 $". */
  satire(x: number): string;
  /** "26–120 kWh" / "26–120 кВт·ч": two significant figures, like core's sig2. */
  range(lo: number, hi: number, unit: string): string;
  /** A made-up share for a ✶ pool line: "0.0000083" / "0,0000083". */
  share(x: number): string;
  multiple(x: number): string;
  /** Header clock: "09/24/26 · 04:30 PM" / "24.09.26 · 16:30". */
  clock(d: Date, timeZone?: string): string;
  /** A share link's "03:40" as a row value: "3:40 AM" / "03:40". */
  time(hhmm: string): string;
}

export function receiptFormat(locale: string): ReceiptFormat {
  const nf = (o: Intl.NumberFormatOptions = {}) =>
    new Intl.NumberFormat(locale, o);
  const sig2 = (x: number) => {
    if (x === 0 || !Number.isFinite(x)) return String(x);
    const decimals = Math.max(0, 1 - Math.floor(Math.log10(Math.abs(x))));
    return nf({ maximumFractionDigits: decimals }).format(
      Number(x.toPrecision(2)),
    );
  };
  const hour12 = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
  }).resolvedOptions().hour12;
  return {
    int: (n) => nf().format(n),
    usd: (x) =>
      nf({
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(x),
    satire: (x) =>
      `+${nf({ style: "currency", currency: "USD", maximumSignificantDigits: 2 }).format(x)}`,
    range: (lo, hi, unit) => `${sig2(lo)}–${sig2(hi)} ${unit}`,
    share: (x) => nf({ maximumSignificantDigits: 2 }).format(x),
    multiple: (x) =>
      `${nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(x)}×`,
    clock: (d, timeZone) =>
      `${new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "2-digit", timeZone }).format(d)} · ${new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone }).format(d)}`,
    time: (hhmm) => {
      const d = new Date(`2000-01-01T${hhmm}:00Z`);
      return new Intl.DateTimeFormat(locale, {
        hour: hour12 ? "numeric" : "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      }).format(d);
    },
  };
}
