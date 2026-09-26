import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

/** Grok Build's home: GROK_HOME when it holds a path (as ccusage), else ~/.grok. */
export function grokRoots(
  env: Record<string, string | undefined>,
  home: string,
): string[] {
  const configured = env.GROK_HOME?.trim();
  return configured
    ? [resolve(configured.replace(/^~(?=$|[/\\])/, home))]
    : [join(home, ".grok")];
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) await walk(path, out);
    else if (e.name === "updates.jsonl") out.push(path);
  }
}

/** Every session's `updates.jsonl` under `<home>/sessions`, sorted. */
export async function findUpdates(roots: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const root of roots) await walk(join(root, "sessions"), out);
  return out.sort();
}
