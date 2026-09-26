import { antigravityAdapter } from "./antigravity/adapter.js";
import { claudeAdapter } from "./claude/adapter.js";
import { codexAdapter } from "./codex/adapter.js";
import type { Adapter } from "./contract.js";
import { geminiAdapter } from "./gemini/adapter.js";
import { grokAdapter } from "./grok/adapter.js";
import { opencodeAdapter } from "./opencode/adapter.js";

/** Every agent Token Damage reads, in the order it scans and lists them. Adding one: AGENTS.md §Adding an agent. */
export const ADAPTERS: readonly Adapter[] = [
  claudeAdapter,
  codexAdapter,
  geminiAdapter,
  opencodeAdapter,
  antigravityAdapter,
  grokAdapter,
];
