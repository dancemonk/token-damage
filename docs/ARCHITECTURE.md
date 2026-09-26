# Architecture

## Repo
```
token-damage/
  packages/core/           parsing, dedupe, metrics, roasts; zero runtime deps
    src/agents.ts          each agent's name, short name, provider scope (pure; the website imports it)
    src/adapters/contract.ts, registry.ts   the Adapter contract and ADAPTERS, one per agent
    src/adapters/claude/   discovery, parser, dedupe (shared by every source)
    src/adapters/codex/    discovery, rollout parser, replay filter
    src/adapters/gemini/   discovery, chat parser (JSONL and older JSON)
    src/adapters/opencode/ discovery, SQLite reader (node:sqlite), legacy message files
    src/adapters/antigravity/ discovery, protobuf reader, SQLite rows, id merge, prompt history
    src/adapters/sqlite.ts the shared read-only SQLite helper
    src/aggregate/         events → daily totals, sessions
    src/metrics/           prices.json, pricing, energy, satire
    src/roasts/            facts, note families, scoring, achievements, disputes
    src/receipt/           receipt model → 48-column text, share card SVG, share link; glyphs.ts: bars, sparkline
    src/live/              live engine: watching, tailing, turns, cache, voice; pane and status line share it
    src/web.ts             browser-safe entry (@token-damage/core/web): share codec, formats, note templates
    fixtures/              sanitized transcript lines + expected totals
    scripts/               fixture sanitizer, sample-month generator
  packages/cli/            bin: token-damage (flow, prompts, PNG via @resvg/resvg-js, bundled fonts)
  apps/web/                tokendamage.com: static, no framework, one folder per language (docs/I18N.md)
    i18n/                  site copy per language; en.json is the schema
    templates/             page HTML with {{t:key}} slots, no copy of their own
    src/                   page scripts (TS → native ESM), receipt markup, fixed.json (never translated)
    scripts/build.mjs      node scripts/build.mjs --langs en,ru → dist/, dist/ru/
  schema/receipt.schema.json
  scripts/oracle.mjs       release-time second opinion: daily totals vs ccusage, per agent
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
interface Receipt { period: {start: string; end: string}; measured: {...; daily: {day: string; tokens: Value}[]};
  priced: {...}; estimated: {...}; satire: {...};
  damageClass: {name: string; finePrint: string; next: {name: string; at: number} | null; progress: number};
  note: {id: string; text: string}; achievements: string[]; dispute?: {...} }
```
The receipt model is the single source for all outputs; renderers never compute.

## Storage
`~/.token-damage/state.json` (run counter, note cooldowns, pool deck; never text) and, for `live` and
`statusline`, `today.json` (see Live). No history file yet: every run re-reads the logs, so a receipt covers
only what the agents have not deleted. A future history file holds daily aggregates only, never text.

## Live

