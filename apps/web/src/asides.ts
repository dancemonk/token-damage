/** Chance that a print after the first carries an aside instead of the sample's note. */
export const ASIDE_ODDS = 0.2;

export interface AsideState {
  /** Receipts printed so far on this visit, the first (static) one included. */
  printed: number;
  /** An aside was already shown on this visit. */
  shown: boolean;
  /** The id shown last, on any visit. */
  last: string | null;
}

/**
 * The aside for the next home-page print, or null: never the first print, at most one per visit, never the same
 * id twice in a row, empty slots skipped. Only the home page's samples ever call this, never a real receipt.
 */
export function pickAside(
  asides: Record<string, string>,
  state: AsideState,
  rng: () => number,
  odds = ASIDE_ODDS,
): string | null {
  if (state.printed < 1 || state.shown) return null;
  const ids = Object.keys(asides).filter(
    (id) => asides[id]?.trim() && id !== state.last,
  );
  if (!ids.length || rng() >= odds) return null;
  return ids[Math.floor(rng() * ids.length)] ?? null;
}
