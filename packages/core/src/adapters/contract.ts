import type { PromptEvent, Source, UsageEvent } from "../types.js";

/** Each agent's roots: config dirs, homes or data dirs, as its adapter understands them. */
export type SourceDirs = Record<Source, string[]>;

/** One pass over one agent's logs, with its own counters. Make a new one per scan. */
export interface Reader {
  /** Every record under the roots, or only from `only` (live polling). Not deduped. */
  scan(only?: string[]): AsyncIterable<UsageEvent | PromptEvent>;
  /** Log files or databases read so far; 0 after a scan means this agent left nothing here. */
  found(): number;
  /** Lines for the user after a scan, e.g. a database skipped on an old Node. Empty when all went well. */
  warnings(): string[];
}

/** How the live pane notices new records for an agent it does not tail. */
export interface LiveReading {
  /** Files whose mtime moves when the agent writes. */
  files(roots: string[]): Promise<string[]>;
  /**
   * How long before today's midnight a file may have last changed and still hold today's records (Codex fork
   * parents: 2 days). `null`: any age, and every scan reads everything (a database).
   */
  lookbackMs: number | null;
  /** A newly seen file forces a full reconcile: a Codex fork can copy older usage into today. */
  newFileForcesReconcile: boolean;
}

export interface Adapter {
  id: Source;
  /** `--<flag> <path>` replaces the roots. */
  flag: string;
  /** The flag's line in `--help`. */
  help: string;
  /** This agent's place in a `--fixtures` corpus, relative to its root ("" = the root itself). */
  fixtureDir: string;
  /** The environment variable that replaces the default roots; ccusage reads the same one. */
  env: string;
  roots(env: Record<string, string | undefined>, home: string): string[];
  /** What a scan of these roots reads: the receipt's "scanning …" line and the directories `live` watches. */
  where(roots: string[]): string[];
  reader(roots: string[]): Reader;
  /** "tail": the live pane reads appended lines (Claude Code). Otherwise it rescans today when files change. */
  live: "tail" | LiveReading;
  /** Newest major.minor with fixtures (docs/DATA-SOURCES.md §Tested versions); absent when logs carry no version. */
  tested?: [number, number];
  /**
   * `ccusage <command> daily` is the second opinion (scripts/oracle.mjs); fixtures live in
   * `fixtures/<command>/<fixtureDir>`. `foldTotal`: ccusage's output leaves out reasoning, which only its
   * totalTokens has, so the oracle adds the difference to output.
   */
  oracle: { command: string; foldTotal: boolean };
}
