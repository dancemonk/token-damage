import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  aggregate,
  buildFacts,
  buildReceipt,
  claudeRoots,
  createDeduper,
  dispute,
  disputeStamp,
  emptyStats,
  EXCUSES,
  listPrice,
  loadState,
  nextState,
  observe,
  paint,
  receiptLines,
  saveState,
  scanClaude,
  type Excuse,
  type PromptEvent,
  type Receipt,
  type UsageEvent,
} from "@token-damage/core";
import { parseGuess, type Options } from "./args.js";
import { VERSION } from "./version.js";

/** Claude Code major.minor versions the parser has fixtures for (docs/DATA-SOURCES.md §Tested versions). */
const TESTED = ["2.1"];
const DAY_MS = 86_400_000;

interface Io {
  out: (line?: string) => void;
  color: boolean;
  interactive: boolean;
  sleep: (ms: number) => Promise<void>;
}

const localDay = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const midnight = (day: string) =>
  new Date(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10)),
  ).getTime();
const tilde = (path: string) =>
  path.startsWith(homedir()) ? `~${path.slice(homedir().length)}` : path;
const n = (x: number) => Math.round(x).toLocaleString("en-US");

// The period ends today (TOKEN_DAMAGE_NOW pins "today" for tests) and covers whole local days.
function period(options: Options) {
  const now = process.env.TOKEN_DAMAGE_NOW
    ? Date.parse(process.env.TOKEN_DAMAGE_NOW)
    : Date.now();
  const end = localDay(now);
  const start =
    "days" in options.since
      ? localDay(midnight(end) - (options.since.days - 1) * DAY_MS + DAY_MS / 2)
      : options.since.date;
  const days = Math.round((midnight(end) - midnight(start)) / DAY_MS) + 1;
  return {
    start,
    end,
    days,
    from: midnight(start),
    to: midnight(end) + DAY_MS,
  };
}

async function retention(
  roots: string[],
): Promise<{ days: number; isDefault: boolean }> {
  for (const root of roots) {
    try {
      const value = (
        JSON.parse(await readFile(join(root, "settings.json"), "utf8")) as {
          cleanupPeriodDays?: unknown;
        }
      ).cleanupPeriodDays;
      if (typeof value === "number" && value >= 1)
        return { days: value, isDefault: false };
    } catch {
      // No settings file, or not ours to judge: Claude Code's default applies.
    }
  }
  return { days: 30, isDefault: true };
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

function key(): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.once("data", (data) => {
      stdin.setRawMode(false);
      stdin.pause();
      resolve(data.toString().toLowerCase());
    });
  });
}

function dailySlips(
  receiptDays: { day: string; tokens: number; price: number }[],
  io: Io,
) {
  io.out("DAILY SLIPS");
  for (const d of receiptDays) {
    const value = `${n(d.tokens)} · ≡ $${d.price.toFixed(2)}`;
    io.out(
      `  ${d.day} ${".".repeat(Math.max(1, 48 - d.day.length - value.length - 4))} ${value}`,
    );
  }
}

