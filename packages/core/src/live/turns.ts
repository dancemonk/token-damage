import { modelKey } from "../metrics/pricing.js";
import type { PromptEvent, Source, TokenSums, UsageEvent } from "../types.js";

export interface Turn {
  sessionId: string;
  source: Source;
  start: number;
  end: number;
  words: number | null;
  read: number;
  written: number;
  calls: number;
  interns: number;
  byModel: Record<string, TokenSums>;
  open: boolean;
}

export const OPEN_WINDOW_MS = 5 * 60_000;

const rootOf = (e: UsageEvent) => e.parentSessionId ?? e.sessionId;

interface Building extends Omit<Turn, "interns" | "open"> {
  agents: Set<string>;
}

function newTurn(
  sessionId: string,
  source: Source,
  start: number,
  words: number | null,
): Building {
  return {
    sessionId,
    source,
    start,
    end: start,
    words,
    read: 0,
    written: 0,
    calls: 0,
    byModel: {},
    agents: new Set(),
  };
}

/** Prompt-to-prompt attribution per root session; docs/superpowers/specs/2026-09-24-live-design.md §Turns. */
export function buildTurns(
  usage: readonly UsageEvent[],
  prompts: readonly PromptEvent[],
  now: number,
): Turn[] {
  const bySession = new Map<string, Building[]>();
  const sortedPrompts = [...prompts].sort((a, b) => a.ts - b.ts);
  for (const p of sortedPrompts) {
    const list = bySession.get(p.sessionId) ?? [];
    list.push(newTurn(p.sessionId, p.source, p.ts, p.words));
    bySession.set(p.sessionId, list);
  }
  const sortedUsage = [...usage].sort((a, b) => a.ts - b.ts);
  for (const e of sortedUsage) {
    const root = rootOf(e);
    let list = bySession.get(root);
    if (!list) bySession.set(root, (list = []));
    // The latest prompt at or before the event. An event older than every prompt joins the session's
    // unknown-words turn, created at the front when the session has none yet.
    let turn: Building | undefined;
    for (const t of list) if (t.start <= e.ts) turn = t;
    if (!turn) {
      if (list[0]?.words === null) turn = list[0];
      else {
        turn = newTurn(root, e.source, e.ts, null);
        list.unshift(turn);
      }
    }
    turn.end = Math.max(turn.end, e.ts);
    turn.read += e.input + e.cacheWrite + e.cacheRead;
    turn.written += e.output;
    turn.calls++;
    if (e.parentSessionId !== undefined)
      turn.agents.add(e.agentId ?? e.sessionId);
    const key = modelKey(e);
    const sums = (turn.byModel[key] ??= {
      input: 0,
      cacheWrite: 0,
      cacheWrite1h: 0,
      cacheRead: 0,
      output: 0,
    });
    sums.input += e.input;
    sums.cacheWrite += e.cacheWrite;
    sums.cacheWrite1h += e.cacheWrite1h;
    sums.cacheRead += e.cacheRead;
    sums.output += e.output;
  }
  const turns: Turn[] = [];
  for (const list of bySession.values()) {
    list.forEach((t, i) => {
      const last = i === list.length - 1;
      const { agents, ...rest } = t;
      turns.push({
        ...rest,
        interns: agents.size,
        open: last && now - t.end <= OPEN_WINDOW_MS && t.end <= now,
      });
    });
  }
  return turns.sort(
    (a, b) => a.start - b.start || (a.sessionId < b.sessionId ? -1 : 1),
  );
}
