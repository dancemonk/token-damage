import type { Adapter } from "../contract.js";
import { findDatabase, opencodeDirs } from "./discover.js";
import { scanOpenCode } from "./index.js";
import { emptyOpenCodeStats } from "./parse.js";

export const opencodeAdapter: Adapter = {
  id: "opencode",
  flag: "opencode-dir",
  help: "OpenCode data dir (default ~/.local/share/opencode, or OPENCODE_DATA_DIR)",
  fixtureDir: "opencode",
  env: "OPENCODE_DATA_DIR",
  roots: opencodeDirs,
  where: (dirs) => dirs,
  reader(dirs) {
    const stats = emptyOpenCodeStats();
    return {
      // One database per data dir: always read whole.
      scan: () => scanOpenCode(dirs, stats),
      found: () => stats.databases + stats.files,
      warnings: () =>
        stats.noSqlite > 0
          ? [
              `opencode needs node 22.13 or newer to read its database (this is ${process.versions.node}); skipped.`,
            ]
          : [],
    };
  },
  // The database and its write-ahead log; SQLite applies the log on open.
  live: {
    async files(dirs) {
      const out: string[] = [];
      for (const d of dirs) {
        const db = await findDatabase(d);
        if (db) out.push(db, `${db}-wal`);
      }
      return out;
    },
    lookbackMs: null,
    newFileForcesReconcile: false,
  },
  tested: [1, 17],
  oracle: { command: "opencode", foldTotal: true },
};
