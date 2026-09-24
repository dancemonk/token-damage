# Token Damage

Token Damage prints the receipt your AI agent never gave you. It reads the local logs that
Claude Code (and later Codex) already write, and prints a receipt: real usage, list-price
value, an honest electricity estimate, and clearly labeled satire. It runs entirely on the
user's machine. Nothing is uploaded, ever.

Tagline: **You typed a paragraph. It read a library.**

Read these before writing code, in this order:
1. `docs/PRODUCT.md` — what we are building and what we are not
2. `docs/DATA-SOURCES.md` — the log formats and every known trap
3. `docs/METRICS.md` — the four truth tiers and every formula
4. `docs/ARCHITECTURE.md` — repo layout, pipeline, testing rules
5. `docs/TASKS.md` — the ordered build plan; do one task at a time

Everything else in `docs/` is reference for the specific piece you are working on:
`CLI.md`, `WEBSITE.md`, `DESIGN.md`, `ROASTS.md`, `QUIZ.md`, `PRIVACY.md`, `LAUNCH.md`, `ROADMAP.md`, `SOURCES.md`.
`design/` holds the mockup sources, a working prototype of the hero interaction, and the brand kit.

## Non-negotiable rules

1. **Nothing leaves the machine.** No network calls in the CLI, ever. No telemetry. No analytics. The only
   outbound path is a share link the user explicitly creates, and its data lives in the URL fragment.
2. **Never store prompt text.** Count words from user messages in memory during ingest and discard the text.
   Never write prompts, file paths, project names, branch names, or code to disk or into any output.
3. **Every number wears its label.** Plain = MEASURED. `≡` = PRICED (API list price). `≈` = ESTIMATED,
   always shown as a range. `✶` = SATIRE, always red, never mixed with a real number. See `docs/METRICS.md`.
4. **A wrong number is worse than a boring one.** Dedupe exactly as `docs/DATA-SOURCES.md` says. Totals must
   match `ccusage` within 1% on the fixture corpus before any receipt ships.
5. **Red means "joke or fire".** Never use red for facts or for buttons at rest. See `docs/DESIGN.md`.
6. **Mock the situation, never the person.** Voice rules are in `docs/ROASTS.md`.
7. **No engagement bait.** No usage streaks, no leaderboards, no notifications, no accounts.

## Stack

- TypeScript, Node ≥ 22 (dev tooling ≥ 22.12), pnpm workspaces. ESM only.
- `packages/core` (parsing, metrics, roasts; zero runtime deps), `packages/cli` (`npx token-damage`),
  `apps/web` (static site, no framework required).
- Tests: vitest. Fixtures in `packages/core/fixtures/`. Lint: eslint + prettier defaults.
- PNG rendering: SVG built as a string, rasterized with `@resvg/resvg-js`. No headless browser.
- Runtime dependencies in the CLI are limited to: `@resvg/resvg-js`. Add another only with a written reason in the PR.

## Commands

```
pnpm i                 # install
pnpm test              # all tests
pnpm -F core test      # core only
pnpm -F token-damage dev  # run the CLI against your own ~/.claude
pnpm -F token-damage dev -- --fixtures packages/core/fixtures/sample-month   # run against fixtures
pnpm -F web dev        # static site
pnpm check             # lint + typecheck + test (must pass before commit)
pnpm oracle            # compare our daily totals with ccusage on your logs (fetches ccusage via npx)
pnpm oracle:fixtures   # same on the fixture corpus (runs in CI)
```

## Working style

- One task from `docs/TASKS.md` per session. Finish it, run `pnpm check`, then stop and summarize.
- When a log format detail is unclear, write a fixture that captures the real lines (sanitized) and a test,
  rather than guessing. Anthropic calls the transcript format internal; assume it will change.
- Prefer small pure functions in `core`. The CLI and the site are thin.
- Keep the sample customers in `docs/METRICS.md` §Sample data as the canonical fake numbers; all mockups use them.
- Commit messages: imperative, one line, plus a body when the why isn't obvious.
