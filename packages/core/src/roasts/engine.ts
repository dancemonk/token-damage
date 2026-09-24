import type { Tier } from "../types.js";
import { achievements, type Achievement } from "./achievements.js";
import { damageClass, type DamageClass } from "./classes.js";
import { metricsOf, type Facts } from "./facts.js";
import { FAMILIES, type Band, type Family, type Tone } from "./families.js";
import { sig2 } from "../metrics/format.js";
import { satireShare } from "../metrics/satire.js";
import { draw, newDeck, type Deck } from "./deck.js";
import { POOL_EN, type PoolLine } from "./pool.js";
import { render, slotsOf } from "./slots.js";
import { emptyState, type RoastState } from "./state.js";

export interface Note {
  family: string;
  variant: number;
  text: string;
  tone: Tone;
  tier: Tier;
  score: number;
}

export interface Observations {
  /** Every family that fired, best first. */
  candidates: Note[];
  note: Note | null;
  damageClass: DamageClass;
  achievements: Achievement[];
  /** Receipt-grammar jokes from the pool, never more than two. */
  jokes: string[];
  /** One ✶ line: a real AI event and the reader's made-up share of it. */
  satire: { text: string; source?: PoolLine["source"] } | null;
  /** One dated AI news line, plain fact. */
  news: { text: string; source?: PoolLine["source"] } | null;
  /** The pool deck after these draws; nextState keeps it. */
  deck: Deck;
}

const CONFIDENCE: Record<Tier, number> = {
  measured: 1,
  priced: 0.9,
  estimated: 0.6,
  satire: 0,
};
/** A family used on either of the last two receipts scores lower, so notes rotate. */
const COOLDOWN_RUNS = 2;
const COOLDOWN_FACTOR = 0.5;

export function inBand(
  metrics: Record<string, number | null>,
  band: Band,
): boolean {
  return Object.entries(band).every(([metric, [min, max]]) => {
    const value = metrics[metric];
    return (
      value !== null && value !== undefined && value >= min && value <= max
    );
  });
}

function strength(
  family: Family,
  metrics: Record<string, number | null>,
): number {
  const s = family.strength;
  if (typeof s === "number") return s;
  const x = metrics[s.metric];
  if (x === null || x === undefined) return 0;
  const pos = s.log
    ? Math.log(x / s.lo) / Math.log(s.hi / s.lo)
    : (x - s.lo) / (s.hi - s.lo);
  return Math.min(1, Math.max(0, pos));
}

/** Picks what the receipt says about this period. Deterministic: same facts and state, same output. */
export function observe(
  facts: Facts,
  state: RoastState = emptyState(),
  pool: readonly PoolLine[] = POOL_EN,
): Observations {
  const metrics = metricsOf(facts);
  const slots = slotsOf(facts);
  const candidates: Note[] = [];
  for (const family of FAMILIES) {
    if (!inBand(metrics, family.band)) continue;
    const memory = state.families[family.id];
    const start = memory?.nextVariant ?? 0;
    for (let k = 0; k < family.variants.length; k++) {
      const index = (start + k) % family.variants.length;
      const variant = family.variants[index];
      if (!variant || (variant.band && !inBand(metrics, variant.band)))
        continue;
      const text = render(variant.text, slots);
      if (text === undefined) continue;
      const recent =
        memory !== undefined && state.runs - memory.lastRun <= COOLDOWN_RUNS;
      const score =
        family.weight *
        (0.5 + 0.5 * strength(family, metrics)) *
        CONFIDENCE[family.tier] *
        (recent ? COOLDOWN_FACTOR : 1);
      candidates.push({
        family: family.id,
        variant: index,
        text,
        tone: variant.tone,
        tier: family.tier,
        score,
      });
      break;
    }
  }
  candidates.sort(
    (a, b) => b.score - a.score || (a.family < b.family ? -1 : 1),
  );
  const note = candidates[0] ?? null;

  // Pool lines rotate through a deck: no repeats until every line that fits has been printed.
  let deck = state.deck ?? newDeck(0);
  const byId = new Map(pool.map((l) => [l.id, l]));
  const text = (line: PoolLine) =>
    line.band && !inBand(metrics, line.band)
      ? undefined
      : render(line.text, {
          ...slots,
          share: sig2(satireShare(facts.tokens, line.size)),
        });
  const take = (kind: PoolLine["kind"], avoid: string[] = []) => {
    const ids = pool.filter((l) => l.kind === kind).map((l) => l.id);
    const fits = (id: string) => {
      const t = text(byId.get(id)!);
      return t !== undefined && t !== note?.text && !avoid.includes(t);
    };
    const drawn = draw(deck, kind, ids, fits);
    deck = drawn.deck;
    const line = drawn.id ? byId.get(drawn.id)! : undefined;
    return line ? { text: text(line)!, source: line.source } : null;
  };
  const first = take("joke");
  const second = take("joke", first ? [first.text] : []);
  const jokes = [first, second].flatMap((j) => (j ? [j.text] : []));
  const satire = take("satire");
  const news = take("news");

  return {
    candidates,
    note,
    damageClass: damageClass(facts.tokens),
    achievements: achievements(facts),
    jokes,
    satire,
    news,
    deck,
  };
}

/** State after printing a receipt: the chosen family cools down and moves to its next variant. */
export function nextState(
  state: RoastState,
  observations: Observations,
): RoastState {
  const runs = state.runs + 1;
  const families = { ...state.families };
  const note = observations.note;
  if (note) {
    const count =
      FAMILIES.find((f) => f.id === note.family)?.variants.length ?? 1;
    families[note.family] = {
      lastRun: runs,
      nextVariant: (note.variant + 1) % count,
    };
  }
  return {
    version: 1,
    runs,
    families,
    jokeCursor: state.jokeCursor + 2,
    deck: observations.deck,
  };
}
