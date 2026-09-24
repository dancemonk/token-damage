# Token Damage

**The receipt your AI never gave you.**

```
npx token-damage
```

You typed a paragraph. It read a library. Token Damage reads the usage records Claude Code already keeps on
your machine and prints a receipt: every token, what it would cost at list price, roughly what it drew from
the grid, and one adjuster's note you'll want to screenshot.

Runs on your computer. Nothing is uploaded. Ever.

> Status: design complete, code not started. See `CLAUDE.md` and `docs/TASKS.md`.

## What's on the receipt
- **Measured** — words you typed, tokens it read, model calls, sessions, times. Straight from your logs.
- **`≡` List price** — what the same usage costs on the public API price list. Not what you paid.
- **`≈` Estimate** — electricity, always as a range, method public.
- **`✶` Satire** — made up on purpose, printed in red, says so.

## Privacy
It never reads your code, never keeps your prompts (words are counted in memory and the text is discarded),
never stores project names or paths, and makes no network requests. The only thing that leaves your machine
is a receipt you choose to share; a share link keeps its numbers in the URL fragment, which browsers never
send to a server. `token-damage --audit` lists every file it read.

## Repository
- `CLAUDE.md` — brief for building with Claude Code
- `docs/` — product, data sources, metrics, roasts, design, CLI, website, architecture, privacy, launch, roadmap, sources
- `design/` — mockup sources (`canvas/`), a working prototype of the site hero (`prototype/hero-tear.html`), brand kit (`brand/`)

MIT. Not affiliated with Anthropic or OpenAI.
