import { join } from "node:path";
import type { Adapter } from "../contract.js";
import { claudeRoots } from "./discover.js";
import { scanClaude } from "./index.js";
import { emptyStats } from "./parse.js";

export const claudeAdapter: Adapter = {
  id: "claude-code",
  flag: "config-dir",
  help: "Claude Code config dir (default ~/.claude, or CLAUDE_CONFIG_DIR)",
  fixtureDir: "",
  env: "CLAUDE_CONFIG_DIR",
  roots: claudeRoots,
  where: (roots) => roots.map((r) => join(r, "projects")),
  reader(roots) {
    const stats = { ...emptyStats(), files: 0, subagentFiles: 0 };
    return {
      scan: () => scanClaude(roots, stats),
      found: () => stats.files,
      warnings: () => [],
    };
  },
  live: "tail",
  tested: [2, 1],
  oracle: { command: "claude", foldTotal: false },
};
