import { countWords } from "../claude/parse.js";

// OpenCode message payloads, read the way ccusage 20.0.24 reads them (`rust/adapters/opencode/src/parser.rs`).

export interface OpenCodeStats {
  /** SQLite databases opened, one per data dir at most. */
  databases: number;
  /** Legacy `storage/message/**.json` files read. */
  files: number;
  events: number;
  prompts: number;
  /** Databases or files that could not be opened or queried. */
  unreadable: number;
  /** Rows or files whose id was already counted. */
  duplicates: number;
  /** Databases skipped because this Node has no `node:sqlite` (before 22.13). */
  noSqlite: number;
}

export function emptyOpenCodeStats(): OpenCodeStats {
  return {
    databases: 0,
    files: 0,
    events: 0,
    prompts: 0,
    unreadable: 0,
    duplicates: 0,
    noSqlite: 0,
  };
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// ccusage's lenient readers: a non-negative integer, else 0; an integer, else undefined; a trimmed
// non-empty string, else undefined.
const u64 = (v: unknown): number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : 0;
const i64 = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isSafeInteger(v) ? v : undefined;
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;

/** A JSON object, or undefined for anything else (a payload ccusage cannot deserialize). */
export function parseObject(data: string): Json | undefined {
  try {
    const value: unknown = JSON.parse(data);
    return isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** `time.created` when it is a positive integer (Unix ms). */
export function createdAt(message: Json): number | undefined {
  const time = message.time;
  const created = isObject(time) ? i64(time.created) : undefined;
  return created !== undefined && created > 0 ? created : undefined;
}

// Routing names OpenCode providers use for models with a public name (ccusage `resolve_open_code_model_name`).
const ALIASES: Record<string, string> = {
  "gemini-3-pro-high": "gemini-3-pro-preview",
  k2p6: "kimi-k2.6",
};
const CLAUDE = ["claude-haiku-", "claude-opus-", "claude-sonnet-"];

/**
 * The model name prices and rows use: without a gateway's vendor prefix ("anthropic/claude-sonnet-4.5"),
 * with Claude's dotted versions spelled as Anthropic does ("claude-sonnet-4.5" and "claude-sonnet-45" →
 * "claude-sonnet-4-5", ccusage `normalize_open_code_model_name`).
 */
export function modelName(modelId: string): string {
  const bare = modelId.slice(modelId.lastIndexOf("/") + 1) || modelId;
  const model = ALIASES[bare] ?? bare;
  const family = CLAUDE.find((f) => model.startsWith(f));
  if (!family) return model;
  const rest = model.slice(family.length);
  const dot = rest.indexOf(".");
  if (dot !== -1) {
    const major = rest.slice(0, dot);
    const minor = rest.slice(dot + 1);
    if (/^\d*$/.test(major) && /^\d/.test(minor))
      return `${family}${major}-${minor}`;
  }
  return /^\d\d/.test(rest) ? `${family}${rest[0]}-${rest.slice(1)}` : model;
}

export interface OpenCodeUsage {
  model: string;
  provider: string;
  /** Unix ms from the payload; undefined when it has none. */
  ts?: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  /** Output plus reasoning plus whatever only `total` counts: all billed as output. */
  output: number;
}

/**
 * Tokens of one assistant message (`tokens`, `modelID`, `providerID`), or undefined when ccusage would not
 * count it: no `tokens` object, no model or provider, or no tokens at all.
 */
export function usageOf(
  message: Json,
  model = str(message.modelID),
  provider = str(message.providerID),
): OpenCodeUsage | undefined {
  const tokens = message.tokens;
  if (!isObject(tokens)) return undefined;
  const cache = isObject(tokens.cache) ? tokens.cache : {};
  const input = u64(tokens.input);
  const output = u64(tokens.output);
  const reasoning = u64(tokens.reasoning);
  const cacheRead = u64(cache.read);
  const cacheWrite = u64(cache.write);
  const known = input + output + reasoning + cacheRead + cacheWrite;
  // Tokens only `total` has: ccusage bills them as output (`apply_total_token_fallback`).
  const missing = Math.max(0, u64(tokens.total) - known);
  if (known + missing === 0) return undefined;
  if (model === undefined || provider === undefined) return undefined;
  return {
    model: modelName(model),
    provider,
    ts: createdAt(message),
    input,
    cacheRead,
    cacheWrite,
    output: output + reasoning + missing,
  };
}

/** A `session_message` row's payload (OpenCode v2): the model sits in `model: {id, providerID}`. */
export function v2UsageOf(message: Json): OpenCodeUsage | undefined {
  const ref = isObject(message.model) ? message.model : {};
  return usageOf(
    message,
    str(ref.id) ?? str(ref.modelID) ?? str(message.modelID),
    str(ref.providerID) ?? str(message.providerID),
  );
}

/** Words the user typed in one part of a user message; undefined for anything OpenCode wrote itself. */
export function partWords(part: Json): number | undefined {
  if (part.type !== "text" || part.synthetic === true || part.ignored === true)
    return undefined;
  return typeof part.text === "string" ? countWords(part.text) : undefined;
}
