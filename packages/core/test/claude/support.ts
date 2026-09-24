import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  emptyStats,
  parseLines,
  readLines,
  subagentOf,
  type PromptEvent,
  type UsageEvent,
} from "../../src/index.js";

export const FIXTURES = fileURLToPath(
  new URL("../../fixtures/claude/", import.meta.url),
);

async function records(rel: string): Promise<(UsageEvent | PromptEvent)[]> {
  const path = join(FIXTURES, rel);
  const out: (UsageEvent | PromptEvent)[] = [];
  for await (const record of parseLines(
    readLines(path),
    emptyStats(),
    subagentOf(path),
  ))
    out.push(record);
  return out;
}

const usage = (all: (UsageEvent | PromptEvent)[]) =>
  all.filter((r): r is UsageEvent => r.kind === "usage");
const prompts = (all: (UsageEvent | PromptEvent)[]) =>
  all.filter((r): r is PromptEvent => r.kind === "prompt");

async function corpus(): Promise<(UsageEvent | PromptEvent)[]> {
  const files = readdirSync(FIXTURES, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".jsonl"))
    .sort();
  return (await Promise.all(files.map(records))).flat();
}

/** Usage events of one fixture file, in file order. */
export const parseFixture = async (rel: string) => usage(await records(rel));
export const fixturePrompts = async (rel: string) =>
  prompts(await records(rel));
/** Every usage event / prompt in every fixture file. */
export const corpusEvents = async () => usage(await corpus());
export const corpusPrompts = async () => prompts(await corpus());
