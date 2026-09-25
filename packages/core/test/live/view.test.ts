import { describe, expect, it } from "vitest";
import { paint } from "../../src/receipt/text.js";
import type { TapeEvent } from "../../src/live/engine.js";
import { buildSnapshot } from "../../src/live/snapshot.js";
import { duration, liveLines, sparkline } from "../../src/live/view.js";
import { T0, min, prompt, usage } from "./support.js";

const tz = "UTC";
const events = [
  prompt({ ts: T0 - min(80), words: 12 }),
  usage({ ts: T0 - min(79), input: 3_000_000, cacheRead: 100_000 }),
  prompt({ ts: T0 - min(60), words: 31, sessionId: "s2", source: "codex" }),
  usage({
    ts: T0 - min(59),
    sessionId: "s2",
    source: "codex",
    model: "gpt-5.6-sol",
    input: 410_000,
  }),
  // 45-minute gap, then the open turn with three interns
  prompt({ ts: T0 - min(3), words: 4 }),
  usage({ ts: T0 - min(2), input: 20_000_000 }),
  usage({
    ts: T0 - min(2),
    sessionId: "a1",
    parentSessionId: "s1",
    agentId: "a1",
    input: 5_000_000,
  }),
  usage({
    ts: T0 - min(1),
    sessionId: "a2",
    parentSessionId: "s1",
    agentId: "a2",
    input: 5_000_000,
  }),
  usage({
    ts: T0 - min(1),
    sessionId: "a3",
    parentSessionId: "s1",
    agentId: "a3",
    input: 5_000_000,
  }),
];
const usageOnly = events.filter((e) => e.kind === "usage");
const promptsOnly = events.filter((e) => e.kind === "prompt");
const limits = {
  fiveHour: { usedPct: 58, resetsAt: Date.UTC(2026, 8, 24, 16, 0) },
  sevenDay: { usedPct: 21, resetsAt: Date.UTC(2026, 8, 28, 9, 0) },
  asOf: T0,
};
const snap = buildSnapshot({
  usage: usageOnly,
  prompts: promptsOnly,
  now: T0,
  limits,
  timeZone: tz,
});
const tape: TapeEvent[] = [
  { kind: "stamped", ts: T0 - 30_000, name: "WATER DAMAGE" },
  {
    kind: "note",
    ts: T0 - 10_000,
    family: "library",
    text: "four words in. a library out. the usual.",
  },
];
const view = (width: number, height: number) =>
  liveLines(snap, tape, { width, height, timeZone: tz });

