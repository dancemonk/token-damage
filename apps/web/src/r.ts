// /r: a friend's receipt from the link fragment. The fragment never reaches a server.
import fixed from "./fixed.json" with { type: "json" };
import { compact, number, periodDays, receiptFormat } from "./format.js";
import { pageCatalog, translator } from "./i18n.js";
import { countUp, restart } from "./motion.js";
import { next, poolLines } from "./pool.js";
import {
  newsLine,
  receiptPaper,
  sampleView,
  type ReceiptView,
} from "./receipt.js";
import { readShare, shareView, totalTokens } from "./share-view.js";
import { buzz, sound } from "./sound.js";
import { wireSoundToggle } from "./toggle.js";

const catalog = pageCatalog();
const t = translator(catalog);
const locale = catalog.meta.locale;
const el = (id: string) => document.getElementById(id) as HTMLElement;

const guess = el("guess");
const range = el("guess-range") as HTMLInputElement;
const out = el("guess-out") as HTMLOutputElement;
const feed = el("feed");
const receipt = el("receipt");
const led = el("led");
const result = el("result");
const quiz = el("quiz");
const status = el("copy-status");

wireSoundToggle();

// Opening another friend's link in this tab only changes the fragment: start over with it.
window.addEventListener("hashchange", () => location.reload());

// Switching language keeps the friend's receipt: the fragment rides along.
if (location.hash)
  document
    .querySelectorAll<HTMLAnchorElement>(".langs a[hreflang]")
    .forEach((a) => (a.hash = location.hash));

/** The receipt feeds out of the printer, as on the home page, with its stub and the command attached. */
function printReceipt(view: ReceiptView, withSound: boolean) {
  const lines = poolLines(catalog.pool, view.tokens, receiptFormat(locale));
  receipt.innerHTML = receiptPaper({ ...view, ...lines }, t, {
    count: "0",
    slam: true,
  });
  feed.hidden = false;
  restart(feed, "feed");
  led.className = "led";
  restart(led, "boot");
  countUp(
    receipt.querySelector(".r-n") as HTMLElement,
    view.tokens,
    receiptFormat(locale).int,
  );
  if (withSound) sound("print");
}

/** One dated AI fact in the wire, from the start, as on the home page. */
function showNews() {
  const line = next(catalog.pool, "news");
  if (line) el("news").innerHTML = newsLine(line, t);
}

const guessed = () => Number((10 ** Number(range.value)).toPrecision(2));

const payload = readShare(location.hash);
// Token Damage's own receipt, linked from /method: say whose it is, stamp it, and offer the way back.
const self = location.hash.slice(1) === fixed.selfReceipt.fragment;
showNews();
if (self) {
  el("self-note").textContent = t("r.self.note", {
    date: new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date(`${fixed.selfReceipt.asOf}T00:00:00Z`)),
  });
  el("self-note").hidden = false;
  el("self-back").hidden = false;
}
if (!payload) {
  el("notice").hidden = false;
  const key = `sample.${fixed.samples[0]!.trans}`;
  const own = catalog.notes[key];
  printReceipt(
    sampleView(
      0,
      t,
      locale,
      new Date(),
      own ? { text: own, lang: catalog.meta.lang } : undefined,
    ),
    false,
  );
  quiz.hidden = false;
} else {
  const days = periodDays(payload.start, payload.end);
  el("prompt").textContent = self
    ? t("r.self.prompt")
    : t("r.prompt", { days: number(days, locale) }, days);
  guess.hidden = false;
  const show = () => (out.value = compact(guessed(), locale));
  range.addEventListener("input", show);
  show();
  el("guess-go").addEventListener("click", () => {
    const g = guessed();
    const real = totalTokens(payload);
    guess.hidden = true;
    const view = shareView(
      payload,
      catalog.meta.lang,
      catalog.notes,
      t,
      locale,
    );
    printReceipt(
      self
        ? {
            ...view,
            stamps: [...view.stamps, t("r.self.stamp")],
            who: t("r.self.who"),
          }
        : view,
      true,
    );
    const factor = Math.max(g, real) / Math.max(1, Math.min(g, real));
    result.textContent = t("r.result", {
      guess: compact(g, locale),
      real: compact(real, locale),
      factor: number(factor, locale, { maximumSignificantDigits: 3 }),
    });
    result.hidden = false;
    // Our own receipt already offers the way back; the quiz is for strangers' links.
    quiz.hidden = self;
    result.focus();
  });
}

el("group").addEventListener("click", (e) => {
  if (!(e.target as Element).closest("[data-copy]")) return;
  navigator.clipboard?.writeText(fixed.command).catch(() => undefined);
  sound("rip");
  buzz(8);
  status.textContent = t("home.stub.copied");
});
