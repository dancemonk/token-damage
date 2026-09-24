#!/usr/bin/env node
// Oracle: compares our daily token totals with ccusage on the same agent logs.
// Usage: pnpm oracle [--agent claude|codex] [--fixtures] [--config-dir <dir>] [--timezone <IANA zone>]
// --config-dir sets CLAUDE_CONFIG_DIR for claude and CODEX_HOME for codex.
// Exits 1 when any day's field differs by more than 1%, 2 when ccusage cannot run.
// Dev tool only: it fetches ccusage through npx. The CLI itself never touches the network.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const TOLERANCE = 0.01;
const FIELDS = ["input", "cacheWrite", "cacheRead", "output"];
const ZERO = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
const total = (t) => t.input + t.cacheWrite + t.cacheRead + t.output;
const AGENTS = {
  claude: { env: "CLAUDE_CONFIG_DIR", label: "Claude Code" },
  codex: { env: "CODEX_HOME", label: "Codex" },
};

/** Per-day comparison. `ours`/`theirs`: Map<day, {input, cacheWrite, cacheRead, output}>. */
export function compare(ours, theirs, tolerance = TOLERANCE) {
  const days = [...new Set([...ours.keys(), ...theirs.keys()])].sort();
  return days
    .map((day) => {
      const a = ours.get(day) ?? ZERO;
      const b = theirs.get(day) ?? ZERO;
      const fields = [
        ...FIELDS.map((f) => [f, a[f], b[f]]),
        ["total", total(a), total(b)],
      ].map(([field, o, t]) => ({
        field,
        ours: o,
        theirs: t,
        // Relative to ccusage; any difference against a zero counts as over.
        off: t === 0 ? (o === 0 ? 0 : Infinity) : Math.abs(o - t) / t,
      }));
      const worst = fields.reduce((w, f) => (f.off > w.off ? f : w));
      return {
        day,
        ours: total(a),
        theirs: total(b),
        worst,
        over: worst.off > tolerance,
      };
    })
    .filter((row) => row.ours > 0 || row.theirs > 0);
}

function parseArgs(argv) {
  const args = {
    agent: "claude",
    fixtures: false,
    configDir: undefined,
    timeZone: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--agent") args.agent = argv[++i];
    else if (argv[i] === "--fixtures") args.fixtures = true;
    else if (argv[i] === "--config-dir") args.configDir = argv[++i];
    else if (argv[i] === "--timezone") args.timeZone = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!AGENTS[args.agent]) throw new Error(`unknown agent: ${args.agent}`);
  return args;
}

// ccusage needs a real config dir: case files go flat into one project, subagent files keep their layout.
function fixtureConfigDir() {
  const src = fileURLToPath(
    new URL("../packages/core/fixtures/claude/", import.meta.url),
  );
  const dir = mkdtempSync(join(tmpdir(), "td-oracle-"));
  const project = join(dir, "projects", "-p-a");
  for (const rel of readdirSync(src, { recursive: true, encoding: "utf8" })) {
    if (!rel.endsWith(".jsonl")) continue;
    const parts = rel.split(sep);
    const at = parts.indexOf("subagents");
    const dest =
      at > 0
        ? join(project, ...parts.slice(at - 1))
        : join(project, parts.join("_"));
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(src, rel), dest);
  }
  return dir;
}

// The Codex fixtures are already a Codex home.
const codexFixtures = () =>
  fileURLToPath(new URL("../packages/core/fixtures/codex/", import.meta.url));

