import { readdir, realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

/** Codex homes to scan: CODEX_HOME (comma-separated) or ~/.codex. */
export function codexHomes(
  env: Record<string, string | undefined>,
  home: string,
): string[] {
  const configured = (env.CODEX_HOME ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const homes = configured.length > 0 ? configured : [join(home, ".codex")];
  return [
    ...new Set(homes.map((p) => resolve(p.replace(/^~(?=$|[/\\])/, home)))),
  ];
}

async function realDir(path: string): Promise<string | undefined> {
  try {
    return await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * Every rollout under `<home>/sessions` and `<home>/archived_sessions`, active copies first.
 * A relative path found in both keeps only the `sessions/` copy (DATA-SOURCES §Codex).
 */
export async function findRollouts(homes: string[]): Promise<string[]> {
  const scanned = new Set<string>();
  const seen = new Set<string>();
  const found: string[] = [];
  for (const home of homes) {
    for (const name of ["sessions", "archived_sessions"]) {
      const dir = await realDir(join(home, name));
      if (!dir || scanned.has(dir)) continue;
      scanned.add(dir);
      const files: string[] = [];
      for (const entry of await readdir(dir, {
        recursive: true,
        withFileTypes: true,
      })) {
        if (entry.isFile() && entry.name.endsWith(".jsonl"))
          files.push(join(entry.parentPath, entry.name));
      }
      files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      for (const path of files) {
        const key = `${home}\u0000${relative(dir, path)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(path);
      }
    }
  }
  return found;
}
