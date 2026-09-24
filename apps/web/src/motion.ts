import { enUS } from "./format.js";
import { reducedMotion } from "./sound.js";

/** Restarts a CSS animation class on an element. */
export function restart(node: HTMLElement, cls: string): void {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

let raf = 0;

/** The hero meter: runs while the paper is still printing (0.55 s delay, 1.5 s, ease-out quartic). */
export function countUp(n: HTMLElement, target: number): void {
  cancelAnimationFrame(raf);
  if (reducedMotion()) {
    n.textContent = enUS(target);
    return;
  }
  n.textContent = "0";
  const t0 = performance.now() + 550;
  const tick = (now: number) => {
    const p = Math.min(1, Math.max(0, (now - t0) / 1500));
    n.textContent = enUS(Math.round(target * (1 - Math.pow(1 - p, 4))));
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
