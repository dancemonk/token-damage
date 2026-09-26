import type { Adapter } from "../contract.js";
import { findChats, geminiDirs } from "./discover.js";
import { scanGemini } from "./index.js";
import { emptyGeminiStats } from "./parse.js";

export const geminiAdapter: Adapter = {
  id: "gemini",
  flag: "gemini-dir",
  // Retired for personal accounts on 2026-06-18 (replaced by Antigravity CLI); API keys and enterprise still run it.
  help: "Gemini CLI data dir, API-key and enterprise users (default ~/.gemini/tmp, or GEMINI_DATA_DIR)",
  fixtureDir: "tmp",
  env: "GEMINI_DATA_DIR",
  roots: geminiDirs,
  where: (dirs) => dirs,
  reader(dirs) {
    const stats = emptyGeminiStats();
    return {
      scan: (only) => scanGemini(dirs, stats, only),
      found: () => stats.files,
      warnings: () => [],
    };
  },
  live: {
    files: async (dirs) => (await findChats(dirs)).map((c) => c.path),
    lookbackMs: 0,
    newFileForcesReconcile: false,
  },
  // Gemini CLI writes no version into its chats: never flagged.
  oracle: { command: "gemini", foldTotal: true },
};
