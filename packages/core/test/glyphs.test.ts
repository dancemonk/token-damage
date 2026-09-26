import { describe, expect, it } from "vitest";
import { bar, sparkline } from "../src/receipt/glyphs.js";

describe("bar", () => {
  it("is all dots at zero and all squares at one", () => {
    expect(bar(0, 8)).toBe("········");
    expect(bar(1, 8)).toBe("■■■■■■■■");
  });

  it("shows a thin mark for a share too small for one square", () => {
    expect(bar(1e-6, 8)).toBe("▪·······");
  });

  it("rounds down, so only a whole share fills the bar", () => {
    expect(bar(0.99, 8)).toBe("■■■■■■■·");
    expect(bar(0.5, 8)).toBe("■■■■····");
  });

  it("clamps shares outside 0–1", () => {
    expect(bar(-1, 4)).toBe("····");
    expect(bar(2, 4)).toBe("■■■■");
  });

  it("is always exactly the width asked for", () => {
    for (let i = 0; i <= 1000; i++)
      for (const width of [1, 24, 40, 44])
        expect([...bar(i / 1000, width)]).toHaveLength(width);
  });
});

describe("sparkline", () => {
  it("scales to its maximum", () => {
    expect(sparkline([1, 2, 4, 8])).toBe("▂▃▅█");
  });

  it("can print a different glyph for a value of exactly zero", () => {
    expect(sparkline([0, 4])).toBe("▁█");
    expect(sparkline([0, 4], { zero: "·" })).toBe("·█");
    expect(sparkline([0, 0], { zero: "·" })).toBe("··");
  });
});
