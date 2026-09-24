import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codexHomes, findRollouts } from "../../src/index.js";

describe("codexHomes", () => {
  it("defaults to ~/.codex", () => {
    expect(codexHomes({}, "/h")).toEqual(["/h/.codex"]);
  });

  it("uses CODEX_HOME alone, comma-separated, trimmed, deduped, ~ expanded", () => {
    expect(codexHomes({ CODEX_HOME: " ~/a, /b ,~/a" }, "/h")).toEqual([
      "/h/a",
      "/b",
    ]);
  });

  it("ignores an empty CODEX_HOME", () => {
    expect(codexHomes({ CODEX_HOME: " , " }, "/h")).toEqual(["/h/.codex"]);
  });
});

describe("findRollouts", () => {
  let dir: string;
  const touch = async (rel: string) => {
    await mkdir(join(dir, rel, ".."), { recursive: true });
    await writeFile(join(dir, rel), "");
  };

  beforeEach(async () => {
    // Rollout paths come back resolved; macOS tmpdir is a symlink.
    dir = await realpath(await mkdtemp(join(tmpdir(), "td-codex-")));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("finds active rollouts before archived ones, and nothing else", async () => {
    await touch("h/sessions/2026/09/01/rollout-b.jsonl");
    await touch("h/sessions/2026/08/01/rollout-a.jsonl");
    await touch("h/sessions/2026/08/01/notes.txt");
    await touch("h/archived_sessions/rollout-0.jsonl");
    await touch("h/history.jsonl");
    expect(await findRollouts([join(dir, "h")])).toEqual([
      join(dir, "h/sessions/2026/08/01/rollout-a.jsonl"),
      join(dir, "h/sessions/2026/09/01/rollout-b.jsonl"),
      join(dir, "h/archived_sessions/rollout-0.jsonl"),
    ]);
  });

  it("keeps the active copy when both directories hold the same relative path", async () => {
    await touch("h/sessions/rollout-x.jsonl");
    await touch("h/archived_sessions/rollout-x.jsonl");
    await touch("h/archived_sessions/rollout-y.jsonl");
    expect(await findRollouts([join(dir, "h")])).toEqual([
      join(dir, "h/sessions/rollout-x.jsonl"),
      join(dir, "h/archived_sessions/rollout-y.jsonl"),
    ]);
  });

  it("reads a directory once when two homes point at it, and skips missing homes", async () => {
    await touch("h/sessions/rollout-x.jsonl");
    await symlink(join(dir, "h"), join(dir, "link"));
    expect(
      await findRollouts([join(dir, "h"), join(dir, "link"), join(dir, "no")]),
    ).toEqual([join(dir, "h/sessions/rollout-x.jsonl")]);
  });
});
