import { readFile, stat } from "node:fs/promises";
import type { PromptEvent, UsageEvent } from "../../types.js";
import { columns, readSqlite, rows, type Database } from "../sqlite.js";
import { fileStem, findDatabase, legacyMessageFiles } from "./discover.js";
import {
  createdAt,
  parseObject,
  partWords,
  usageOf,
  v2UsageOf,
  type OpenCodeStats,
  type OpenCodeUsage,
} from "./parse.js";

export { findDatabase, legacyMessageFiles, opencodeDirs } from "./discover.js";
export {
  emptyOpenCodeStats,
  modelName as opencodeModelName,
  type OpenCodeStats,
} from "./parse.js";

const text = (v: unknown): string | undefined =>
  typeof v === "string" && v !== "" ? v : undefined;
const positive = (v: unknown): number | undefined =>
  typeof v === "number" && v > 0
    ? v
    : typeof v === "bigint" && v > 0n
      ? Number(v)
      : undefined;

interface Session {
  /** The session a subagent's session was started from, followed to the top. */
  root: string;
  version?: string;
}

function readSessions(db: Database): Map<string, Session> {
  const have = columns(db, "session");
  const parents = new Map<string, string | undefined>();
  const versions = new Map<string, string | undefined>();
  if (have.has("id")) {
    const parent = have.has("parent_id") ? "parent_id" : "NULL";
    const version = have.has("version") ? "version" : "NULL";
    for (const r of rows(
      db,
      `SELECT id, ${parent} AS parent, ${version} AS version FROM session`,
    )) {
      const id = String(r.id);
      parents.set(id, text(r.parent));
      versions.set(id, text(r.version));
    }
  }
  const sessions = new Map<string, Session>();
  for (const id of parents.keys()) {
    let root = id;
    const path = new Set([id]);
    for (
      let up = parents.get(root);
      up && !path.has(up);
      up = parents.get(up)
    ) {
      path.add(up);
      root = up;
    }
    sessions.set(id, { root, version: versions.get(id) });
  }
  return sessions;
}

interface Found {
  id?: string;
  sessionId: string;
  ts: number;
  usage: OpenCodeUsage;
}

interface Prompt {
  id: string;
  sessionId: string;
  ts: number;
}

interface DatabaseRead {
  sessions: Map<string, Session>;
  found: Found[];
  prompts: { prompt: Prompt; words: number }[];
}

/**
 * Assistant usage from `message` (payloads with `tokens`, any role, as ccusage reads them) and from
 * `session_message` (OpenCode v2: rows of type "assistant"), and the words of every user message's text parts.
 * A payload without `time.created` is dated by its row's `time_created`.
 */
function readDatabase(db: Database): DatabaseRead {
  const sessions = readSessions(db);
  const found: Found[] = [];
  const users: Prompt[] = [];
  const message = columns(db, "message");
  if (["id", "session_id", "data"].every((c) => message.has(c))) {
    const created = message.has("time_created") ? "time_created" : "NULL";
    for (const r of rows(
      db,
      `SELECT id, session_id, ${created} AS created, data FROM message`,
    )) {
      const payload =
        typeof r.data === "string" ? parseObject(r.data) : undefined;
      const id = text(r.id);
      const sessionId = text(r.session_id);
      if (!payload || !id || !sessionId) continue;
      const ts = createdAt(payload) ?? positive(r.created) ?? 0;
      if (payload.role === "user") users.push({ id, sessionId, ts });
      const usage = usageOf(payload);
      if (usage) found.push({ id, sessionId, ts, usage });
    }
  }
  const v2 = columns(db, "session_message");
  if (["id", "session_id", "type", "data"].every((c) => v2.has(c))) {
    const created = v2.has("time_created") ? "time_created" : "NULL";
    for (const r of rows(
      db,
      `SELECT id, session_id, type, ${created} AS created, data FROM session_message`,
    )) {
      if (r.type !== "assistant" || typeof r.data !== "string") continue;
      const payload = parseObject(r.data);
      const id = text(r.id);
      const sessionId = text(r.session_id);
      const usage = payload && v2UsageOf(payload);
      if (!usage || !id || !sessionId) continue;
      found.push({
        id,
        sessionId,
        ts: usage.ts ?? positive(r.created) ?? 0,
        usage,
      });
    }
  }
  const prompts: DatabaseRead["prompts"] = [];
  const part = columns(db, "part");
  if (users.length > 0 && part.has("message_id") && part.has("data")) {
    const parts = db.prepare("SELECT data FROM part WHERE message_id = ?");
    for (const prompt of users) {
      let words: number | undefined;
      for (const r of parts.all(prompt.id)) {
        const data =
          typeof r.data === "string" ? parseObject(r.data) : undefined;
        const n = data && partWords(data);
        if (n !== undefined) words = (words ?? 0) + n;
      }
      if (words !== undefined) prompts.push({ prompt, words });
    }
  }
  return { sessions, found, prompts };
}

