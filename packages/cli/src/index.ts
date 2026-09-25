#!/usr/bin/env node
import { setTimeout as sleep } from "node:timers/promises";
import {
  command,
  LIVE_USAGE,
  parseLiveOptions,
  parseOptions,
  USAGE,
} from "./args.js";
import { runLive } from "./live.js";
import { run } from "./run.js";
import { runStatusline } from "./statusline.js";
import { VERSION } from "./version.js";

try {
  const { command: cmd, rest } = command(process.argv.slice(2));
  if (cmd === "live") {
    const options = parseLiveOptions(rest);
    if (options.help) {
      process.stdout.write(`${LIVE_USAGE}\n`);
      process.exit(0);
    }
    process.exitCode = await runLive(options);
  } else if (cmd === "statusline") {
    process.exitCode = await runStatusline(rest);
  } else {
    const options = parseOptions(rest);
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
  }
} catch (error) {
  process.stderr.write(
    `token-damage: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
