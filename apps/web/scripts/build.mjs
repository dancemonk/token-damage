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
const { esc, fillShare, newsLine, receiptPaper, sampleView, stub } =
  await import(join(JS, "receipt.js"));
const { translator } = await import(join(JS, "i18n.js"));
const { monthYear, number, receiptFormat } = await import(
  join(JS, "format.js")
);
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
// Browser entries of core a page script may import; web.js re-exports pool-entry.js, so one copy covers both.
const CORE_ENTRIES = {
  "@token-damage/core/web": "web.js",
  "@token-damage/core/pool": "pool-entry.js",
};
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
/**
 * A language's own pool (docs/ROASTS.md §Pool): English ids and kinds, written fresh, never translated.
 * No fallback to English lines: a page shows its own language or nothing.
 */
function poolOf(lang, lines) {
  const english = new Map(core.POOL_EN.map((l) => [l.id, l]));
  for (const l of lines) {
    const en = english.get(l.id);
    if (!en) throw new Error(`i18n/${lang}.json pool: unknown id ${l.id}`);
    if (en.kind !== l.kind) throw new Error(`${lang} pool ${l.id}: kind`);
    if (l.kind === "satire" && !l.text.includes("{share}"))
      throw new Error(`${lang} pool ${l.id}: no {share}`);
  }
  return lines;
}

/** Lines the site can print: the share is its only slot, and it has no latest-call data for bands. */
const onSite = (l) =>
  !l.band && [...l.text.matchAll(/\{(\w+)\}/g)].every((m) => m[1] === "share");

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
    asides: own.asides ?? {},
    pool: lang === "en" ? core.POOL_EN : poolOf(lang, own.pool ?? []),
  };
}

