import {
  detect,
  emptyVoice,
  hashPath,
  liveLines,
  LiveEngine,
  LiveSources,
  loadCache,
  paint,
  publicSnapshot,
  saveCache,
  speak,
  type LiveSnapshot,
  type Source,
  type VoiceState,
} from "@token-damage/core";
import type { LiveOptions } from "./args.js";
import { resolveDirs } from "./dirs.js";
import { ENTER, frame, LEAVE } from "./screen.js";
import { watchRoots } from "./watch.js";

const TICK_MS = 2_000;
const RECONCILE_MS = 5 * 60_000;
const SAVE_MS = 5_000;
const COUNT_UP_MS = 600;
const COUNT_UP_FRAMES = 12;
export const READ_FAILURE_LIMIT = 3;

/**
 * The one line we're allowed to print when a tick can't read the logs: never the error's own message
 * or stack, since either can contain an absolute path (a failed `open`/`realpath` embeds the path it
 * tried). Only the error code, e.g. EACCES or EMFILE, survives.
 */
export function describeReadError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException)?.code ?? "unknown error";
  return `token-damage live: could not read the agent logs (${code})`;
}

/** 0 after a successful tick; climbs by one on each consecutive failure. */
export function nextFailureCount(count: number, failed: boolean): number {
  return failed ? count + 1 : 0;
}

