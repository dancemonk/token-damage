import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { PromptEvent, UsageEvent } from "../../types.js";
import { readLines } from "../claude/index.js";
import { findUpdates } from "./discover.js";
import { promptRuns, summaryMeta, turnEvents } from "./parse.js";

export { findUpdates, grokRoots } from "./discover.js";

export interface GrokStats {
  /** Session `updates.jsonl` files read. */
  files: number;
  events: number;
  prompts: number;
  /** Turns already counted from another file (a resumed session's copy). */
  duplicates: number;
  /** Lines that are not JSON objects. */
  malformed: number;
}

export const emptyGrokStats = (): GrokStats => ({
  files: 0,
  events: 0,
  prompts: 0,
  duplicates: 0,
  malformed: 0,
});

/**
 * Usage and prompts from every Grok Build session under the homes, or only from `only` (live polling). A turn
 * copied into another session file counts once (its event id and model).
 */
export async function* scanGrok(
  roots: string[],
  stats: GrokStats,
  only?: string[],
): AsyncGenerator<UsageEvent | PromptEvent> {
  const wanted = only && new Set(only);
  const seen = new Set<string>();
  for (const path of await findUpdates(roots)) {
    if (wanted && !wanted.has(path)) continue;
    stats.files++;
    const dir = dirname(path);
    const summary = await readFile(join(dir, "summary.json"), "utf8").catch(
      () => undefined,
    );
    const meta = summaryMeta(summary, basename(dir));
    const lines: Record<string, unknown>[] = [];
    for await (const text of readLines(path)) {
      if (text.trim() === "") continue;
      try {
        const value: unknown = JSON.parse(text);
        if (
          value !== null &&
          typeof value === "object" &&
          !Array.isArray(value)
        )
          lines.push(value as Record<string, unknown>);
        else stats.malformed++;
      } catch {
        stats.malformed++;
      }
    }
    for (const line of lines)
      for (const e of turnEvents(line, meta)) {
        if (seen.has(e.dedupeKey)) {
          stats.duplicates++;
          continue;
        }
        seen.add(e.dedupeKey);
        stats.events++;
        yield e;
      }
    for (const p of promptRuns(lines, meta)) {
      stats.prompts++;
      yield p;
    }
  }
}
