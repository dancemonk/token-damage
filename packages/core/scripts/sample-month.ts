// Writes a synthetic Claude Code config dir whose receipt is sample customer 0041 (docs/METRICS.md §Sample data,
// docs/CLI.md §The receipt). Deterministic: same output every run. All text is invented.
// Usage: node --experimental-strip-types scripts/sample-month.ts [dir]   (default: fixtures/sample-month)
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type Tokens = [
  input: number,
  cacheWrite: number,
  cacheRead: number,
  output: number,
];
const MODELS = [
  "claude-opus-5",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
] as const;
type Model = (typeof MODELS)[number];

// Month totals (input 2.1M, cache write 38.4M, cache read 1,138.2M, output 4.7M) split 71/24/5 by model.
const MONTH: Record<Model, Tokens> = {
  "claude-opus-5": [1_491_000, 27_264_000, 808_122_000, 3_337_000],
  "claude-sonnet-4-6": [504_000, 9_216_000, 273_168_000, 1_128_000],
  "claude-haiku-4-5": [105_000, 1_920_000, 56_910_000, 235_000],
};
// Sep 17 is "The Night Shift": 187,022,000 tokens split 86/10/4, list price $129.20.
const NIGHT_DAY = "2026-09-17";
const NIGHT: Record<Model, Tokens> = {
  "claude-opus-5": [266_600, 4_386_000, 155_660_000, 526_320],
  "claude-sonnet-4-6": [31_000, 510_000, 18_100_000, 61_200],
  "claude-haiku-4-5": [12_400, 204_000, 7_240_000, 24_480],
};
const WORDS = 14_690;
const PROMPTS = 612;
const SUBAGENT_EVENTS = 8;
const LATEST = "2026-09-18T03:47:12.000Z";
const LONG_DAY = "2026-09-11";

function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const next = random(41);
const hex = (n: number) =>
  Array.from({ length: n }, () => Math.floor(next() * 16).toString(16)).join(
    "",
  );
const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;

/** Integers proportional to weights that sum exactly to total. */
function split(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => [r - Math.floor(r), i] as const)
    .sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left-- <= 0) break;
    out[i] = (out[i] as number) + 1;
  }
  return out;
}

interface Session {
  id: string;
  project: string;
  start: number;
  end: number;
  mainEvents: number;
  subagents: number;
  prompts: number;
}
interface Event {
  ts: number;
  session: Session;
  agent?: string;
  model: Model;
  tokens: Tokens;
}

const MIN = 60_000;
const at = (day: string, hh: number, mm = 0) =>
  Date.parse(`${day}T00:00:00Z`) + (hh * 60 + mm) * MIN;

function plan(): Session[] {
  const days: string[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.parse("2026-08-25T00:00:00Z") + i * 86_400_000);
    if (d.getUTCDay() !== 0) days.push(d.toISOString().slice(0, 10));
  }
  // 26 active days, 94 sessions: 3 on the night-shift day, 4 on 16 days, 3 on the other 9.
  const others = days.filter((d) => d !== NIGHT_DAY);
  const afterMidnight = new Set([
    "2026-09-18",
    ...others.filter((d) => d !== "2026-09-18").slice(0, 10),
  ]);
  const sessions: Session[] = [];
  const add = (start: number, minutes: number) =>
    sessions.push({
      id: uuid(),
      project: ["-p-a", "-p-b", "-p-c"][sessions.length % 3] as string,
      start,
      end: start + minutes * MIN,
      mainEvents: 0,
      subagents: 0,
      prompts: 0,
    });
  for (const day of days) {
    const count = day === NIGHT_DAY ? 3 : others.indexOf(day) < 16 ? 4 : 3;
    const slots =
      day === LONG_DAY
        ? [
            [9, 0, 554],
            [19, 0, 120],
            [21, 30, 90],
          ]
        : [
            [9, 0, 150],
            [13, 30, 180],
            [16, 45, 200],
            [20, 0, 170],
          ];
    const chosen =
      day === LONG_DAY
        ? slots.concat([[14, 0, 60]]).slice(0, count)
        : slots.slice(0, count);
    for (const [i, [hh, mm, minutes]] of chosen.entries()) {
      const late = afterMidnight.has(day) && i === count - 1;
      if (late && day === "2026-09-18")
        add(Date.parse(LATEST) - 157 * MIN, 157);
      else if (late) add(at(day, 0, 20), 130);
      else add(at(day, hh as number, mm), minutes as number);
    }
  }
  const main = split(
    7_480 - 212 * SUBAGENT_EVENTS,
    sessions.map(() => 1),
  );
  const agents = split(
    212,
    sessions.map(() => 1),
  );
  const prompts = split(
    PROMPTS,
    sessions.map(() => 1),
  );
  sessions.forEach((s, i) =>
    Object.assign(s, {
      mainEvents: main[i],
      subagents: agents[i],
      prompts: prompts[i],
    }),
  );
  return sessions;
}

