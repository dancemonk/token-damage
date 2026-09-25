import { describe, expect, it } from "vitest";
import { buildSnapshot } from "../../src/live/snapshot.js";
import { parseStatusInput, statuslineRows } from "../../src/live/statusline.js";
import { T0, min, prompt, usage } from "./support.js";

const tz = "UTC";
const claude = JSON.stringify({
  session_id: "s1",
  transcript_path: "/Users/x/.claude/projects/p/s1.jsonl",
  model: { display_name: "Opus" },
  context_window: { used_percentage: 41 },
  rate_limits: {
    five_hour: {
      used_percentage: 58.4,
      resets_at: Date.UTC(2026, 8, 24, 16, 0) / 1000,
    },
    seven_day: {
      used_percentage: 21,
      resets_at: Date.UTC(2026, 8, 28, 9, 0) / 1000,
    },
  },
});

describe("parseStatusInput", () => {
  it("reads what we use and converts reset times to ms", () => {
    const input = parseStatusInput(claude, T0);
    expect(input).toEqual({
      sessionId: "s1",
      contextPct: 41,
      limits: {
        fiveHour: { usedPct: 58.4, resetsAt: Date.UTC(2026, 8, 24, 16, 0) },
        sevenDay: { usedPct: 21, resetsAt: Date.UTC(2026, 8, 28, 9, 0) },
        asOf: T0,
      },
    });
    expect(JSON.stringify(input)).not.toContain("/Users/");
  });

  it.each([
    "",
    "{",
    "null",
    "[]",
    '{"session_id":7}',
    '{"rate_limits":{"five_hour":{"used_percentage":"x"}}}',
  ])("never throws on %j", (raw) => {
    const input = parseStatusInput(raw, T0);
    expect(input.limits === null || typeof input.limits === "object").toBe(
      true,
    );
    expect(
      input.sessionId === null || typeof input.sessionId === "string",
    ).toBe(true);
  });
});

describe("statuslineRows", () => {
  const p = [prompt({ ts: T0 - min(3), words: 4 })];
  const u = [
    usage({ ts: T0 - min(2), input: 6_800_000 }),
    ...["a1", "a2", "a3"].map((a) =>
      usage({
        ts: T0 - min(1),
        sessionId: a,
        parentSessionId: "s1",
        agentId: a,
        input: 1_000_000,
      }),
    ),
    usage({ ts: T0 - min(50), sessionId: "other", input: 28_400_000 }),
  ];
  const s = buildSnapshot({ usage: u, prompts: p, now: T0, timeZone: tz });
  const input = parseStatusInput(claude, T0);
  const note = [
    {
      kind: "note" as const,
      ts: T0,
      family: "swarm",
      text: "a small department has formed around your prompt.",
    },
  ];

  it("prints this session's open turn, then today", () => {
    const [one, two] = statuslineRows(s, input, note, {
      rows: 2,
      width: 80,
      timeZone: tz,
    }).map((l) => l.text);
    expect(one).toMatch(
      /^▸ 4 words → 9\.8M read ≡ \$[\d,.]+ · \+3 interns · ctx 41%$/,
    );
    expect(two).toMatch(
      /^WATER DAMAGE · today 38\.2M ≡ \$[\d,.]+ · 5h 58% resets 16:00 · 7d 21%$/,
    );
  });

  it("offers one and three rows", () => {
    expect(
      statuslineRows(s, input, note, { rows: 1, width: 80, timeZone: tz }).map(
        (l) => l.text,
      ),
    ).toEqual([
      expect.stringMatching(
        /^WATER DAMAGE · ▸ 4 words → 9\.8M ≡ \$[\d,.]+ · 5h 58%$/,
      ),
    ]);
    const three = statuslineRows(s, input, note, {
      rows: 3,
      width: 80,
      timeZone: tz,
    });
    expect(three[2]).toEqual({
      text: "✶ a small department has formed around your prompt.",
      style: "red",
    });
  });

  it("describes an idle session and an unknown one", () => {
    const idle = buildSnapshot({
      usage: u,
      prompts: p,
      now: T0 + min(14),
      timeZone: tz,
    });
    expect(
      statuslineRows(idle, input, [], { rows: 2, width: 80, timeZone: tz })[0]
        ?.text,
    ).toMatch(/^▸ idle 15 min · last turn ≡ \$[\d,.]+ · ctx 41%$/);
    const stranger = { ...input, sessionId: "never-seen" };
    expect(
      statuslineRows(s, stranger, [], { rows: 2, width: 80, timeZone: tz })[0]
        ?.text,
    ).toBe("▸ nothing yet in this session · ctx 41%");
  });

  it("fits the width and leaves out limits Claude did not send", () => {
    for (const width of [40, 60, 80])
      for (const l of statuslineRows(s, input, note, { rows: 3, width }))
        expect(l.text.length).toBeLessThanOrEqual(width);
    const bare = parseStatusInput('{"session_id":"s1"}', T0);
    const [one, two] = statuslineRows(s, bare, [], {
      rows: 2,
      width: 80,
      timeZone: tz,
    }).map((l) => l.text);
    expect(one).not.toContain("ctx");
    expect(two).not.toContain("5h");
  });
});
