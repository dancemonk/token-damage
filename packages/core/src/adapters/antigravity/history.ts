import type { PromptEvent } from "../../types.js";
import { countWords } from "../claude/parse.js";

/**
 * One `history.jsonl` row as a prompt: typed text and shell commands count whole, a slash command only its
 * arguments. No conversation, no text, an unknown type or a bare slash command: no prompt. `workspace` (a path)
 * is never read.
 */
export function historyPrompt(line: string): PromptEvent | undefined {
  let row: unknown;
  try {
    row = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!row || typeof row !== "object") return undefined;
  const { conversationId, display, timestamp, type } = row as Record<
    string,
    unknown
  >;
  if (typeof conversationId !== "string" || conversationId === "")
    return undefined;
  if (
    typeof display !== "string" ||
    typeof timestamp !== "number" ||
    !(timestamp > 0)
  )
    return undefined;
  let words: number;
  if (type === undefined || type === "shell") words = countWords(display);
  else if (type === "slash_command") {
    words = countWords(display.trim().split(/\s+/).slice(1).join(" "));
    if (words === 0) return undefined;
  } else return undefined;
  return {
    kind: "prompt",
    source: "antigravity",
    sessionId: conversationId,
    ts: timestamp,
    words,
    dedupeKey: `antigravity:${conversationId}:${timestamp}`,
  };
}
