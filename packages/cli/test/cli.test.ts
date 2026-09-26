import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeSampleMonth } from "../../core/scripts/sample-month.js";
import { parseGuess, parseOptions } from "../src/args.js";
import { VERSION } from "../src/version.js";
import { validate } from "./schema.js";
import { parentEnv } from "./env.js";

const CLI = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CODEX = join(ROOT, "packages/core/fixtures/codex");
const GEMINI = join(ROOT, "packages/core/fixtures/gemini");
const OPENCODE = join(ROOT, "packages/core/fixtures/opencode");
const NEWEST_ROLLOUT =
  "sessions/2026/09/22/rollout-2026-09-22T10-00-00-01a0c5f0-0000-7000-8000-000000000001.jsonl";
let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "td-cli-"));
  await mkdir(join(dir, "home"));
  await writeSampleMonth(join(dir, "sample-month"));
  // Claude Code, Codex, Gemini CLI and OpenCode in one corpus.
  await cp(join(dir, "sample-month"), join(dir, "all"), { recursive: true });
  await cp(CODEX, join(dir, "all"), { recursive: true });
  await cp(GEMINI, join(dir, "all"), { recursive: true });
  await cp(OPENCODE, join(dir, "all"), { recursive: true });
  // One Codex rollout from a version newer than our fixtures.
  const rollout = await readFile(join(CODEX, NEWEST_ROLLOUT), "utf8");
  await mkdir(join(dir, "newer", NEWEST_ROLLOUT, ".."), { recursive: true });
  await writeFile(
    join(dir, "newer", NEWEST_ROLLOUT),
    rollout.replace('"cli_version":"0.155.1"', '"cli_version":"0.999.0"'),
  );
}, 60_000);
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

// A pinned "today", UTC, no colour, and a throwaway HOME so nothing touches the real ~/.token-damage.
function cli(...args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: {
      ...parentEnv(),
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
    expect(run.stdout.replaceAll(dir, "<dir>")).toMatchSnapshot();
  });

  it("colours piped output when FORCE_COLOR asks for it", () => {
    const env: NodeJS.ProcessEnv = {
      ...parentEnv(),
      TZ: "UTC",
      HOME: join(dir, "home"),
      TOKEN_DAMAGE_NOW: "2026-09-23T12:00:00Z",
      FORCE_COLOR: "1",
    };
    delete env.NO_COLOR;
    const run = spawnSync(
      process.execPath,
      [CLI, "--fixtures", join(dir, "sample-month"), "--no-anim"],
      { encoding: "utf8", env },
    );
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain("\x1b[");
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
    // The fixture corpus stands in for both ~/.claude and ~/.codex.
    const corpus = join(dir, "sample-month");
    flow[4] = (flow[4] ?? "").replace("~/.claude", corpus);
    flow[5] = (flow[5] ?? "").replaceAll("~/.codex", corpus);
    flow[6] = (flow[6] ?? "").replace("~/.gemini", corpus);
    flow[7] = (flow[7] ?? "").replace("~/.local/share", corpus);
    // The doc lists Antigravity's five default roots; the corpus holds one.
    flow[8] = `scanning ${join(corpus, "antigravity")} …`;
    flow[9] = (flow[9] ?? "").replace("~/.grok", join(corpus, "grok"));
    for (const i of [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12])
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

describe("codex, gemini cli and opencode", () => {
  const receipt = (fixtures: string) => {
    const run = cli("--fixtures", fixtures, "--json", "--since", "2025-09-01");
    expect(run.status, run.stderr).toBe(0);
    return JSON.parse(run.stdout).measured;
  };
  const tokens = (m: { byType: Record<string, { value: number }> }) =>
    Object.values(m.byType).reduce((s, v) => s + v.value, 0);

  it("reads a Codex home", async () => {
    const { totals } = JSON.parse(
      await readFile(join(CODEX, "expected.json"), "utf8"),
    ) as { totals: { tokens: Record<string, number> } };
    expect(tokens(receipt(CODEX))).toBe(
      Object.values(totals.tokens).reduce((s, v) => s + v, 0),
    );
  });

  it("reads a Gemini CLI home", () => {
    expect(tokens(receipt(GEMINI))).toBe(555_226);
  });

  it("reads an OpenCode data dir", () => {
    expect(tokens(receipt(OPENCODE))).toBe(9_054_733);
  });

  it("adds Claude Code, Codex, Gemini CLI and OpenCode up in one receipt", () => {
    const parts = [join(dir, "sample-month"), CODEX, GEMINI, OPENCODE].map(
      receipt,
    );
    const all = receipt(join(dir, "all"));
    expect(tokens(all)).toBe(parts.reduce((s, m) => s + tokens(m), 0));
    for (const k of ["calls", "sessions", "prompts", "words"])
      expect(all[k].value, k).toBe(parts.reduce((s, m) => s + m[k].value, 0));
  });

  it("says when Codex is newer than our fixtures, and --strict exits 3", () => {
    const run = cli("--fixtures", join(dir, "newer"), "--no-anim");
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain(
      "  ! parser confidence: medium (codex 0.999 is newer than our fixtures).",
    );
    // No Claude Code logs here, so no word about Claude Code's retention.
    expect(run.stdout).not.toContain("claude code already deleted");
    expect(cli("--fixtures", join(dir, "newer"), "--strict").status).toBe(3);
  });
});

describe("exit codes", () => {
  it("exits 2 and says where it looked when there are no sessions", async () => {
    await mkdir(join(dir, "empty", "projects"), { recursive: true });
    const run = cli("--fixtures", join(dir, "empty"), "--no-anim");
    expect(run.status).toBe(2);
    expect(run.stdout).toContain(
      "no claude code, codex, gemini cli, opencode, antigravity or grok build sessions found",
    );
    expect(run.stdout).toContain(join(dir, "empty", "tmp"));
    expect(run.stdout).toContain(join(dir, "empty", "opencode"));
    expect(run.stdout).toContain(join(dir, "empty", "antigravity"));
    expect(run.stdout).toContain(join(dir, "empty", "archived_sessions"));
    expect(run.stdout).toContain("CLAUDE_CODE_SKIP_PROMPT_HISTORY");
  });

  it("prints help and version", () => {
    const help = cli("--help");
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("usage: npx token-damage [options]");
    expect(cli("-v").stdout.trim()).toBe(`token-damage ${VERSION}`);
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

  it("reads a fixture corpus as every agent's dir at once", () => {
    expect(parseOptions(["--fixtures", "f"])).toMatchObject({
      dirs: {
        "claude-code": "f",
        codex: "f",
        gemini: join("f", "tmp"),
        opencode: join("f", "opencode"),
      },
      fixtures: true,
    });
    expect(parseOptions(["--gemini-dir", "g"]).dirs.gemini).toBe("g");
    expect(parseOptions(["--codex-home", "c"]).dirs).toEqual({ codex: "c" });
  });

  it("accepts the -- that pnpm passes through", () => {
    expect(
      parseOptions(["--", "--no-anim", "--since", "2026-09-01"]),
    ).toMatchObject({ anim: false, since: { date: "2026-09-01" } });
  });
});
