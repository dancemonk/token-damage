import type { Facts } from "./facts.js";
import { tokenWords } from "./slots.js";

export const EXCUSES = [
  "It was research",
  "The agent did it by itself",
  "It was one last fix",
  "I was learning",
  "Everyone does it",
  "I accept the damage",
] as const;

export type Excuse = (typeof EXCUSES)[number];

export interface Verdict {
  status: "DENIED" | "APPROVED" | "SIGNED";
  text: string;
}

// docs/ROASTS.md §Dispute. Verdicts quote the user's own numbers and never claim what wasn't measured.
export function dispute(excuse: Excuse, f: Facts): Verdict {
  const tokens = `${tokenWords(f.tokens)} tokens`;
  switch (excuse) {
    case "It was research": {
      const commits = f.commits === null ? "" : ` ${f.commits} commits.`;
      // The time jab only lands late at night (10 PM to 6 AM).
      const when =
        f.lastCall && f.lastCall.minutes >= 1320
          ? ` Research rarely happens at ${f.lastCall.label}.`
          : " Research at this scale usually comes with a bibliography.";
      return { status: "DENIED", text: `DENIED. ${tokens}.${commits}${when}` };
    }
    case "The agent did it by itself":
      return {
        status: "DENIED",
        text: `DENIED. You typed ${f.words.toLocaleString("en-US")} words of instructions. You're the manager.`,
      };
    case "It was one last fix": {
      const n = f.sessionsAfterMidnight;
      if (n > 1)
        return {
          status: "DENIED",
          text: `DENIED. ${n} sessions started after midnight. That's not one.`,
        };
      return {
        status: "APPROVED",
        text:
          n === 1
            ? "APPROVED. One session started after midnight. The logs agree. This time."
            : "APPROVED. Nothing started after midnight. We believe you.",
      };
    }
    case "I was learning":
      return {
        status: "APPROVED",
        text: "APPROVED. Learning is allowed. Damage reduced by $0.00.",
      };
    case "Everyone does it":
      return {
        status: "DENIED",
        text: "DENIED. True, but only you are on this receipt.",
      };
    case "I accept the damage":
      return { status: "SIGNED", text: "Respect. Sign here: ______" };
  }
}

/** Share-card stamp: CLAIM #0041 · "It was research" · DENIED. */
export const disputeStamp = (trans: string, excuse: Excuse, verdict: Verdict) =>
  `CLAIM #${trans} · "${excuse}" · ${verdict.status}`;
