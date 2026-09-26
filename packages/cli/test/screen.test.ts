import { describe, expect, it } from "vitest";
import { frame } from "../src/screen.js";

describe("frame", () => {
  it("rewrites only rows that changed, with absolute cursor moves", () => {
    expect(frame(["a", "b", "c"], ["a", "B", "c"])).toBe("\x1b[2;1H\x1b[2KB");
  });
  it("draws everything on the first frame and clears rows that went away", () => {
    expect(frame([], ["x", "y"])).toBe("\x1b[1;1H\x1b[2Kx\x1b[2;1H\x1b[2Ky");
    expect(frame(["x", "y", "z"], ["x"])).toBe(
      "\x1b[2;1H\x1b[2K\x1b[3;1H\x1b[2K",
    );
  });
  it("erases before writing, so a row as wide as the terminal keeps its last character", () => {
    // After the last column, the cursor stays on it: an erase sent after the text would wipe that character.
    const full = `${"x".repeat(79)}%`;
    expect(frame([], [full])).toBe(`\x1b[1;1H\x1b[2K${full}`);
  });
  it("returns nothing when nothing changed", () => {
    expect(frame(["same"], ["same"])).toBe("");
  });
});
