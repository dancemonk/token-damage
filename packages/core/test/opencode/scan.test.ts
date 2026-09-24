import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import {
  createDeduper,
  emptyOpenCodeStats,
  findDatabase,
  legacyMessageFiles,
  modelKey,
  opencodeDirs,
  opencodeModelName,
  priceFor,
} from "../../src/index.js";
import {
  partWords,
  usageOf,
  v2UsageOf,
} from "../../src/adapters/opencode/parse.js";
import { sanitizeLine } from "../../scripts/sanitize-fixture.js";
import { OPENCODE_FIXTURES, scanFixtures } from "./support.js";

const temp = mkdtempSync(join(tmpdir(), "td-opencode-"));
afterAll(() => rmSync(temp, { recursive: true, force: true }));
let dirs = 0;
const tempDir = () => {
  const dir = join(temp, String(dirs++));
  mkdirSync(dir);
  return dir;
};

/** A database with OpenCode's `message` table; rows are [id, session, time_created, payload]. */
function database(
  path: string,
  messages: [string, string, number, unknown][],
  journal = "DELETE",
) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode = ${journal}`);
  db.exec(
    "CREATE TABLE message (id text PRIMARY KEY, session_id text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL)",
  );
  const insert = db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)");
  for (const [id, session, created, payload] of messages)
    insert.run(id, session, created, created, JSON.stringify(payload));
  return db;
}

const reply = (created?: number) => ({
  role: "assistant",
  modelID: "gpt-5.5",
  providerID: "openai",
  ...(created !== undefined && { time: { created } }),
  tokens: { input: 10, output: 2, cache: { read: 0, write: 0 } },
});

describe("discovery", () => {
  it("uses OPENCODE_DATA_DIR alone when set, else XDG_DATA_HOME, else ~/.local/share", () => {
    expect(opencodeDirs({ OPENCODE_DATA_DIR: " ~/a, /b ,~/a" }, "/h")).toEqual([
      "/h/a",
      "/b",
    ]);
    expect(opencodeDirs({ OPENCODE_DATA_DIR: "" }, "/h")).toEqual([]);
    expect(opencodeDirs({ XDG_DATA_HOME: "/x" }, "/h")).toEqual([
      "/x/opencode",
    ]);
    expect(opencodeDirs({ XDG_DATA_HOME: "rel" }, "/h")).toEqual([
      "/h/.local/share/opencode",
    ]);
  });

  it("reads opencode.db, else the first channel database by name", async () => {
    expect(await findDatabase(OPENCODE_FIXTURES)).toBe(
      join(OPENCODE_FIXTURES, "opencode.db"),
    );
    const dir = tempDir();
    expect(await legacyMessageFiles(dir)).toEqual([]);
    for (const name of [
      "opencode-zeta.db",
      "opencode-beta.db",
      "opencode-x.y.db",
      "other.db",
    ])
      writeFileSync(join(dir, name), "");
    expect(await findDatabase(dir)).toBe(join(dir, "opencode-beta.db"));
    expect(await findDatabase(join(dir, "missing"))).toBeUndefined();
  });
});

describe("payloads", () => {
  it("spells Claude versions as Anthropic does and drops a gateway's vendor prefix", () => {
    expect(opencodeModelName("claude-sonnet-4.5")).toBe("claude-sonnet-4-5");
    expect(opencodeModelName("claude-sonnet-4.5-20250929")).toBe(
      "claude-sonnet-4-5-20250929",
    );
    expect(opencodeModelName("claude-opus-45")).toBe("claude-opus-4-5");
    expect(opencodeModelName("claude-opus-4")).toBe("claude-opus-4");
    expect(opencodeModelName("anthropic/claude-haiku-4.5")).toBe(
      "claude-haiku-4-5",
    );
    expect(opencodeModelName("gemini-3-pro-high")).toBe("gemini-3-pro-preview");
    expect(opencodeModelName("k2p6")).toBe("kimi-k2.6");
    expect(opencodeModelName("gpt-5.5")).toBe("gpt-5.5");
  });

  it("bills reasoning and tokens only the total has as output", () => {
    const m = { modelID: "m", providerID: "p" };
    expect(
      usageOf({
        ...m,
        tokens: {
          input: 100,
          output: 50,
          reasoning: 25,
          cache: { read: 200, write: 5 },
          total: 400,
        },
      }),
    ).toMatchObject({ input: 100, cacheRead: 200, cacheWrite: 5, output: 95 });
    expect(usageOf({ ...m, tokens: { total: 1000 } })?.output).toBe(1000);
    // Strings, fractions and negatives are no count; a cache that is no object is no cache.
    expect(
      usageOf({
        ...m,
        tokens: {
          input: "100",
          output: 2.5,
          reasoning: -1,
          cache: 7,
          total: 3,
        },
      }),
    ).toMatchObject({ input: 0, cacheRead: 0, output: 3 });
  });

  it("drops what ccusage drops: no tokens, no model or provider, all zero", () => {
    const tokens = { input: 1, output: 1 };
    expect(usageOf({ modelID: "m", providerID: "p" })).toBeUndefined();
    expect(usageOf({ modelID: "m", tokens })).toBeUndefined();
    expect(usageOf({ providerID: "p", tokens })).toBeUndefined();
    expect(usageOf({ modelID: " ", providerID: "p", tokens })).toBeUndefined();
    expect(
      usageOf({
        modelID: "m",
        providerID: "p",
        tokens: { input: 0, cache: {} },
      }),
    ).toBeUndefined();
    expect(
      v2UsageOf({ model: { id: "gpt-5.4", providerID: "openai" }, tokens }),
    ).toMatchObject({ model: "gpt-5.4", provider: "openai" });
  });

  it("counts typed text parts only", () => {
    expect(partWords({ type: "text", text: "fix the build" })).toBe(3);
    expect(
      partWords({ type: "text", text: "tool output", synthetic: true }),
    ).toBeUndefined();
    expect(
      partWords({ type: "text", text: "old", ignored: true }),
    ).toBeUndefined();
    expect(partWords({ type: "file", filename: "a" })).toBeUndefined();
  });
});

describe("scan", () => {
  it("reads the fixture corpus as ccusage does", async () => {
    const { usage, prompts, stats } = await scanFixtures();
    expect(stats).toMatchObject({
      databases: 1,
      files: 3,
      events: 147,
      prompts: 10,
      duplicates: 2,
      unreadable: 0,
    });
    const byId = new Map(usage.map((e) => [e.messageId, e]));
    expect(byId.get("msg_trap_total_extra")).toMatchObject({
      input: 100,
      cacheRead: 200,
      output: 100,
    });
    // Nested subagents count toward the session at the top.
    expect(byId.get("msg_trap_claude_dotted")).toMatchObject({
      source: "opencode",
      model: "claude-sonnet-4-5",
      sessionId: "ses_trap_grandchild",
      parentSessionId: "ses_trap_root",
      agentId: "ses_trap_grandchild",
      version: "1.17.18",
      cacheWrite: 1500,
    });
    // v2 rows; a payload without time.created is dated by its row.
    expect(byId.get("msg_v2_assistant")?.output).toBe(50);
    expect(new Date(byId.get("msg_v2_row_time")!.ts).toISOString()).toBe(
      "2026-07-11T09:00:00.000Z",
    );
    // The legacy file named after a database id is never read; the channel database is not opened.
    expect(usage.some((e) => e.input >= 5_000_000)).toBe(false);
    expect(byId.get("msg_legacy_1")?.sessionId).toBe("ses_legacy");
    expect(byId.has("msg_trap_no_provider")).toBe(false);
    expect(byId.has("msg_trap_zero")).toBe(false);

    const trap = prompts.find((p) => p.dedupeKey === "opencode|msg_trap_user");
    expect(trap?.words).toBe(7);
    expect(prompts.some((p) => p.sessionId === "ses_trap_child")).toBe(false);
  });

  it("dedupes nothing that ccusage counts, and counts a message once across data dirs", async () => {
    const { usage, stats } = await scanFixtures([
      OPENCODE_FIXTURES,
      OPENCODE_FIXTURES,
    ]);
    expect(usage).toHaveLength(147);
    expect(stats.duplicates).toBe(147 + 2 + 2);
    const deduper = createDeduper();
    for (const e of usage) deduper.add(e);
    expect(deduper.result()).toHaveLength(usage.length);
  });

  it("prices OpenCode models by name: Claude exactly, Gemini Pro long context, aliases as a guess", async () => {
    const { usage } = await scanFixtures();
    const key = (id: string) =>
      modelKey(usage.find((e) => e.messageId === id)!);
    expect(key("msg_trap_gemini_long")).toBe("gemini-2.5-pro|long");
    expect(key("msg_trap_total_extra")).toBe("gpt-5.5");
    expect(priceFor(key("msg_trap_vendor_prefix"))?.isFallback).toBe(false);
    expect(priceFor(key("msg_trap_claude_dotted"))?.isFallback).toBe(false);
    expect(priceFor(key("msg_trap_alias"))?.isFallback).toBe(true);
    expect(priceFor("glm-5.2")).toBeUndefined();
  });

  it("reads rows still in the -wal file while OpenCode has the database open", async () => {
    const dir = tempDir();
    const writer = database(join(dir, "opencode.db"), [], "WAL");
    writer.exec("PRAGMA wal_autocheckpoint = 0");
    writer
      .prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)")
      .run("w1", "s1", 1, 1, JSON.stringify(reply(Date.UTC(2026, 6, 1))));
    try {
      const { usage } = await scanFixtures([dir]);
      expect(usage.map((e) => e.messageId)).toEqual(["w1"]);
    } finally {
      writer.close();
    }
  });

  it("dates a payload without time.created by its row, and skips an unreadable database", async () => {
    const dir = tempDir();
    const created = Date.UTC(2026, 6, 2, 5);
    database(join(dir, "opencode.db"), [
      ["m1", "s1", created, reply()],
    ]).close();
    const { usage } = await scanFixtures([dir]);
    expect(usage[0]?.ts).toBe(created);

    const broken = tempDir();
    writeFileSync(join(broken, "opencode.db"), "not a database");
    const stats = emptyOpenCodeStats();
    await scanFixtures([broken], stats);
    expect(stats).toMatchObject({ unreadable: 1, events: 0 });
  });
});

describe("fixture database contains no real text", () => {
  // Constructed rows carry invented text (fixtures/opencode/README.md).
  const invented = /^(?:msg_trap_|msg_v2_|prt_trap_)/;

  it("every copied payload is already sanitized", () => {
    const db = new DatabaseSync(join(OPENCODE_FIXTURES, "opencode.db"), {
      readOnly: true,
    });
    let checked = 0;
    for (const table of ["message", "part"]) {
      for (const r of db.prepare(`SELECT id, data FROM ${table}`).all()) {
        if (invented.test(String(r.id))) continue;
        expect(sanitizeLine(String(r.data))).toBe(r.data);
        checked++;
      }
    }
    for (const r of db.prepare("SELECT * FROM session").all())
      for (const [col, v] of Object.entries(r))
        if (
          typeof v === "string" &&
          !["id", "parent_id", "version"].includes(col)
        )
          expect(["x", "p"]).toContain(v);
    db.close();
    expect(checked).toBeGreaterThan(100);
  });
});
