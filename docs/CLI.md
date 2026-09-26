# CLI — `npx token-damage`


## Flow
```
~ $ npx token-damage
token-damage 0.1.0
reads agent logs on this machine · uploads nothing · no network calls

scanning ~/.claude/projects …
scanning ~/.codex/sessions, ~/.codex/archived_sessions …
scanning ~/.gemini/tmp …
scanning ~/.local/share/opencode …
scanning ~/.gemini/antigravity, ~/.gemini/antigravity-cli, ~/.gemini/antigravity-ide, ~/.gemini/antigravity-backup, ~/.config/antigravity …
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
 [1] it was research       [2] the agent did it by itself
 [3] it was one last fix   [4] i was learning
 [5] everyone does it      [6] the docs were wrong
 [7] it was a demo         [8] i was refactoring
 [9] the machines did it   [10] i accept the damage
› 3
CLAIM #0041 · "it was one last fix" · DENIED
11 sessions started after midnight. that's not one.

[c] copy image   [s] share link   [d] daily slips   [q] quit
› c
the image will show exactly this:
  <every field printed on the card>
  no project names · no paths · no prompts · no code
write ~/token-damage/receipt-2026-09-23.png? [y/N] y
saved  ~/token-damage/receipt-2026-09-23.png
       no project names · no paths · no prompts · no code
› s
the link will carry exactly this, and nothing else:
  <every field in the payload, with its value>
  it rides after the #, the part of a URL browsers never send to a server.
create the link? [y/N] y
https://tokendamage.com/r#v1.<payload>
```
Nothing is written or linked without that preview and a yes. "copy image" saves a file: the CLI starts no child
processes, so it cannot reach the clipboard.

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
  ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■··
TOKENS WRITTEN BY AGENTS ............. 4,700,000
------------------------------------------------
BY MODEL                TOKENS        LIST PRICE
  opus                  840.2M         ≡ $665.34
  ■■■■■■■■■■■■■■■■■■■■■■■■■■■■············  71%
  sonnet                284.0M         ≡ $134.94
  ■■■■■■■■■·······························  24%
  haiku                  59.2M           ≡ $9.37
  ■■······································   5%
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
BY DAY .......................... 1 day = 1 mark
  ▃▃▃▃▃·▃▃▃▃▃▃·▃▃▃▃▃▂·▂▂▂█▂▂·▂▂▂
                         ▲ sep 17
------------------------------------------------
DAMAGE CLASS
          ┏━━━━━━━━━━━━━━━━━━━━━━━━━┓
          ┃   A C T   O F   G O D   ┃
          ┗━━━━━━━━━━━━━━━━━━━━━━━━━┛
  ■·······················  4% to UNINSURABLE
------------------------------------------------
ACHIEVEMENTS
  ONE LAST FIX ...... last model call at 3:47 am
  CACHE LORD
    over 95% of input from cache for a week
  MIDDLE MANAGER ....... 12 subagents in one day
------------------------------------------------
ADJUSTER'S NOTE
  for every word you typed, the machine read
  80,558 tokens. that's the great gatsby,
  and a third of it again. per word.
------------------------------------------------
✶ RAM-X .................... ▲ +$0.0000079/stick
✶ anthropic is now valued at $965 billion.
  your share: 0.0000083 anthropics.
✶ satire. economists were not consulted.
------------------------------------------------
buy one billion tokens, get the next billion
  at the same price.
thank you for shopping. please come again,
  and again, and again.
------------------------------------------------
meanwhile, jan 2026: moltbook opened, a
  social network only ai agents can post to.
  humans are welcome to observe.
================================================
   ≡ list-price equiv · ≈ estimate · ✶ satire
      method v1 · prices as of 2026-09-24
