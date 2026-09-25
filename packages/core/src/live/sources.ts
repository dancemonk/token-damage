import { stat } from "node:fs/promises";
import { join } from "node:path";
import {
  emptyCodexStats,
  findRollouts,
  scanCodex,
} from "../adapters/codex/index.js";
import { findTranscripts, subagentOf } from "../adapters/claude/discover.js";
import { parseLine } from "../adapters/claude/parse.js";
import {
  emptyGeminiStats,
  findChats,
  scanGemini,
} from "../adapters/gemini/index.js";
import {
  emptyOpenCodeStats,
  findDatabase,
  scanOpenCode,
} from "../adapters/opencode/index.js";
import type { PromptEvent, Source, UsageEvent } from "../types.js";
import { DAY_MS } from "./day.js";
import { readAppended, type TailState } from "./tail.js";

export type LiveRecord = UsageEvent | PromptEvent;

export interface SourceDirs {
  claudeRoots: string[];
  codexHomes: string[];
  geminiDirs: string[];
  opencodeDirs: string[];
}

export interface SourcesState {
  tails: Record<string, TailState>;
  seen: Record<string, number>;
  old: string[];
}

const emptySourcesState = (): SourcesState => ({
  tails: {},
  seen: {},
  old: [],
});

async function mtimeOf(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return undefined;
  }
}

/** Today's records from the four agents: a full scan, or only what changed since the last poll. */
export class LiveSources {
  noSqlite = false;
  #dirs: SourceDirs;
  #from: number;
  #hash: (path: string) => string;
  #state: SourcesState;
  #old: Set<string>;

  constructor(
    dirs: SourceDirs,
    opts: {
      from: number;
      hash: (path: string) => string;
      state?: SourcesState;
    },
  ) {
    this.#dirs = dirs;
    this.#from = opts.from;
    this.#hash = opts.hash;
    this.#state = opts.state ?? emptySourcesState();
    this.#old = new Set(this.#state.old);
  }

