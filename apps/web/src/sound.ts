// Printer, paper and tear sounds, synthesized (docs/DESIGN.md §Sound). No files: a recording can later replace
// one voice without touching callers. Nothing plays on load; only the person's own click, tap, pull or release.
import { soundOn } from "./prefs.js";
import { crackS, snapS, TEAR } from "./timeline.js";

/** The whole site's level. Tuned by ear by the owner; change it here and nowhere else. */
export const MASTER_GAIN = 0.45;

export const reducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

const allowed = () =>
  !reducedMotion() && soundOn() && typeof AudioContext === "function";

let ctx: AudioContext | undefined;
let out: GainNode | undefined;
let noise: AudioBuffer | undefined;

/**
 * Creates and resumes the context inside a gesture (pointerdown, keydown). A release after a long pull is no
 * longer a fresh gesture, so without this the tear could be refused.
 */
export function unlock(): void {
  if (!allowed()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    if (!out) {
      // master → high shelf (−4 dB above 6 kHz takes the edge off noise) → speakers. Dry on purpose.
      out = ctx.createGain();
      out.gain.value = MASTER_GAIN;
      const shelf = ctx.createBiquadFilter();
      shelf.type = "highshelf";
      shelf.frequency.value = 6000;
      shelf.gain.value = -4;
      out.connect(shelf);
      shelf.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
  } catch {
    ctx = undefined;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });
}

const jitter = (x: number, amount: number) =>
  x * (1 + (Math.random() * 2 - 1) * amount);

/** A slice of the shared noise buffer, band-passed, enveloped and panned. */
function burst(
  c: AudioContext,
  at: number,
  o: {
    dur: number;
    freq: number;
    q: number;
    peak: number;
    pan?: number;
    type?: BiquadFilterType;
    attack?: number;
  },
) {
  const src = c.createBufferSource();
  src.buffer = noise!;
  const filter = c.createBiquadFilter();
  filter.type = o.type ?? "bandpass";
  filter.frequency.value = o.freq;
  filter.Q.value = o.q;
  const g = c.createGain();
  const attack = o.attack ?? 0.0006;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(o.peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);
  const pan = c.createStereoPanner();
  pan.pan.value = Math.max(-1, Math.min(1, o.pan ?? 0));
  src.connect(filter);
  filter.connect(g);
  g.connect(pan);
  pan.connect(out!);
  src.start(at, Math.random() * 0.9, o.dur + 0.01);
}

/**
 * Paper tearing along a perforation: fibres letting go one by one. Crackles get denser as the rip runs,
 * pitch climbs from `from` to `to`, and the sound travels across the stereo field with the crack.
 */
function rip(
  c: AudioContext,
  at: number,
  len: number,
  o: { from: number; to: number; peak: number; panFrom: number; panTo: number },
) {
  const n = Math.round(len * 260);
  for (let i = 0; i < n; i++) {
    const p = Math.pow(i / n, 0.8);
    const when = at + p * len + Math.random() * 0.003;
    burst(c, when, {
      dur: 0.002 + Math.random() * 0.004,
      freq: jitter(o.from + (o.to - o.from) * p, 0.15),
      q: 1.4,
      peak: jitter(o.peak * (0.55 + 0.45 * p), 0.25),
      pan: o.panFrom + (o.panTo - o.panFrom) * p,
    });
  }
  // the paper's body under the crackle: low, soft, short
  burst(c, at, {
    dur: len + 0.03,
    freq: 600,
    q: 0.6,
    peak: o.peak * 0.35,
    pan: (o.panFrom + o.panTo) / 2,
    attack: 0.01,
  });
}

function thump(c: AudioContext, at: number, peak: number, from = 140, to = 52) {
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(to, at + 0.09);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
  o.connect(g);
  g.connect(out!);
  o.start(at);
  o.stop(at + 0.13);
}

type Voice = (c: AudioContext, t: number, dir: number) => void;

