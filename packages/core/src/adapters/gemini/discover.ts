import { readdir, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

/** Gemini CLI data dirs to scan: GEMINI_DATA_DIR (comma-separated) or ~/.gemini/tmp. */
export function geminiDirs(
  env: Record<string, string | undefined>,
  home: string,
): string[] {
  const configured = (env.GEMINI_DATA_DIR ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const dirs =
    configured.length > 0 ? configured : [join(home, ".gemini", "tmp")];
  return [
    ...new Set(dirs.map((p) => resolve(p.replace(/^~(?=$|[/\\])/, home)))),
  ];
}

export interface ChatFile {
  path: string;
  /** Set for a subagent's chat, which Gemini CLI writes to `chats/<parent session id>/`. */
  parentSessionId?: string;
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
 * Every chat file under the data dirs: `<project>/chats/*.jsonl` (older versions: `*.json`), and subagents'
 * `<project>/chats/<parent session id>/*.jsonl`. Files outside a `chats` folder are never opened: `logs.json`
 * next to it holds the prompts and no usage (DATA-SOURCES §Gemini CLI).
 */
export async function findChats(dirs: string[]): Promise<ChatFile[]> {
  const scanned = new Set<string>();
  const found = new Map<string, ChatFile>();
  for (const dir of dirs) {
    const real = await realDir(dir);
    if (!real || scanned.has(real)) continue;
    scanned.add(real);
    for (const entry of await readdir(real, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile() || !/\.jsonl?$/.test(entry.name)) continue;
      const path = join(entry.parentPath, entry.name);
      const parts = path.split(sep);
      const chats = parts.lastIndexOf("chats");
      if (chats === -1) continue;
      const parent = chats < parts.length - 2 ? parts[chats + 1] : undefined;
      found.set(path, parent ? { path, parentSessionId: parent } : { path });
    }
  }
  return [...found.values()].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
}
