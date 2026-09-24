import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { emptyStats, parseLines, readLines } from "../../src/index.js";

// `pnpm -F core test:big` runs this with 512 MB; the default keeps `pnpm check` fast.
const SIZE_MB = Number(process.env.TD_BIG_MB ?? 64);
const HEAP_BUDGET_MB = 48;

describe(`parser on a generated ${SIZE_MB} MB transcript`, () => {
  let dir = "";
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("streams it in constant memory", { timeout: 300_000 }, async () => {
    dir = await mkdtemp(join(tmpdir(), "td-big-"));
    const path = join(dir, "big.jsonl");
    const sample = await readFile(
      new URL("../../fixtures/claude/2.1.281/normal.jsonl", import.meta.url),
      "utf8",
    );
    const [user, attachment, assistant] = sample.trim().split("\n") as [
      string,
      string,
      string,
    ];

    const out = createWriteStream(path);
    let written = 0;
    let usageLines = 0;
    while (written < SIZE_MB * 1024 * 1024) {
      const reply = assistant.replace(
        "msg_011CfMFmrGDzU7jaXhbeAxw4",
        `msg_${usageLines}`,
      );
      const chunk = `${user}\n${attachment}\n${reply}\n`;
      usageLines++;
      written += chunk.length;
      if (!out.write(chunk)) await once(out, "drain");
    }
    out.end();
    await once(out, "finish");
    expect((await stat(path)).size).toBeGreaterThanOrEqual(
      SIZE_MB * 1024 * 1024,
    );

    const stats = emptyStats();
    const baseline = process.memoryUsage().heapUsed;
    let peak = baseline;
    let output = 0;
    for await (const event of parseLines(readLines(path), stats)) {
      output += event.output;
      if (stats.events % 5000 === 0)
        peak = Math.max(peak, process.memoryUsage().heapUsed);
    }

    expect(stats.events).toBe(usageLines);
    expect(output).toBe(usageLines * 161);
    expect((peak - baseline) / 1024 / 1024).toBeLessThan(HEAP_BUDGET_MB);
  });
});
