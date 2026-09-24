export interface DamageClass {
  name: string;
  finePrint: string;
}

// docs/ROASTS.md §Damage classes. UNINSURABLE starts at 5B so the canonical 9.84B sample lands in it.
const CLASSES: [number, DamageClass][] = [
  [
    5e9,
    {
      name: "UNINSURABLE",
      finePrint: "You are now the reason the policy exists.",
    },
  ],
  [
    1e9,
    {
      name: "ACT OF GOD",
      finePrint: "Your insurer has stopped returning calls.",
    },
  ],
  [1e8, { name: "STRUCTURAL", finePrint: "Building inspector en route." }],
  [1e7, { name: "WATER DAMAGE", finePrint: "Please do not use the elevator." }],
  [1e6, { name: "FENDER BENDER", finePrint: "Adjuster notified." }],
  [0, { name: "PAPER CUT", finePrint: "Minor scuff. No claim filed." }],
];

export function damageClass(tokens: number): DamageClass {
  return (CLASSES.find(([min]) => tokens >= min) ??
    (CLASSES.at(-1) as [number, DamageClass]))[1];
}
