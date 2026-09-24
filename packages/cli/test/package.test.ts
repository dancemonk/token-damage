import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VERSION } from "../src/version.js";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

// Our own core package plus the one third-party runtime dependency the project allows.
const ALLOWED_RUNTIME_DEPS = ["@token-damage/core", "@resvg/resvg-js"];

describe("cli package", () => {
  it("reports the version from package.json", () => {
    expect(VERSION).toBe(pkg.version);
  });

  it("only depends on allowed runtime packages", () => {
    const extra = Object.keys(pkg.dependencies ?? {}).filter(
      (d) => !ALLOWED_RUNTIME_DEPS.includes(d),
    );
    expect(extra).toEqual([]);
  });
});
