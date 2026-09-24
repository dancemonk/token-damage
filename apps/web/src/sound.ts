// Printer, rip and tear sounds, synthesized; ported from design/canvas/WebHome.dc.html.
// Only ever called from a click, tap or release, and never under prefers-reduced-motion.

let ac: AudioContext | undefined;
let master: GainNode | undefined;

export const reducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

function audio(): AudioContext | undefined {
  if (reducedMotion() || typeof AudioContext !== "function") return undefined;
  ac ??= new AudioContext();
  if (ac.state === "suspended") void ac.resume();
  if (!master) {
    master = ac.createGain();
    master.gain.value = 0.7;
    master.connect(ac.destination);
  }
  return ac;
}

function noise(
  ctx: AudioContext,
  len: number,
  shape: (p: number, sec: number) => number,
): AudioBufferSourceNode {
  const buf = ctx.createBuffer(
    1,
    Math.floor(ctx.sampleRate * len),
    ctx.sampleRate,
  );
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++)
    d[i] = (Math.random() * 2 - 1) * shape(i / d.length, i / ctx.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

export function sound(kind: "tear" | "rip" | "print"): void {
  try {
    const ctx = audio();
    if (!ctx || !master) return;
    const out = master;
    const t = ctx.currentTime;
    if (kind === "tear" || kind === "rip") {
      const big = kind === "tear";
      const len = big ? 0.34 : 0.24;
      // the rip runs across the perforation: crackling noise whose pitch climbs as it goes
      const src = noise(
        ctx,
        len,
        (p, sec) =>
          Math.pow(1 - p, 1.3) *
          (0.45 +
            0.55 * Math.abs(Math.sin(2 * Math.PI * (48 + 140 * p) * sec))),
      );
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 0.9;
      bp.frequency.setValueAtTime(big ? 650 : 1400, t);
      bp.frequency.exponentialRampToValueAtTime(
        big ? 3800 : 3200,
        t + (big ? 0.15 : 0.09),
      );
      bp.frequency.exponentialRampToValueAtTime(1600, t + len);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 450;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(big ? 0.4 : 0.2, t + 0.01);
      g.gain.exponentialRampToValueAtTime(big ? 0.2 : 0.09, t + len * 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.connect(bp);
      bp.connect(hp);
      hp.connect(g);
      g.connect(out);
      src.start(t);
      if (big) {
        // the last fibre lets go: a short low thump, timed to the snap in the animation
        const ts = t + 0.18;
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(140, ts);
        o.frequency.exponentialRampToValueAtTime(52, ts + 0.09);
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.0001, ts);
        og.gain.exponentialRampToValueAtTime(0.55, ts + 0.005);
        og.gain.exponentialRampToValueAtTime(0.0001, ts + 0.12);
        o.connect(og);
        og.connect(out);
        o.start(ts);
        o.stop(ts + 0.13);
        // it lands somewhere below the screen: a quiet, distant thud after it has left
        const tl = t + 1.3;
        const pat = noise(ctx, 0.06, (p) => Math.pow(1 - p, 2));
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 260;
        const pg = ctx.createGain();
        pg.gain.value = 0.16;
        pat.connect(lp);
        lp.connect(pg);
        pg.connect(out);
        pat.start(tl);
        const th = ctx.createOscillator();
        th.type = "sine";
        th.frequency.setValueAtTime(70, tl);
        th.frequency.exponentialRampToValueAtTime(40, tl + 0.08);
        const tg = ctx.createGain();
        tg.gain.setValueAtTime(0.0001, tl);
        tg.gain.exponentialRampToValueAtTime(0.14, tl + 0.008);
        tg.gain.exponentialRampToValueAtTime(0.0001, tl + 0.11);
        th.connect(tg);
        tg.connect(out);
        th.start(tl);
        th.stop(tl + 0.12);
      }
    }
    if (kind === "print") {
      const click = noise(ctx, 0.012, (p) => 1 - p);
      const cg = ctx.createGain();
      cg.gain.value = 0.12;
      click.connect(cg);
      cg.connect(out);
      click.start(t);
      const motor = ctx.createOscillator();
      motor.type = "triangle";
      motor.frequency.value = 118;
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(0.0001, t + 0.1);
      mg.gain.linearRampToValueAtTime(0.045, t + 0.16);
      mg.gain.setValueAtTime(0.045, t + 1.55);
      mg.gain.linearRampToValueAtTime(0.0001, t + 1.62);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      motor.connect(lp);
      lp.connect(mg);
      mg.connect(out);
      motor.start(t + 0.1);
      motor.stop(t + 1.65);
      for (let i = 0; i < 30; i++) {
        const at = t + 0.12 + i * 0.048;
        const tick = noise(ctx, 0.006, (p) => 1 - p);
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 4200 + (i % 3) * 600;
        bp.Q.value = 2;
        const tg = ctx.createGain();
        tg.gain.value = 0.05;
        tick.connect(bp);
        bp.connect(tg);
        tg.connect(out);
        tick.start(at);
      }
    }
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
