import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  emptyStats,
  parseLines,
  readLines,
  subagentOf,
  type UsageEvent,
} from "../../src/index.js";

export const FIXTURES = fileURLToPath(
  new URL("../../fixtures/claude/", import.meta.url),
);

export async function parseFixture(rel: string): Promise<UsageEvent[]> {
  const path = join(FIXTURES, rel);
  const events: UsageEvent[] = [];
  for await (const event of parseLines(
    readLines(path),
    emptyStats(),
    subagentOf(path),
  ))
    events.push(event);
  return events;
}

/** Every event in every fixture file, in file order. */
export async function corpusEvents(): Promise<UsageEvent[]> {
  const files = readdirSync(FIXTURES, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".jsonl"))
    .sort();
  return (await Promise.all(files.map(parseFixture))).flat();
}
