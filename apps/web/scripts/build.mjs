// Builds the static site: one folder per language from the same templates.
//   node scripts/build.mjs --langs en,ru
// Adding a language = i18n/<lang>.json + its code in --langs (see docs/I18N.md).
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(ROOT, "../..");

const { values } = parseArgs({
  options: {
    langs: { type: "string" },
    i18n: { type: "string" },
    out: { type: "string" },
  },
});
const DIST = resolve(values.out ?? join(ROOT, "dist"));
const I18N = resolve(values.i18n ?? join(ROOT, "i18n"));
const JS = join(DIST, "assets/js");
const LANGS = (values.langs ?? "en").split(",").map((l) => l.trim());
if (LANGS[0] !== "en") throw new Error("--langs must start with en");

// 1. Compile the page scripts, then load the pure modules the build shares with the browser.
rmSync(DIST, { recursive: true, force: true });
execFileSync(
  join(REPO, "node_modules/.bin/tsc"),
  ["-p", "tsconfig.build.json", "--outDir", JS],
  {
    cwd: ROOT,
    stdio: "inherit",
  },
);
const { esc, receiptPaper, sampleView, stub } = await import(
  join(JS, "receipt.js")
);
const { translator } = await import(join(JS, "i18n.js"));
const { monthYear, number } = await import(join(JS, "format.js"));
const fixed = JSON.parse(readFileSync(join(ROOT, "src/fixed.json"), "utf8"));
const core = await import("@token-damage/core");
const { FAMILIES } = await import("@token-damage/core/web");
const NOTE_IDS = FAMILIES.flatMap((f) =>
  f.variants.map((_, i) => `${f.id}.${i}`),
);

// 2. Static files: fonts, icons, one stylesheet, the browser-safe slice of core.
cpSync(join(ROOT, "public"), DIST, { recursive: true });
mkdirSync(join(DIST, "assets"), { recursive: true });
cpSync(join(DIST, "fonts"), join(DIST, "assets/fonts"), { recursive: true });
rmSync(join(DIST, "fonts"), { recursive: true });
writeFileSync(
  join(DIST, "assets/site.css"),
  readFileSync(join(ROOT, "public/fonts/fonts.css"), "utf8") +
    readFileSync(join(ROOT, "src/styles.css"), "utf8"),
);
rmSync(join(DIST, "assets/fonts/fonts.css"));

