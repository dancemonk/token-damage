export const DAY_MS = 86_400_000;

const machineZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

interface Parts {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

function partsOf(ts: number, timeZone: string): Parts {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const get = (type: string) =>
    Number(f.formatToParts(ts).find((p) => p.type === type)?.value);
  return {
    y: get("year"),
    m: get("month"),
    d: get("day"),
    h: get("hour"),
    mi: get("minute"),
    s: get("second"),
  };
}

/** Milliseconds the zone is ahead of UTC at `ts`. */
function offsetAt(ts: number, timeZone: string): number {
  const p = partsOf(ts, timeZone);
  return (
    Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ts / 1000) * 1000
  );
}

/** The local calendar day of `ts`, YYYY-MM-DD. */
export function localDay(ts: number, timeZone = machineZone()): string {
  const p = partsOf(ts, timeZone);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Epoch ms when the local day containing `ts` began. Correct across DST switches. */
export function midnightOf(ts: number, timeZone = machineZone()): number {
  const day = localDay(ts, timeZone);
  const p = partsOf(ts, timeZone);
  let guess = Date.UTC(p.y, p.m - 1, p.d) - offsetAt(ts, timeZone);
  // The offset at midnight can differ from the offset at `ts` (DST switched during the day): correct once.
  guess -= offsetAt(guess, timeZone) - offsetAt(ts, timeZone);
  // Walk to the exact boundary in case the correction overshot by an hour.
  while (localDay(guess, timeZone) !== day) guess += 3_600_000;
  while (localDay(guess - 1, timeZone) === day) guess -= 3_600_000;
  while (localDay(guess, timeZone) !== day) guess += 60_000;
  return guess;
}

export function nextMidnight(ts: number, timeZone = machineZone()): number {
  return midnightOf(midnightOf(ts, timeZone) + DAY_MS + 3_600_000, timeZone);
}
