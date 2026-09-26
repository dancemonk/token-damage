import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parentEnv } from "./env.js";

const CLI = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const CLOCK = "2026-09-24T12:00:00Z";
let dir = "";

const line = (o: object) => JSON.stringify(o);
const transcript =
  [
    line({
      type: "user",
      uuid: "u1",
      sessionId: "s1",
      timestamp: "2026-09-24T11:57:00.000Z",
      message: { role: "user", content: "fix the login bug" },
    }),
    line({
      type: "assistant",
      uuid: "u2",
      sessionId: "s1",
      requestId: "r1",
      timestamp: "2026-09-24T11:58:00.000Z",
      message: {
        id: "m1",
        model: "claude-opus-4-7",
        usage: { input_tokens: 6_800_000, output_tokens: 1200 },
      },
    }),
  ].join("\n") + "\n";
const stdin = line({
  session_id: "s1",
  transcript_path: "/Users/someone/.claude/projects/p/s1.jsonl",
  context_window: { used_percentage: 41 },
  rate_limits: {
    five_hour: {
      used_percentage: 58,
      resets_at: Date.UTC(2026, 8, 24, 16) / 1000,
    },
  },
});

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "td-status-"));
  await mkdir(join(dir, "corpus", "projects", "p"), { recursive: true });
  await writeFile(join(dir, "corpus", "projects", "p", "s1.jsonl"), transcript);
  for (const d of ["home", "empty", "claude-home"]) await mkdir(join(dir, d));
});
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

// Every agent directory is pinned to the temp dir so a developer's real logs never leak into the test.
function status(
  args: string[],
  input: string,
  env: Record<string, string> = {},
) {
  return spawnSync(process.execPath, [CLI, "statusline", ...args], {
    input,
    encoding: "utf8",
    env: {
      ...parentEnv(),
      TZ: "UTC",
      NO_COLOR: "1",
      HOME: join(dir, "home"),
      CLAUDE_CONFIG_DIR: join(dir, "corpus"),
      CODEX_HOME: join(dir, "empty"),
      GEMINI_DATA_DIR: join(dir, "empty"),
      OPENCODE_DATA_DIR: join(dir, "empty"),
      ...env,
    },
  });
}

describe("token-damage statusline", () => {
  it("prints this session and today", () => {
    const r = status(["--clock", CLOCK], stdin);
    expect(r.status).toBe(0);
    const [one, two] = r.stdout.trimEnd().split("\n");
    expect(one).toMatch(/^▸ 4 words → 6\.8M read ≡ \$[\d,.]+ · ctx 41%$/);
    expect(two).toMatch(
      /^FENDER BENDER · today 6\.8M ≡ \$[\d,.]+ · 5h 58% resets 16:00$/,
    );
  });

  it("caches numbers and hashes only, and answers fast when warm", () => {
    status(["--clock", CLOCK], stdin);
    const cache = readFileSync(
      join(dir, "home", ".token-damage", "today.json"),
      "utf8",
    );
    expect(cache).not.toContain(dir);
    expect(cache).not.toContain("login");
    expect(cache).not.toContain("/Users/");
    const t = performance.now();
    const r = status(["--clock", CLOCK], stdin);
    expect(r.status).toBe(0);
    expect(performance.now() - t).toBeLessThan(500);
  });

  it.each(["", "{", "[]", "null"])("survives stdin %j", (input) => {
    const r = status(["--clock", CLOCK], input);
    expect(r.status).toBe(0);
    expect(r.stdout.split("\n")[0]).toMatch(/^▸ nothing yet in this session$/);
  });

  it("falls back to savedAt for staleness when the cache has no reconciledAt (F1)", () => {
    const home = join(dir, "home-f1");
    const first = status(["--clock", CLOCK], stdin, { HOME: home });
    expect(first.status).toBe(0);
    const cachePath = join(home, ".token-damage", "today.json");
    const cache = JSON.parse(readFileSync(cachePath, "utf8"));
    expect(cache.reconciledAt).toBeDefined();
    delete cache.reconciledAt;
    writeFileSync(cachePath, JSON.stringify(cache));

    const second = status(["--clock", CLOCK], stdin, { HOME: home });
    expect(second.status).toBe(0);
    const after = JSON.parse(readFileSync(cachePath, "utf8"));
    // A reconcile would have set reconciledAt to `at`; its absence proves the warm (poll) path ran.
    expect(after.reconciledAt).toBeUndefined();
  });

  it("uses the cache's own clock for `prev`, so a stale-looking turn can still speak (F2)", async () => {
    const home = join(dir, "home-f2");
    const corpus = join(dir, "corpus-f2");
    const projectDir = join(corpus, "projects", "p2");
    await mkdir(projectDir, { recursive: true });
    const transcriptPath = join(projectDir, "s2.jsonl");
    await writeFile(
      transcriptPath,
      [
        line({
          type: "user",
          uuid: "v1",
          sessionId: "s2",
          timestamp: "2026-09-24T11:50:00.000Z",
          message: { role: "user", content: "fix the login bug" },
        }),
        line({
          type: "assistant",
          uuid: "v2",
          sessionId: "s2",
          requestId: "r2",
          timestamp: "2026-09-24T11:51:00.000Z",
          message: {
            id: "m2",
            model: "claude-opus-4-7",
            usage: { input_tokens: 100, output_tokens: 20 },
          },
        }),
      ].join("\n") + "\n",
    );
    const env = {
      HOME: home,
      CLAUDE_CONFIG_DIR: corpus,
    };
    const stdin2 = line({
      session_id: "s2",
      transcript_path: "/Users/someone/.claude/projects/p2/s2.jsonl",
    });

    // Warm the cache: no trigger should fire yet (read is far under the library threshold).
    const first = status(["--clock", "2026-09-24T11:52:00Z"], stdin2, env);
    expect(first.status).toBe(0);

    // A new call lands in the same open turn, pushing read past the library threshold.
    await appendFile(
      transcriptPath,
      line({
        type: "assistant",
        uuid: "v3",
        sessionId: "s2",
        requestId: "r3",
        timestamp: "2026-09-24T11:54:00.000Z",
        message: {
          id: "m3",
          model: "claude-opus-4-7",
          usage: { input_tokens: 6_000_000, output_tokens: 20 },
        },
      }) + "\n",
    );
    const second = status(
      ["--clock", "2026-09-24T11:55:00Z", "--rows", "3"],
      stdin2,
      env,
    );
    expect(second.status).toBe(0);
    const rows = second.stdout.trimEnd().split("\n");
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatch(/^✶ /);
  });

  it("prints the fallback row on a bad flag and still exits 0", () => {
    const r = status(["--rows", "9"], stdin);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("token damage · (reading)\n");
  });
});

