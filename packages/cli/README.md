<p align="center"><img src="https://raw.githubusercontent.com/dancemonk/token-damage/main/docs/assets/logo.svg" width="64" alt=""></p>

<h1 align="center">Token Damage</h1>

<p align="center">The receipt your AI agent never gave you. 🧾</p>

<p align="center">
  <a href="https://www.npmjs.com/package/token-damage"><img src="https://img.shields.io/npm/v/token-damage?label=npm&labelColor=17160f&color=6d685e" alt="npm version"></a>
  <a href="https://github.com/dancemonk/token-damage/actions/workflows/ci.yml"><img src="https://github.com/dancemonk/token-damage/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/dancemonk/token-damage/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-6d685e?labelColor=17160f" alt="MIT license"></a>
</p>

<p align="center"><a href="https://tokendamage.com">tokendamage.com</a></p>

```
npx token-damage
```

Works with **Claude Code**, **Codex**, **Gemini CLI** and **OpenCode**. Runs on your machine; nothing is uploaded.

You typed a paragraph. It read a library.

Token Damage reads the logs your agents already keep and prints an itemized receipt: the words you typed, the tokens they read, what that would cost at API list price, an electricity estimate, and a note from a tired insurance adjuster.

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
LIST-PRICE VALUE (API-EQUIV.) ........ ≡ $809.65
CACHE SAVED YOU .................... ≡ $4,383.85
------------------------------------------------
SURCHARGE (ESTIMATE, SHOWN AS A RANGE)
  ELECTRICITY ..................... ≈ 26–120 kWh
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
================================================
   ≡ list-price equiv · ≈ estimate · ✶ satire
```

<sub>A sample month, not yours. Yours is one command away.</sub>

## Watch it live

```
npx token-damage live
```

A calm pane to keep next to your agent. The top rows are today; the one that counts up is the prompt running right now.

```
 WATER DAMAGE   next STRUCTURAL at 100M ······ 38%
 today   1,212 words → 38.2M read          ≡ $41.20
 now     claude+3 · 4 words → 9.8M ▸        ≡ $7.10
 rate    1.4M/min ▁▂▃▅█▇▅▃▂▁   ● printing
 ─────────────────────────────────────────────────
 time   agent       you typed → it read       list
 13:41  claude      12 words →   3.1M      ≡ $2.40
 13:52  codex       31 words → 410.0K      ≡ $0.31
 ✶ four words in. a library out. the usual.
```

`q` quits. `--json` streams snapshots as JSON lines instead, for tmux bars and scripts.

To see the same numbers in Claude Code's own status line, install it once and run the setup. It shows the `settings.json` change and asks before writing:

```
npm i -g token-damage
token-damage statusline --install
```

```
▸ 4 words → 9.8M read ≡ $7.10 · +3 interns · ctx 41%
WATER DAMAGE · today 38.2M ≡ $41.20 · 5h 58% resets 16:00 · 7d 21%
```

## Share it

After the receipt, `c` saves a 1080×1920 card and `s` makes a share link. Both show you every field first. A friend who opens the link has to guess your number before they see it.

<p align="center"><img src="https://raw.githubusercontent.com/dancemonk/token-damage/main/docs/assets/share-card.png" width="300" alt="Share card for a sample month: 1,183,400,000 tokens, damage class ACT OF GOD"></p>

## Receipt options

```
--plan 200     your monthly plan in USD, for "value extracted: 4.0× your plan"
--since 30d    how far back to look, or a start date (YYYY-MM-DD)
--json         the whole receipt as JSON
--no-anim      print it all at once
```

`npx token-damage --help` lists the rest. Needs Node 22 or newer (22.13 or newer to read OpenCode).

## FAQ

**Is this what I paid?** No. `≡` is what the same tokens would cost at the providers' API list prices. On a subscription you pay the plan; `--plan 200` shows how many times over you used it.

**Does it upload anything?** No. No network calls, no telemetry, no accounts. A share link keeps its numbers after the `#`, the part of a URL browsers never send to a server.

**Why don't my numbers match another tool?** Claude Code deletes transcripts older than 30 days by default, so the receipt covers what survived and says so. Duplicate log lines are counted once. Daily totals match [ccusage](https://github.com/ryoppippi/ccusage) on every log we've tested; if yours don't, [open an issue](https://github.com/dancemonk/token-damage/issues/new?template=numbers.yml).

## Privacy

It reads Claude Code's transcripts and retention setting, Codex's session logs, Gemini CLI's chats and OpenCode's message database (read-only), and nothing else. Your prompts are counted, never stored. The live view keeps one file, `~/.token-damage/today.json`, with numbers and hashed file names only. More at [tokendamage.com/privacy](https://tokendamage.com/privacy).

## How the numbers work

Prices come from Anthropic's, OpenAI's and Google's public price lists, and every receipt prints the date they were checked. Electricity is always a range, because nobody publishes the real figure. Satire is printed in red and says so, and never carries a real number. The method is at [tokendamage.com/method](https://tokendamage.com/method); the details are in [docs/METRICS.md](https://github.com/dancemonk/token-damage/blob/main/docs/METRICS.md), [docs/DATA-SOURCES.md](https://github.com/dancemonk/token-damage/blob/main/docs/DATA-SOURCES.md) and [docs/LIVE.md](https://github.com/dancemonk/token-damage/blob/main/docs/LIVE.md).

## Source

[github.com/dancemonk/token-damage](https://github.com/dancemonk/token-damage). Issues welcome, especially when a new agent version breaks the numbers.

MIT. Not affiliated with Anthropic, OpenAI or Google. No refunds: tokens cannot be un-read.