```

Bars are measured facts, so they print in plain ink and never sit on a `≡`, `≈` or `✶` line. `■` is filled, `·`
empty, `▪` a share too small for one square; every bar rounds down, so only a whole share fills it. Under
`re-read from cache`: the cache share, 44 wide. Under each BY AGENT and BY MODEL row, when there are two or more:
that row's share of the tokens, 40 wide, then the rounded percentage. BY DAY (periods of 2+ days): one mark per
day, or per `k` days so it fits 44 marks, grouped from the newest day back; `·` is a day with no calls and `▲`
names the tallest mark (its day, or its days), by tokens like the chart, not by price. Under the stamp: how far the total is into its class, 24 wide, and the class above,
or `top of the scale`. `--json` carries the same facts as `measured.daily` and `damageClass.next` /
`damageClass.progress`.

ACHIEVEMENTS lists what the period earned, each with its true reason: a dotted leader when it fits, otherwise
the reason on its own lines under the name. The share card prints the names only, in one row.

The "YOUR PLAN" block appears only with `--plan` or a configured plan. With more than one agent in the period, a
BY AGENT block (same columns, most tokens first) sits above BY MODEL. Model rows follow the name people pick:
Claude models by family (`opus`, from any agent), other models by full name (`gpt-5.6-sol`,
`gemini-3-flash-preview`, `glm-5.2`); a name longer than 21 columns is cut with `…`. A row priced as a guess ends in
`*`, with the footnote `  * est. model: priced as the closest listed one` under BY MODEL; a row with no list price
says `not priced`. A price that leaves out tokens with no list price (an agent row, a model row, the LIST-PRICE
VALUE total) ends in `+`, with the footnote `  + at least: models not priced are left out`; the share card's total
gets the `+` too. The retention line is about Claude Code only; without Claude Code in the period it reads
`(30 days)`. The share card names the agents instead (`30 days — Codex + Claude Code · all Claude Code kept`). This is sample customer 0041:
`pnpm -F core sample-month` writes a synthetic config dir that adds up to it, and a CLI test compares
`token-damage --fixtures <it> --no-anim --plan 200` (UTC) with this block character for character.
The footer date is `asOf` in `packages/core/src/metrics/prices.json`.

## Image and link
- PNG: `receiptSvg` (core) builds the 1080×1920 share card as an SVG string;
  `@resvg/resvg-js` rasterizes it with the bundled fonts in `packages/cli/assets/fonts` (IBM Plex Mono, OFL;
  Special Elite, Apache-2.0). System fonts are never loaded, so every machine renders the same card. Plex Mono has no
  `≡` or `✶`, so those are drawn as shapes. resvg reads TTF, not woff2, so the fonts ship as TTF files.
- Link: `sharePayload` keeps only the fields in `SHARE_WHITELIST`; `decodeShare`
  rejects any other key.

## Flags
`--since 30d|YYYY-MM-DD`, `--plan 20|100|200|<usd>`, `--no-anim`, `--no-sound` (reserved), `--json` (schema in
`schema/receipt.schema.json`; tiers included on every value), `--fixtures <dir>` (a Claude Code config dir, a
Codex home, a Gemini CLI home, an OpenCode data dir and an Antigravity data dir in one: `projects/`, `sessions/`,
`tmp/`, `opencode/`, `antigravity/`), `--config-dir <path>` (same as `CLAUDE_CONFIG_DIR`), `--codex-home <path>`
(same as `CODEX_HOME`), `--gemini-dir <path>` (same as `GEMINI_DATA_DIR`; Gemini CLI is for API-key and enterprise users since
June 2026, when Antigravity replaced it), `--opencode-dir <path>` (same as
`OPENCODE_DATA_DIR`), `--antigravity-dir <path>` (same as `ANTIGRAVITY_DATA_DIR`).

Colour: on in a terminal, off in a pipe. `FORCE_COLOR=1` colours a pipe too; `FORCE_COLOR=0`, `NO_COLOR` or
`TERM=dumb` turn it off everywhere.

Not built yet: `--keep-history 3650` (would offer to set `cleanupPeriodDays`; would ask first), `--audit`
(would print every file read and every field stored) and `--forget` (would delete `~/.token-damage`).
`--daily` was never built either; `token-damage live --once` covers it.

## `token-damage live`

A pane in your terminal: the day's damage as it happens.
```
npx token-damage live
```
Needs a real terminal (pipe `--json` instead in a script or a tmux bar).
```
 WATER DAMAGE   next STRUCTURAL at 100M ■■···· 38%
 today   1,212 words → 38.2M read          ≡ $41.20
 now     claude+3 · 4 words → 9.8M ▸        ≡ $7.10
 rate    1.4M/min ▁▂▃▅█▇▅▃▂▁   ● printing
 limits  5h ■■■■■■■■■■■········  58%  resets 16:00
         7d ■■■················  21%  resets mon
 ─────────────────────────────────────────────────
 time   agent       you typed → it read       list
 13:05  ━━━━━━━━━ stamped WATER DAMAGE ━━━━━━━━━━━
 13:41  claude      12 words →   3.1M      ≡ $2.40
 13:52  codex       31 words → 410.0K      ≡ $0.31
        · · · · · · · idle 14 min · · · · · · ·
 14:09  claude·2    88 words →   1.2M      ≡ $0.90
 ✶ four words in. a library out. the usual.
                  ≡ list price · ✶ satire · q quit
