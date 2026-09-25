import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PromptEvent, UsageEvent } from "../types.js";
import type { EngineState } from "./engine.js";
import type { LiveSnapshot } from "./snapshot.js";
import type { SourcesState } from "./sources.js";
import type { Turn } from "./turns.js";
import type { VoiceState } from "./voice.js";

export interface TodayCache {
  version: 1;
  day: string;
  savedAt: number;
  engine: EngineState;
  sources: SourcesState;
  voice?: VoiceState;
}

export const CACHE_PATH = join(homedir(), ".token-damage", "today.json");

export const hashPath = (path: string): string =>
  createHash("sha256").update(path).digest("hex");

export const cleanId = (id: string) => (/[\\/]/.test(id) ? hashPath(id) : id);

/** Ids are opaque, except when a scanner fell back to a file path (Codex rollouts without metadata). */
export function sanitizeIds(state: EngineState): EngineState {
  const usage = state.usage.map((e): UsageEvent => ({
    ...e,
    sessionId: cleanId(e.sessionId),
    ...(e.parentSessionId !== undefined && {
      parentSessionId: cleanId(e.parentSessionId),
    }),
    ...(e.agentId !== undefined && { agentId: cleanId(e.agentId) }),
    dedupeKey: cleanId(e.dedupeKey),
    messageId: cleanId(e.messageId),
  }));
  const prompts = state.prompts.map((p): PromptEvent => ({
    ...p,
    sessionId: cleanId(p.sessionId),
    dedupeKey: cleanId(p.dedupeKey),
  }));
  return { ...state, usage, prompts };
}

/** The cache for `day`, or null when missing, torn, another day or another version. */
export async function loadCache(
  day: string,
  path = CACHE_PATH,
): Promise<TodayCache | null> {
  try {
    const cache = JSON.parse(await readFile(path, "utf8")) as TodayCache;
    if (cache.version !== 1 || cache.day !== day) return null;
    if (!cache.engine || !cache.sources) return null;
    return cache;
  } catch {
    return null;
  }
}

const cleanTurn = (t: Turn): Turn => ({
  ...t,
  sessionId: cleanId(t.sessionId),
});

/** The snapshot as printed by `--json`/`--once`: no id that could be a file path. */
export function publicSnapshot(s: LiveSnapshot): LiveSnapshot {
  return {
    ...s,
    turns: s.turns.map(cleanTurn),
    open: s.open && cleanTurn(s.open),
    badges: Object.fromEntries(
      Object.entries(s.badges).map(([id, n]) => [cleanId(id), n]),
    ),
  };
}

/** Atomic: written next to the target, then renamed over it. */
export async function saveCache(
  cache: TodayCache,
  path = CACHE_PATH,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  const clean: TodayCache = { ...cache, engine: sanitizeIds(cache.engine) };
  await writeFile(tmp, JSON.stringify(clean));
  await rename(tmp, path);
}
