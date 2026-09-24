// Checks the built site in dist/ (`pnpm test` builds it first), once per language.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const LANGS = ["en", "ru"];
const SLUGS = ["", "r", "quiz", "method", "privacy"];
const ORIGIN = "https://tokendamage.com";

const pathOf = (lang: string, slug: string) =>
  `${lang === "en" ? "/" : `/${lang}/`}${slug}`;
const fileOf = (dist: string, lang: string, slug: string) =>
  join(dist, lang === "en" ? "" : lang, slug ? `${slug}.html` : "index.html");
const page = (lang: string, slug: string, dist = DIST) =>
  readFileSync(fileOf(dist, lang, slug), "utf8");

/** Everything the browser fetches on its own: scripts, styles, fonts, icons, import-map targets. */
function resources(html: string): string[] {
  const out = [
    ...html.matchAll(/\ssrc="([^"]+)"/g),
    ...html.matchAll(
      /<link[^>]+rel="(?:stylesheet|preload|icon|modulepreload)"[^>]*href="([^"]+)"/g,
    ),
  ].map((m) => m[1]!);
  const map = /<script type="importmap">(.*?)<\/script>/s.exec(html);
  if (map)
    out.push(
      ...Object.values(
        (JSON.parse(map[1]!) as { imports: Record<string, string> }).imports,
      ),
    );
  return out;
}

describe.each(LANGS)("built /%s", (lang) => {
  it.each(SLUGS)(
    "page %s declares its language and all its alternates",
    (slug) => {
      const html = page(lang, slug);
      expect(html).toContain(`<html lang="${lang}">`);
      expect(html).toContain(
        `<link rel="canonical" href="${ORIGIN}${pathOf(lang, slug)}" />`,
      );
      for (const l of LANGS)
        expect(html).toContain(
          `<link rel="alternate" hreflang="${l}" href="${ORIGIN}${pathOf(l, slug)}" />`,
        );
      expect(html).toContain(
        `<link rel="alternate" hreflang="x-default" href="${ORIGIN}${pathOf("en", slug)}" />`,
      );
      expect(html).not.toMatch(/\{\{[thv]:/);
    },
  );

  it.each(SLUGS)("page %s loads nothing from another host", (slug) => {
    for (const url of resources(page(lang, slug)))
      expect(url, url).toMatch(/^\/(?!\/)/);
  });

  it.each(SLUGS)("page %s leaks nothing from the build machine", (slug) => {
    const html = page(lang, slug);
    expect(html).not.toMatch(/\/Users\/|\/home\/|[A-Z]:\\|file:\/\//);
    const data =
      /<script type="application\/json" id="i18n">(.*?)<\/script>/s.exec(html);
    if (data)
      expect(Object.keys(JSON.parse(data[1]!))).toEqual([
        "meta",
        "strings",
        "notes",
        ...(slug === "" ? ["asides"] : []),
        "pool",
      ]);
  });

  it.each(SLUGS)(
    "page %s runs only its own scripts under a Content-Security-Policy",
    (slug) => {
      const html = page(lang, slug);
      const policy =
        /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(
          html,
        )?.[1];
      expect(policy, "no CSP").toBeDefined();
      expect(policy).toContain("default-src 'none'");
      expect(policy).toContain("connect-src 'self'");
      expect(policy).not.toMatch(/unsafe-eval|https?:|\*/);
      const map = /<script type="importmap">(.*?)<\/script>/s.exec(html)?.[1];
      if (map)
        expect(policy).toContain(
          `'sha256-${createHash("sha256").update(map).digest("base64")}'`,
        );
      // JSON modules load as fetches: a policy without connect-src 'self' silently stops every page script.
      const js = readdirSync(join(DIST, "assets/js"))
        .filter((f) => f.endsWith(".js"))
        .map((f) => readFileSync(join(DIST, "assets/js", f), "utf8"))
        .join("\n");
      if (/from\s*"[^"]+\.json"/.test(js))
        expect(policy).toContain("connect-src 'self'");
      // Any other inline script must be data, never code.
      for (const [, type] of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g))
        expect(type).toMatch(/type="(importmap|application\/json)"/);
    },
  );

  it.each(SLUGS)("page %s has a preview image in its language", (slug) => {
    const m = /<meta property="og:image" content="([^"]+)"/.exec(
      page(lang, slug),
    );
    expect(m![1]).toBe(`${ORIGIN}/og/${lang}${slug === "r" ? "-r" : ""}.png`);
    expect(existsSync(join(DIST, new URL(m![1]!).pathname))).toBe(true);
  });

  it("is in the sitemap with every alternate, /r excepted", () => {
    const xml = readFileSync(join(DIST, "sitemap.xml"), "utf8");
    for (const slug of SLUGS.filter((s) => s !== "r")) {
      const entry = new RegExp(
        `<url><loc>${ORIGIN}${pathOf(lang, slug)}</loc>(.*?)</url>`,
      ).exec(xml);
      expect(entry, slug).not.toBeNull();
      for (const l of LANGS)
        expect(entry![1]).toContain(
          `hreflang="${l}" href="${ORIGIN}${pathOf(l, slug)}"`,
        );
    }
    expect(xml).not.toContain(`${ORIGIN}${pathOf(lang, "r")}<`);
  });

  it("links the language switcher to the same page in every language", () => {
    const html = page(lang, "quiz");
    for (const l of LANGS)
      expect(html).toMatch(
        new RegExp(`<a href="${pathOf(l, "quiz")}" hreflang="${l}"`),
      );
    expect(html).toContain(
      `hreflang="${lang}" lang="${lang}" aria-current="page"`,
    );
  });
});

