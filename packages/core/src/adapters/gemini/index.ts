import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import type { PromptEvent, UsageEvent } from "../../types.js";
import { readLines } from "../claude/index.js";
import { findChats } from "./discover.js";
import { readJsonChat, readJsonlChat, type GeminiStats } from "./parse.js";

export { findChats, geminiDirs, type ChatFile } from "./discover.js";
export { emptyGeminiStats, type GeminiStats } from "./parse.js";

/**
 * Streams usage and prompt events from every Gemini CLI chat under the given data dirs. Not deduped:
 * the dedupe key is the message id, so a response copied into another file counts once.
 */
export async function* scanGemini(
  dirs: string[],
  stats: GeminiStats,
  /** Only these chat files (live polling). */
  files?: string[],
): AsyncGenerator<UsageEvent | PromptEvent> {
  const only = files && new Set(files);
  for (const file of await findChats(dirs)) {
    if (only && !only.has(file.path)) continue;
    stats.files++;
    // Only for records without a timestamp of their own.
    const mtime = (await stat(file.path)).mtimeMs;
    const stem = basename(file.path).replace(/\.jsonl?$/, "");
    const chat = file.path.endsWith(".jsonl")
      ? await readJsonlChat(readLines(file.path), stem, mtime, stats)
      : readJsonChat(await readFile(file.path, "utf8"), stem, mtime, stats);
    const parentSessionId = file.parentSessionId;
    for (const record of chat.records) {
      if (record.kind === "prompt") {
        // A subagent's prompts were written by the agent that started it.
        if (chat.subagent || parentSessionId) continue;
        stats.prompts++;
        yield {
          kind: "prompt",
          source: "gemini",
          sessionId: record.sessionId,
          ts: record.ts,
          words: record.words,
          dedupeKey: `gemini|${record.id ?? `${record.sessionId}|${record.ts}`}`,
        };
        continue;
      }
      const { usage } = record;
      const dedupeKey = `gemini|${
        record.id ??
        [
          record.sessionId,
          record.ts,
          record.model,
          usage.input,
          usage.cacheRead,
          usage.output,
        ].join("|")
      }`;
      stats.events++;
      yield {
        kind: "usage",
        source: "gemini",
        sessionId: record.sessionId,
        ...(parentSessionId && {
          parentSessionId,
          agentId: record.sessionId,
        }),
        ts: record.ts,
        model: record.model,
        input: usage.input,
        cacheWrite: 0,
        cacheWrite1h: 0,
        cacheRead: usage.cacheRead,
        output: usage.output,
        messageId: record.id ?? dedupeKey,
        dedupeKey,
      };
    }
  }
}
