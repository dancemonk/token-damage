import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeSampleMonth } from "../../core/scripts/sample-month.js";

const CLI = fileURLToPath(new URL("../dist/index.js", import.meta.url));
let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "td-live-"));
  await mkdir(join(dir, "home"));
  await writeSampleMonth(join(dir, "sample"));
}, 60_000);
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

const run = (args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      TZ: "UTC",
      NO_COLOR: "1",
      HOME: join(dir, "home"),
      ...env,
    },
  });

describe("token-damage live", () => {
  it("refuses to draw without a terminal", () => {
    const r = run(["live", "--fixtures", join(dir, "sample")]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("live needs a terminal; pipe `--json` instead.");
  });

  it("--once matches the receipt for the same day, and writes nothing to disk", () => {
    const clock = "2026-09-11T23:59:00Z";
    const live = run([
      "live",
      "--once",
      "--fixtures",
      join(dir, "sample"),
      "--clock",
      clock,
    ]);
    expect(live.status).toBe(0);
    const snap = JSON.parse(live.stdout);
    const receipt = run(
      ["--fixtures", join(dir, "sample"), "--json", "--since", "2026-09-11"],
      { TOKEN_DAMAGE_NOW: clock },
    );
    expect(receipt.status).toBe(0);
    const measured = JSON.parse(receipt.stdout).measured;
    expect(snap.total).toBeGreaterThan(0);
    expect(snap.read).toBe(measured.tokensRead.value);
    expect(snap.written).toBe(measured.tokensWritten.value);
    expect(snap.words).toBe(measured.words.value);
    // Spec test 4 (F6): the temp corpus dir never leaks into --once's output.
    expect(live.stdout).not.toContain(dir);
    expect(existsSync(join(dir, "home", ".token-damage", "today.json"))).toBe(
      false,
    );
  });

  it("exits 1 with a path-free message when the corpus can't be read (F5)", async () => {
    // `<config-dir>/projects` is a file, not a directory: findTranscripts's realpath() succeeds on it,
    // but readdir() then throws ENOTDIR — a non-ENOENT read failure, before the alt screen ever opens.
    const cfgDir = join(dir, "unreadable-cfg");
    await mkdir(cfgDir, { recursive: true });
    const projectsPath = join(cfgDir, "projects");
    await writeFile(projectsPath, "");
    const r = run(["live", "--once", "--config-dir", cfgDir]);
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain(dir);
    expect(r.stderr).not.toContain(dir);
    expect(r.stdout).not.toContain(projectsPath);
    expect(r.stderr).not.toContain(projectsPath);
    expect(r.stderr).toBe(
      "token-damage live: could not read the agent logs (ENOTDIR)\n",
    );
  });

  it("prints help", () => {
    const r = run(["live", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("today's damage as it happens");
  });
});
