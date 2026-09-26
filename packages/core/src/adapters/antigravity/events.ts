import { modelNameFromId, normalizeModel } from "./models.js";
import type { AgyUsage, RowMeta } from "./parse.js";

export const DEFAULT_MODEL = "gemini-internal-model";

/** One model call as one database records it; `mergeEvents` folds copies from other rows and databases. */
export interface AgyEvent {
  sessionId: string;
  ts: number;
  /** 3: the row's own time; 1: the conversation's; 0: the file's mtime. A merge keeps the best. */
  tsRank: number;
  model: string;
  input: number;
  cacheWrite: number;
  cacheRead: number;
  visible: number;
  reasoning: number;
  /** Visible output plus reasoning: what the call is billed as output. */
  totalOutput: number;
  /** The best id, prefixed (`response:…` > `provider:…` > `message:…`). */
  messageId?: string;
  /** 3 response id, 2 provider id, 1 message id, 0 none. */
  messageIdRank: number;
  identities: string[];
  /** Unique per record: `<sessionId>/<table>/<idx>/<n>`. */
  rowKey: string;
}

export interface ConversationRows {
  /** The database's file name without `.db`: the conversation id. */
  sessionId: string;
  trajectoryTs?: number;
  fallbackTs: number;
  steps: { idx: number; meta: RowMeta }[];
  generations: { idx: number; meta: RowMeta }[];
}

const tokenBearing = (u: AgyUsage) =>
  u.input > 0 ||
  u.totalOutput > 0 ||
  u.cacheWrite > 0 ||
  u.cacheRead > 0 ||
  u.reasoning > 0 ||
  u.visibleOutput > 0;

function identities(u: AgyUsage): string[] {
  const ids: string[] = [];
  if (u.responseId) ids.push(`response:${u.responseId}`);
  if (u.providerMessageId) ids.push(`provider:${u.providerMessageId}`);
  if (u.messageId) ids.push(`message:${u.messageId}`);
  return ids;
}

// Prefixed like the identities, so a response id and another call's message id that happen to be equal never
// collide as dedupe keys.
function preferredId(u: AgyUsage): [string | undefined, number] {
  if (u.responseId) return [`response:${u.responseId}`, 3];
  if (u.providerMessageId) return [`provider:${u.providerMessageId}`, 2];
  return u.messageId ? [`message:${u.messageId}`, 1] : [undefined, 0];
}

const fromId = (id: number | undefined) =>
  id === undefined ? undefined : normalizeModel(modelNameFromId(id));
const named = (meta: RowMeta) =>
  (meta.model !== undefined ? normalizeModel(meta.model) : undefined) ??
  fromId(meta.modelId);

