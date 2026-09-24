import { readdir, stat } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";

/**
 * OpenCode data dirs to scan: OPENCODE_DATA_DIR (comma-separated) when it is set at all, else
 * `$XDG_DATA_HOME/opencode` (only an absolute XDG_DATA_HOME), else `~/.local/share/opencode`.
 */
export function opencodeDirs(
  env: Record<string, string | undefined>,
  home: string,
): string[] {
  const configured = env.OPENCODE_DATA_DIR;
  if (configured !== undefined) {
    const dirs = configured
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => resolve(p.replace(/^~(?=$|[/\\])/, home)));
    return [...new Set(dirs)];
  }
  const xdg = env.XDG_DATA_HOME;
  const dataHome = xdg && isAbsolute(xdg) ? xdg : join(home, ".local", "share");
  return [join(dataHome, "opencode")];
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

// A release channel's database: `opencode-<channel>.db`.
const CHANNEL_DB = /^opencode-[A-Za-z0-9_-]*\.db$/;

/**
 * The one database ccusage reads in a data dir: `opencode.db`, else the first `opencode-<channel>.db` by name.
 * Its `-wal` file is read with it: SQLite applies it on open.
 */
export async function findDatabase(dir: string): Promise<string | undefined> {
  const main = join(dir, "opencode.db");
  if (await isFile(main)) return main;
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return undefined;
  }
  for (const name of names.filter((n) => CHANNEL_DB.test(n)).sort()) {
    const path = join(dir, name);
    if (await isFile(path)) return path;
  }
  return undefined;
}

/** Legacy message files, `storage/message/<session id>/<message id>.json`, sorted. Symlinks are not followed. */
export async function legacyMessageFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(join(dir, "storage", "message"), {
      recursive: true,
      withFileTypes: true,
    });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => join(e.parentPath, e.name))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** A legacy file's name without `.json`: the message id, when OpenCode wrote it. */
export const fileStem = (path: string): string => basename(path, ".json");
