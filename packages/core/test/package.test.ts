import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

describe("core package", () => {
  it("has zero runtime dependencies", () => {
    expect(pkg.dependencies ?? {}).toEqual({});
  });
});