async function ourDaily(agent, env, timeZone) {
  const core = await import("../packages/core/dist/index.js");
  const records =
    agent === "codex"
      ? core.scanCodex(core.codexHomes(env, homedir()), core.emptyCodexStats())
      : core.scanClaude(core.claudeRoots(env, homedir()), {
          ...core.emptyStats(),
          files: 0,
          subagentFiles: 0,
        });
  const deduper = core.createDeduper();
  for await (const record of records) deduper.add(record);
  const { daily } = core.aggregate({ usage: deduper.result() }, { timeZone });
  return new Map(
    daily.map((d) => [
      d.day,
      Object.values(d.byModel).reduce(
        (sum, m) => ({
          input: sum.input + m.input,
          cacheWrite: sum.cacheWrite + m.cacheWrite,
          cacheRead: sum.cacheRead + m.cacheRead,
          output: sum.output + m.output,
        }),
        ZERO,
      ),
    ]),
  );
}

function ccusage(args, env) {
  const spec = `ccusage@${process.env.CCUSAGE_VERSION ?? "latest"}`;
  return execFileSync("npx", ["-y", spec, ...args], {
    env,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// For codex, inputTokens already excludes cached input, as ours does.
function theirDaily(agent, env, timeZone) {
  const report = JSON.parse(
    ccusage(
      [agent, "daily", "--json", "--offline", "--timezone", timeZone],
      env,
    ),
  );
  return new Map(
    report.daily.map((d) => [
      d.date ?? d.period,
      {
        input: d.inputTokens,
        cacheWrite: d.cacheCreationTokens,
        cacheRead: d.cacheReadTokens,
        output: d.outputTokens,
      },
    ]),
  );
}

const n = (x) => x.toLocaleString("en-US");
const pct = (off) => (off === Infinity ? "∞" : `${(off * 100).toFixed(2)}%`);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const agent = AGENTS[args.agent];
  // Only the Claude fixtures are copied into a temporary config dir; that copy is removed at the end.
  const tempDir =
    args.fixtures && args.agent === "claude" ? fixtureConfigDir() : undefined;
  const configDir =
    tempDir ??
    (args.fixtures && args.agent === "codex"
      ? codexFixtures()
      : args.configDir);
  const env = configDir
    ? { ...process.env, [agent.env]: configDir }
    : process.env;
  const timeZone =
    args.timeZone ??
    (args.fixtures ? "UTC" : Intl.DateTimeFormat().resolvedOptions().timeZone);
  try {
    let version, theirs;
    try {
      version = ccusage(["--version"], env).trim();
      theirs = theirDaily(args.agent, env, timeZone);
    } catch (error) {
      process.stderr.write(
        `ccusage failed: ${error.stderr || error.message}\n`,
      );
      process.exitCode = 2;
      return;
    }
    const rows = compare(await ourDaily(args.agent, env, timeZone), theirs);
    console.log(
      `${version} · ${agent.label} · ${args.fixtures ? "fixture corpus" : "local logs"} · ${timeZone} · tolerance ${pct(TOLERANCE)}`,
    );
    console.log(
      `${"day".padEnd(12)}${"ours".padStart(16)}${"ccusage".padStart(16)}   worst field`,
    );
    for (const r of rows) {
      const worst =
        r.worst.off === 0
          ? "exact"
          : `${r.worst.field} ${r.worst.ours - r.worst.theirs > 0 ? "+" : ""}${n(r.worst.ours - r.worst.theirs)} (${pct(r.worst.off)})`;
      console.log(
        `${r.day.padEnd(12)}${n(r.ours).padStart(16)}${n(r.theirs).padStart(16)}   ${worst}${r.over ? "  ✗" : ""}`,
      );
    }
    const sum = (key) => rows.reduce((s, r) => s + r[key], 0);
    console.log(
      `${"total".padEnd(12)}${n(sum("ours")).padStart(16)}${n(sum("theirs")).padStart(16)}`,
    );
    const over = rows.filter((r) => r.over);
    if (rows.length === 0) console.log("no usage found on either side");
    console.log(
      over.length
        ? `FAIL: ${over.length} day(s) differ by more than ${pct(TOLERANCE)}`
        : `OK: every day within ${pct(TOLERANCE)}`,
    );
    if (over.length) process.exitCode = 1;
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
