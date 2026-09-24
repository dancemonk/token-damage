import type { UsageEvent } from "../../types.js";
import { countWords } from "../claude/parse.js";

/** Token counts as Codex writes them: input includes cached input, output includes reasoning. */
export interface RawUsage {
  input: number;
  cached: number;
  cacheWrite: number;
  output: number;
  reasoning: number;
  total: number;
}

/** Pricing tier set by `thread_settings_applied`; inherited by later usage in the rollout. */
export type ServiceTier = NonNullable<UsageEvent["serviceTier"]>;

/** What the first line (`session_meta`) says about a rollout. */
export interface RolloutMeta {
  sessionId?: string;
  /** `forked_from_id`, or the thread that spawned a subagent: the rollout may replay that thread's usage first. */
  replayParentId?: string;
  /** The session_meta line's timestamp, epoch ms: the parent's usage after it was never replayed. */
  forkedAt?: number;
  /** Spawned by another thread (subagent, auto-review); its prompts were written by that thread. */
  subagent: boolean;
  /** When `subagent`: its root session (`session_id`), else the thread that spawned it. */
  parentThreadId?: string;
  version?: string;
}

export type RolloutRecord =
  | {
      kind: "usage";
      /** Epoch ms, UTC. */
      ts: number;
      raw: RawUsage;
      model: string;
      isFallbackModel: boolean;
      serviceTier?: ServiceTier;
    }
  | {
      kind: "prompt";
      ts: number;
      words: number;
      /** `<turn_id>:<item id>`; undefined when the line lacks either. */
      key?: string;
    };

export interface CodexStats {
  files: number;
  lines: number;
  events: number;
  prompts: number;
  /** Not JSON, or a line without the timestamp it needs. */
  malformed: number;
  /** Usage copied from a parent thread's rollout, not counted again. */
  replayed: number;
  /** Usage with no recorded model, priced as gpt-5. */
  fallback: number;
  /** Usage events per Codex CLI version. */
  versions: Record<string, number>;
}

export function emptyCodexStats(): CodexStats {
  return {
    files: 0,
    lines: 0,
    events: 0,
    prompts: 0,
    malformed: 0,
    replayed: 0,
    fallback: 0,
    versions: {},
  };
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
const count = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined;

/** Epoch ms from an ISO string, or from epoch seconds/ms as a number. */
export function timestampOf(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0)
    return v > 10_000_000_000 ? v : v * 1000;
  const s = text(v);
  if (s === undefined) return undefined;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? undefined : ms;
}

// Cached input is part of input, and cache writes part of the uncached rest.
function normalize(u: RawUsage): RawUsage {
  const cached = Math.min(u.cached, u.input);
  return {
    ...u,
    cached,
    cacheWrite: Math.min(u.cacheWrite, u.input - cached),
  };
}

export function usageOf(v: unknown): RawUsage | undefined {
  if (!isObject(v)) return undefined;
  const input = count(v.input_tokens) ?? 0;
  const output = count(v.output_tokens) ?? 0;
  const total = count(v.total_tokens);
  return normalize({
    input,
    cached: count(v.cached_input_tokens) ?? 0,
    cacheWrite: count(v.cache_write_input_tokens) ?? 0,
    output,
    reasoning: count(v.reasoning_output_tokens) ?? 0,
    // Reasoning is part of output; a zero total is unusable, not an empty turn.
    total: total ? total : input + output,
  });
}

export const sameUsage = (a: RawUsage, b: RawUsage): boolean =>
  a.input === b.input &&
  a.cached === b.cached &&
  a.cacheWrite === b.cacheWrite &&
  a.output === b.output &&
  a.reasoning === b.reasoning &&
  a.total === b.total;

const minus = (a: number, b: number) => Math.max(0, a - b);

function subtract(current: RawUsage, previous: RawUsage | undefined): RawUsage {
  if (!previous) return current;
  return normalize({
    input: minus(current.input, previous.input),
    cached: minus(current.cached, previous.cached),
    cacheWrite: minus(current.cacheWrite, previous.cacheWrite),
    output: minus(current.output, previous.output),
    reasoning: minus(current.reasoning, previous.reasoning),
    total: minus(current.total, previous.total),
  });
}

const isEmpty = (u: RawUsage) =>
  u.input === 0 &&
  u.cached === 0 &&
  u.cacheWrite === 0 &&
  u.output === 0 &&
  u.reasoning === 0;

