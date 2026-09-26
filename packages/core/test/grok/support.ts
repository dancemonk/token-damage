import { fileURLToPath } from "node:url";
import { emptyGrokStats, scanGrok } from "../../src/adapters/grok/index.js";
import type { PromptEvent, UsageEvent } from "../../src/index.js";

/** A `GROK_HOME`: `sessions/p/<session>/updates.jsonl`, `summary.json`. */
export const GROK_FIXTURES = fileURLToPath(
  new URL("../../fixtures/grok/grok/", import.meta.url),
);

export async function scanFixtures(stats = emptyGrokStats()) {
  const usage: UsageEvent[] = [];
  const prompts: PromptEvent[] = [];
  for await (const r of scanGrok([GROK_FIXTURES], stats)) {
    if (r.kind === "usage") usage.push(r);
    else prompts.push(r);
  }
  return { usage, prompts, stats };
}
