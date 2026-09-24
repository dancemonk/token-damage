# Data sources

Everything here was checked against Anthropic's docs, the Codex source, and the ccusage source on
2026-09-24. Anthropic says of the transcript format: *"The entry format is internal to Claude Code and
changes between versions, so scripts that parse these files directly can break on any release."*
Assume breakage every few months. Keep fixtures per tool version and a regression test per known break.

## Claude Code

### Where
- `~/.claude/projects/<project>/<sessionId>.jsonl` (flat, older) and
  `~/.claude/projects/<project>/<sessionId>/…jsonl` (nested, newer). Scan `projects/` **recursively**.
- Also scan the legacy root `~/.config/claude/projects/`.
- `CLAUDE_CONFIG_DIR` overrides the root and may be **comma-separated** (several roots; combine).
- `CLAUDE_CODE_PROJECT_DIR_NAME` can rename `<project>`; irrelevant to us, we never use the name.
- `<project>` is the working directory with non-alphanumerics replaced by `-`; over 200 chars it is truncated
  and hashed. **Never print or store it.** Internally it is only a grouping key; surface it as "Project A/B/C".
- Subagents: `<project>/<sessionId>/subagents/agent-<id>.jsonl` (+ `agent-<id>.meta.json` with `agentType`,
  `spawnDepth`). Attribute to the parent session; show as "interns".
- SDK / `claude -p` sessions may appear as top-level sessions (`entrypoint: "sdk-py"` etc.). Count them.
- Transcripts are not written when `CLAUDE_CODE_SKIP_PROMPT_HISTORY` is set or `claude -p --no-session-persistence`
  is used. Say so in the scan output if zero files are found.

### Retention (this is a feature for us)
- `cleanupPeriodDays` defaults to **30**, minimum **1**; `0` fails validation. Sweep runs at startup, by file age.
- Sessions started or last continued in Claude Desktop / Cowork are kept indefinitely (v2.1.248+) unless
  `desktopSessionCleanupPeriodDays` is set.
- Subagent transcripts are deleted with their parent.
- Product behaviour: on first run, if retention is at default, say "Claude Code has already deleted anything
  older than 30 days. We'll keep aggregates from now on." Offer (never silently set) a higher value, e.g. 3650.
  We keep only aggregates in `~/.token-damage/history.json`, never transcripts.

### Line shape (assistant lines with usage)
```json
{"type":"assistant","timestamp":"2026-09-12T04:38:42.296Z","sessionId":"…","cwd":"/…","version":"2.1.268",
 "requestId":"req_…","uuid":"…","parentUuid":"…","isSidechain":false,
 "message":{"id":"msg_…","model":"claude-opus-4-6","role":"assistant",
   "usage":{"input_tokens":2,"cache_creation_input_tokens":55866,"cache_read_input_tokens":0,"output_tokens":289,
            "service_tier":"standard",
            "iterations":[{"type":"message","model":null,"input_tokens":2,"output_tokens":289,…}]}}}
```
- Token fields: `input_tokens` (fresh, **excludes** cache), `cache_creation_input_tokens`, `cache_read_input_tokens`,
  `output_tokens`. Any may be missing → treat as 0.
- `usage.cache_creation` splits cache writes by TTL: `ephemeral_5m_input_tokens` and `ephemeral_1h_input_tokens`
  (priced at 1.25× and 2× input). Main-thread writes are 1-hour, subagent writes 5-minute (2.1.2xx).
- `costUSD` was removed in v1.0.9. Never expect it. Price from our own table.
- `message.model === "<synthetic>"` are error/auth placeholder rows: **exclude**.
- `usage.iterations[]` with `type: "advisor_message"` carry their own `model` and tokens: count each as a
  separate event under its own model; the top-level usage stays with the main model. Other iteration types
  are already included in the top-level usage: do not add them again.
- `speed`/`service_tier` may appear; keep for future pricing tiers, ignore for now.
- `gitBranch` may exist. Never store it.

### Dedupe (credibility depends on this)
Claude Code writes the same API response more than once: streaming snapshots, parallel tool use sharing a
`message.id`, retries, and copies into multiple session files.
1. Key = `(message.id, requestId)` when `requestId` exists, matched **across all files**.
   When `requestId` is missing: key = `(message.id, sessionId)` (gateway responses can reuse a message id in
   different sessions; keep those separate).
