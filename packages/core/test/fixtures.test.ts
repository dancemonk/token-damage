import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sanitizeLine } from "../scripts/sanitize-fixture.js";

const root = fileURLToPath(new URL("../fixtures", import.meta.url));
// Word counting needs real-looking prose, so these prompts are invented: the words fixture (see its README)
// and the generated sample-month corpus (scripts/sample-month.ts).
const INVENTED_TEXT = new Set(["claude/2.1.281/words-typed.jsonl"]);
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
