import { homedir } from "node:os";
import { ADAPTERS, type Source, type SourceDirs } from "@token-damage/core";

/** Each agent's roots: the path from its flag when given, else its environment variable or its defaults. */
export function resolveDirs(
  flags: { dirs: Partial<Record<Source, string>> },
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): SourceDirs {
  return Object.fromEntries(
    ADAPTERS.map((a) => {
      const path = flags.dirs[a.id];
      return [a.id, path ? [path] : a.roots(env, home)];
    }),
  ) as SourceDirs;
}
