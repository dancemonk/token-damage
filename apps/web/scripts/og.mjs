// Link-preview images, 1200×630, one pair per language: the site and /r ("Guess my AI damage.").
// Previews can't show a friend's numbers (they live in the fragment), so the /r card hides the number.
//   node scripts/og.mjs --langs en,ru      → public/og/<lang>.png, public/og/<lang>-r.png
// Uses the CLI's renderer and bundled fonts, so the site build itself stays dependency-free.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = resolve(ROOT, "../../packages/cli");
const { Resvg } = createRequire(join(CLI, "package.json"))("@resvg/resvg-js");
const FONTS = [
  "IBMPlexMono-Regular.ttf",
  "IBMPlexMono-Bold.ttf",
  "IBMPlexMono-Italic.ttf",
  "SpecialElite-Regular.ttf",
].map((f) => join(CLI, "assets/fonts", f));

const { values } = parseArgs({ options: { langs: { type: "string" } } });
const LANGS = (values.langs ?? "en").split(",");
const fixed = JSON.parse(readFileSync(join(ROOT, "src/fixed.json"), "utf8"));
const load = (lang) =>
  JSON.parse(readFileSync(join(ROOT, `i18n/${lang}.json`), "utf8"));
const en = load("en");

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Greedy word wrap for a monospace face: `max` characters per line. */
function wrap(text, max) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && (line + " " + word).length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  return [...lines, line];
}

/**
 * Monospace text with ≡ and ✶ drawn as shapes: the bundled IBM Plex Mono lacks both and resvg does not
 * fall back (same approach as core's receipt/svg.ts). Plex Mono advances 0.6 em per character.
 */
function mono(
  x,
  y,
  size,
  text,
  color,
  { anchor = "start", weight = 400 } = {},
) {
  const cell = 0.6 * size;
  const width = [...text].length * cell;
  let cx =
    anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
  const out = [];
  let run = "";
  let runX = cx;
  const flush = () => {
    if (run)
      out.push(
        `<text x="${runX.toFixed(1)}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" xml:space="preserve">${esc(run)}</text>`,
      );
    run = "";
  };
  for (const ch of text) {
    if (ch === "≡") {
      flush();
      for (const up of [0.41, 0.25, 0.09])
        out.push(
          `<rect x="${(cx + 0.08 * size).toFixed(2)}" y="${(y - up * size - 0.03 * size).toFixed(2)}" width="${(0.44 * size).toFixed(2)}" height="${(0.06 * size).toFixed(2)}" fill="${color}"/>`,
        );
    } else if (ch === "✶") {
      flush();
      const [sx, sy] = [cx + 0.3 * size, y - 0.33 * size];
      const pts = Array.from({ length: 12 }, (_, i) => {
        const r = (i % 2 === 0 ? 0.31 : 0.13) * size;
        const a = -Math.PI / 2 + (i * Math.PI) / 6;
        return `${(sx + r * Math.cos(a)).toFixed(2)},${(sy + r * Math.sin(a)).toFixed(2)}`;
      });
      out.push(`<polygon points="${pts.join(" ")}" fill="${color}"/>`);
    } else {
      if (!run) runX = cx;
      run += ch;
    }
    cx += cell;
  }
  flush();
  return out.join("");
}

