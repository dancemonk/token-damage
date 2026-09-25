import { describe, expect, it } from "vitest";
import { frame } from "../src/screen.js";

describe("frame", () => {
  it("rewrites only rows that changed, with absolute cursor moves", () => {
    expect(frame(["a", "b", "c"], ["a", "B", "c"])).toBe("\x1b[2;1HB\x1b[K");
  });
  it("draws everything on the first frame and clears rows that went away", () => {
    expect(frame([], ["x", "y"])).toBe("\x1b[1;1Hx\x1b[K\x1b[2;1Hy\x1b[K");
    expect(frame(["x", "y", "z"], ["x"])).toBe(
      "\x1b[2;1H\x1b[K\x1b[3;1H\x1b[K",
    );
  });
  it("returns nothing when nothing changed", () => {
    expect(frame(["same"], ["same"])).toBe("");
  });
});
