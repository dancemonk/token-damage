import {
  bytesField,
  bytesFields,
  decodeFields,
  textField,
  varintField,
} from "./proto.js";

/** One usage record in a generation or step (ccusage's `ModelUsage`). */
export interface AgyUsage {
  modelId?: number;
  input: number;
  totalOutput: number;
  cacheWrite: number;
  cacheRead: number;
  reasoning: number;
  visibleOutput: number;
  messageId?: string;
  responseId?: string;
  providerMessageId?: string;
}

/** What one `gen_metadata` or `steps` row says about the calls it records. */
export interface RowMeta {
  model?: string;
  modelId?: number;
  usage?: AgyUsage;
  retries: AgyUsage[];
  ts?: number;
}

const nonZero = (n: number | undefined) => (n ? n : undefined);

export function usageOf(blob: Uint8Array): AgyUsage {
  const f = decodeFields(blob);
  return {
    modelId: nonZero(varintField(f, 1)),
    input: varintField(f, 2) ?? 0,
    totalOutput: varintField(f, 3) ?? 0,
    cacheWrite: varintField(f, 4) ?? 0,
    cacheRead: varintField(f, 5) ?? 0,
    reasoning: varintField(f, 9) ?? 0,
    visibleOutput: varintField(f, 10) ?? 0,
    messageId: textField(f, 7),
    responseId: textField(f, 11),
    providerMessageId: textField(f, 12),
  };
}

/** A timestamp message (seconds, nanos) → epoch ms; undefined without positive seconds. */
export function timestampOf(blob: Uint8Array): number | undefined {
  const f = decodeFields(blob);
  const seconds = varintField(f, 1);
  if (seconds === undefined || seconds <= 0) return undefined;
  const nanos = Math.min(varintField(f, 2) ?? 0, 999_999_999);
  return seconds * 1000 + Math.floor(nanos / 1e6);
}

// A retry info's field 2 is its usage.
function retries(blobs: Uint8Array[]): AgyUsage[] {
  const out: AgyUsage[] = [];
  for (const b of blobs) {
    const u = bytesField(decodeFields(b), 2);
    if (u) out.push(usageOf(u));
  }
  return out;
}

/** `gen_metadata.data`: field 1 is the chat model message. */
export function generationMeta(blob: Uint8Array): RowMeta {
  const chat = bytesField(decodeFields(blob), 1);
  if (!chat) throw new Error("generation without its chat model field");
  const f = decodeFields(chat);
  const usage = bytesField(f, 4);
  const info = bytesField(f, 9);
  const stamp = info && bytesField(decodeFields(info), 4);
  return {
    model: textField(f, 19) ?? textField(f, 21),
    modelId: nonZero(varintField(f, 3)),
    usage: usage && usageOf(usage),
    retries: retries(bytesFields(f, 17)),
    ts: stamp && timestampOf(stamp),
  };
}

/** `steps.metadata`. */
export function stepMeta(blob: Uint8Array): RowMeta {
  const f = decodeFields(blob);
  const usage = bytesField(f, 9);
  const info = bytesField(f, 24);
  const model = info ? decodeFields(info) : [];
  const stamp = bytesField(f, 8) ?? bytesField(f, 1);
  return {
    model: textField(model, 12) ?? textField(model, 8),
    modelId: nonZero(varintField(model, 1)),
    usage: usage && usageOf(usage),
    retries: retries(bytesFields(f, 28)),
    ts: stamp && timestampOf(stamp),
  };
}

/** `trajectory_metadata_blob.data`: field 2 is the conversation's time. */
export function trajectoryTs(blob: Uint8Array): number | undefined {
  const stamp = bytesField(decodeFields(blob), 2);
  return stamp && timestampOf(stamp);
}