/** Receipt labels and figures for one language, as the site prints them (receipt.*, page locale). */
function receiptFor(own) {
  const s = (k) => own.strings[k] ?? en.strings[k];
  const plural = (k, n) => {
    const m = s(k);
    return typeof m === "string"
      ? m
      : (m[new Intl.PluralRules(own.meta.locale).select(n)] ?? m.other);
  };
  const c = fixed.samples[0];
  const nf = (o = {}) => new Intl.NumberFormat(own.meta.locale, o);
  const usd = (x) =>
    nf({ style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(
      x,
    );
  const R = Object.fromEntries(
    Object.keys(en.strings)
      .filter((k) => k.startsWith("receipt."))
      .map((k) => [k.slice(8), s(k)]),
  );
  R.words = plural("receipt.words", c.words);
  R.days = plural("receipt.days", 30);
  return {
    R,
    c: {
      words: nf().format(c.words),
      tokens: nf().format(c.tokens),
      price: usd(c.price),
      saved: usd(c.saved),
      kwh: `${nf().format(c.kwh[0])}–${nf().format(c.kwh[1])} ${s("receipt.kwh")}`,
      ram: `+${nf({ style: "currency", currency: "USD", maximumSignificantDigits: 2 }).format(c.ram)}`,
      stamp: s(`class.${c.class}`),
    },
    // Special Elite has no Cyrillic, and the renderer only knows the CLI's fonts.
    stampFace: own.meta.lang === "en" ? "Special Elite" : "IBM Plex Mono",
  };
}

function card({ headline, note, hidden, receipt }) {
  const { R, c, stampFace } = receipt;
  const INK = "#17160f";
  const MUTED = "#6d685e";
  const x0 = 680;
  const x1 = 1080;
  const mid = (x0 + x1) / 2;
  const t = (x, y, size, text, extra = "") =>
    `<text x="${x}" y="${y}" font-size="${size}" ${extra}>${esc(text)}</text>`;
  const dash = (y) =>
    `<line x1="${x0 + 24}" x2="${x1 - 24}" y1="${y}" y2="${y}" stroke="${INK}" stroke-width="2" stroke-dasharray="6 5"/>`;
  // On the /r card every figure is redacted: a preview must never show numbers that look like a friend's.
  const row = (y, label, value, color) =>
    mono(x0 + 26, y, 13.5, label, color) +
    (hidden
      ? `<rect x="${x1 - 26 - value.length * 8.1}" y="${y - 11}" width="${value.length * 8.1}" height="14" fill="${color}"/>`
      : t(
          x1 - 26,
          y,
          13.5,
          value,
          `fill="${color}" font-weight="700" text-anchor="end"`,
        ));
  const lines = wrap(headline, 19);
  const noteLines = note.split("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="IBM Plex Mono">
<defs>
<radialGradient id="glow" cx="0.72" cy="-0.08" r="0.8"><stop offset="0" stop-color="#ffeed2" stop-opacity="0.13"/><stop offset="0.62" stop-color="#ffeed2" stop-opacity="0"/></radialGradient>
<pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="14" cy="14" r="1.1" fill="#21201d"/></pattern>
<linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f9f6ee"/><stop offset="1" stop-color="#f3efe4"/></linearGradient>
</defs>
<rect width="1200" height="630" fill="#0e0e0d"/>
<rect width="1200" height="630" fill="url(#dots)"/>
<rect width="1200" height="630" fill="url(#glow)"/>
<rect x="${x0 - 40}" y="34" width="${x1 - x0 + 80}" height="36" rx="18" fill="#171614"/>
<rect x="${x0 - 18}" y="41" width="${x1 - x0 + 36}" height="22" rx="11" fill="#060606"/>
<circle cx="${x1 + 29}" cy="52" r="3.5" fill="#3fbf6b"/>
<rect x="${x0 + 8}" y="84" width="${x1 - x0}" height="560" fill="#000" opacity="0.45"/>
<rect x="${x0}" y="60" width="${x1 - x0}" height="580" fill="url(#paper)"/>
<g fill="${INK}">
${t(mid, 118, 22, fixed.brand, `font-weight="700" letter-spacing="3" text-anchor="middle"`)}
${t(mid, 144, 10.5, R.store, `fill="${MUTED}" text-anchor="middle"`)}
${dash(166)}
${
  hidden
    ? mono(mid - 60, 198, 12, `${R.typed}`, MUTED, { anchor: "end" }) +
      `<rect x="${mid - 48}" y="187" width="96" height="14" fill="${INK}"/>` +
      mono(mid + 60, 198, 12, R.words, MUTED)
    : t(
        mid,
        198,
        12,
        `${R.typed} ${c.words} ${R.words}`,
        `fill="${MUTED}" letter-spacing="1.4" text-anchor="middle"`,
      )
}
${
  hidden
    ? `<rect x="${mid - 150}" y="214" width="300" height="46" fill="${INK}"/>`
    : t(
        mid,
        256,
        44,
        c.tokens,
        `font-weight="700" letter-spacing="-1" text-anchor="middle"`,
      )
}
${t(mid, 284, 10.5, `${R.tokensRead} · 30 ${R.days}`, `fill="${MUTED}" letter-spacing="1.8" text-anchor="middle"`)}
${dash(304)}
${row(334, R.price, c.price, INK)}
${row(362, R.saved, c.saved, INK)}
${row(390, R.electricity, c.kwh, "#7a5a12")}
${row(418, R.ram, c.ram, "#b3261e")}
${dash(440)}
${noteLines.map((l, i) => t(x0 + 26, 470 + i * 22, 15, l, `font-style="italic"`)).join("\n")}
${
  hidden
    ? ""
    : `<g transform="translate(${x1 - 112} 530) rotate(-7)" fill="none" stroke="#e0331b" opacity="0.92">
<rect x="-86" y="-24" width="172" height="44" stroke-width="1.6"/><rect x="-81" y="-19" width="162" height="34" stroke-width="1.6"/>
<text x="0" y="8" font-family="${stampFace}" font-weight="700" font-size="${stampFace === "Special Elite" ? 23 : 17}" fill="#e0331b" stroke="none" text-anchor="middle">${esc(c.stamp)}</text>
</g>`
}
${dash(572)}
${mono(mid, 598, 9.5, `${R.legendPriced} · ${R.legendEstimate} · ${R.legendSatire}`, MUTED, { anchor: "middle" })}
</g>
<g fill="#f6f2e9">
${lines.map((l, i) => t(64, 176 + i * 58, 46, l, `font-weight="700"`)).join("\n")}
</g>
<rect x="64" y="${176 + lines.length * 58}" width="316" height="52" rx="26" fill="#f3efe4"/>
${t(90, 176 + lines.length * 58 + 34, 22, `$ ${fixed.command}`, `fill="${INK}" font-weight="700"`)}
${t(64, 590, 18, "tokendamage.com", `fill="#8f8a7f" letter-spacing="1"`)}
</svg>`;
}

const out = join(ROOT, "public/og");
mkdirSync(out, { recursive: true });
for (const lang of LANGS) {
  const own = load(lang);
  const s = (k) => own.strings[k] ?? en.strings[k];
  const note = own.notes["sample.0041"] ?? "";
  const receipt = receiptFor(own);
  for (const [name, headline, hidden] of [
    [lang, s("og.home"), false],
    [`${lang}-r`, s("r.meta.description"), true],
  ]) {
    const png = new Resvg(card({ headline, note, hidden, receipt }), {
      font: {
        fontFiles: FONTS,
        loadSystemFonts: false,
        defaultFontFamily: "IBM Plex Mono",
      },
      fitTo: { mode: "original" },
    })
      .render()
      .asPng();
    writeFileSync(join(out, `${name}.png`), png);
    console.log(`og/${name}.png ${Math.round(png.length / 1024)} KB`);
  }
}
