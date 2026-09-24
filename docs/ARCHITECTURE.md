# Architecture

## Repo
```
token-damage/
  CLAUDE.md
  docs/                    specs (this folder)
  design/                  mockup sources, prototype, brand kit
  packages/core/           parsing, dedupe, metrics, roasts — zero runtime deps, pure functions
    src/adapters/claude/   discovery, parser, dedupe
    src/adapters/codex/    (V1)
    src/aggregate/         events → daily totals, sessions
    src/metrics/           prices.json, pricing, energy, satire
    src/roasts/            detectors, scoring, templates, achievements, disputes
    src/receipt/           receipt model (tiered values) → text (48 col) and SVG
    fixtures/              sanitized JSONL corpora + expected JSON per tool version
  packages/cli/            bin: token-damage — prompts, animation, PNG (@resvg/resvg-js), share link, files
  apps/web/                static site
  schema/receipt.schema.json
  scripts/oracle.mjs       ccusage comparison
```

## Pipeline
`discover files → stream lines → parse → UsageEvent[] → dedupe → aggregate (Totals, DailyTotals, Sessions)
→ metrics (tiered values) → observations → Receipt model → { terminal text | SVG → PNG | share payload | JSON }`

Everything left of "Receipt model" lives in `core` and is pure: same input, same output. The CLI only does
I/O, prompts, and animation.

## Types (core)
```ts
type Source = "claude-code" | "codex";
interface UsageEvent {
  source: Source; sessionId: string; parentSessionId?: string; agentId?: string;
  ts: number;                      // epoch ms, UTC
  model: string; isFallbackModel?: boolean;
  input: number; cacheWrite: number; cacheRead: number; output: number;   // tokens
  messageId: string;               // API message id; the sidechain rule matches on it alone
  dedupeKey: string;               // see DATA-SOURCES §Dedupe
  isSidechain?: boolean;
  version?: string;                // tool version that wrote the line (version sniffing)
}
interface DailyTotals { day: string /* local YYYY-MM-DD */; byModel: Record<string, TokenSums>; calls: number;
  sessions: number; subagents: number; wordsTyped: number; firstCall: number; lastCall: number; }
type Tier = "measured" | "priced" | "estimated" | "satire";
interface Value<T = number> { value: T; tier: Tier; low?: number; high?: number; note?: string }
interface Receipt { period: {start: string; end: string}; measured: {...}; priced: {...}; estimated: {...};
  satire: {...}; damageClass: string; note: {id: string; text: string}; achievements: string[]; dispute?: {...} }
```
The receipt model is the single source for all outputs; renderers never compute.

## Storage
`~/.token-damage/history.json` (daily aggregates, merged on every run, never text), `state.json` (cooldowns,
achievements, last guess). SQLite is not needed for MVP. Migrate to SQLite only if history exceeds ~10 MB.

## Testing rules
- Every parser behaviour has a fixture built from **sanitized real lines** (text → "x", cwd → "/p/a", keep ids,
  timestamps, usage, structure). One folder per tool version. A regression test per known breakage in
  `DATA-SOURCES.md`.
- `scripts/oracle.mjs` compares daily totals with `ccusage --json --offline`; CI fails above 1%.
- Snapshot tests for the 48-column receipt and the SVG for each sample customer.
- A test asserts the share payload and the PNG's text contain no key/value outside the whitelist and none of:
  paths, `cwd`, project names, prompt text.
- Property test: dedupe is idempotent and order-independent.

## Version sniffing
Record `version` from the transcript lines. Unknown major/minor → mark parser confidence "medium" in the scan
output and `--json`. Keep a table of tested versions in `DATA-SOURCES.md`.

## Release
`pnpm check` → changeset → `npm publish --provenance` from CI (trusted publishing). Tag `vX.Y.Z`.
The site deploys from `apps/web` on push to `main`.
