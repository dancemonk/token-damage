// /quiz: five questions, sources after each answer. The static list in the page is the no-JS version.
import fixed from "./fixed.json" with { type: "json" };
import { pageCatalog, translator } from "./i18n.js";
import { next } from "./pool.js";
import { newsLine } from "./receipt.js";

const catalog = pageCatalog();
const t = translator(catalog);
const root = document.getElementById("quiz") as HTMLElement;
const TOTAL = fixed.quiz.answers.length;
const OPTIONS = ["a", "b", "c"] as const;

let q = 0;
let score = 0;
let picked: number | null = null;

const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

function satire(n: number): string | undefined {
  const key = (fixed.quiz.satire as Record<string, string>)[String(n)];
  if (!key) return undefined;
  return catalog.notes[key];
}

function question() {
  const n = q + 1;
  const answer = fixed.quiz.answers[q]!;
  const options = OPTIONS.map((o, i) => {
    const label = t(`quiz.q${n}.${o}`);
    if (picked === null) {
      const b = h("button", { type: "button", className: "opt" }, label);
      b.addEventListener("click", () => {
        picked = i;
        if (i === answer) score++;
        render();
      });
      return h("li", {}, b);
    }
    const state = i === answer ? "right" : i === picked ? "wrong" : "muted";
    const mark = state === "right" ? "✓ " : state === "wrong" ? "✗ " : "";
    return h("li", {}, h("div", { className: `opt ${state}` }, mark + label));
  });
  const body: Node[] = [
    h(
      "div",
      { className: "q-progress" },
      h("span", {}, t("quiz.progress", { n, total: TOTAL })),
      h("span", {}, t("quiz.score.running", { score })),
    ),
    h("p", { className: "q-text", tabIndex: -1 }, t(`quiz.q${n}.question`)),
    h("ul", { className: "q-options" }, ...options),
  ];
  if (picked !== null) {
    const right = picked === answer;
    body.push(
      h(
        "div",
        {
          className: right ? "verdict-right" : "verdict-wrong",
          role: "status",
        },
        t(right ? "quiz.correct" : "quiz.wrong"),
      ),
      h("p", { className: "explain" }, t(`quiz.q${n}.explanation`)),
    );
    const joke = satire(n);
    if (joke) body.push(h("p", { className: "q-satire" }, `✶ ${joke}`));
    body.push(
      h(
        "p",
        { className: "q-source" },
        `${t("quiz.source.label")}: `,
        h("span", {}, t(`quiz.q${n}.source`)),
      ),
    );
    const next = h(
      "button",
      { type: "button", className: "btn" },
      `${t(n === TOTAL ? "quiz.finish" : "quiz.next")} →`,
    );
    next.addEventListener("click", () => {
      q++;
      picked = null;
      render();
      (root.querySelector(".q-text, .big") as HTMLElement | null)?.focus();
    });
    body.push(next);
  }
  return body;
}

function end() {
  const level = score <= 1 ? "low" : score <= 3 ? "mid" : "high";
  const shareText = t("quiz.share.text", {
    score,
    total: TOTAL,
    url:
      document
        .querySelector<HTMLLinkElement>('link[rel="canonical"]')
        ?.href.replace(/^https?:\/\//, "") ?? "",
  });
  const share = h(
    "button",
    { type: "button", className: "btn ghost" },
    t("quiz.share"),
  );
  const status = h("span", { className: "visually-hidden", role: "status" });
  share.addEventListener("click", async () => {
    try {
      if (navigator.share) await navigator.share({ text: shareText });
      else {
        await navigator.clipboard.writeText(shareText);
        share.textContent = t("quiz.share.copied");
        status.textContent = t("quiz.share.copied");
      }
    } catch {
      // Dismissed share sheet or no clipboard permission: nothing to do.
    }
  });
  // The command, ready to paste: the same Copy as on the receipt stub, inverted for the dark block.
  const copy = h(
    "button",
    { type: "button", className: "cmd-copy" },
    t("quiz.copy"),
  );
  copy.setAttribute("aria-label", t("quiz.copy.label"));
  copy.addEventListener("click", () => {
    navigator.clipboard?.writeText(fixed.command).then(
      () => {
        copy.textContent = t("quiz.copied");
        status.textContent = t("quiz.copied");
      },
      () => undefined,
    );
  });
  const again = h(
    "button",
    { type: "button", className: "btn ghost" },
    t("quiz.again"),
  );
  again.addEventListener("click", () => {
    q = 0;
    score = 0;
    picked = null;
    render();
  });
  const line = next(catalog.pool, "news");
  return [
    h(
      "div",
      { className: "score" },
      h("div", { className: "label" }, t("quiz.score.label")),
      h(
        "div",
        { className: "big", tabIndex: -1 },
        t("quiz.score.value", { score, total: TOTAL }),
      ),
      h("div", { className: "stamp" }, t(`quiz.stamp.${level}`)),
      h("p", {}, t(`quiz.score.${level}`)),
      h("div", { className: "rule" }),
      h("p", {}, t("quiz.cta.lead")),
      h("div", { className: "cmd" }, h("code", {}, `$ ${fixed.command}`), copy),
      h("div", { className: "q-source" }, t("quiz.cta.local")),
      h("div", { className: "row" }, share, again),
      status,
      ...(line
        ? [h("p", { className: "news", innerHTML: newsLine(line, t) })]
        : []),
    ),
  ];
}

function render() {
  root.replaceChildren(...(q < TOTAL ? question() : end()));
}

// The build printed question 1 in this same markup, so taking over moves nothing on screen.
render();