const coreWeb = fileURLToPath(import.meta.resolve("@token-damage/core/web"));
const coreDist = dirname(coreWeb);
const IMPORT = /(?:import|export)\s[^;]*?from\s*"([^"]+)"|import\s*"([^"]+)"/g;
(function copyGraph(file, seen = new Set()) {
  if (seen.has(file)) return;
  seen.add(file);
  const to = join(DIST, "assets/core", relative(coreDist, file));
  mkdirSync(dirname(to), { recursive: true });
  cpSync(file, to);
  if (file.endsWith(".json")) return;
  for (const m of readFileSync(file, "utf8").matchAll(IMPORT)) {
    const spec = m[1] ?? m[2];
    if (spec.startsWith(".")) copyGraph(resolve(dirname(file), spec), seen);
  }
})(coreWeb);

// 3. Catalogs. en.json is the schema; a missing key falls back to English and is reported.
const load = (lang) =>
  JSON.parse(readFileSync(join(I18N, `${lang}.json`), "utf8"));
const en = load("en");
const catalogs = {};
for (const lang of LANGS) {
  const own = load(lang);
  const extra = Object.keys(own.strings).filter((k) => !(k in en.strings));
  if (extra.length)
    throw new Error(
      `i18n/${lang}.json has keys en.json lacks: ${extra.join(", ")}`,
    );
  const missing = Object.keys(en.strings).filter((k) => !(k in own.strings));
  if (missing.length)
    console.warn(
      `[i18n] ${lang}: ${missing.length} missing, rendered in English: ${missing.join(", ")}`,
    );
  const knownNotes = new Set([...Object.keys(en.notes), ...NOTE_IDS]);
  const strayNotes = Object.keys(own.notes).filter((k) => !knownNotes.has(k));
  if (strayNotes.length)
    throw new Error(
      `i18n/${lang}.json notes with unknown ids: ${strayNotes.join(", ")}`,
    );
  catalogs[lang] = {
    meta: own.meta,
    strings: { ...en.strings, ...own.strings },
    notes: own.notes,
  };
}

// 4. Pages.
const PAGES = [
  {
    slug: "",
    template: "home.html",
    script: "home.js",
    keys: ["home.", "nav."],
    notes: /^sample\./,
  },
  {
    slug: "r",
    template: "r.html",
    script: "r.js",
    keys: ["r.", "home.stub."],
    notes: /./,
    core: true,
  },
  {
    slug: "quiz",
    template: "quiz.html",
    script: "quiz.js",
    keys: ["quiz."],
    notes: /^quiz\./,
  },
  { slug: "method", template: "method.html" },
  { slug: "privacy", template: "privacy.html" },
];
const pathOf = (lang, slug) => `${lang === "en" ? "/" : `/${lang}/`}${slug}`;
const urlOf = (lang, slug) => fixed.origin + pathOf(lang, slug);
const fileOf = (lang, slug) =>
  join(DIST, lang === "en" ? "" : lang, slug ? `${slug}.html` : "index.html");
const template = (name) => readFileSync(join(ROOT, "templates", name), "utf8");
/** JSON inside <script>: no "</script>", no "<!--". */
const inlineJson = (x) => JSON.stringify(x).replace(/</g, "\\u003c");

function fillTemplate(src, t, vars, html) {
  const out = src.replace(/\{\{([thv]):([\w.-]+)\}\}/g, (all, kind, name) => {
    if (kind === "t") return esc(t(name));
    if (kind === "v") {
      if (!(name in vars)) throw new Error(`template var ${name} not set`);
      return esc(String(vars[name]));
    }
    if (!(name in html)) throw new Error(`template fragment ${name} not set`);
    return html[name];
  });
  const left = /\{\{[^}]*\}\}/.exec(out);
  if (left) throw new Error(`unfilled ${left[0]}`);
  return out;
}

const MARK = `<svg width="20" height="20" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M7 27V11L9 9L11 11L13 9L14 10Q15 4 16 2Q17 6 19 6Q20 5 21 4Q22 8 24 9L25 11V27L24 29L23 27L22 29L21 27L20 29L19 27L18 29L17 27L16 29L15 27L14 29L13 27L12 29L11 27L10 29L9 27L8 29Z" fill="#f6f2e9"></path><path d="M10 15H22V16.5H10ZM10 19H22V20.5H10ZM10 23H17V24.5H10Z" fill="#17160f"></path><path d="M7 11L9 9L11 11L13 9L14 10Q15 4 16 2Q17 6 19 6Q20 5 21 4Q22 8 24 9L25 11Q16 14 7 11Z" fill="#e0331b"></path></svg>`;

function header(lang, t, home) {
  const word = `${MARK}<span>${esc(fixed.brand)}</span>`;
  const wordmark = home
    ? `<button type="button" class="wordmark" id="replay" aria-label="${esc(t("nav.wordmark.replay"))}">${word}</button>`
    : `<a class="wordmark" href="${pathOf(lang, "")}" aria-label="${esc(t("nav.wordmark.home"))}">${word}</a>`;
  return `<header class="top">${wordmark}<nav><a href="${pathOf(lang, "quiz")}">${esc(t("nav.quiz"))}</a><a href="${fixed.github}">${esc(t("nav.github"))}</a></nav></header>`;
}

function langs(lang, slug, t) {
  const links = LANGS.map(
    (l) =>
      `<a href="${pathOf(l, slug)}" hreflang="${l}" lang="${l}"${l === lang ? ` aria-current="page"` : ""}>${esc(catalogs[l].meta.name)}</a>`,
  ).join("");
  return `<nav class="langs" aria-label="${esc(t("footer.language"))}"><a href="${pathOf(lang, "method")}">${esc(t("footer.method"))}</a><a href="${pathOf(lang, "privacy")}">${esc(t("footer.privacy"))}</a>${links}</nav>`;
}

const alternates = (slug) =>
  [
    ...LANGS.map(
      (l) =>
        `<link rel="alternate" hreflang="${l}" href="${urlOf(l, slug)}" />`,
    ),
    `<link rel="alternate" hreflang="x-default" href="${urlOf("en", slug)}" />`,
  ].join("\n    ");

/** The page's catalog slice, inlined so scripts can speak the page language. */
function pageData(catalog, page) {
  const pickKeys = (o, test) =>
    Object.fromEntries(Object.entries(o).filter(([k]) => test(k)));
  return {
    meta: catalog.meta,
    strings: pickKeys(catalog.strings, (k) =>
      page.keys.some((p) => k.startsWith(p)),
    ),
    notes: pickKeys(catalog.notes, (k) => page.notes.test(k)),
    notesEn: pickKeys(en.notes, (k) => page.notes.test(k)),
  };
}

function noteOf(catalog, key) {
  const own = catalog.notes[key];
  if (own) return { text: own, lang: catalog.meta.lang };
  return en.notes[key] ? { text: en.notes[key], lang: "en" } : undefined;
}

function staticQuiz(catalog, t) {
  const opts = ["a", "b", "c"];
  const items = fixed.quiz.answers.map((answer, i) => {
    const n = i + 1;
    const satireKey = fixed.quiz.satire[String(n)];
    const satire = satireKey && noteOf(catalog, satireKey);
    return `<li><p class="q-text">${esc(t(`quiz.q${n}.question`))}</p><ul>${opts.map((o) => `<li>${esc(t(`quiz.q${n}.${o}`))}</li>`).join("")}</ul><details><summary>${esc(t("quiz.reveal"))}</summary><p><b>${esc(t("quiz.answer.label"))} ${esc(t(`quiz.q${n}.${opts[answer]}`))}</b></p><p class="explain">${esc(t(`quiz.q${n}.explanation`))}</p>${satire ? `<p class="q-satire" lang="${satire.lang}">✶ ${esc(satire.text)}</p>` : ""}<p class="q-source">${esc(t("quiz.source.label"))}: <span lang="en">${esc(t(`quiz.q${n}.source`))}</span></p></details></li>`;
  });
  return `<ol>${items.join("")}</ol>`;
}

const pricesJson = JSON.parse(
  readFileSync(join(coreDist, "metrics/prices.json"), "utf8"),
);

function pricesTable(locale, t) {
  const usd = (x) =>
    number(x, locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 3,
    });
  const cols = ["input", "cacheWrite", "cacheRead", "output"];
  const head = `<tr><th scope="col">${esc(t("method.prices.col.model"))}</th>${cols.map((c) => `<th scope="col">${esc(t(`method.prices.col.${c}`))}</th>`).join("")}</tr>`;
  const rows = Object.entries(pricesJson.models).map(
    ([model, p]) =>
      `<tr><td>${esc(model)}</td>${cols.map((c) => `<td>${esc(usd(p[c]))}</td>`).join("")}</tr>`,
  );
  return `<table><thead>${head}</thead><tbody>${rows.join("")}</tbody></table>`;
}