function modelOf(v: unknown): string | undefined {
  if (!isObject(v)) return undefined;
  return (
    text(v.model) ??
    text(v.model_name) ??
    (isObject(v.metadata) ? text(v.metadata.model) : undefined)
  );
}

function tierOf(value: string): ServiceTier | undefined {
  // Codex Desktop writes "standard" where the CLI writes "default"; "fast" is the legacy "priority".
  if (value === "default" || value === "standard") return "standard";
  if (value === "fast" || value === "priority") return "fast";
  return undefined;
}

// Codex routes `codex-auto-review` on the server and never logs the model it ran. ccusage 20.0.24's curated
// timeline, newest first: OpenAI moved it from GPT-5.4 to GPT-5.6 Luna on 2026-07-30.
const AUTO_REVIEW: [since: string, model: string][] = [
  ["2026-07-30", "gpt-5.6-luna"],
  ["2026-03-05", "gpt-5.4"],
  ["2026-02-05", "gpt-5.3-codex"],
  ["2025-12-11", "gpt-5.2-codex"],
  ["2025-11-13", "gpt-5.1-codex"],
  ["2025-09-15", "gpt-5-codex"],
];

/** The model an alias probably ran on at `ts` (UTC day), for pricing; undefined for a real model name. */
export function aliasModel(model: string, ts: number): string | undefined {
  if (model !== "codex-auto-review") return undefined;
  const day = new Date(ts).toISOString().slice(0, 10);
  return AUTO_REVIEW.find(([since]) => day >= since)?.[1] ?? "gpt-5";
}

/** Reads a rollout's first line. */
export function metaOf(line: string | undefined): RolloutMeta {
  let row: unknown;
  try {
    row = line === undefined ? undefined : JSON.parse(line);
  } catch {
    row = undefined;
  }
  if (!isObject(row) || row.type !== "session_meta" || !isObject(row.payload))
    return { subagent: false };
  const p = row.payload;
  const spawner =
    isObject(p.source) && isObject(p.source.subagent)
      ? p.source.subagent
      : undefined;
  const spawnedBy =
    spawner && isObject(spawner.thread_spawn)
      ? text(spawner.thread_spawn.parent_thread_id)
      : undefined;
  const subagent = spawner !== undefined;
  const id = text(p.id);
  // A subagent's session_id is its root session's; older builds repeat the thread's own id there.
  const root = text(p.session_id);
  return {
    sessionId: id ?? root,
    replayParentId: text(p.forked_from_id) ?? spawnedBy,
    forkedAt: timestampOf(row.timestamp),
    subagent,
    parentThreadId: subagent
      ? ((root !== id ? root : undefined) ??
        spawnedBy ??
        text(p.parent_thread_id))
      : undefined,
    version: text(p.cli_version),
  };
}

// Substrings every line we read contains; the rest (tool calls, reasoning, messages) is skipped unparsed.
const WANTED = [
  '"type":"token_count"',
  '"type":"turn_context"',
  '"type":"thread_settings_applied"',
  '"type":"UserMessage"',
];

/**
 * Usage and prompts in one rollout, in file order, before replay filtering.
 * Per-response usage is `last_token_usage` while the cumulative total advances, otherwise the total's delta:
 * a repeated `token_count` adds nothing. Streaming `token_usage_record` lines are never read.
 */
