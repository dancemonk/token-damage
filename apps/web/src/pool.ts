// The rotating pool on the site: one deck per browser in localStorage (td.deck), shared by every page and
// language, so a line doesn't come back until the visitor has seen the rest (docs/ROASTS.md §Pool).
import {
  draw,
  freshDeck,
  isDeck,
  satireShare,
  type Deck,
} from "@token-damage/core/pool";
import type { ReceiptFormat } from "./format.js";
import type { PoolEntry } from "./i18n.js";
import { savedDeck, saveDeck } from "./prefs.js";
import { fillShare, type ReceiptView } from "./receipt.js";

let deck: Deck | null = null;

function current(): Deck {
  if (deck) return deck;
  let stored: unknown = null;
  try {
    stored = JSON.parse(savedDeck() ?? "null");
  } catch {
    // A broken value: start a new deck.
  }
  deck = isDeck(stored) ? stored : freshDeck();
  return deck;
}

/** The next line of a kind from this page's pool, or null when the page has none. */
export function next(
  pool: readonly PoolEntry[] | undefined,
  kind: PoolEntry["kind"],
): PoolEntry | null {
  const lines = (pool ?? []).filter((l) => l.kind === kind);
  const drawn = draw(
    current(),
    kind,
    lines.map((l) => l.id),
  );
  deck = drawn.deck;
  saveDeck(JSON.stringify(deck));
  return lines.find((l) => l.id === drawn.id) ?? null;
}

/** One ✶ satire line and one receipt joke for a receipt of `tokens`. */
export function poolLines(
  pool: readonly PoolEntry[] | undefined,
  tokens: number,
  fmt: ReceiptFormat,
): Pick<ReceiptView, "satire" | "joke"> {
  const satire = next(pool, "satire");
  const joke = next(pool, "joke");
  return {
    satire: satire
      ? fillShare(satire.text, fmt.share(satireShare(tokens, satire.size)))
      : undefined,
    joke: joke?.text,
  };
}
