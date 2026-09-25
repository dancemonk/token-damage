import { join } from "node:path";
import { parseArgs } from "node:util";

const DIR_FLAGS = {
  fixtures: { type: "string" },
  "config-dir": { type: "string" },
  "codex-home": { type: "string" },
  "gemini-dir": { type: "string" },
  "opencode-dir": { type: "string" },
} as const;

export interface DirFlags {
  configDir: string | undefined;
  codexHome: string | undefined;
  geminiDir: string | undefined;
  opencodeDir: string | undefined;
  fixtures: boolean;
}

// A fixture corpus is a Claude Code config dir, a Codex home, a Gemini CLI home (`tmp/`) and an OpenCode
// data dir (`opencode/`) in one.
function dirFlags(values: {
  fixtures?: string | undefined;
  "config-dir"?: string | undefined;
  "codex-home"?: string | undefined;
  "gemini-dir"?: string | undefined;
  "opencode-dir"?: string | undefined;
}): DirFlags {
  const f = values.fixtures;
  return {
    configDir: f ?? values["config-dir"],
    codexHome: f ?? values["codex-home"],
    geminiDir: f !== undefined ? join(f, "tmp") : values["gemini-dir"],
    opencodeDir: f !== undefined ? join(f, "opencode") : values["opencode-dir"],
    fixtures: f !== undefined,
  };
}

function clockFlag(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const t = Date.parse(value);
  if (Number.isNaN(t))
    throw new Error(
      `--clock expects an ISO time like 2026-09-24T12:00:00Z, got ${value}`,
    );
  return t;
}

export type Command = "receipt" | "live" | "statusline";

export function command(argv: string[]): { command: Command; rest: string[] } {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  if (args[0] === "live" || args[0] === "statusline")
    return { command: args[0], rest: args.slice(1) };
  return { command: "receipt", rest: argv };
}

export interface LiveOptions extends DirFlags {
  anim: boolean;
  json: boolean;
  once: boolean;
  clock: number | undefined;
  help: boolean;
}

export const LIVE_USAGE = `token-damage live: today's damage as it happens

  --no-anim          no opening count-up
  --json             one JSON snapshot per change (for tmux bars and scripts)
  --once             print one JSON snapshot and exit
  --fixtures <dir>   read a fixture corpus instead of your logs (nothing is cached)
  --clock <iso>      pretend it is this time (demos, screenshots)
  --config-dir, --codex-home, --gemini-dir, --opencode-dir <path>

q quits.`;

export function parseLiveOptions(argv: string[]): LiveOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...DIR_FLAGS,
      "no-anim": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      once: { type: "boolean", default: false },
      clock: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });
  return {
    ...dirFlags(values),
    anim: !values["no-anim"],
    json: values.json,
    once: values.once,
    clock: clockFlag(values.clock),
    help: values.help,
  };
}

export interface StatuslineOptions extends DirFlags {
  rows: 1 | 2 | 3;
  width: number;
  install: boolean;
  clock: number | undefined;
  help: boolean;
}

export const STATUSLINE_USAGE = `token-damage statusline: rows for Claude Code's status line

Claude Code runs it with session JSON on stdin. Set it up with:
  token-damage statusline --install

  --rows 1|2|3       default 2; 3 adds the adjuster's last remark
  --width N          cap each row at N columns (default 80)
  --install          show the settings.json change, write it after you confirm`;

export function parseStatuslineOptions(argv: string[]): StatuslineOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...DIR_FLAGS,
      rows: { type: "string", default: "2" },
      width: { type: "string", default: "80" },
      install: { type: "boolean", default: false },
      clock: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });
  const rows = Number(values.rows);
  if (rows !== 1 && rows !== 2 && rows !== 3)
    throw new Error(`--rows expects 1, 2 or 3, got ${values.rows}`);
  const width = Number(values.width);
  if (!Number.isInteger(width) || width < 30)
    throw new Error(`--width expects a whole number ≥ 30, got ${values.width}`);
  return {
    ...dirFlags(values),
    rows,
    width,
    install: values.install,
    clock: clockFlag(values.clock),
    help: values.help,
  };
}

export interface Options {
  /** Days back from today, or a start date. */
  since: { days: number } | { date: string };
  planUsd: number | undefined;
  anim: boolean;
  json: boolean;
  configDir: string | undefined;
  codexHome: string | undefined;
  geminiDir: string | undefined;
  opencodeDir: string | undefined;
  fixtures: boolean;
  strict: boolean;
  help: boolean;
  version: boolean;
}

export const USAGE = `token-damage: the receipt your AI agent never gave you

usage: npx token-damage [options]

  token-damage live          today's damage as it happens (q quits)
  token-damage statusline    rows for Claude Code's status line (--install sets it up)

  --plan <usd>          your monthly plan, e.g. 200
  --since <30d|date>    period to cover (default 30d) or a start date, YYYY-MM-DD
  --json                print the receipt as JSON
  --no-anim             print everything at once
  --config-dir <path>   Claude Code config dir (default ~/.claude, or CLAUDE_CONFIG_DIR)
  --codex-home <path>   Codex home (default ~/.codex, or CODEX_HOME)
  --gemini-dir <path>   Gemini CLI data dir (default ~/.gemini/tmp, or GEMINI_DATA_DIR)
  --opencode-dir <path> OpenCode data dir (default ~/.local/share/opencode, or OPENCODE_DATA_DIR)
  --fixtures <dir>      read a fixture corpus instead of your own logs
  --strict              exit 3 if an agent is newer than anything tested
  -v, --version         print the version
  -h, --help            print this

reads agent logs on this machine · uploads nothing · no network calls`;

export function parseOptions(argv: string[]): Options {
  const { values } = parseArgs({
    // `pnpm dev -- --flag` passes the separator through.
    args: argv[0] === "--" ? argv.slice(1) : argv,
    options: {
      since: { type: "string", default: "30d" },
      plan: { type: "string" },
      "no-anim": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      ...DIR_FLAGS,
      strict: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
    strict: true,
  });
  const since = values.since;
  const days = /^(\d+)d$/.exec(since);
  if (!days && !/^\d{4}-\d{2}-\d{2}$/.test(since))
    throw new Error(`--since expects 30d or YYYY-MM-DD, got ${since}`);
  const plan = values.plan === undefined ? undefined : Number(values.plan);
  if (plan !== undefined && !(plan > 0))
    throw new Error(
      `--plan expects a monthly price in USD, got ${values.plan}`,
    );
  return {
    since: days ? { days: Number(days[1]) } : { date: since },
    planUsd: plan,
    anim: !values["no-anim"],
    json: values.json,
    ...dirFlags(values),
    strict: values.strict,
    help: values.help,
    version: values.version,
  };
}

/** "20M", "20,000,000", "2e7", "1.2B", "500k" → tokens. */
export function parseGuess(text: string): number | undefined {
  const m = /^\s*([\d.,]+(?:e\d+)?)\s*([kmb])?\s*$/i.exec(text);
  if (!m) return undefined;
  const base = Number((m[1] ?? "").replaceAll(",", ""));
  const scale = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? "").toLowerCase()] ?? 1;
  const value = base * scale;
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