describe("one language per page", () => {
  // Names stay as they are in every language: the brand, the command, products, models, orgs, units.
  const NAMES = new Set(
    (
      "TOKEN DAMAGE Token Damage npx token-damage GitHub Claude Code Codex Gemini CLI OpenCode Anthropic " +
      "OpenAI Google Meta Berkeley Lab JavaScript DRAM RAM-X API LBNL TrendForce The Climate Brink Epoch AI " +
      "ChatGPT Mistral DOE EcoLogits ISO dev to Samsung Micron Crucial CO USD cookie I II III IV " +
      // Pool lines (docs/ROASTS.md §Pool): companies, products and places in the news.
      "Microsoft Stargate Nvidia xAI GPU Apple Klarna DeepSeek Collins Hyperion MIT Amazon Chevrolet Air Canada " +
      "DDR Raspberry Pi SpaceX Hugging Face Moltbook Tesla"
    ).split(" "),
  );
  /** Visible text and attributes, without scripts, style, code, paths or model ids. */
  const visible = (html: string) =>
    html
      // The language switcher names each language in itself («Русский», English): standard practice.
      .replace(/<a [^>]*hreflang="[^"]+"[^>]*>[^<]*<\/a>/g, " ")
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
      .replace(/<code>[\s\S]*?<\/code>/g, " ")
      .replace(/<td>[a-z0-9.-]+<\/td>/g, " ")
      .replace(/<(?:meta|link)[^>]*>/g, " ")
      .replace(
        /(?:href|src|class|id|for|type|rel|hreflang|lang|role|style|viewBox|d|fill|stroke[\w-]*|width|height|data-[\w-]+|aria-(?:hidden|pressed|current))="[^"]*"/g,
        " ",
      )
      .replace(/<[^>]+>/g, " ")
      .replace(/~?\/[\w./-]+|https?:\/\/\S+|\b[\w-]+\.(?:json|md)\b/g, " ")
      .replace(/&[a-z]+;|&#\d+;/g, " ");

  it.each(SLUGS)("/ru/%s shows no Latin words but names", (slug) => {
    const words = visible(page("ru", slug)).match(/[A-Za-z][A-Za-z-]*/g) ?? [];
    expect([...new Set(words.filter((w) => !NAMES.has(w)))]).toEqual([]);
  });

  // Pool lines drawn in the browser never reach the static HTML, so check them where they're kept.
  it("every line a page can draw stays in the page language", () => {
    for (const lang of LANGS)
      for (const slug of ["", "r", "quiz"]) {
        const data = JSON.parse(
          /<script type="application\/json" id="i18n">(.*?)<\/script>/s.exec(
            page(lang, slug),
          )![1]!,
        ) as { pool: { text: string }[] };
        expect(data.pool.length, `${lang}/${slug}`).toBeGreaterThan(0);
        for (const { text } of data.pool)
          if (lang === "ru")
            expect(
              (
                text.replace("{share}", "").match(/[A-Za-z][A-Za-z-]*/g) ?? []
              ).filter((w) => !NAMES.has(w)),
              text,
            ).toEqual([]);
          else expect(text, text).not.toMatch(/[А-Яа-яЁё]/);
      }
  });

  it.each(SLUGS)(
    "/%s shows no Cyrillic but the switcher's «Русский»",
    (slug) => {
      const text = visible(page("en", slug));
      expect(text.match(/[А-Яа-яЁё]+/g) ?? []).toEqual([]);
    },
  );

  it("the stylesheet has no external urls", () => {
    const css = readFileSync(join(DIST, "assets/site.css"), "utf8");
    for (const m of css.matchAll(/url\(\s*["']?([^"')]+)/g))
      expect(m[1]).toMatch(/^\/(?!\/)/);
  });
});

describe("a missing translation", () => {
  const tmp = mkdtempSync(join(tmpdir(), "td-web-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it("renders in English and is named in the build log", () => {
    const i18n = join(tmp, "i18n");
    cpSync(join(ROOT, "i18n"), i18n, { recursive: true });
    const ru = JSON.parse(readFileSync(join(i18n, "ru.json"), "utf8"));
    delete ru.strings["nav.quiz"];
    writeFileSync(join(i18n, "ru.json"), JSON.stringify(ru));
    const out = join(tmp, "dist");
    const run = spawnSync(
      process.execPath,
      ["scripts/build.mjs", "--langs", "en,ru", "--i18n", i18n, "--out", out],
      { cwd: ROOT, encoding: "utf8" },
    );
    expect(run.status, run.stderr).toBe(0);
    expect(run.stderr).toContain(
      "ru: 1 missing, rendered in English: nav.quiz",
    );
    expect(page("ru", "", out)).toContain(`<a href="/ru/quiz">Quiz</a>`);
  }, 60_000);
});

describe("Saint Petersburg asides stay on the home page's samples", () => {
  const asideTexts = LANGS.flatMap((lang) =>
    Object.values(
      (
        JSON.parse(
          readFileSync(join(ROOT, "i18n", `${lang}.json`), "utf8"),
        ) as { asides?: Record<string, string> }
      ).asides ?? {},
    )
      .filter((t) => t.trim())
      .flatMap((t) => t.split("\n")),
  );
  const stripData = (html: string) =>
    html.replace(
      /<script type="application\/json" id="i18n">.*?<\/script>/s,
      "",
    );

  it("has asides to check", () => {
    expect(asideTexts.length).toBeGreaterThan(3);
  });

  it.each(LANGS)("never on /r, markup or page data (%s)", (lang) => {
    const html = page(lang, "r");
    for (const line of asideTexts) expect(html).not.toContain(line);
  });

  it.each(LANGS)(
    "never in the static home markup a no-JS visitor gets (%s)",
    (lang) => {
      const html = stripData(page(lang, ""));
      for (const line of asideTexts) expect(html).not.toContain(line);
    },
  );

  it.each(SLUGS.filter((s) => s !== ""))("never on /%s", (slug) => {
    for (const lang of LANGS) {
      const html = page(lang, slug);
      for (const line of asideTexts) expect(html).not.toContain(line);
    }
  });

  it("never in a share link or a shared receipt", async () => {
    const { SHARE_WHITELIST } = await import("@token-damage/core/web");
    expect(SHARE_WHITELIST.some((k: string) => /aside|spb/i.test(k))).toBe(
      false,
    );
    const { readShare, shareView } = await import("../src/share-view.js");
    const { receiptPaper } = await import("../src/receipt.js");
    const { translator } = await import("../src/i18n.js");
    const hash =
      "#v1.eyJzdGFydCI6IjIwMjYtMDgtMjYiLCJlbmQiOiIyMDI2LTA5LTI0IiwidG9rZW5zIjpbMjEwMDAsNDQxMDAwMDAsMTEzODQwMDAwMCw5MzUwMDBdLCJjYWxscyI6NzQ4MCwic2Vzc2lvbnMiOjk0LCJkYXlzIjoyNiwic3ViYWdlbnRzIjoyMTIsIndvcmRzIjoxNDY5MCwibGlzdCI6ODA5LjY1LCJzYXZlZCI6NDM4My44NSwicGxhbiI6NCwia3doIjpbMjYsMTIwXSwiY2xhc3MiOiJBQ1QgT0YgR09EIiwiYWNoIjpbIm9uZS1sYXN0LWZpeCIsImNhY2hlLWxvcmQiXSwiZGlzcHV0ZSI6WyJyZXNlYXJjaCIsIkRFTklFRCJdLCJub3RlIjoiaWNlYmVyZy4wIiwibGFzdCI6IjAzOjQwIn0";
    for (const lang of LANGS) {
      const catalog = JSON.parse(
        readFileSync(join(ROOT, "i18n", `${lang}.json`), "utf8"),
      );
      // Even a link naming an aside id as its note gets nothing: asides are not note ids.
      for (const note of ["iceberg.0", "spb.1"]) {
        const p = { ...readShare(hash)!, note };
        const t = translator(catalog);
        const html = receiptPaper(
          shareView(
            p,
            lang,
            { ...catalog.notes, ...catalog.asides },
            t,
            catalog.meta.locale,
          ),
          t,
        );
        for (const line of asideTexts) expect(html).not.toContain(line);
      }
    }
  });
});
