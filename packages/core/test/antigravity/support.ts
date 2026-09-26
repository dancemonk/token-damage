import { fileURLToPath } from "node:url";
import {
  emptyAntigravityStats,
  scanAntigravity,
} from "../../src/adapters/antigravity/index.js";
import type { PromptEvent, UsageEvent } from "../../src/index.js";

/** An `ANTIGRAVITY_DATA_DIR` root: `conversations/*.db`, `history.jsonl`. */
export const ANTIGRAVITY_FIXTURES = fileURLToPath(
  new URL("../../fixtures/antigravity/antigravity/", import.meta.url),
);

/** The fixture root, scanned. Not deduped further (merged events have unique keys). */
export async function scanFixtures(stats = emptyAntigravityStats()) {
  const usage: UsageEvent[] = [];
  const prompts: PromptEvent[] = [];
  for await (const r of scanAntigravity([ANTIGRAVITY_FIXTURES], stats)) {
    if (r.kind === "usage") usage.push(r);
    else prompts.push(r);
  }
  return { usage, prompts, stats };
}
