import {
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  claudeRoots,
  emptyStats,
  findTranscripts,
  scanClaude,
  subagentOf,
} from "../../src/index.js";

describe("claudeRoots", () => {
  it("defaults to the legacy and current roots", () => {
    expect(claudeRoots({}, "/h")).toEqual(["/h/.config/claude", "/h/.claude"]);
  });

  it("uses CLAUDE_CONFIG_DIR alone, comma-separated, trimmed, deduped, ~ expanded", () => {
    expect(claudeRoots({ CLAUDE_CONFIG_DIR: " /a , ~/b,,/a/ " }, "/h")).toEqual(
      ["/a", "/h/b"],
    );
  });

  it("ignores an empty CLAUDE_CONFIG_DIR", () => {
    expect(claudeRoots({ CLAUDE_CONFIG_DIR: " , " }, "/h")).toEqual([
      "/h/.config/claude",
      "/h/.claude",
    ]);
  });
});

describe("subagentOf", () => {
  it("reads parent session and agent id from the path", () => {
    expect(
      subagentOf("/r/projects/-p-a/sess-1/subagents/agent-abc.jsonl"),
    ).toEqual({
      parentSessionId: "sess-1",
      agentId: "abc",
    });
    expect(subagentOf("/r/projects/-p-a/sess-1.jsonl")).toBeUndefined();
  });
});

describe("findTranscripts", () => {
  let dir: string;
  const touch = async (rel: string) => {
    await mkdir(join(dir, rel, ".."), { recursive: true });
    await writeFile(join(dir, rel), "");
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "td-discover-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("finds flat, nested and subagent transcripts and nothing else", async () => {
    await touch("a/projects/-p-a/s1.jsonl");
    await touch("a/projects/-p-a/s2/deep/x.jsonl");
    await touch("a/projects/-p-a/s2/subagents/agent-q1.jsonl");
    await touch("a/projects/-p-a/s2/subagents/agent-q1.meta.json");
    await touch("a/projects/-p-a/s2/tool-results/out.txt");
    await touch("a/projects/-p-a/memory/notes.md");
    await touch("b/projects/-p-b/s3.jsonl");

    const files = await findTranscripts([
      join(dir, "a"),
      join(dir, "missing"),
      join(dir, "b"),
    ]);
    const rel = files.map((f) => ({
      ...f,
      path: f.path.slice(f.path.indexOf("/projects/")),
    }));
    expect(rel).toEqual([
      { path: "/projects/-p-a/s1.jsonl" },
      { path: "/projects/-p-a/s2/deep/x.jsonl" },
      {
        path: "/projects/-p-a/s2/subagents/agent-q1.jsonl",
        subagent: { parentSessionId: "s2", agentId: "q1" },
      },
      { path: "/projects/-p-b/s3.jsonl" },
    ]);
  });

  it("reads a projects directory once when two roots point at it", async () => {
    await touch("real/projects/-p-a/s1.jsonl");
    await symlink(join(dir, "real"), join(dir, "alias"));
    const files = await findTranscripts([
      join(dir, "real"),
      join(dir, "alias"),
    ]);
    expect(files).toHaveLength(1);
  });
});

describe("scanClaude", () => {
  it("streams events from every transcript and counts files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "td-scan-"));
    try {
      const fixtures = fileURLToPath(
        new URL("../../fixtures/claude/2.1.281/", import.meta.url),
      );
      const session = join(dir, "projects", "-p-a");
      await mkdir(join(session, "s1", "subagents"), { recursive: true });
      await copyFile(join(fixtures, "normal.jsonl"), join(session, "s1.jsonl"));
      await copyFile(
        join(
          fixtures,
          "subagent/4aaff5d2-be7b-4975-9f06-ceeb9fcdd99a/subagents/agent-a17725cd7adf9ae7d.jsonl",
        ),
        join(session, "s1", "subagents", "agent-q1.jsonl"),
      );

      const stats = { ...emptyStats(), files: 0, subagentFiles: 0 };
      const events = [];
      for await (const event of scanClaude([dir], stats)) events.push(event);

      expect(events).toHaveLength(4);
      expect(stats).toMatchObject({ files: 2, subagentFiles: 1, events: 4 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
