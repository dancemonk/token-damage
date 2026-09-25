import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";
import type { PromptEvent, UsageEvent } from "../../types.js";
import { findRollouts } from "./discover.js";
import {
  aliasModel,
  burstStart,
  dropReplay,
  metaOf,
  readRollout,
  type CodexStats,
  type RawUsage,
  type RolloutMeta,
  type RolloutRecord,
} from "./parse.js";

export { codexHomes, findRollouts } from "./discover.js";
export { emptyCodexStats, type CodexStats } from "./parse.js";

/** Lines of a file; stopping early closes it. */
async function* fileLines(path: string): AsyncGenerator<string> {
  const input = createReadStream(path);
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    yield* lines;
  } finally {
    lines.close();
    input.destroy();
  }
}

async function firstLine(path: string): Promise<string | undefined> {
  for await (const line of fileLines(path)) return line;
  return undefined;
}

interface Stamped {
  ts: number;
  raw: RawUsage;
}

async function* tap(
  records: AsyncIterable<RolloutRecord>,
  into: Stamped[] | undefined,
): AsyncGenerator<RolloutRecord> {
  for await (const record of records) {
    if (into && record.kind === "usage")
      into.push({ ts: record.ts, raw: record.raw });
    yield record;
  }
}

/** Where every fork's parent rollout is, and an order that scans parents before their forks. */
function plan(paths: string[], metas: RolloutMeta[]) {
  const pathsById = new Map<string, string[]>();
  metas.forEach((m, i) => {
    if (!m.sessionId) return;
    const list = pathsById.get(m.sessionId) ?? [];
    list.push(paths[i]!);
    pathsById.set(m.sessionId, list);
  });
  // The first other file with the parent's id; resumed threads have several.
  const parentOf = metas.map((m, i) =>
    m.replayParentId === undefined
      ? undefined
      : pathsById.get(m.replayParentId)?.find((p) => p !== paths[i]),
  );
  const index = new Map(paths.map((p, i) => [p, i]));
  const depths = new Map<number, number>();
  const depth = (i: number, seen = new Set<number>()): number => {
    const known = depths.get(i);
    if (known !== undefined) return known;
    const parent = parentOf[i];
    const p = parent === undefined ? undefined : index.get(parent);
    const d = p === undefined || seen.has(p) ? 0 : depth(p, seen.add(i)) + 1;
    depths.set(i, d);
    return d;
  };
  const order = paths
    .map((_, i) => i)
    .sort((a, b) => depth(a) - depth(b) || a - b);
  return { parentOf, order };
}

/** The thread at the top of a subagent's spawn chain: the session it counts toward. */
function rootOf(id: string, metaById: Map<string, RolloutMeta>): string {
  const seen = new Set<string>();
  let current = id;
  for (;;) {
    const m = metaById.get(current);
    if (!m?.subagent || !m.parentThreadId || seen.has(current)) return current;
    seen.add(current);
    current = m.parentThreadId;
  }
}

const ROLLOUT_ID =
  /-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;

/**
 * Streams usage and prompt events from every Codex rollout under the given homes. Not deduped:
 * copies of one response in several files (archived, resumed, forked) share a dedupe key.
 */
export async function* scanCodex(
  homes: string[],
  stats: CodexStats,
  /** Only these rollouts (live polling); fork parents must be included by the caller. */
  files?: string[],
): AsyncGenerator<UsageEvent | PromptEvent> {
  const paths = files ?? (await findRollouts(homes));
  const metas: RolloutMeta[] = [];
  for (const path of paths) metas.push(metaOf(await firstLine(path)));
  const metaById = new Map<string, RolloutMeta>();
  for (const m of metas)
    if (m.sessionId && !metaById.has(m.sessionId)) metaById.set(m.sessionId, m);
  const { parentOf, order } = plan(paths, metas);
  const parents = new Set(parentOf.filter((p) => p !== undefined));
  const streams = new Map<string, Stamped[]>();

  for (const i of order) {
    const path = paths[i]!;
    const meta = metas[i]!;
    stats.files++;
    const sessionId =
      meta.sessionId ?? ROLLOUT_ID.exec(basename(path))?.[1] ?? path;
    const parentSessionId =
      meta.subagent && meta.parentThreadId
        ? rootOf(meta.parentThreadId, metaById)
        : undefined;
    const version = meta.version;

    let prefix: RawUsage[] | undefined;
    if (meta.replayParentId !== undefined) {
      const parent = parentOf[i];
      const stream = parent === undefined ? [] : (streams.get(parent) ?? []);
      // The parent's usage after the fork was never copied.
      const end = stream.findIndex(
        (s) => meta.forkedAt !== undefined && s.ts > meta.forkedAt,
      );
      prefix = stream
        .slice(0, end === -1 ? stream.length : end)
        .map((s) => s.raw);
    }
    let stream: Stamped[] | undefined;
    if (parents.has(path)) streams.set(path, (stream = []));

    for await (const record of dropReplay(
      tap(readRollout(fileLines(path), stats), stream),
      prefix,
      () => burstStart(fileLines(path)),
      stats,
    )) {
      if (record.kind === "prompt") {
        // A subagent's prompts are written by the thread that spawned it.
        if (meta.subagent) continue;
        stats.prompts++;
        yield {
          kind: "prompt",
          source: "codex",
          sessionId,
          ts: record.ts,
          words: record.words,
          dedupeKey: `codex|${record.key ?? `${sessionId}|${record.ts}`}`,
        };
        continue;
      }
      const { raw } = record;
      const dedupeKey = [
        "codex",
        record.ts,
        record.model,
        raw.input,
        raw.cached,
        raw.cacheWrite,
        raw.output,
        raw.reasoning,
        raw.total,
      ].join("|");
      const priceAs = aliasModel(record.model, record.ts);
      stats.events++;
      if (record.isFallbackModel) stats.fallback++;
      stats.versions[version ?? "unknown"] =
        (stats.versions[version ?? "unknown"] ?? 0) + 1;
      yield {
        kind: "usage",
        source: "codex",
        sessionId,
        ...(parentSessionId && { parentSessionId, agentId: sessionId }),
        ts: record.ts,
        model: record.model,
        ...(record.isFallbackModel && { isFallbackModel: true }),
        ...(priceAs && { priceAs }),
        // Codex input includes cached input and cache writes; output already includes reasoning.
        input: raw.input - raw.cached - raw.cacheWrite,
        cacheWrite: raw.cacheWrite,
        cacheWrite1h: 0,
        cacheRead: raw.cached,
        output: raw.output,
        messageId: dedupeKey,
        dedupeKey,
        ...(record.serviceTier && { serviceTier: record.serviceTier }),
        ...(version && { version }),
      };
    }
  }
}
