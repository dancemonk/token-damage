import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeSampleMonth } from "../../core/scripts/sample-month.js";
import { parseGuess, parseOptions } from "../src/args.js";
import { VERSION } from "../src/version.js";
import { validate } from "./schema.js";

const CLI = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "td-cli-"));
  await mkdir(join(dir, "home"));
  await writeSampleMonth(join(dir, "sample-month"));
}, 60_000);
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

// A pinned "today", UTC, no colour, and a throwaway HOME so nothing touches the real ~/.token-damage.
function cli(...args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      TZ: "UTC",
      NO_COLOR: "1",
      HOME: join(dir, "home"),
      TOKEN_DAMAGE_NOW: "2026-09-23T12:00:00Z",
    },
  });
}

/** The fenced block under a heading of docs/CLI.md. */
function spec(heading: string): string {
  const doc = readFileSync(join(ROOT, "docs/CLI.md"), "utf8");
  return (doc.split(heading)[1]?.split("```")[1] ?? "")
    .replace(/^\n/, "")
    .replace(/\n$/, "");
}

describe("token-damage --fixtures sample-month --no-anim --plan 200", () => {
  it("prints the receipt in docs/CLI.md exactly", () => {
    const run = cli(
      "--fixtures",
      join(dir, "sample-month"),
      "--no-anim",
      "--plan",
      "200",
    );
    expect(run.status, run.stderr).toBe(0);
    const expected = spec("## The receipt");
    const lines = run.stdout.split("\n");
    const start = lines.indexOf("=".repeat(48));
    expect(
      lines.slice(start, start + expected.split("\n").length).join("\n"),
    ).toBe(expected);
    expect(run.stdout).not.toContain("\x1b[");
    expect(run.stdout.replace(dir, "<dir>")).toMatchSnapshot();
  });

  it("prints the banner and scan lines from docs/CLI.md", () => {
    const flow = spec("## Flow").split("\n");
    const out = cli(
      "--fixtures",
      join(dir, "sample-month"),
      "--no-anim",
    ).stdout.split("\n");
    // The banner shows the current version; the doc's example may lag behind a release.
    flow[1] = (flow[1] ?? "").replace(/\d+\.\d+\.\d+/, VERSION);
    for (const i of [1, 2, 5, 6, 7])
      expect(out, flow[i]).toContain(
        (flow[i] ?? "").replace(/\s+\(only when.*$/, ""),
      );
    expect(out).toContain("    this receipt covers what survived.");
  });

  it("never writes state when reading fixtures", () => {
    cli("--fixtures", join(dir, "sample-month"), "--no-anim");
    expect(existsSync(join(dir, "home", ".token-damage"))).toBe(false);
  });
});

describe("--json", () => {
  it("validates against schema/receipt.schema.json", () => {
    const run = cli(
      "--fixtures",
      join(dir, "sample-month"),
      "--json",
      "--plan",
      "200",
    );
    expect(run.status, run.stderr).toBe(0);
    const schema = JSON.parse(
      readFileSync(join(ROOT, "schema/receipt.schema.json"), "utf8"),
    );
    const receipt = JSON.parse(run.stdout);
    expect(validate(receipt, schema)).toEqual([]);
    expect(receipt.priced.listPrice).toMatchObject({ tier: "priced" });
    expect(receipt.note.text).toMatch(/^For every word you typed/);
  });

  it("the validator rejects a receipt that breaks the tier rules", () => {
    const schema = JSON.parse(
      readFileSync(join(ROOT, "schema/receipt.schema.json"), "utf8"),
    );
    const receipt = JSON.parse(
      cli("--fixtures", join(dir, "sample-month"), "--json").stdout,
    );
    receipt.estimated.electricityKwh = { value: 63, tier: "estimated" };
    receipt.satire.ramX.tier = "measured";
    expect(validate(receipt, schema).length).toBeGreaterThanOrEqual(2);
  });
});

describe("exit codes", () => {
  it("exits 2 and says where it looked when there are no transcripts", async () => {
    await mkdir(join(dir, "empty", "projects"), { recursive: true });
    const run = cli("--fixtures", join(dir, "empty"), "--no-anim");
    expect(run.status).toBe(2);
    expect(run.stdout).toContain("no claude code transcripts found");
    expect(run.stdout).toContain("CLAUDE_CODE_SKIP_PROMPT_HISTORY");
  });

  it("exits 1 on a bad flag", () => {
    expect(cli("--plan", "free").status).toBe(1);
  });
});

describe("arguments", () => {
  it("parses guesses the way people type them", () => {
    expect(
      ["20M", "20000000", "2e7", "20,000,000", "1.2B", "500k", "nope", "0"].map(
        parseGuess,
      ),
    ).toEqual([2e7, 2e7, 2e7, 2e7, 1.2e9, 5e5, undefined, undefined]);
  });

  it("accepts the -- that pnpm passes through", () => {
    expect(
      parseOptions(["--", "--no-anim", "--since", "2026-09-01"]),
    ).toMatchObject({ anim: false, since: { date: "2026-09-01" } });
  });
});
