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
    // Erase first: after a full-width row the cursor sits on the last column, and an erase sent after the
    // text would wipe that column's character (a price's last digit, the % of a leader).
    out += `\x1b[${i + 1};1H\x1b[2K${line}`;
  }
  return out;
}
