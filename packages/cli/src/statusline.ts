import {
  copyFile,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join, sep } from "node:path";
import {
  detect,
  emptyVoice,
  FALLBACK_ROW,
  hashPath,
  LiveEngine,
  LiveSources,
  loadCache,
  paint,
  parseStatusInput,
  saveCache,
  speak,
  statuslineRows,
  type Source,
} from "@token-damage/core";
import {
  parseStatuslineOptions,
  STATUSLINE_USAGE,
  type StatuslineOptions,
} from "./args.js";
import { resolveDirs } from "./dirs.js";
import { ask } from "./run.js";

export const STATUS_GUARD_MS = 2_000;
const RECONCILE_MS = 5 * 60_000;

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function rows(o: StatuslineOptions): Promise<string> {
  const raw = await readStdin();
  const at = o.clock ?? Date.now();
  const now = () => at;
  const input = parseStatusInput(raw, at);
  const dirs = resolveDirs(o);
  const day = new LiveEngine({ now }).day;
  const cache = o.fixtures ? null : await loadCache(day);
  const engine = new LiveEngine({ now, ...(cache && { state: cache.engine }) });
  const prev = cache ? engine.snapshot() : null;
  let sources = new LiveSources(dirs, {
    from: engine.from,
    hash: hashPath,
    ...(cache && { state: cache.sources }),
  });
  let reconciledAt = cache?.reconciledAt ?? 0;
  const polled = cache ? await sources.poll() : null;
  if (!polled || polled.newFiles || at - reconciledAt >= RECONCILE_MS) {
    sources = new LiveSources(dirs, { from: engine.from, hash: hashPath });
    engine.replace(await sources.scanAll());
    reconciledAt = at;
  } else {
    engine.add(polled.records);
    for (const [source, pool] of Object.entries(polled.pools))
      engine.setPool(source as Source, pool);
  }
  if (input.limits) engine.setLimits(input.limits);
  const next = engine.snapshot();
  let voice = cache?.voice ?? emptyVoice();
  const said = speak(detect(prev, next), voice, at, {
    day: next.day,
    words: next.open?.words ?? null,
  });
  voice = said.state;
  if (said.note) engine.note(said.note.family, said.note.text);
  if (!o.fixtures)
    await saveCache({
      version: 1,
      day: engine.day,
      savedAt: at,
      reconciledAt,
      engine: engine.state(),
      sources: sources.state(),
      voice,
    });
  const color = !process.env.NO_COLOR && process.env.TERM !== "dumb";
  return statuslineRows(engine.snapshot(), input, engine.events(), {
    rows: o.rows,
    width: o.width,
  })
    .map((l) => paint(l, color))
    .join("\n");
}

/** Runs from Claude Code on every refresh: it must never fail loudly or hang. */
export async function runStatusline(argv: string[]): Promise<number> {
  let o: StatuslineOptions;
  try {
    o = parseStatuslineOptions(argv);
  } catch (error) {
    if (argv.includes("--install")) throw error;
    process.stdout.write(`${FALLBACK_ROW}\n`);
    return 0;
  }
  if (o.help) {
    process.stdout.write(`${STATUSLINE_USAGE}\n`);
    return 0;
  }
  if (o.install) return installStatusline(o);
  let timer: NodeJS.Timeout | undefined;
  const guard = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(FALLBACK_ROW), STATUS_GUARD_MS);
  });
  // If the guard wins, `attempt` keeps running in the background (its reconcile and cache save are
  // still worth finishing); attach a no-op catch now so a later rejection never surfaces as an
  // unhandled rejection after we have already answered and exited 0.
  const attempt = rows(o);
  attempt.catch(() => {});
  let out: string;
  try {
    out = await Promise.race([attempt, guard]);
  } catch {
    out = FALLBACK_ROW;
  }
  clearTimeout(timer);
  process.stdout.write(`${out}\n`);
  return 0;
}

async function onPath(name: string): Promise<boolean> {
  for (const d of (process.env.PATH ?? "").split(delimiter)) {
    if (!d) continue;
    try {
      if ((await stat(join(d, name))).isFile()) return true;
    } catch {
      // not in this directory
    }
  }
  return false;
}

const quote = (s: string) => (/[\s"']/.test(s) ? JSON.stringify(s) : s);

export async function installStatusline(
  _o: StatuslineOptions,
): Promise<number> {
  void _o; // reserved for a future --config-dir override; the settings.json path comes from CLAUDE_CONFIG_DIR today.
  const script = process.argv[1] ?? "";
  if (
    process.env.npm_command === "exec" ||
    script.includes(`${sep}_npx${sep}`)
  ) {
    process.stdout.write(
      "the status line runs on every refresh; npx is too slow for that and may touch the network.\n" +
        "install it globally first: npm i -g token-damage\nthen run: token-damage statusline --install\n",
    );
    return 1;
  }
  const command = (await onPath("token-damage"))
    ? "token-damage statusline"
    : `${quote(process.execPath)} ${quote(await realpath(script))} statusline`;
  const configDir =
    process.env.CLAUDE_CONFIG_DIR?.split(",")[0] || join(homedir(), ".claude");
  const path = join(configDir, "settings.json");
  let text: string | undefined;
  try {
    text = await readFile(path, "utf8");
  } catch {
    text = undefined;
  }
  let settings: Record<string, unknown>;
  try {
    settings =
      text === undefined ? {} : (JSON.parse(text) as Record<string, unknown>);
    if (
      typeof settings !== "object" ||
      settings === null ||
      Array.isArray(settings)
    )
      throw new Error("not an object");
  } catch {
    process.stdout.write(`${path} is not valid JSON; not touching it.\n`);
    return 1;
  }
  const wanted = { type: "command", command, refreshInterval: 10 };
  if (JSON.stringify(settings.statusLine) === JSON.stringify(wanted)) {
    process.stdout.write("already set up.\n");
    return 0;
  }
  process.stdout.write(`${path}\n`);
  if (settings.statusLine !== undefined)
    process.stdout.write(
      `- "statusLine": ${JSON.stringify(settings.statusLine)}\n`,
    );
  process.stdout.write(`+ "statusLine": ${JSON.stringify(wanted)}\n`);
  if ((await ask("write it? [y/N] ")).trim().toLowerCase() !== "y") {
    process.stdout.write("left as is.\n");
    return 0;
  }
  if (text !== undefined) {
    const backup = `${path}.token-damage.bak`;
    try {
      await stat(backup);
    } catch {
      await copyFile(path, backup);
    }
  }
  await mkdir(configDir, { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(
    tmp,
    `${JSON.stringify({ ...settings, statusLine: wanted }, null, 2)}\n`,
  );
  await rename(tmp, path);
  process.stdout.write("done. claude code picks it up on its next refresh.\n");
  return 0;
}
