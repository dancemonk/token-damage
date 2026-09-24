/**
 * The tear, one timeline for the animation, the specks and the sound (docs/DESIGN.md §Motion).
 * `crack` and `snap` are fractions of `ms` and match the tdTearOff keyframes in styles.css (a test checks).
 */
export const TEAR = {
  ms: 1200,
  /** 0–13 %: the rip runs along the perforation from the pull side to the pivot corner. */
  crack: 0.13,
  /** 17 %: the last fibre lets go. */
  snap: 0.17,
  /** The next receipt starts printing while this one still falls. */
  nextMs: 560,
  removeMs: 1220,
  /** It lands somewhere below the screen. */
  landS: 1.3,
} as const;

export const crackS = (TEAR.ms * TEAR.crack) / 1000;
export const snapS = (TEAR.ms * TEAR.snap) / 1000;
