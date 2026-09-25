import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aggregate, createDeduper } from "../../src/index.js";
import {
  LiveSources,
  type LiveRecord,
  type SourceDirs,
} from "../../src/live/sources.js";

const FIXTURES = fileURLToPath(new URL("../../fixtures/", import.meta.url));
const hash = (p: string) => createHash("sha256").update(p).digest("hex");
let dir = "";

/** Every .jsonl under the corpus, relative. */
async function jsonlFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(root, {
    recursive: true,
    withFileTypes: true,
  }))
    if (entry.isFile() && entry.name.endsWith(".jsonl"))
      out.push(relative(root, join(entry.parentPath, entry.name)));
  return out.sort();
}

/** Claude fixtures as a config dir: `<root>/projects/-p-a/<flattened name>`, subagents kept under `<session>/subagents/`. */
async function claudeInto(root: string): Promise<void> {
  const src = join(FIXTURES, "claude");
  const project = join(root, "projects", "-p-a");
  for (const rel of await readdir(src, { recursive: true })) {
    if (!rel.endsWith(".jsonl")) continue;
    const parts = rel.split(sep);
    const at = parts.indexOf("subagents");
    const dest =
      at > 0
        ? join(project, ...parts.slice(at - 1))
        : join(project, parts.join("_"));
    await mkdir(dirname(dest), { recursive: true });
    await cp(join(src, rel), dest);
  }
}

function dirsOf(root: string): SourceDirs {
  return {
    claudeRoots: [root],
    codexHomes: [root],
    geminiDirs: [join(root, "tmp")],
    opencodeDirs: [join(root, "opencode")],
  };
}

function totals(records: LiveRecord[]) {
  const d = createDeduper();
  for (const r of records) d.add(r);
  return aggregate(
    { usage: d.result(), prompts: d.prompts() },
    { timeZone: "UTC" },
  ).totals;
}

// Deterministic "random" cut points so a failure reproduces.
function cuts(length: number, seed: number): number[] {
  const out = [0];
  let x = seed;
  while ((out.at(-1) as number) < length) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out.push(Math.min(length, (out.at(-1) as number) + 1 + (x % 900)));
  }
  return out;
}

