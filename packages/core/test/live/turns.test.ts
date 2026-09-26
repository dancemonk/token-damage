import { describe, expect, it } from "vitest";
import { buildTurns } from "../../src/live/turns.js";
import { T0, min, prompt, usage } from "./support.js";

describe("buildTurns", () => {
  it("counts a record's model calls, not the record", () => {
    const turns = buildTurns(
      [usage({ ts: T0 + min(1), calls: 13 })],
      [prompt({ ts: T0, words: 3 })],
      T0 + min(12),
    );
    expect(turns[0]?.calls).toBe(13);
  });

  it("attributes usage to the latest prompt in the session", () => {
    const prompts = [
      prompt({ ts: T0, words: 12 }),
      prompt({ ts: T0 + min(10), words: 4 }),
    ];
    const events = [
      usage({ ts: T0 + min(1), input: 1000 }),
      usage({ ts: T0 + min(2), input: 2000, cacheRead: 500 }),
      usage({ ts: T0 + min(11), input: 5000 }),
    ];
    const turns = buildTurns(events, prompts, T0 + min(12));
    expect(turns.map((t) => [t.words, t.read, t.calls])).toEqual([
      [12, 3500, 2],
      [4, 5000, 1],
    ]);
  });

  it("counts subagent usage toward the root session and its interns", () => {
    const prompts = [prompt({ ts: T0, words: 3 })];
    const events = [
      usage({ ts: T0 + min(1), input: 100 }),
      usage({
        ts: T0 + min(2),
        sessionId: "a1",
        parentSessionId: "s1",
        agentId: "a1",
        input: 1000,
      }),
      usage({
        ts: T0 + min(3),
        sessionId: "a2",
        parentSessionId: "s1",
        agentId: "a2",
        input: 1000,
      }),
      usage({
        ts: T0 + min(4),
        sessionId: "a1",
        parentSessionId: "s1",
        agentId: "a1",
        input: 1000,
      }),
    ];
    const [turn] = buildTurns(events, prompts, T0 + min(5));
    expect(turn).toMatchObject({
      sessionId: "s1",
      words: 3,
      read: 3100,
      interns: 2,
      calls: 4,
    });
  });

  it("gives a session with usage before its first prompt an unknown-words turn", () => {
    const events = [usage({ ts: T0 + min(1), input: 700 })];
    const prompts = [prompt({ ts: T0 + min(5), words: 9 })];
    const turns = buildTurns(events, prompts, T0 + min(6));
    expect(turns.map((t) => [t.words, t.read, t.start])).toEqual([
      [null, 700, T0 + min(1)],
      [9, 0, T0 + min(5)],
    ]);
  });

  it("marks only the last turn of a recently active session open", () => {
    const prompts = [
      prompt({ ts: T0 }),
      prompt({ ts: T0 + min(10) }),
      prompt({ ts: T0 + min(20), sessionId: "s2" }),
    ];
    const events = [
      usage({ ts: T0 + min(1) }),
      usage({ ts: T0 + min(11) }),
      usage({ ts: T0 + min(21), sessionId: "s2" }),
    ];
    const now = T0 + min(15); // s1's last turn is 4 min old (open); s2 has not happened yet at `now`
    const turns = buildTurns(
      events.filter((e) => e.ts <= now),
      prompts.filter((p) => p.ts <= now),
      now,
    );
    expect(turns.map((t) => t.open)).toEqual([false, true]);
    const later = buildTurns(events, prompts, T0 + min(40));
    expect(later.every((t) => !t.open)).toBe(true);
  });

  it("keeps a just-typed prompt open with nothing read yet", () => {
    const [turn] = buildTurns([], [prompt({ ts: T0, words: 2 })], T0 + min(1));
    expect(turn).toMatchObject({
      words: 2,
      read: 0,
      calls: 0,
      open: true,
      end: T0,
    });
  });

  it("orders turns by start time across sessions", () => {
    const prompts = [
      prompt({ ts: T0 + min(5), sessionId: "s2" }),
      prompt({ ts: T0, sessionId: "s1" }),
    ];
    const turns = buildTurns([], prompts, T0 + min(6));
    expect(turns.map((t) => t.sessionId)).toEqual(["s1", "s2"]);
  });
});