describe("token-damage statusline --install", () => {
  const settings = () => join(dir, "claude-home", "settings.json");
  // Ruling 2: `npx vitest` sets npm_command=exec in the environment, which the child CLI inherits, so
  // the "writes after yes" install test would hit the npx refusal. Default it away here; only the
  // explicit npx test below passes npm_command: "exec" to exercise the refusal.
  const install = (answer: string, env: Record<string, string> = {}) =>
    status(["--install"], answer, {
      CLAUDE_CONFIG_DIR: join(dir, "claude-home"),
      PATH: "/usr/bin:/bin",
      npm_command: "",
      ...env,
    });

  it("shows the change and writes it after yes, keeping other settings and a backup", async () => {
    await writeFile(settings(), line({ theme: "dark" }));
    const r = install("y\n");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('"statusLine"');
    const written = JSON.parse(readFileSync(settings(), "utf8"));
    expect(written.theme).toBe("dark");
    expect(written.statusLine).toMatchObject({
      type: "command",
      refreshInterval: 10,
    });
    // Not on PATH here, so the command is the absolute node + script path.
    expect(written.statusLine.command).toContain(realpathSync(CLI));
    expect(written.statusLine.command).toMatch(/ statusline$/);
    expect(existsSync(`${settings()}.token-damage.bak`)).toBe(true);
    expect(install("y\n").stdout).toContain("already set up");
  });

  it("leaves settings alone on no, on invalid JSON, and under npx", async () => {
    await writeFile(settings(), line({ theme: "light" }));
    install("n\n");
    expect(JSON.parse(readFileSync(settings(), "utf8"))).toEqual({
      theme: "light",
    });
    await writeFile(settings(), "{ not json");
    const bad = install("y\n");
    expect(bad.status).toBe(1);
    expect(readFileSync(settings(), "utf8")).toBe("{ not json");
    await writeFile(settings(), line({}));
    const npx = install("y\n", { npm_command: "exec" });
    expect(npx.status).toBe(1);
    expect(npx.stdout + npx.stderr).toContain("npm i -g token-damage");
    expect(JSON.parse(readFileSync(settings(), "utf8"))).toEqual({});
  });

  it("shows an existing different status line before replacing it, and backs it up", async () => {
    const cfgDir = join(dir, "claude-home-existing-yes");
    await mkdir(cfgDir, { recursive: true });
    const settingsPath = join(cfgDir, "settings.json");
    const old = { type: "command", command: "bash other.sh" };
    await writeFile(settingsPath, line({ theme: "dark", statusLine: old }));
    const r = install("y\n", { CLAUDE_CONFIG_DIR: cfgDir });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(
      '- "statusLine": {"type":"command","command":"bash other.sh"}',
    );
    expect(r.stdout).toContain('+ "statusLine":');
    const written = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(written.theme).toBe("dark");
    expect(written.statusLine).toMatchObject({
      type: "command",
      refreshInterval: 10,
    });
    expect(written.statusLine.command).not.toBe("bash other.sh");
    const backup = readFileSync(`${settingsPath}.token-damage.bak`, "utf8");
    expect(backup).toContain("bash other.sh");
  });

  it("leaves an existing different status line alone on no", async () => {
    const cfgDir = join(dir, "claude-home-existing-no");
    await mkdir(cfgDir, { recursive: true });
    const settingsPath = join(cfgDir, "settings.json");
    const old = { type: "command", command: "bash other.sh" };
    await writeFile(settingsPath, line({ theme: "dark", statusLine: old }));
    const r = install("n\n", { CLAUDE_CONFIG_DIR: cfgDir });
    expect(r.status).toBe(0);
    expect(JSON.parse(readFileSync(settingsPath, "utf8"))).toEqual({
      theme: "dark",
      statusLine: old,
    });
    expect(existsSync(`${settingsPath}.token-damage.bak`)).toBe(false);
  });

  it("creates the config directory and settings.json on a first install", () => {
    const cfgDir = join(dir, "claude-home-fresh", "nested");
    expect(existsSync(cfgDir)).toBe(false);
    const r = install("y\n", { CLAUDE_CONFIG_DIR: cfgDir });
    expect(r.status).toBe(0);
    const settingsPath = join(cfgDir, "settings.json");
    expect(existsSync(cfgDir)).toBe(true);
    expect(existsSync(settingsPath)).toBe(true);
    const written = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(written.statusLine).toMatchObject({
      type: "command",
      refreshInterval: 10,
    });
    // Nothing existed to back up.
    expect(existsSync(`${settingsPath}.token-damage.bak`)).toBe(false);
  });
});
