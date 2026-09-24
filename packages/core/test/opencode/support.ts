import { fileURLToPath } from "node:url";
import {
  emptyOpenCodeStats,
  scanOpenCode,
  type PromptEvent,
  type UsageEvent,
} from "../../src/index.js";

/** An OpenCode data dir (`~/.local/share/opencode`): `opencode.db`, `storage/message/`. */
export const OPENCODE_FIXTURES = fileURLToPath(
  new URL("../../fixtures/opencode/opencode/", import.meta.url),
);

/** Every data dir given, scanned. Not deduped. */
export async function scanFixtures(
  dirs = [OPENCODE_FIXTURES],
  stats = emptyOpenCodeStats(),
) {
  const usage: UsageEvent[] = [];
  const prompts: PromptEvent[] = [];
  for await (const r of scanOpenCode(dirs, stats)) {
    if (r.kind === "usage") usage.push(r);
    else prompts.push(r);
  }
  return { usage, prompts, stats };
}
