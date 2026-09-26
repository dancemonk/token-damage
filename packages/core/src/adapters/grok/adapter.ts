import { join } from "node:path";
import type { Adapter } from "../contract.js";
import { findUpdates, grokRoots } from "./discover.js";
import { emptyGrokStats, scanGrok } from "./index.js";

export const grokAdapter: Adapter = {
  id: "grok",
  flag: "grok-home",
  help: "Grok Build home (default ~/.grok, or GROK_HOME)",
  fixtureDir: "grok",
  env: "GROK_HOME",
  roots: grokRoots,
  where: (roots) => roots.map((r) => join(r, "sessions")),
  reader(roots) {
    const stats = emptyGrokStats();
    return {
      scan: (only) => scanGrok(roots, stats, only),
      found: () => stats.files,
      warnings: () => [],
    };
  },
  // A session file only grows while its session runs: files changed today hold today's turns.
  live: { files: findUpdates, lookbackMs: 0, newFileForcesReconcile: false },
  // Grok writes no CLI version into its sessions: never flagged.
  oracle: { command: "grok", foldTotal: false },
};
