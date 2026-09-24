# Website — tokendamage.dev

Static. No backend, no accounts, no cookies, no analytics (a cookieless page-view counter at most).
Hosting: GitHub Pages or Cloudflare Pages. Mockups: `design/canvas/WebHome.dc.html`, `WebMobile.dc.html`,
`Quiz.dc.html`. Working hero prototype: `design/prototype/hero-tear.html` (plain HTML/JS; port it, don't rewrite it).

## Pages
1. **`/` Home** — one screen. Pill nav (wordmark left; Quiz, GitHub right). A printer at the top. One receipt
   hangs from it. Its tear-off stub is the command with a Copy button. Two muted lines at the bottom:
   "Runs on your computer · nothing leaves it · open source" and "Not affiliated with Anthropic or OpenAI."
   Nothing else.
2. **`/r` Share** — opens a friend's link. Shows "Someone's AI read ▓▓▓▓ tokens in 30 days. Guess." with a log
   slider; then prints their receipt; "You guessed 5M. Real: 1.18B. Off by 236×."; their dispute stamp;
   buttons "Print your own" (the command) and "Not a developer? Take the quiz".
3. **`/quiz`** — the five questions in `QUIZ.md`, score stamp, then the command.
4. **`/method`** — "Show your work": pricing table with date, energy method v1 with the calibration, water/CO₂
   notes, satire formulas, sources. Deliberately boring.
5. **`/privacy`** — what it reads, what it never reads, what leaves the machine (only what you share).

## Home-page hero: behaviour
- On load the receipt prints (stepped feed, count-up, stamp). Receipt content = sample customer 0041 plus the
  live local date/time in the header. Stamped `SAMPLE · NOT YOUR NUMBERS (YET)`.
- **Copy** tears the stub off (rip sound), shows "Copied. Now paste it in your terminal." and "No terminal? The
  quiz is up top." A new stub feeds after 2.4s.
- **Pull the receipt down** (mouse or touch) past 110px and release: it tears with the physics in
  `DESIGN.md` §Motion, falls off the bottom of the screen, and the printer prints the **next sample customer**
  (0042 → 0043 → 0044 → 0041). Click fallback text under the receipt: "Pull the receipt down, or click here,
  for the next customer ↓". Clicking the wordmark replays the intro (with the print sound, since it's a click).
- Once, after the first print finishes, the receipt gives a small 6px dip and settles, so people discover the pull.
- Phone: `touch-action: none` on the receipt and `overscroll-behavior: none` on `html` so the pull doesn't
  trigger pull-to-refresh.
- Sound only on click/release; `prefers-reduced-motion` disables motion and sound.

## Share links (zero data custody)
- Payload = whitelisted aggregates only (see below), compact JSON → base64url → URL **fragment**:
  `https://tokendamage.dev/r#v1.<payload>`. Browsers never send the fragment to the server, so the site can host
  virality without ever receiving a number.
- Consequence: link previews (OG image) can't show the real numbers. Use a generic card:
  "Guess my AI damage." That is better; the number is the game.
- Whitelist: period start/end (dates only), tokens by type, model calls, sessions, active days, subagents,
  words typed, list price, cache saving, plan multiple (if given), kWh range, damage class, achievement ids,
  dispute id + verdict, adjuster note id, latest-call time rounded to 5 min, time zone omitted. Anything not on
  this list is rejected by a test. Project aliases are never included.
- `/r` renders entirely client-side; if the fragment is missing or invalid, show the sample receipt with a note.

## Quiz
Content in `QUIZ.md`. Works with no install. End screen: score, stamp (Blissfully Unaware / Mildly Informed /
Knows Too Much), the command, "Share score" (text: "I got 2/5 on the AI Damage Quiz · tokendamage.dev/quiz").

## World check strip (optional, below the fold on `/method` only)
Three dated real facts (see `METRICS.md` §World check). Not on the home page; the home page is the receipt only.

## Performance and access
- Lighthouse ≥ 95 on every page. Fonts: IBM Plex Mono (400/500/600/700 + italic) and Special Elite, self-hosted
  woff2 with `font-display: swap`.
- All labels use marks (`≡ ≈ ✶`), never colour alone. Buttons are real buttons; the receipt drag has a click
  fallback and the whole site works without JS except the motion.
- OG tags: title "Token Damage — the receipt your AI never gave you", generic OG image (receipt on the desk).
