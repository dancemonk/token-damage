import { createDeduper, type Deduper } from "../adapters/claude/dedupe.js";
import { damageClass, damageFloor, floorOf } from "../roasts/classes.js";
import type { PromptEvent, Source, UsageEvent } from "../types.js";
import { localDay, midnightOf, nextMidnight } from "./day.js";
import { buildSnapshot, type Limits, type LiveSnapshot } from "./snapshot.js";

export type TapeEvent =
  | { kind: "stamped"; ts: number; name: string }
  | { kind: "note"; ts: number; family: string; text: string }
  | { kind: "tear"; ts: number; day: string; tokens: number; price: number };

export interface EngineState {
  version: 1;
  day: string;
  usage: UsageEvent[];
  prompts: PromptEvent[];
  events: TapeEvent[];
  limits: Limits | null;
}

type LiveRecord = UsageEvent | PromptEvent;

const total = (usage: readonly UsageEvent[]) =>
  usage.reduce(
    (n, e) => n + e.input + e.cacheWrite + e.cacheRead + e.output,
    0,
  );

/**
 * Today's records and what happened on the tape; docs/LIVE.md §Engine.
 * Claude Code lines accumulate (they arrive as appended bytes). Codex, Gemini CLI and OpenCode arrive as a full
 * rescan of today and replace their pool, so a record a half-written file produced never lingers.
 */
export class LiveEngine {
  day: string;
  from: number;
  to: number;
  #now: () => number;
  #tz: string | undefined;
  #appended: Deduper = createDeduper();
  #pools = new Map<Source, LiveRecord[]>();
  #events: TapeEvent[] = [];
  #limits: Limits | null = null;
  /** The highest damage-class floor stamped today; `#stamp` only fires above it, never below. */
  #peak = 0;

  constructor(opts: {
    now: () => number;
    timeZone?: string;
    state?: EngineState;
  }) {
    this.#now = opts.now;
    this.#tz = opts.timeZone;
    const now = opts.now();
    this.day = localDay(now, this.#tz);
    this.from = midnightOf(now, this.#tz);
    this.to = nextMidnight(now, this.#tz);
    const s = opts.state;
    if (s && s.version === 1 && s.day === this.day) {
      this.replace([...s.usage, ...s.prompts]);
      this.#events = [...s.events];
      this.#limits = s.limits;
    }
    this.#peak = this.#initialPeak();
  }

  /** The tape's highest stamped floor, or the current total's floor when nothing has stamped yet. */
  #initialPeak(): number {
    const stampedFloors = this.#events
      .filter((e) => e.kind === "stamped")
      .map((e) => floorOf(e.name));
    return stampedFloors.length > 0
      ? Math.max(...stampedFloors)
      : damageFloor(total(this.#merged().result()));
  }

  #inWindow = (r: LiveRecord) => r.ts >= this.from && r.ts < this.to;

  /** One deduper over everything: dedupe keys never collide across agents. */
  #merged(): Deduper {
    const d = createDeduper();
    for (const r of this.#appended.result()) d.add(r);
    for (const r of this.#appended.prompts()) d.add(r);
    for (const pool of this.#pools.values()) for (const r of pool) d.add(r);
    return d;
  }

  /** Fires only on an upgrade past the highest class stamped today; a shrinking pool never regresses
   * the peak, so it neither stamps a downgrade now nor a duplicate upgrade on later re-growth. */
  #stamp(change: () => void): TapeEvent[] {
    change();
    const afterTotal = total(this.#merged().result());
    const afterFloor = damageFloor(afterTotal);
    if (afterFloor <= this.#peak) return [];
    this.#peak = afterFloor;
    const stamped: TapeEvent = {
      kind: "stamped",
      ts: this.#now(),
      name: damageClass(afterTotal).name,
    };
    this.#events.push(stamped);
    return [stamped];
  }

  add(records: Iterable<LiveRecord>): TapeEvent[] {
    return this.#stamp(() => {
      for (const r of records) if (this.#inWindow(r)) this.#appended.add(r);
    });
  }

  setPool(source: Source, records: Iterable<LiveRecord>): TapeEvent[] {
    return this.#stamp(() =>
      this.#pools.set(source, [...records].filter(this.#inWindow)),
    );
  }

  replace(records: Iterable<LiveRecord>): void {
    this.#appended = createDeduper();
    this.#pools = new Map();
    for (const r of records) {
      if (!this.#inWindow(r)) continue;
      if (r.source === "claude-code") this.#appended.add(r);
      else {
        const pool = this.#pools.get(r.source) ?? [];
        pool.push(r);
        this.#pools.set(r.source, pool);
      }
    }
  }

  snapshot(): LiveSnapshot {
    const d = this.#merged();
    return buildSnapshot({
      usage: d.result(),
      prompts: d.prompts(),
      now: this.#now(),
      limits: this.#limits,
      ...(this.#tz && { timeZone: this.#tz }),
    });
  }

  state(): EngineState {
    const d = this.#merged();
    return {
      version: 1,
      day: this.day,
      usage: d.result(),
      prompts: d.prompts(),
      events: [...this.#events],
      limits: this.#limits,
    };
  }

  events(): readonly TapeEvent[] {
    return this.#events;
  }

  setLimits(limits: Limits): void {
    this.#limits = limits;
  }

  note(family: string, text: string): TapeEvent {
    const event: TapeEvent = { kind: "note", ts: this.#now(), family, text };
    this.#events.push(event);
    return event;
  }

  rollover(): TapeEvent | null {
    const now = this.#now();
    const day = localDay(now, this.#tz);
    if (day === this.day) return null;
    const last = this.snapshot();
    const tear: TapeEvent = {
      kind: "tear",
      ts: now,
      day: this.day,
      tokens: last.total,
      price: last.price.value,
    };
    this.day = day;
    this.from = midnightOf(now, this.#tz);
    this.to = nextMidnight(now, this.#tz);
    this.#appended = createDeduper();
    this.#pools = new Map();
    this.#events = [tear];
    this.#peak = 0;
    return tear;
  }
}
