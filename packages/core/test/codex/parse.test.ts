import { describe, expect, it } from "vitest";
import { emptyCodexStats, readLines } from "../../src/index.js";
import {
  burstStart,
  dropReplay,
  metaOf,
  readRollout,
  type RawUsage,
  type RolloutRecord,
} from "../../src/adapters/codex/parse.js";
import {
  AUTO_REVIEW,
  BACKWARDS,
  BURST,
  FORK_CHILD,
  NO_MODEL,
  NORMAL,
  STREAMING,
  WORDS,
  read,
  usageOf,
} from "./support.js";

async function* each<T>(items: T[]): AsyncGenerator<T> {
  yield* items;
}

const firstLine = async (path: string) => {
  for await (const line of readLines(path)) return line;
};

const raw = (input: number, output = 0): RawUsage => ({
  input,
  cached: 0,
  cacheWrite: 0,
  output,
  reasoning: 0,
  total: input + output,
});
const usage = (ts: number, r: RawUsage): RolloutRecord => ({
  kind: "usage",
  ts,
  raw: r,
  model: "m",
  isFallbackModel: false,
});
/** Cumulative usage as Codex writes it. */
const tokens = (input: number) => ({
  input_tokens: input,
  output_tokens: 0,
  total_tokens: input,
});
const tokenCount = (ts: string, total: object, last?: object) =>
  JSON.stringify({
    timestamp: ts,
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: total,
        ...(last && { last_token_usage: last }),
      },
    },
  });
const settings = (ts: string, threadSettings: object) =>
  JSON.stringify({
    timestamp: ts,
    type: "event_msg",
    payload: {
      type: "thread_settings_applied",
      thread_settings: threadSettings,
    },
  });

async function kept(
  records: RolloutRecord[],
  prefix: RawUsage[] | undefined,
  burst?: number,
) {
  const stats = emptyCodexStats();
  let probes = 0;
  const out: RolloutRecord[] = [];
  for await (const r of dropReplay(
    each(records),
    prefix,
    async () => {
      probes++;
      return burst;
    },
    stats,
  ))
    out.push(r);
  return { out, replayed: stats.replayed, probes };
}

describe("metaOf", () => {
  it("reads a main rollout", async () => {
    expect(metaOf(await firstLine(NORMAL))).toEqual({
      sessionId: "019e1430-d753-78a1-99b7-4e745cc2f417",
      forkedAt: Date.parse("2026-05-10T23:20:17.942Z"),
      subagent: false,
      version: "0.130.0",
    });
  });

  it("reads a spawned subagent: replays its parent, counts toward the root session", async () => {
    expect(metaOf(await firstLine(FORK_CHILD))).toEqual({
      sessionId: "019ff38c-8a1e-7f72-9eb9-a1903b32bfdc",
      replayParentId: "019ff385-c2c0-7bd2-a53d-73fa2dcdbd48",
      forkedAt: Date.parse("2026-08-12T01:18:21.871Z"),
      subagent: true,
      parentThreadId: "019fee34-f718-7561-b7a9-1140d0565f41",
      version: "0.147.0-alpha.6.5",
    });
  });

  it("reads an auto-review thread: a subagent that replays nothing", async () => {
    const meta = metaOf(await firstLine(AUTO_REVIEW));
    expect(meta.subagent).toBe(true);
    expect(meta.replayParentId).toBeUndefined();
    expect(meta.parentThreadId).toBe("019f4c29-7a09-77e0-97c5-0f104d86a576");
  });

  it("falls back to the spawning thread when session_id repeats the thread's own id", () => {
    const line = JSON.stringify({
      timestamp: "2026-07-01T00:00:00.000Z",
      type: "session_meta",
      payload: {
        id: "b",
        session_id: "b",
        source: { subagent: { thread_spawn: { parent_thread_id: "a" } } },
      },
    });
    expect(metaOf(line)).toMatchObject({
      sessionId: "b",
      replayParentId: "a",
      parentThreadId: "a",
    });
  });

  it("returns an empty meta for anything but a session_meta line", () => {
    expect(metaOf(undefined)).toEqual({ subagent: false });
    expect(metaOf("{not json")).toEqual({ subagent: false });
    expect(metaOf('{"type":"turn_context","payload":{}}')).toEqual({
      subagent: false,
    });
  });
});

