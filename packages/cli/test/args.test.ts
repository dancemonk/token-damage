import { describe, expect, it } from "vitest";
import { codexHomes } from "@token-damage/core";
import {
  command,
  parseLiveOptions,
  parseStatuslineOptions,
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
      configDir: "/x",
      codexHome: "/x",
      geminiDir: "/x/tmp",
      opencodeDir: "/x/opencode",
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
      {
        configDir: "/c",
        codexHome: undefined,
        geminiDir: undefined,
        opencodeDir: "/o",
      },
      {},
      "/h",
    );
    expect(d.claudeRoots).toEqual(["/c"]);
    expect(d.opencodeDirs).toEqual(["/o"]);
    expect(d.codexHomes).toEqual(codexHomes({}, "/h"));
  });
});
