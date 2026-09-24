import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  aggregate,
  buildFacts,
  buildReceipt,
  createDeduper,
  emptyStats,
  observe,
  receiptSvg,
  scanClaude,
  type Receipt,
} from "@token-damage/core";
import { writeSampleMonth } from "../../core/scripts/sample-month.js";
import { receiptPng, writePng } from "../src/png.js";

let dir = "";
let receipt: Receipt;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "td-png-"));
  await writeSampleMonth(join(dir, "config"));
  const deduper = createDeduper();
  for await (const r of scanClaude([join(dir, "config")], {
    ...emptyStats(),
    files: 0,
    subagentFiles: 0,
  }))
    deduper.add(r);
  const usage = deduper.result();
  const agg = aggregate(
    { usage, prompts: deduper.prompts() },
    { timeZone: "UTC" },
  );
  const facts = buildFacts({
    aggregate: agg,
    usage,
    timeZone: "UTC",
    planUsd: 200,
  });
  const period = {
    start: "2026-08-25",
    end: "2026-09-23",
    days: 30,
    retentionDays: 30,
    retentionIsDefault: true,
  };
  receipt = buildReceipt({
    trans: "0041",
    period,
    aggregate: agg,
    facts,
    observations: observe(facts),
    planUsd: 200,
  });
}, 60_000);
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe("PNG export", () => {
  it("writes a 1080×1920 PNG", async () => {
    const path = join(dir, "out", "receipt-2026-09-23.png");
    await writePng(receipt, path);
    const png = readFileSync(path);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1920]);
    expect(png.equals(receiptPng(receipt))).toBe(true);
  });

  it("follows the mockup: dark canvas, paper strip, red stamp", () => {
    const image = new Resvg(receiptSvg(receipt), {
      font: {
        fontFiles: [
          "IBMPlexMono-Regular",
          "IBMPlexMono-Bold",
          "IBMPlexMono-Italic",
          "SpecialElite-Regular",
        ].map(
          (f) => new URL(`../assets/fonts/${f}.ttf`, import.meta.url).pathname,
        ),
        loadSystemFonts: false,
      },
    }).render();
    const at = (x: number, y: number) => [
      ...image.pixels.subarray((y * 1080 + x) * 4, (y * 1080 + x) * 4 + 3),
    ];
    expect(at(10, 10)).toEqual(rgb("#161514"));
    expect(at(1070, 1910)).toEqual(rgb("#161514"));
    expect(at(150, 960)).toEqual(rgb("#f3efe6"));
    // Some pixel in the stamp band is the stamp red.
    const red = rgb("#b3261e");
    const band = Array.from({ length: 400 }, (_, i) => at(340 + i, 1180));
    expect(
      band.some((p) => p.every((c, k) => Math.abs(c - (red[k] ?? 0)) < 40)),
    ).toBe(true);
  });
});