async function openDatabase(
  path: string,
  stats: OpenCodeStats,
): Promise<DatabaseRead | undefined> {
  const read = await readSqlite(path, readDatabase);
  if (read.ok) {
    stats.databases++;
    return read.value;
  }
  if (read.reason === "no-sqlite") stats.noSqlite++;
  else stats.unreadable++;
  return undefined;
}

/**
 * Streams usage and prompt events from every OpenCode data dir: its SQLite database, then legacy message
 * files. The first copy of a message id counts, across dirs, as in ccusage; later copies are skipped here.
 */
export async function* scanOpenCode(
  dirs: string[],
  stats: OpenCodeStats,
): AsyncGenerator<UsageEvent | PromptEvent> {
  const seen = new Set<string>();
  let unnamed = 0;
  for (const dir of dirs) {
    const path = await findDatabase(dir);
    const db = path ? await openDatabase(path, stats) : undefined;
    const sessions = db?.sessions ?? new Map<string, Session>();
    const found: Found[] = [...(db?.found ?? [])];
    const inDir = new Set(found.flatMap((f) => (f.id ? [f.id] : [])));
    for (const file of await legacyMessageFiles(dir)) {
      // Named after its message id: skip the read when the database already had it.
      if (inDir.has(fileStem(file))) continue;
      let payload;
      let mtime;
      try {
        payload = parseObject(await readFile(file, "utf8"));
        mtime = (await stat(file)).mtimeMs;
      } catch {
        stats.unreadable++;
        continue;
      }
      stats.files++;
      const usage = payload && usageOf(payload);
      if (!payload || !usage) continue;
      const id =
        typeof payload.id === "string"
          ? payload.id.trim() || undefined
          : undefined;
      const sessionId =
        (typeof payload.sessionID === "string" && payload.sessionID.trim()) ||
        "unknown";
      found.push({ id, sessionId, ts: usage.ts ?? Math.trunc(mtime), usage });
    }
    for (const f of found) {
      if (f.id !== undefined) {
        if (seen.has(f.id)) {
          stats.duplicates++;
          continue;
        }
        seen.add(f.id);
      }
      const session = sessions.get(f.sessionId);
      const root = session?.root ?? f.sessionId;
      const dedupeKey = `opencode|${f.id ?? `unnamed|${unnamed++}`}`;
      stats.events++;
      yield {
        kind: "usage",
        source: "opencode",
        sessionId: f.sessionId,
        ...(root !== f.sessionId && {
          parentSessionId: root,
          agentId: f.sessionId,
        }),
        ts: f.ts,
        model: f.usage.model,
        input: f.usage.input,
        cacheWrite: f.usage.cacheWrite,
        cacheWrite1h: 0,
        cacheRead: f.usage.cacheRead,
        output: f.usage.output,
        messageId: f.id ?? dedupeKey,
        dedupeKey,
        ...(session?.version && { version: session.version }),
      };
    }
    for (const { prompt, words } of db?.prompts ?? []) {
      // A subagent's prompts were written by the agent that started it.
      const root = sessions.get(prompt.sessionId)?.root ?? prompt.sessionId;
      if (root !== prompt.sessionId) continue;
      stats.prompts++;
      yield {
        kind: "prompt",
        source: "opencode",
        sessionId: prompt.sessionId,
        ts: prompt.ts,
        words,
        dedupeKey: `opencode|${prompt.id}`,
      };
    }
  }
}
