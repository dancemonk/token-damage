// Encoder, field whitelists and projection for Antigravity fixtures (scripts/antigravity-fixture.ts) and the test
// that proves every fixture blob holds nothing else. Dev and test only; never shipped.

export type Message = [number, number | string | Uint8Array | Message][];
export type Shape = { [num: number]: "varint" | "text" | Shape };

export function encode(message: Message): Uint8Array {
  const out: number[] = [];
  const varint = (value: bigint) => {
    let v = value;
    do {
      let byte = Number(v & 0x7fn);
      v >>= 7n;
      if (v > 0n) byte |= 0x80;
      out.push(byte);
    } while (v > 0n);
  };
  for (const [num, value] of message) {
    if (typeof value === "number") {
      varint(BigInt(num) << 3n);
      varint(BigInt(value));
      continue;
    }
    const bytes =
      typeof value === "string"
        ? new TextEncoder().encode(value)
        : value instanceof Uint8Array
          ? value
          : encode(value);
    varint((BigInt(num) << 3n) | 2n);
    varint(BigInt(bytes.length));
    for (const b of bytes) out.push(b);
  }
  return Uint8Array.from(out);
}

interface RawField {
  num: number;
  varint?: bigint;
  bytes?: Uint8Array;
}

// Same wire rules as src/adapters/antigravity/proto.ts, kept separate so scripts need no build.
function fields(buf: Uint8Array): RawField[] {
  const out: RawField[] = [];
  let at = 0;
  const varint = () => {
    let value = 0n;
    for (let shift = 0n; ; shift += 7n) {
      const byte = buf[at++];
      if (byte === undefined || shift > 63n) throw new Error("bad varint");
      value |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value;
    }
  };
  while (at < buf.length) {
    const tag = varint();
    const num = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    if (num === 0) throw new Error("field number zero");
    if (wire === 0) out.push({ num, varint: varint() });
    else if (wire === 1) at += 8;
    else if (wire === 2) {
      const length = Number(varint());
      out.push({ num, bytes: buf.subarray(at, at + length) });
      at += length;
    } else if (wire === 5) at += 4;
    else throw new Error(`wire type ${wire}`);
    if (at > buf.length) throw new Error("truncated");
  }
  return out;
}

/** The blob's fields that `shape` lists, with the listed wire type; everything else is dropped. */
export function project(blob: Uint8Array, shape: Shape): Message {
  const kept: Message = [];
  for (const f of fields(blob)) {
    const want = shape[f.num];
    if (want === "varint" && f.varint !== undefined)
      kept.push([f.num, Number(f.varint)]);
    else if (want === "text" && f.bytes)
      kept.push([f.num, new TextDecoder().decode(f.bytes)]);
    else if (typeof want === "object" && f.bytes) {
      try {
        kept.push([f.num, project(f.bytes, want)]);
      } catch {
        // Not a message after all (a string that happens to share the number): dropped.
      }
    }
  }
  return kept;
}

export const TIMESTAMP: Shape = { 1: "varint", 2: "varint" };
export const USAGE: Shape = {
  1: "varint",
  2: "varint",
  3: "varint",
  4: "varint",
  5: "varint",
  6: "varint",
  9: "varint",
  10: "varint",
  7: "text",
  11: "text",
  12: "text",
};
const RETRY: Shape = { 2: USAGE };
export const GENERATION: Shape = {
  1: {
    3: "varint",
    4: USAGE,
    9: { 4: TIMESTAMP },
    17: RETRY,
    19: "text",
    21: "text",
  },
};
export const STEP: Shape = {
  1: TIMESTAMP,
  8: TIMESTAMP,
  9: USAGE,
  24: { 1: "varint", 7: "varint", 8: "text", 12: "text" },
  28: RETRY,
};
export const TRAJECTORY: Shape = { 2: TIMESTAMP };
