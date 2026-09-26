import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { antigravityRoots } from "../../src/adapters/antigravity/discover.js";
import { historyPrompt } from "../../src/adapters/antigravity/history.js";
import {
  emptyAntigravityStats,
  scanAntigravity,
} from "../../src/adapters/antigravity/index.js";
import type { PromptEvent, UsageEvent } from "../../src/types.js";
import { encode } from "../../scripts/antigravity-proto.js";

const collect = async (roots: string[]) => {
  const stats = emptyAntigravityStats();
  const out: (UsageEvent | PromptEvent)[] = [];
  for await (const r of scanAntigravity(roots, stats)) out.push(r);
  return { out, stats };
};

describe("antigravityRoots", () => {
  it("uses ANTIGRAVITY_DATA_DIR when set, even empty, else five defaults", () => {
    expect(
      antigravityRoots({ ANTIGRAVITY_DATA_DIR: " /a, ~/b ,/a" }, "/h"),
    ).toEqual(["/a", "/h/b"]);
    expect(antigravityRoots({ ANTIGRAVITY_DATA_DIR: "" }, "/h")).toEqual([]);
    expect(antigravityRoots({}, "/h")).toEqual([
      "/h/.gemini/antigravity",
      "/h/.gemini/antigravity-cli",
      "/h/.gemini/antigravity-ide",
      "/h/.gemini/antigravity-backup",
      "/h/.config/antigravity",
    ]);
  });
});

describe("historyPrompt", () => {
  const line = (o: object) =>
    JSON.stringify({
      conversationId: "c1",
      timestamp: 1_790_000_000_000,
      workspace: "/p/a",
      ...o,
    });
  it("counts typed prompts, shell commands and slash-command arguments", () => {
    expect(historyPrompt(line({ display: "fix the bug" }))).toMatchObject({
      source: "antigravity",
      sessionId: "c1",
      words: 3,
    });
    expect(
      historyPrompt(line({ display: "git status", type: "shell" }))?.words,
    ).toBe(2);
    expect(
      historyPrompt(
        line({ display: "/model gemini flash", type: "slash_command" }),
      )?.words,
    ).toBe(2);
  });
  it("skips a bare slash command, an unknown type, a row without a conversation and bad JSON", () => {
    expect(
      historyPrompt(line({ display: "/clear", type: "slash_command" })),
    ).toBeUndefined();
    expect(
      historyPrompt(line({ display: "x", type: "other" })),
    ).toBeUndefined();
    expect(
      historyPrompt(JSON.stringify({ display: "x", timestamp: 1 })),
    ).toBeUndefined();
    expect(historyPrompt("{")).toBeUndefined();
  });
});

describe("scanAntigravity", () => {
  it("skips a malformed row and an empty database, and reads a database another process holds open", async () => {
    const root = await mkdtemp(join(tmpdir(), "td-agy-"));
    await mkdir(join(root, "conversations"));
    const path = join(root, "conversations", "c1.db");
    const writer = new DatabaseSync(path);
    writer.exec(
      "PRAGMA journal_mode = WAL; CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, data BLOB);",
    );
    writer.prepare("INSERT INTO gen_metadata VALUES (?, ?)").run(
      0,
      encode([
        [
          1,
          [
            [
              4,
              [
                [2, 5],
                [3, 1],
              ],
            ],
          ],
        ],
      ]),
    );
    writer
      .prepare("INSERT INTO gen_metadata VALUES (?, ?)")
      .run(1, Uint8Array.from([0xff]));
    await writeFile(join(root, "conversations", "empty.db"), "");
    try {
      const { out, stats } = await collect([root]);
      expect(
        out.map(
          (r) =>
            r.kind === "usage" && [r.source, r.sessionId, r.input, r.output],
        ),
      ).toEqual([["antigravity", "c1", 5, 1]]);
      expect(stats).toMatchObject({
        databases: 1,
        malformed: 1,
        unreadable: 0,
      });
    } finally {
      writer.close();
    }
  });
  it("does not decode an unchanged database twice", async () => {
    const root = await mkdtemp(join(tmpdir(), "td-agy-"));
    await mkdir(join(root, "conversations"));
    const db = new DatabaseSync(join(root, "conversations", "c2.db"));
    db.exec("CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, data BLOB);");
    db.prepare("INSERT INTO gen_metadata VALUES (?, ?)").run(
      0,
      encode([[1, [[4, [[2, 5]]]]]]),
    );
    db.close();
    const first = await collect([root]);
    const second = await collect([root]);
    expect([first.stats.decoded, second.stats.decoded]).toEqual([1, 0]);
    expect(second.out).toEqual(first.out);
  });
});
