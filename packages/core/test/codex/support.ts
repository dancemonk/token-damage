import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  emptyCodexStats,
  readLines,
  scanCodex,
  type PromptEvent,
  type UsageEvent,
} from "../../src/index.js";
import {
  readRollout,
  type RolloutRecord,
} from "../../src/adapters/codex/parse.js";

/** A Codex home: `sessions/YYYY/MM/DD/` and `archived_sessions/`. */
export const CODEX_FIXTURES = fileURLToPath(
  new URL("../../fixtures/codex/", import.meta.url),
);

export const rollout = (day: string, name: string) =>
  join(CODEX_FIXTURES, "sessions", day, `rollout-${name}.jsonl`);

export const NORMAL = rollout(
  "2026/05/10",
  "2026-05-10T19-20-05-019e1430-d753-78a1-99b7-4e745cc2f417",
);
export const STREAMING = rollout(
  "2026/09/19",
  "2026-09-19T13-53-59-01a0bacd-b82b-7cb1-8dca-739c09d03936",
);
export const RESUMED = rollout(
  "2026/09/20",
  "2026-09-20T09-00-00-01a0bacd-b82b-7cb1-8dca-739c09d03936",
);
export const BACKWARDS = rollout(
  "2026/09/10",
  "2026-09-10T08-31-15-01a08b4d-02d1-77b2-be58-509f0e01b656",
);
export const NO_MODEL = rollout(
  "2025/09/06",
  "2025-09-06T10-00-00-0199200a-0000-7000-8000-000000000001",
);
export const FORK_PARENT = rollout(
  "2026/08/11",
  "2026-08-11T21-10-57-019ff385-c2c0-7bd2-a53d-73fa2dcdbd48",
);
export const FORK_CHILD = rollout(
  "2026/08/11",
  "2026-08-11T21-18-21-019ff38c-8a1e-7f72-9eb9-a1903b32bfdc",
);
export const BURST = rollout(
  "2026/07/27",
  "2026-07-27T11-17-26-019fa426-fb9f-7c73-b522-6d06d44d843e",
);
export const AUTO_REVIEW = rollout(
  "2026/07/10",
  "2026-07-10T09-14-22-019f4c2a-3591-7420-8e6b-20ca621cf67e",
);
export const WORDS = rollout(
  "2026/09/22",
  "2026-09-22T10-00-00-01a0c5f0-0000-7000-8000-000000000001",
);

/** Every record of one rollout, in file order, before replay filtering. */
export async function read(path: string, stats = emptyCodexStats()) {
  const out: RolloutRecord[] = [];
  for await (const r of readRollout(readLines(path), stats)) out.push(r);
  return out;
}

export const usageOf = (records: RolloutRecord[]) =>
  records.flatMap((r) => (r.kind === "usage" ? [r] : []));

/** The whole fixture home, scanned. Not deduped. */
export async function scanFixtures(stats = emptyCodexStats()) {
  const usage: UsageEvent[] = [];
  const prompts: PromptEvent[] = [];
  for await (const r of scanCodex([CODEX_FIXTURES], stats)) {
    if (r.kind === "usage") usage.push(r);
    else prompts.push(r);
  }
  return { usage, prompts, stats };
}
