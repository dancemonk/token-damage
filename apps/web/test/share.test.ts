import { readFileSync } from "node:fs";
import { SHARE_BASE, shareUrl } from "@token-damage/core/web";
import { describe, expect, it } from "vitest";
import { translator, type Catalog } from "../src/i18n.js";
import { shareNote } from "../src/notes.js";
import { receiptPaper, sampleView } from "../src/receipt.js";
import { readShare, shareView } from "../src/share-view.js";
import fixed from "../src/fixed.json" with { type: "json" };

// A v1 link as the CLI prints it. Links like this are already in chats and posts: it must decode forever.
const FROZEN_V1 =
  "https://tokendamage.com/r#v1.eyJzdGFydCI6IjIwMjYtMDgtMjYiLCJlbmQiOiIyMDI2LTA5LTI0IiwidG9rZW5zIjpbMjEwMDAsNDQxMDAwMDAsMTEzODQwMDAwMCw5MzUwMDBdLCJjYWxscyI6NzQ4MCwic2Vzc2lvbnMiOjk0LCJkYXlzIjoyNiwic3ViYWdlbnRzIjoyMTIsIndvcmRzIjoxNDY5MCwibGlzdCI6ODA5LjY1LCJzYXZlZCI6NDM4My44NSwicGxhbiI6NCwia3doIjpbMjYsMTIwXSwiY2xhc3MiOiJBQ1QgT0YgR09EIiwiYWNoIjpbIm9uZS1sYXN0LWZpeCIsImNhY2hlLWxvcmQiXSwiZGlzcHV0ZSI6WyJyZXNlYXJjaCIsIkRFTklFRCJdLCJub3RlIjoiaWNlYmVyZy4wIiwibGFzdCI6IjAzOjQwIn0";
// The same receipt from a CLI that names its agents and marks a partly priced total. Also frozen.
const FROZEN_V1_AGENTS =
  "https://tokendamage.com/r#v1.eyJzdGFydCI6IjIwMjYtMDgtMjYiLCJlbmQiOiIyMDI2LTA5LTI0IiwidG9rZW5zIjpbMjEwMDAsNDQxMDAwMDAsMTEzODQwMDAwMCw5MzUwMDBdLCJjYWxscyI6NzQ4MCwic2Vzc2lvbnMiOjk0LCJkYXlzIjoyNiwic3ViYWdlbnRzIjoyMTIsIndvcmRzIjoxNDY5MCwibGlzdCI6ODA5LjY1LCJzYXZlZCI6NDM4My44NSwicGxhbiI6NCwia3doIjpbMjYsMTIwXSwiY2xhc3MiOiJBQ1QgT0YgR09EIiwiYWNoIjpbIm9uZS1sYXN0LWZpeCIsImNhY2hlLWxvcmQiXSwiZGlzcHV0ZSI6WyJyZXNlYXJjaCIsIkRFTklFRCJdLCJub3RlIjoiaWNlYmVyZy4wIiwibGFzdCI6IjAzOjQwIiwiYWdlbnRzIjpbImNsYXVkZS1jb2RlIiwiY29kZXgiXSwicGFydGx5Ijp0cnVlfQ";

const hashOf = (url: string) => url.slice(url.indexOf("#"));
const catalog = (lang: string) =>
  JSON.parse(
    readFileSync(new URL(`../i18n/${lang}.json`, import.meta.url), "utf8"),
  ) as Catalog;
const LANGS = ["en", "ru"];

// What each language prints for the frozen link's class, verdict and achievements.
const EXPECT: Record<
  string,
  {
    stamps: string[];
    ach: string[];
    progress: string;
    top: string;
    partly: string;
  }
> = {
  en: {
    stamps: ["ACT OF GOD", "DENIED"],
    ach: ["ONE LAST FIX", "CACHE LORD"],
    progress: "4% to UNINSURABLE",
    top: "top of the scale",
    partly: "+ at least: models with no list price are left out",
  },
  ru: {
    stamps: ["ФОРС-МАЖОР", "ОТКАЗАНО"],
    ach: ["ПОСЛЕДНЯЯ ПРАВКА", "ВЛАСТЕЛИН КЭША"],
    // Non-breaking spaces keep the class name on one line when the row wraps on a phone.
    progress: "4% до класса «НЕ\u00a0ПОДЛЕЖИТ\u00a0СТРАХОВАНИЮ»",
    top: "выше некуда",
    partly: "+ не меньше: модели без цены в прайсе не считали",
  },
};

