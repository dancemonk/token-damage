// /r: a friend's receipt from the link fragment. The fragment never reaches a server.
import fixed from "./fixed.json" with { type: "json" };
import { compact, number, periodDays, receiptClock } from "./format.js";
import { pageCatalog, translator } from "./i18n.js";
import { countUp, restart } from "./motion.js";
import { receiptPaper, sampleView, type ReceiptView } from "./receipt.js";
import { readShare, shareView, totalTokens } from "./share-view.js";
import { buzz, sound } from "./sound.js";

const catalog = pageCatalog();
const t = translator(catalog);
const locale = catalog.meta.locale;
const el = (id: string) => document.getElementById(id) as HTMLElement;

const guess = el("guess");
const range = el("guess-range") as HTMLInputElement;
const out = el("guess-out") as HTMLOutputElement;
const stage = el("stage");
const feed = el("feed");
const receipt = el("receipt");
const result = el("result");
const cta = el("cta");
const status = el("copy-status");

// Opening another friend's link in this tab only changes the fragment: start over with it.
window.addEventListener("hashchange", () => location.reload());

// Switching language keeps the friend's receipt: the fragment rides along.
if (location.hash)
  document
    .querySelectorAll<HTMLAnchorElement>(".langs a[hreflang]")
    .forEach((a) => (a.hash = location.hash));

function printReceipt(view: ReceiptView, withSound: boolean) {
  receipt.innerHTML = receiptPaper(view, { count: "0", slam: true });
  stage.hidden = false;
  restart(feed, "feed");
  countUp(receipt.querySelector(".r-n") as HTMLElement, view.tokens);
  if (withSound) sound("print");
}

const guessed = () => Number((10 ** Number(range.value)).toPrecision(2));

const payload = readShare(location.hash);
if (!payload) {
  el("notice").hidden = false;
  const key = `sample.${fixed.samples[0]!.trans}`;
  const own = catalog.notes[key];
  const en = catalog.notesEn?.[key];
  printReceipt(
    sampleView(
      0,
      receiptClock(new Date()),
      own
        ? { text: own, lang: catalog.meta.lang }
        : en
          ? { text: en, lang: "en" }
          : undefined,
    ),
    false,
  );
  cta.hidden = false;
} else {
  const days = periodDays(payload.start, payload.end);
  el("prompt").textContent = t(
    "r.prompt",
    { days: number(days, locale) },
    days,
  );
  guess.hidden = false;
  const show = () => (out.value = compact(guessed(), locale));
  range.addEventListener("input", show);
  show();
  el("guess-go").addEventListener("click", () => {
    const g = guessed();
    const real = totalTokens(payload);
    guess.hidden = true;
    printReceipt(shareView(payload, catalog.meta.lang, catalog.notes), true);
    const factor = Math.max(g, real) / Math.max(1, Math.min(g, real));
    result.textContent = t("r.result", {
      guess: compact(g, locale),
      real: compact(real, locale),
      factor: number(factor, locale, { maximumSignificantDigits: 3 }),
    });
    result.hidden = false;
    cta.hidden = false;
    result.focus();
  });
}

cta.addEventListener("click", (e) => {
  if (!(e.target as Element).closest("[data-copy]")) return;
  navigator.clipboard?.writeText(fixed.command).catch(() => undefined);
  sound("rip");
  buzz(8);
  status.textContent = t("home.stub.copied");
});
