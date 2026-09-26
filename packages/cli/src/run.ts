import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  aggregate,
  buildFacts,
  buildReceipt,
  createDeduper,
  dispute,
  disputeStamp,
  emptyCodexStats,
  emptyGeminiStats,
  emptyOpenCodeStats,
  emptyStats,
  EXCUSES,
  freshDeck,
  listPrice,
  loadState,
  newDeck,
  nextState,
  observe,
  paint,
  receiptLines,
  saveState,
  scanClaude,
  scanCodex,
  scanGemini,
  scanOpenCode,
  type Excuse,
  type PromptEvent,
  type Receipt,
  type Source,
  type UsageEvent,
  type Verdict,
  imagePreview,
  sharePayload,
  sharePreview,
  shareUrl,
} from "@token-damage/core";
import { parseGuess, type Options } from "./args.js";
import { resolveDirs } from "./dirs.js";
import { VERSION } from "./version.js";

/**
 * Newest major.minor per agent the parser has fixtures for (docs/DATA-SOURCES.md §Tested versions).
 * Gemini CLI writes no version into its chats, so it is never flagged. OpenCode's is its session's.
 */
const TESTED: Partial<
  Record<Source, { name: string; newest: [number, number] }>
> = {
  "claude-code": { name: "claude code", newest: [2, 1] },
  codex: { name: "codex", newest: [0, 155] },
  opencode: { name: "opencode", newest: [1, 17] },
};
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