function energyTable(locale, t) {
  const m = core.METHOD_V1;
  const rows = [
    ["method.energy.row.fresh", m.whPer1kFresh],
    ["method.energy.row.read", m.whPer1kCacheRead],
    ["method.energy.row.output", m.whPer1kOutput],
  ];
  return `<table><thead><tr><th scope="col">${esc(t("method.energy.col.type"))}</th><th scope="col">${esc(t("method.energy.col.wh"))}</th></tr></thead><tbody>${rows.map(([k, v]) => `<tr><td>${esc(t(k))}</td><td>${esc(number(v, locale, { maximumFractionDigits: 3 }))}</td></tr>`).join("")}</tbody></table>`;
}

/** Energy and RAM citations from docs/SOURCES.md; citations stay in English. */
function sources() {
  const md = readFileSync(join(REPO, "docs/SOURCES.md"), "utf8");
  const items = [];
  for (const section of ["Energy, water, CO₂", "RAM / market"]) {
    const body = md.split(`## ${section}`)[1]?.split("\n## ")[0] ?? "";
    for (const m of body.matchAll(/^- (.+?): (https:\/\/\S+)$/gm))
      items.push(`<li lang="en"><a href="${esc(m[2])}">${esc(m[1])}</a></li>`);
  }
  if (!items.length) throw new Error("no sources parsed from docs/SOURCES.md");
  return `<ul class="sources">${items.join("")}</ul>`;
}

