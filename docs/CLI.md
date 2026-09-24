# CLI — `npx token-damage`

Mockup: `design/canvas/Main.dc.html` (animated terminal run). Behaviour below is the spec.

## Flow
```
~ $ npx token-damage
token-damage 0.1.0
reads ~/.claude on this machine · uploads nothing · no network calls

scanning ~/.claude/projects …
  ✓ 94 sessions · 26 active days · 212 subagent transcripts
  ✓ 7,480 model calls · 612 prompts you actually typed
  ! claude code already deleted everything older than 30 days.
    this receipt covers what survived.            (only when retention is at default)

before we print: how many tokens did your agents use in 30 days?
(guess. we'll wait.)
› 20M                                             (accepts 20M, 20000000, 2e7, 1.2B)

printing customer copy …
<receipt, line by line>

you guessed 20,000,000. actual: 1,183,400,000.
you were off by 59×.

dispute this charge?
 [1] it was research   [2] the agent did it by itself   [3] it was one last fix
 [4] i was learning    [5] everyone does it             [6] i accept the damage
› 3
CLAIM #0041 · "it was one last fix" · DENIED
11 sessions started after midnight. that's not one.

saved  ~/token-damage/receipt-2026-09-23.png
       no project names · no paths · no prompts · no code

[c] copy image   [s] share link   [d] daily slips   [q] quit
```

## The receipt (48 columns; snapshot test target for the sample customer)
```
================================================
            T O K E N   D A M A G E
                 customer copy
       statement · aug 25 – sep 23, 2026
        (30 days — all claude code kept)
================================================
WORDS YOU TYPED ......................... 14,690
MODEL CALLS .............................. 7,480
TOKENS READ BY AGENTS ............ 1,178,700,000
  re-read from cache ..................... 96.2%
TOKENS WRITTEN BY AGENTS ............. 4,700,000
------------------------------------------------
BY MODEL                TOKENS        LIST PRICE
  opus                  840.2M         ≡ $665.34
  sonnet                284.0M         ≡ $134.94
  haiku                  59.2M           ≡ $9.37
------------------------------------------------
LIST-PRICE VALUE (API-EQUIV.) ........ ≡ $809.65
YOUR PLAN ........................... $200.00/mo
  value extracted ............... 4.0× your plan
CACHE SAVED YOU .................... ≡ $4,383.85
  without cache, this was .......... ≡ $5,193.50
------------------------------------------------
SURCHARGE (ESTIMATE, SHOWN AS A RANGE)
  ELECTRICITY ..................... ≈ 26–120 kWh
  a fridge running for ............ ≈ 1–4 months
------------------------------------------------
LATEST CALL .................... 3:47 AM, SEP 18
LONGEST SESSION ......................... 9h 14m
INTERNS HIRED (SUBAGENTS) .................. 212
MOST EXPENSIVE DAY .......... SEP 17 · ≡ $129.20
------------------------------------------------
DAMAGE CLASS
          ┏━━━━━━━━━━━━━━━━━━━━━━━━━┓
          ┃   A C T   O F   G O D   ┃
          ┗━━━━━━━━━━━━━━━━━━━━━━━━━┛
------------------------------------------------
ADJUSTER'S NOTE
  for every word you typed, the machine read
  80,558 tokens. that's the great gatsby,
  and a third of it again. per word.
------------------------------------------------
✶ RAM-X .................... ▲ +$0.0000079/stick
✶ satire. economists were not consulted.
================================================
   ≡ list-price equiv · ≈ estimate · ✶ satire
      method v1 · prices as of 2026-06-24
```
The "YOUR PLAN" block appears only with `--plan` or a configured plan. This is sample customer 0041:
`pnpm -F core sample-month` writes a synthetic config dir that adds up to it, and a CLI test compares
`token-damage --fixtures <it> --no-anim --plan 200` (UTC) with this block character for character.
The footer date is `asOf` in `packages/core/src/metrics/prices.json`.

## Flags
`--since 30d|YYYY-MM-DD`, `--plan 20|100|200|<usd>`, `--no-anim`, `--no-sound` (reserved), `--json` (schema in
`schema/receipt.schema.json`; tiers included on every value), `--fixtures <dir>`, `--config-dir <path>`
(same as `CLAUDE_CONFIG_DIR`), `--daily` (today's slip), `--keep-history 3650` (offers to set `cleanupPeriodDays`;
asks first), `--audit` (prints every file read and every field stored), `--forget` (deletes `~/.token-damage`).

## Files it writes
- `~/.token-damage/history.json` — daily aggregates only (tokens by type/model, calls, sessions, words, first/last
  call, subagents). This is how history survives the 30-day deletion. No text, no paths.
- `~/.token-damage/state.json` — roast cooldowns, achievements unlocked, last guess.
- `~/token-damage/receipt-<date>.png` — on request.

## Security posture
No network. No child processes except `git` (V1, opt-in) and `claude -p` (V1, opt-in, aggregates only).
Zero runtime dependencies except `@resvg/resvg-js`. Published with npm provenance. `--audit` shows everything read.
Never follows symlinks outside the config roots. Streams files; never loads a transcript whole
(ccusage once hit 4 GB RSS on a 12.7 GB history).

## Exit codes
0 ok · 2 no transcripts found (prints where it looked and the env vars that disable writing) · 3 parse
confidence low (unknown Claude Code version; prints "Parser confidence: medium" and continues unless `--strict`).
