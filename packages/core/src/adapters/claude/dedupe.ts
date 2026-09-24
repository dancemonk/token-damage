import type { PromptEvent, UsageEvent } from "../../types.js";

// Metadata of the copy that is kept, compared after the timestamp; makes the choice order-independent.
const metadata = (e: UsageEvent) =>
  [
    e.sessionId,
    e.parentSessionId ?? "",
    e.agentId ?? "",
    e.isSidechain ? "1" : "0",
    e.version ?? "",
    e.model,
  ].join("\u0000");

function earlier(a: UsageEvent, b: UsageEvent): boolean {
  return a.ts !== b.ts ? a.ts < b.ts : metadata(a) <= metadata(b);
}

// Duplicates keep the earliest copy (the original response, not a resumed session's copy)
// with the per-field maximum usage (the final streaming snapshot has the largest output).
function merge(a: UsageEvent, b: UsageEvent): UsageEvent {
  return {
    ...(earlier(a, b) ? a : b),
    input: Math.max(a.input, b.input),
    cacheWrite: Math.max(a.cacheWrite, b.cacheWrite),
    cacheWrite1h: Math.max(a.cacheWrite1h, b.cacheWrite1h),
    cacheRead: Math.max(a.cacheRead, b.cacheRead),
    output: Math.max(a.output, b.output),
  };
}

export interface Deduper {
  add(record: UsageEvent | PromptEvent): void;
  /** Deduped usage events, sorted by time. */
  result(): UsageEvent[];
  /** Deduped prompts, sorted by time. */
  prompts(): PromptEvent[];
}

/** Dedupe per docs/DATA-SOURCES.md §Dedupe. Holds one event per key, so duplicates never pile up in memory. */
export function createDeduper(): Deduper {
  const byKey = new Map<string, UsageEvent>();
  const prompts: PromptEvent[] = [];
  return {
    add(record) {
      if (record.kind === "prompt") {
        prompts.push(record);
        return;
      }
      const seen = byKey.get(record.dedupeKey);
      byKey.set(record.dedupeKey, seen ? merge(seen, record) : record);
    },
    prompts: () => dedupePrompts(prompts),
    result() {
      // A sidechain copy of a message the main thread also has is a /btw replay, not a new response.
      const onMainThread = new Set<string>();
      for (const e of byKey.values())
        if (!e.isSidechain) onMainThread.add(e.messageId);
      return [...byKey.values()]
        .filter((e) => !(e.isSidechain && onMainThread.has(e.messageId)))
        .sort(
          (a, b) =>
            a.ts - b.ts ||
            (a.dedupeKey < b.dedupeKey
              ? -1
              : a.dedupeKey > b.dedupeKey
                ? 1
                : 0),
        );
    },
  };
}

export function dedupe(events: Iterable<UsageEvent>): UsageEvent[] {
  const deduper = createDeduper();
  for (const event of events) deduper.add(event);
  return deduper.result();
}

/** One prompt per line uuid; the earliest copy is the original session's. */
export function dedupePrompts(prompts: Iterable<PromptEvent>): PromptEvent[] {
  const byKey = new Map<string, PromptEvent>();
  for (const p of prompts) {
    const seen = byKey.get(p.dedupeKey);
    if (
      !seen ||
      p.ts < seen.ts ||
      (p.ts === seen.ts && p.sessionId < seen.sessionId)
    )
      byKey.set(p.dedupeKey, p);
  }
  return [...byKey.values()].sort(
    (a, b) =>
      a.ts - b.ts ||
      (a.dedupeKey < b.dedupeKey ? -1 : a.dedupeKey > b.dedupeKey ? 1 : 0),
  );
}