/** Every token-bearing record in one conversation database: steps first, then generations, in row order. */
export function conversationEvents(c: ConversationRows): AgyEvent[] {
  const events: AgyEvent[] = [];
  // Per database, as ccusage: an id seen earlier lends its time to a copy that has none.
  const seen = new Map<string, [number, number]>();
  let generationModel: string | undefined;
  for (
    let i = c.generations.length - 1;
    i >= 0 && generationModel === undefined;
    i--
  ) {
    const g = c.generations[i];
    if (g) generationModel = named(g.meta);
  }
  const add = (
    u: AgyUsage,
    context: string | undefined,
    rowTs: number | undefined,
    rowKey: string,
  ) => {
    if (!tokenBearing(u)) return;
    const ids = identities(u);
    let lent: [number, number] | undefined;
    for (const id of ids) lent ??= seen.get(id);
    const [ts, tsRank] =
      rowTs !== undefined
        ? [rowTs, 3]
        : (lent ??
          (c.trajectoryTs !== undefined
            ? [c.trajectoryTs, 1]
            : [c.fallbackTs, 0]));
    for (const id of ids) {
      const old = seen.get(id);
      if (!old || tsRank > old[1] || (tsRank === old[1] && ts < old[0]))
        seen.set(id, [ts, tsRank]);
    }
    const totalOutput = Math.max(u.totalOutput, u.visibleOutput + u.reasoning);
    const visible = Math.max(
      u.visibleOutput,
      Math.max(0, totalOutput - u.reasoning),
    );
    const reasoning = Math.max(u.reasoning, Math.max(0, totalOutput - visible));
    const [messageId, messageIdRank] = preferredId(u);
    events.push({
      sessionId: c.sessionId,
      ts,
      tsRank,
      model:
        fromId(u.modelId) ??
        (context !== undefined ? normalizeModel(context) : undefined) ??
        DEFAULT_MODEL,
      input: u.input,
      cacheWrite: u.cacheWrite,
      cacheRead: u.cacheRead,
      visible,
      reasoning,
      totalOutput,
      messageId,
      messageIdRank,
      identities: ids,
      rowKey,
    });
  };
  for (const s of c.steps) {
    const model = named(s.meta) ?? generationModel;
    if (s.meta.usage)
      add(s.meta.usage, model, s.meta.ts, `${c.sessionId}/steps/${s.idx}/0`);
    s.meta.retries.forEach((u, n) =>
      add(u, model, s.meta.ts, `${c.sessionId}/steps/${s.idx}/${n + 1}`),
    );
  }
  let current: string | undefined;
  for (const g of c.generations) {
    const rowModel = named(g.meta) ?? fromId(g.meta.usage?.modelId);
    if (rowModel !== undefined) current = rowModel;
    if (g.meta.usage)
      add(g.meta.usage, current, g.meta.ts, `${c.sessionId}/gen/${g.idx}/0`);
    g.meta.retries.forEach((u, n) =>
      add(u, current, g.meta.ts, `${c.sessionId}/gen/${g.idx}/${n + 1}`),
    );
  }
  return events;
}

function merge(t: AgyEvent, d: AgyEvent): void {
  t.input = Math.max(t.input, d.input);
  t.visible = Math.max(t.visible, d.visible);
  t.cacheWrite = Math.max(t.cacheWrite, d.cacheWrite);
  t.cacheRead = Math.max(t.cacheRead, d.cacheRead);
  t.reasoning = Math.max(t.reasoning, d.reasoning);
  t.totalOutput = Math.max(
    t.totalOutput,
    d.totalOutput,
    t.visible + t.reasoning,
  );
  if (t.model === DEFAULT_MODEL && d.model !== DEFAULT_MODEL) t.model = d.model;
  if (d.tsRank > t.tsRank || (d.tsRank === t.tsRank && d.ts < t.ts)) {
    t.ts = d.ts;
    t.tsRank = d.tsRank;
  }
  if (d.messageIdRank > t.messageIdRank) {
    t.messageId = d.messageId;
    t.messageIdRank = d.messageIdRank;
  }
  for (const id of d.identities)
    if (!t.identities.includes(id)) t.identities.push(id);
}

/**
 * One event per call across every database: records sharing any id merge (each number takes the larger value),
 * as ccusage does; records without an id stay as they are.
 */
export function mergeEvents(events: AgyEvent[]): AgyEvent[] {
  const slots: (AgyEvent | undefined)[] = [];
  const index = new Map<string, number>();
  for (const e of events) {
    const hits = new Set<number>();
    for (const id of e.identities) {
      const n = index.get(id);
      if (n !== undefined) hits.add(n);
    }
    const sorted = [...hits].sort((a, b) => a - b);
    const target = sorted[0];
    if (target === undefined) {
      for (const id of e.identities) index.set(id, slots.length);
      slots.push({ ...e, identities: [...e.identities] });
      continue;
    }
    const t = slots[target] as AgyEvent;
    for (const n of sorted.slice(1)) {
      const d = slots[n];
      if (d) merge(t, d);
      slots[n] = undefined;
    }
    merge(t, e);
    for (const id of t.identities) index.set(id, target);
  }
  return slots.filter((s): s is AgyEvent => s !== undefined);
}
