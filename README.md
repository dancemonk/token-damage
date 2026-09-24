<p align="center"><img src="docs/assets/logo.svg" width="64" alt=""></p>

<h1 align="center">Token Damage</h1>

<p align="center">The receipt your AI agent never gave you. 🧾</p>

```
npx token-damage
```

You typed a paragraph. It read a library.

Token Damage reads the logs Claude Code, Codex, Gemini CLI and OpenCode keep on your machine and prints an itemized receipt: the words you typed, the tokens your agents read, what that would cost at API list price, an electricity estimate, and a note from a tired insurance adjuster. Nothing leaves your computer.

<p align="center"><img src="docs/assets/share-card.png" width="320" alt="Share card for a sample month: 1,183,400,000 tokens, damage class ACT OF GOD"></p>

## Options

```
--plan 200     your monthly plan in USD, for "value extracted: 4.0× your plan"
--since 30d    how far back to look, or a start date (YYYY-MM-DD)
--json         the whole receipt as JSON
--no-anim      print it all at once
```

`npx token-damage --help` lists the rest. Needs Node 22 or newer (22.13 or newer to read OpenCode).

## Privacy

It reads Claude Code's transcripts and retention setting, Codex's session logs, Gemini CLI's chats and OpenCode's message database (read-only), and nothing else. Your prompts are counted, never stored. It makes no network calls and has no telemetry or accounts. A share link keeps its numbers after the `#`, the part of a URL browsers never send to a server.

## How the numbers work

Daily token totals match [ccusage](https://github.com/ryoppippi/ccusage) on the logs we've tested. Prices come from Anthropic's, OpenAI's and Google's public price lists, and every receipt prints the date they were checked. Electricity is always a range, because nobody publishes the real figure. Satire is printed in red and says so. The details are in [docs/METRICS.md](docs/METRICS.md) and [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md).

## Development

```
pnpm i
pnpm check
```

MIT. Not affiliated with Anthropic. No refunds: tokens cannot be un-read.
