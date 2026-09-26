// Just enough protobuf to read Antigravity's metadata blobs by field number (no schema, no dependency).
// Mirrors ccusage's reader: a repeated number or text field keeps its last value, a byte field its first.

export interface Field {
  num: number;
  varint?: bigint;
  bytes?: Uint8Array;
}

/** The top-level fields of one message. Fixed-width fields are skipped. Throws on malformed input. */
export function decodeFields(buf: Uint8Array): Field[] {
  const fields: Field[] = [];
  let at = 0;
  const varint = (): bigint => {
    let value = 0n;
    for (let shift = 0n; shift < 70n; shift += 7n) {
      const byte = buf[at++];
      if (byte === undefined) throw new Error("truncated varint");
      value |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value;
    }
    throw new Error("varint overflow");
  };
  const skip = (n: number) => {
    if (at + n > buf.length) throw new Error("truncated field");
    at += n;
  };
  while (at < buf.length) {
    const tag = varint();
    const num = Number(tag >> 3n);
    if (num === 0) throw new Error("field number zero");
    const wire = Number(tag & 7n);
    if (wire === 0) fields.push({ num, varint: varint() });
    else if (wire === 1) skip(8);
    else if (wire === 2) {
      const length = Number(varint());
      const start = at;
      skip(length);
      fields.push({ num, bytes: buf.subarray(start, at) });
    } else if (wire === 5) skip(4);
    else throw new Error(`unsupported wire type ${wire}`);
  }
  return fields;
}

/** The last varint with this number. */
export function varintField(fields: Field[], num: number): number | undefined {
  for (let i = fields.length - 1; i >= 0; i--) {
    const f = fields[i];
    if (f?.num === num && f.varint !== undefined) return Number(f.varint);
  }
  return undefined;
}

/** The first length-delimited field with this number. */
export function bytesField(
  fields: Field[],
  num: number,
): Uint8Array | undefined {
  return fields.find((f) => f.num === num && f.bytes !== undefined)?.bytes;
}

/** Every length-delimited field with this number, in order. */
export function bytesFields(fields: Field[], num: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const f of fields) if (f.num === num && f.bytes) out.push(f.bytes);
  return out;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** The last length-delimited field with this number, as non-blank UTF-8 text. */
export function textField(fields: Field[], num: number): string | undefined {
  for (let i = fields.length - 1; i >= 0; i--) {
    const f = fields[i];
    if (f?.num !== num || !f.bytes) continue;
    try {
      const text = utf8.decode(f.bytes);
      return text.trim() === "" ? undefined : text;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
