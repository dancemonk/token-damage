# Privacy and threat model

## Promise (public page text)
Token Damage runs on your computer. It reads the usage records Claude Code already keeps in `~/.claude`
(and Codex in `~/.codex`), counts tokens, calls, times and the number of words you typed, and prints a receipt.

It never reads your code. It never keeps your prompts: words are counted in memory and the text is discarded.
It never stores project names, folder paths, branch names or file names. It makes no network requests.
There is no account and no telemetry.

The only thing that ever leaves your machine is a receipt you choose to share: an image, or a link whose
numbers live in the link itself (after the `#`), which browsers never send to any server.

You can see every file it read with `token-damage --audit` and delete everything it stored with
`token-damage --forget`.

## What is stored locally
`~/.token-damage/history.json`: per-day totals (tokens by type and model, calls, sessions, subagents, words
typed, first/last call). `state.json`: which jokes you've seen, achievements, your last guess. Nothing else.

## Threat model
- **Reading a sensitive folder.** `~/.claude` contains code and possibly secrets inside transcripts. Mitigation:
  stream lines, parse only known fields, never log raw lines, never write text anywhere, `--audit` transparency,
  tests that assert outputs contain no path/prompt strings.
- **Supply chain (npx).** Zero runtime deps except `@resvg/resvg-js`; npm trusted publishing with provenance;
  lockfile committed; a browser-only import path for people who won't run npx (V1).
- **Accidental disclosure in shares.** Whitelist-only payloads; tests reject unknown keys; project aliases never
  exported; times rounded; time zone omitted; "work mode" shows totals only.
- **Satire mistaken for fact.** Tier marks are inside the image; satire is red and carries "made up".
- **Local server.** None in MVP (terminal only). If a localhost UI is added later: bind 127.0.0.1, random port,
  per-launch token in the URL, Host-header check, strict CSP, no CORS.

## Not affiliated
Token Damage is not affiliated with Anthropic or OpenAI. Product names are used to describe compatibility.
