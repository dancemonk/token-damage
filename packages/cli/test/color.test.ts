import { describe, expect, it } from "vitest";
import { wantColor } from "../src/color.js";

describe("wantColor", () => {
  it("colours a terminal and leaves a pipe plain", () => {
    expect(wantColor(true, {})).toBe(true);
    expect(wantColor(false, {})).toBe(false);
  });

  it("colours a pipe when FORCE_COLOR asks, unless it is 0", () => {
    expect(wantColor(false, { FORCE_COLOR: "1" })).toBe(true);
    expect(wantColor(false, { FORCE_COLOR: "0" })).toBe(false);
    expect(wantColor(true, { FORCE_COLOR: "0" })).toBe(false);
  });

  it("lets NO_COLOR and TERM=dumb win over everything", () => {
    expect(wantColor(true, { NO_COLOR: "1" })).toBe(false);
    expect(wantColor(false, { NO_COLOR: "1", FORCE_COLOR: "1" })).toBe(false);
    expect(wantColor(true, { TERM: "dumb", FORCE_COLOR: "1" })).toBe(false);
  });
});
