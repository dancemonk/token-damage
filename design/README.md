# Design sources

## `canvas/*.dc.html`
The mockups from the design canvas, one file per artboard. They are HTML with a small component wrapper
(`<x-dc>`, `{{holes}}`, `<sc-if>`, `<sc-for>`, a `DCLogic` class); ignore the wrapper and lift the markup, inline CSS
values and the JS logic. They contain the exact colours, sizes, keyframes and sound synthesis.

| File | What |
|---|---|
| `Main.dc.html` | Animated terminal run: the CLI flow and the 48-column receipt |
| `ShareCard.dc.html` | 1080×1920 share PNG layout (with the "who did the reading" bar and world check) |
| `DailyLight.dc.html`, `DailyNight.dc.html` | Daily slips: quiet day, bad night (achievement card) |
| `Quiz.dc.html` | Working quiz, phone layout, all five questions |
| `WebHome.dc.html`, `WebMobile.dc.html` | Home page, desktop and phone, with printer, pull-to-tear, stub tear, sounds, four sample customers |
| `Icon.dc.html` | The mark at every size and in context |
| `Style.dc.html` | The style sheet: type scale, colours, components, spacing, motion, voice |

## `prototype/hero-tear.html`
Plain HTML/JS, no dependencies. Open it in a browser. Drag the receipt down past 110px and release. This is the
tuned reference for the hero: pull resistance, sag, snap, fall off-screen, next print. Port it; don't rewrite it.

## `brand/`
`token-damage-mark.svg` (colour, ≥48px), `favicon.svg` (16–32px), `token-damage-mark-mono.svg` (`currentColor`),
`token-damage-app-icon.svg` (512, rounded square), `README.md` (colours and rules).

## `sample-numbers.py`
Reproduces the canonical sample customers in `docs/METRICS.md` (consistent tokens, prices, cache savings,
energy ranges, RAM-X).
