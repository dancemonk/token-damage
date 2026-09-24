import { describe, expect, it } from "vitest";
import { compare, TOLERANCE } from "./oracle.mjs";

const day = (input, cacheWrite, cacheRead, output) => ({
  input,
  cacheWrite,
  cacheRead,
  output,
});

describe("oracle compare", () => {
  it("passes identical days", () => {
    const rows = compare(
      new Map([["2026-09-01", day(1, 2, 3, 4)]]),
      new Map([["2026-09-01", day(1, 2, 3, 4)]]),
    );
    expect(rows).toMatchObject([
      { day: "2026-09-01", over: false, worst: { off: 0 } },
    ]);
  });

  it("fails a field more than 1% off even when the day total is close", () => {
    // Output 2% low hides inside a total dominated by cache reads.
    const rows = compare(
      new Map([["d", day(0, 0, 1_000_000, 98)]]),
      new Map([["d", day(0, 0, 1_000_000, 100)]]),
    );
    expect(rows[0]).toMatchObject({ over: true, worst: { field: "output" } });
  });

  it("allows up to 1%", () => {
    const rows = compare(
      new Map([["d", day(0, 0, 0, 1000 + 1000 * TOLERANCE)]]),
      new Map([["d", day(0, 0, 0, 1000)]]),
    );
    expect(rows[0]?.over).toBe(false);
  });

  it("fails a day only one side has", () => {
    expect(compare(new Map([["d", day(0, 0, 0, 5)]]), new Map())[0]?.over).toBe(
      true,
    );
    expect(compare(new Map(), new Map([["d", day(0, 0, 0, 5)]]))[0]?.over).toBe(
      true,
    );
  });

  it("ignores days with no tokens on either side (prompt-only days)", () => {
    expect(compare(new Map([["d", day(0, 0, 0, 0)]]), new Map())).toEqual([]);
  });
});
