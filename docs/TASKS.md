# Build plan — ordered tasks for Claude Code

Do these in order. Each task is written so it can be pasted as a prompt. Each ends with acceptance
criteria; do not start the next task until they pass. Ship after task 9.

## Task 0 — Register names (human, 10 minutes)
- `npm` package `token-damage` (publish a placeholder 0.0.1 with a README that says "coming soon").
- Domain: `tokendamage.com`. GitHub repo `token-damage`.
- These were free on 2026-09-24. Do this first.

## Task 1 — Scaffold
Create a pnpm monorepo: `packages/core`, `packages/cli`, `apps/web`. TypeScript strict, ESM, vitest, eslint,
prettier. `pnpm check` runs lint + typecheck + test. `packages/core` has zero runtime dependencies.
`packages/cli` has a `bin` named `token-damage` that prints "token-damage 0.1.0" and exits.
Add MIT LICENSE, `.gitignore`, `.npmrc` with `provenance=true`.
**Accept:** `pnpm check` green; `pnpm -F token-damage dev` prints the version.

## Task 2 — Claude Code adapter: discovery + parsing
In `core/src/adapters/claude/`: find transcript files per `docs/DATA-SOURCES.md` §Claude Code (both roots,
`CLAUDE_CONFIG_DIR` incl. comma-separated, recursive, `subagents/`). Parse JSONL line by line with a streaming
reader (never load a whole file). Emit `UsageEvent` records (see `docs/ARCHITECTURE.md` §Types) for assistant
lines with `message.usage`. Skip malformed lines. Exclude `message.model === "<synthetic>"`.
Include `message.usage.iterations[]` of type `advisor_message` as separate events under their own model.
Build a fixture corpus in `core/fixtures/claude/` from **sanitized** real lines (replace text with "x", keep
structure, ids, usage, timestamps, cwd → "/p/a"). Cover: normal, streaming duplicate, parallel tool use,
sidechain replay (`/btw`), subagent file, synthetic model, missing requestId, advisor iterations.
**Accept:** tests per fixture; parser handles a 500 MB file in constant memory (test with a generated file).

## Task 3 — Dedupe + aggregation
Implement dedupe exactly per `docs/DATA-SOURCES.md` §Dedupe. Then aggregate `UsageEvent[]` into
`DailyTotals` and `Totals` by day (local time), model, and source. Sessions: group by `sessionId`;
subagent events attach to the parent session. Compute model calls, sessions, active days, first/last call
per day, longest session (first→last event gap, capped at 12h idle split), subagent count.
**Accept:** totals on the fixture corpus equal the hand-computed expected JSON; no double counting on the
streaming/parallel/sidechain fixtures; the "undercount" and "overcount" regression tests both pass.

## Task 4 — Words you typed
Count words in user prompts per `docs/DATA-SOURCES.md` §Words typed. Never keep the text: count and drop.
**Accept:** fixture with tool_result user lines, slash commands, pasted content → expected count.

## Task 5 — Oracle check against ccusage
Script `scripts/oracle.mjs`: runs `npx ccusage@latest daily --json --offline` and our aggregation on the same
`CLAUDE_CONFIG_DIR`, prints a per-day diff table. CI runs it on the fixture corpus (ccusage reads fixture dirs
too). Document any known, explained divergence in `docs/DATA-SOURCES.md` §Known divergences.
**Accept:** totals within 1% per day on fixtures; script exits non-zero above 1%.

## Task 6 — Metrics
`core/src/metrics/`: pricing (`prices.json` with `asOf` date, per model: input, cacheWrite, cacheRead,
output per 1M), list-price value, cache savings, plan multiple (plan price from `--plan` flag or config),
energy ranges per `docs/METRICS.md` §Estimated (method v1, calibrated), water and CO₂ (detail only),
satire values (RAM-X). Every function returns `{ value, tier }` where tier ∈ measured | priced | estimated | satire.
**Accept:** the sample customer in `docs/METRICS.md` reproduces exactly: $809.65, $4,383.85, 26–120 kWh, +$0.0000079.

## Task 7 — Observation + roast engine
`core/src/roasts/`: detectors → candidates with confidence and surprise; template families with ≥5 variants;
severity matched to data; cooldown memory in `~/.token-damage/state.json` (aggregates only). Achievements and
damage classes per `docs/ROASTS.md`. Dispute verdicts per `docs/ROASTS.md` §Dispute.
**Accept:** for each of the four sample customers, the engine picks the note in `docs/METRICS.md` §Sample data
as its top candidate; a snapshot test freezes the outputs; no template ever fires on data outside its severity band.

## Task 8 — Terminal receipt
`packages/cli`: flow per `docs/CLI.md`: banner → scan (counts only) → 30-day-deletion notice → guess prompt →
receipt printed line by line (48 columns, ANSI colours per `docs/DESIGN.md` §Terminal) → "you were off by N×" →
dispute prompt → keys `c` copy image, `s` share link, `d` daily slips, `q` quit. `--no-anim`, `--json`, `--plan`,
`--since`, `--fixtures` flags. Respect `NO_COLOR`.
**Accept:** running against fixtures prints the receipt in `docs/CLI.md` §Receipt exactly (snapshot test with
`--no-anim`); `--json` output validates against `schema/receipt.schema.json`.

## Task 9 — PNG export + share link
Render the receipt as SVG (1080×1920, layout per `design/canvas/ShareCard.dc.html`, fonts embedded as
base64 woff2, IBM Plex Mono + Special Elite) and rasterize with `@resvg/resvg-js` to
`~/token-damage/receipt-YYYY-MM-DD.png`. Share link: whitelisted aggregates → compact JSON → base64url in the
URL **fragment** of `https://tokendamage.com/r#...`. Privacy preview lists every field before writing anything.
**Accept:** PNG matches the mockup layout; the share payload contains only whitelisted fields (test asserts
no key outside the whitelist); no project names, paths, prompts anywhere in either artifact.

→ **Ship 0.1.0 here.** `npm publish --provenance`. Post per `docs/LAUNCH.md`.

## Task 10 — Website
`apps/web`: static, one page + `/r` (share) + `/method` + `/privacy` + `/quiz`. Port the hero from
`design/prototype/hero-tear.html` (it is plain HTML/JS and already tuned) and the receipt markup from
`design/canvas/WebHome.dc.html`. Quiz from `docs/QUIZ.md`. Fragment-based share rendering per `docs/WEBSITE.md`.
No cookies, no analytics, no external scripts except Google Fonts (self-host them if easy).
**Accept:** Lighthouse ≥ 95 on all four; works with JS disabled except the hero motion; `prefers-reduced-motion` honoured.

## Task 11 — Codex adapter (second launch)
Per `docs/DATA-SOURCES.md` §Codex, with its own fixture corpus and oracle check.

## Later (see docs/ROADMAP.md)
Statusline, local-git correlation, "Ask the Adjuster", December Wrapped, Gemini/Copilot CLI adapters.
