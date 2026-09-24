import { readdir, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { SubagentRef } from "./parse.js";

export interface TranscriptFile {
  path: string;
  subagent?: SubagentRef;
}

/** Config roots to scan: CLAUDE_CONFIG_DIR (comma-separated) or both default locations. */
export function claudeRoots(
  env: Record<string, string | undefined>,
  home: string,
): string[] {
  const configured = (env.CLAUDE_CONFIG_DIR ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const roots =
    configured.length > 0
      ? configured
      : [join(home, ".config", "claude"), join(home, ".claude")];
  return [
    ...new Set(roots.map((p) => resolve(p.replace(/^~(?=$|[/\\])/, home)))),
  ];
}

/** `<parentSessionId>/subagents/agent-<id>.jsonl` → its parent session and agent id. */
export function subagentOf(path: string): SubagentRef | undefined {
  const dir = dirname(path);
  const agentId = /^agent-(.+)\.jsonl$/.exec(basename(path))?.[1];
  if (!agentId || basename(dir) !== "subagents") return undefined;
  return { parentSessionId: basename(dirname(dir)), agentId };
}

/** Every transcript under `<root>/projects`, flat and nested layouts, including subagents. */
export async function findTranscripts(
  roots: string[],
): Promise<TranscriptFile[]> {
  const scanned = new Set<string>();
  const found: TranscriptFile[] = [];
  for (const root of roots) {
    let projects: string;
    try {
      projects = await realpath(join(root, "projects"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    // The legacy root is often a symlink to the current one; read each directory once.
    if (scanned.has(projects)) continue;
    scanned.add(projects);
    for (const entry of await readdir(projects, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const path = join(entry.parentPath, entry.name);
      const subagent = subagentOf(path);
      found.push(subagent ? { path, subagent } : { path });
    }
  }
  return found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
