import { describe, expect, it } from "vitest";
import { ADAPTERS, codexHomes } from "@token-damage/core";
import {
  command,
  flagLines,
  flagList,
  LIVE_USAGE,
  parseLiveOptions,
  parseStatuslineOptions,
  USAGE,
} from "../src/args.js";
import { resolveDirs } from "../src/dirs.js";

describe("command", () => {
  it("routes subcommands and leaves the receipt alone", () => {
    expect(command(["live", "--no-anim"])).toEqual({
      command: "live",
      rest: ["--no-anim"],
    });
    expect(command(["--", "statusline", "--rows", "1"])).toEqual({
      command: "statusline",
      rest: ["--rows", "1"],
    });
    expect(command(["--since", "7d"])).toEqual({
      command: "receipt",
      rest: ["--since", "7d"],
    });
    expect(command([])).toEqual({ command: "receipt", rest: [] });
  });
});

describe("parseLiveOptions", () => {
  it("maps a fixture corpus to all four agents and reads the clock", () => {
    const o = parseLiveOptions([
      "--fixtures",
      "/x",
      "--clock",
      "2026-09-24T12:00:00Z",
      "--once",
    ]);
    expect(o).toMatchObject({
      dirs: {
        "claude-code": "/x",
        codex: "/x",
        gemini: "/x/tmp",
        opencode: "/x/opencode",
      },
      fixtures: true,
      once: true,
      json: false,
      anim: true,
      clock: Date.UTC(2026, 8, 24, 12),
    });
  });
  it("rejects a bad clock and unknown flags", () => {
    expect(() => parseLiveOptions(["--clock", "nope"])).toThrow(
      /--clock expects/,
    );
    expect(() => parseLiveOptions(["--since", "7d"])).toThrow();
  });
});

describe("parseStatuslineOptions", () => {
  it("defaults to two rows at 80 columns", () => {
    expect(parseStatuslineOptions([])).toMatchObject({
      rows: 2,
      width: 80,
      install: false,
    });
    expect(
      parseStatuslineOptions(["--rows", "3", "--width", "120"]),
    ).toMatchObject({ rows: 3, width: 120 });
  });
  it("rejects rows outside 1–3 and silly widths", () => {
    expect(() => parseStatuslineOptions(["--rows", "4"])).toThrow(/--rows/);
    expect(() => parseStatuslineOptions(["--width", "10"])).toThrow(/--width/);
  });
});

describe("resolveDirs", () => {
  it("uses flags when given and the defaults otherwise", () => {
    const d = resolveDirs(
      { dirs: { "claude-code": "/c", opencode: "/o" } },
      {},
      "/h",
    );
    expect(d["claude-code"]).toEqual(["/c"]);
    expect(d.opencode).toEqual(["/o"]);
    expect(d.codex).toEqual(codexHomes({}, "/h"));
  });
  it("falls back to the defaults for an empty flag", () => {
    const d = resolveDirs({ dirs: { codex: "" } }, {}, "/h");
    expect(d.codex).toEqual(codexHomes({}, "/h"));
  });
});

describe("agent flags", () => {
  it("lets a fixture corpus win over an agent's own flag", () => {
    expect(
      parseLiveOptions(["--fixtures", "/f", "--codex-home", "/c"]).dirs.codex,
    ).toBe("/f");
  });
  it("lists every agent's flag in both help texts", () => {
    for (const a of ADAPTERS) {
      expect(USAGE).toContain(`  --${a.flag} <path>`);
      expect(LIVE_USAGE).toContain(`--${a.flag}`);
    }
  });
});

describe("agent flag help", () => {
  it("aligns short flags and moves a long flag's description to the next line", () => {
    expect(
      flagLines([
        { flag: "codex-home", help: "Codex home" },
        { flag: "antigravity-dir", help: "Antigravity data dir" },
      ]),
    ).toBe(
      [
        "  --codex-home <path>   Codex home",
        "  --antigravity-dir <path>",
        "                        Antigravity data dir",
      ].join("\n"),
    );
  });
  it("wraps the live flag list at 80 columns", () => {
    const flags = [
      "config-dir",
      "codex-home",
      "gemini-dir",
      "opencode-dir",
      "antigravity-dir",
      "grok-home",
    ];
    const text = flagList(flags.map((flag) => ({ flag })));
    for (const line of text.split("\n"))
      expect(line.length).toBeLessThanOrEqual(80);
    expect(text.replace(/\s+/g, " ").trim()).toBe(
      "--config-dir, --codex-home, --gemini-dir, --opencode-dir, --antigravity-dir, --grok-home <path>",
    );
    expect(flagList(flags.slice(0, 4).map((flag) => ({ flag })))).toBe(
      "  --config-dir, --codex-home, --gemini-dir, --opencode-dir <path>",
    );
  });
});
