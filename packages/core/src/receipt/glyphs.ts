// Bars and sparklines drawn in text, shared by the receipt and the live pane. Pure; zero dependencies.

const SPARKS = "▁▂▃▄▅▆▇█";

/**
 * A share as `width` glyphs: `■` filled, `·` empty, `▪` alone for a share too small for one square. Rounds down,
 * so only a whole share fills the bar and a "99%" never sits next to a full one.
 */
export function bar(fraction: number, width: number): string {
  const f = Math.min(1, Math.max(0, fraction));
  const filled = Math.floor(f * width);
  if (f > 0 && filled === 0) return "▪" + "·".repeat(width - 1);
  return "■".repeat(filled) + "·".repeat(width - filled);
}

/** One glyph per value, scaled to the maximum; `zero` replaces the lowest glyph for values of exactly 0. */
export function sparkline(
  values: readonly number[],
  opts: { zero?: string } = {},
): string {
  const max = Math.max(0, ...values);
  return values
    .map((v) =>
      v === 0 && opts.zero !== undefined
        ? opts.zero
        : SPARKS[max === 0 ? 0 : Math.min(7, Math.round((v / max) * 7))],
    )
    .join("");
}
