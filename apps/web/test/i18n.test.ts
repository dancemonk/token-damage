import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Catalog, Message } from "../src/i18n.js";
import { englishTemplate, NOTE_IDS, slotsRu } from "../src/notes.js";
import { POOL_EN } from "@token-damage/core";
import { render } from "@token-damage/core/web";
import fixed from "../src/fixed.json" with { type: "json" };
import samples from "../../../packages/core/fixtures/samples.json" with { type: "json" };

const dir = new URL("../i18n/", import.meta.url);
const load = (file: string) =>
  JSON.parse(readFileSync(new URL(file, dir), "utf8")) as Catalog;
const en = load("en.json");
const others = readdirSync(dir)
  .filter((f) => f.endsWith(".json") && f !== "en.json")
  .map((f) => ({ file: f, catalog: load(f) }));

const slots = (m: Message) =>
  [
    ...new Set(
      (typeof m === "string" ? m : Object.values(m).join(" ")).match(
        /\{\w+\}/g,
      ) ?? [],
    ),
  ].sort();

/** Russian and English write some counts differently ({Sessions} "Two" vs {sessions} "2"); both always exist. */
const slotName = (s: string) => s.toLowerCase();

describe("en.json is the schema", () => {
  it("has meta, strings and notes", () => {
    expect(en.meta).toMatchObject({ lang: "en", locale: "en-US" });
    expect(Object.keys(en.strings).length).toBeGreaterThan(100);
  });

  it("plural messages cover every English category", () => {
    const need = new Intl.PluralRules("en-US").resolvedOptions()
      .pluralCategories;
    for (const m of Object.values(en.strings))
      if (typeof m !== "string")
        expect(Object.keys(m).sort()).toEqual([...need].sort());
  });
});

describe.each(others)("$file", ({ catalog }) => {
  it("has exactly the keys en.json has", () => {
    expect(Object.keys(catalog.strings).sort()).toEqual(
      Object.keys(en.strings).sort(),
    );
  });

  it("keeps every {slot} of the English string", () => {
    for (const [key, m] of Object.entries(catalog.strings))
      expect(slots(m), key).toEqual(slots(en.strings[key]!));
  });

  it("gives plurals every category its locale needs", () => {
    const need = new Intl.PluralRules(catalog.meta.locale).resolvedOptions()
      .pluralCategories;
    for (const [key, m] of Object.entries(catalog.strings)) {
      if (typeof m === "string") continue;
      expect(typeof en.strings[key], key).toBe("object");
      for (const c of need) expect(m[c], `${key}.${c}`).toBeTruthy();
    }
  });

  it("follows the voice: no exclamation marks", () => {
    const all = [
      ...Object.values(catalog.strings).flatMap((m) =>
        typeof m === "string" ? [m] : Object.values(m),
      ),
      ...Object.values(catalog.notes),
    ];
    expect(all.filter((s) => s.includes("!"))).toEqual([]);
  });

  it("writes notes only for ids that exist, with slots the English note has", () => {
    for (const [key, text] of Object.entries(catalog.notes)) {
      const english = en.notes[key] ?? englishTemplate(key);
      expect(english, `unknown note id ${key}`).toBeDefined();
      const allowed = new Set(slots(english!).map(slotName));
      for (const s of slots(text))
        expect(allowed.has(slotName(s)), `${key} uses ${s}`).toBe(true);
    }
  });
});

