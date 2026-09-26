import { describe, expect, it } from "vitest";
import {
  grokModel,
  promptRuns,
  summaryMeta,
  turnEvents,
} from "../../src/adapters/grok/parse.js";

const MS = Date.UTC(2026, 8, 22, 12);
const meta = summaryMeta(
  JSON.stringify({
    info: { id: "s1", cwd: "/p/a" },
    current_model_id: "grok-4.7",
  }),
  "dir-1",
);
const turn = (
  usage: object | undefined,
  over: { eventId?: string; sessionId?: string; ms?: number } = {},
) => ({
  jsonrpc: "2.0",
  method: "_x.ai/session/update",
  timestamp: Math.floor(MS / 1000),
  params: {
    sessionId: over.sessionId ?? "s1",
    update: { sessionUpdate: "turn_completed", stop_reason: "end_turn", usage },
    _meta: {
      ...(over.eventId !== undefined && { eventId: over.eventId }),
      ...(over.ms !== undefined && { agentTimestampMs: over.ms }),
    },
  },
});
const u = (n: {
  input?: number;
  cached?: number;
  creation?: number;
  output?: number;
  reasoning?: number;
  calls?: number;
}) => ({
  inputTokens: n.input ?? 0,
  cachedReadTokens: n.cached ?? 0,
  cacheCreationTokens: n.creation ?? 0,
  outputTokens: n.output ?? 0,
  reasoningTokens: n.reasoning ?? 0,
  totalTokens: (n.input ?? 0) + (n.output ?? 0),
  modelCalls: n.calls ?? 1,
});

describe("grokModel", () => {
  it("drops the [grok] prefix and Grok Build's -build alias, and refuses text", () => {
    expect(grokModel("grok-4.7")).toBe("grok-4.7");
    expect(grokModel("[grok] grok-4.5-build")).toBe("grok-4.5");
    expect(grokModel("a whole sentence")).toBeUndefined();
  });
});

describe("summaryMeta", () => {
  it("takes the session id and default model, else the directory name", () => {
    expect(meta).toEqual({
      fileKey: "dir-1",
      sessionId: "s1",
      defaultModel: "grok-4.7",
    });
    expect(summaryMeta(undefined, "dir-2")).toEqual({
      fileKey: "dir-2",
      sessionId: "dir-2",
    });
    expect(summaryMeta("{", "dir-3").sessionId).toBe("dir-3");
  });
});

describe("turnEvents", () => {
  it("reads one event per model, input without its cache, reasoning inside output, calls per model", () => {
    const events = turnEvents(
      turn(
        {
          ...u({ input: 1000, cached: 600, output: 50, calls: 3 }),
          modelUsage: {
            "grok-4.7": u({
              input: 700,
              cached: 400,
              creation: 100,
              output: 30,
              reasoning: 10,
              calls: 2,
            }),
            "grok-4.5-build": u({
              input: 300,
              cached: 200,
              output: 20,
              calls: 1,
            }),
          },
        },
        { eventId: "e1", ms: MS + 5 },
      ),
      meta,
    );
    expect(
      events.map((e) => [
        e.model,
        e.input,
        e.cacheRead,
        e.cacheWrite,
        e.output,
        e.calls,
        e.ts,
        e.dedupeKey,
      ]),
    ).toEqual([
      ["grok-4.5", 100, 200, 0, 20, 1, MS + 5, "grok:e1|grok-4.5-build"],
      ["grok-4.7", 200, 400, 100, 30, 2, MS + 5, "grok:e1|grok-4.7"],
    ]);
    expect(events[0]?.sessionId).toBe("s1");
  });
  it("falls back to the summary's model and the envelope's time without modelUsage or agentTimestampMs", () => {
    const [e] = turnEvents(
      turn(u({ input: 10, output: 2, calls: 4 }), { eventId: "e2" }),
      meta,
    );
    expect([e?.model, e?.ts, e?.calls]).toEqual([
      "grok-4.7",
      Math.floor(MS / 1000) * 1000,
      4,
    ]);
    const [unknown] = turnEvents(
      turn(u({ input: 10 })),
      summaryMeta(undefined, "d"),
    );
    expect(unknown?.model).toBe("unknown");
  });
  it("skips a cancelled turn, an all-zero turn and every other line", () => {
    expect(turnEvents(turn(undefined, { eventId: "e3" }), meta)).toEqual([]);
    expect(turnEvents(turn(u({}), { eventId: "e4" }), meta)).toEqual([]);
    expect(
      turnEvents(
        { params: { update: { sessionUpdate: "agent_message_chunk" } } },
        meta,
      ),
    ).toEqual([]);
  });
  it("keys a turn without an event id by its numbers and its file", () => {
    const [e] = turnEvents(
      turn(u({ input: 10, cached: 4, output: 2 }), { ms: MS }),
      meta,
    );
    expect(e?.dedupeKey).toBe(`grok:dir-1|s1|${MS}|grok-4.7|6|2|4|0|0`);
  });
});

describe("promptRuns", () => {
  const chunk = (text: string, eventId: string, ms: number) => ({
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "user_message_chunk",
        content: { type: "text", text },
      },
      _meta: { eventId, agentTimestampMs: ms },
    },
  });
  const other = (sessionUpdate: string) => ({
    params: { update: { sessionUpdate } },
  });
  it("joins consecutive chunks into one prompt; agent activity ends it, hooks do not", () => {
    const prompts = promptRuns(
      [
        chunk("fix the", "c1", MS),
        other("hook_execution"),
        chunk("login bug", "c2", MS + 1),
        other("agent_message_chunk"),
        chunk("thanks", "c3", MS + 9),
      ],
      meta,
    );
    expect(
      prompts.map((p) => [p.sessionId, p.ts, p.words, p.dedupeKey]),
    ).toEqual([
      ["s1", MS, 4, "grok:s1:c1"],
      ["s1", MS + 9, 1, "grok:s1:c3"],
    ]);
  });
});
