// Turns real transcript lines into fixture lines: keeps structure, ids, usage and timestamps,
// replaces every other string with "x" and cwd with "/p/a" (docs/ARCHITECTURE.md §Testing rules).
// Usage: node --experimental-strip-types scripts/sanitize-fixture.ts <file.jsonl> <line|from-to>...
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

// String values kept verbatim, and only when they look like an id, version, model or timestamp.
const KEEP = new Set([
  "type",
  "subtype",
  "timestamp",
  "sessionId",
  "session_id",
  "requestId",
  "uuid",
  "parentUuid",
  "logicalParentUuid",
  "promptId",
  "sourceToolAssistantUUID",
  "version",
  "model",
  "advisorModel",
  "role",
  "id",
  "tool_use_id",
  "stop_reason",
  "service_tier",
  "speed",
  "inference_geo",
  "entrypoint",
  "userType",
  "agentId",
  "effort",
  // Codex rollouts
  "cli_version",
  "originator",
  "source",
  "forked_from_id",
  "parent_thread_id",
  "thread_id",
  "turn_id",
  // Gemini CLI chats
  "kind",
  "startTime",
  "lastUpdated",
  // OpenCode messages and parts
  "modelID",
  "providerID",
  "sessionID",
  "messageID",
  "parentID",
  // Grok Build session updates and summaries
  "sessionUpdate",
  "eventId",
  "current_model_id",
]);
// Grok's per-model usage is keyed by model id ("grok-4.7"): those keys stay; any other dotted key is renamed.
const MODEL_KEYED = new Set(["modelUsage"]);
// Subtrees holding tool inputs and outputs: arbitrary user data, so nothing in them is kept.
const SCRUB = new Set(["input", "wireToolInputs", "toolUseResult"]);
const SAFE_VALUE = /^[A-Za-z0-9_.:<>+-]{1,80}$/;
const SAFE_KEY = /^[A-Za-z0-9_$-]{1,64}$/;

function sanitizeValue(value: unknown, key: string, scrub: boolean): unknown {
  if (typeof value === "string") {
    if (key === "cwd") return "/p/a";
    return !scrub && KEEP.has(key) && SAFE_VALUE.test(value) ? value : "x";
  }
  if (Array.isArray(value))
    return value.map((v) => sanitizeValue(v, key, scrub));
  if (value !== null && typeof value === "object") {
    let renamed = 0;
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        SAFE_KEY.test(k) || (MODEL_KEYED.has(key) && SAFE_VALUE.test(k))
          ? k
          : `k${renamed++}`,
        sanitizeValue(v, k, scrub || SCRUB.has(k)),
      ]),
    );
  }
  return value;
}

/** Sanitized JSON for one transcript line, or undefined when the line is not JSON. */
export function sanitizeLine(line: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  return JSON.stringify(sanitizeValue(parsed, "", false));
}

function lineNumbers(specs: string[]): Set<number> {
  const wanted = new Set<number>();
  for (const spec of specs) {
    const [from, to] = spec.split("-").map(Number);
    const last = to ?? from;
    if (
      from === undefined ||
      last === undefined ||
      !Number.isInteger(from) ||
      !Number.isInteger(last)
    ) {
      throw new Error(`bad line spec: ${spec}`);
    }
    for (let n = from; n <= last; n++) wanted.add(n);
  }
  return wanted;
}

async function main(file: string, specs: string[]): Promise<void> {
  const wanted = lineNumbers(specs);
  let n = 0;
  const lines = createInterface({
    input: createReadStream(file),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    n++;
    if (!wanted.has(n)) continue;
    const out = sanitizeLine(line);
    if (out === undefined)
      process.stderr.write(`line ${n}: not JSON, skipped\n`);
    else process.stdout.write(out + "\n");
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [file, ...specs] = process.argv.slice(2);
  if (!file || specs.length === 0) {
    process.stderr.write(
      "usage: sanitize-fixture.ts <file.jsonl> <line|from-to>...\n",
    );
    process.exit(2);
  }
  await main(file, specs);
}
