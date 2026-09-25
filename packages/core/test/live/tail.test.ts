import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readAppended } from "../../src/live/tail.js";

let dir = "";
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "td-tail-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("readAppended", () => {
  it("returns complete lines and keeps a half-written last line for later", async () => {
    const path = join(dir, "a.jsonl");
    await writeFile(path, '{"a":1}\n{"b":2}\n{"c":');
    const first = await readAppended(path);
    expect(first.lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(first.rewritten).toBe(false);
    expect(first.state.offset).toBe(16);
    await appendFile(path, '3}\n{"d":4}\n');
    const second = await readAppended(path, first.state);
    expect(second.lines).toEqual(['{"c":3}', '{"d":4}']);
    const third = await readAppended(path, second.state);
    expect(third.lines).toEqual([]);
  });

  it("never splits a multi-byte character", async () => {
    const path = join(dir, "b.jsonl");
    await writeFile(path, '{"t":"héllo wörld"}\n{"t":"日本');
    const first = await readAppended(path);
    expect(first.lines).toEqual(['{"t":"héllo wörld"}']);
    await appendFile(path, '語"}\n');
    const second = await readAppended(path, first.state);
    expect(second.lines).toEqual(['{"t":"日本語"}']);
  });

  it("re-reads from the start when the file shrank", async () => {
    const path = join(dir, "c.jsonl");
    await writeFile(path, "one\ntwo\nthree\n");
    const first = await readAppended(path);
    await writeFile(path, "uno\n");
    const again = await readAppended(path, first.state);
    expect(again).toMatchObject({ lines: ["uno"], rewritten: true });
    expect(again.state.offset).toBe(4);
  });

  it("treats a missing file as empty", async () => {
    const r = await readAppended(join(dir, "nope.jsonl"), {
      offset: 10,
      size: 10,
    });
    expect(r).toEqual({
      lines: [],
      state: { offset: 0, size: 0 },
      rewritten: false,
    });
  });
});
