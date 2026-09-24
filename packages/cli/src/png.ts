import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { receiptSvg, type Receipt } from "@token-damage/core";

// Bundled so every machine renders the same card; system fonts are never consulted.
const FONTS = [
  "IBMPlexMono-Regular.ttf",
  "IBMPlexMono-Bold.ttf",
  "IBMPlexMono-Italic.ttf",
  "SpecialElite-Regular.ttf",
].map((file) =>
  fileURLToPath(new URL(`../assets/fonts/${file}`, import.meta.url)),
);

/** The share card as PNG, 1080×1920. */
export function receiptPng(receipt: Receipt): Buffer {
  const resvg = new Resvg(receiptSvg(receipt), {
    font: {
      fontFiles: FONTS,
      loadSystemFonts: false,
      defaultFontFamily: "IBM Plex Mono",
    },
    fitTo: { mode: "original" },
  });
  return resvg.render().asPng();
}

export async function writePng(receipt: Receipt, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, receiptPng(receipt));
}
