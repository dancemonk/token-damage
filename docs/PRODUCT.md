# Product

## One sentence
Token Damage prints the itemized receipt your AI agent never gave you: real usage, list-price value,
an honest electricity range, and clearly labeled satire, generated entirely on your machine.

## The problem it plays with
AI coding agents turn a paragraph of typing into billions of tokens of machine reading, and nobody feels it.
Meanwhile everyone is paying for AI somewhere: RAM prices, power bills, subscriptions, usage limits, lost
sleep. People already joke about all of this. Token Damage prints them a receipt for their share.

## The one idea
**You typed a paragraph. It read a library.** In a real Claude Code log, 1,138 typed prompts became 14,000+
model calls and 3.2 billion tokens; ~96% were the agent re-reading its own context and ~0.4% was output
(Hausfather, Aug 2026; see `SOURCES.md`). The receipt shows the words you typed next to the tokens it read.
The size contrast between the two numbers is the product.

## Who it's for
Developers who use Claude Code (first), Codex (second), other agent CLIs later. The people who *see* the
receipt are everyone; a non-developer must get the card in three seconds. Non-developers play the quiz on the
website instead of installing anything.

## What it is not
- Not a token tracker with charts (ccusage, CodeBurn already do that well).
- Not a leaderboard (Viberank, Tokscale). We mock token vanity; we never rank people.
- Not FinOps. No budgets, alerts, teams, or dashboards in the consumer product.
- Not a guilt trip. Environmental numbers are shown like a meter reading, with neutral context, as ranges.

## The receipt
A thermal receipt. Its layout *is* the truth system:
- **Line items** — measured facts (tokens, calls, times, words typed)
- **`≡` lines** — list price: what the same usage costs on the public API price list; "you saved (cache card)"
- **`≈` lines** — estimates, always a range (electricity; water and CO₂ in detail view only)
- **`✶` lines** — satire, always red, always with a "made up" note (RAM surcharge)
- **Stamp** — the Damage Class (Paper Cut → Uninsurable)
- **Adjuster's note** — one dry line about the most surprising true thing in the data
- **Tear-off stub** — `$ npx token-damage`

Receipt grammar carries the jokes: "You saved $4,383.85 with your Cache Rewards card", "Suggested tip for
Claude: 18% · 20% · 25% · No tip", "No refunds. Tokens cannot be un-read.", "Cashier: The Adjuster".

## Core loop
1. **Collect** — read local logs, aggregate, discard text.
2. **Guess** — "How many tokens did your agents use in 30 days?" before anything is shown.
3. **Print** — the receipt feeds out line by line; "You guessed 20M. Actual 1.18B. Off by 59×."
4. **Dispute** — pick an excuse; the adjuster rules on it using your real numbers; the verdict is stamped.
5. **Share** — PNG and a fragment link (numbers live in the URL, never on a server). Friends who open the
   link must guess your number before they see it.

The fuel is new true observations, not new numbers. When there is nothing new: "Quiet week. Suspicious."

## The three actions (and nothing else)
Guess, dispute, share-and-guess. Each takes seconds and each leaves a mark on the card. No streaks, no
daily reminders, no invite-to-unlock.

## Retention (honest version)
This is a moment product like Wrapped, not a daily app. Design for pull moments: the first run, the statement
at the end of the month, December Wrapped, and a friend's link. Later, the Claude Code statusline
(`⚠ today: Water Damage · $14 list`) carries the daily presence without an app to open.

## Scope
- **MVP (ship):** Claude Code only, terminal receipt, guess, dispute, PNG, fragment share link, website with
  the hero and the quiz. Ten capabilities, listed in `TASKS.md`.
- **V1:** Codex adapter, statusline, local-git correlation ("most expensive commit", labeled vanity ratio),
  "Ask the Adjuster" (pipes aggregates to the user's own `claude -p`; bills the roast on the receipt),
  December Wrapped, browser-only import for people who distrust npx.
- **V2 if it spreads:** menu-bar app (Tauri), Cursor/OpenCode adapters, chat-export import (estimated),
  Discord bot rendering share links, a team statement (anti-leaderboard: cost per merged PR, no per-person ranks).
- **Never in the consumer product:** accounts, cloud sync, leaderboards, composite "efficiency score",
  rate-limit forecasting.

## Business model
MIT, free, local. GitHub Sponsors. Monetizing the joke kills the joke. A serious team product can be a separate
brand on the same engine later.

## Name
**Token Damage.** Short, sayable, vendor-neutral, and "damage" unlocks the whole insurance/adjuster voice.
Report names: "Receipt" (daily, share), "Statement" (monthly). Do not use "Damage Report" (collides with a
TYT show). `token-damage` on npm and tokendamage.com/.dev were free on 2026-09-24.