describe("readRollout", () => {
  it("uses last_token_usage while the total advances; a repeated total adds nothing", async () => {
    const stats = emptyCodexStats();
    const records = await read(NORMAL, stats);
    // Line 29 repeats line 23's total with its stale last_token_usage.
    expect(usageOf(records).map((r) => r.raw.total)).toEqual([
      14537, 14838, 14910, 14867,
    ]);
    expect(usageOf(records).every((r) => r.model === "gpt-5.5")).toBe(true);
    expect(stats).toMatchObject({ lines: 15, malformed: 0 });
  });

  it("keeps cached input inside input and reasoning inside output", async () => {
    const [first] = usageOf(await read(NORMAL));
    expect(first?.raw).toEqual({
      input: 14441,
      cached: 11648,
      cacheWrite: 0,
      output: 96,
      reasoning: 23,
      total: 14537,
    });
  });

  it("uses last_token_usage when the total goes backwards", async () => {
    // 38,855,028 → 201,210: a restarted counter, not a negative delta.
    expect(usageOf(await read(BACKWARDS)).map((r) => r.raw.total)).toEqual([
      197627, 201210, 215938,
    ]);
  });

  it("takes deltas of the total when last_token_usage is missing, and prices model-less usage as gpt-5", async () => {
    const stats = emptyCodexStats();
    const events = usageOf(await read(NO_MODEL, stats));
    expect(
      events.map((r) => [r.model, r.isFallbackModel, r.raw.total]),
    ).toEqual([
      ["gpt-5", true, 10500],
      ["gpt-5-codex", false, 15400],
    ]);
    expect(events[1]?.raw).toMatchObject({
      input: 15000,
      cached: 10000,
      output: 400,
    });
    // The record split over two lines: one half looks like a token_count line.
    expect(stats.malformed).toBe(1);
  });

  it("never reads streaming token_usage_record lines", async () => {
    // The fixture holds 3 token_usage_record lines next to its 3 token_count lines.
    expect(usageOf(await read(STREAMING)).map((r) => r.raw.total)).toEqual([
      22597, 25365, 45272,
    ]);
  });

  it("applies a recorded service tier to later usage", async () => {
    expect(usageOf(await read(STREAMING)).map((r) => r.serviceTier)).toEqual([
      undefined,
      undefined,
      "standard",
    ]);
    const lines = [
      settings("2026-09-01T00:00:00.000Z", { service_tier: "priority" }),
      tokenCount("2026-09-01T00:00:01.000Z", tokens(10)),
      settings("2026-09-01T00:00:02.000Z", { model: "codex-auto-review" }),
      tokenCount("2026-09-01T00:00:03.000Z", tokens(20)),
      settings("2026-09-01T00:00:04.000Z", { service_tier: "turbo" }),
      tokenCount("2026-09-01T00:00:05.000Z", tokens(30)),
    ];
    const records = [];
    for await (const r of readRollout(each(lines), emptyCodexStats()))
      records.push(r);
    // No tier key keeps the tier; an unknown tier clears it.
    expect(usageOf(records).map((r) => r.serviceTier)).toEqual([
      "fast",
      "fast",
      undefined,
    ]);
  });

  it("counts the words of each user message, ignoring images", async () => {
    const prompts = (await read(WORDS)).flatMap((r) =>
      r.kind === "prompt" ? [[r.words, r.key]] : [],
    );
    expect(prompts).toEqual([
      [8, "01a0c5f1-0000-7000-8000-000000000001:item-1"],
      [4, "01a0c5f1-0000-7000-8000-000000000002:item-1"],
      [4, "01a0c5f1-0000-7000-8000-000000000003:item-1"],
      [4, "01a0c5f1-0000-7000-8000-000000000003:item-1"],
      [3, undefined],
    ]);
  });
});

describe("burstStart", () => {
  it("returns the first usage time when the first two are written within a second", async () => {
    expect(await burstStart(readLines(BURST))).toBe(
      Date.parse("2026-07-27T15:17:26.164Z"),
    );
  });

  it("returns undefined when the thread paused between them", async () => {
    expect(await burstStart(readLines(NORMAL))).toBeUndefined();
  });
});

describe("dropReplay", () => {
  const events = [
    usage(1000, raw(10)),
    usage(1001, raw(20)),
    usage(9000, raw(30)),
    usage(9500, raw(40)),
  ];

  it("keeps everything in a rollout that is not a fork, without probing", async () => {
    expect(await kept(events, undefined, 1000)).toEqual({
      out: events,
      replayed: 0,
      probes: 0,
    });
  });

  it("drops the parent's usage copied in order, then keeps the rest", async () => {
    const r = await kept(events, [raw(10), raw(20), raw(99)], 1000);
    expect(r.out).toEqual(events.slice(2));
    expect(r.replayed).toBe(2);
    // A mismatch after a partial match ends the replay; no burst check.
    expect(r.probes).toBe(0);
  });

  it("drops a burst at the head when the first event does not match", async () => {
    const r = await kept(events, [raw(99)], 1000);
    expect(r.out).toEqual(events.slice(2));
    expect(r.replayed).toBe(2);
  });

  it("keeps everything when there is no burst", async () => {
    expect((await kept(events, [], undefined)).out).toEqual(events);
  });

  it("passes prompts through", async () => {
    const prompt: RolloutRecord = { kind: "prompt", ts: 1000, words: 2 };
    expect((await kept([prompt, ...events], [raw(10)], 1000)).out).toEqual([
      prompt,
      ...events.slice(1),
    ]);
  });
});
