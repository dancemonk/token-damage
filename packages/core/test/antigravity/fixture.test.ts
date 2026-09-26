import { existsSync, readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  encode,
  GENERATION,
  project,
  STEP,
  TRAJECTORY,
  type Shape,
} from "../../scripts/antigravity-proto.js";

const ROOT = fileURLToPath(
  new URL("../../fixtures/antigravity/antigravity/", import.meta.url),
);
const CONVERSATIONS = join(ROOT, "conversations");
const dbs = existsSync(CONVERSATIONS)
  ? readdirSync(CONVERSATIONS).filter((f) => f.endsWith(".db"))
  : [];
const TABLES: [string, string, Shape][] = [
  ["gen_metadata", "data", GENERATION],
  ["steps", "metadata", STEP],
  ["trajectory_metadata_blob", "data", TRAJECTORY],
];

describe("Antigravity fixture holds nothing but whitelisted fields", () => {
  it("has databases", () => expect(dbs.length).toBeGreaterThanOrEqual(3));
  it.each(dbs)("%s", (file) => {
    const db = new DatabaseSync(join(CONVERSATIONS, file), { readOnly: true });
    try {
      for (const [table, column, shape] of TABLES) {
        const has = db
          .prepare(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
          )
          .get(table);
        if (!has) continue;
        for (const r of db
          .prepare(`SELECT ${column} AS b FROM ${table}`)
          .all()) {
          if (!(r.b instanceof Uint8Array)) continue;
          expect(encode(project(r.b, shape))).toEqual(r.b);
        }
      }
    } finally {
      db.close();
    }
  });
  it("history has filler prompts and no workspace", () => {
    const lines = readFileSync(join(ROOT, "history.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const row = JSON.parse(line) as Record<string, unknown>;
      expect(String(row.display)).toMatch(/^(\/x|x)?( x)*$/);
      expect(row.workspace).toBe("/p/a");
    }
  });
});