/** Agent versions in the receipt that are newer than any we have fixtures for, e.g. "codex 0.156". */
function untested(usage: UsageEvent[]): string[] {
  const found = new Set<string>();
  for (const e of usage) {
    const m = /^(\d+)\.(\d+)/.exec(e.version ?? "");
    if (!m) continue;
    const [major, minor] = [Number(m[1]), Number(m[2])];
    const tested = TESTED[e.source];
    if (!tested) continue;
    const { name, newest } = tested;
    if (major > newest[0] || (major === newest[0] && minor > newest[1]))
      found.add(`${name} ${major}.${minor}`);
  }
  return [...found].sort();
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

export async function ask(question: string): Promise<string> {
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

const yes = async (question: string) =>
  (await ask(question)).trim().toLowerCase() === "y";

// "copy image" writes the card to a file: no clipboard, because the CLI never starts child processes.
async function saveImage(receipt: Receipt, io: Io) {
  const path = join(
    homedir(),
    "token-damage",
    `receipt-${receipt.period.end}.png`,
  );
  io.out();
  io.out("the image will show exactly this:");
  imagePreview(receipt).forEach((line) => io.out(line));
  io.out("  no project names · no paths · no prompts · no code");
  if (!(await yes(`write ${tilde(path)}? [y/N] `))) return;
  // Loaded only when asked for, so every other run skips the native renderer.
  const { writePng } = await import("./png.js");
  await writePng(receipt, path);
  io.out(`saved  ${tilde(path)}`);
  io.out("       no project names · no paths · no prompts · no code");
}

async function shareLink(
  receipt: Receipt,
  disputed: { excuse: Excuse; verdict: Verdict } | undefined,
  io: Io,
) {
  const payload = sharePayload(receipt, disputed);
  io.out();
  io.out("the link will carry exactly this, and nothing else:");
  sharePreview(payload).forEach((line) => io.out(line));
  io.out(
    "  it rides after the #, the part of a URL browsers never send to a server.",
  );
  if (!(await yes("create the link? [y/N] "))) return;
  io.out(shareUrl(payload));
}

export async function run(options: Options, io: Io): Promise<number> {
  const dirs = resolveDirs(options);
  const roots = dirs.claudeRoots;
  const homes = dirs.codexHomes;
  const geminiData = dirs.geminiDirs;
  const opencodeData = dirs.opencodeDirs;
  // What each agent's scan reads, one line per agent.
  const scanned = [
    roots.map((r) => join(r, "projects")),
    homes.flatMap((h) => [join(h, "sessions"), join(h, "archived_sessions")]),
    geminiData,
    opencodeData,
  ];
  const p = period(options);
  if (!options.json) {
    io.out(`token-damage ${VERSION}`);
    io.out(
      "reads agent logs on this machine · uploads nothing · no network calls",
    );
    io.out();
    for (const dirs of scanned)
      io.out(`scanning ${dirs.map(tilde).join(", ")} …`);
  }

  const claudeStats = { ...emptyStats(), files: 0, subagentFiles: 0 };
  const codexStats = emptyCodexStats();
  const geminiStats = emptyGeminiStats();
  const opencodeStats = emptyOpenCodeStats();
  // One deduper for every agent: their dedupe keys never collide.
  const deduper = createDeduper();
  const earlier = new Map<string, Source>();
  for (const scan of [
    scanClaude(roots, claudeStats),
    scanCodex(homes, codexStats),
    scanGemini(geminiData, geminiStats),
    scanOpenCode(opencodeData, opencodeStats),
  ]) {
    for await (const record of scan) {
      if (record.ts >= p.from && record.ts < p.to) deduper.add(record);
      // A session typed into before the period still counts as typed; keep its id and agent, never the text.
      else if (record.kind === "prompt" && record.ts < p.from)
        earlier.set(record.sessionId, record.source);
    }
  }
  const usage: UsageEvent[] = deduper.result();
  const prompts: PromptEvent[] = deduper.prompts();
  if (opencodeStats.noSqlite > 0) {
    const line = `! opencode needs node 22.13 or newer to read its database (this is ${process.versions.node}); skipped.`;
    if (options.json) process.stderr.write(line + "\n");
    else io.out(`  ${line}`);
  }
  const files =
    claudeStats.files +
    codexStats.files +
    geminiStats.files +
    opencodeStats.databases +
    opencodeStats.files;
  if (files === 0 || usage.length === 0) {
    const lines = [
      `no claude code, codex, gemini cli or opencode sessions found${files > 0 ? " in this period" : ""}.`,
      `looked in: ${scanned.flat().join(", ")}`,
      "claude code writes none when CLAUDE_CODE_SKIP_PROMPT_HISTORY is set or with `claude -p --no-session-persistence`.",
    ];
    if (options.json) process.stderr.write(lines.join("\n") + "\n");
    else lines.forEach((l) => io.out(`  ${l}`));
    return 2;
  }

  const agg = aggregate({ usage, prompts });
  const facts = buildFacts({
    aggregate: agg,
    usage,
    prompts,
    earlierPrompts: [...earlier].map(([sessionId, source]) => ({
      sessionId,
      source,
    })),
    planUsd: options.planUsd,
  });
  const loaded = await loadState();
  // The first run shuffles the pool with a random seed; fixture runs stay reproducible.
  const state = loaded.deck
    ? loaded
    : { ...loaded, deck: options.fixtures ? newDeck(0) : freshDeck() };
  const observations = observe(facts, state, undefined, p.end.slice(0, 7));
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

  const newer = untested(usage);
  io.out(
    `  ✓ ${n(facts.sessions)} sessions · ${n(facts.activeDays)} active days · ${n(facts.subagents)} subagent transcripts`,
  );
  io.out(
    `  ✓ ${n(facts.calls)} model calls · ${n(facts.prompts)} prompts you actually typed`,
  );
  if (kept.isDefault && claudeStats.files > 0) {
    io.out(
      `  ! claude code already deleted everything older than ${kept.days} days.`,
    );
    io.out("    this receipt covers what survived.");
  }
  if (newer.length > 0) {
    io.out(
      `  ! parser confidence: medium (${newer.join(", ")} ${newer.length > 1 ? "are" : "is"} newer than our fixtures).`,
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
    // Two columns, filled row by row, so the menu stays well inside 80 columns however many excuses there are.
    const left =
      Math.max(...EXCUSES.map((_, i) => (i % 2 === 0 ? label(i).length : 0))) +
      3;
    for (let i = 0; i < EXCUSES.length; i += 2)
      io.out(
        ` ${label(i).padEnd(left)}${i + 1 < EXCUSES.length ? label(i + 1) : ""}`.trimEnd(),
      );
    let disputed: { excuse: Excuse; verdict: Verdict } | undefined;
    const excuse = EXCUSES[Number(await ask("› ")) - 1] as Excuse | undefined;
    if (excuse) {
      const verdict = dispute(excuse, facts);
      disputed = { excuse, verdict };
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
      else if (k === "c") await saveImage(receipt, io);
      else if (k === "s") await shareLink(receipt, disputed, io);
    }
    return 0;
  }
  await remember();
  return 0;
}
