import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  hashPath,
  loadCache,
  sanitizeIds,
  saveCache,
  type TodayCache,
} from "../../src/live/cache.js";
import { T0, prompt, usage } from "./support.js";

let dir = "";
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "td-cache-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const cache = (over: Partial<TodayCache> = {}): TodayCache => ({
  version: 1,
  day: "2026-09-24",
  savedAt: T0,
  engine: {
    version: 1,
    day: "2026-09-24",
    usage: [usage({ ts: T0 })],
    prompts: [prompt({ ts: T0 })],
    events: [],
    limits: null,
  },
  sources: {
    tails: { [hashPath("/x/y.jsonl")]: { offset: 3, size: 3 } },
    seen: {},
    old: [],
  },
  ...over,
});

describe("today cache", () => {
  it("round-trips and creates the directory", async () => {
    const path = join(dir, "deep", "today.json");
    const c = cache();
    await saveCache(c, path);
    expect(await loadCache("2026-09-24", path)).toEqual(c);
    expect(await readdir(join(dir, "deep"))).toEqual(["today.json"]); // no temp file left behind
  });

  it("discards another day, a torn file and a missing file", async () => {
    const path = join(dir, "other.json");
    await saveCache(cache(), path);
    expect(await loadCache("2026-09-25", path)).toBeNull();
    await writeFile(path, '{"version":1,"day":"2026-09-24","sav');
    expect(await loadCache("2026-09-24", path)).toBeNull();
    expect(await loadCache("2026-09-24", join(dir, "missing.json"))).toBeNull();
  });

  it("writes no path-like id", async () => {
    const path = join(dir, "ids.json");
    const leaky = cache();
    leaky.engine.usage = [
      usage({
        ts: T0,
        sessionId: "/Users/someone/.codex/sessions/rollout.jsonl",
        dedupeKey: "k|/tmp/x",
      }),
    ];
    await saveCache(leaky, path);
    const text = await readFile(path, "utf8");
    expect(text).not.toContain("/Users/");
    expect(text).not.toContain("/tmp/");
    const loaded = await loadCache("2026-09-24", path);
    expect(loaded?.engine.usage[0]?.sessionId).toBe(
      hashPath("/Users/someone/.codex/sessions/rollout.jsonl"),
    );
  });

  it("sanitizes consistently so parent links survive", () => {
    const state = cache().engine;
    state.usage = [
      usage({ ts: T0, sessionId: "/p/child", parentSessionId: "/p/root" }),
      usage({ ts: T0, sessionId: "/p/root" }),
    ];
    const clean = sanitizeIds(state);
    expect(clean.usage[0]?.parentSessionId).toBe(clean.usage[1]?.sessionId);
    expect(clean.usage[0]?.sessionId).toBe(hashPath("/p/child"));
  });

  it("hashes Windows-style path ids", async () => {
    const path = join(dir, "windows.json");
    const winPaths = cache();
    winPaths.engine.usage = [
      usage({
        ts: T0,
        sessionId: "C:\\Users\\someone\\.codex\\sessions\\rollout.jsonl",
        dedupeKey: "k|C:\\tmp\\x",
      }),
    ];
    await saveCache(winPaths, path);
    const text = await readFile(path, "utf8");
    expect(text).not.toContain("Users");
    expect(text).not.toContain("tmp");
    const loaded = await loadCache("2026-09-24", path);
    expect(loaded?.engine.usage[0]?.sessionId).toBe(
      hashPath("C:\\Users\\someone\\.codex\\sessions\\rollout.jsonl"),
    );
  });
});
