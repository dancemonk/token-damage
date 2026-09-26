import { readdir, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const DEFAULTS = [
  [".gemini", "antigravity"],
  [".gemini", "antigravity-cli"],
  [".gemini", "antigravity-ide"],
  [".gemini", "antigravity-backup"],
  [".config", "antigravity"],
];

/** Antigravity data dirs: ANTIGRAVITY_DATA_DIR (comma-separated) when it is set at all, else the five defaults. */
export function antigravityRoots(
  env: Record<string, string | undefined>,
  home: string,
): string[] {
  const configured = env.ANTIGRAVITY_DATA_DIR;
  if (configured !== undefined)
    return [
      ...new Set(
        configured
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p) => resolve(p.replace(/^~(?=$|[/\\])/, home))),
      ),
    ];
  return DEFAULTS.map((parts) => join(home, ...parts));
}

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
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
    else if (e.name.endsWith(".db")) out.push(path);
  }
}

/** Every `*.db` under each root's `conversations/` (else the root), one path per real file, sorted. */
export async function findDatabases(roots: string[]): Promise<string[]> {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    const nested = join(root, "conversations");
    const files: string[] = [];
    await walk((await isDir(nested)) ? nested : root, files);
    for (const path of files) {
      const real = await realpath(path).catch(() => path);
      if (seen.has(real)) continue;
      seen.add(real);
      found.push(path);
    }
  }
  return found.sort();
}
