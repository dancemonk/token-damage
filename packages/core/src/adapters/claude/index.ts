import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { UsageEvent } from "../../types.js";
import { findTranscripts } from "./discover.js";
import { parseLines, type ParseStats } from "./parse.js";

export { createDeduper, dedupe, type Deduper } from "./dedupe.js";
export {
  claudeRoots,
  findTranscripts,
  subagentOf,
  type TranscriptFile,
} from "./discover.js";
export {
  emptyStats,
  parseLine,
  parseLines,
  type LineResult,
  type ParseStats,
  type SubagentRef,
} from "./parse.js";

export function readLines(path: string): AsyncIterable<string> {
  return createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  });
}

export interface ScanStats extends ParseStats {
  files: number;
  subagentFiles: number;
}

/** Streams usage events from every Claude Code transcript under the given roots. Not deduped. */
export async function* scanClaude(
  roots: string[],
  stats: ScanStats,
): AsyncGenerator<UsageEvent> {
  for (const file of await findTranscripts(roots)) {
    stats.files++;
    if (file.subagent) stats.subagentFiles++;
    yield* parseLines(readLines(file.path), stats, file.subagent);
  }
}