export async function* readRollout(
  lines: AsyncIterable<string>,
  stats: CodexStats,
): AsyncGenerator<RolloutRecord> {
  let previousTotal: RawUsage | undefined;
  let model: string | undefined;
  let modelIsFallback = false;
  let serviceTier: ServiceTier | undefined;
  for await (const line of lines) {
    stats.lines++;
    if (!WANTED.some((s) => line.includes(s))) continue;
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      stats.malformed++;
      continue;
    }
    if (!isObject(row) || !isObject(row.payload)) continue;
    const payload = row.payload;
    if (row.type === "turn_context") {
      const recorded = modelOf(payload);
      if (recorded) {
        model = recorded;
        modelIsFallback = false;
      }
      continue;
    }
    if (row.type !== "event_msg") continue;
    const ts = timestampOf(row.timestamp);
    if (ts === undefined) {
      stats.malformed++;
      continue;
    }

    if (payload.type === "thread_settings_applied") {
      // No tier key keeps the previous tier; an unknown tier clears it.
      const settings = payload.thread_settings;
      if (isObject(settings) && typeof settings.service_tier === "string")
        serviceTier = tierOf(settings.service_tier);
      continue;
    }

    if (payload.type === "item_completed") {
      const item = payload.item;
      if (!isObject(item) || item.type !== "UserMessage") continue;
      let words = 0;
      for (const part of Array.isArray(item.content) ? item.content : [])
        if (
          isObject(part) &&
          part.type === "text" &&
          typeof part.text === "string"
        )
          words += countWords(part.text);
      const turn = text(payload.turn_id);
      const id = text(item.id);
      yield {
        kind: "prompt",
        ts,
        words,
        key: turn && id ? `${turn}:${id}` : undefined,
      };
      continue;
    }

    if (payload.type !== "token_count") continue;
    const info = isObject(payload.info) ? payload.info : undefined;
    const total = usageOf(info?.total_token_usage);
    const advanced =
      !total || !previousTotal || !sameUsage(previousTotal, total);
    const raw =
      (advanced ? usageOf(info?.last_token_usage) : undefined) ??
      (total ? subtract(total, previousTotal) : undefined);
    if (total) previousTotal = total;
    if (!raw || isEmpty(raw)) continue;

    const recorded = modelOf(payload) ?? modelOf(info);
    if (recorded) {
      model = recorded;
      modelIsFallback = false;
    } else if (!model) {
      model = "gpt-5";
      modelIsFallback = true;
    }
    yield {
      kind: "usage",
      ts,
      raw,
      model,
      isFallbackModel: modelIsFallback,
      serviceTier,
    };
  }
}

/** Gap under which two usage events at the head of a rollout were written as one replayed burst. */
const BURST_MS = 1000;

/**
 * Start of the replayed burst at the head of a rollout: its first two usage lines written within a second.
 * A thread that recorded its own turns pauses between them.
 */
export async function burstStart(
  lines: AsyncIterable<string>,
): Promise<number | undefined> {
  let first: number | undefined;
  for await (const line of lines) {
    if (!line.includes('"type":"token_count"')) continue;
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      !isObject(row) ||
      row.type !== "event_msg" ||
      !isObject(row.payload) ||
      row.payload.type !== "token_count" ||
      !isObject(row.payload.info)
    )
      continue;
    const info = row.payload.info;
    if (!isObject(info.last_token_usage) && !isObject(info.total_token_usage))
      continue;
    const ts = timestampOf(row.timestamp);
    if (ts === undefined) continue;
    if (first === undefined) first = ts;
    else return ts - first >= 0 && ts - first <= BURST_MS ? first : undefined;
  }
  return undefined;
}

/**
 * Drops the usage a forked or spawned thread copied from its parent (DATA-SOURCES §Codex, trap 5).
 * `prefix` is the parent's usage up to the fork, undefined for a rollout that is not a fork. Copies are matched
 * in order; when the first event does not match (parent log gone, or history rewritten), a burst of usage
 * written within a second at the head of the file is the copy instead.
 */
export async function* dropReplay(
  records: AsyncIterable<RolloutRecord>,
  prefix: RawUsage[] | undefined,
  burst: () => Promise<number | undefined>,
  stats: CodexStats,
): AsyncGenerator<RolloutRecord> {
  type State =
    | { kind: "matching"; index: number }
    | { kind: "burst"; last: number }
    | { kind: "done" };
  let state: State = prefix ? { kind: "matching", index: 0 } : { kind: "done" };
  for await (const record of records) {
    if (record.kind !== "usage") {
      yield record;
      continue;
    }
    let replayed = false;
    for (;;) {
      if (state.kind === "matching") {
        const copied = prefix?.[state.index];
        if (copied && sameUsage(copied, record.raw)) {
          state = { kind: "matching", index: state.index + 1 };
          replayed = true;
          break;
        }
        const start: number | undefined =
          state.index === 0 ? await burst() : undefined;
        state =
          start === undefined
            ? { kind: "done" }
            : { kind: "burst", last: start };
        continue;
      }
      if (state.kind === "burst") {
        const gap = record.ts - state.last;
        if (gap >= 0 && gap <= BURST_MS) {
          state = { kind: "burst", last: record.ts };
          replayed = true;
          break;
        }
        state = { kind: "done" };
        continue;
      }
      break;
    }
    if (replayed) stats.replayed++;
    else yield record;
  }
}
