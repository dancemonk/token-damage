import { join } from "node:path";
import type { Adapter } from "../contract.js";
import { noSqliteWarning } from "../sqlite.js";
import { antigravityRoots, findDatabases } from "./discover.js";
import { emptyAntigravityStats, scanAntigravity } from "./index.js";

export const antigravityAdapter: Adapter = {
  id: "antigravity",
  flag: "antigravity-dir",
  help: "Antigravity data dir (default ~/.gemini/antigravity*, or ANTIGRAVITY_DATA_DIR)",
  fixtureDir: "antigravity",
  env: "ANTIGRAVITY_DATA_DIR",
  roots: antigravityRoots,
  where: (roots) => roots,
  reader(roots) {
    const stats = emptyAntigravityStats();
    return {
      // Databases are read whole and merged across each other.
      scan: () => scanAntigravity(roots, stats),
      found: () => stats.databases,
      warnings: () =>
        stats.noSqlite > 0 ? [noSqliteWarning("antigravity")] : [],
    };
  },
  // Each database, its write-ahead log, and the prompt history.
  live: {
    async files(roots) {
      const out: string[] = [];
      for (const db of await findDatabases(roots)) out.push(db, `${db}-wal`);
      for (const root of roots) out.push(join(root, "history.jsonl"));
      return out;
    },
    lookbackMs: null,
    newFileForcesReconcile: false,
  },
  // Antigravity writes no tool version into its databases: never flagged.
  oracle: { command: "antigravity", foldTotal: true },
};
