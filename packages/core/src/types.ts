export type Source = "claude-code" | "codex";

/** One model response's token usage. Field meanings: docs/DATA-SOURCES.md. */
export interface UsageEvent {
  source: Source;
  sessionId: string;
  parentSessionId?: string;
  agentId?: string;
  /** Epoch ms, UTC. */
  ts: number;
  model: string;
  isFallbackModel?: boolean;
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
  /** API message id; the sidechain rule in DATA-SOURCES §Dedupe matches on it alone. */
  messageId: string;
  dedupeKey: string;
  isSidechain?: boolean;
  /** Version of the tool that wrote the line. */
  version?: string;
}

export interface TokenSums {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

export interface Span {
  /** Epoch ms, UTC. */
  start: number;
  end: number;
}

export interface DailyTotals {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  byModel: Record<string, TokenSums>;
  bySource: Partial<Record<Source, TokenSums>>;
  calls: number;
  sessions: number;
  subagents: number;
  wordsTyped: number;
  firstCall: number;
  lastCall: number;
}

export interface SessionSummary {
  sessionId: string;
  start: number;
  end: number;
  calls: number;
  subagents: number;
  /** Longest run of activity without an idle gap over 1h. */
  longestStretch: Span;
}

export interface Totals {
  tokens: TokenSums;
  byModel: Record<string, TokenSums>;
  bySource: Partial<Record<Source, TokenSums>>;
  calls: number;
  sessions: number;
  activeDays: number;
  subagents: number;
  wordsTyped: number;
  firstCall: number | null;
  lastCall: number | null;
  longestSession: Span | null;
}
