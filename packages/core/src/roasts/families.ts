import type { Tier } from "../types.js";

/** Inclusive [min, max] per metric from `metricsOf`; every entry must hold for the template to fire. */
export type Band = Record<string, [number, number]>;

export type Tone = "dry" | "absurd" | "bureaucratic";

export interface Variant {
  text: string;
  tone: Tone;
  /** Narrower conditions for this wording, on top of the family band. */
  band?: Band;
}

export interface Family {
  id: string;
  /** Editorial priority: how much this observation is worth when it fires at full strength. */
  weight: number;
  tier: Tier;
  band: Band;
  /** How deep into its band the data sits, 0..1 (lo > hi when smaller is stronger); a number means fixed. */
  strength: number | { metric: string; lo: number; hi: number; log?: boolean };
  variants: Variant[];
}

const ANY = Infinity;

// Voice: docs/ROASTS.md. Numbers do the talking; mock the situation, never the person; no exclamation marks.
// Variant 0 is the canonical line and is used first; later receipts rotate through the rest.
export const FAMILIES: Family[] = [
  {
    id: "uninsurable",
    weight: 1,
    tier: "measured",
    band: { tokens: [5e9, ANY] },
    strength: 1,
    variants: [
      {
        text: "You are now the reason the policy exists.",
        tone: "bureaucratic",
      },
      {
        text: "{tokens} tokens. The policy has an exclusion for this. It was written last night.",
        tone: "bureaucratic",
      },
      {
        text: "Claim size: {tokens} tokens. Underwriting has asked for a moment.",
        tone: "dry",
      },
      {
        text: "{tokens} tokens in one period. Actuaries now use this receipt as a teaching example.",
        tone: "absurd",
      },
      {
        text: "This claim has been escalated. There is no level above this one. We checked.",
        tone: "bureaucratic",
      },
    ],
  },
  {
    id: "few-commits",
    weight: 1,
    tier: "measured",
    band: { commits: [0, 10], tokens: [5e7, ANY], tokensPerCommit: [1e7, ANY] },
    strength: { metric: "tokensPerCommit", lo: 1e7, hi: 1e9, log: true },
    variants: [
      {
        text: "{tokens} tokens. {Commits} commits. You're its night-shift supervisor.",
        tone: "dry",
        band: { commits: [1, 10], lastCallMinutes: [1500, 1800] },
      },
      {
        text: "{tokens} tokens went in. {Commits} commits came out. Claude isn't your assistant; you're its project manager.",
        tone: "dry",
        band: { commits: [1, 10] },
      },
      {
        text: "{tokens} tokens. Zero commits. Either this was research or it's a crime scene.",
        tone: "absurd",
        band: { commits: [0, 0] },
      },
      {
        text: "{tokensPerCommit} tokens per commit. Git has never been this expensive to talk to.",
        tone: "dry",
        band: { commits: [1, 10] },
      },
      {
        text: "{Commits} commits, {tokens} tokens. The diff is small. The reading list was not.",
        tone: "dry",
        band: { commits: [1, 10] },
      },
    ],
  },
  {
    id: "restraint",
    weight: 0.95,
    tier: "measured",
    band: {
      tokens: [0, 1e7],
      sessions: [1, 3],
      allSessionsEndBeforeNoon: [1, 1],
    },
    strength: 1,
    variants: [
      {
        text: "Two sessions, both done by lunch. Flagged for unusual restraint.",
        tone: "bureaucratic",
        band: { sessions: [2, 2] },
      },
      {
        text: "One session, finished before noon. Flagged for unusual restraint.",
        tone: "bureaucratic",
        band: { sessions: [1, 1] },
      },
      {
        text: "{Sessions} sessions, all done before noon. The adjuster has no notes. That has never happened.",
        tone: "dry",
      },
      {
        text: "{tokens} tokens, wrapped up by lunch. This receipt is mostly white space.",
        tone: "dry",
      },
      {
        text: "Everything closed before noon, {tokens} tokens in total. Suspiciously reasonable.",
        tone: "absurd",
      },
    ],
  },
  {
    id: "iceberg",
    weight: 0.85,
    tier: "measured",
    band: { tokensPerWord: [5e3, ANY], words: [50, ANY] },
    strength: { metric: "tokensPerWord", lo: 5e3, hi: 5e5, log: true },
    variants: [
      {
        text: "You typed a paragraph. It read a library.",
        tone: "dry",
        band: { tokensPerWord: [2e4, ANY] },
      },
      {
        text: "You typed {words} words. Your agents read {tokens} tokens. For every word you wrote, the machine re-read a novella.",
        tone: "dry",
        band: { tokensPerWord: [3e4, ANY] },
      },
      {
        text: "For every word you typed, the machine read {ratio} tokens. That's {gatsby} copies of The Great Gatsby. Per word.",
        tone: "absurd",
        band: { tokensPerWord: [62_600, ANY] },
      },
      {
        text: "{words} words in, {tokens} tokens read. The ratio is {ratio} to one.",
        tone: "dry",
      },
      {
        text: "Each word you typed cost the machine {ratio} tokens of reading. Brevity was not the bottleneck.",
        tone: "dry",
      },
    ],
  },
  {
    id: "late-night",
    weight: 0.7,
    tier: "measured",
    band: { lastCallMinutes: [1500, 1800] },
    strength: { metric: "lastCallMinutes", lo: 1500, hi: 1800 },
    variants: [
      {
        text: "Last model call: {lastCall}. The model doesn't sleep. That was never supposed to be a challenge.",
        tone: "dry",
      },
      {
        text: "Last call {lastCall}. Even bars close at 2.",
        tone: "dry",
        band: { lastCallMinutes: [1560, 1800] },
      },
      {
        text: "Final model call of the period: {lastCall}. The logs are timestamped. We checked twice.",
        tone: "bureaucratic",
      },
      {
        text: "At {lastCall} something still needed changing. The model answered, because it has no choice.",
        tone: "dry",
      },
      {
        text: "A fix was requested at {lastCall}. The receipt does not say what. It does not need to.",
        tone: "absurd",
      },
    ],
  },
  {
    id: "long-session",
    weight: 0.7,
    tier: "measured",
    band: { longestSessionMin: [360, ANY] },
    strength: { metric: "longestSessionMin", lo: 360, hi: 1440, log: true },
    variants: [
      {
        text: "One session ran {duration}. It has been through more than most marriages.",
        tone: "absurd",
      },
      {
        text: "Longest session: {duration}, never idle for more than an hour. That's a shift, not a session.",
        tone: "dry",
      },
      {
        text: "{duration} in one session, no pause longer than an hour. The model is fine. We're asking about the chair.",
        tone: "absurd",
      },
      {
        text: "A single session lasted {duration}. Labor law has opinions about this. The model does not.",
        tone: "bureaucratic",
      },
      {
        text: "Your longest session: {duration}. Feature films have been made in less time. Some of them good.",
        tone: "absurd",
      },
    ],
  },
  {
    id: "plan-multiple",
    weight: 0.65,
    tier: "priced",
    band: { planMultiple: [2, ANY] },
    strength: { metric: "planMultiple", lo: 2, hi: 50, log: true },
    variants: [
      {
        text: "Your {plan} plan extracted {listPrice} of list-price compute. Somewhere, a pricing analyst is staring at a wall.",
        tone: "absurd",
      },
      {
        text: "Value extracted: {multiple} your plan. The subscription is working exactly as finance feared.",
        tone: "dry",
      },
      {
        text: "{listPrice} of API-equivalent compute on a {plan} plan. The model isn't broken. It's bent.",
        tone: "dry",
      },
      {
        text: "At list price this would have been {listPrice}. The plan was {plan}. Someone else is covering the difference, and they know.",
        tone: "bureaucratic",
      },
      {
        text: "{multiple} the plan price, at list rates. A spreadsheet somewhere has turned red.",
        tone: "absurd",
      },
    ],
  },
  {
    id: "subagent-swarm",
    weight: 0.6,
    tier: "measured",
    band: { maxSubagentsInDay: [10, ANY] },
    strength: { metric: "maxSubagentsInDay", lo: 10, hi: 200, log: true },
    variants: [
      {
        text: "You spawned {subagentsDay} subagents in one day. Middle management has never been this scalable.",
        tone: "absurd",
      },
      {
        text: "{subagentsDay} subagents in a single day. None of them asked for a raise. None were offered one.",
        tone: "dry",
      },
      {
        text: "Peak headcount: {subagentsDay} subagents, one day. HR was not notified because there is no HR.",
        tone: "bureaucratic",
      },
      {
        text: "{subagents} subagents this period, {subagentsDay} on the busiest day. The org chart is mostly interns now.",
        tone: "dry",
      },
      {
        text: "{subagentsDay} interns in one day, all reading the same repo. Onboarding went fine.",
        tone: "absurd",
      },
    ],
  },
  {
    id: "output-share",
    weight: 0.6,
    tier: "measured",
    band: { outputShare: [0, 0.01], tokens: [1e7, ANY] },
    strength: { metric: "outputShare", lo: 0.01, hi: 0.0005, log: true },
    variants: [
      {
        text: "Of {tokens} tokens processed, {outputShare} was output. The rest was the agent re-reading its notes.",
        tone: "dry",
      },
      {
        text: "Output: {outputShare} of the total. The other {inputShare} was reading. A very well-read agent.",
        tone: "dry",
      },
      {
        text: "{outputShare} of these tokens were written. The remainder were read, most of them more than once.",
        tone: "dry",
      },
      {
        text: "For every token it wrote, it read {readPerOutput}. Diligent, or lost. The logs can't tell.",
        tone: "absurd",
      },
      {
        text: "{outputShare} output. Most of the damage was the agent reading what it already knew.",
        tone: "dry",
      },
    ],
  },
  {
    id: "weekend",
    weight: 0.55,
    tier: "measured",
    band: { weekendShare: [0.5, 1], activeDays: [3, ANY] },
    strength: { metric: "weekendShare", lo: 0.5, hi: 1 },
    variants: [
      {
        text: "{weekendShare} of the damage happened on Saturday and Sunday. Your employer thanks you; your weekend does not.",
        tone: "dry",
      },
      {
        text: "{weekendShare} of tokens fell on weekends. The model worked Saturday. So, evidently, did someone else.",
        tone: "dry",
      },
      {
        text: "Weekend share: {weekendShare}. Rest days were observed by nobody.",
        tone: "bureaucratic",
      },
      {
        text: "Most of this was weekend work: {weekendShare}. The receipt is dated accordingly.",
        tone: "bureaucratic",
      },
      {
        text: "{weekendShare} on Saturday and Sunday. The agent has no weekend, and apparently it is contagious.",
        tone: "absurd",
      },
    ],
  },
  {
    id: "cache-hit",
    weight: 0.5,
    tier: "measured",
    band: { cacheShare: [0.9, 1] },
    strength: { metric: "cacheShare", lo: 0.9, hi: 0.995 },
    variants: [
      {
        text: "Cache hit rate {cacheShare}. At least someone in this relationship remembers things.",
        tone: "absurd",
      },
      {
        text: "{cacheShare} of input came from cache. The agent has read this before. Many times.",
        tone: "dry",
      },
      {
        text: "Cache hit rate {cacheShare}. The same context, re-read at a discount, over and over. Thrift, technically.",
        tone: "dry",
      },
      {
        text: "{cacheShare} cached. Memory like this is usually sold as a feature. Here it is also most of the bill.",
        tone: "dry",
      },
      {
        text: "The cache served {cacheShare} of input. Without it, this receipt would need a second page.",
        tone: "absurd",
      },
    ],
  },
  {
    id: "quiet",
    weight: 0.8,
    tier: "measured",
    band: { tokensPerWeek: [1e4, 5e6], tokens: [1e4, ANY] },
    strength: 1,
    variants: [
      {
        text: "Only {tokens} tokens this week. Did you… write code yourself? We've notified the authorities.",
        tone: "absurd",
        band: { periodDays: [6, 7] },
      },
      {
        text: "{tokens} tokens this period. Barely a scratch. The adjuster drove out for nothing.",
        tone: "dry",
      },
      {
        text: "Light usage: {tokens} tokens. The claim form is mostly blank.",
        tone: "bureaucratic",
      },
      {
        text: "{tokens} tokens. We checked the logs for gaps. There were none. You simply didn't.",
        tone: "dry",
      },
      {
        text: "A quiet period: {tokens} tokens. The machine is fine. It has been asking about you.",
        tone: "absurd",
      },
    ],
  },
  {
    id: "energy",
    weight: 0.4,
    tier: "estimated",
    band: { kwhHigh: [1, ANY], tokens: [1e8, ANY] },
    strength: { metric: "kwhHigh", lo: 1, hi: 1000, log: true },
    variants: [
      {
        text: "Estimated electricity: {kwh}, about {fridge} fridge-months. Your fridge, for the record, has never written a unit test.",
        tone: "absurd",
      },
      {
        text: "Estimated electricity: {kwh}, or {phone} phone charges. The phone did less reading.",
        tone: "dry",
      },
      {
        text: "Electricity, estimated: {kwh}. Nobody publishes the real figure, so this is a range. The range is honest.",
        tone: "dry",
      },
      {
        text: "{kwh} of electricity, give or take. The error bars are wide because the data is secret, not because we're lazy.",
        tone: "dry",
      },
      {
        text: "Estimated energy: {kwh}, roughly {fridge} fridge-months. The fridge kept things cold. The agent kept things in context.",
        tone: "absurd",
      },
    ],
  },
];
