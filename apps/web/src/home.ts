// Home hero: print, count up, stamp, pull to tear, next customer, copy the stub.
// Physics and timings are the tuned ones from design/prototype/hero-tear.html (docs/DESIGN.md §Motion).
import fixed from "./fixed.json" with { type: "json" };
import { receiptClock } from "./format.js";
import { pageCatalog, translator } from "./i18n.js";
import { countUp as countUpIn, restart } from "./motion.js";
import { receiptPaper, sampleView, type ReceiptView } from "./receipt.js";
import { buzz, reducedMotion, sound } from "./sound.js";

const catalog = pageCatalog();
const t = translator(catalog);
const el = (id: string) => document.getElementById(id) as HTMLElement;

const drag = el("drag");
const feed = el("feed");
const group = el("group");
const receipt = el("receipt");
const falling = el("falling");
const specks = el("specks");
const led = el("led");
const hint = el("hint");
const copied = el("copied");
const stub = group.querySelector(".stub") as HTMLElement;

const PULL = 110;
const fall = () => (matchMedia("(max-width: 520px)").matches ? 820 : 880);

let idx = 0;
let busy = false;
let dragging = false;
let touched = false;
let sx = 0;
let sy = 0;
let dx = 0;
let dy = 0;
const timers: number[] = [];
const later = (ms: number, fn: () => void) => {
  timers.push(window.setTimeout(fn, ms));
};

function note(i: number): ReceiptView["note"] {
  const key = `sample.${fixed.samples[i % fixed.samples.length]!.trans}`;
  const own = catalog.notes[key];
  if (own) return { text: own, lang: catalog.meta.lang };
  const en = catalog.notesEn?.[key];
  return en ? { text: en, lang: "en" } : undefined;
}

const countUp = (target: number) =>
  countUpIn(receipt.querySelector(".r-n") as HTMLElement, target);

function print(i: number, withSound: boolean) {
  const view = sampleView(i, receiptClock(new Date()), note(i));
  receipt.innerHTML = receiptPaper(view, { count: "0", slam: true });
  feed.style.visibility = "";
  restart(feed, "feed");
  led.className = "led";
  restart(led, "boot");
  countUp(view.tokens);
  if (withSound) sound("print");
}

function vis() {
  // heavy paper held by the printer: a little give, then it barely stretches
  const visY = dy < 50 ? dy * 0.3 : 15 + (dy - 50) * 0.1;
  const sy2 = 1 + (Math.min(dy, 140) / 140) * 0.02;
  const rot = Math.max(-6, Math.min(6, dx / 45));
  return { visY, sy: sy2, rot, dir: dx < 0 ? -1 : 1 };
}

function apply() {
  const v = reducedMotion() ? { visY: 0, sy: 1, rot: 0 } : vis();
  drag.style.transition = dragging
    ? "none"
    : "transform .7s cubic-bezier(.2,1.5,.3,1)";
  drag.style.transform = `translateY(${v.visY.toFixed(1)}px) rotate(${v.rot.toFixed(2)}deg) scaleY(${v.sy.toFixed(3)})`;
  drag.classList.toggle("dragging", dragging);
  hint.textContent = dragging
    ? dy > PULL
      ? t("home.hint.release")
      : dy > 0
        ? t("home.hint.pull")
        : ""
    : "";
}

function showSpecks() {
  const pts: [number, number, number, number, number][] = [
    [12, -26, 150, 220, 6],
    [30, 14, 190, -160, 6],
    [47, -8, 130, 300, 4],
    [61, 30, 210, -260, 6],
    [78, 10, 160, 140, 5],
    [90, 34, 120, -90, 3],
  ];
  specks.innerHTML = pts
    .map(
      ([left, x, d, r, w], i) =>
        `<span class="spk" style="left:${left}%;width:${w}px;--sx:${x}px;--sd:${d}px;--sr:${r}deg;animation-delay:${(i % 3) * 0.02}s"></span>`,
    )
    .join("");
  later(1100, () => (specks.innerHTML = ""));
}

