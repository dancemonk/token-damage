import { join } from "node:path";
import type { Adapter } from "../contract.js";
import { codexHomes, findRollouts } from "./discover.js";
import { scanCodex } from "./index.js";
import { emptyCodexStats } from "./parse.js";

const DAY_MS = 86_400_000;

export const codexAdapter: Adapter = {
  id: "codex",
  flag: "codex-home",
  help: "Codex home (default ~/.codex, or CODEX_HOME)",
  fixtureDir: "",
  env: "CODEX_HOME",
  roots: codexHomes,
  where: (homes) =>
    homes.flatMap((h) => [join(h, "sessions"), join(h, "archived_sessions")]),
  reader(homes) {
    const stats = emptyCodexStats();
    return {
      scan: (only) => scanCodex(homes, stats, only),
      found: () => stats.files,
      warnings: () => [],
    };
  },
  // A fork's parent rollout can be two days old and still hold what today's fork replays.
  live: {
    files: findRollouts,
    lookbackMs: 2 * DAY_MS,
    newFileForcesReconcile: true,
  },
  tested: [0, 155],
  oracle: { command: "codex", foldTotal: false },
};
