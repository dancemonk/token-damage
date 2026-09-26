import { describe, expect, it } from "vitest";
import { buildSnapshot } from "../../src/live/snapshot.js";
import {
  COOLDOWN_MS,
  LIVE_LINES,
  detect,
  emptyVoice,
  speak,
  type VoiceFamily,
} from "../../src/live/voice.js";
import { T0, min, prompt, usage } from "./support.js";

const tz = "UTC";
const snap = (
  u: ReturnType<typeof usage>[],
  p: ReturnType<typeof prompt>[],
  now: number,
  limits = null as never,
) => buildSnapshot({ usage: u, prompts: p, now, limits, timeZone: tz });
const families = (t: { family: VoiceFamily }[]) => t.map((x) => x.family);

describe("detect", () => {
  it("library: a short prompt that read a lot", () => {
    const p = [prompt({ ts: T0 - min(3), words: 4 })];
    const before = snap([], p, T0 - min(2));
    const after = snap([usage({ ts: T0 - min(1), input: 6_000_000 })], p, T0);
    expect(families(detect(before, after, { timeZone: tz }))).toContain(
      "library",
    );
    const long = [prompt({ ts: T0 - min(3), words: 40 })];
    expect(
      families(
        detect(
          snap([], long, T0 - min(2)),
          snap([usage({ ts: T0 - min(1), input: 6e6 })], long, T0),
          { timeZone: tz },
        ),
      ),
    ).not.toContain("library");
  });

  it("library: keeps paths out of trigger keys", () => {
    const pathId = "/Users/someone/.codex/sessions/rollout.jsonl";
    const p = [prompt({ ts: T0 - min(3), words: 4, sessionId: pathId })];
    const u = [usage({ ts: T0 - min(1), input: 6_000_000, sessionId: pathId })];
    const before = snap([], p, T0 - min(2));
    const after = snap(u, p, T0);
    const triggers = detect(before, after, { timeZone: tz });
    expect(families(triggers)).toContain("library");
    const libraryTrigger = triggers.find((t) => t.family === "library");
    expect(libraryTrigger?.key).not.toContain("/Users/");
    const spoke = speak(triggers, emptyVoice(), T0, {
      day: "2026-09-24",
      words: 4,
    });
    expect(spoke.state.fired[0]).not.toContain("/Users/");
  });

  it("swarm: three interns on one turn", () => {
    const p = [prompt({ ts: T0 - min(5) })];
    const u = ["a1", "a2", "a3"].map((a, i) =>
      usage({
        ts: T0 - min(3 - i),
        sessionId: a,
        parentSessionId: "s1",
        agentId: a,
      }),
    );
    expect(
      families(
        detect(snap([], p, T0 - min(4)), snap(u, p, T0), { timeZone: tz }),
      ),
    ).toContain("swarm");
  });

  it("re-read: three turns in a row served from cache", () => {
    const p = [0, 1, 2].map((i) => prompt({ ts: T0 - min(30 - i * 10) }));
    const u = [0, 1, 2].map((i) =>
      usage({ ts: T0 - min(29 - i * 10), input: 10, cacheRead: 1000 }),
    );
    const before = snap(u.slice(0, 2), p, T0 - min(12));
    expect(
      families(detect(before, snap(u, p, T0), { timeZone: tz })),
    ).toContain("re-read");
  });

  it("back: a call after more than an hour", () => {
    const first = usage({ ts: T0 - min(90) });
    const before = snap([first], [], T0 - min(1));
    const after = snap([first, usage({ ts: T0 })], [], T0);
    expect(families(detect(before, after, { timeZone: tz }))).toContain("back");
  });

  it("one last fix: a call between three and six in the morning", () => {
    const late = Date.UTC(2026, 8, 24, 3, 20);
    const before = snap([], [], late - min(1));
    expect(
      families(
        detect(before, snap([usage({ ts: late })], [], late), { timeZone: tz }),
      ),
    ).toContain("one-last-fix");
    const noon = snap([usage({ ts: T0 })], [], T0);
    expect(
      families(detect(snap([], [], T0 - min(1)), noon, { timeZone: tz })),
    ).not.toContain("one-last-fix");
  });

  it("window: Claude's own five-hour number at or above ninety percent", () => {
    const limits = {
      fiveHour: { usedPct: 91, resetsAt: T0 + min(60) },
      asOf: T0,
    } as never;
    expect(
      families(detect(null, snap([], [], T0, limits), { timeZone: tz })),
    ).toContain("window");
  });

  it("quiet: three hours without a call in the daytime", () => {
    const u = [usage({ ts: T0 - min(185) })];
    expect(
      families(
        detect(snap(u, [], T0 - min(2)), snap(u, [], T0), { timeZone: tz }),
      ),
    ).toContain("quiet");
    const night = Date.UTC(2026, 8, 24, 22, 0);
    const n = [usage({ ts: night - min(185) })];
    expect(
      families(
        detect(snap(n, [], night - min(2)), snap(n, [], night), {
          timeZone: tz,
        }),
      ),
    ).not.toContain("quiet");
  });

  it("speedrun: a turn that closed within two minutes of its prompt, a million tokens read", () => {
    const p = [prompt({ ts: T0 - 90_000, words: 40 })];
    const calls = (gap: number) =>
      [0, 1, 2].map((i) =>
        usage({ ts: T0 - 90_000 + 5_000 + i * gap, cacheRead: 400_000 }),
      );
    // prev: the turn is still open; next: five quiet minutes later it has closed.
    const fired = (u: ReturnType<typeof usage>[], later: number) =>
      families(
        detect(snap(u, p, T0), snap(u, p, T0 + later), { timeZone: tz }),
      );
    expect(fired(calls(40_000), min(6))).toContain("speedrun");
    expect(fired(calls(40_000), min(1))).not.toContain("speedrun");
    expect(fired(calls(70_000), min(6))).not.toContain("speedrun");
  });

  it("snob: a closed flagship turn that read a lot and wrote almost nothing", () => {
    const p = [prompt({ ts: T0 - min(3), words: 40 })];
    const calls = (model: string) =>
      [0, 1, 2].map((i) =>
        usage({
          ts: T0 - min(2) + i * 10_000,
          cacheRead: 400_000,
          output: 10,
          model,
        }),
      );
    const fired = (u: ReturnType<typeof usage>[], later: number) =>
      families(
        detect(snap(u, p, T0), snap(u, p, T0 + later), { timeZone: tz }),
      );
    expect(fired(calls("claude-opus-4-7"), min(6))).toContain("snob");
    expect(fired(calls("claude-opus-4-7"), min(1))).not.toContain("snob");
    expect(fired(calls("claude-sonnet-4-6"), min(6))).not.toContain("snob");
  });

  it("second-opinion: a second agent working within the hour", () => {
    const claude = [prompt({ ts: T0 - min(40) }), usage({ ts: T0 - min(39) })];
    const codex = (at: number) => [
      prompt({ ts: at - 30_000, sessionId: "c1", source: "codex" }),
      usage({ ts: at, sessionId: "c1", source: "codex", model: "gpt-5.6-sol" }),
    ];
    const fired = (
      all: (ReturnType<typeof usage> | ReturnType<typeof prompt>)[],
      now: number,
    ) => {
      const u = all.filter((e) => e.kind === "usage") as ReturnType<
        typeof usage
      >[];
      const q = all.filter((e) => e.kind === "prompt") as ReturnType<
        typeof prompt
      >[];
      return families(
        detect(snap(u.slice(0, -1), q, now - min(2)), snap(u, q, now), {
          timeZone: tz,
        }),
      );
    };
    expect(fired([...claude, ...codex(T0 - min(1))], T0)).toContain(
      "second-opinion",
    );
    expect(
      fired([...claude, ...codex(T0 + min(90))], T0 + min(91)),
    ).not.toContain("second-opinion");
  });

  it("does not replay the day's history when the pane opens", () => {
    const p = [prompt({ ts: T0 - min(120), words: 2 })];
    const u = [usage({ ts: T0 - min(119), input: 9e6 })];
    expect(detect(null, snap(u, p, T0), { timeZone: tz })).toEqual([]);
  });
});

