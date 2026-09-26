import { describe, expect, it } from "vitest";
import {
  bytesField,
  bytesFields,
  decodeFields,
  textField,
  varintField,
} from "../../src/adapters/antigravity/proto.js";
import { encode, project, USAGE } from "../../scripts/antigravity-proto.js";

describe("decodeFields", () => {
  it("reads varints, bytes and nested messages, skipping fixed-width fields", () => {
    const blob = encode([
      [2, 300],
      [2, 7],
      [7, "msg-1"],
      [4, [[1, 5]]],
      [4, [[1, 6]]],
    ]);
    const withFixed = Uint8Array.from([
      ...blob,
      0x19,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      0x25,
      1,
      2,
      3,
      4,
    ]);
    const f = decodeFields(withFixed);
    expect(varintField(f, 2)).toBe(7);
    expect(textField(f, 7)).toBe("msg-1");
    expect(bytesFields(f, 4)).toHaveLength(2);
    expect(varintField(decodeFields(bytesField(f, 4)!), 1)).toBe(5);
    expect(varintField(f, 3)).toBeUndefined();
  });
  it("treats a blank text as absent", () => {
    expect(textField(decodeFields(encode([[7, " "]])), 7)).toBeUndefined();
  });
  it("throws on a truncated or malformed blob", () => {
    expect(() => decodeFields(Uint8Array.from([0x12, 5, 1]))).toThrow();
    expect(() => decodeFields(Uint8Array.from([0xff]))).toThrow();
    expect(() => decodeFields(Uint8Array.from([0x03]))).toThrow();
    expect(() => decodeFields(Uint8Array.from([0x00, 1]))).toThrow();
  });
});

describe("project", () => {
  it("keeps only the whitelisted fields, by wire type", () => {
    const blob = encode([
      [2, 10],
      [8, "a prompt"],
      [7, "id-1"],
      [3, "not a number"],
    ]);
    expect(encode(project(blob, USAGE))).toEqual(
      encode([
        [2, 10],
        [7, "id-1"],
      ]),
    );
  });
});
