import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AGENT_NAMES, AGENT_SHORT, AGENTS } from "../src/agents.js";

const schema: unknown = JSON.parse(
  readFileSync(
    new URL("../../../schema/receipt.schema.json", import.meta.url),
    "utf8",
  ),
);

/** Every `enum` in the --json schema that lists agent ids. */
function agentEnums(node: unknown): unknown[][] {
  if (Array.isArray(node)) return node.flatMap(agentEnums);
  if (node === null || typeof node !== "object") return [];
  const found = Object.values(node).flatMap(agentEnums);
  const e = (node as { enum?: unknown }).enum;
  return Array.isArray(e) && e.includes("claude-code") ? [e, ...found] : found;
}

describe("AGENTS", () => {
  it("keeps today's names and short names", () => {
    expect(AGENT_NAMES).toEqual({
      "claude-code": "Claude Code",
      codex: "Codex",
      gemini: "Gemini CLI",
      opencode: "OpenCode",
      antigravity: "Antigravity",
      grok: "Grok Build",
    });
    expect(AGENT_SHORT).toEqual({
      "claude-code": "claude",
      codex: "codex",
      gemini: "gemini",
      opencode: "opencode",
      antigravity: "agy",
      grok: "grok",
    });
  });

  it("fits the receipt's row label and the live pane's agent cell", () => {
    for (const a of Object.values(AGENTS)) {
      expect(a.name.length, a.name).toBeLessThanOrEqual(20);
      expect(a.short, a.name).toMatch(/^[a-z0-9-]{1,8}$/);
    }
  });

  it("matches the --json schema's agent enum", () => {
    const enums = agentEnums(schema);
    expect(enums.length).toBeGreaterThan(0);
    for (const e of enums)
      expect([...e].sort()).toEqual(Object.keys(AGENTS).sort());
  });
});
