import { countWords } from "../claude/parse.js";

/** Token counts as Gemini CLI writes them: the API's `usageMetadata`, renamed. */
export interface GeminiTokens {
  /** `promptTokenCount`: includes cached input when `total` says so. */
  input: number;
  output: number;
  cached: number;
  /** Thinking tokens, billed as output. */
  thoughts: number;
  /** `toolUsePromptTokenCount`, billed as input. */
  tool: number;
  total?: number;
}

/** One response's usage: fresh input (tool-use prompt included), cache reads, output (thinking included). */
export interface GeminiUsage {
  input: number;
  cacheRead: number;
  output: number;
}

export type ChatRecord =
  | {
      kind: "usage";
      sessionId: string;
      /** Epoch ms, UTC. */
      ts: number;
      model: string;
      usage: GeminiUsage;
      id?: string;
    }
  | {
      kind: "prompt";
      sessionId: string;
      ts: number;
      words: number;
      id?: string;
    };

export interface GeminiStats {
  files: number;
  lines: number;
  events: number;
  prompts: number;
  /** Not JSON. */
  malformed: number;
  /** Responses written again under the same id once their tokens arrived; only the last copy counts. */
  rewritten: number;
}

export function emptyGeminiStats(): GeminiStats {
  return {
    files: 0,
    lines: 0,
    events: 0,
    prompts: 0,
    malformed: 0,
    rewritten: 0,
  };
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const text = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v : undefined;

// Any finite JSON number; negatives count as 0 and fractions are truncated. Strings do not count.
const count = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.trunc(Math.max(0, v))
    : undefined;

function timestamp(v: unknown): number | undefined {
  if (typeof v !== "string") return undefined;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : undefined;
}

const ALIASES = {
  input: ["input", "prompt", "input_tokens", "prompt_tokens"],
  output: ["output", "candidates", "output_tokens", "candidates_tokens"],
  cached: ["cached", "cached_tokens"],
  thoughts: ["thoughts", "reasoning", "thoughts_tokens", "reasoning_tokens"],
  tool: ["tool", "tool_tokens"],
} as const;

/** The `tokens` object of a response, under any of the key names ccusage accepts. */
export function tokensOf(value: unknown): GeminiTokens | undefined {
  if (!isObject(value)) return undefined;
  const first = (keys: readonly string[]) => {
    for (const key of keys) {
      const n = count(value[key]);
      if (n !== undefined) return n;
    }
    return 0;
  };
  // A `total` key of any kind hides `total_tokens`.
  const total = count("total" in value ? value.total : value.total_tokens);
  return {
    input: first(ALIASES.input),
    output: first(ALIASES.output),
    cached: first(ALIASES.cached),
    thoughts: first(ALIASES.thoughts),
    tool: first(ALIASES.tool),
    ...(total !== undefined && { total }),
  };
}

/**
 * Per-response usage (DATA-SOURCES §Gemini CLI). Cached input is inside `input` when the total says so.
 * Tokens the total has and the fields lack become output when there is none, else thinking.
 * Undefined when the response used nothing.
 */
export function usageOf(t: GeminiTokens): GeminiUsage | undefined {
  const inclusive = t.input + t.output + t.thoughts + t.tool;
  const fresh =
    t.cached > 0 && t.total === inclusive
      ? t.input - Math.min(t.input, t.cached)
      : t.input;
  const input = fresh + t.tool;
  let output = t.output;
  let thoughts = t.thoughts;
  const known = input + output + t.cached + thoughts;
  const missing = Math.max(0, (t.total ?? known) - known);
  if (missing > 0) {
    if (output === 0) output = missing;
    else thoughts += missing;
  }
  if (input + output + t.cached + thoughts === 0) return undefined;
  return { input, cacheRead: t.cached, output: output + thoughts };
}

/** Words the user typed: what they saw (`displayContent`) when it differs from what was sent. */
function typedWords(message: Json): number | undefined {
  const parts = message.displayContent ?? message.content;
  if (typeof parts === "string") return countWords(parts);
  if (!Array.isArray(parts)) return undefined;
  let words: number | undefined;
  for (const part of parts)
    if (isObject(part) && typeof part.text === "string")
      words = (words ?? 0) + countWords(part.text);
  // Only tool results: the agent's turn, not the user's.
  return words;
}

function usageRecord(
  message: Json,
  model: string | undefined,
  sessionId: string,
  fallbackTs: number,
): ChatRecord | undefined {
  const tokens = tokensOf(message.tokens);
  const name = text(message.model) ?? model;
  if (!tokens || !name) return undefined;
  const usage = usageOf(tokens);
  if (!usage) return undefined;
  const id = text(message.id);
  return {
    kind: "usage",
    sessionId,
    ts:
      timestamp(message.timestamp) ??
      timestamp(message.created_at) ??
      fallbackTs,
    model: name,
    usage,
    ...(id && { id }),
  };
}

function promptRecord(
  message: Json,
  sessionId: string,
  fallbackTs: number,
): ChatRecord | undefined {
  const words = typedWords(message);
  if (words === undefined) return undefined;
  const id = text(message.id);
  return {
    kind: "prompt",
    sessionId,
    ts: timestamp(message.timestamp) ?? fallbackTs,
    words,
    ...(id && { id }),
  };
}

export interface Chat {
  records: ChatRecord[];
  /** The header said `kind: "subagent"`. */
  subagent: boolean;
}

/**
 * A JSONL chat (Gemini CLI ≥ 0.3x): a header with `sessionId`, then one line per message, `$set` metadata
 * updates in between. A response is written again under the same id when its tokens arrive; the last copy
 * replaces the first in place. The session id and model carry forward to later lines.
 */
export async function readJsonlChat(
  lines: AsyncIterable<string>,
  fileStem: string,
  fallbackTs: number,
  stats: GeminiStats,
): Promise<Chat> {
  let sessionId = fileStem;
  let model: string | undefined;
  let subagent = false;
  const records: ChatRecord[] = [];
  const at = new Map<string, number>();
  for await (const line of lines) {
    stats.lines++;
    if (!line.trim()) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      stats.malformed++;
      continue;
    }
    if (!isObject(record)) continue;
    sessionId = text(record.sessionId) ?? text(record.session_id) ?? sessionId;
    if (record.kind === "subagent") subagent = true;
    model = text(record.model) ?? model;
    const next =
      record.type === "gemini"
        ? usageRecord(record, model, sessionId, fallbackTs)
        : record.type === "user"
          ? promptRecord(record, sessionId, fallbackTs)
          : undefined;
    if (!next) continue;
    const key = next.id && `${next.kind}|${next.id}`;
    const seen = key ? at.get(key) : undefined;
    if (seen !== undefined) {
      records[seen] = next;
      stats.rewritten++;
    } else {
      if (key) at.set(key, records.length);
      records.push(next);
    }
  }
  return { records, subagent };
}

