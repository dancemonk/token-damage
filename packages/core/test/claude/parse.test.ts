import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  emptyStats,
  parseLine,
  parseLines,
  readLines,
  subagentOf,
  type UsageEvent,
} from "../../src/index.js";

const fixture = (rel: string) =>
  fileURLToPath(new URL(`../../fixtures/claude/${rel}`, import.meta.url));

async function parseFixture(rel: string) {
  const path = fixture(rel);
  const stats = emptyStats();
  const events: UsageEvent[] = [];
  for await (const event of parseLines(
    readLines(path),
    stats,
    subagentOf(path),
  ))
    events.push(event);
  return { events, stats };
}

const SESSION = "4aaff5d2-be7b-4975-9f06-ceeb9fcdd99a";
const MESSAGE = "msg_011CfMFmrGDzU7jaXhbeAxw4";
const REQUEST = "req_011CfMFmqkxNL5EWpbE33TLW";
const NORMAL = {
  source: "claude-code",
  sessionId: SESSION,
  ts: Date.parse("2026-09-23T23:41:04.031Z"),
  model: "claude-opus-5-5",
  input: 2,
  cacheWrite: 940,
  cacheRead: 62003,
  output: 161,
  messageId: MESSAGE,
  dedupeKey: `${MESSAGE}|${REQUEST}`,
  version: "2.1.281",
};
const tokens = (e: UsageEvent) => [
  e.input,
  e.cacheWrite,
  e.cacheRead,
  e.output,
];

describe("claude parser fixtures", () => {
  it("normal: one event from the assistant line, other lines skipped", async () => {
    const { events, stats } = await parseFixture("2.1.281/normal.jsonl");
    expect(events).toEqual([NORMAL]);
    expect(stats).toEqual({
      lines: 5,
      events: 1,
      malformed: 0,
      synthetic: 0,
      versions: { "2.1.281": 1 },
    });
  });

  it("parallel tool use: one event per line, all sharing a dedupe key", async () => {
    const { events } = await parseFixture("2.1.281/parallel-tool-use.jsonl");
    expect(events).toHaveLength(3);
    expect(new Set(events.map((e) => e.dedupeKey)).size).toBe(1);
    expect(events.map(tokens)).toEqual(Array(3).fill([2, 34013, 22730, 712]));
  });

  it("streaming duplicate: every snapshot is emitted, final one has the full output", async () => {
    const { events } = await parseFixture("2.1.237/streaming-duplicate.jsonl");
    expect(new Set(events.map((e) => e.dedupeKey)).size).toBe(1);
    expect(events.map((e) => e.output)).toEqual([1, 1, 395]);
    expect(events[0]).toMatchObject({
      model: "claude-opus-5",
      agentId: "a2635e69437016b10",
      isSidechain: true,
    });
  });

  it("subagent file: attributed to the parent session and agent from the path", async () => {
    const { events } = await parseFixture(
      `2.1.281/subagent/${SESSION}/subagents/agent-a17725cd7adf9ae7d.jsonl`,
    );
    expect(events.map((e) => e.output)).toEqual([4, 160, 121]);
    for (const e of events) {
      expect(e).toMatchObject({
        sessionId: SESSION,
        parentSessionId: SESSION,
        agentId: "a17725cd7adf9ae7d",
        isSidechain: true,
      });
    }
  });

  it("synthetic model rows are excluded and counted", async () => {
    const { events, stats } = await parseFixture(
      "2.1.237/synthetic-model.jsonl",
    );
    expect(events).toEqual([]);
    expect(stats.synthetic).toBe(1);
  });

  it("missing requestId: dedupe key falls back to the session", async () => {
    const { events } = await parseFixture("2.1.281/missing-request-id.jsonl");
    expect(events).toEqual([
      { ...NORMAL, dedupeKey: `${MESSAGE}|session:${SESSION}` },
    ]);
  });

  it("advisor iterations become separate events under their own model", async () => {
    const { events, stats } = await parseFixture(
      "2.1.281/advisor-iterations.jsonl",
    );
    expect(events).toEqual([
      NORMAL,
      {
        ...NORMAL,
        model: "claude-opus-5",
        dedupeKey: `${NORMAL.dedupeKey}|advisor:1`,
        input: 1200,
        cacheWrite: 0,
        cacheRead: 18000,
        output: 350,
      },
    ]);
    expect(stats.versions).toEqual({ "2.1.281": 1 });
  });

  it("sidechain replay keeps the message id, flags the replay", async () => {
    const { events } = await parseFixture("2.1.281/sidechain-replay.jsonl");
    expect(events.map((e) => [e.messageId, e.isSidechain ?? false])).toEqual([
      [MESSAGE, false],
      [MESSAGE, true],
    ]);
    expect(events[0]?.dedupeKey).not.toBe(events[1]?.dedupeKey);
  });

  it("malformed: a record split over two lines is skipped, parsing continues", async () => {
    const { events, stats } = await parseFixture("2.1.281/malformed.jsonl");
    expect(events).toHaveLength(1);
    expect(events[0]?.output).toBe(712);
    expect(stats).toMatchObject({ lines: 3, events: 1, malformed: 1 });
  });
});

describe("parseLine", () => {
  const line = (row: object) => JSON.stringify(row);
  const assistant = (usage: object, extra: object = {}) => ({
    type: "assistant",
    sessionId: "s",
    timestamp: "2026-09-01T00:00:00.000Z",
    requestId: "r",
    message: { id: "m", model: "claude-x", usage },
    ...extra,
  });

  it("treats missing token fields as 0", () => {
    const result = parseLine(line(assistant({ output_tokens: 5 })));
    expect(result.kind === "events" && result.events.map(tokens)).toEqual([
      [0, 0, 0, 5],
    ]);
  });

  it("skips non-assistant lines even when they mention usage", () => {
    expect(parseLine(line({ type: "user", message: { usage: {} } }))).toEqual({
      kind: "skipped",
    });
    expect(parseLine('{"type":"user","text":"no usage here"')).toEqual({
      kind: "skipped",
    });
  });

  it("does not add non-advisor iterations again", () => {
    const result = parseLine(
      line(
        assistant({
          output_tokens: 5,
          iterations: [{ type: "message", output_tokens: 5 }],
        }),
      ),
    );
    expect(result.kind === "events" && result.events).toHaveLength(1);
  });

  it("uses advisorModel when an advisor iteration has no model", () => {
    const usage = {
      iterations: [{ type: "advisor_message", output_tokens: 9 }],
    };
    const result = parseLine(
      line(assistant(usage, { advisorModel: "claude-adv" })),
    );
    expect(result.kind === "events" && result.events[1]?.model).toBe(
      "claude-adv",
    );
  });

  it("marks usage lines without message id or valid timestamp as malformed", () => {
    expect(
      parseLine(
        line(assistant({}, { message: { model: "claude-x", usage: {} } })),
      ),
    ).toEqual({
      kind: "malformed",
    });
    expect(parseLine(line(assistant({}, { timestamp: "yesterday" })))).toEqual({
      kind: "malformed",
    });
  });
});
