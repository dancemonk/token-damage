# Design system — one receipt, one red

Reference renderings: `design/canvas/Style.dc.html` (the style sheet), `WebHome.dc.html` / `WebMobile.dc.html`
(site), `ShareCard.dc.html` (PNG), `DailyLight.dc.html` / `DailyNight.dc.html` (daily slips), `Quiz.dc.html`,
`Icon.dc.html`. These are the mockup sources; lift CSS values from them directly. The hero interaction has a
working plain-HTML prototype: `design/prototype/hero-tear.html`.

## Type: two faces, no more
- **IBM Plex Mono** for everything (receipt, site, terminal, share cards). Weights 400/500/600/700, real italic,
  `font-variant-numeric: tabular-nums` on counting numbers.
- **Special Elite** for stamps only: always red, 4px double border, rotated −7°, opacity .92. Never for body text or buttons.

### Scale on paper (desktop receipt, 480 px wide)
| Role | Size / line / tracking / weight |
|---|---|
| Hero number | 50 / 1.0 / −0.03em / 700 |
| Wordmark | 20 / – / +0.14em / 700 |
| Line item | 13.5 / 1.4 / – / 400, value 700 |
| Adjuster's note | 15 / 1.45 / – / italic |
| Stamp | 24 Special Elite |
| Meta (store, cashier, time) | 10.5 / 1.5 / +0.18em / muted |
| Fine print / legend | 9.5 / – / +0.10em / muted |
Phone (358 px): 36 / 17 / 12 / 13 / 18 / 9.5 / 8.5. Site UI: nav 13, footer 12/11.

## Colour
| Token | Hex | Use |
|---|---|---|
| desk | `#0e0e0d` | site background (warm near-black, never pure black) + dot grid `#21201d` 1px / 28px + lamp glow `rgba(255,238,210,.11)` ellipse from top |
| paper | `#f9f6ee` → `#f3efe4` | receipt (slight gradient), stub, mark body |
| ink | `#17160f` | all text on paper; primary button at rest |
| red | `#e0331b` | flame, stamps, hover state. Never buttons at rest, never facts |
| red-text | `#b3261e` | `✶` satire lines on paper (contrast-safe) |
| ochre | `#7a5a12` | `≈` estimate lines on paper |
| muted-ink | `#6d685e` | meta and fine print on paper |
| muted-desk | `#7f7a6f` | meta on the desk |
| orange | `#ff8a4c` | inner flame tongue only, 48px+ |
| led green / amber | `#3fbf6b` / `#e5ad55` | printer LED only |
Rule: if you reach for another colour, use more paper and more ink.

## Spacing and components
- Receipt: 480 wide (desktop), full width −32 (phone). Padding 26/30 (20/20 phone). Section gap 14. Row gap 9.
- Rules: 2px dashed ink. Leaders: 2px dotted `#c9c2b2`, 4px above baseline.
- Perforation row: 24px tall, 24px desk-coloured notches at both edges, dashed line, label `✂ TEAR HERE`
  on paper. Stub: 76px + 12px torn edge (68 + 12 phone). Label `YOUR COPY · PASTE IN TERMINAL`.
- Torn edges: sawtooth from two 45° gradients, 20px teeth. The perforation between the printer strip and the
  receipt uses **interlocking teeth**: strip bottom = teeth down; receipt top = teeth up with `background-position-x: 10px`
  (half-cell phase shift). At rest they read as one sheet with a faint dotted line; when pulled, the teeth separate.
- Buttons: ink pill, 44px tall, 22px radius; red on hover only. Every control ≥ 44px tall.
- Radius: none on paper; 18px printer; 22px pills. Shadow: one, on the paper
  (`0 50px 90px -30px rgba(0,0,0,.95), 0 10px 24px -12px rgba(0,0,0,.6)`). Nothing else casts a shadow.
- Paper texture: `repeating-linear-gradient(0deg, rgba(0,0,0,.035) 0 1px, transparent 1px 3px)` overlay.
- Printer: 560×36 body, 18px radius, gradient `#1c1b19→#131311`, slot 22px `#060606` inset shadow, LED 7px.
- Barcode: spans 1–4px wide, gaps 2–4px, height 28px, seeded random.

