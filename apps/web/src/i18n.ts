/** A string, or plural forms keyed by `Intl.PluralRules` category. */
export type Message = string | Partial<Record<Intl.LDMLPluralRule, string>>;

export interface Catalog {
  meta: { lang: string; locale: string; name: string };
  strings: Record<string, Message>;
  /** Adjuster's notes and satire lines; a language falls back to English key by key. */
  notes: Record<string, string>;
  /** Saint Petersburg asides for the home page's sample receipts; optional per language (docs/I18N.md). */
  asides?: Record<string, string>;
}

/** Fills `{name}` slots. An unknown slot stays visible, so a bad template shows up in review. */
export function fill(
  template: string,
  vars: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (all, name: string) =>
    name in vars ? String(vars[name]) : all,
  );
}

export function pick(message: Message, locale: string, count = 0): string {
  if (typeof message === "string") return message;
  const category = new Intl.PluralRules(locale).select(count);
  return message[category] ?? message.other ?? "";
}

export type T = (
  key: string,
  vars?: Record<string, string | number>,
  count?: number,
) => string;

export function translator(catalog: Pick<Catalog, "meta" | "strings">): T {
  return (key, vars = {}, count) => {
    const message = catalog.strings[key];
    if (message === undefined) throw new Error(`no i18n key "${key}"`);
    return fill(pick(message, catalog.meta.locale, count), vars);
  };
}

/** The catalog subset the build inlined into this page as `<script type="application/json" id="i18n">`. */
export function pageCatalog(): Catalog {
  const el = document.getElementById("i18n");
  return JSON.parse(el?.textContent ?? "{}") as Catalog;
}
