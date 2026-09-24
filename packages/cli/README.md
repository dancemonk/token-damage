<p align="center"><img src="https://raw.githubusercontent.com/dancemonk/token-damage/main/design/brand/token-damage-mark.svg" width="72" alt=""></p>

# Token Damage

**The receipt your AI agent never gave you.**

```
npx token-damage
```

You typed a paragraph. It read a library.

Token Damage reads the logs Claude Code already keeps on your disk and prints an itemized receipt. It shows how many words you typed, how many tokens your agents chewed through, what that would cost at API list price, a range for the electricity, and a note from a tired insurance adjuster who has seen everything and is still surprised by you. 🧾

It runs on your machine and makes no network calls. Your prompts never leave the building. They barely enter it: words get counted and the text is dropped on the spot.

## What you get

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

That's sample customer 0041, a made-up person with a very real habit. Before printing, the CLI makes you guess your own total. 0041 guessed 20 million and was off by 59×. Afterwards you can dispute the charge. The dispute department has heard every excuse, and "it was research" has never once worked at 3:47 AM.

<p align="center"><img src="https://raw.githubusercontent.com/dancemonk/token-damage/main/docs/assets/share-card.png" width="360" alt="The share card for sample customer 0041: 1,183,400,000 tokens, damage class ACT OF GOD"></p>

Press `c` to save that card as a PNG, or `s` for a share link. Either way it first shows you every field it's about to write, and waits for a yes. The link keeps its numbers after the `#`, the part of a URL that browsers never send to a server, so tokendamage.com never sees them.

## Reading the receipt

Every number belongs to one of four kinds, and each kind wears its own mark:

| Mark | Kind | Example |
| --- | --- | --- |
| none | Measured, straight from your logs | `14,690` words typed |
| `≡` | List price: what the same tokens cost on Anthropic's public API price list. Not what you paid. | `≡ $809.65` |
| `≈` | Estimate. Always a range, and the method is public. | `≈ 26–120 kWh` |
| `✶` | Satire. Made up on purpose, printed in red, and it tells you so. | `✶ +$0.0000079/stick` |

A wrong number is worse than a boring one, so the boring parts got most of the work.

Claude Code writes the same API response several times: streaming snapshots, one line per parallel tool call, and copies whenever you resume a session. Token Damage folds those back into one call each. On the logs we've tested, its daily token totals match [ccusage](https://github.com/ryoppippi/ccusage) exactly, field by field, and CI runs that comparison on every push.

Prices come from a dated table in [`prices.json`](https://github.com/dancemonk/token-damage/blob/main/packages/core/src/metrics/prices.json). That table includes a detail most tools miss. Claude Code caches the main thread with the 1-hour TTL, which costs 2× input instead of 1.25×. On one real month that was 87% of all cache writes, and pricing them at the cheaper rate would have understated the total by about 8%.

Electricity is the honest-shrug part. Nobody publishes per-token energy for these models, so the coefficients are calibrated against a published 3.2 billion token Claude Code log (Zeke Hausfather, about 170 kWh). You get a range and the method, never one confident number.

"Words you typed" means words a person typed. Tool results, slash-command templates, notifications, SDK scripts and the plans Claude Code feeds back to itself don't count. On one real log, scripts alone were a third of all "prompt" words, which says something about scripts.

## Damage classes

| Tokens in the period | Class | Fine print |
| --- | --- | --- |
| under 1M | PAPER CUT | Minor scuff. No claim filed. |
| 1M | FENDER BENDER | Adjuster notified. |
| 10M | WATER DAMAGE | Please do not use the elevator. |
| 100M | STRUCTURAL | Building inspector en route. |
| 1B | ACT OF GOD | Your insurer has stopped returning calls. |
| 5B | UNINSURABLE | You are now the reason the policy exists. |

## Flags

```
--plan 200           your monthly plan in USD, for "value extracted: 4.0× your plan"
--since 30d          or a start date as YYYY-MM-DD (default: the last 30 days)
--json               the whole receipt as JSON, every value tagged with its kind
--no-anim            print everything at once instead of line by line
--config-dir <path>  read another Claude Code config dir (same as CLAUDE_CONFIG_DIR)
--fixtures <dir>     read a fixture corpus instead of your own logs
--strict             exit with 3 if your Claude Code is newer than anything we've tested
```

It respects `NO_COLOR`. Exit code 2 means it found no transcripts, and it tells you where it looked.

## Privacy, in plain words

It reads the transcripts under `~/.claude/projects` and `~/.config/claude/projects` (or whatever `CLAUDE_CONFIG_DIR` points to), plus the `cleanupPeriodDays` value from `settings.json`, so it can tell you what Claude Code has already deleted. Nothing else.

It never keeps your prompts, file paths, project names, branch names or code. No network calls, no telemetry, no accounts, no streaks, no leaderboards.

It writes `~/.token-damage/state.json`, which remembers which adjuster's notes it used recently so it doesn't tell you the same joke twice. That file holds ids and counters, nothing else. The PNG is only written when you ask for it.

One thing to know: Claude Code deletes transcripts older than 30 days by default. The receipt covers what survived.

## Why not just use ccusage?

You should, for the day-to-day numbers. It's good, and Token Damage checks itself against it. This is the receipt you screenshot: the words-you-typed ratio, list price with the cache priced right, an electricity range that admits it's a range, and a damage class stamped in red.

## Source, issues, specs

Everything lives at [github.com/dancemonk/token-damage](https://github.com/dancemonk/token-damage). Claude Code's transcript format is internal and changes between versions; if a new version breaks the numbers, open an issue there with the output of `claude --version`.

## Fine print

MIT license. The share card bundles IBM Plex Mono (SIL Open Font License 1.1) and Special Elite (Apache 2.0). Not affiliated with Anthropic, OpenAI or any insurance company.

No refunds. Tokens cannot be un-read.
