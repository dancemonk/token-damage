import { readFileSync } from "node:fs";
import { SHARE_BASE, shareUrl } from "@token-damage/core/web";
import { describe, expect, it } from "vitest";
import type { Catalog } from "../src/i18n.js";
import { shareNote } from "../src/notes.js";
import { receiptPaper } from "../src/receipt.js";
import { readShare, shareView } from "../src/share-view.js";

// A v1 link as the CLI prints it. Links like this are already in chats and posts: it must decode forever.
const FROZEN_V1 =
  "https://tokendamage.com/r#v1.eyJzdGFydCI6IjIwMjYtMDgtMjYiLCJlbmQiOiIyMDI2LTA5LTI0IiwidG9rZW5zIjpbMjEwMDAsNDQxMDAwMDAsMTEzODQwMDAwMCw5MzUwMDBdLCJjYWxscyI6NzQ4MCwic2Vzc2lvbnMiOjk0LCJkYXlzIjoyNiwic3ViYWdlbnRzIjoyMTIsIndvcmRzIjoxNDY5MCwibGlzdCI6ODA5LjY1LCJzYXZlZCI6NDM4My44NSwicGxhbiI6NCwia3doIjpbMjYsMTIwXSwiY2xhc3MiOiJBQ1QgT0YgR09EIiwiYWNoIjpbIm9uZS1sYXN0LWZpeCIsImNhY2hlLWxvcmQiXSwiZGlzcHV0ZSI6WyJyZXNlYXJjaCIsIkRFTklFRCJdLCJub3RlIjoiaWNlYmVyZy4wIiwibGFzdCI6IjAzOjQwIn0";

const hashOf = (url: string) => url.slice(url.indexOf("#"));
const catalog = (lang: string) =>
  JSON.parse(
    readFileSync(new URL(`../i18n/${lang}.json`, import.meta.url), "utf8"),
  ) as Catalog;
const LANGS = ["en", "ru"];

describe.each(LANGS)("share links on /%s", (lang) => {
  const notes = catalog(lang).notes;

  it("decodes the frozen v1 link", () => {
    const p = readShare(hashOf(FROZEN_V1));
    expect(p).not.toBeNull();
    const view = shareView(p!, lang, notes);
    expect(view.tokens).toBe(1_183_456_000);
    expect(view.stamps).toEqual(["ACT OF GOD", "DENIED"]);
    expect(view.achievements).toEqual(["ONE LAST FIX", "CACHE LORD"]);
    expect(view.note?.lang).toBe(lang);
    expect(view.note?.text).toMatch(/Gatsby|Гэтсби/);
    expect(view.days).toBe(30);
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
    const view = shareView(readShare(hashOf(url))!, lang, notes);
    const html = receiptPaper(view);
    expect(html).not.toMatch(/<img|<script|<svg\/|pwned|onerror/);
    expect(view.stamps).toEqual(["ACT OF GOD"]);
    expect(view.note).toBeUndefined();
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

  it("fall back to English when the language has no note for the id", () => {
    expect(shareNote(p, "ru", {})).toEqual({
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
