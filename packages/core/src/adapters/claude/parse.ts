import type { PromptEvent, UsageEvent } from "../../types.js";

/** Subagent transcripts are attributed to the session that spawned them. */
export interface SubagentRef {
  parentSessionId: string;
  agentId: string;
}

export interface ParseStats {
  lines: number;
  events: number;
  prompts: number;
  /** Not JSON, or a usage line without the message id, session or timestamp it needs. */
  malformed: number;
  synthetic: number;
  /** Usage lines per Claude Code version. */
  versions: Record<string, number>;
}

export type LineResult =
  | { kind: "events"; events: UsageEvent[] }
  | { kind: "prompt"; prompt: PromptEvent }
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
  return {
    lines: 0,
    events: 0,
    prompts: 0,
    malformed: 0,
    synthetic: 0,
    versions: {},
  };
}

// Text blocks in user lines that Claude Code wrote, not the user: tool output, notifications, markers.
const SYSTEM_TEXT =
  /^\s*(?:\[Request interrupted|<(?:task-notification|local-command-stdout|local-command-caveat|bash-stdout|bash-stderr|system-reminder)>)/;

/** Whitespace-separated tokens with at least one letter or digit. */
export function countWords(text: string): number {
  let words = 0;
  for (const token of text.split(/\s+/))
    if (/[\p{L}\p{N}]/u.test(token)) words++;
  return words;
}

/** Words the user wrote in one text block, or undefined when Claude Code wrote the block. */
export function typedWords(block: string): number | undefined {
  if (SYSTEM_TEXT.test(block)) return undefined;
  // Slash commands expand into a template; only the arguments are the user's.
  if (block.includes("<command-name>")) {
    return countWords(
      /<command-args>([\s\S]*?)<\/command-args>/.exec(block)?.[1] ?? "",
    );
  }
  const bash = /^\s*<bash-input>([\s\S]*?)<\/bash-input>/.exec(block);
  if (bash) return countWords(bash[1] ?? "");
  // Pasted text is the user's; hook context is not.
  return countWords(
    block
      .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, " ")
      .replace(/<\/?pasted>/g, " "),
  );
}

// A user line → the prompt's word count. Subagent and sidechain prompts are written by the agent.
function parsePrompt(row: Json, subagent: SubagentRef | undefined): LineResult {
  if (
    subagent ||
    row.isSidechain === true ||
    row.isMeta === true ||
    row.isCompactSummary === true
  )
    return SKIPPED;
  // Only people type. Newer lines say who wrote the prompt; older ones only say an SDK script sent it.
  const origin = isObject(row.origin) ? text(row.origin.kind) : undefined;
  const script =
    row.promptSource === "sdk" ||
    text(row.entrypoint)?.startsWith("sdk-") === true;
  if (origin !== undefined ? origin !== "human" : script) return SKIPPED;
  const content = isObject(row.message) ? row.message.content : undefined;
  const blocks: unknown[] =
    typeof content === "string"
      ? [content]
      : Array.isArray(content)
        ? content
        : [];
  let words = 0;
  let typed = false;
  for (const block of blocks) {
    if (isObject(block) && block.type === "tool_result") return SKIPPED;
    const body =
      typeof block === "string"
        ? block
        : isObject(block) && block.type === "text"
          ? text(block.text)
          : undefined;
    const count = body === undefined ? undefined : typedWords(body);
    if (count === undefined) continue;
    typed = true;
    words += count;
  }
  if (!typed) return SKIPPED;
  const sessionId = text(row.sessionId);
  const ts = Date.parse(text(row.timestamp) ?? "");
  if (!sessionId || Number.isNaN(ts)) return MALFORMED;
  const dedupeKey = text(row.uuid) ?? `${sessionId}|${ts}`;
  return {
    kind: "prompt",
    prompt: {
      kind: "prompt",
      source: "claude-code",
      sessionId,
      ts,
      words,
      dedupeKey,
    },
  };
}

/** One transcript line → usage events (the response, plus one per advisor iteration). */
export function parseLine(line: string, subagent?: SubagentRef): LineResult {
  // Attachments, titles and other bookkeeping lines are skipped without parsing.
  if (!line.includes('"usage"') && !line.includes('"user"')) return SKIPPED;
  let row: unknown;
  try {
    row = JSON.parse(line);
  } catch {
    return MALFORMED;
  }
  if (!isObject(row)) return SKIPPED;
  if (row.type === "user") return parsePrompt(row, subagent);
  if (row.type !== "assistant") return SKIPPED;
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
    kind: "usage" as const,
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
): AsyncGenerator<UsageEvent | PromptEvent> {
  for await (const line of lines) {
    stats.lines++;
    const result = parseLine(line, subagent);
    if (result.kind === "malformed") stats.malformed++;
    else if (result.kind === "synthetic") stats.synthetic++;
    else if (result.kind === "prompt") {
      stats.prompts++;
      yield result.prompt;
    } else if (result.kind === "events") {
      const version = result.events[0]?.version ?? "unknown";
      stats.versions[version] = (stats.versions[version] ?? 0) + 1;
      stats.events += result.events.length;
      yield* result.events;
    }
  }
}
