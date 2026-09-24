import type { UsageEvent } from "../../types.js";

/** Subagent transcripts are attributed to the session that spawned them. */
export interface SubagentRef {
  parentSessionId: string;
  agentId: string;
}

export interface ParseStats {
  lines: number;
  events: number;
  /** Not JSON, or a usage line without the message id, session or timestamp it needs. */
  malformed: number;
  synthetic: number;
  /** Usage lines per Claude Code version. */
  versions: Record<string, number>;
}

export type LineResult =
  | { kind: "events"; events: UsageEvent[] }
  | { kind: "skipped" }
  | { kind: "synthetic" }
  | { kind: "malformed" };

type Json = Record<string, unknown>;

const SKIPPED: LineResult = { kind: "skipped" };
const SYNTHETIC: LineResult = { kind: "synthetic" };
const MALFORMED: LineResult = { kind: "malformed" };

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string | undefined =>
  typeof v === "string" && v !== "" ? v : undefined;
const count = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;

function tokens(
  usage: Json,
): Pick<UsageEvent, "input" | "cacheWrite" | "cacheRead" | "output"> {
  return {
    input: count(usage.input_tokens),
    cacheWrite: count(usage.cache_creation_input_tokens),
    cacheRead: count(usage.cache_read_input_tokens),
    output: count(usage.output_tokens),
  };
}

export function emptyStats(): ParseStats {
  return { lines: 0, events: 0, malformed: 0, synthetic: 0, versions: {} };
}

/** One transcript line → usage events (the response, plus one per advisor iteration). */
export function parseLine(line: string, subagent?: SubagentRef): LineResult {
  // Most lines are prompts, tool results and attachments; skip them without parsing.
  if (!line.includes('"usage"')) return SKIPPED;
  let row: unknown;
  try {
    row = JSON.parse(line);
  } catch {
    return MALFORMED;
  }
  if (!isObject(row) || row.type !== "assistant") return SKIPPED;
  const message = row.message;
  if (!isObject(message) || !isObject(message.usage)) return SKIPPED;
  const usage = message.usage;

  const model = text(message.model) ?? "unknown";
  if (model === "<synthetic>") return SYNTHETIC;

  const messageId = text(message.id);
  const sessionId = text(row.sessionId) ?? subagent?.parentSessionId;
  const ts = Date.parse(text(row.timestamp) ?? "");
  if (!messageId || !sessionId || Number.isNaN(ts)) return MALFORMED;

  const requestId = text(row.requestId);
  // Without a requestId, gateways can reuse message ids across sessions: keep sessions apart.
  const dedupeKey = requestId
    ? `${messageId}|${requestId}`
    : `${messageId}|session:${sessionId}`;
  const agentId = text(row.agentId) ?? subagent?.agentId;
  const version = text(row.version);
  const shared = {
    source: "claude-code" as const,
    sessionId,
    ...(subagent && { parentSessionId: subagent.parentSessionId }),
    ...(agentId && { agentId }),
    ts,
    messageId,
    ...(row.isSidechain === true && { isSidechain: true }),
    ...(version && { version }),
  };

  const events: UsageEvent[] = [
    { ...shared, model, dedupeKey, ...tokens(usage) },
  ];
  // Advisor iterations are billed under their own model on top of the response;
  // other iteration types are already inside the top-level usage.
  const iterations = Array.isArray(usage.iterations) ? usage.iterations : [];
  iterations.forEach((iteration: unknown, i) => {
    if (!isObject(iteration) || iteration.type !== "advisor_message") return;
    events.push({
      ...shared,
      model: text(iteration.model) ?? text(row.advisorModel) ?? "unknown",
      dedupeKey: `${dedupeKey}|advisor:${i}`,
      ...tokens(iteration),
    });
  });
  return { kind: "events", events };
}

/** Streams events from transcript lines, one line in memory at a time. */
export async function* parseLines(
  lines: AsyncIterable<string>,
  stats: ParseStats,
  subagent?: SubagentRef,
): AsyncGenerator<UsageEvent> {
  for await (const line of lines) {
    stats.lines++;
    const result = parseLine(line, subagent);
    if (result.kind === "malformed") stats.malformed++;
    else if (result.kind === "synthetic") stats.synthetic++;
    else if (result.kind === "events") {
      const version = result.events[0]?.version ?? "unknown";
      stats.versions[version] = (stats.versions[version] ?? 0) + 1;
      stats.events += result.events.length;
      yield* result.events;
    }
  }
}
