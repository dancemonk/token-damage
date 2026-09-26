import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sanitizeLine } from "../scripts/sanitize-fixture.js";

const root = fileURLToPath(new URL("../fixtures", import.meta.url));
// Word counting needs real-looking prose, so these prompts are invented: the words fixtures (see their READMEs),
// the Gemini traps file (also a malformed line on purpose) and the generated sample-month corpus
// (scripts/sample-month.ts).
const INVENTED_TEXT = new Set([
  "claude/2.1.281/words-typed.jsonl",
  "codex/sessions/2026/09/22/rollout-2026-09-22T10-00-00-01a0c5f0-0000-7000-8000-000000000001.jsonl",
  "gemini/tmp/p3/chats/session-2025-10-03T10-00-7a0c0de2.jsonl",
  // Filler prose; its privacy is pinned by test/antigravity/fixture.test.ts.
  "antigravity/antigravity/history.jsonl",
]);
const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter(
  (f) =>
    f.endsWith(".jsonl") &&
    !INVENTED_TEXT.has(f) &&
    !f.startsWith("sample-month/"),
);

describe("fixtures contain no real text", () => {
  it("finds fixture files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s is already sanitized", (file) => {
    let pending = "";
    for (const line of readFileSync(join(root, file), "utf8").split("\n")) {
      if (line === "") continue;
      // Split records (malformed fixtures) are checked once rejoined.
      const record = pending + line;
      const clean = sanitizeLine(record);
      if (clean === undefined) {
        pending = record;
        continue;
      }
      pending = "";
      expect(clean).toBe(record);
    }
    expect(pending).toBe("");
  });
});