/**
 * A whole-file JSON chat (older Gemini CLI): `sessionId`, `startTime`, `messages[]`. A message without a
 * timestamp gets the session's start. A file that is one response on its own is read too.
 */
export function readJsonChat(
  content: string,
  fileStem: string,
  fallbackTs: number,
  stats: GeminiStats,
): Chat {
  stats.lines++;
  let doc: unknown;
  try {
    doc = JSON.parse(content);
  } catch {
    stats.malformed++;
    return { records: [], subagent: false };
  }
  if (!isObject(doc)) return { records: [], subagent: false };
  const sessionId = text(doc.sessionId) ?? text(doc.session_id) ?? fileStem;
  const subagent = doc.kind === "subagent";
  if (Array.isArray(doc.messages)) {
    const start =
      timestamp(doc.startTime) ?? timestamp(doc.lastUpdated) ?? fallbackTs;
    const records: ChatRecord[] = [];
    for (const message of doc.messages) {
      if (!isObject(message)) continue;
      const record =
        message.type === "gemini"
          ? usageRecord(message, undefined, sessionId, start)
          : message.type === "user"
            ? promptRecord(message, sessionId, start)
            : undefined;
      if (record) records.push(record);
    }
    return { records, subagent };
  }
  const single =
    doc.type === "gemini"
      ? usageRecord(doc, undefined, sessionId, fallbackTs)
      : undefined;
  return { records: single ? [single] : [], subagent };
}
