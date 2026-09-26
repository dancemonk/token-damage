import { describe, expect, it } from "vitest";
import { achievements, type Facts } from "../src/index.js";
import samples from "../fixtures/samples.json" with { type: "json" };

// A period that earns nothing, so each test adds exactly one reason.
const none: Facts = {
  ...(samples.customers[2]!.facts as unknown as Facts),
  lastCall: null,
  longestIdleDays: 0,
  cacheLordWeek: false,
  sessionSpansThreeDays: false,
  maxSubagentsInDay: 0,
  snobSession: null,
  speedrun: null,
  burstSessions: 0,
  agentsInOneHour: 1,
  agentPair: null,
  cacheRebuilds: 0,
  unpromptedShare: 0,
};
const earned = (over: Partial<Facts>) =>
  achievements({ ...none, ...over }).map((a) => [a.name, a.trigger, a.hidden]);

describe("achievements from session shapes", () => {
  it("earns nothing on an ordinary period", () => {
    expect(earned({})).toEqual([]);
  });

  it("MIDDLE MANAGER: five subagents in one day, not four", () => {
    expect(earned({ maxSubagentsInDay: 5 })).toEqual([
      ["MIDDLE MANAGER", "5 subagents in one day", false],
    ]);
    expect(earned({ maxSubagentsInDay: 4 })).toEqual([]);
  });

  it("BILINGUAL: two agents inside one hour, busier first", () => {
    expect(
      earned({ agentsInOneHour: 2, agentPair: ["codex", "claude-code"] }),
    ).toEqual([["BILINGUAL", "Codex and Claude Code within one hour", false]]);
  });

  it("SPEEDRUN: the biggest session over in two minutes", () => {
    expect(earned({ speedrun: { tokens: 1_300_000, seconds: 94 } })).toEqual([
      ["SPEEDRUN", "1.3 million tokens in 94 seconds", false],
    ]);
  });

  it("MODEL SNOB and CACHE ARSON are hidden until earned", () => {
    expect(
      earned({ snobSession: { output: 212, read: 3_000_000, calls: 7 } }),
    ).toEqual([
      [
        "MODEL SNOB",
        "3 million tokens read, 212 written, flagship models only",
        true,
      ],
    ]);
    expect(earned({ cacheRebuilds: 5 })).toEqual([
      ["CACHE ARSON", "5 cache rebuilds with no idle gap", true],
    ]);
    expect(earned({ cacheRebuilds: 4 })).toEqual([]);
  });
});