`packages/core/src/live/` (pure, zero dependencies) feeds two thin CLI shells: `token-damage live` (a pane)
and `token-damage statusline` (rows in Claude Code's own status line). One engine, one truth model, shared.

- `day.ts` — local midnight, day string, day math; correct across DST.
- `sources.ts` — `LiveSources`: finds today's files per agent, reads them whole (`scanAll`) or polls for
  changes (`poll`).
- `tail.ts` — byte-offset reads of an appended file; rewrite detection is by size only.
- `engine.ts` — `LiveEngine`: holds today's usage and prompts, stamps class-upgrade tape events, rolls the
  day over at local midnight.
- `turns.ts` — `buildTurns`: prompt-to-prompt attribution per session, the open turn, intern counts.
- `snapshot.ts` — `buildSnapshot`: today's records → `LiveSnapshot` (tokens, price, rate, turns, limits)
  through the receipt's own `aggregate()`; the damage class and its progress-to-next share `roasts/classes.ts`'s
  one threshold table with the receipt.
- `cache.ts` — `~/.token-damage/today.json`: atomic read/write, hashes any id that looks like a path.
- `voice.ts` — the adjuster's live remarks: detectors on (previous snapshot, next snapshot), cooldown, a
  per-day rotation of its own.
- `view.ts` — `LiveSnapshot` → the pane's ANSI lines at any width and height.
- `statusline.ts` — `LiveSnapshot` → Claude Code status line rows; stdin parsing; the fallback row.

**Truth model.** The snapshot is authoritative: `buildSnapshot` runs the same `aggregate()` the receipt uses,
over today's usage and prompts. Between snapshots, the delta path only fills the seconds in between: Claude
Code lines are read by byte offset and accumulate; Codex, Gemini CLI and OpenCode have no cheap per-line delta,
so a rescan replaces that agent's whole pool in the engine whenever any of its files changed. A full reconcile
(`scanAll`) runs every 5 minutes, whenever a new file appears, and at cold start; each run reads only files
that can hold today's records — Claude files modified since local midnight, Codex rollouts modified in the
last 48 hours (fork parents can be older than today), Gemini chats modified today, and OpenCode's whole
database — marking everything older so it is not stat'ed again until the next reconcile. Cold start on real
logs takes about a second. Idle time and the "printing" state only look at calls at or before the snapshot's
clock; the totals themselves cover the whole day, the same as the receipt. Tests assert the delta equals a
fresh snapshot at every reconcile; `pnpm oracle:live` checks that same equality against the receipt's own
daily totals on real logs.

**Cache.** `~/.token-damage/today.json`, next to `state.json`: today's deduped usage and prompt events
(numbers, model names, message ids), per file its path hash with a byte offset or a last-seen mtime, tape
events, the adjuster's voice rotation, and the last plan-limit numbers. Any id that looks like a path
(contains `/` or `\`) is hashed before it is written, including the keys the adjuster uses to remember what it
already said. Written atomically (temp file, then rename). Discarded and rebuilt every day.

**Failure handling.** A tick that can't read the logs keeps the pane's last good frame on screen. Three
consecutive failures restore the terminal and exit 1 with `token-damage live: could not read the agent logs
(<errno code>)` — never the error's own message, which can hold a path.

`live` and `statusline` are thin shells over this engine: they parse flags, watch the filesystem, print, and
own the cache's read/write cadence. All computation is in `core`.

## Testing rules
- Every parser behaviour has a fixture built from **sanitized real lines** (text → "x", cwd → "/p/a", keep ids,
  timestamps, usage, structure). One folder per tool version (Codex: one Codex home; Gemini CLI and OpenCode: one
  data dir each; versions listed in their READMEs). OpenCode's fixture is a SQLite file built by
  `scripts/opencode-fixture.ts`; a test checks its payloads are sanitized. A regression test per known breakage in
  `DATA-SOURCES.md`.
- Each fixture corpus has a hand-derived `expected.json` (totals, per day, sessions); `aggregate.test.ts` asserts it exactly.
  That is the CI check. `scripts/oracle.mjs` compares daily totals with
  `ccusage <claude|codex|gemini|opencode> daily --json --offline` on real logs as a second opinion before each release
  (`pnpm oracle`); it is not run in CI.
- Snapshot tests for the 48-column receipt and the SVG for each sample customer.
- A test asserts the share payload and the PNG's text contain no key/value outside the whitelist and none of:
  paths, `cwd`, project names, prompt text.
- Property test: dedupe is idempotent and order-independent.

## Version sniffing
Record `version` from the transcript lines. Unknown major/minor → mark parser confidence "medium" in the scan
output and `--json`. Keep a table of tested versions in `DATA-SOURCES.md`.

## Release
`pnpm check`, bump both package versions, push tag `vX.Y.Z`. The `release` workflow checks again and publishes
`@token-damage/core`, then `token-damage`, with npm provenance. It authenticates through npm trusted
publishing (OIDC): no npm token is stored in the repo or its secrets. Each package's trusted publisher on npmjs.com
names `dancemonk/token-damage` and `release.yml`; renaming the workflow file breaks publishing until both are updated.