## The mark
`design/brand/`. Serration-becomes-flame receipt. Colour ≥48px, `favicon.svg` 16–32px, mono (`currentColor`)
for README/GitHub and ink-only on paper. Wordmark = text, Plex Mono 700, +0.24em, mark at 1.5× cap height.

## Motion: only things a printer does
| Moment | Spec |
|---|---|
| Print feed | 1.5s, `steps(30, end)`, `clip-path: inset(0 0 100% 0) → inset(-40px -80px -260px -80px)`. Never eased. |
| Count-up | 1.5s, ease-out quartic, starts at 0.55s; tabular figures |
| Stamp slam | at 2.1s, 0.4s `cubic-bezier(.3,1.6,.5,1)`: scale 2.4→1, rotate −18°→−7°, opacity → .92 |
| Idle sway | 7s loop, rotate ±0.25° from the top edge. The only thing that moves at rest |
| Pull (drag) | heavy: `visY = dy<50 ? dy*0.3 : 15+(dy-50)*0.1`; `scaleY = 1 + min(dy,140)/140*0.02`; `rot = clamp(dx/45, −6, 6)` from the top edge; release below threshold springs back `0.7s cubic-bezier(.2,1.5,.3,1)`. Threshold **110px**; hint "Keep pulling…" → "Let go."; haptic tick at threshold |
| Tear | 1.2s, pivot on the corner **opposite** the pull side: 0–13% sag `+dir·3.2°`, `+6px` (linear); 13–17% snap `+24px` (`cubic-bezier(.2,.9,.3,1)`); 17–100% fall `cubic-bezier(.55,0,1,.5)` to `translateY(880px desktop / 820 phone) translateX(dir·40px) rotate(+dir·11°) rotateX(12°)`. It leaves the screen; the element is removed at 1.22s. No fade, no bounce, no pile |
| Specks | 6 paper specks from the tear line at 0.15s, 0.95s, individual drift/rotation |
| Next print | starts at 0.56s while the old one is still falling; LED amber while waiting, blink on print |
| Stub tear (Copy) | 0.7s pivot top-left, falls 140px, receipt recoils 5px; note "Copied. Now paste it in your terminal."; new stub feeds after 2.4s (`steps(10)`) |
| Status LED | amber blink while printing (`steps(1)` keyframes), green when done |
| Reduced motion | all animations off, finished receipt, no sound |

## Sound: only on the person's own click, synthesized (no files), master gain 0.7
- **Tear**: 0.34s band-passed noise, Q .9, centre 650→3800 Hz over 0.15s then to 1600; crackle = amplitude
  ripple `0.45+0.55·|sin(2π(48+140p)t)|`; envelope 0→0.4 in 10ms, 0.2 at 50%, →0. **Thump at +0.18s**
  (sine 140→52 Hz, 0.55 peak, 0.12s) timed to the snap. **Distant thud at +1.3s** (low-passed noise 260 Hz, 0.16,
  + sine 70→40 Hz, 0.14) after it has left the screen.
- **Print**: relay click (12ms noise, 0.12), stepper hum (triangle 118 Hz through 900 Hz low-pass, 0.045) from
  0.1s to 1.62s, 30 head ticks (6ms noise band-passed 4.2–5.4 kHz, 0.05) every 48ms from 0.12s.
- **Stub rip (Copy)**: the tear at 0.24s length, 1400→3200 Hz, 0.2 peak, no thump.
- Real recordings of a thermal printer and a paper tear will beat synthesis; add them as ~20KB files later and
  keep synthesis as the fallback. Nothing ever plays on page load.

## Terminal (ANSI)
Ink = default fg; muted = bright black; ochre → yellow; red → red; stamp = red + bold box-drawing frame.
Receipt is 48 columns, dotted leaders, `=` rules for header/footer, `-` rules inside. Respect `NO_COLOR`.
Print line by line at ~70ms per line unless `--no-anim`.