const BUILD_CLOCK = "09/24/26 · 11:58 PM";

for (const lang of LANGS) {
  const catalog = catalogs[lang];
  const locale = catalog.meta.locale;
  const t = translator(catalog);
  for (const page of PAGES) {
    const slug = page.slug;
    const name = slug || "home";
    const vars = {
      lang,
      title: t(`${name}.meta.title`),
      description: t(`${name}.meta.description`),
      canonical: urlOf(lang, slug),
      ogLocale: locale.replace("-", "_"),
      quizHref: pathOf(lang, "quiz"),
      github: fixed.github,
      asOf: t("quiz.asOf", { date: monthYear(fixed.quiz.asOf, locale) }),
      pricesIntro: t("method.prices.intro", {
        date: new Intl.DateTimeFormat(locale, {
          dateStyle: "long",
          timeZone: "UTC",
        }).format(new Date(`${pricesJson.asOf}T00:00:00Z`)),
      }),
    };
    const html = {
      header: header(lang, t, slug === ""),
      langs: langs(lang, slug, t),
      alternates: alternates(slug),
    };
    if (slug === "") {
      html.receipt = receiptPaper(
        sampleView(0, BUILD_CLOCK, noteOf(catalog, "sample.0041")),
        { slam: true },
      );
      html.stub = stub(t("home.stub.copy"), t("home.stub.copy.label"));
    }
    if (slug === "r")
      html.stub = stub(t("home.stub.copy"), t("home.stub.copy.label"));
    if (slug === "quiz") html.staticQuiz = staticQuiz(catalog, t);
    if (slug === "method") {
      html.prices = pricesTable(locale, t);
      html.energy = energyTable(locale, t);
      html.sources = sources();
    }
    html.scripts = page.script
      ? [
          page.core
            ? `<script type="importmap">${inlineJson({ imports: { "@token-damage/core/web": "/assets/core/web.js" } })}</script>`
            : "",
          `<script type="application/json" id="i18n">${inlineJson(pageData(catalog, page))}</script>`,
          `<script type="module" src="/assets/js/${page.script}"></script>`,
        ]
          .filter(Boolean)
          .join("\n    ")
      : "";
    const inner = fillTemplate(template(page.template), t, vars, html);
    html.body =
      slug === ""
        ? inner
        : fillTemplate(template("page.html"), t, vars, {
            ...html,
            main: inner,
          });
    const out = fileOf(lang, slug);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, fillTemplate(template("layout.html"), t, vars, html));
  }
}

const count = readdirSync(DIST, { recursive: true }).filter((f) =>
  String(f).endsWith(".html"),
).length;
console.log(
  `built ${count} pages for ${LANGS.join(", ")} → ${relative(process.cwd(), DIST) || "."}`,
);
if (!existsSync(join(DIST, "assets/core/web.js")))
  throw new Error("core web entry not copied");
