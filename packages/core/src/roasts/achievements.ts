import type { Facts } from "./facts.js";

export interface Achievement {
  id: string;
  name: string;
  /** The true trigger, printed on the card. */
  trigger: string;
  hidden: boolean;
}

// docs/ROASTS.md §Achievements. Only those the logs can prove today; git, Codex and compaction ones wait for V1.
export function achievements(f: Facts): Achievement[] {
  const out: Achievement[] = [];
  if (f.lastCall && f.lastCall.minutes >= 1620) {
    out.push({
      id: "one-last-fix",
      name: "ONE LAST FIX",
      trigger: `Last model call at ${f.lastCall.label}`,
      hidden: false,
    });
  }
  if (f.longestIdleDays >= 7) {
    out.push({
      id: "touch-grass",
      name: "TOUCH GRASS",
      trigger: `${f.longestIdleDays} consecutive days without a model call`,
      hidden: false,
    });
  }
  if (f.cacheLordWeek) {
    out.push({
      id: "cache-lord",
      name: "CACHE LORD",
      trigger: "Over 95% of input from cache for a week",
      hidden: false,
    });
  }
  if (f.sessionSpansThreeDays) {
    out.push({
      id: "long-goodbye",
      name: "THE LONG GOODBYE",
      trigger: "One session spanned 3 calendar days",
      hidden: false,
    });
  }
  return out;
}
