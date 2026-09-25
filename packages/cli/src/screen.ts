export const ENTER = "\x1b[?1049h\x1b[?25l\x1b[H\x1b[2J";
export const LEAVE = "\x1b[?25h\x1b[?1049l";

/** Cursor moves and rows that turn the previous frame into the next one. */
export function frame(
  prev: readonly string[],
  next: readonly string[],
): string {
  let out = "";
  const rows = Math.max(prev.length, next.length);
  for (let i = 0; i < rows; i++) {
    const line = next[i] ?? "";
    if (prev[i] === line && i < next.length) continue;
    out += `\x1b[${i + 1};1H${line}\x1b[K`;
  }
  return out;
}
