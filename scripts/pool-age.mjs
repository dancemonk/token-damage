#!/usr/bin/env node
// Pool age: warns when the news in the rotating pool (docs/ROASTS.md §The pool) is getting stale, and when a
// language is missing lines the English pool has. Run before a release; refresh the pool monthly.
// Usage: pnpm pool:age [--as-of YYYY-MM]
// Always exits 0: it's a reminder, not a gate (a date-based failure would break unrelated builds).
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { POOL_EN, freshNews } = await import(
  pathToFileURL(join(ROOT, "packages/core/dist/index.js")).href
);
const { values } = parseArgs({ options: { "as-of": { type: "string" } } });
const asOf = values["as-of"] ?? new Date().toISOString().slice(0, 7);

/** How many news lines are dated within `months` before `asOf` (freshNews without the fallback). */
const within = (months) =>
  freshNews(POOL_EN, asOf, { months, min: 0 }).filter((l) => l.kind === "news")
    .length;

const news = POOL_EN.filter((l) => l.kind === "news");
const latest = news
  .map((l) => l.source?.date ?? "-")
  .filter((d) => d !== "-")
  .sort()
  .at(-1);
const six = within(6);
const twelve = within(12);
const warnings = [];
if (six < 8)
  warnings.push(
    `only ${six} news lines from the last 6 months (want 8+): add this month's`,
  );
if (twelve < 6)
  warnings.push(
    `only ${twelve} from the last 12 months: the site and CLI fall back to all ${news.length}, old ones included`,
  );

const onSite = (l) =>
  !l.band && [...l.text.matchAll(/\{(\w+)\}/g)].every((m) => m[1] === "share");
const I18N = join(ROOT, "apps/web/i18n");
for (const file of readdirSync(I18N).filter((f) => f !== "en.json")) {
  const pool = JSON.parse(readFileSync(join(I18N, file), "utf8")).pool ?? [];
  const have = new Set(pool.map((l) => l.id));
  // CLI-only lines (receipt slots, bands) never reach the site, so no other language needs them.
  const missing = POOL_EN.filter((l) => onSite(l) && !have.has(l.id)).map(
    (l) => l.id,
  );
  if (missing.length)
    warnings.push(`${file}: no line yet for ${missing.join(", ")}`);
}

console.log(
  `pool as of ${asOf}: ${POOL_EN.length} English lines, ${news.length} news, newest ${latest}; ` +
    `${six} news in the last 6 months, ${twelve} in 12`,
);
for (const w of warnings) console.log(`  ! ${w}`);
if (!warnings.length) console.log("  ✓ fresh enough");
