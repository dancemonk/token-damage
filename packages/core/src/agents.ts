import type { Source } from "./types.js";

/** Agent names as the card prints them; the 48-column receipt prints them in lower case. */
export const AGENT_NAMES: Record<Source, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
};
