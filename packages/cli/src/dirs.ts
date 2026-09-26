import { homedir } from "node:os";
import {
  claudeRoots,
  codexHomes,
  geminiDirs,
  opencodeDirs,
  type SourceDirs,
} from "@token-damage/core";
import type { DirFlags } from "./args.js";

export function resolveDirs(
  flags: Omit<DirFlags, "fixtures">,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): SourceDirs {
  return {
    "claude-code": flags.configDir ? [flags.configDir] : claudeRoots(env, home),
    codex: flags.codexHome ? [flags.codexHome] : codexHomes(env, home),
    gemini: flags.geminiDir ? [flags.geminiDir] : geminiDirs(env, home),
    opencode: flags.opencodeDir ? [flags.opencodeDir] : opencodeDirs(env, home),
  };
}