function events(sessions: Session[]): Event[] {
  const out: Event[] = [];
  const spread = (s: Session, count: number, from: number, to: number) =>
    Array.from({ length: count }, (_, k) =>
      count === 1 ? from : from + Math.round(((to - from) * k) / (count - 1)),
    );
  for (const s of sessions) {
    for (const ts of spread(s, s.mainEvents, s.start, s.end))
      out.push({
        ts,
        session: s,
        model: "claude-opus-5",
        tokens: [0, 0, 0, 0],
      });
    const inner = [
      s.start + (s.end - s.start) * 0.1,
      s.end - (s.end - s.start) * 0.1,
    ];
    for (let a = 0; a < s.subagents; a++) {
      const agent = `a${hex(16)}`;
      for (const ts of spread(
        s,
        SUBAGENT_EVENTS,
        inner[0] as number,
        inner[1] as number,
      )) {
        out.push({
          ts: ts + a * 1000,
          session: s,
          agent,
          model: "claude-opus-5",
          tokens: [0, 0, 0, 0],
        });
      }
    }
  }
  // 71% / 24% / 5% of calls by model, interleaved so every day sees all three.
  out.sort((a, b) => a.ts - b.ts);
  out.forEach(
    (e, i) =>
      (e.model = MODELS[i % 20 < 14 ? 0 : i % 20 < 19 ? 1 : 2] as Model),
  );
  for (const model of MODELS) {
    const day = (e: Event) => new Date(e.ts).toISOString().slice(0, 10);
    const night = out.filter((e) => e.model === model && day(e) === NIGHT_DAY);
    const rest = out.filter((e) => e.model === model && day(e) !== NIGHT_DAY);
    for (const [group, totals] of [
      [night, NIGHT[model]],
      [
        rest,
        MONTH[model].map((t, k) => t - (NIGHT[model][k] as number)) as Tokens,
      ],
    ] as const) {
      const weights = group.map(() => 0.5 + next());
      const columns = totals.map((t) => split(t, weights));
      group.forEach(
        (e, i) => (e.tokens = columns.map((c) => c[i] as number) as Tokens),
      );
    }
  }
  return out;
}

const VOCAB =
  "fix the login bug add tests for parser rename export button update docs check cache refactor session handling make receipt wider explain this error".split(
    " ",
  );

export async function writeSampleMonth(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  const sessions = plan();
  const all = events(sessions);
  const files = new Map<string, string[]>();
  const push = (path: string, row: object) =>
    (files.get(path) ?? files.set(path, []).get(path))?.push(
      JSON.stringify(row),
    );
  let n = 0;
  const base = (s: Session, ts: number) => ({
    timestamp: new Date(ts).toISOString(),
    sessionId: s.id,
    version: "2.1.281",
    entrypoint: "cli",
    userType: "external",
    cwd: "/p/a",
  });
  const promptWords = split(
    WORDS - PROMPTS,
    Array.from({ length: PROMPTS }, () => 0.3 + next()),
  ).map((w) => w + 1);
  let p = 0;
  for (const s of sessions) {
    const path = join(dir, "projects", s.project, `${s.id}.jsonl`);
    for (let k = 0; k < s.prompts; k++) {
      const words = Array.from(
        { length: promptWords[p++] as number },
        () => VOCAB[Math.floor(next() * VOCAB.length)],
      );
      push(path, {
        type: "user",
        ...base(s, s.start + ((s.end - s.start) * k) / Math.max(1, s.prompts)),
        uuid: uuid(),
        isSidechain: false,
        origin: { kind: "human" },
        promptSource: "typed",
        message: { role: "user", content: words.join(" ") },
      });
    }
  }
  for (const e of all) {
    const s = e.session;
    const id = ++n;
    const [input, cacheWrite, cacheRead, output] = e.tokens;
    const usage = {
      input_tokens: input,
      cache_creation_input_tokens: cacheWrite,
      cache_read_input_tokens: cacheRead,
      output_tokens: output,
      cache_creation: {
        ephemeral_5m_input_tokens: cacheWrite,
        ephemeral_1h_input_tokens: 0,
      },
    };
    const row = (u: object) => ({
      type: "assistant",
      ...base(s, e.ts),
      requestId: `req_sample_${id}`,
      uuid: uuid(),
      isSidechain: e.agent !== undefined,
      ...(e.agent && { agentId: e.agent }),
      message: {
        id: `msg_sample_${id}`,
        model: e.model,
        role: "assistant",
        content: [{ type: "text", text: "x" }],
        usage: u,
      },
    });
    const path = e.agent
      ? join(
          dir,
          "projects",
          s.project,
          s.id,
          "subagents",
          `agent-${e.agent}.jsonl`,
        )
      : join(dir, "projects", s.project, `${s.id}.jsonl`);
    // Duplicates the parser must collapse: streaming snapshots in subagents, parallel tool lines in main files.
    if (e.agent && id % 4 === 0)
      push(path, row({ ...usage, output_tokens: 1 }));
    push(path, row(usage));
    if (!e.agent && id % 10 === 0) push(path, row(usage));
  }
  for (const [path, lines] of files) {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(
      path,
      lines
        .sort((a, b) => (a.slice(0, 80) < b.slice(0, 80) ? -1 : 1))
        .join("\n") + "\n",
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const dir =
    process.argv[2] ??
    fileURLToPath(new URL("../fixtures/sample-month", import.meta.url));
  await writeSampleMonth(dir);
  process.stdout.write(`wrote ${dir}\n`);
}
