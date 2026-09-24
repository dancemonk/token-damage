export type Source = "claude-code" | "codex";

/** Truth tiers (docs/METRICS.md): plain, ≡, ≈ (always a range), ✶ (always red, always "made up"). */
export type Tier = "measured" | "priced" | "estimated" | "satire";

export interface Value<T = number> {
  value: T;
  tier: Tier;
  low?: number;
  high?: number;
  note?: string;
}

/** One model response's token usage. Field meanings: docs/DATA-SOURCES.md. */
export interface UsageEvent {
  kind: "usage";
  source: Source;
  sessionId: string;
  parentSessionId?: string;
  agentId?: string;
  /** Epoch ms, UTC. */
  ts: number;
  model: string;
  isFallbackModel?: boolean;
  /** The model whose price applies when `model` is a routing alias (Codex `codex-auto-review`); a guess. */
  priceAs?: string;
  input: number;
  cacheWrite: number;
  /** Part of cacheWrite written with the 1-hour TTL, priced at 2x input instead of 1.25x. */
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
  /** API message id; the sidechain rule in DATA-SOURCES §Dedupe matches on it alone. */
  messageId: string;
  dedupeKey: string;
  isSidechain?: boolean;
  /** Codex pricing tier ("fast" = priority), when the rollout recorded one. */
  serviceTier?: "standard" | "fast";
  /** Version of the tool that wrote the line. */
  version?: string;
}

/** A prompt the user wrote. Only its word count survives ingest; the text is never kept. */
export interface PromptEvent {
  kind: "prompt";
  source: Source;
  sessionId: string;
  /** Epoch ms, UTC. */
  ts: number;
  words: number;
  /** The line's uuid: resumed sessions copy earlier prompts into new files. */
  dedupeKey: string;
}

export interface TokenSums {
  input: number;
  cacheWrite: number;
  cacheWrite1h: number;
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
  prompts: number;
  wordsTyped: number;
  /** Null on a day with prompts but no model call. */
  firstCall: number | null;
  lastCall: number | null;
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
  prompts: number;
  wordsTyped: number;
  firstCall: number | null;
  lastCall: number | null;
  longestSession: Span | null;
}
