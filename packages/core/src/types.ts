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
