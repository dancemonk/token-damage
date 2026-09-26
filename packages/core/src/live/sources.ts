import { stat } from "node:fs/promises";
import { findTranscripts, subagentOf } from "../adapters/claude/discover.js";
import { parseLine } from "../adapters/claude/parse.js";
import type { SourceDirs } from "../adapters/contract.js";
import { ADAPTERS } from "../adapters/registry.js";
import type { PromptEvent, Source, UsageEvent } from "../types.js";
import { readAppended, type TailState } from "./tail.js";

export type LiveRecord = UsageEvent | PromptEvent;
export type { SourceDirs };

// Every agent but Claude Code, whose transcripts are tailed: rescanned for today when one of its files moves.
const POOLED = ADAPTERS.flatMap((adapter) =>
  adapter.live === "tail" ? [] : [{ adapter, live: adapter.live }],
);

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

/** Today's records from every agent: a full scan, or only what changed since the last poll. */
export class LiveSources {
  #dirs: SourceDirs;
  #from: number;
  #hash: (path: string) => string;
  #state: SourcesState;
  #old: Set<string>;
  // The latest scan's warnings per agent, e.g. OpenCode's database skipped on an old Node.
  #warnings = new Map<Source, string[]>();

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

  /** Lines for the user from each agent's latest scan. */
  warnings(): string[] {
    return [...this.#warnings.values()].flat();
  }

  watchRoots(): string[] {
    return ADAPTERS.flatMap((a) => a.where(this.#dirs[a.id]));
  }

  /** The snapshot path: every record in the window, through the same scanners the receipt uses. */
  async scanAll(): Promise<LiveRecord[]> {
    const out: LiveRecord[] = [];
    const keep = (r: LiveRecord) => r.ts >= this.#from && out.push(r);

    // Claude: a file whose mtime predates the window cannot hold a today record; remember it as old,
    // exactly as poll() would once it noticed. Every other file is read in full and becomes a tail so
    // the next poll continues from its end.
    for (const file of await findTranscripts(this.#dirs["claude-code"])) {
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

    // The rest: only files recent enough to hold today's records (or a Codex fork parent of one); `keep` still
    // filters every record by timestamp, `only` just limits which files a scan opens. Every file found is
    // remembered, so the next poll rescans an agent only when one of its files moves.
    for (const { adapter, live } of POOLED) {
      const roots = this.#dirs[adapter.id];
      const files = await live.files(roots);
      const only =
        live.lookbackMs === null
          ? undefined
          : await this.#recent(files, this.#from - live.lookbackMs);
      const reader = adapter.reader(roots);
      for await (const r of reader.scan(only)) keep(r);
      this.#warnings.set(adapter.id, reader.warnings());
      await this.#remember(files);
    }
    return out;
  }

  /**
   * The delta path: Claude tails accumulate; an agent whose files changed is rescanned whole for today.
   * `newFiles` is true only for a newly seen file of an agent whose adapter asks for it (Codex) — a fork
   * parent can already hold today's usage, which is why the engine forces a full reconcile on it. A new Claude transcript already
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

    for (const file of await findTranscripts(this.#dirs["claude-code"])) {
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

    for (const { adapter, live } of POOLED) {
      const roots = this.#dirs[adapter.id];
      const found = await this.#changed(
        await live.files(roots),
        live.lookbackMs === null ? 0 : this.#from - live.lookbackMs,
      );
      if (!found.changed.length) continue;
      if (live.newFileForcesReconcile) newFiles ||= found.fresh;
      // Every recent file, not only the changed ones, so fork parents are present and the pool is complete.
      const reader = adapter.reader(roots);
      const pool: LiveRecord[] = [];
      for await (const r of reader.scan(
        live.lookbackMs === null ? undefined : found.recent,
      ))
        if (today(r)) pool.push(r);
      this.#warnings.set(adapter.id, reader.warnings());
      pools[adapter.id] = pool;
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

  /** Each file's mtime now, so the next poll sees only what moved after this scan. */
  async #remember(paths: string[]): Promise<void> {
    for (const path of paths) {
      const mtime = await mtimeOf(path);
      if (mtime !== undefined) this.#state.seen[this.#hash(path)] = mtime;
    }
  }
}
