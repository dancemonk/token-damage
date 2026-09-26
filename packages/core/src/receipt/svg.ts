import { formatRange, formatUsd, sig2 } from "../metrics/format.js";
import { WORLD_CHECK } from "../metrics/world.js";
import { AGENT_NAMES, type Receipt } from "./model.js";

// Layout of the share card mockup, reproduced box by box: a 1080×1920 card, an 800 px paper strip
// with 56 px side padding. IBM Plex Mono is monospaced (0.6 em per character), so widths are exact.
const W = 1080;
const H = 1920;
const PAPER = 800;
const PAD_X = 56;
const INNER = PAPER - 2 * PAD_X;
const X0 = (W - PAPER) / 2 + PAD_X;
const CX = W / 2;
const MONO = "IBM Plex Mono";
const STAMP = "Special Elite";
const C = {
  bg: "#161514",
  paper: "#f3efe6",
  ink: "#1f1d1a",
  logo: "#17160f",
  muted: "#6b665c",
  ochre: "#7a5a12",
  red: "#b3261e",
  gray: "#8c8578",
  dots: "#b9b2a3",
};
// Plex Mono ascent/descent (1025/275 per 1000); baseline sits at half the line box plus (asc − desc) / 2.
const baseline = (top: number, size: number, lineHeight = 1.3) =>
  top + (lineHeight * size) / 2 + 0.375 * size;
// Special Elite advance widths (em) for the damage-class names, read from the font's hmtx table.
const ELITE: Record<string, number> = {
  A: 0.5498,
  B: 0.604,
  C: 0.5791,
  D: 0.6226,
  E: 0.6387,
  F: 0.6055,
  G: 0.6152,
  H: 0.6528,
  I: 0.4951,
  J: 0.541,
  K: 0.5825,
  L: 0.6025,
  M: 0.6978,
  N: 0.6279,
  O: 0.6167,
  P: 0.5532,
  Q: 0.6021,
  R: 0.6367,
  S: 0.5889,
  T: 0.5942,
  U: 0.6216,
  V: 0.6113,
  W: 0.6436,
  X: 0.582,
  Y: 0.561,
  Z: 0.5923,
  " ": 0.293,
};
// Decorative barcode from the mockup: pairs of bar width and gap, in px.
const BARCODE =
  "32442222342422234222232422642224422222332424346224242324622222442333233322622434436334222323234262243363232322336422643424436363";
const LOGO =
  "M7 27V11L9 9L11 11L13 9L14 10Q15 4 16 2Q17 6 19 6Q20 5 21 4Q22 8 24 9L25 11V27L24 29L23 27L22 29L21 27L20 29L19 27L18 29L17 27L16 29L15 27L14 29L13 27L12 29L11 27L10 29L9 27L8 29ZM10 15H22V16.5H10ZM10 19H22V20.5H10ZM10 23H17V24.5H10Z";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
