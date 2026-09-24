import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Cooldown memory: which families and variants recent receipts used. Aggregates only, never text. */
export interface RoastState {
  version: 1;
  runs: number;
  families: Record<string, { lastRun: number; nextVariant: number }>;
  jokeCursor: number;
}

export const STATE_PATH = join(homedir(), ".token-damage", "state.json");

export const emptyState = (): RoastState => ({
  version: 1,
  runs: 0,
  families: {},
  jokeCursor: 0,
});

export async function loadState(path = STATE_PATH): Promise<RoastState> {
  try {
    const state = JSON.parse(await readFile(path, "utf8")) as RoastState;
    return state.version === 1 ? state : emptyState();
  } catch {
    return emptyState();
  }
}

export async function saveState(
  state: RoastState,
  path = STATE_PATH,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2) + "\n");
}