const VOICES: Record<"tear" | "rip" | "print" | "strain", Voice> = {
  // Pulled off the printer: the rip runs from the pull side to the pivot corner, the last fibre snaps, the paper
  // falls through the air and lands somewhere below the screen. Synced to TEAR (timeline.ts).
  tear(c, t, dir) {
    rip(c, t, crackS, {
      from: 700,
      to: 3600,
      peak: 0.32,
      panFrom: 0.6 * dir,
      panTo: -0.6 * dir,
    });
    const snap = t + snapS;
    burst(c, snap, {
      dur: 0.012,
      freq: 2600,
      q: 0.9,
      peak: 0.3,
      pan: -0.5 * dir,
    });
    thump(c, snap, 0.38);
    // air: a faint swish sweeping down as it falls away
    const src = c.createBufferSource();
    src.buffer = noise!;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(1200, snap + 0.05);
    bp.frequency.exponentialRampToValueAtTime(400, snap + 0.5);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, snap + 0.05);
    g.gain.exponentialRampToValueAtTime(0.035, snap + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, snap + 0.5);
    const pan = c.createStereoPanner();
    pan.pan.value = 0.35 * dir;
    src.connect(bp);
    bp.connect(g);
    g.connect(pan);
    pan.connect(out!);
    src.start(snap + 0.05, Math.random() * 0.4, 0.5);
    // it lands, far away
    const land = t + TEAR.landS;
    burst(c, land, {
      dur: 0.06,
      freq: 260,
      q: 0.7,
      peak: 0.12,
      type: "lowpass",
      attack: 0.004,
    });
    thump(c, land, 0.1, 70, 40);
  },

  // The stub off the Copy button: shorter, higher, no thump.
  rip(c, t) {
    rip(c, t, 0.24, {
      from: 1400,
      to: 3400,
      peak: 0.2,
      panFrom: 0.3,
      panTo: -0.3,
    });
  },

  // The pull crosses the threshold: one soft give, the paper about to go.
  strain(c, t) {
    for (let i = 0; i < 5; i++)
      burst(c, t + i * 0.012 + Math.random() * 0.006, {
        dur: 0.006,
        freq: jitter(900, 0.3),
        q: 1.2,
        peak: 0.06,
      });
  },

  // Thermal printer: relay click, stepper hum with a slow wobble, 30 head ticks, a faint paper rustle.
  print(c, t) {
    burst(c, t, { dur: 0.012, freq: 3000, q: 0.5, peak: 0.09 });
    const motor = c.createOscillator();
    motor.type = "triangle";
    motor.frequency.value = 118;
    const wobble = c.createOscillator();
    wobble.frequency.value = 3;
    const depth = c.createGain();
    depth.gain.value = 0.006;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    const mg = c.createGain();
    mg.gain.setValueAtTime(0.0001, t + 0.1);
    mg.gain.linearRampToValueAtTime(0.035, t + 0.16);
    mg.gain.setValueAtTime(0.035, t + 1.55);
    mg.gain.linearRampToValueAtTime(0.0001, t + 1.62);
    wobble.connect(depth);
    depth.connect(mg.gain);
    motor.connect(lp);
    lp.connect(mg);
    mg.connect(out!);
    motor.start(t + 0.1);
    motor.stop(t + 1.65);
    wobble.start(t + 0.1);
    wobble.stop(t + 1.65);
    for (let i = 0; i < 30; i++)
      burst(c, t + 0.12 + i * 0.048 + (Math.random() - 0.5) * 0.004, {
        dur: 0.006,
        freq: jitter(4200 + (i % 3) * 600, 0.08),
        q: 2,
        peak: 0.035,
        pan: i % 2 ? 0.1 : -0.1,
      });
    burst(c, t + 0.1, {
      dur: 1.5,
      freq: 3000,
      q: 0.7,
      peak: 0.012,
      attack: 0.08,
    });
  },
};

export function sound(
  kind: keyof typeof VOICES,
  { dir = 1 }: { dir?: number } = {},
): void {
  if (!allowed()) return;
  unlock();
  if (!ctx || !out) return;
  try {
    VOICES[kind](ctx, ctx.currentTime + 0.005, dir);
  } catch {
    // Sound is decoration; a browser that refuses it loses nothing.
  }
}

export function buzz(pattern: number | number[]): void {
  try {
    if (!reducedMotion()) navigator.vibrate?.(pattern);
  } catch {
    // Same as above.
  }
}