const monthDay = (day: string) =>
  `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
const n = (x: number) => Math.round(x).toLocaleString("en-US");
const pct1 = (share: number) => `${(share * 100).toFixed(1)}%`;

interface TextOpts {
  size: number;
  weight?: 400 | 700;
  color?: string;
  anchor?: "start" | "middle" | "end";
  spacing?: number;
  italic?: boolean;
  family?: string;
}

function text(x: number, y: number, content: string, o: TextOpts): string {
  const attrs = [
    `x="${x}"`,
    `y="${y.toFixed(2)}"`,
    `font-family="${o.family ?? MONO}"`,
    `font-size="${o.size}"`,
    o.weight === 700 ? `font-weight="700"` : "",
    o.italic ? `font-style="italic"` : "",
    `fill="${o.color ?? C.ink}"`,
    o.anchor && o.anchor !== "start" ? `text-anchor="${o.anchor}"` : "",
    o.spacing ? `letter-spacing="${o.spacing}"` : "",
  ];
  return `<text ${attrs.filter(Boolean).join(" ")}>${content}</text>`;
}

// IBM Plex Mono has no ≡ or ✶, and resvg does not fall back to system fonts: draw both in their character cell.
function symbol(
  ch: string,
  x: number,
  baselineY: number,
  size: number,
  color: string,
): string {
  if (ch === "≡") {
    return [0.41, 0.25, 0.09]
      .map(
        (up) =>
          `<rect x="${(x + 0.08 * size).toFixed(2)}" y="${(baselineY - up * size - 0.03 * size).toFixed(2)}" width="${(0.44 * size).toFixed(2)}" height="${(0.06 * size).toFixed(2)}" fill="${color}"/>`,
      )
      .join("");
  }
  const [cx, cy] = [x + 0.3 * size, baselineY - 0.33 * size];
  const points = Array.from({ length: 12 }, (_, i) => {
    const r = (i % 2 === 0 ? 0.31 : 0.13) * size;
    const a = -Math.PI / 2 + (i * Math.PI) / 6;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  });
  return `<polygon points="${points.join(" ")}" fill="${color}"/>`;
}

interface Run {
  text: string;
  color?: string;
  weight?: 400 | 700;
}

/** Monospaced runs laid out by hand, so colours can change mid-line and ≡ / ✶ can be drawn. */
function runs(
  x0: number,
  y: number,
  segments: Run[],
  size: number,
  anchor: "start" | "middle" | "end" = "start",
): string {
  const cell = 0.6 * size;
  const length = segments.reduce((sum, seg) => sum + [...seg.text].length, 0);
  let x =
    anchor === "middle"
      ? x0 - (length * cell) / 2
      : anchor === "end"
        ? x0 - length * cell
        : x0;
  const out: string[] = [];
  for (const seg of segments) {
    const color = seg.color ?? C.ink;
    let buffer = "";
    let start = x;
    const flush = () => {
      const lead = buffer.length - buffer.trimStart().length;
      if (buffer.trim())
        out.push(
          text(start + lead * cell, y, esc(buffer.trim()), {
            size,
            color,
            weight: seg.weight,
          }),
        );
      buffer = "";
    };
    for (const ch of seg.text) {
      if (ch === "≡" || ch === "✶") {
        flush();
        out.push(symbol(ch, x, y, size, color));
      } else {
        if (!buffer) start = x;
        buffer += ch;
      }
      x += cell;
    }
    flush();
  }
  return out.join("");
}

/** One significant figure: 0.00165 → "0.002", 0.0113 → "0.01". */
const sig1 = (x: number) =>
  x > 0 ? x.toFixed(Math.max(0, -Math.floor(Math.log10(x)))) : "0";

function wrap(words: string, perLine: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of words.split(" ")) {
    if (line && line.length + 1 + word.length > perLine) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  return line ? [...lines, line] : lines;
}

function statementPeriod(p: Receipt["period"]): string {
  const [sy, ey] = [p.start.slice(0, 4), p.end.slice(0, 4)];
  return sy === ey
    ? `${monthDay(p.start)} – ${monthDay(p.end)}, ${ey}`
    : `${monthDay(p.start)}, ${sy} – ${monthDay(p.end)}, ${ey}`;
}

// The card has no BY AGENT block, so it names the agents unless Claude Code is the only one.
// The only retention setting we read is Claude Code's, so the note is about Claude Code alone.
function kept(r: Receipt): string {
  const { days, retentionDays } = r.period;
  const agents = r.byAgent.map((a) => AGENT_NAMES[a.agent]);
  const claude = r.byAgent.some((a) => a.agent === "claude-code");
  const retention =
    days <= retentionDays
      ? "all Claude Code kept"
      : `Claude Code kept the last ${retentionDays}`;
  if (claude && agents.length === 1) return `${days} days — ${retention}`;
  return `${days} days — ${agents.join(" + ")}${claude ? ` · ${retention}` : ""}`;
}

/** The 1080×1920 share card. Pure: same receipt, same SVG. */
/** 2: progress and achievements, 1: progress only, 0: neither (receiptSvg picks the richest that fits). */
function draw(r: Receipt, level: 0 | 1 | 2): { svg: string; top: number } {
  const progress = level >= 1;
  const body: string[] = [];
  let y = 0;
  const rule = () => {
    y += 22;
    body.push(
      `<line x1="${X0}" y1="${y + 1}" x2="${X0 + INNER}" y2="${y + 1}" stroke="${C.ink}" stroke-width="2" stroke-dasharray="6 6"/>`,
    );
    y += 2 + 22;
  };
  const centered = (content: string, o: TextOpts, lineHeight = 1.3) => {
    body.push(
      text(CX, baseline(y, o.size, lineHeight), content, {
        ...o,
        anchor: "middle",
      }),
    );
    y += lineHeight * o.size;
  };
  const label = (content: string, right?: string) => {
    body.push(
      text(X0, baseline(y, 15), content, {
        size: 15,
        color: C.muted,
        spacing: 3,
      }),
    );
    if (right)
      body.push(
        text(X0 + INNER, baseline(y, 15), right, {
          size: 15,
          color: C.muted,
          spacing: 3,
          anchor: "end",
        }),
      );
    y += 1.3 * 15;
  };

  // Header
  body.push(
    `<path transform="translate(${CX - 28} ${y}) scale(1.75)" d="${LOGO}" fill="${C.logo}" fill-rule="evenodd"/>`,
  );
  y += 56 + 6;
  centered("TOKEN DAMAGE", { size: 60, weight: 700, spacing: 6 }, 1.05);
  y += 6;
  centered("CUSTOMER COPY", { size: 18, color: C.muted, spacing: 5.4 });
  y += 6;
  centered(esc(`STATEMENT · ${statementPeriod(r.period)}`), { size: 18 });
  y += 6;
  centered(kept(r), { size: 15, color: C.muted });
  rule();

  // Hero number
  const m = r.measured;
  const all = m.tokensRead.value + m.tokensWritten.value;
  centered(n(all), { size: 84, weight: 700, spacing: -1.68 }, 1.05);
  y += 6;
  centered("TOKENS PROCESSED BY YOUR AGENTS", {
    size: 19,
    color: C.muted,
    spacing: 2.66,
  });
  y += 6 + 8;
  centered(`You typed ${n(m.words.value)} words.`, { size: 25, weight: 700 });
  rule();

  // Who did the reading
  label("WHO DID THE READING");
  y += 14;
  const inner = INNER - 4;
  const shares = [
    [m.cacheReadShare.value, C.ink],
    [m.freshShare.value, C.gray],
    // Paper, not red: red is for the stamp and the satire, never a fact (docs/DESIGN.md).
    [m.outputShare.value, C.paper],
  ] as const;
  let bx = X0 + 2;
  for (const [share, color] of shares) {
    const w = inner * share;
    body.push(
      `<rect x="${bx.toFixed(2)}" y="${y + 2}" width="${w.toFixed(2)}" height="40" fill="${color}"/>`,
    );
    bx += w;
  }
  body.push(
    `<rect x="${X0 + 1}" y="${y + 1}" width="${INNER - 2}" height="42" fill="none" stroke="${C.ink}" stroke-width="2"/>`,
  );
  body.push(
    `<rect x="${X0 + INNER - 2}" y="${y - 10}" width="2" height="64" fill="${C.ochre}"/>`,
  );
  y += 44 + 14;
  const typing = r.estimated.typingShare;
  const legend: [string, string, boolean][] = [
    [`agents re-reading notes · ${pct1(m.cacheReadShare.value)}`, C.ink, false],
    [`fresh context · ${pct1(m.freshShare.value)}`, C.gray, false],
    [`agents writing · ${pct1(m.outputShare.value)}`, C.paper, false],
    [`you typing · ~${sig1(typing.value * 100)}%*`, C.ochre, true],
  ];
  const colW = (INNER - 24) / 2;
  legend.forEach(([content, color, line], i) => {
    const cx = X0 + (i % 2) * (colW + 24);
    const top = y + Math.floor(i / 2) * (22.1 + 8);
    body.push(
      line
        ? `<rect x="${cx}" y="${(top + 2.05).toFixed(2)}" width="3" height="18" fill="${color}"/>`
        : color === C.paper
          ? `<rect x="${cx + 1}" y="${(top + 4.05).toFixed(2)}" width="14" height="14" fill="${color}" stroke="${C.ink}" stroke-width="2"/>`
          : `<rect x="${cx}" y="${(top + 3.05).toFixed(2)}" width="16" height="16" fill="${color}"/>`,
    );
    body.push(
      text(cx + (line ? 3 : 16) + 10, baseline(top, 17), esc(content), {
        size: 17,
        color: line ? C.ochre : C.ink,
      }),
    );
  });
  y += 2 * 22.1 + 8 + 14;
  const px = sig1(inner * typing.value);
  body.push(
    text(
      X0,
      baseline(y, 13),
      `*drawn as a line so it's visible. to scale, you'd be ${px} px wide.`,
      { size: 13, color: C.muted },
    ),
  );
  y += 1.3 * 13;
  rule();

  // Leaders
  const rows: {
    label: string;
    value: string;
    mark?: "≡" | "≈";
    weight?: 400 | 700;
  }[] = [
    {
      label: "LIST-PRICE VALUE",
      value: `${formatUsd(r.priced.listPrice)}${r.priced.partlyPriced ? "+" : ""}`,
      mark: "≡",
    },
  ];
  if (r.priced.plan) {
    rows.push({
      label: "YOUR PLAN",
      value: `$${r.priced.plan.usd}/mo · ${r.priced.plan.multiple.value.toFixed(1)}× extracted`,
    });
  }
  const cmp = r.estimated.comparison;
  rows.push(
    {
      label: "CACHE SAVED YOU",
      value: formatUsd(r.priced.cacheSaved),
      mark: "≡",
    },
    {
      label: "ELECTRICITY",
      value: formatRange(r.estimated.electricityKwh, "kWh"),
      mark: "≈",
    },
    cmp.kind === "fridge-months"
      ? {
          label: "a fridge running for",
          value: `${cmp.value.low}–${cmp.value.high} months`,
          mark: "≈",
          weight: 400,
        }
      : {
          label: "phone charges",
          value: `${sig2(cmp.value.low ?? 0)}–${sig2(cmp.value.high ?? 0)}`,
          mark: "≈",
          weight: 400,
        },
  );
  if (m.latestCall)
    rows.push({ label: "LATEST CALL", value: m.latestCall.value });
  rows.push({
    label: "INTERNS HIRED (SUBAGENTS)",
    value: n(m.subagents.value),
  });
  rows.forEach((row, i) => {
    if (i > 0) y += 9;
    const color = row.mark === "≈" ? C.ochre : C.ink;
    const b = baseline(y, 21);
    const left = `${row.mark ? `${row.mark} ` : ""}${row.label}`;
    const leftEnd = X0 + left.length * 12.6;
    const valueStart = X0 + INNER - row.value.length * 12.6;
    body.push(runs(X0, b, [{ text: left, color }], 21));
    body.push(
      text(X0 + INNER, b, esc(row.value), {
        size: 21,
        color,
        weight: row.weight ?? 700,
        anchor: "end",
      }),
    );
    body.push(
      `<line x1="${(leftEnd + 10).toFixed(2)}" y1="${(b - 6).toFixed(2)}" x2="${(valueStart - 10).toFixed(2)}" y2="${(b - 6).toFixed(2)}" stroke="${C.dots}" stroke-width="2" stroke-dasharray="2 2"/>`,
    );
    y += 1.3 * 21;
  });
  rule();

  // Damage class stamp
  y += 8;
  body.push(
    text(CX, baseline(y, 15), "DAMAGE CLASS", {
      size: 15,
      color: C.muted,
      spacing: 3,
      anchor: "middle",
    }),
  );
  y += 1.3 * 15 + 12;
  const name = r.damageClass.name;
  const textW = [...name].reduce(
    (s, ch) => s + (ELITE[ch] ?? 0.6) * 64 + 0.04 * 64,
    0,
  );
  const boxW = textW + 2 * 26 + 12;
  const boxH = 64 + 14 + 10 + 12;
  const sx = CX - boxW / 2;
  body.push(
    `<g transform="rotate(-5 ${CX} ${y + boxH / 2})" opacity="0.92">`,
    `<rect x="${sx + 1}" y="${y + 1}" width="${boxW - 2}" height="${boxH - 2}" fill="none" stroke="${C.red}" stroke-width="2"/>`,
    `<rect x="${sx + 5}" y="${y + 5}" width="${boxW - 10}" height="${boxH - 10}" fill="none" stroke="${C.red}" stroke-width="2"/>`,
    text(CX, y + 6 + 14 + 32 + 0.203 * 64, esc(name), {
      size: 64,
      color: C.red,
      family: STAMP,
      spacing: 2.56,
      anchor: "middle",
    }),
    `</g>`,
  );
  y += boxH + 8 + 22;

  if (progress) {
    // Class progress: ink filling a dotted leader, rounded down, never red (docs/DESIGN.md §Terminal).
    const dc = r.damageClass;
    const to = dc.next
      ? `${Math.floor(dc.progress * 100)}% to ${dc.next.name}`
      : "top of the scale";
    const trackW = INNER - to.length * 0.6 * 19 - 16;
    const track = y + 16;
    body.push(
      `<line x1="${X0}" y1="${track}" x2="${(X0 + trackW).toFixed(2)}" y2="${track}" stroke="${C.dots}" stroke-width="2" stroke-dasharray="2 4"/>`,
    );
    if (dc.progress > 0)
      body.push(
        `<rect class="progress" x="${X0}" y="${track - 11}" width="${Math.max(3, (Math.floor(dc.progress * 100) / 100) * trackW).toFixed(2)}" height="10" fill="${C.ink}"/>`,
      );
    body.push(
      text(X0 + INNER, baseline(y, 19), esc(to), {
        size: 19,
        color: C.ink,
        anchor: "end",
      }),
    );
    y += 1.3 * 19 + 22;
  }

  // Achievements: the names in one compact row, wrapped when many; the reasons live on the terminal receipt.
  if (level >= 2 && r.achievements.length > 0) {
    const labelW = "ACHIEVEMENTS".length * (0.6 * 15 + 3) + 18;
    const perLine = Math.floor((INNER - labelW) / (0.6 * 17));
    const lines = wrap(r.achievements.map((a) => a.name).join(" · "), perLine);
    body.push(
      text(X0, baseline(y, 17), "ACHIEVEMENTS", {
        size: 15,
        color: C.muted,
        spacing: 3,
      }),
    );
    for (const line of lines) {
      body.push(
        text(X0 + labelW, baseline(y, 17), esc(line), {
          size: 17,
          weight: 700,
        }),
      );
      y += 1.3 * 17;
    }
    y += 16;
  }

  // Adjuster's note
  if (r.note) {
    label("ADJUSTER'S NOTE");
    y += 8;
    for (const line of wrap(r.note.text, Math.floor(INNER / (23 * 0.6)))) {
      body.push(
        text(X0, baseline(y, 23, 1.42), esc(line), { size: 23, italic: true }),
      );
      y += 1.42 * 23;
    }
  }
  rule();

  // World check and satire
  label("WORLD CHECK", `AS OF ${WORLD_CHECK.asOf}`);
  y += 10;
  const perLine = Math.floor(INNER / (21 * 0.6));
  const boldChars = WORLD_CHECK.headline.length;
  let seen = 0;
  for (const line of wrap(
    `${WORLD_CHECK.headline} ${WORLD_CHECK.body}`,
    perLine,
  )) {
    const cut = Math.max(0, Math.min(line.length, boldChars - seen));
    const spans = [
      cut > 0
        ? `<tspan font-weight="700">${esc(line.slice(0, cut))}</tspan>`
        : "",
      cut < line.length ? `<tspan>${esc(line.slice(cut))}</tspan>` : "",
    ].join("");
    body.push(text(X0, baseline(y, 21, 1.45), spans, { size: 21 }));
    seen += line.length + 1;
    y += 1.45 * 21;
  }
  y += 10;
  body.push(
    text(X0, baseline(y, 13), esc(WORLD_CHECK.source), {
      size: 13,
      color: C.muted,
    }),
  );
  y += 1.3 * 13 + 10 + 6;
  body.push(
    runs(
      X0,
      baseline(y, 20),
      [{ text: "✶ YOUR SHARE OF THIS", color: C.red }],
      20,
    ),
  );
  body.push(
    text(
      X0 + INNER,
      baseline(y, 20),
      `+$${sig2(r.satire.ramX.value)} / stick`,
      { size: 20, color: C.red, weight: 700, anchor: "end" },
    ),
  );
  y += 1.3 * 20 + 10;
  body.push(
    runs(
      X0,
      baseline(y, 16),
      [{ text: WORLD_CHECK.satireNote, color: C.red }],
      16,
    ),
  );
  y += 1.3 * 16;
  rule();

  // Legend and method
  body.push(
    runs(
      CX,
      baseline(y, 14),
      [
        { text: "plain = measured · ≡ list-price equiv. · ", color: C.muted },
        { text: "≈ estimate (range)", color: C.ochre },
        { text: " · ", color: C.muted },
        { text: "✶ satire", color: C.red },
      ],
      14,
      "middle",
    ),
  );
  y += 1.3 * 14 + 4;
  centered(
    `method ${r.method.version} · prices as of ${r.method.pricesAsOf} · npx token-damage`,
    { size: 14, color: C.muted },
  );
  y += 18;
  const bars = BARCODE.match(/../g) ?? [];
  const barW = bars.reduce((s, p) => s + Number(p[0]) + Number(p[1]), 0);
  let x = CX - barW / 2;
  for (const p of bars) {
    body.push(
      `<rect x="${x}" y="${y}" width="${p[0]}" height="56" fill="${C.ink}"/>`,
    );
    x += Number(p[0]) + Number(p[1]);
  }
  y += 56;

  // Paper: content height plus padding, centred on the canvas, zigzag top and bottom.
  const paperH = 44 + y + 48;
  const cardH = 14 + paperH + 14;
  const top = (H - cardH) / 2;
  const left = (W - PAPER) / 2;
  const teeth = (edge: number, dir: 1 | -1) => {
    let d = `M${left} ${edge}`;
    for (let tx = left; tx < left + PAPER; tx += 24)
      d += `L${tx + 12} ${edge - dir * 12}L${Math.min(tx + 24, left + PAPER)} ${edge}`;
    return `<path d="${d}Z" fill="${C.paper}"/>`;
  };
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<defs><filter id="shadow" x="-20%" y="-10%" width="140%" height="130%"><feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000" flood-opacity="0.45"/></filter></defs>`,
    `<rect width="${W}" height="${H}" fill="${C.bg}"/>`,
    `<g filter="url(#shadow)">`,
    teeth(top + 14, 1),
    `<rect x="${left}" y="${top + 14}" width="${PAPER}" height="${paperH}" fill="${C.paper}"/>`,
    teeth(top + 14 + paperH, -1),
    `</g>`,
    `<g transform="translate(0 ${top + 14 + 44})">`,
    ...body,
    `</g>`,
    `</svg>`,
  ].join("\n");
  return { svg, top };
}

/**
 * The share card. When a long note would leave under 16 px of canvas, the achievements go first, then the
 * class-progress row.
 */
export function receiptSvg(r: Receipt): string {
  for (const level of [2, 1] as const) {
    const card = draw(r, level);
    if (card.top >= 16) return card.svg;
  }
  return draw(r, 0).svg;
}
