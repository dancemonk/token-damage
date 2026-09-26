import { describe, expect, it } from "vitest";
import {
  conversationEvents,
  DEFAULT_MODEL,
  mergeEvents,
  type ConversationRows,
} from "../../src/adapters/antigravity/events.js";
import {
  modelNameFromId,
  normalizeModel,
  withoutEffort,
} from "../../src/adapters/antigravity/models.js";
import {
  generationMeta,
  stepMeta,
  trajectoryTs,
} from "../../src/adapters/antigravity/parse.js";
import { priceFor } from "../../src/metrics/pricing.js";
import { encode, type Message } from "../../scripts/antigravity-proto.js";

const T = 1_788_000_000; // seconds
const stamp = (s: number): Message => [
  [1, s],
  [2, 500_000_000],
];
const usage = (u: {
  input?: number;
  out?: number;
  cw?: number;
  cr?: number;
  reasoning?: number;
  visible?: number;
  response?: string;
  message?: string;
  modelId?: number;
}): Message => [
  ...(u.modelId ? ([[1, u.modelId]] as Message) : []),
  [2, u.input ?? 0],
  [3, u.out ?? 0],
  [4, u.cw ?? 0],
  [5, u.cr ?? 0],
  [9, u.reasoning ?? 0],
  [10, u.visible ?? 0],
  ...(u.message ? ([[7, u.message]] as Message) : []),
  ...(u.response ? ([[11, u.response]] as Message) : []),
];
const gen = (chat: Message) => generationMeta(encode([[1, chat]]));
const rows = (over: Partial<ConversationRows>): ConversationRows => ({
  sessionId: "c1",
  fallbackTs: 1,
  steps: [],
  generations: [],
  ...over,
});

describe("Antigravity models", () => {
  it("maps ids, display names and placeholders like ccusage", () => {
    expect(modelNameFromId(1318)).toBe("gemini-3.8-flash-high");
    expect(modelNameFromId(1050)).toBe("model_placeholder_m50");
    expect(normalizeModel("Gemini 3.8 Flash (High)")).toBe(
      "gemini-3.8-flash-high",
    );
    expect(normalizeModel("model_placeholder_m26")).toBe("claude-opus-4-6");
    expect(normalizeModel("  ")).toBeUndefined();
  });
  it("names Claude models the way the price table does, so they price exactly", () => {
    for (const [id, name] of [
      [281, "claude-sonnet-4"],
      [290, "claude-opus-4"],
      [333, "claude-sonnet-4-5"],
      [340, "claude-haiku-4-5"],
    ] as const) {
      expect(modelNameFromId(id)).toBe(name);
      expect(priceFor(name)?.isFallback, name).toBe(false);
    }
  });
  it("prices a thinking level as its base model", () => {
    expect(withoutEffort("gemini-3.8-flash-high")).toBe("gemini-3.8-flash");
    expect(withoutEffort("gemini-3.5-flash-extra-low")).toBe(
      "gemini-3.5-flash",
    );
    expect(withoutEffort("gemini-2.5-flash-lite")).toBe(
      "gemini-2.5-flash-lite",
    );
    expect(withoutEffort("claude-opus-4-6")).toBe("claude-opus-4-6");
  });
});

describe("conversationEvents", () => {
  it("reads a generation's usage, retries and time, and bills reasoning as output", () => {
    const events = conversationEvents(
      rows({
        generations: [
          {
            idx: 0,
            meta: gen([
              [19, "Gemini 3.8 Flash (High)"],
              [
                4,
                usage({
                  input: 100,
                  cr: 900,
                  visible: 20,
                  reasoning: 30,
                  response: "r1",
                }),
              ],
              [17, [[2, usage({ input: 5, out: 7, response: "r2" })]]],
              [9, [[4, stamp(T)]]],
            ]),
          },
        ],
      }),
    );
    expect(
      events.map((e) => [
        e.model,
        e.input,
        e.cacheRead,
        e.totalOutput,
        e.ts,
        e.tsRank,
      ]),
    ).toEqual([
      ["gemini-3.8-flash-high", 100, 900, 50, T * 1000 + 500, 3],
      ["gemini-3.8-flash-high", 5, 0, 7, T * 1000 + 500, 3],
    ]);
  });
  it("skips records without tokens and falls back to the conversation's time, then the file's", () => {
    const traj = trajectoryTs(encode([[2, stamp(T + 60)]]));
    const noStamp = gen([
      [4, usage({ input: 1 })],
      [17, [[2, usage({})]]],
    ]);
    expect(
      conversationEvents(
        rows({ trajectoryTs: traj, generations: [{ idx: 0, meta: noStamp }] }),
      ).map((e) => [e.ts, e.tsRank]),
    ).toEqual([[(T + 60) * 1000 + 500, 1]]);
    expect(
      conversationEvents(
        rows({ fallbackTs: 42, generations: [{ idx: 0, meta: noStamp }] }),
      ).map((e) => [e.ts, e.tsRank]),
    ).toEqual([[42, 0]]);
  });
  it("names a step by its own model, else the conversation's last generation model", () => {
    const step = stepMeta(
      encode([
        [9, usage({ input: 3, response: "s1" })],
        [8, stamp(T)],
      ]),
    );
    const events = conversationEvents(
      rows({
        steps: [{ idx: 0, meta: step }],
        generations: [
          {
            idx: 0,
            meta: gen([
              [21, "Gemini 3.7 Flash"],
              [4, usage({ input: 1 })],
            ]),
          },
        ],
      }),
    );
    expect(events[0]?.model).toBe("gemini-3.7-flash");
    const unnamed = conversationEvents(
      rows({ steps: [{ idx: 0, meta: step }] }),
    );
    expect(unnamed[0]?.model).toBe(DEFAULT_MODEL);
  });
});

describe("mergeEvents", () => {
  it("merges records that share any id, keeping the larger numbers and the best time", () => {
    const a = conversationEvents(
      rows({
        sessionId: "c1",
        steps: [
          {
            idx: 0,
            meta: stepMeta(
              encode([
                [
                  9,
                  usage({
                    input: 10,
                    visible: 5,
                    reasoning: 0,
                    response: "r1",
                    message: "m1",
                  }),
                ],
                [8, stamp(T)],
              ]),
            ),
          },
        ],
      }),
    );
    const b = conversationEvents(
      rows({
        sessionId: "c2",
        fallbackTs: 7,
        generations: [
          {
            idx: 0,
            meta: gen([[4, usage({ input: 12, reasoning: 4, message: "m1" })]]),
          },
        ],
      }),
    );
    const merged = mergeEvents([...a, ...b]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      sessionId: "c1",
      input: 12,
      visible: 5,
      reasoning: 4,
      totalOutput: 9,
      ts: T * 1000 + 500,
      tsRank: 3,
      messageId: "response:r1",
    });
  });
  it("never merges records without an id", () => {
    const e = conversationEvents(
      rows({
        generations: [
          { idx: 0, meta: gen([[4, usage({ input: 1 })]]) },
          { idx: 1, meta: gen([[4, usage({ input: 1 })]]) },
        ],
      }),
    );
    expect(mergeEvents(e)).toHaveLength(2);
  });
});