export async function run(options: Options, io: Io): Promise<number> {
  const roots = options.configDir
    ? [options.configDir]
    : claudeRoots(process.env, homedir());
  const p = period(options);
  if (!options.json) {
    io.out(`token-damage ${VERSION}`);
    io.out(
      "reads ~/.claude on this machine · uploads nothing · no network calls",
    );
    io.out();
    io.out(
      `scanning ${roots.map((r) => tilde(join(r, "projects"))).join(", ")} …`,
    );
  }

  const stats = { ...emptyStats(), files: 0, subagentFiles: 0 };
  const deduper = createDeduper();
  for await (const record of scanClaude(roots, stats)) {
    if (record.ts >= p.from && record.ts < p.to) deduper.add(record);
  }
  const usage: UsageEvent[] = deduper.result();
  const prompts: PromptEvent[] = deduper.prompts();
  if (stats.files === 0 || usage.length === 0) {
    const lines = [
      `no claude code transcripts found${stats.files > 0 ? " in this period" : ""}.`,
      `looked in: ${roots.map((r) => join(r, "projects")).join(", ")}`,
      "claude code writes none when CLAUDE_CODE_SKIP_PROMPT_HISTORY is set or with `claude -p --no-session-persistence`.",
    ];
    if (options.json) process.stderr.write(lines.join("\n") + "\n");
    else lines.forEach((l) => io.out(`  ${l}`));
    return 2;
  }

  const agg = aggregate({ usage, prompts });
  const facts = buildFacts({ aggregate: agg, usage, planUsd: options.planUsd });
  const state = await loadState();
  const observations = observe(facts, state);
  const kept = await retention(roots);
  const receipt: Receipt = buildReceipt({
    trans: String(state.runs + 1).padStart(4, "0"),
    period: {
      start: p.start,
      end: p.end,
      days: p.days,
      retentionDays: kept.days,
      retentionIsDefault: kept.isDefault,
    },
    aggregate: agg,
    facts,
    observations,
    planUsd: options.planUsd,
  });
  // Running against fixtures never touches the user's own state.
  const remember = () =>
    options.fixtures
      ? Promise.resolve()
      : saveState(nextState(state, observations));

  if (options.json) {
    io.out(JSON.stringify(receipt, null, 2));
    await remember();
    return 0;
  }

  const untested = Object.keys(stats.versions).filter(
    (v) => !TESTED.includes(v.split(".").slice(0, 2).join(".")),
  );
  io.out(
    `  ✓ ${n(facts.sessions)} sessions · ${n(facts.activeDays)} active days · ${n(facts.subagents)} subagent transcripts`,
  );
  io.out(
    `  ✓ ${n(facts.calls)} model calls · ${n(facts.prompts)} prompts you actually typed`,
  );
  if (kept.isDefault) {
    io.out(
      `  ! claude code already deleted everything older than ${kept.days} days.`,
    );
    io.out("    this receipt covers what survived.");
  }
  if (untested.length > 0) {
    io.out(
      `  ! parser confidence: medium (claude code ${untested.join(", ")} is newer than our fixtures).`,
    );
    if (options.strict) return 3;
  }
  io.out();

  let guess: number | undefined;
  if (io.interactive) {
    io.out(
      `before we print: how many tokens did your agents use in ${p.days} days?`,
    );
    io.out("(guess. we'll wait.)");
    guess = parseGuess(await ask("› "));
    io.out();
  }

  io.out("printing customer copy …");
  for (const line of receiptLines(receipt)) {
    io.out(paint(line, io.color));
    if (options.anim) await io.sleep(70);
  }

  if (guess !== undefined) {
    const actual = facts.tokens;
    const off = Math.max(actual / guess, guess / actual);
    io.out();
    io.out(`you guessed ${n(guess)}. actual: ${n(actual)}.`);
    io.out(
      off < 1.5
        ? "you were close. suspiciously close."
        : `you were off by ${n(off)}×.`,
    );
  }

  if (io.interactive) {
    io.out();
    io.out("dispute this charge?");
    const label = (i: number) =>
      `[${i + 1}] ${(EXCUSES[i] ?? "").toLowerCase()}`;
    io.out(` ${label(0).padEnd(19)}${label(1).padEnd(33)}${label(2)}`);
    io.out(` ${label(3).padEnd(19)}${label(4).padEnd(33)}${label(5)}`);
    const excuse = EXCUSES[Number(await ask("› ")) - 1] as Excuse | undefined;
    if (excuse) {
      const verdict = dispute(excuse, facts);
      io.out(
        paint(
          {
            text: disputeStamp(receipt.trans, excuse, verdict).replace(
              `"${excuse}"`,
              `"${excuse.toLowerCase()}"`,
            ),
            style: "stamp",
          },
          io.color,
        ),
      );
      io.out(verdict.text.replace(/^(DENIED|APPROVED)\. /, "").toLowerCase());
    }
    await remember();
    const days = agg.daily
      .filter((d) => d.calls > 0)
      .map((d) => ({
        day: d.day,
        tokens: Object.values(d.byModel).reduce(
          (s, m) => s + m.input + m.cacheWrite + m.cacheRead + m.output,
          0,
        ),
        price: listPrice(d.byModel).value,
      }));
    for (;;) {
      io.out();
      io.out("[c] copy image   [s] share link   [d] daily slips   [q] quit");
      const k = await key();
      if (k === "q" || k === "\u0003") break;
      if (k === "d") dailySlips(days, io);
      else if (k === "c" || k === "s")
        io.out("image export and share links arrive in the next version.");
    }
    return 0;
  }
  await remember();
  return 0;
}
