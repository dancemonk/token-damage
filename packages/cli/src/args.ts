import { parseArgs } from "node:util";

export interface Options {
  /** Days back from today, or a start date. */
  since: { days: number } | { date: string };
  planUsd: number | undefined;
  anim: boolean;
  json: boolean;
  configDir: string | undefined;
  fixtures: boolean;
  strict: boolean;
}

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
      strict: { type: "boolean", default: false },
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
    configDir: values.fixtures ?? values["config-dir"],
    fixtures: values.fixtures !== undefined,
    strict: values.strict,
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
