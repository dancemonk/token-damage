# Contributing

Thanks for looking. Token Damage is small on purpose, and a few rules keep it honest.

## Setup

```
pnpm i
pnpm check          # lint + typecheck + every test; must pass before a commit
pnpm -F token-damage dev -- --fixtures packages/core/fixtures/sample-month   # the receipt on sample data
pnpm -F token-damage dev -- live      # the live pane on your own logs
```

Node 22.12 or newer for development. The repo is a pnpm workspace:

- `packages/core`: parsing, dedupe, metrics, the live engine and the roast engine. No runtime dependencies.
- `packages/cli`: `npx token-damage`. Its only runtime dependency is `@resvg/resvg-js`; ask before adding another.
- `apps/web`: [tokendamage.com](https://tokendamage.com), static, no framework.

## The rules

1. **Nothing leaves the machine.** No network calls in the CLI, no telemetry.
2. **Never store prompt text.** Prompts are reduced to a word count while parsing. No prompts, file paths, project names or code in any output or file.
3. **Every number wears its label.** Plain is measured, `≡` is list price, `≈` is an estimate shown as a range, `✶` is satire (red, and never a real number).
4. **A wrong number is worse than a boring one.** Token totals must match [ccusage](https://github.com/ryoppippi/ccusage): `pnpm oracle` checks your own logs, `pnpm oracle:fixtures` the fixture corpora (it runs in CI).

## When an agent's log format changes

Don't guess. Capture the real lines as a fixture, sanitized, and write a test:

```
cd packages/core
node --experimental-strip-types scripts/sanitize-fixture.ts <file.jsonl> <line|from-to>...
```

The sanitizer keeps structure, ids, usage and timestamps and replaces every other string, so no prompt text reaches the repo. A test enforces that every fixture is already sanitized. The formats and their traps are in [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md).

## Reporting wrong numbers

Use the "Numbers look wrong" issue form. Numbers and versions are enough. Please don't paste transcripts or log lines: they contain your prompts.

## Commits

Imperative, one line, plus a body when the why isn't obvious. `pnpm check` green before every commit.
