import type { PromptEvent, UsageEvent } from "../../types.js";
import { countWords } from "../claude/parse.js";
import { modelName } from "../names.js";

type Json = Record<string, unknown>;

/** What a session's `summary.json` adds: its id and the model a turn without per-model usage ran on. */
export interface SessionMeta {
  /** The session directory's name: keys a turn that has no event id, as ccusage dedupes those per file. */
  fileKey: string;
  sessionId: string;
  defaultModel?: string;
}

const obj = (v: unknown): Json | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Json)
    : undefined;
const text = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v : undefined;
// Grok writes counts as numbers; ccusage also accepts digit strings.
const count = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0
    ? Math.floor(v)
    : typeof v === "string" && /^\d+$/.test(v)
      ? Number(v)
      : 0;

/** A raw Grok model id as the price table names it: the `[grok] ` prefix and Grok Build's `-build` alias dropped. */
export function grokModel(raw: string): string | undefined {
  return modelName(
    raw
      .replace(/^\[grok\]\s*/, "")
      .trim()
      .replace(/-build$/, ""),
  );
}

export function summaryMeta(
  json: string | undefined,
  fileKey: string,
): SessionMeta {
  let summary: Json | undefined;
  try {
    summary = json === undefined ? undefined : obj(JSON.parse(json));
  } catch {
    summary = undefined;
  }
  const defaultModel = text(summary?.current_model_id);
  return {
    fileKey,
    sessionId: text(obj(summary?.info)?.id) ?? fileKey,
    ...(defaultModel !== undefined && { defaultModel }),
  };
}

/** When a line happened: `_meta.agentTimestampMs`, else the envelope's `timestamp` (Unix seconds). */
function lineTs(line: Json): number {
  const ms = count(obj(obj(line.params)?._meta)?.agentTimestampMs);
  if (ms > 0) return ms;
  return count(line.timestamp) * 1000;
}

/**
 * A completed turn's usage, one event per model (sorted by name), else one for the session's model. Grok records a
 * turn, not a request: `calls` carries its model calls. Input includes cache reads; output includes reasoning.
 */
export function turnEvents(line: Json, meta: SessionMeta): UsageEvent[] {
  const params = obj(line.params);
  const update = obj(params?.update);
  if (update?.sessionUpdate !== "turn_completed") return [];
  const usage = obj(update.usage);
  if (!usage) return [];
  const eventId = text(obj(params?._meta)?.eventId);
  const ts = lineTs(line);
  const sessionId = text(params?.sessionId) ?? meta.sessionId;
  const perModel = obj(usage.modelUsage);
  const rows: [string, Json][] = [];
  if (perModel && Object.keys(perModel).length > 0) {
    for (const [raw, u] of Object.entries(perModel)) {
      const o = obj(u);
      if (o) rows.push([raw, o]);
    }
    rows.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  } else rows.push([meta.defaultModel ?? "unknown", usage]);
  const out: UsageEvent[] = [];
  for (const [raw, u] of rows) {
    const input = count(u.inputTokens);
    const cacheRead = Math.min(count(u.cachedReadTokens), input);
    const uncached = input - cacheRead;
    const cacheWrite = Math.min(count(u.cacheCreationTokens), uncached);
    const fresh = uncached - cacheWrite;
    const output = count(u.outputTokens);
    const reasoning = count(u.reasoningTokens);
    if (fresh + cacheRead + cacheWrite + output + reasoning === 0) continue;
    const key = eventId
      ? `${eventId}|${raw}`
      : `${meta.fileKey}|${sessionId}|${ts}|${raw}|${fresh}|${output}|${cacheRead}|${cacheWrite}|${reasoning}`;
    out.push({
      kind: "usage",
      source: "grok",
      sessionId,
      ts,
      model: grokModel(raw) ?? "unknown",
      input: fresh,
      cacheWrite,
      cacheWrite1h: 0,
      cacheRead,
      output,
      calls: Math.max(1, count(u.modelCalls)),
      messageId: key,
      dedupeKey: `grok:${key}`,
    });
  }
  return out;
}

// Lines that show the agent working: they end a run of user chunks. Hooks and the like do not.
const AGENT_LINE = /^(agent_|tool_call|turn_completed)/;

/** Runs of `user_message_chunk` text lines as prompts: one per run, words summed, timed by its first chunk. */
export function promptRuns(lines: Json[], meta: SessionMeta): PromptEvent[] {
  const out: PromptEvent[] = [];
  let run: PromptEvent | undefined;
  for (const line of lines) {
    const params = obj(line.params);
    const update = obj(params?.update);
    const kind = update?.sessionUpdate;
    if (kind === "user_message_chunk") {
      const content = obj(update?.content);
      if (content?.type !== "text" || typeof content.text !== "string")
        continue;
      const words = countWords(content.text);
      if (run) run.words += words;
      else {
        const sessionId = text(params?.sessionId) ?? meta.sessionId;
        const ts = lineTs(line);
        const id = text(obj(params?._meta)?.eventId) ?? String(ts);
        run = {
          kind: "prompt",
          source: "grok",
          sessionId,
          ts,
          words,
          dedupeKey: `grok:${sessionId}:${id}`,
        };
        out.push(run);
      }
      continue;
    }
    if (typeof kind === "string" && AGENT_LINE.test(kind)) run = undefined;
  }
  return out;
}