function printNext(v: { visY: number; sy: number; rot: number; dir: number }) {
  if (busy) return;
  busy = true;
  dragging = false;
  dx = dy = 0;
  const next = (idx + 1) % fixed.samples.length;
  if (reducedMotion()) {
    idx = next;
    print(idx, false);
    apply();
    busy = false;
    return;
  }
  const copy = group.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  copy.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  copy.querySelector(".copied")?.remove();
  const body = document.createElement("div");
  body.className = "tearoff";
  body.style.cssText = `--dy:${v.visY.toFixed(1)}px;--rot:${v.rot.toFixed(2)}deg;--sy:${v.sy.toFixed(3)};--dir:${v.dir};--fall:${fall()}px;transform-origin:${v.dir === 1 ? "0% 0%" : "100% 0%"}`;
  body.append(copy);
  falling.replaceChildren(body);
  feed.style.visibility = "hidden";
  drag.style.transition = "none";
  drag.style.transform = "";
  hint.textContent = "";
  led.className = "led wait";
  sound("tear");
  buzz([10, 30, 14]);
  showSpecks();
  later(560, () => {
    idx = next;
    print(idx, true);
  });
  later(1220, () => {
    falling.replaceChildren();
    busy = false;
  });
}

drag.addEventListener("pointerdown", (e) => {
  if (busy || (e.target as Element).closest("button, a")) return;
  touched = true;
  dragging = true;
  sx = e.clientX;
  sy = e.clientY;
  dx = dy = 0;
  drag.setPointerCapture(e.pointerId);
  apply();
});
drag.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const ny = Math.max(0, e.clientY - sy);
  if (ny > PULL && dy <= PULL) buzz(6);
  dy = Math.min(ny, 320);
  dx = Math.max(-200, Math.min(200, e.clientX - sx));
  apply();
});
const release = () => {
  if (!dragging) return;
  if (dy > PULL) printNext(vis());
  else {
    dragging = false;
    dx = dy = 0;
    apply();
  }
};
drag.addEventListener("pointerup", release);
drag.addEventListener("pointercancel", release);

el("next").addEventListener("click", () => {
  touched = true;
  printNext({ visY: 0, sy: 1, rot: 0, dir: idx % 2 ? -1 : 1 });
});

let torn = false;
group.addEventListener("click", (e) => {
  if (!(e.target as Element).closest("[data-copy]") || torn) return;
  touched = true;
  torn = true;
  navigator.clipboard?.writeText(fixed.command).catch(() => undefined);
  sound("rip");
  buzz(8);
  restart(stub, "tear");
  restart(group, "recoil");
  copied.innerHTML = `<div class="msg"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#e0331b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7"></path></svg><span></span></div><div class="sub"></div>`;
  (copied.querySelector(".msg span") as HTMLElement).textContent =
    t("home.stub.copied");
  (copied.querySelector(".sub") as HTMLElement).textContent = t(
    "home.stub.noTerminal",
  );
  later(500, () => group.classList.remove("recoil"));
  later(2400, () => {
    copied.replaceChildren();
    stub.classList.remove("tear");
    restart(stub, "refeed");
  });
  later(3000, () => {
    stub.classList.remove("refeed");
    torn = false;
  });
});

el("replay").addEventListener("click", () => {
  timers.splice(0).forEach(clearTimeout);
  falling.replaceChildren();
  specks.replaceChildren();
  copied.replaceChildren();
  stub.classList.remove("tear", "refeed");
  torn = false;
  busy = false;
  dragging = false;
  dx = dy = 0;
  apply();
  idx = 0;
  feed.style.visibility = "hidden";
  led.className = "led wait";
  later(260, () => print(0, true));
});

// First paint came from the build; bring the clock and the meter to life.
(receipt.querySelector(".r-date") as HTMLElement).textContent = receiptClock(
  new Date(),
);
countUp(fixed.samples[0]!.tokens);
led.classList.add("boot");
// Once, after the first print, the paper dips 6px so people find the pull.
if (!reducedMotion())
  later(2700, () => {
    if (!touched && !busy) restart(drag, "dip");
  });
