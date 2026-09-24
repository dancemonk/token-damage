import { join } from "node:path";
import { parseArgs } from "node:util";

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
      fixtures: { type: "string" },
      "config-dir": { type: "string" },
      "codex-home": { type: "string" },
      "gemini-dir": { type: "string" },
      "opencode-dir": { type: "string" },
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
    // A fixture corpus is a Claude Code config dir, a Codex home, a Gemini CLI home (`tmp/`) and an OpenCode
    // data dir (`opencode/`) in one.
    configDir: values.fixtures ?? values["config-dir"],
    codexHome: values.fixtures ?? values["codex-home"],
    geminiDir:
      values.fixtures !== undefined
        ? join(values.fixtures, "tmp")
        : values["gemini-dir"],
    opencodeDir:
      values.fixtures !== undefined
        ? join(values.fixtures, "opencode")
        : values["opencode-dir"],
    fixtures: values.fixtures !== undefined,
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