describe("speak", () => {
  const ctx = { day: "2026-09-24", words: 4 };
  it("speaks once per key and rotates variants", () => {
    const t = [{ family: "swarm" as const, key: "swarm:s1:1" }];
    const one = speak(t, emptyVoice(), T0, ctx);
    expect(one.note?.family).toBe("swarm");
    expect(LIVE_LINES.swarm).toContain(one.note?.text);
    expect(speak(t, one.state, T0 + COOLDOWN_MS + 1, ctx).note).toBeNull();
    const two = speak(
      [{ family: "swarm", key: "swarm:s1:2" }],
      one.state,
      T0 + COOLDOWN_MS + 1,
      ctx,
    );
    expect(two.note?.text).not.toBe(one.note?.text);
  });

  it("keeps quiet during the cooldown and prefers the higher-priority family", () => {
    const first = speak([{ family: "back", key: "b" }], emptyVoice(), T0, ctx);
    expect(
      speak(
        [{ family: "quiet", key: "q" }],
        first.state,
        T0 + COOLDOWN_MS - 1,
        ctx,
      ).note,
    ).toBeNull();
    const both = speak(
      [
        { family: "quiet", key: "q" },
        { family: "window", key: "w" },
      ],
      emptyVoice(),
      T0,
      ctx,
    );
    expect(both.note?.family).toBe("window");
  });

  it("fills the words slot with a word, never a digit", () => {
    for (let words = 0; words <= 10; words++) {
      let state = emptyVoice();
      for (let i = 0; i < LIVE_LINES.library.length; i++) {
        const r = speak(
          [{ family: "library", key: `l${i}` }],
          state,
          T0 + i * (COOLDOWN_MS + 1),
          { day: "2026-09-24", words },
        );
        expect(r.note?.text).not.toMatch(/\d|\{/);
        state = r.state;
      }
    }
  });
});

describe("copy", () => {
  it("has at least five digit-free variants per family, no exclamation marks, no emoji", () => {
    for (const [family, lines] of Object.entries(LIVE_LINES)) {
      expect(lines.length, family).toBeGreaterThanOrEqual(5);
      for (const line of lines) {
        expect(line).not.toMatch(/\d/);
        expect(line).not.toContain("!");
        expect(line).toMatch(/^[\x20-\x7e{}]+$/);
        expect(line).toBe(line.toLowerCase());
      }
    }
  });
});
