/**
 * Browser-safe entry for the website: share-link codec, formatting, roast text.
 * Nothing reachable from here may import `node:` modules; test/web.test.ts walks the graph.
 */
export {
  MAX_LINK_AGENTS,
  SHARE_BASE,
  SHARE_WHITELIST,
  decodeShare,
  shareUrl,
  type SharePayload,
} from "./receipt/share.js";
export {
  formatMultiple,
  formatRange,
  formatSatireUsd,
  formatUsd,
  sig2,
} from "./metrics/format.js";
export { ramX } from "./metrics/satire.js";
export { FAMILIES, type Family, type Variant } from "./roasts/families.js";
export {
  gatsbys,
  numberWord,
  pct,
  render,
  tokenWords,
} from "./roasts/slots.js";
export { ACHIEVEMENT_NAMES } from "./roasts/achievements.js";
export { AGENT_NAMES } from "./agents.js";
export type { Source } from "./types.js";
export { classProgress, damageClass } from "./roasts/classes.js";
export {
  draw,
  freshDeck,
  freshNews,
  isDeck,
  newDeck,
  satireShare,
  type Deck,
  type PoolLine,
} from "./pool-entry.js";
