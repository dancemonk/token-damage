import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AGENTS } from "../src/agents.js";
import { ADAPTERS } from "../src/adapters/registry.js";
import type { PromptEvent, UsageEvent } from "../src/types.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/", import.meta.url));

describe("ADAPTERS", () => {
  it("has one adapter per agent, in AGENTS order", () => {
    expect(ADAPTERS.map((a) => a.id)).toEqual(Object.keys(AGENTS));
  });

  it("keeps flags, variables and oracle commands unique", () => {
    const unique = (xs: string[]) => new Set(xs).size === xs.length;
    expect(unique(ADAPTERS.map((a) => a.flag))).toBe(true);
    expect(unique(ADAPTERS.map((a) => a.env))).toBe(true);
    expect(unique(ADAPTERS.map((a) => a.oracle.command))).toBe(true);
  });

  it("keeps today's flags, variables and fixture places", () => {
    expect(ADAPTERS.map((a) => [a.flag, a.env, a.fixtureDir])).toEqual([
      ["config-dir", "CLAUDE_CONFIG_DIR", ""],
      ["codex-home", "CODEX_HOME", ""],
      ["gemini-dir", "GEMINI_DATA_DIR", "tmp"],
      ["opencode-dir", "OPENCODE_DATA_DIR", "opencode"],
      ["antigravity-dir", "ANTIGRAVITY_DATA_DIR", "antigravity"],
      ["grok-home", "GROK_HOME", "grok"],
    ]);
  });

  it("reads its own environment variable", () => {
    for (const a of ADAPTERS)
      expect(a.roots({ [a.env]: "/x" }, "/h"), a.id).toEqual(["/x"]);
  });

  it("says where it reads, as the receipt's scanning lines always have", () => {
    expect(
      Object.fromEntries(ADAPTERS.map((a) => [a.id, a.where(["/r"])])),
    ).toEqual({
      "claude-code": ["/r/projects"],
      codex: ["/r/sessions", "/r/archived_sessions"],
      gemini: ["/r"],
      opencode: ["/r"],
      antigravity: ["/r"],
      grok: ["/r/sessions"],
    });
  });

  // Claude Code's fixtures are grouped by version, not laid out as a config dir; the oracle copies them into one.
  it("finds records in its fixture corpus, where the oracle looks for it", async () => {
    for (const a of ADAPTERS.filter((x) => x.id !== "claude-code")) {
      const reader = a.reader([join(FIXTURES, a.oracle.command, a.fixtureDir)]);
      const records: (UsageEvent | PromptEvent)[] = [];
      for await (const r of reader.scan()) records.push(r);
      expect(records.length, a.id).toBeGreaterThan(0);
      expect(reader.found(), a.id).toBeGreaterThan(0);
      expect(reader.warnings(), a.id).toEqual([]);
    }
  });
});