```
Five glance rows on top — the damage class and progress to the next; today's words, tokens read, list price;
the open turn; a rate sparkline with a printing/idle state; plan limits, once Claude Code's status line has
reported them — then the tape, closed turns oldest to newest. A class upgrade prints in red the moment it
lands; gaps over 10 minutes show as `· · · idle N min · · ·`; the adjuster's lines are marked `✶` and never
hold a digit. Panes under 12 rows show the glance rows only; below 50 columns the price column drops, then
the sparkline. `q` quits; Ctrl-C works.

Flags: `--no-anim` (no opening count-up), `--json` (one NDJSON snapshot per change, for tmux bars and other
tools), `--once` (print one JSON snapshot and exit — what `pnpm oracle:live` compares against the receipt),
`--fixtures <dir>` (nothing is cached), `--clock <iso>` (pretend it is this time, for demos and screenshots),
plus the usual `--config-dir`, `--codex-home`, `--gemini-dir`, `--opencode-dir`, `--antigravity-dir`.

## `token-damage statusline`

Rows for Claude Code's own status line. Set it up once:
```
token-damage statusline --install
```
It prints the exact `settings.json` change — including the line it would replace, if `statusLine` is already
set to something else — and writes it only after you confirm. The file as it stood is kept once, as
`settings.json.token-damage.bak` next to it. It refuses to install an `npx …` command (too slow for a
per-refresh call, and it may touch the network) and asks for a global install instead.

Claude Code then runs the command after each event and on a timer, with session JSON on stdin. Default two
rows, capped at 80 columns:
```
▸ 4 words → 9.8M read ≡ $7.10 · +3 interns · ctx 41%
WATER DAMAGE · today 38.2M ≡ $41.20 · 5h 58% resets 16:00 · 7d 21%
```
Row 1 is this session: its open turn and the context-window percent Claude reports. Row 2 is today, all
agents: the damage class, tokens, list price, and Claude's own plan-limit numbers when it reports them.
`--rows 1` prints one combined line; `--rows 3` adds the adjuster's last remark, held until the next event.
`--width N` overrides the 80-column cap.

On any error, or past a 2-second guard, it prints one row — `token damage · (reading)` — and exits 0. Never a
stack trace in the status bar.

## Files it writes
- `~/.token-damage/state.json` — run counter, note cooldowns, and the pool deck (seed and line ids, never text).
- `~/.token-damage/today.json` — written by `live` and `statusline` only: today's numbers, path hashes and byte
  offsets, not text. Discarded and rebuilt every day. See `docs/PRIVACY.md`.
- `~/token-damage/receipt-<date>.png` — on request.

## Security posture
No network. No child processes except `git` (V1, opt-in) and `claude -p` (V1, opt-in, aggregates only).
Zero runtime dependencies except `@resvg/resvg-js`. Published with npm provenance.
Never follows symlinks outside the config roots. Streams files; never loads a transcript whole
(ccusage once hit 4 GB RSS on a 12.7 GB history).

## Exit codes
0 ok · 2 no sessions found (prints where it looked and the env vars that disable writing) · 3 parse
confidence low (an agent version in the period is newer than our fixtures; prints "parser confidence: medium" and
continues unless `--strict`).
