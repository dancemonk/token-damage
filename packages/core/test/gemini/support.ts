import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  emptyGeminiStats,
  readLines,
  scanGemini,
  type PromptEvent,
  type UsageEvent,
} from "../../src/index.js";
import { readJsonlChat } from "../../src/adapters/gemini/parse.js";

/** A Gemini CLI data dir (`~/.gemini/tmp`): `<project>/chats/`. */
export const GEMINI_FIXTURES = fileURLToPath(
  new URL("../../fixtures/gemini/tmp/", import.meta.url),
);

export const chat = (project: string, name: string) =>
  join(GEMINI_FIXTURES, project, "chats", name);

export const TWO_MODELS = chat("p1", "session-2026-04-28T13-22-e1b7bbb6.jsonl");
export const RESUMED = chat("p2", "session-2026-05-30T04-11-f88c20d5.jsonl");
export const SUBAGENT = chat(
  "p2",
  "f88c20d5-2d60-4f7e-978e-650ccb1c800d/5ab0c0de-0000-4000-8000-000000000003.jsonl",
);
export const LEGACY = chat("p3", "session-2025-10-02T09-00-1e9ac701.json");
export const TRAPS = chat("p3", "session-2025-10-03T10-00-7a0c0de2.jsonl");

export const read = (path: string, stats = emptyGeminiStats()) =>
  readJsonlChat(readLines(path), "stem", 0, stats);

/** The whole fixture data dir, scanned. Not deduped. */
export async function scanFixtures(stats = emptyGeminiStats()) {
  const usage: UsageEvent[] = [];
  const prompts: PromptEvent[] = [];
  for await (const r of scanGemini([GEMINI_FIXTURES], stats)) {
    if (r.kind === "usage") usage.push(r);
    else prompts.push(r);
  }
  return { usage, prompts, stats };
}
