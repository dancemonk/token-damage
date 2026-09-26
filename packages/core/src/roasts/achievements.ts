import { AGENT_NAMES } from "../agents.js";
import type { Facts } from "./facts.js";
import { tokenWords } from "./slots.js";

export interface Achievement {
  id: string;
  name: string;
  /** The true trigger, printed on the card. */
  trigger: string;
  hidden: boolean;
}

/** Names are printed as-is in every language, like stamps; the site looks them up by id. */
export const ACHIEVEMENT_NAMES = {
  "one-last-fix": "ONE LAST FIX",
  "touch-grass": "GONE OUTSIDE",
  "cache-lord": "CACHE LORD",
  "long-goodbye": "THE LONG GOODBYE",
  "middle-manager": "MIDDLE MANAGER",
  bilingual: "BILINGUAL",
  speedrun: "SPEEDRUN",
  "model-snob": "MODEL SNOB",
  "cache-arson": "CACHE ARSON",
} as const;

// docs/ROASTS.md §Achievements. Only those the logs can prove today; git and compaction ones wait.
export function achievements(f: Facts): Achievement[] {
  const out: Achievement[] = [];
  if (f.lastCall && f.lastCall.minutes >= 1620) {
    out.push({
      id: "one-last-fix",
      name: ACHIEVEMENT_NAMES["one-last-fix"],
      trigger: `Last model call at ${f.lastCall.label}`,
      hidden: false,
    });
  }
  if (f.longestIdleDays >= 7) {
    out.push({
      id: "touch-grass",
      name: ACHIEVEMENT_NAMES["touch-grass"],
      trigger: `${f.longestIdleDays} consecutive days without a model call`,
      hidden: false,
    });
  }
  if (f.cacheLordWeek) {
    out.push({
      id: "cache-lord",
      name: ACHIEVEMENT_NAMES["cache-lord"],
      trigger: "Over 95% of input from cache for a week",
      hidden: false,
    });
  }
  if (f.sessionSpansThreeDays) {
    out.push({
      id: "long-goodbye",
      name: ACHIEVEMENT_NAMES["long-goodbye"],
      trigger: "One session spanned 3 calendar days",
      hidden: false,
    });
  }
  if (f.maxSubagentsInDay >= 5) {
    out.push({
      id: "middle-manager",
      name: ACHIEVEMENT_NAMES["middle-manager"],
      trigger: `${f.maxSubagentsInDay} subagents in one day`,
      hidden: false,
    });
  }
  if (f.agentPair) {
    out.push({
      id: "bilingual",
      name: ACHIEVEMENT_NAMES.bilingual,
      trigger: `${AGENT_NAMES[f.agentPair[0]]} and ${AGENT_NAMES[f.agentPair[1]]} within one hour`,
      hidden: false,
    });
  }
  if (f.speedrun) {
    out.push({
      id: "speedrun",
      name: ACHIEVEMENT_NAMES.speedrun,
      trigger: `${tokenWords(f.speedrun.tokens)} tokens in ${f.speedrun.seconds} seconds`,
      hidden: false,
    });
  }
  if (f.snobSession) {
    out.push({
      id: "model-snob",
      name: ACHIEVEMENT_NAMES["model-snob"],
      trigger: `${tokenWords(f.snobSession.read)} tokens read, ${f.snobSession.output.toLocaleString("en-US")} written, flagship models only`,
      hidden: true,
    });
  }
  if (f.cacheRebuilds >= 5) {
    out.push({
      id: "cache-arson",
      name: ACHIEVEMENT_NAMES["cache-arson"],
      trigger: `${f.cacheRebuilds} cache rebuilds with no idle gap`,
      hidden: true,
    });
  }
  return out;
}
