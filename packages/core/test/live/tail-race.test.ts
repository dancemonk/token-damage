import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TailResult, TailState } from "../../src/live/tail.js";

// Hoisted mocks - will be available to vi.mock factory
const { mockOpen, mockStat } = vi.hoisted(() => ({
  mockOpen: vi.fn(),
  mockStat: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: mockOpen,
    stat: mockStat,
  };
});

let dir = "";
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "td-tail-race-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

// Re-import inside describe to get mocked version
let readAppended: (path: string, prev?: TailState) => Promise<TailResult>;

describe("readAppended race conditions", () => {
  beforeAll(async () => {
    ({ readAppended } = await import("../../src/live/tail.js"));
  });

  it("treats a transcript that vanishes before open as missing", async () => {
    mockStat.mockResolvedValueOnce({ size: 16 });
    mockOpen.mockRejectedValueOnce(
      Object.assign(new Error("no such file"), { code: "ENOENT" }),
    );

    const result = await readAppended(join(dir, "vanish.jsonl"));
    expect(result).toEqual({
      lines: [],
      state: { offset: 0, size: 0 },
      rewritten: false,
    });
  });

  it("rethrows permission errors from open", async () => {
    mockStat.mockResolvedValueOnce({ size: 9 });
    mockOpen.mockRejectedValueOnce(
      Object.assign(new Error("permission denied"), { code: "EACCES" }),
    );

    await expect(readAppended(join(dir, "forbidden.jsonl"))).rejects.toThrow();
  });
});
