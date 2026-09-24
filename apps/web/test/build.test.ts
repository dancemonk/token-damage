// Checks the built site in dist/ (`pnpm test` builds it first), once per language.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
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

const receiptOf = (html: string) =>
  /<section\s+class="receipt"[^>]*>([\s\S]*?)<\/section>/.exec(html)![1]!;

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
        "notesEn",
        ...(slug === "" ? ["asides"] : []),
      ]);
  });

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

describe("the receipt is the same in every language", () => {
  const stripNote = (s: string) =>
    s.replace(/<div class="note"[^>]*>.*?<\/div>/s, "");

  it("home receipts differ only in the adjuster's note", () => {
    const en = receiptOf(page("en", ""));
    for (const lang of LANGS) {
      const other = receiptOf(page(lang, ""));
      expect(stripNote(other)).toBe(stripNote(en));
    }
  });

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
    const hash =
      "#v1.eyJzdGFydCI6IjIwMjYtMDgtMjYiLCJlbmQiOiIyMDI2LTA5LTI0IiwidG9rZW5zIjpbMjEwMDAsNDQxMDAwMDAsMTEzODQwMDAwMCw5MzUwMDBdLCJjYWxscyI6NzQ4MCwic2Vzc2lvbnMiOjk0LCJkYXlzIjoyNiwic3ViYWdlbnRzIjoyMTIsIndvcmRzIjoxNDY5MCwibGlzdCI6ODA5LjY1LCJzYXZlZCI6NDM4My44NSwicGxhbiI6NCwia3doIjpbMjYsMTIwXSwiY2xhc3MiOiJBQ1QgT0YgR09EIiwiYWNoIjpbIm9uZS1sYXN0LWZpeCIsImNhY2hlLWxvcmQiXSwiZGlzcHV0ZSI6WyJyZXNlYXJjaCIsIkRFTklFRCJdLCJub3RlIjoiaWNlYmVyZy4wIiwibGFzdCI6IjAzOjQwIn0";
    for (const lang of LANGS) {
      const catalog = JSON.parse(
        readFileSync(join(ROOT, "i18n", `${lang}.json`), "utf8"),
      );
      // Even a link naming an aside id as its note gets nothing: asides are not note ids.
      for (const note of ["iceberg.0", "spb.1"]) {
        const p = { ...readShare(hash)!, note };
        const html = receiptPaper(
          shareView(p, lang, { ...catalog.notes, ...catalog.asides }),
        );
        for (const line of asideTexts) expect(html).not.toContain(line);
      }
    }
  });
});
