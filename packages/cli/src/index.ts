#!/usr/bin/env node
import { setTimeout as sleep } from "node:timers/promises";
import { parseOptions, USAGE } from "./args.js";
import { run } from "./run.js";
import { VERSION } from "./version.js";

try {
  const options = parseOptions(process.argv.slice(2));
  if (options.help || options.version) {
    process.stdout.write(
      `${options.help ? USAGE : `token-damage ${VERSION}`}\n`,
    );
    process.exit(0);
  }
  const tty = Boolean(process.stdout.isTTY);
  process.exitCode = await run(
    { ...options, anim: options.anim && tty },
    {
      out: (line = "") => process.stdout.write(line + "\n"),
      color: tty && !process.env.NO_COLOR && process.env.TERM !== "dumb",
      interactive: tty && Boolean(process.stdin.isTTY) && !options.json,
      sleep: (ms) => sleep(ms),
    },
  );
} catch (error) {
  process.stderr.write(
    `token-damage: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
