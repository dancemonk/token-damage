import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  localDay,
  midnightOf,
  nextMidnight,
} from "../../src/live/day.js";

const LA = "America/Los_Angeles";

describe("day math", () => {
  it("names the local day", () => {
    // 2026-03-08 06:30 UTC is still March 7 in Los Angeles (UTC-8 before the DST switch).
    expect(localDay(Date.UTC(2026, 2, 8, 6, 30), LA)).toBe("2026-03-07");
    expect(localDay(Date.UTC(2026, 2, 8, 8, 30), LA)).toBe("2026-03-08");
  });

  it("finds midnight across a DST switch", () => {
    // March 8, 2026 is the spring-forward day in Los Angeles: the day is 23 hours long.
    const noon = Date.UTC(2026, 2, 8, 19, 0); // 12:00 PDT
    const start = midnightOf(noon, LA);
    expect(localDay(start, LA)).toBe("2026-03-08");
    expect(localDay(start - 1, LA)).toBe("2026-03-07");
    expect(nextMidnight(noon, LA) - start).toBe(23 * 3_600_000);
  });

  it("is a plain 24 hours on an ordinary day", () => {
    const ts = Date.UTC(2026, 8, 24, 12, 0);
    expect(nextMidnight(ts, "UTC") - midnightOf(ts, "UTC")).toBe(DAY_MS);
    expect(midnightOf(ts, "UTC")).toBe(Date.UTC(2026, 8, 24));
  });
});
