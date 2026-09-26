# Privacy and threat model

## Promise (public page text)
Token Damage runs on your computer. It reads the usage records Claude Code already keeps in `~/.claude`
(and Codex in `~/.codex`, Antigravity in `~/.gemini/antigravity-cli`, Grok Build in `~/.grok`, OpenCode in
`~/.local/share/opencode`, Gemini CLI in `~/.gemini/tmp`), counts tokens, calls, times and the number of words you
typed, and prints a receipt. OpenCode's and Antigravity's databases are opened read-only; OpenCode's account and
credential tables are never queried, and in Antigravity's only the usage numbers, ids, model names and times are
decoded.

It never reads your code. It never keeps your prompts: words are counted in memory and the text is discarded.
It never stores project names, folder paths, branch names or file names. It makes no network requests.
There is no account and no telemetry.

The only thing that ever leaves your machine is a receipt you choose to share: an image, or a link whose
numbers live in the link itself (after the `#`), which browsers never send to any server.

It writes files of its own — `~/.token-damage/state.json`, and, if you use `live` or `statusline`,
`~/.token-damage/today.json` — and you can delete either any time.

## What is stored locally
- `~/.token-damage/state.json`: a run counter, which adjuster's notes were used recently, and which pool lines
  (jokes, satire, news) you have seen, so the next receipt doesn't repeat them. Numbers and line ids only, never
  your text. Nothing else is kept between runs; every receipt is computed from the agents' own logs.
- `~/.token-damage/today.json`: written only by `live` and `statusline`, so the pane and the status line don't
  re-read every file on every tick. Holds today's deduped usage and prompt events (numbers, model names,
  message ids), per file a hash of its path with a byte offset or a last-seen modification time, the day's tape
  events, the adjuster's live remarks and which it has already used today, and the last plan-limit numbers.
  Any id that looks like a file path is hashed before it is written. Never a prompt, a path, a project name or
  a branch name. Deleted and rebuilt from scratch every day; a torn or unreadable copy is treated as missing.
- `~/token-damage/receipt-<date>.png`: only when you ask for the image, and only after it shows you exactly what
  the image will contain.
- On tokendamage.com, three `localStorage` keys in your own browser, nothing sent anywhere: `td.sound` (sound
  off), `td.aside` (the last Saint Petersburg aside shown) and `td.deck` (which pool lines you've seen: a seed and
  line ids). No cookies.

## Threat model
- **A crafted share link.** `/r` is the only page that reads outside input (the URL fragment). The decoder allows
  only whitelisted keys, the site checks every value's shape (real dates and times, numbers up to 10¹⁵, known
  ids), never prints link text, and escapes everything it renders. Every page carries a Content-Security-Policy
  that runs only the site's own scripts (plus the import map, by hash) and allows no other host. The host must
  also send `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: strict-origin-when-cross-origin` as headers; a page can't set those itself.
- **Reading a sensitive folder.** `~/.claude` contains code and possibly secrets inside transcripts. Mitigation:
  stream lines, parse only known fields, never log raw lines, never write text anywhere, tests that assert
  outputs contain no path/prompt strings.
- **Supply chain (npx).** Zero runtime deps except `@resvg/resvg-js`; npm trusted publishing with provenance;
  lockfile committed; a browser-only import path for people who won't run npx (V1).
- **Accidental disclosure in shares.** Whitelist-only payloads; tests reject unknown keys; project aliases never
  exported; times rounded; time zone omitted; "work mode" shows totals only.
- **Satire mistaken for fact.** Tier marks are inside the image; satire is red and carries "made up".
- **Local server.** None in MVP (terminal only). If a localhost UI is added later: bind 127.0.0.1, random port,
  per-launch token in the URL, Host-header check, strict CSP, no CORS.

## Not affiliated
Token Damage is not affiliated with Anthropic, OpenAI, Google, xAI or the makers of OpenCode. Product names are used
to describe compatibility.
