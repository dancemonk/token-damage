import { join } from "node:path";
import { parseArgs } from "node:util";
import { ADAPTERS, type Source } from "@token-damage/core";

// `--fixtures <dir>` plus one `--<flag> <path>` per agent (--config-dir, --codex-home, …). Built from the
// registry, so parseArgs' `values` does not type these keys; dirFlags reads them.
const DIR_FLAGS = Object.fromEntries([
  ["fixtures", { type: "string" }],
  ...ADAPTERS.map((a) => [a.flag, { type: "string" }]),
]) as Record<string, { type: "string" }>;

export interface DirFlags {
  /** A path given with an agent's flag, or the agent's place in a `--fixtures` corpus. */
  dirs: Partial<Record<Source, string>>;
  fixtures: boolean;
}

// A fixture corpus holds every agent at once, each at its adapter's `fixtureDir` (`tmp/` for Gemini CLI, …).
function dirFlags(values: { readonly [key: string]: unknown }): DirFlags {
  const f = values.fixtures as string | undefined;
  const dirs: Partial<Record<Source, string>> = {};
  for (const a of ADAPTERS) {
    const path =
      f !== undefined
        ? a.fixtureDir
          ? join(f, a.fixtureDir)
          : f
        : (values[a.flag] as string | undefined);
    if (path !== undefined) dirs[a.id] = path;
  }
  return { dirs, fixtures: f !== undefined };
}

/**
 * The agents' flag lines in `--help`, descriptions at column 24 like the other options; a flag too long for
 * that gutter gets its description on the next line.
 */
export function flagLines(
  adapters: readonly { flag: string; help: string }[],
): string {
  return adapters
    .map((a) => {
      const left = `  --${a.flag} <path>`;
      return left.length <= 23
        ? `${left.padEnd(23)} ${a.help}`
        : `${left}\n${" ".repeat(24)}${a.help}`;
    })
    .join("\n");
}

/** The agents' flags on `live --help`, comma-separated, wrapped at 80 columns. */
export function flagList(adapters: readonly { flag: string }[]): string {
  const lines: string[] = [];
  let line = " ";
  adapters.forEach((a, i) => {
    const word = ` --${a.flag}${i < adapters.length - 1 ? "," : " <path>"}`;
    if (line.length + word.length > 80) {
      lines.push(line);
      line = " ";
    }
    line += word;
  });
  lines.push(line);
  return lines.join("\n");
}

const DIR_HELP = flagLines(ADAPTERS);

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
${flagList(ADAPTERS)}

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

export interface Options extends DirFlags {
  /** Days back from today, or a start date. */
  since: { days: number } | { date: string };
  planUsd: number | undefined;
  anim: boolean;
  json: boolean;
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
${DIR_HELP}
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
