import type { Value } from "../types.js";

/** Rounds to 2 significant figures and prints without exponent or trailing zeros. */
export function sig2(x: number): string {
  if (x === 0 || !Number.isFinite(x)) return String(x);
  const decimals = Math.max(0, 1 - Math.floor(Math.log10(Math.abs(x))));
  return Number(x.toPrecision(2)).toLocaleString("en-US", {
    maximumFractionDigits: decimals,
  });
}

export const formatUsd = (v: Value) =>
  `$${v.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Estimated values are always a range: "26–120 kWh". */
export const formatRange = (v: Value, unit: string) =>
  `${sig2(v.low ?? v.value)}–${sig2(v.high ?? v.value)} ${unit}`;

export const formatSatireUsd = (v: Value) => `+$${sig2(v.value)}`;

export const formatMultiple = (v: Value) => `${v.value.toFixed(1)}×`;
