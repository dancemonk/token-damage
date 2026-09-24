# Architecture

## Repo
```
token-damage/
  packages/core/           parsing, dedupe, metrics, roasts; zero runtime deps
    src/adapters/claude/   discovery, parser, dedupe (shared by every source)
    src/adapters/codex/    discovery, rollout parser, replay filter
    src/adapters/gemini/   discovery, chat parser (JSONL and older JSON)
    src/adapters/opencode/ discovery, SQLite reader (node:sqlite), legacy message files
    src/aggregate/         events → daily totals, sessions
    src/metrics/           prices.json, pricing, energy, satire
    src/roasts/            facts, note families, scoring, achievements, disputes
    src/receipt/           receipt model → 48-column text, share card SVG, share link
    fixtures/              sanitized transcript lines + expected totals
    scripts/               fixture sanitizer, sample-month generator
  packages/cli/            bin: token-damage (flow, prompts, PNG via @resvg/resvg-js, bundled fonts)
  schema/receipt.schema.json
  scripts/oracle.mjs       compares daily totals with ccusage, per agent
  docs/                    how it works: data sources, metrics, roasts, CLI, privacy
```

## Pipeline
`discover files → stream lines → parse → UsageEvent[] → dedupe → aggregate (Totals, DailyTotals, Sessions)
→ metrics (tiered values) → observations → Receipt model → { terminal text | SVG → PNG | share payload | JSON }`

Everything left of "Receipt model" lives in `core` and is pure: same input, same output. The CLI only does
I/O, prompts, and animation.

## Types (core)
```ts
type Source = "claude-code" | "codex" | "gemini" | "opencode";
interface UsageEvent {
  kind: "usage"; source: Source; sessionId: string; parentSessionId?: string; agentId?: string;
  ts: number;                      // epoch ms, UTC
  model: string; isFallbackModel?: boolean;
  input: number; cacheWrite: number; cacheWrite1h: number /* part of cacheWrite */; cacheRead: number; output: number;
  messageId: string;               // API message id; the sidechain rule matches on it alone
  dedupeKey: string;               // see DATA-SOURCES §Dedupe
  isSidechain?: boolean;
  version?: string;                // tool version that wrote the line (version sniffing)
}
// A typed prompt: only the count survives ingest, never the text. Deduped by line uuid.
interface PromptEvent { kind: "prompt"; source: Source; sessionId: string; ts: number; words: number; dedupeKey: string }
interface TokenSums { input: number; cacheWrite: number; cacheWrite1h: number; cacheRead: number; output: number }
interface Span { start: number; end: number }   // epoch ms
interface DailyTotals { day: string /* local YYYY-MM-DD */; byModel: Record<string, TokenSums>;
  bySource: Partial<Record<Source, TokenSums>>; calls: number;
  sessions: number; subagents: number; prompts: number; wordsTyped: number;
  firstCall: number | null; lastCall: number | null; /* null: prompts but no model call that day */ }
interface SessionSummary { sessionId: string; start: number; end: number; calls: number; subagents: number;
  longestStretch: Span /* split on idle gaps > 1h */ }
interface Totals { tokens: TokenSums; byModel: Record<string, TokenSums>; bySource: Partial<Record<Source, TokenSums>>;
  calls: number; sessions: number; activeDays: number; subagents: number; prompts: number; wordsTyped: number;
  firstCall: number | null; lastCall: number | null; longestSession: Span | null }
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
  timestamps, usage, structure). One folder per tool version (Codex: one Codex home; Gemini CLI and OpenCode: one
  data dir each; versions listed in their READMEs). OpenCode's fixture is a SQLite file built by
  `scripts/opencode-fixture.ts`; a test checks its payloads are sanitized. A regression test per known breakage in
  `DATA-SOURCES.md`.
- `scripts/oracle.mjs` compares daily totals with `ccusage <claude|codex|gemini|opencode> daily --json --offline`; CI fails above 1%.
- Snapshot tests for the 48-column receipt and the SVG for each sample customer.
- A test asserts the share payload and the PNG's text contain no key/value outside the whitelist and none of:
  paths, `cwd`, project names, prompt text.
- Property test: dedupe is idempotent and order-independent.

## Version sniffing
Record `version` from the transcript lines. Unknown major/minor → mark parser confidence "medium" in the scan
output and `--json`. Keep a table of tested versions in `DATA-SOURCES.md`.

## Release
`pnpm check`, bump both package versions, push tag `vX.Y.Z`. The `release` workflow checks again and publishes
`@token-damage/core`, then `token-damage`, with npm provenance.
