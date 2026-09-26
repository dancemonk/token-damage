import type { Source } from "./types.js";

export interface AgentInfo {
  /** As the card and the site print it; the 48-column receipt prints it in lower case. At most 20 characters. */
  name: string;
  /** The live pane's agent cell: at most 8 characters. */
  short: string;
  /** Runs any provider's models: long-context pricing follows the model, not the agent. */
  anyProvider?: true;
}

/** Every agent Token Damage reads. Pure data: the website imports it through src/web.ts. */
export const AGENTS: Record<Source, AgentInfo> = {
  "claude-code": { name: "Claude Code", short: "claude" },
  codex: { name: "Codex", short: "codex" },
  gemini: { name: "Gemini CLI", short: "gemini" },
  opencode: { name: "OpenCode", short: "opencode", anyProvider: true },
};

const each = <T>(pick: (a: AgentInfo) => T): Record<Source, T> =>
  Object.fromEntries(
    Object.entries(AGENTS).map(([id, a]) => [id, pick(a)]),
  ) as Record<Source, T>;

/** Agent names as the card prints them; the 48-column receipt prints them in lower case. */
export const AGENT_NAMES: Record<Source, string> = each((a) => a.name);

// Short on purpose: "claude code" and "gemini cli" do not fit the live pane's 10-column agent cell.
export const AGENT_SHORT: Record<Source, string> = each((a) => a.short);
