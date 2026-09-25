import type { PromptEvent, UsageEvent } from "../../src/index.js";

let seq = 0;

export function usage(over: Partial<UsageEvent> & { ts: number }): UsageEvent {
  const id = `m${++seq}`;
  return {
    kind: "usage",
    source: "claude-code",
    sessionId: "s1",
    model: "claude-opus-4-7",
    input: 100,
    cacheWrite: 0,
    cacheWrite1h: 0,
    cacheRead: 0,
    output: 10,
    messageId: id,
    dedupeKey: id,
    ...over,
  };
}

export function prompt(
  over: Partial<PromptEvent> & { ts: number },
): PromptEvent {
  const id = `p${++seq}`;
  return {
    kind: "prompt",
    source: "claude-code",
    sessionId: "s1",
    words: 4,
    dedupeKey: id,
    ...over,
  };
}

export const T0 = Date.UTC(2026, 8, 24, 12, 0, 0);
export const min = (n: number) => n * 60_000;
