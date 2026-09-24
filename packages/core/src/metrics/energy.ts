import type { TokenSums, Value } from "../types.js";

/**
 * Method v1 (docs/METRICS.md §Estimated): Wh per 1,000 tokens by type, calibrated so Hausfather's
 * Claude Code log (3.2B tokens) lands on his central 170 kWh, with low/high scaled to his 70–330 kWh.
 */
export const METHOD_V1 = {
  whPer1kFresh: 0.25,
  whPer1kCacheRead: 0.025,
  whPer1kOutput: 5.2,
  low: 0.41,
  high: 1.94,
} as const;

const range = (
  central: number,
  low: number,
  high: number,
  note: string,
): Value => ({
  value: central,
  tier: "estimated",
  low,
  high,
  note,
});

/** Electricity in kWh, always a range. */
export function energy(t: TokenSums): Value {
  const m = METHOD_V1;
  const wh =
    ((t.input + t.cacheWrite) * m.whPer1kFresh +
      t.cacheRead * m.whPer1kCacheRead +
      t.output * m.whPer1kOutput) /
    1e3;
  const kwh = wh / 1e3;
  return range(kwh, kwh * m.low, kwh * m.high, "method v1");
}

/** On-site cooling water in liters (detail view only). Off-site water is larger, disputed, never added in. */
export function water(kwh: Value): Value {
  return range(
    kwh.value * 1.1,
    (kwh.low ?? kwh.value) * 0.2,
    (kwh.high ?? kwh.value) * 2,
    "on-site cooling, 0.2–2 L/kWh",
  );
}

/** CO₂e in kg (detail view only). US location-based grid; market-based figures run lower. */
export function co2(kwh: Value): Value {
  return range(
    kwh.value * 0.38,
    (kwh.low ?? kwh.value) * 0.34,
    (kwh.high ?? kwh.value) * 0.42,
    "US location-based, 0.34–0.42 kg/kWh",
  );
}
