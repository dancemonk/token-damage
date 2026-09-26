// Builds fixtures/grok/grok/: the owner's Grok Build sessions, sanitized (only the line kinds the parser reads, each
// through sanitize-fixture; the project directory renamed "p"), plus the invented traps listed in
// fixtures/grok/README.md. Prints counts only, never text.
// Usage: node --experimental-strip-types scripts/grok-fixture.ts <path to ~/.grok/sessions>
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const { sanitizeLine } = (await import(
  new URL("./sanitize-fixture.ts", import.meta.url).href
)) as { sanitizeLine: (line: string) => string | undefined };

const OUT = fileURLToPath(new URL("../fixtures/grok/grok/", import.meta.url));
const READ = new Set([
  "user_message_chunk",
  "agent_message_chunk",
  "agent_thought_chunk",
  "turn_completed",
]);

const [sessions] = process.argv.slice(2);
if (!sessions) throw new Error("usage: <path to ~/.grok/sessions>");
rmSync(OUT, { recursive: true, force: true });

const kind = (line: string): unknown => {
  try {
    return (
      JSON.parse(line) as { params?: { update?: { sessionUpdate?: unknown } } }
    ).params?.update?.sessionUpdate;
  } catch {
    return undefined;
  }
};

for (const project of readdirSync(sessions, { withFileTypes: true })) {
  if (!project.isDirectory()) continue;
  for (const session of readdirSync(join(sessions, project.name), {
    withFileTypes: true,
  })) {
    const dir = join(sessions, project.name, session.name);
    const updates = join(dir, "updates.jsonl");
    if (!session.isDirectory() || !existsSync(updates)) continue;
    const out = join(OUT, "sessions", "p", session.name);
    mkdirSync(out, { recursive: true });
    const kept: string[] = [];
    for (const line of readFileSync(updates, "utf8").split("\n")) {
      if (line === "" || !READ.has(String(kind(line)))) continue;
      const clean = sanitizeLine(line);
      if (clean !== undefined) kept.push(clean);
    }
    writeFileSync(join(out, "updates.jsonl"), kept.join("\n") + "\n");
    const summary = join(dir, "summary.json");
    if (existsSync(summary)) {
      const clean = sanitizeLine(
        JSON.stringify(JSON.parse(readFileSync(summary, "utf8"))),
      );
      if (clean !== undefined)
        writeFileSync(join(out, "summary.json"), clean + "\n");
    }
    console.log(`${session.name}: ${kept.length} lines`);
  }
}

// Traps (fixtures/grok/README.md), 2026-09-23 UTC. trap-b holds a resumed copy of trap-a's first turn.
const at = Date.UTC(2026, 8, 23, 10);
const line = (sessionUpdate: string, extra: object, meta: object) =>
  JSON.stringify({
    jsonrpc: "2.0",
    method: "x",
    timestamp: Math.floor(at / 1000),
    params: {
      sessionId: "trap-a",
      update: { sessionUpdate, ...extra },
      _meta: meta,
    },
  });
const usage = (n: {
  input: number;
  cached?: number;
  creation?: number;
  output: number;
  reasoning?: number;
  calls: number;
}) => ({
  inputTokens: n.input,
  cachedReadTokens: n.cached ?? 0,
  cacheCreationTokens: n.creation ?? 0,
  outputTokens: n.output,
  reasoningTokens: n.reasoning ?? 0,
  totalTokens: n.input + n.output,
  modelCalls: n.calls,
});
const twoModels = line(
  "turn_completed",
  {
    usage: {
      ...usage({ input: 1500, cached: 900, output: 60, calls: 4 }),
      modelUsage: {
        "grok-4.7": usage({
          input: 1000,
          cached: 800,
          output: 40,
          reasoning: 10,
          calls: 3,
        }),
        "grok-4.5-build": usage({
          input: 500,
          cached: 100,
          creation: 50,
          output: 20,
          calls: 1,
        }),
      },
    },
  },
  { eventId: "trap-e1", agentTimestampMs: at + 60_000 },
);
const trapA = [
  line(
    "user_message_chunk",
    { content: { type: "text", text: "fix the" } },
    { eventId: "trap-c1", agentTimestampMs: at },
  ),
  line(
    "user_message_chunk",
    { content: { type: "text", text: "login bug" } },
    { eventId: "trap-c2", agentTimestampMs: at + 1 },
  ),
  line(
    "agent_message_chunk",
    { content: { type: "text", text: "x" } },
    { eventId: "trap-c3", agentTimestampMs: at + 2 },
  ),
  twoModels,
  line(
    "turn_completed",
    { stop_reason: "cancelled" },
    { eventId: "trap-e0", agentTimestampMs: at + 70_000 },
  ),
  line(
    "turn_completed",
    { usage: usage({ input: 300, output: 5, calls: 2 }) },
    { eventId: "trap-e2", agentTimestampMs: at + 80_000 },
  ),
  line(
    "turn_completed",
    { usage: usage({ input: 200, cached: 50, output: 7, calls: 1 }) },
    { agentTimestampMs: at + 90_000 },
  ),
];
for (const [name, lines, id] of [
  ["trap-a", trapA, "trap-a"],
  ["trap-b", [twoModels], "trap-b"],
] as const) {
  const out = join(OUT, "sessions", "p", name);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "updates.jsonl"), lines.join("\n") + "\n");
  writeFileSync(
    join(out, "summary.json"),
    JSON.stringify({
      info: { id, cwd: "/p/a" },
      current_model_id: "grok-4.7",
    }) + "\n",
  );
}
console.log("traps: trap-a, trap-b");
