/**
 * Browser-safe entry for the rotating pool (@token-damage/core/pool): the no-repeat deck and the share formula.
 * The lines themselves reach a page as page data in its own language (the English ones from POOL_EN at build
 * time), so no page downloads another language's pool.
 */
export type { PoolKind, PoolLine } from "./roasts/pool.js";
export {
  draw,
  freshDeck,
  isDeck,
  newDeck,
  roundOrder,
  type Deck,
} from "./roasts/deck.js";
export { satireShare } from "./metrics/satire.js";
export { sig2 } from "./metrics/format.js";
