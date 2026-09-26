import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sanitizeLine } from "../scripts/sanitize-fixture.js";

const SESSIONS = fileURLToPath(
  new URL("../fixtures/grok/grok/sessions/p/", import.meta.url),
);
// fixtures.test.ts checks every .jsonl; the real sessions' summaries are JSON files, checked here.
const real = readdirSync(SESSIONS).filter((d) => !d.startsWith("trap-"));

describe("Grok fixture summaries are sanitized", () => {
  it("has the owner's real sessions", () => expect(real.length).toBe(3));
  it.each(real)("%s/summary.json", (dir) => {
    // Prettier formats fixture JSON; compare the parsed objects.
    const summary: unknown = JSON.parse(
      readFileSync(join(SESSIONS, dir, "summary.json"), "utf8"),
    );
    expect(JSON.parse(sanitizeLine(JSON.stringify(summary)) ?? "null")).toEqual(
      summary,
    );
  });
});
