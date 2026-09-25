import { describe, expect, it } from "vitest";
import {
  describeReadError,
  nextFailureCount,
  READ_FAILURE_LIMIT,
} from "../src/live.js";

describe("describeReadError", () => {
  it("keeps only the error code, never the message or a path", () => {
    const err = Object.assign(
      new Error("EACCES: permission denied, open '/tmp/x/secret.jsonl'"),
      { code: "EACCES" },
    );
    const line = describeReadError(err);
    expect(line).toBe(
      "token-damage live: could not read the agent logs (EACCES)",
    );
    expect(line).not.toContain("/tmp/x");
    expect(line).not.toContain("permission denied");
  });

  it("falls back to a fixed phrase when the error carries no code", () => {
    expect(describeReadError(new Error("boom"))).toBe(
      "token-damage live: could not read the agent logs (unknown error)",
    );
    expect(describeReadError("not an Error")).toBe(
      "token-damage live: could not read the agent logs (unknown error)",
    );
    expect(describeReadError(undefined)).toBe(
      "token-damage live: could not read the agent logs (unknown error)",
    );
  });
});

describe("nextFailureCount", () => {
  it("resets to 0 on success and trips the limit at exactly 3 consecutive failures", () => {
    let count = 0;
    count = nextFailureCount(count, true);
    expect(count).toBe(1);
    expect(count >= READ_FAILURE_LIMIT).toBe(false);
    count = nextFailureCount(count, true);
    expect(count).toBe(2);
    expect(count >= READ_FAILURE_LIMIT).toBe(false);
    count = nextFailureCount(count, true);
    expect(count).toBe(3);
    expect(count >= READ_FAILURE_LIMIT).toBe(true);
  });

  it("a success anywhere in the run resets the streak", () => {
    let count = nextFailureCount(nextFailureCount(0, true), true);
    expect(count).toBe(2);
    count = nextFailureCount(count, false);
    expect(count).toBe(0);
  });
});
