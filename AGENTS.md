# AGENTS.md

How to work in this repo, for coding agents and the people running them. Humans: `CONTRIBUTING.md` is the short
version.

Token Damage reads the logs Claude Code, Codex, Gemini CLI and OpenCode already keep on this machine and prints a
receipt: measured usage, list-price value, an electricity estimate shown as a range, and clearly labelled satire.
Surfaces: `npx token-damage` (the receipt), `token-damage live` (a pane), `token-damage statusline` (inside Claude
Code), and tokendamage.com (a static site that opens share links). Nothing is uploaded.

## Rules that are never traded off

1. **Nothing leaves the machine.** No network calls in the CLI, no telemetry, no analytics. The only way out is a
   share link the user creates after seeing every field; its data lives in the URL fragment.
2. **Never store prompt text.** Prompts become a word count while parsing and the text is dropped. No prompts,
   file paths, project or branch names, or code in any file, output, link or image.
3. **Every number wears its label.** Plain = measured, `≡` = API list price, `≈` = estimate (always a range),
   `✶` = satire (always red, never beside a real number). `docs/METRICS.md`.
4. **A wrong number is worse than a boring one.** Dedupe exactly as `docs/DATA-SOURCES.md` says. Each fixture
   corpus has a hand-derived `expected.json` asserted exactly in CI.
5. **Red means joke or fire.** Never red for a fact.
6. **Mock the situation, never the person.** Every joke claims only what was measured. `docs/ROASTS.md`.
7. **No engagement bait.** No streaks, leaderboards, notifications or accounts.

## Map

- `packages/core` (pure TypeScript, zero runtime dependencies)
  - `src/adapters/{claude,codex,gemini,opencode}`: find and parse logs into `UsageEvent` / `PromptEvent`
  - `src/aggregate`: dedupe, daily and session totals
  - `src/metrics`: prices (`prices.json`), energy, satire
  - `src/roasts`: `facts.ts` + `detectors.ts` → note families, achievements, dispute, pool
  - `src/receipt`: `model.ts` builds the `Receipt` (renderers never compute), `text.ts` (48 columns), `svg.ts`
    (share card), `share.ts` (link), `glyphs.ts` (bars)
  - `src/live`: snapshot, turns, engine, `view.ts` (pane), `statusline.ts`, `voice.ts` (remarks)
- `packages/cli`: thin shell; `run.ts` is the receipt flow; the only runtime dependency is `@resvg/resvg-js`
- `apps/web`: tokendamage.com, no framework; `src/*.ts` compile to `dist/assets/js`, `scripts/build.mjs` renders
  the pages, copy in `i18n/{en,ru}.json`
- `scripts/oracle.mjs`: cross-check against ccusage; `schema/receipt.schema.json`: the `--json` schema
- Docs: `DATA-SOURCES` (log formats, traps), `METRICS` (tiers, formulas, sample customers), `ARCHITECTURE`,
  `CLI`, `LIVE`, `ROASTS` (voice), `PRIVACY`, `I18N`, `SOURCES`

## Commands

Node ≥ 22.12, pnpm.

```bash
pnpm i
pnpm check                 # lint + typecheck + every test; must pass before each commit
pnpm -F core test          # one package (also -F token-damage, -F @token-damage/web)
pnpm -F core sample-month  # sample customer 0041's logs (gitignored); needed in every fresh checkout
pnpm build && pnpm -F token-damage build
HOME=$(mktemp -d) node packages/cli/dist/index.js --fixtures "$PWD/packages/core/fixtures/sample-month" --no-anim
pnpm -F token-damage dev   # the CLI on your own logs
pnpm build:site            # apps/web/dist
pnpm oracle                # daily totals vs ccusage on your real logs (npx, network); exact before a release, never in CI
pnpm oracle:live           # the live pane's totals == the receipt's, for today
```

## Testing

- New log shape: capture real lines, sanitize them (`pnpm -F core sanitize-fixture`), add a fixture and a test.
  Never guess a format; the transcript format is internal and changes.
- The receipt block under `## The receipt` in `docs/CLI.md` is an exact-match test target. Regenerate it from real
  output (`TZ=UTC TOKEN_DAMAGE_NOW=2026-09-23T12:00:00Z`, `--plan 200`, fixtures as above), never by hand, then
  update the snapshot with `vitest -u`.
- Share links are public and permanent. Only add optional keys inside v1, and freeze each new form with a test in
  `apps/web/test/share.test.ts`.
- Note families need ≥ 5 variants that pass the band test, and a Russian version of each in
  `apps/web/i18n/ru.json` → `notes` using the same slots. `en.json` and `ru.json` keep the same keys.
- Live-pane remarks are lowercase ASCII with no digits.

## Gotchas

- The CLI writes `~/.token-damage/state.json`: run fixtures with a throwaway `HOME`. It runs from
  `packages/cli`, so pass absolute fixture paths.
- `apps/web/src/receipt.ts` must not import packages: `build.mjs` imports it from `dist/`, where they may not
  resolve. Precompute into `apps/web/src/fixed.json` (with a test against core) or pass values in.
- If your terminal sets `FORCE_COLOR`, prefix test and CLI runs with `env -u FORCE_COLOR` for plain output.
- Russian copy is written natively, not translated. Keep raw numbers out of noun agreement ("label: N").
- `Math.max(...array)` over per-call data can throw on large logs; use a loop.

## Commits and pull requests

- Imperative subject line, a body when the why isn't obvious. No AI co-author lines or "Generated with" footers:
  the maintainer owns the commits.
- Work on a branch and open a PR against `main`; CI (`check`) and the Cloudflare preview build must pass.
- Releases (maintainer): bump both `package.json`, `packages/cli/src/version.ts`, line 4 of
  `packages/cli/test/__snapshots__/cli.test.ts.snap` and the placeholder in `.github/ISSUE_TEMPLATE/numbers.yml`;
  `pnpm oracle` exact; `pnpm check`; push; tag `vX.Y.Z`. GitHub Actions publishes both packages to npm through
  trusted publishing.