describe.each(LANGS)("share links on /%s", (lang) => {
  const c = catalog(lang);
  const notes = c.notes;
  const t = translator(c);
  const view = (p: Parameters<typeof shareView>[0]) =>
    shareView(p, lang, notes, t, c.meta.locale);

  it("decodes the frozen v1 link", () => {
    const p = readShare(hashOf(FROZEN_V1));
    expect(p).not.toBeNull();
    const v = view(p!);
    expect(v.tokens).toBe(1_183_456_000);
    expect(v.stamps).toEqual(EXPECT[lang]!.stamps);
    expect(v.achievements).toEqual(EXPECT[lang]!.ach);
    expect(v.note?.lang).toBe(lang);
    expect(v.note?.text).toMatch(/Gatsby|Гэтсби/);
    expect(v.days).toBe(30);
  });

  it("names the agents and marks a partly priced total from the newer frozen link", () => {
    const p = readShare(hashOf(FROZEN_V1_AGENTS));
    expect(p).not.toBeNull();
    expect(readShare(hashOf(shareUrl(p!)))).toEqual(p);
    const v = view(p!);
    expect(v.agents).toBe("CLAUDE CODE + CODEX");
    expect(v.price.endsWith("+")).toBe(true);
    expect(v.partly).toBe(EXPECT[lang]!.partly);
    const html = receiptPaper(v, t);
    expect(html).toContain(" · CLAUDE CODE + CODEX</div>");
    expect(html).toContain(`<p class="r-partly">${EXPECT[lang]!.partly}</p>`);
    const old = view(readShare(hashOf(FROZEN_V1))!);
    expect(old.agents).toBeUndefined();
    expect(old.partly).toBeUndefined();
    expect(old.price.endsWith("+")).toBe(false);
  });

  it("leaves out agents it does not know, and never prints them", () => {
    const base = readShare(hashOf(FROZEN_V1_AGENTS))!;
    const open = (agents: string[]) =>
      readShare(hashOf(shareUrl({ ...base, agents })));
    expect(view(open(["cursor", "codex"])!).agents).toBe("CODEX");
    for (const odd of [["<b>x</b>"], ["constructor"], ["__proto__"]]) {
      const v = view(open(odd)!);
      expect(v.agents, odd[0]).toBeUndefined();
      expect(receiptPaper(v, t)).not.toContain("<b>x");
    }
  });

  it("shows how far the link's total is into its class, from the tokens it already carries", () => {
    const v = view(readShare(hashOf(FROZEN_V1))!);
    // 1,183,456,000 tokens: ACT OF GOD runs 1B → 5B, so 4.6% of the way.
    expect(v.progress).toEqual({
      share: (1_183_456_000 - 1e9) / 4e9,
      text: EXPECT[lang]!.progress,
    });
    const html = receiptPaper(v, t);
    expect(html).toContain('<div class="r-progress">');
    expect(html).toContain('style="width:4%"');
    expect(html).toContain(EXPECT[lang]!.progress);
  });

  it("puts every sample customer's class progress under the stamp", () => {
    const at = new Date(Date.UTC(2026, 8, 24, 12));
    const progress = fixed.samples.map(
      (_, i) => sampleView(i, t, c.meta.locale, at, undefined).progress,
    );
    expect(progress[0]).toEqual({
      share: (1_183_400_000 - 1e9) / 4e9,
      text: EXPECT[lang]!.progress,
    });
    expect(progress.map((p) => Math.floor(p!.share * 100))).toEqual([
      4, 9, 21, 100,
    ]);
    expect(progress[3]).toEqual({ share: 1, text: EXPECT[lang]!.top });
    expect(
      receiptPaper(sampleView(3, t, c.meta.locale, at, undefined), t),
    ).toContain('style="width:100%"');
  });

  it("round-trips what the CLI encodes", () => {
    const p = readShare(hashOf(FROZEN_V1))!;
    expect(readShare(hashOf(shareUrl(p)))).toEqual(p);
  });

  it("rejects a payload with a key outside the whitelist", () => {
    const p = { ...readShare(hashOf(FROZEN_V1))!, project: "secret-repo" };
    const url =
      SHARE_BASE + Buffer.from(JSON.stringify(p)).toString("base64url");
    expect(readShare(hashOf(url))).toBeNull();
  });

  it("prints nothing a crafted link supplies as text", () => {
    const p = {
      ...readShare(hashOf(FROZEN_V1))!,
      class: "<img src=x onerror=alert(1)>",
      ach: ["<b>pwned</b>", "one-last-fix"],
      dispute: ["research", "<script>"] as [string, string],
      note: "<svg/onload=alert(1)>",
    };
    const url =
      SHARE_BASE + Buffer.from(JSON.stringify(p)).toString("base64url");
    const v = view(readShare(hashOf(url))!);
    const html = receiptPaper(v, t);
    expect(html).not.toMatch(/<img|<script|<svg\/|pwned|onerror/);
    expect(v.stamps).toEqual([EXPECT[lang]!.stamps[0]]);
    expect(v.note).toBeUndefined();
  });

  it("rejects impossible dates, times and sizes instead of crashing", () => {
    const base = readShare(hashOf(FROZEN_V1))!;
    const bad: Record<string, unknown>[] = [
      { end: "2026-99-99" },
      { start: "2026-02-30" },
      { start: "2026-09-24", end: "2026-01-01" },
      { start: "1990-01-01" },
      { last: "99:99" },
      { last: "24:00" },
      { tokens: [1e308, 1e308, 0, 0] },
      { words: 1e16 },
      { ach: [{}] },
      { dispute: [1, 2] },
      { agents: "codex" },
      { agents: [] },
      { agents: ["codex", "codex"] },
      { agents: ["claude-code", "codex", "gemini", "opencode", "cursor"] },
      { agents: [1] },
      { partly: false },
      { partly: "yes" },
    ];
    for (const change of bad) {
      const url = shareUrl({ ...base, ...change } as typeof base);
      expect(readShare(hashOf(url)), JSON.stringify(change)).toBeNull();
    }
    expect(
      readShare(hashOf(shareUrl({ ...base, last: "23:55" }))),
    ).not.toBeNull();
  });

  it("prints only achievements it knows, never an object's own machinery", () => {
    const p = {
      ...readShare(hashOf(FROZEN_V1))!,
      ach: ["constructor", "__proto__", "toString", "hasOwnProperty"],
    };
    expect(view(readShare(hashOf(shareUrl(p)))!).achievements).toEqual([]);
  });

  it("falls back to the sample for missing or broken fragments", () => {
    expect(readShare("")).toBeNull();
    expect(readShare("#v2.abc")).toBeNull();
    expect(readShare("#v1.not-base64-json")).toBeNull();
    const p = { ...readShare(hashOf(FROZEN_V1))!, tokens: [1, 2] };
    const url =
      SHARE_BASE + Buffer.from(JSON.stringify(p)).toString("base64url");
    expect(readShare(hashOf(url))).toBeNull();
  });
});

describe("share notes", () => {
  const p = readShare(hashOf(FROZEN_V1))!;

  it("stay out of other languages: no English note on a Russian page", () => {
    expect(shareNote(p, "ru", {})).toBeUndefined();
  });

  it("come from core's English templates on English pages", () => {
    expect(shareNote(p, "en", {})).toEqual({
      text: "For every word you typed, the machine read 80,562 tokens. That's The Great Gatsby, and a third of it again. Per word.",
      lang: "en",
    });
  });

  it("are left out when the link lacks a fact the note needs", () => {
    expect(
      shareNote({ ...p, note: "few-commits.1" }, "en", {}),
    ).toBeUndefined();
    expect(
      shareNote({ ...p, note: "few-commits.1" }, "ru", catalog("ru").notes),
    ).toBeUndefined();
  });
});

describe("the site's own receipt", () => {
  it("is a valid share link, so /method's link opens a receipt, not the sample", () => {
    const p = readShare(`#${fixed.selfReceipt.fragment}`);
    expect(p).not.toBeNull();
    expect(p!.end).toBe(fixed.selfReceipt.asOf);
  });
});
