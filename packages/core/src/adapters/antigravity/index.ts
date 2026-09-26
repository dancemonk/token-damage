import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { PromptEvent, UsageEvent } from "../../types.js";
import { readLines } from "../claude/index.js";
import { readSqlite, rows, tableExists, type Database } from "../sqlite.js";
import { findDatabases } from "./discover.js";
import {
  conversationEvents,
  mergeEvents,
  type AgyEvent,
  type ConversationRows,
} from "./events.js";
import { historyPrompt } from "./history.js";
import { withoutEffort } from "./models.js";
import {
  generationMeta,
  stepMeta,
  trajectoryTs,
  type RowMeta,
} from "./parse.js";

export { antigravityRoots, findDatabases } from "./discover.js";

export interface AntigravityStats {
  /** Conversation databases read. */
  databases: number;
  /** Of those, decoded in this scan; the rest came unchanged from the cache. */
  decoded: number;
  events: number;
  prompts: number;
  /** Rows whose blob could not be decoded: skipped. */
  malformed: number;
  /** Databases that could not be opened or queried. */
  unreadable: number;
  /** Databases skipped because this Node has no `node:sqlite` (before 22.13). */
  noSqlite: number;
}

export const emptyAntigravityStats = (): AntigravityStats => ({
  databases: 0,
  decoded: 0,
  events: 0,
  prompts: 0,
  malformed: 0,
  unreadable: 0,
  noSqlite: 0,
});

// The live pane rescans every database when one changes; a database whose file and write-ahead log did not move
// (mtime, size) is not decoded again. Holds decoded numbers and ids only, never text.
const decodedRows = new Map<
  string,
  {
    signature: string;
    rows: ConversationRows | undefined;
    malformed: number;
  }
>();

async function signature(path: string): Promise<string> {
  const part = (p: string) =>
    stat(p).then(
      (s) => `${s.mtimeMs}:${s.size}`,
      () => "-",
    );
  return `${await part(path)}|${await part(`${path}-wal`)}`;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

// One snapshot per database (Antigravity may be writing): every table is read inside one transaction.
function readConversation(
  db: Database,
  sessionId: string,
  fallbackTs: number,
  stats: AntigravityStats,
): ConversationRows | undefined {
  db.exec("BEGIN");
  const pages = db.prepare("PRAGMA page_count").get() as
    { page_count?: unknown } | undefined;
  if (Number(pages?.page_count ?? 0) === 0) return undefined;
  const decode = <T>(
    blob: unknown,
    parse: (b: Uint8Array) => T,
  ): T | undefined => {
    if (!(blob instanceof Uint8Array)) return undefined;
    try {
      return parse(blob);
    } catch {
      stats.malformed++;
      return undefined;
    }
  };
  let trajectory: number | undefined;
  if (tableExists(db, "trajectory_metadata_blob"))
    for (const r of rows(
      db,
      "SELECT data FROM trajectory_metadata_blob ORDER BY rowid ASC",
    ))
      trajectory ??= decode(r.data, trajectoryTs);
  const read = (
    table: string,
    sql: string,
    parse: (b: Uint8Array) => RowMeta,
    column: string,
  ) => {
    const out: { idx: number; meta: RowMeta }[] = [];
    if (!tableExists(db, table)) return out;
    for (const r of rows(db, sql)) {
      const meta = decode(r[column], parse);
      if (meta) out.push({ idx: Number(r.idx), meta });
    }
    return out;
  };
  return {
    sessionId,
    trajectoryTs: trajectory,
    fallbackTs,
    steps: read(
      "steps",
      "SELECT idx, metadata FROM steps WHERE metadata IS NOT NULL ORDER BY idx ASC",
      stepMeta,
      "metadata",
    ),
    generations: read(
      "gen_metadata",
      "SELECT idx, data FROM gen_metadata ORDER BY idx ASC",
      generationMeta,
      "data",
    ),
  };
}

function usageEvent(e: AgyEvent): UsageEvent {
  const key = e.messageId ?? e.rowKey;
  return {
    kind: "usage",
    source: "antigravity",
    sessionId: e.sessionId,
    ts: e.ts,
    model: withoutEffort(e.model),
    input: e.input,
    cacheWrite: e.cacheWrite,
    cacheWrite1h: 0,
    cacheRead: e.cacheRead,
    output: e.totalOutput,
    messageId: key,
    dedupeKey: `antigravity:${key}`,
  };
}

/**
 * Usage from every conversation database under the roots, merged across databases by id (ccusage's rule), then
 * the prompts in each root's `history.jsonl`. Not deduped further: merged events have unique keys.
 */
export async function* scanAntigravity(
  roots: string[],
  stats: AntigravityStats,
): AsyncGenerator<UsageEvent | PromptEvent> {
  const events: AgyEvent[] = [];
  for (const path of await findDatabases(roots)) {
    const sig = await signature(path);
    let entry = decodedRows.get(path);
    if (entry?.signature !== sig) {
      const fallbackTs = await stat(path).then(
        (s) => s.mtimeMs,
        () => 0,
      );
      const counted = emptyAntigravityStats();
      const read = await readSqlite(path, (db) =>
        readConversation(db, basename(path, ".db"), fallbackTs, counted),
      );
      if (!read.ok) {
        // Not cached: a database that could not be read is tried again next scan.
        if (read.reason === "no-sqlite") stats.noSqlite++;
        else stats.unreadable++;
        continue;
      }
      stats.decoded++;
      entry = {
        signature: sig,
        rows: read.value,
        malformed: counted.malformed,
      };
      decodedRows.set(path, entry);
    }
    stats.malformed += entry.malformed;
    if (!entry.rows) continue;
    stats.databases++;
    for (const e of conversationEvents(entry.rows)) events.push(e);
  }
  for (const e of mergeEvents(events)) {
    stats.events++;
    yield usageEvent(e);
  }
  for (const root of roots) {
    const file = join(root, "history.jsonl");
    if (!(await isFile(file))) continue;
    for await (const line of readLines(file)) {
      const prompt = historyPrompt(line);
      if (!prompt) continue;
      stats.prompts++;
      yield prompt;
    }
  }
}
