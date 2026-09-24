/**
 * No-repeat rotation for the pool (docs/ROASTS.md §Pool): each kind is a shuffled deck. Lines come out in order
 * until the deck is used up, then it is reshuffled, and the first line of the new round is never the last line
 * of the old one. A line that doesn't fit right now (its band or slots) is passed over and stays in the deck.
 * Pure: the state goes in and comes out, so the CLI keeps it in state.json and the site in localStorage.
 */
export interface Deck {
  seed: number;
  /** Round number per kind; each round has its own order. */
  round: Record<string, number>;
  /** Ids drawn in the current round, per kind. */
  used: Record<string, string[]>;
  /** The last id drawn per kind, so a new round never starts with it. */
  last: Record<string, string>;
}

export const newDeck = (seed: number): Deck => ({
  seed: seed >>> 0,
  round: {},
  used: {},
  last: {},
});

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** A deck read back from state.json or localStorage; anything else is dropped and a new deck starts. */
export function isDeck(x: unknown): x is Deck {
  if (!isRecord(x) || !Number.isInteger(x.seed)) return false;
  const { round, used, last } = x;
  return (
    isRecord(round) &&
    Object.values(round).every(Number.isInteger) &&
    isRecord(used) &&
    Object.values(used).every(
      (v) => Array.isArray(v) && v.every((id) => typeof id === "string"),
    ) &&
    isRecord(last) &&
    Object.values(last).every((id) => typeof id === "string")
  );
}

/** A new deck with a random seed; for the CLI's first run and a visitor's first print. */
export const freshDeck = (): Deck =>
  newDeck(Math.floor(Math.random() * 2 ** 32));

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The order of a round: a Fisher–Yates shuffle seeded by the deck, the kind and the round. */
export function roundOrder(
  ids: readonly string[],
  seed: number,
  kind: string,
  round: number,
): string[] {
  let h = seed ^ Math.imul(round + 1, 0x9e3779b1);
  for (const c of kind) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  const rng = mulberry32(h);
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** The next line of a kind that fits, and the deck after drawing it; null when nothing fits. */
export function draw(
  deck: Deck,
  kind: string,
  ids: readonly string[],
  fits: (id: string) => boolean = () => true,
): { id: string | null; deck: Deck } {
  if (!ids.length) return { id: null, deck };
  const pick = (round: number, used: string[]) => {
    const order = roundOrder(ids, deck.seed, kind, round);
    // A new round never opens with the line that closed the last one.
    if (!used.length && order.length > 1 && order[0] === deck.last[kind])
      order.push(order.shift()!);
    return order.find((id) => !used.includes(id) && fits(id)) ?? null;
  };
  let round = deck.round[kind] ?? 0;
  let used = (deck.used[kind] ?? []).filter((id) => ids.includes(id));
  let id = used.length < ids.length ? pick(round, used) : null;
  if (!id) {
    // Everything that fits has been drawn this round: start the next one.
    round += 1;
    used = [];
    id = pick(round, used);
    if (!id) return { id: null, deck };
  }
  return {
    id,
    deck: {
      seed: deck.seed,
      round: { ...deck.round, [kind]: round },
      used: { ...deck.used, [kind]: [...used, id] },
      last: { ...deck.last, [kind]: id },
    },
  };
}

/** "2025-10" → months since year 0; "2025" counts as its December; "-" (a standing fact) has no age. */
const monthIndex = (date: string): number | null => {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(date);
  return m ? Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : 11) : null;
};

/**
 * The news lines still worth a "meanwhile": dated within `months` before `asOf` (YYYY-MM) and not after it.
 * When fewer than `min` qualify, all of them rotate, so a stale pool shows old news rather than the same few.
 * Other kinds pass through untouched.
 */
export function freshNews<
  L extends { kind: string; source?: { date: string } },
>(lines: readonly L[], asOf: string, { months = 12, min = 6 } = {}): L[] {
  const now = monthIndex(asOf);
  const news = lines.filter((l) => l.kind === "news");
  const fresh = news.filter((l) => {
    const at = l.source ? monthIndex(l.source.date) : null;
    return now === null || at === null || (at <= now && now - at < months);
  });
  const keep = new Set(fresh.length >= min ? fresh : news);
  return lines.filter((l) => l.kind !== "news" || keep.has(l));
}