  state(): SourcesState {
    return { ...this.#state, old: [...this.#old] };
  }

  watchRoots(): string[] {
    return [
      ...this.#dirs.claudeRoots.map((r) => join(r, "projects")),
      ...this.#dirs.codexHomes.flatMap((h) => [
        join(h, "sessions"),
        join(h, "archived_sessions"),
      ]),
      ...this.#dirs.geminiDirs,
      ...this.#dirs.opencodeDirs,
    ];
  }

  /** The snapshot path: every record in the window, through the same scanners the receipt uses. */
  async scanAll(): Promise<LiveRecord[]> {
    const out: LiveRecord[] = [];
    const keep = (r: LiveRecord) => r.ts >= this.#from && out.push(r);

    // Claude: a file whose mtime predates the window cannot hold a today record; remember it as old,
    // exactly as poll() would once it noticed. Every other file is read in full and becomes a tail so
    // the next poll continues from its end.
    for (const file of await findTranscripts(this.#dirs.claudeRoots)) {
      const key = this.#hash(file.path);
      const mtime = await mtimeOf(file.path);
      if (mtime !== undefined && mtime < this.#from) {
        this.#old.add(key);
        continue;
      }
      const { lines, state } = await readAppended(file.path);
      this.#state.tails[key] = state;
      for (const line of lines) this.#parseClaude(line, file.subagent, keep);
    }

    // Codex: only rollouts recent enough to be today's or a fork parent of one; `keep` still filters
    // every record by timestamp, `recent` only limits which files scanCodex opens.
    const codexPaths = await findRollouts(this.#dirs.codexHomes);
    const codexRecent = await this.#recent(codexPaths, this.#from - 2 * DAY_MS);
    const codexStats = emptyCodexStats();
    for await (const r of scanCodex(
      this.#dirs.codexHomes,
      codexStats,
      codexRecent,
    ))
      keep(r);

    // Gemini: only chats modified today or later.
    const chats = (await findChats(this.#dirs.geminiDirs)).map((c) => c.path);
    const geminiRecent = await this.#recent(chats, this.#from);
    const geminiStats = emptyGeminiStats();
    for await (const r of scanGemini(
      this.#dirs.geminiDirs,
      geminiStats,
      geminiRecent,
    ))
      keep(r);

    const ocStats = emptyOpenCodeStats();
    for await (const r of scanOpenCode(this.#dirs.opencodeDirs, ocStats))
      keep(r);
    this.noSqlite = ocStats.noSqlite > 0;

    await this.#rememberMtimes(codexPaths, chats);
    return out;
  }

  /**
   * The delta path: Claude tails accumulate; an agent whose files changed is rescanned whole for today.
   * `newFiles` is true only for a newly seen Codex rollout — a fork parent can already hold today's
   * usage, which is why the engine forces a full reconcile on it. A new Claude transcript already
   * starts its own tail from byte 0, and a new Gemini chat is folded into its pool's rescan regardless,
   * so neither needs to force one too (a subagent swarm would otherwise cost a full rescan per file).
   */
  async poll(): Promise<{
    records: LiveRecord[];
    pools: Partial<Record<Source, LiveRecord[]>>;
    newFiles: boolean;
  }> {
    const appended: LiveRecord[] = [];
    const pools: Partial<Record<Source, LiveRecord[]>> = {};
    let newFiles = false;
    const today = (r: LiveRecord) => r.ts >= this.#from;

    for (const file of await findTranscripts(this.#dirs.claudeRoots)) {
      const key = this.#hash(file.path);
      if (this.#old.has(key)) continue;
      const prev = this.#state.tails[key];
      if (!prev) {
        const mtime = await mtimeOf(file.path);
        if (mtime !== undefined && mtime < this.#from) {
          this.#old.add(key);
          continue;
        }
      }
      const { lines, state } = await readAppended(file.path, prev);
      this.#state.tails[key] = state;
      for (const line of lines)
        this.#parseClaude(
          line,
          file.subagent,
          (r) => today(r) && appended.push(r),
        );
    }

    const codex = await this.#changed(
      await findRollouts(this.#dirs.codexHomes),
      this.#from - 2 * DAY_MS,
    );
    if (codex.changed.length) {
      newFiles ||= codex.fresh;
      // Every recent rollout, so fork parents are present and the pool is complete for today.
      const pool: LiveRecord[] = [];
      for await (const r of scanCodex(
        this.#dirs.codexHomes,
        emptyCodexStats(),
        codex.recent,
      ))
        if (today(r)) pool.push(r);
      pools.codex = pool;
    }
    const chats = (await findChats(this.#dirs.geminiDirs)).map((c) => c.path);
    const gemini = await this.#changed(chats, this.#from);
    if (gemini.changed.length) {
      // Every chat file modified today, not only the changed one: the pool must be complete.
      const pool: LiveRecord[] = [];
      for await (const r of scanGemini(
        this.#dirs.geminiDirs,
        emptyGeminiStats(),
        gemini.recent,
      ))
        if (today(r)) pool.push(r);
      pools.gemini = pool;
    }
    const dbs: string[] = [];
    for (const d of this.#dirs.opencodeDirs) {
      const db = await findDatabase(d);
      if (db) dbs.push(db, `${db}-wal`);
    }
    const opencode = await this.#changed(dbs, 0);
    if (opencode.changed.length) {
      const ocStats = emptyOpenCodeStats();
      const pool: LiveRecord[] = [];
      for await (const r of scanOpenCode(this.#dirs.opencodeDirs, ocStats))
        if (today(r)) pool.push(r);
      this.noSqlite = ocStats.noSqlite > 0;
      pools.opencode = pool;
    }
    return { records: appended, pools, newFiles };
  }

  #parseClaude(
    line: string,
    subagent: ReturnType<typeof subagentOf>,
    keep: (r: LiveRecord) => unknown,
  ): void {
    const result = parseLine(line, subagent);
    if (result.kind === "prompt") keep(result.prompt);
    else if (result.kind === "events") result.events.forEach(keep);
  }

  /** Files whose mtime moved since we last saw them; `recent` = all files modified at or after `since`. */
  async #changed(
    paths: string[],
    since: number,
  ): Promise<{ changed: string[]; recent: string[]; fresh: boolean }> {
    const changed: string[] = [];
    const recent: string[] = [];
    let fresh = false;
    for (const path of paths) {
      const key = this.#hash(path);
      if (this.#old.has(key)) continue;
      const mtime = await mtimeOf(path);
      if (mtime === undefined) continue;
      if (mtime < since) {
        this.#old.add(key);
        continue;
      }
      recent.push(path);
      const seen = this.#state.seen[key];
      if (seen === undefined) fresh = true;
      if (seen === undefined || mtime > seen) {
        changed.push(path);
        this.#state.seen[key] = mtime;
      }
    }
    return { changed, recent, fresh };
  }

  /** Paths modified at or after `since`; a cheap mtime filter, no file content read. */
  async #recent(paths: string[], since: number): Promise<string[]> {
    const out: string[] = [];
    for (const path of paths) {
      const mtime = await mtimeOf(path);
      if (mtime !== undefined && mtime >= since) out.push(path);
    }
    return out;
  }

  /** `codexPaths` and `chats` are reused from the caller's own scan, so nothing is listed twice. */
  async #rememberMtimes(codexPaths: string[], chats: string[]): Promise<void> {
    const paths = [...codexPaths, ...chats];
    for (const d of this.#dirs.opencodeDirs) {
      const db = await findDatabase(d);
      if (db) paths.push(db, `${db}-wal`);
    }
    for (const path of paths) {
      const mtime = await mtimeOf(path);
      if (mtime !== undefined) this.#state.seen[this.#hash(path)] = mtime;
    }
  }
}