export async function runLive(o: LiveOptions): Promise<number> {
  const started = Date.now();
  const now = () =>
    o.clock === undefined ? Date.now() : o.clock + (Date.now() - started);
  const tty = Boolean(process.stdout.isTTY);
  if (!tty && !o.json && !o.once) {
    process.stderr.write("live needs a terminal; pipe `--json` instead.\n");
    return 1;
  }
  const color = tty && !process.env.NO_COLOR && process.env.TERM !== "dumb";
  const dirs = resolveDirs(o);
  const probe = new LiveEngine({ now });
  const cache = o.fixtures ? null : await loadCache(probe.day);
  const engine = new LiveEngine({ now, ...(cache && { state: cache.engine }) });
  let sources = new LiveSources(dirs, {
    from: engine.from,
    hash: hashPath,
    ...(cache && { state: cache.sources }),
  });
  let voice: VoiceState = cache?.voice ?? emptyVoice();
  let noLogs = false;

  const apply = (polled: Awaited<ReturnType<LiveSources["poll"]>>) => {
    engine.add(polled.records);
    for (const [source, pool] of Object.entries(polled.pools))
      engine.setPool(source as Source, pool);
    if (polled.records.length || Object.keys(polled.pools).length)
      noLogs = false;
  };

  if (cache) apply(await sources.poll());
  else {
    engine.replace(await sources.scanAll());
    // scanAll remembers every file it found (tails for Claude, mtimes for the rest): none at all → no logs yet.
    const found = sources.state();
    noLogs =
      Object.keys(found.tails).length === 0 &&
      Object.keys(found.seen).length === 0;
  }
  if (sources.noSqlite)
    process.stderr.write(
      `opencode needs node 22.13 or newer to read its database (this is ${process.versions.node}); skipped.\n`,
    );
  if (o.once) {
    process.stdout.write(
      `${JSON.stringify(publicSnapshot(engine.snapshot()))}\n`,
    );
    return 0;
  }

  let prev: LiveSnapshot | null = null;
  let lastReconcile = now();
  let lastSave = 0;
  let lastJson = "";
  let screen: string[] = [];
  let running = false;
  let again = false;
  let failures = 0;
  let stopped = false;

  const save = async (force = false) => {
    if (o.fixtures || (!force && now() - lastSave < SAVE_MS)) return;
    lastSave = now();
    await saveCache({
      version: 1,
      day: engine.day,
      savedAt: lastSave,
      reconciledAt: lastReconcile,
      engine: engine.state(),
      sources: sources.state(),
      voice,
    });
  };

  const draw = (s: LiveSnapshot, full = false) => {
    if (o.json) {
      const line = JSON.stringify(publicSnapshot(s));
      if (line !== lastJson) process.stdout.write(`${line}\n`);
      lastJson = line;
      return;
    }
    const lines = liveLines(s, engine.events(), {
      width: process.stdout.columns ?? 80,
      height: process.stdout.rows ?? 24,
      noLogs,
    }).map((l) => paint(l, color));
    process.stdout.write(frame(full ? [] : screen, lines));
    screen = lines;
  };

  const tick = async () => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      if (engine.rollover()) {
        sources = new LiveSources(dirs, { from: engine.from, hash: hashPath });
        engine.replace(await sources.scanAll());
        voice = emptyVoice();
        lastReconcile = now();
      }
      const polled = await sources.poll();
      apply(polled);
      if (polled.newFiles || now() - lastReconcile >= RECONCILE_MS) {
        const fresh = new LiveSources(dirs, {
          from: engine.from,
          hash: hashPath,
        });
        engine.replace(await fresh.scanAll());
        sources = fresh;
        lastReconcile = now();
      }
      if (!o.fixtures) {
        const shared = await loadCache(engine.day);
        const theirs = shared?.engine.limits;
        const mine = engine.snapshot().limits;
        if (theirs && (!mine || theirs.asOf > mine.asOf))
          engine.setLimits(theirs);
      }
      const next = engine.snapshot();
      const said = speak(detect(prev, next), voice, now(), {
        day: next.day,
        words: next.open?.words ?? null,
      });
      voice = said.state;
      if (said.note) engine.note(said.note.family, said.note.text);
      prev = next;
      draw(said.note ? engine.snapshot() : next);
      await save();
      failures = nextFailureCount(failures, false);
    } catch (error) {
      // Keep the last good frame on screen — do not draw from a snapshot we could not finish building.
      failures = nextFailureCount(failures, true);
      if (failures >= READ_FAILURE_LIMIT) {
        stopped = true;
        clearInterval(interval);
        stopWatch();
        restore();
        process.off("exit", restore);
        process.stderr.write(`${describeReadError(error)}\n`);
        resolveExit(1);
      }
    } finally {
      running = false;
      if (again && !stopped) {
        again = false;
        void tick();
      }
    }
  };

  let resolveExit: (code: number) => void = () => {};
  const exited = new Promise<number>((resolve) => (resolveExit = resolve));
  const stopWatch = watchRoots(sources.watchRoots(), () => void tick());
  const interval = setInterval(() => void tick(), TICK_MS);
  const restore = () => {
    if (tty && !o.json) process.stdout.write(LEAVE);
    // A crash reaches here through the "exit" listener without ever running the code after `await
    // exited` below, so raw mode has to be undone here too or the shell is left echo-less.
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  };
  process.on("exit", restore);
  const quit = async () => {
    clearInterval(interval);
    stopWatch();
    await save(true);
    restore();
    process.off("exit", restore);
    resolveExit(0);
  };
  process.on("SIGINT", () => void quit());
  process.on("SIGTERM", () => void quit());

  if (tty && !o.json) {
    process.stdout.write(ENTER);
    process.stdout.on("resize", () => draw(engine.snapshot(), true));
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("data", (key: Buffer) => {
        const k = key.toString();
        if (k === "q" || k === "Q" || k === "\u0003") void quit();
      });
    }
    const first = engine.snapshot();
    if (o.anim) {
      for (let i = 1; i <= COUNT_UP_FRAMES; i++) {
        const f = i / COUNT_UP_FRAMES;
        draw({
          ...first,
          read: Math.round(first.read * f),
          words: Math.round(first.words * f),
          price: { ...first.price, value: first.price.value * f },
        });
        await new Promise((r) => setTimeout(r, COUNT_UP_MS / COUNT_UP_FRAMES));
      }
    }
    draw(first, true);
    prev = first;
  } else draw(engine.snapshot());

  const code = await exited;
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
  return code;
}
