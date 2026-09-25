import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { translator, type Catalog } from "../src/i18n.js";
import {
  cashiers,
  pickCashier,
  receiptPaper,
  sampleView,
} from "../src/receipt.js";

const catalog = (lang: string) =>
  JSON.parse(
    readFileSync(new URL(`../i18n/${lang}.json`, import.meta.url), "utf8"),
  ) as Catalog;

// Who rings up the bills, in each language's own spelling.
const ON_DUTY: Record<string, string[]> = {
  en: ["ARTYOM", "DARIA"],
  ru: ["АРТЁМ", "ДАША"],
};

describe.each(Object.keys(ON_DUTY))("cashiers on /%s", (lang) => {
  const c = catalog(lang);
  const t = translator(c);
  const onDuty = ON_DUTY[lang]!;
  const view = sampleView(
    0,
    t,
    c.meta.locale,
    new Date(Date.UTC(2026, 8, 24, 12)),
    undefined,
  );
  const cashierOf = (html: string) =>
    /<span class="r-cashier">([^<]*)<\/span>/.exec(html)?.[1];

  it("lists who is on duty", () => {
    expect(cashiers(t)).toEqual(onDuty);
  });

  it("gives a bill that names nobody the first cashier (the build's first bill)", () => {
    expect(cashierOf(receiptPaper(view, t))).toBe(onDuty[0]);
  });

  it("prints the cashier a bill names, inside the store line", () => {
    const html = receiptPaper({ ...view, cashier: onDuty[1] }, t);
    expect(cashierOf(html)).toBe(onDuty[1]);
    expect(html).not.toContain("{cashier}");
  });

  it("picks any cashier at random", () => {
    expect(pickCashier(t, () => 0)).toBe(onDuty[0]);
    expect(pickCashier(t, () => 0.99)).toBe(onDuty[1]);
  });
});
