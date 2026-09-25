import { open, stat } from "node:fs/promises";

export interface TailState {
  offset: number;
  size: number;
}
export interface TailResult {
  lines: string[];
  state: TailState;
  rewritten: boolean;
}

const NEWLINE = 0x0a;

/**
 * Complete lines appended since `prev`. A partial last line stays in the file for the next call, so a
 * poll that lands mid-write never sees half a JSON object. Cutting at newline bytes never splits UTF-8.
 */
export async function readAppended(
  path: string,
  prev?: TailState,
): Promise<TailResult> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return { lines: [], state: { offset: 0, size: 0 }, rewritten: false };
  }
  const rewritten = prev !== undefined && size < prev.size;
  const start = rewritten || !prev ? 0 : prev.offset;
  if (size <= start)
    return { lines: [], state: { offset: start, size }, rewritten };
  const fh = await open(path, "r");
  try {
    const buf = Buffer.alloc(size - start);
    const { bytesRead } = await fh.read(buf, 0, buf.length, start);
    const cut = buf.lastIndexOf(NEWLINE, bytesRead - 1);
    if (cut === -1)
      return { lines: [], state: { offset: start, size }, rewritten };
    const lines = buf
      .toString("utf8", 0, cut)
      .split("\n")
      .filter((l) => l !== "");
    return { lines, state: { offset: start + cut + 1, size }, rewritten };
  } finally {
    await fh.close();
  }
}