beforeAll(async () => {
  // findTranscripts() resolves `<root>/projects` with realpath(); on macOS the mkdtemp root itself sits
  // under a symlink (/var -> /private/var), so tail keys must be hashed from the same resolved path.
  dir = await realpath(await mkdtemp(join(tmpdir(), "td-sources-")));
  await mkdir(join(dir, "full"));
  await claudeInto(join(dir, "full"));
  for (const corpus of ["codex", "gemini", "opencode"])
    await cp(join(FIXTURES, corpus), join(dir, "full"), { recursive: true });
}, 60_000);
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("LiveSources", () => {
  it("delta over appended writes equals the snapshot", async () => {
    const full = join(dir, "full");
    const live = join(dir, "live");
    await cp(full, live, { recursive: true });
    // Empty every .jsonl in the live copy; the test then re-grows them in chunks.
    const files = await jsonlFiles(full);
    const contents = new Map<string, Buffer>();
    for (const f of files) {
      contents.set(f, await readFile(join(full, f)));
      await writeFile(join(live, f), "");
    }
    const from = 0; // the corpora span years; take everything
    const snapshot = await new LiveSources(dirsOf(full), {
      from,
      hash,
    }).scanAll();
    const expected = totals(snapshot);
    expect(snapshot.some((r) => r.source === "claude-code")).toBe(true);
    expect(snapshot.some((r) => r.source === "codex")).toBe(true);

    const sources = new LiveSources(dirsOf(live), { from, hash });
    // Model the engine: Claude Code lines accumulate, each other agent's latest rescan replaces its pool.
    const claude: LiveRecord[] = [];
    const pools = new Map<string, LiveRecord[]>();
    const initial = await sources.scanAll();
    claude.push(...initial.filter((r) => r.source === "claude-code"));
    for (const src of ["codex", "gemini", "opencode"])
      pools.set(
        src,
        initial.filter((r) => r.source === src),
      );
    const written = new Map<string, number>(files.map((f) => [f, 0]));
    let round = 0;
    let pending = true;
    while (pending) {
      pending = false;
      for (const f of files) {
        const buf = contents.get(f) as Buffer;
        const points = cuts(buf.length, files.indexOf(f) + 7);
        const done = written.get(f) as number;
        const next = points.find((p) => p > done);
        if (next === undefined) continue;
        pending = true;
        await writeFile(join(live, f), buf.subarray(0, next));
        // Rewrites can land within one mtime tick; make every round's mtime strictly later.
        await utimes(
          join(live, f),
          new Date(),
          new Date(Date.now() + (round + 1) * 1000),
        );
        written.set(f, next);
      }
      round++;
      const polled = await sources.poll();
      expect(polled.records.every((r) => r.source === "claude-code")).toBe(
        true,
      );
      claude.push(...polled.records);
      for (const [src, recs] of Object.entries(polled.pools))
        pools.set(src, recs);
    }
    expect(round).toBeGreaterThan(3);
    expect(totals([...claude, ...[...pools.values()].flat()])).toEqual(
      expected,
    );
    // The state carries no path, only hashes.
    const state = JSON.stringify(sources.state());
    for (const f of files)
      expect(state).not.toContain(f.split("/").pop() as string);
  }, 120_000);

  it("re-reads a file that was rewritten shorter", async () => {
    const root = join(dir, "rewrite");
    await mkdir(root);
    await claudeInto(root);
    const [file] = (await jsonlFiles(root)).filter(
      (f) => !f.includes("subagents"),
    );
    const path = join(root, file as string);
    const sources = new LiveSources(dirsOf(root), { from: 0, hash });
    const before = totals(await sources.scanAll());
    const lines = (await readFile(path, "utf8")).split("\n").filter(Boolean);
    await writeFile(
      path,
      lines.slice(0, Math.ceil(lines.length / 2)).join("\n") + "\n",
    );
    const { records } = await sources.poll();
    // Re-adding the surviving half changes nothing (dedupe), and the tail restarted from zero.
    expect(records.length).toBeGreaterThan(0);
    expect(sources.state().tails[hash(path)]?.offset).toBe(
      (await stat(path)).size,
    );
    expect(before.calls).toBeGreaterThan(0);
  });

  it("scans only files that could hold today's records, remembering the rest as old", async () => {
    const root = join(dir, "today-only");
    await mkdir(join(root, "projects", "p"), { recursive: true });
    const from = Date.UTC(2026, 8, 24); // today's midnight, UTC
    const line = (id: string, ts: string) =>
      JSON.stringify({
        type: "assistant",
        uuid: id,
        sessionId: id,
        timestamp: ts,
        requestId: `r-${id}`,
        message: {
          id: `m-${id}`,
          model: "claude-opus-4-7",
          usage: { input_tokens: 5, output_tokens: 1 },
        },
      }) + "\n";
    const oldFile = join(root, "projects", "p", "old.jsonl");
    const newFile = join(root, "projects", "p", "new.jsonl");
    await writeFile(oldFile, line("old", "2026-09-20T10:00:00.000Z"));
    await writeFile(newFile, line("new", "2026-09-24T10:00:00.000Z"));
    const twoDaysBefore = new Date(from - 2 * 24 * 60 * 60 * 1000);
    const laterToday = new Date(from + 60 * 60 * 1000);
    await utimes(oldFile, twoDaysBefore, twoDaysBefore);
    await utimes(newFile, laterToday, laterToday);

    const sources = new LiveSources(dirsOf(root), { from, hash });
    const records = await sources.scanAll();
    expect(records.map((r) => r.kind)).toEqual(["usage"]);
    expect((records[0] as { sessionId: string }).sessionId).toBe("new");
    expect(sources.state().old).toEqual([hash(oldFile)]);
    // The old file was skipped outright: never opened, never turned into a tail.
    expect(sources.state().tails[hash(oldFile)]).toBeUndefined();
    expect(sources.state().tails[hash(newFile)]).toBeDefined();
  });

  it("reports new files and skips files older than the window", async () => {
    const root = join(dir, "new");
    await mkdir(join(root, "projects", "p"), { recursive: true });
    const sources = new LiveSources(dirsOf(root), {
      from: Date.UTC(2026, 8, 24),
      hash,
    });
    expect(await sources.scanAll()).toEqual([]);
    const line = JSON.stringify({
      type: "assistant",
      uuid: "u1",
      sessionId: "s1",
      timestamp: "2026-09-24T10:00:00.000Z",
      requestId: "r1",
      message: {
        id: "m1",
        model: "claude-opus-4-7",
        usage: { input_tokens: 5, output_tokens: 1 },
      },
    });
    await writeFile(join(root, "projects", "p", "s1.jsonl"), line + "\n");
    const first = await sources.poll();
    expect(first.newFiles).toBe(true);
    expect(first.records.map((r) => r.kind)).toEqual(["usage"]);
    expect((await sources.poll()).newFiles).toBe(false);
  });
});
