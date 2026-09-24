// Checks the built site in dist/ (`pnpm test` builds it first), once per language.
import { spawnSync } from "node:child_process";
import {
  cpSync,
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
      ]);
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