// 4. Pages.
const PAGES = [
  {
    slug: "",
    template: "home.html",
    script: "home.js",
    keys: ["home.", "nav.", "receipt.", "class.", "pool."],
    notes: /^sample\./,
    pool: ["satire", "joke", "news"],
  },
  {
    slug: "r",
    template: "r.html",
    script: "r.js",
    keys: [
      "r.",
      "home.stub.",
      "nav.",
      "receipt.",
      "class.",
      "verdict.",
      "ach.",
      "pool.",
    ],
    notes: /./,
    pool: ["satire", "joke", "news"],
  },
  {
    slug: "quiz",
    template: "quiz.html",
    script: "quiz.js",
    keys: ["quiz.", "pool."],
    notes: /^quiz\./,
    pool: ["news"],
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

const SPEAKER = `<svg class="on" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg><svg class="off" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>`;

function header(lang, t, home, withSound) {
  const word = `${MARK}<span>${esc(fixed.brand)}</span>`;
  const wordmark = home
    ? `<button type="button" class="wordmark" id="replay" aria-label="${esc(t("nav.wordmark.replay"))}">${word}</button>`
    : `<a class="wordmark" href="${pathOf(lang, "")}" aria-label="${esc(t("nav.wordmark.home"))}">${word}</a>`;
  // Pages that make sound get the speaker; its slot is fixed-width so the nav never shifts (see styles.css).
  const speaker = withSound
    ? `<span class="sound-slot"><button type="button" class="sound js-only" id="sound" aria-pressed="true" aria-label="${esc(t("nav.sound"))}" title="${esc(t("nav.sound"))}">${SPEAKER}</button></span>`
    : "";
  return `<header class="top">${wordmark}<nav><a href="${pathOf(lang, "quiz")}">${esc(t("nav.quiz"))}</a><a href="${fixed.github}">${esc(t("nav.github"))}</a>${speaker}</nav></header>`;
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
    // Saint Petersburg asides ride only on the home page's sample receipts, never on /r or real receipts.
    ...(page.slug === "" && {
      asides: pickKeys(catalog.asides, (k) => catalog.asides[k].trim() !== ""),
    }),
    // Only the kinds this page prints; a source link only where the page shows one (news).
    pool: catalog.pool
      .filter((l) => page.pool?.includes(l.kind) && onSite(l))
      .map(({ id, kind, text, size, source }) => ({
        id,
        kind,
        text,
        ...(size !== undefined && { size }),
        ...(kind === "news" && source && { source }),
      })),
  };
}

function noteOf(catalog, key) {
  // One language per page: no note rather than one in another language.
  const own = catalog.notes[key];
  return own ? { text: own, lang: catalog.meta.lang } : undefined;
}

/** Question 1 exactly as quiz.ts renders it, so the script takes over without a layout shift. */
function quizFirst(t) {
  const options = ["a", "b", "c"]
    .map(
      (o) =>
        `<li><button type="button" class="opt">${esc(t(`quiz.q1.${o}`))}</button></li>`,
    )
    .join("");
  return `<div class="q-progress"><span>${esc(t("quiz.progress", { n: 1, total: fixed.quiz.answers.length }))}</span><span>${esc(t("quiz.score.running", { score: 0 }))}</span></div><p class="q-text" tabindex="-1">${esc(t("quiz.q1.question"))}</p><ul class="q-options">${options}</ul>`;
}

function staticQuiz(catalog, t) {
  const opts = ["a", "b", "c"];
  const items = fixed.quiz.answers.map((answer, i) => {
    const n = i + 1;
    const satireKey = fixed.quiz.satire[String(n)];
    const satire = satireKey && noteOf(catalog, satireKey);
    return `<li><p class="q-text">${esc(t(`quiz.q${n}.question`))}</p><ul>${opts.map((o) => `<li>${esc(t(`quiz.q${n}.${o}`))}</li>`).join("")}</ul><details><summary>${esc(t("quiz.reveal"))}</summary><p><b>${esc(t("quiz.answer.label"))} ${esc(t(`quiz.q${n}.${opts[answer]}`))}</b></p><p class="explain">${esc(t(`quiz.q${n}.explanation`))}</p>${satire ? `<p class="q-satire" lang="${satire.lang}">✶ ${esc(satire.text)}</p>` : ""}<p class="q-source">${esc(t("quiz.source.label"))}: ${esc(t(`quiz.q${n}.source`))}</p></details></li>`;
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

/** Energy and RAM sources: links from fixed.json, descriptions in the page language (method.source.N). */
function sources(t) {
  const items = fixed.sources.map(
    (url, i) =>
      `<li><a href="${esc(url)}">${esc(t(`method.source.${i + 1}`))}</a></li>`,
  );
  if (!items.length) throw new Error("no sources in fixed.json");
  return `<ul class="sources">${items.join("")}</ul>`;
}

/**
 * The home page's first receipt as the build prints it (and a no-JS visitor sees it): the first lines of a
 * fixed deck. The page script swaps in the next lines from the visitor's own deck.
 */
function staticPool(catalog, tokens, locale) {
  const first = (kind) => {
    const lines = catalog.pool.filter((l) => l.kind === kind && onSite(l));
    const { id } = core.draw(
      core.newDeck(0),
      kind,
      lines.map((l) => l.id),
    );
    return lines.find((l) => l.id === id);
  };
  const satire = first("satire");
  return {
    satire:
      satire &&
      fillShare(
        satire.text,
        receiptFormat(locale).share(core.satireShare(tokens, satire.size)),
      ),
    joke: first("joke")?.text,
    news: first("news"),
  };
}

/** /method: every pool line that rests on a fact, with its source; the share stays a blank. */
function poolSources(catalog, locale, t) {
  const month = new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const order = { satire: 0, news: 1, joke: 2 };
  const items = catalog.pool
    .filter((l) => l.source)
    .sort((a, b) => order[a.kind] - order[b.kind])
    .map((l) => {
      const text = `${l.kind === "satire" ? "✶ " : ""}${l.text.replace("{share}", "…")}`;
      // "2024-09" → "Sep 2024", "2024" stays; news already opens with its date, and "-" (a standing fact)
      // has none, so those link as "source".
      const { date } = l.source;
      const when =
        l.kind === "news"
          ? t("pool.source")
          : /^\d{4}-\d{2}$/.test(date)
            ? month.format(new Date(`${date}-01T00:00:00Z`))
            : /^\d{4}$/.test(date)
              ? date
              : t("pool.source");
      return `<li${l.kind === "satire" ? ' class="satire"' : ""}>${esc(text)} <a href="${esc(l.source.url)}" rel="noopener">${esc(when)}</a></li>`;
    });
  if (!items.length) throw new Error("no sourced pool lines");
  return `<ul class="sources pool">${items.join("")}</ul>`;
}

/**
 * Every JS module a page script reaches, as site paths, so the page can preload them all at once
 * instead of discovering the import chain one round trip at a time.
 */
function moduleGraph(entry) {
  const found = new Set();
  const imports = {};
  const walk = (file, url) => {
    if (found.has(url)) return;
    found.add(url);
    for (const m of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const spec = m[1] ?? m[2];
      if (spec.endsWith(".json")) continue;
      if (spec in CORE_ENTRIES) {
        imports[spec] = `/assets/core/${CORE_ENTRIES[spec]}`;
        walk(join(DIST, "assets/core", CORE_ENTRIES[spec]), imports[spec]);
      } else if (spec.startsWith("."))
        walk(
          resolve(dirname(file), spec),
          new URL(spec, `http://x${url}`).pathname,
        );
    }
  };
  walk(join(JS, entry), `/assets/js/${entry}`);
  return { urls: [...found], imports };
}

// The static receipt's clock; the page script replaces it with the visitor's own time.
const BUILD_DATE = new Date(2026, 8, 24, 23, 58);

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
      ogImage: `${fixed.origin}/og/${lang}${slug === "r" ? "-r" : ""}.png`,
      ogAlt: slug === "r" ? t("r.meta.description") : t("og.home"),
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
      header: header(lang, t, slug === "", slug === "" || slug === "r"),
      langs: langs(lang, slug, t),
      alternates: alternates(slug),
    };
    if (slug === "") {
      const view = sampleView(
        0,
        t,
        locale,
        BUILD_DATE,
        noteOf(catalog, "sample.0041"),
      );
      const shown = staticPool(catalog, view.tokens, locale);
      html.receipt = receiptPaper(
        { ...view, satire: shown.satire, joke: shown.joke },
        t,
        { slam: true },
      );
      html.news = shown.news ? newsLine(shown.news, t) : "";
      html.stub = stub(t);
    }
    if (slug === "r") html.stub = stub(t);
    if (slug === "quiz") {
      html.staticQuiz = staticQuiz(catalog, t);
      html.quizFirst = quizFirst(t);
    }
    if (slug === "method") {
      html.prices = pricesTable(locale, t);
      html.energy = energyTable(locale, t);
      html.sources = sources(t);
      html.pool = poolSources(catalog, locale, t);
    }
    const graph = page.script ? moduleGraph(page.script) : null;
    html.scripts = graph
      ? [
          Object.keys(graph.imports).length
            ? `<script type="importmap">${inlineJson({ imports: graph.imports })}</script>`
            : "",
          `<script type="application/json" id="i18n">${inlineJson(pageData(catalog, page))}</script>`,
          ...graph.urls.map(
            (url) => `<link rel="modulepreload" href="${url}" />`,
          ),
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

// 5. Crawlers: every page with content, each with its language alternates. /r has none of its own.
const listed = PAGES.filter((p) => p.slug !== "r");
writeFileSync(
  join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LANGS.flatMap((lang) =>
  listed.map(
    (p) =>
      `<url><loc>${urlOf(lang, p.slug)}</loc>${LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${urlOf(l, p.slug)}"/>`).join("")}<xhtml:link rel="alternate" hreflang="x-default" href="${urlOf("en", p.slug)}"/></url>`,
  ),
).join("\n")}
</urlset>
`,
);
writeFileSync(
  join(DIST, "robots.txt"),
  `User-agent: *\nAllow: /\nSitemap: ${fixed.origin}/sitemap.xml\n`,
);
for (const lang of LANGS)
  for (const suffix of ["", "-r"])
    if (!existsSync(join(DIST, `og/${lang}${suffix}.png`)))
      throw new Error(
        `og/${lang}${suffix}.png missing: run node scripts/og.mjs --langs ${LANGS.join(",")}`,
      );

const count = readdirSync(DIST, { recursive: true }).filter((f) =>
  String(f).endsWith(".html"),
).length;
console.log(
  `built ${count} pages for ${LANGS.join(", ")} → ${relative(process.cwd(), DIST) || "."}`,
);
for (const file of Object.values(CORE_ENTRIES))
  if (!existsSync(join(DIST, "assets/core", file)))
    throw new Error(`core entry ${file} not copied`);