2. On collision: keep **one** event whose usage is the **per-field maximum** across duplicates (the final
   streaming snapshot has the largest `output_tokens`). First-seen dedupe undercounts output ~5× (ccusage #888);
   summing duplicates overcounts 2–4×.
3. Sidechains: `/btw` (`aside_question`) files replay parent messages with the same `message.id` but a different
   `requestId`, including the parent's cache reads. When duplicates by `message.id` exist and at least one carries
   `isSidechain: true`, keep the non-sidechain one and drop the replay. Distinct sidechain responses with their
   own ids are real and counted (ccusage #913 overcounted `/btw` at $6–10 vs ~$0.08 real).
4. Lines without `message.id` and without usage are not events.

### Words typed
User prompts are `type: "user"` lines. Count words only when:
- `message.content` is a string, or an array whose blocks are `type: "text"`;
- the line is **not** a tool result (`content[].type === "tool_result"`), not `isMeta`, not a system/interrupt
  message ("[Request interrupted…]"), and not a slash-command expansion (`<command-name>`/`<command-message>` tags;
  keep only the user's own argument text if present).
- Pasted content is the user's text: count it. Split on whitespace; count tokens containing at least one
  letter or digit. Discard the text immediately after counting.
- A person wrote it. When `origin` is present, count only `origin.kind === "human"`: `auto-continuation`
  (an approved plan fed back in), `task-notification` and `peer` are not typed. Without `origin`, skip SDK
  scripts (`promptSource: "sdk"` or `entrypoint: "sdk-…"`). Claude Desktop prompts are `origin: human` with
  `promptSource: "sdk"`: count them. On real logs, SDK scripts were a third of all "prompt" words.
- Not in a subagent file, not `isSidechain` (the agent wrote those), not `isCompactSummary`.
- Formats seen (2.1.2xx): `<pasted>…</pasted>` wraps pastes (count); `<bash-input>` is a `!` shell command the
  user typed (count it); `<task-notification>`, `<local-command-stdout>`, `<local-command-caveat>`,
  `<bash-stdout>`/`<bash-stderr>` and `<system-reminder>` are Claude Code's (skip).
- Resumed sessions copy earlier prompts into the new file: dedupe prompts by the line's `uuid`, keep the earliest.

### Sessions and time
- `timestamp` is ISO 8601 UTC. Convert to the machine's local time zone for days, hours, "3:47 AM".
- Session = `sessionId`. Longest session = first→last event span; split the span on idle gaps > 1h, so breaks and overnight pauses end a stretch.
- Model calls = number of deduped assistant events. Subagents = distinct `agentId` (or subagent files).

### Other channels (V1)
- **OpenTelemetry** (`CLAUDE_CODE_ENABLE_TELEMETRY=1`): metrics `claude_code.session.count`, `.token.usage`
  (attribute `type` ∈ input/output/cacheRead/cacheCreation), `.cost.usage`, `.lines_of_code.count`,
  `.commit.count`, `.pull_request.count`, `.code_edit_tool.decision`, `.active_time.total`; events
  `user_prompt`, `assistant_response`, `tool_result`, `tool_decision`, `api_request`, `api_error`. Prompt text is
  redacted unless `OTEL_LOG_USER_PROMPTS=1` (we never set it). A tiny local OTLP receiver gives forward-only,
  officially supported data; JSONL stays the history source.
- **Statusline** input JSON includes session `cost.total_cost_usd` — good for a live meter and a cross-check.
- **Hooks**: `SessionEnd` receives `transcript_path`; can trigger an incremental ingest.

## Codex (V1)

Rules below match ccusage 20.0.24 (`rust/adapters/codex/src/`), checked with `pnpm oracle --agent codex`.
Code: `packages/core/src/adapters/codex/`. Fixtures: `packages/core/fixtures/codex/` (a Codex home).

### Where
`$CODEX_HOME` (comma-separated; default `~/.codex`) → `sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl`, plus
`archived_sessions/`. When both hold the same relative path, the active `sessions/` copy wins.

### Structure
Lines have `timestamp`, `type`, `payload`. Only four kinds are read; everything else (tool calls, reasoning,
messages, `world_state`) is skipped unparsed.
- `session_meta` (first line): `id` (this thread), `session_id` (the root session; equal to `id` on main threads),
  `cli_version`, `source`. `source` is a string (`cli`, `vscode`, …) on main threads and an object
  `{subagent: …}` on threads another thread started: `thread_spawn.parent_thread_id` for spawned agents, `other`
  for auto-review and similar. `forked_from_id` marks a fork.
- `turn_context`: `model`, the active model for later usage.
- `event_msg` / `token_count`: `info.total_token_usage` (cumulative) and `info.last_token_usage` (per response).
  `info` is `null` on rate-limit-only updates.
- `event_msg` / `thread_settings_applied` (CLI ≥ 0.144.0): `thread_settings.service_tier` `priority`/`fast` →
  fast, `default`/`standard` → standard (Desktop writes `standard`). Inherited by later usage; a settings event
  without the key keeps the tier, an unknown value clears it. Kept on each event as `serviceTier`.
- `event_msg` / `item_completed` with `item.type == "UserMessage"`: a prompt. Words = text parts only.
  Dedupe key `turn_id:item.id`. Prompts in subagent rollouts were written by the parent thread: not counted.
- Token fields: `input_tokens` (**includes** cached input and cache writes), `cached_input_tokens`,
  `cache_write_input_tokens` (newer, default 0), `output_tokens` (**includes** reasoning),
  `reasoning_output_tokens` (informational), `total_tokens` (0 or missing → input + output).

### Per-response usage
Per rollout file: use `last_token_usage` when the cumulative total differs from the previous line's total
(first line included); otherwise use `total − previous total` (saturating per field). A repeated total therefore
adds nothing (289 such lines in real logs; summing `last_token_usage` would double-count them). Cap
`cached ≤ input` and `cacheWrite ≤ input − cached`, then skip all-zero usage.
Normalize: fresh input = `input − cached − cacheWrite`; cache read = `cached`; cache write = `cacheWrite`;
output = `output`. Never add reasoning again.

### Traps (each has a fixture)
1. No `turn_context` before the first usage (Sept-2025 builds) → model `gpt-5`, `isFallbackModel`. A later
   `turn_context` ends the fallback.
2. **Resume** writes a new file with the same session id and a **restarted** cumulative counter. Totals are
   tracked per file; the two files count as one session.
3. Newer builds also write top-level `token_usage_record` lines (streaming snapshots, 3,489 in real logs). Never
   read them: `token_count` alone has the per-response numbers.
4. The total can go **backwards** (counter restarted inside one file). The total changed, so
   `last_token_usage` counts; no negative deltas.
5. **Replayed history.** A fork (`forked_from_id`) or spawned subagent (`thread_spawn.parent_thread_id`) may
   start by copying its parent's usage. Its parent is the first other rollout whose `id` is that thread. The
   copy is the parent's usage up to the child's `session_meta` time; drop child events while they equal it in
   order (all six raw fields). If the first child event does not match (parent log missing, or history
   rewritten), check the head of the file: when its first two `token_count` lines with usage are ≤ 1 s apart, the
   copy is a rewritten burst; drop events while each is ≤ 1 s after the previous one. In real logs this dropped
   826 events (4 prefix-matched forks, 8 bursts).
6. `codex-auto-review` is a server-routed alias. We keep it as the model name and set `priceAs` to the model
   it probably ran on that UTC day (ccusage's timeline: `gpt-5.4` from 2026-03-05, `gpt-5.6-luna` from
   2026-07-30, older `*-codex` models before, `gpt-5` first). Priced as that model, always marked `est. model`.
7. The same response can appear in several files (archive copies, forks). Dedupe globally on
   `(timestamp ms, model, input, cached, cacheWrite, output, reasoning, total)`; conflicting tiers keep standard.

### Sessions
A subagent's usage counts toward its root session (`session_id`, or the spawning thread's root when `session_id`
repeats the thread's own id), as one subagent. 202 of 275 real rollouts are subagents.

### Not comparable across providers
Tokenizers and cache semantics differ. Show raw tokens per provider; compare in `≡` dollars and `≈` Wh.

## Tested versions
| Tool | Versions | Fixtures |
| --- | --- | --- |
| Claude Code | 2.1.237, 2.1.281 (real logs 2.1.205–2.1.281 scanned) | `packages/core/fixtures/claude/` |
| Codex | 0.130.0, 0.143.0, 0.144.0-alpha.4, 0.147.0-alpha.6.5, 0.153.4, 0.155.1 (real logs 0.130.0–0.155.1, 275 rollouts) | `packages/core/fixtures/codex/` |

## Later sources
Gemini CLI and Copilot CLI (ccusage parses both), Cursor/OpenCode (SQLite; Cursor needs a cloud token → opt-in
only), ChatGPT/Claude.ai exports (no token counts; tokenize locally and label `≈`).

## Known divergences from ccusage
Keep this list current. Check with `pnpm oracle` (local logs) and `pnpm oracle:fixtures` (CI).

**None on token totals** as of ccusage 20.0.24 (2026-09-24): the fixture corpus matches exactly (348,051 tokens,
2 days), and so did 24 days of real logs (3.79B tokens) in every field. ccusage has fixed #888 (first-seen
undercount) and #913 (`/btw` overcount), and handles advisor iterations and missing `requestId` the same way.

Codex (`ccusage codex daily`, 2026-09-24): the fixture corpus matches exactly (1,100,054 tokens, 9 days), and so
did 44 days of real logs (1.96B tokens) in every field. Model names differ on purpose: ccusage reports
`codex-auto-review` usage under its dated guess (`gpt-5.4`, `gpt-5.6-luna`); we keep the alias. List price on
the same logs: $1,031.65 ours, $1,021.69 ccusage; the difference is exactly our $9.96 of `gpt-6-sol`, which
ccusage does not price. We do not read
the "headless" `codex exec --json` shapes ccusage also accepts (a top-level `usage` object); none appear in rollouts.

Not compared, because ccusage does not report them: words typed and prompts. A day with prompts but no model
call exists only on our side, with zero tokens; the oracle skips all-zero days.

Use `ccusage claude daily` / `ccusage codex daily`, not `ccusage daily`: since v20 the top-level report mixes
Claude Code, Codex, Gemini, OpenCode and Amp logs from the home directory.