describe("Russian notes", () => {
  const ru = load("ru.json");
  const payload = {
    start: "2026-08-26",
    end: "2026-09-24",
    tokens: [21_000, 44_100_000, 1_138_400_000, 935_000] as [
      number,
      number,
      number,
      number,
    ],
    calls: 7480,
    sessions: 94,
    days: 26,
    subagents: 212,
    words: 14_690,
    list: 809.65,
    saved: 4383.85,
    plan: 4,
    kwh: [26, 120] as [number, number],
    class: "ACT OF GOD",
    ach: [],
    last: "03:40",
  };
  const s = {
    ...slotsRu(payload),
    // Facts a share link lacks, as the CLI would fill them.
    commits: "2",
    tokensPerCommit: "93,6 млн",
    subagentsDay: "41",
    weekendShare: "62%",
    duration: "7 ч 40 мин",
    plan: "200 $",
  };

  it("are written for every core note", () => {
    expect(NOTE_IDS.filter((id) => !ru.notes[id])).toEqual([]);
  });

  it.each(NOTE_IDS)("%s renders as clean Russian", (id) => {
    const text = render(ru.notes[id]!, s);
    expect(text).toBeDefined();
    expect(text).not.toMatch(/\{|\.\.(?!\.)|\s[.,]|[A-Za-z]{4,}/);
  });
});

describe("never-translated data", () => {
  it("sample customers match the canonical numbers", () => {
    const canon = samples.customers.map((c) => ({
      trans: c.trans,
      tokens: c.facts.tokens,
      words: c.facts.words,
    }));
    expect(
      fixed.samples.map((c) => ({
        trans: c.trans,
        tokens: c.tokens,
        words: c.words,
      })),
    ).toEqual(canon);
  });
});

describe.each([{ file: "en.json", catalog: en }, ...others])(
  "asides in $file",
  ({ catalog }) => {
    const asides = Object.entries(catalog.asides ?? {});
    // Topics are the city and its drinking, never drugs (docs/I18N.md), and no brands.
    const OFF_LIMITS =
      /закладк|нарк|кокаин|гашиш|травк|мефедрон|соль\b|drug|weed|cocaine|stoned|high\b|балтик|невское|жигул|heineken|guinness|absolut/i;

    it("use spb.N ids", () => {
      for (const [id] of asides) expect(id).toMatch(/^spb\.\d+$/);
    });

    it.each(asides.filter(([, text]) => text.trim()))(
      "%s follows the voice and fits two receipt lines",
      (_, text) => {
        expect(text).not.toContain("!");
        expect(text).not.toMatch(OFF_LIMITS);
        const lines = text.split("\n");
        expect(lines.length).toBeLessThanOrEqual(2);
        for (const line of lines) expect(line.length).toBeLessThanOrEqual(42);
      },
    );
  },
);

describe.each(others)("pool in $file", ({ catalog }) => {
  const pool = catalog.pool ?? [];
  const english = new Map(POOL_EN.map((l) => [l.id, l]));
  const asides = Object.values(catalog.asides ?? {}).filter((a) => a.trim());

  it("is written fresh for most of the English pool, id for id", () => {
    expect(pool.length).toBeGreaterThan(80);
    expect(new Set(pool.map((l) => l.id)).size).toBe(pool.length);
    for (const l of pool) expect(english.get(l.id)?.kind, l.id).toBe(l.kind);
  });

  it.each(pool)("$id follows the rules", (l) => {
    expect(l.text).not.toContain("!");
    expect(l.text.length).toBeLessThanOrEqual(140);
    expect(l.text.replace("{share}", "")).not.toMatch(/\{\w+\}/);
    if (l.kind === "satire") expect(l.text).toContain("{share}");
    else expect(l.text).not.toContain("{share}");
    if (l.kind !== "joke") expect(l.source?.url).toMatch(/^https:\/\//);
    // The date in a news line keeps its age honest.
    if (l.kind === "news") expect(l.text).toMatch(/\d{4}/);
    // Three lines under the paper on a 360px phone (styles.css reserves exactly that).
    if (l.kind === "news") expect(l.text.length).toBeLessThanOrEqual(120);
  });

  it("never repeats an aside", () => {
    for (const l of pool)
      for (const a of asides)
        expect(l.text.replace(/\s+/g, " ")).not.toBe(a.replace(/\s+/g, " "));
  });
});