describe("liveLines", () => {
  it("prints the five glance rows", () => {
    const [cls, today, now, rate, lim] = view(64, 30).map((l) => l.text);
    expect(cls).toMatch(/^WATER DAMAGE {3}next STRUCTURAL at 100M ·+ \d+%$/);
    expect(today).toMatch(
      /^today {3}47 words → 38\.5M read +≡ \$[\d,]+\.\d\d$/,
    );
    expect(now).toMatch(
      /^now {5}claude·1\+3 · 4 words → 35\.0M ▸ +≡ \$[\d,.]+$/,
    );
    expect(rate).toMatch(
      /^rate {4}[\d.]+[KM]?\/min [▁▂▃▄▅▆▇█]{10} {3}● printing$/,
    );
    expect(lim).toBe("limits  5h 58% resets 16:00 · 7d 21% resets mon");
    expect(view(64, 30)[0]?.style).toBe("bold");
    expect(view(64, 30)[2]?.style).toBe("bold");
  });

  it("prints the tape oldest to newest with an idle rule and events", () => {
    const lines = view(64, 30).map((l) => l.text);
    const header = lines.findIndex((l) => l.startsWith("time"));
    const tapeRows = lines.slice(header + 1, -1).filter((l) => l.trim() !== "");
    expect(tapeRows[0]).toMatch(/^10:40 {2}claude·1 +12 words → +3\.1M +≡ \$/);
    expect(tapeRows[1]).toMatch(/idle 19 min/);
    expect(tapeRows[2]).toMatch(/^11:00 {2}codex·2 +31 words → +410\.0K +≡ \$/);
    expect(tapeRows[3]).toMatch(/idle 58 min/);
    expect(tapeRows[4]).toMatch(/^11:59 {2}━━ stamped WATER DAMAGE ━+$/);
    expect(tapeRows[5]).toBe("✶ four words in. a library out. the usual.");
    expect(tapeRows).toHaveLength(6); // the open turn is on the `now` row, not the tape
    expect(lines.at(-1)).toMatch(/≡ list price · ✶ satire · q quit$/);
  });

  it("colours only satire and a fresh stamp red", () => {
    const lines = view(64, 30);
    const red = lines.filter((l) => l.style === "red").map((l) => l.text);
    expect(red).toHaveLength(2);
    const later = liveLines({ ...snap, now: T0 + min(5) }, tape, {
      width: 64,
      height: 30,
      timeZone: tz,
    });
    expect(later.filter((l) => l.style === "red")).toHaveLength(1);
  });

  it.each([40, 45, 50, 64, 100])("never overflows at width %i", (width) => {
    for (const height of [5, 12, 30]) {
      const lines = liveLines(snap, tape, { width, height, timeZone: tz });
      expect(lines.length).toBeLessThanOrEqual(height);
      if (height >= 12) expect(lines).toHaveLength(height);
      for (const l of lines) expect(l.text.length).toBeLessThanOrEqual(width);
    }
  });

  it("drops the price column below 50 columns and the sparkline below 45", () => {
    expect(view(46, 30).some((l) => l.text.includes("≡"))).toBe(false);
    expect(view(46, 30)[3]?.text).toMatch(/[▁▂▃▄▅▆▇█]{10}/);
    expect(view(42, 30)[3]?.text).not.toMatch(/[▁▂▃▄▅▆▇█]/);
  });

  it("shows only the glance rows in a short pane, and asks to be widened when too narrow", () => {
    expect(view(64, 5).map((l) => l.text)[4]).toMatch(/^limits/);
    expect(view(64, 3)).toHaveLength(3);
    expect(view(30, 30)).toEqual([
      { text: "token damage · widen me", style: "muted" },
    ]);
  });

  it("says something useful when nothing happened yet", () => {
    const empty = buildSnapshot({
      usage: [],
      prompts: [],
      now: T0,
      timeZone: tz,
    });
    const lines = liveLines(empty, [], {
      width: 64,
      height: 14,
      timeZone: tz,
    }).map((l) => l.text);
    expect(lines[2]).toBe("now     nothing yet today");
    expect(lines.some((l) => l === "nothing printed yet today.")).toBe(true);
    expect(lines.some((l) => l.startsWith("limits"))).toBe(false);
    const none = liveLines(empty, [], {
      width: 64,
      height: 14,
      timeZone: tz,
      noLogs: true,
    }).map((l) => l.text);
    expect(none.some((l) => l === "no agent logs yet. start one.")).toBe(true);
  });

  it("marks stale limits and idle state", () => {
    const later = {
      ...snap,
      now: T0 + min(20),
      open: null,
      printing: false,
      idleMs: min(21),
    };
    const lines = liveLines(later, [], {
      width: 64,
      height: 30,
      timeZone: tz,
    }).map((l) => l.text);
    expect(lines[2]).toMatch(/^now {5}idle 21 min · last turn ≡ \$/);
    expect(lines[3]).toMatch(/● idle 21 min$/);
    expect(lines[4]).toMatch(/· as of 12:00$/);
  });

  it("paints without changing the text", () => {
    // Built at runtime, not as a regex literal: a literal \x1b trips eslint's no-control-regex.
    const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
    for (const line of view(64, 30)) {
      const painted = paint(line, true).replace(ansi, "");
      expect(painted).toBe(line.text);
    }
  });
});

describe("helpers", () => {
  it("draws a sparkline scaled to its maximum", () => {
    expect(sparkline([0, 0, 0])).toBe("▁▁▁");
    expect(sparkline([1, 2, 4, 8])).toBe("▂▃▅█");
  });
  it("prints durations", () => {
    expect(duration(min(14))).toBe("14 min");
    expect(duration(min(65))).toBe("1 h 5 min");
    expect(duration(min(120))).toBe("2 h");
    expect(duration(20_000)).toBe("0 min");
  });
});
