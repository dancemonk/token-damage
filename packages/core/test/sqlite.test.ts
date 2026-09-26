import { mkdtemp } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  noSqliteWarning,
  readSqlite,
  rows,
  tableExists,
} from "../src/adapters/sqlite.js";

describe("readSqlite", () => {
  it("reads a database read-only and closes it", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "td-sqlite-")), "a.db");
    const db = new DatabaseSync(path);
    db.exec("CREATE TABLE t (n INTEGER); INSERT INTO t VALUES (1), (2);");
    db.close();
    const read = await readSqlite(path, (d) => ({
      has: tableExists(d, "t"),
      missing: tableExists(d, "u"),
      ns: [...rows(d, "SELECT n FROM t ORDER BY n")].map((r) => Number(r.n)),
    }));
    expect(read).toEqual({
      ok: true,
      value: { has: true, missing: false, ns: [1, 2] },
    });
  });
  it("reports a file it cannot open as unreadable", async () => {
    expect(await readSqlite("/nonexistent/x.db", () => 1)).toEqual({
      ok: false,
      reason: "unreadable",
    });
  });
  it("names the agent in the old-Node warning", () => {
    expect(noSqliteWarning("opencode")).toBe(
      `opencode needs node 22.13 or newer to read its database (this is ${process.versions.node}); skipped.`,
    );
  });
});
