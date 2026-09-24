import type { Value } from "../types.js";

/** Meta's reported 30-day token usage. */
const META_30_DAY_TOKENS = 60e12;
/** Q1-2026 DRAM contract price rise (TrendForce). */
const DRAM_RISE = 0.95;
/** Made up on purpose. */
const COEFFICIENT_OF_VIBES = 0.42;

/** RAM-X, "your share of the shortage", in dollars per stick. Deliberately absurd; always shown as satire. */
export function ramX(totalTokens: number): Value {
  return {
    value:
      (totalTokens / META_30_DAY_TOKENS) * DRAM_RISE * COEFFICIENT_OF_VIBES,
    tier: "satire",
    note: "made up: nobody can measure it",
  };
}

/**
 * Your share of an AI event, for the pool's ✶ lines: the same deliberately absurd base as RAM-X (your tokens over
 * Meta's 30 days, times the Coefficient of Vibes), times how many of the thing the event is. Always satire.
 */
export const satireShare = (totalTokens: number, size = 1): number =>
  (totalTokens / META_30_DAY_TOKENS) * COEFFICIENT_OF_VIBES * size;
