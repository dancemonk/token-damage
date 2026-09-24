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

### Where
`$CODEX_HOME` (default `~/.codex`) → `sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl`, plus
`archived_sessions/`. When both hold the same relative path, the active `sessions/` copy wins.

### Structure
Lines have `timestamp`, `type`, `payload`.
- `session_meta`: `id`/`session_id`, `cwd`, `originator`, `cli_version`, `model_provider`.
- `turn_context`: the active model for subsequent usage.
- `event_msg` with `payload.type == "token_count"`: `info.total_token_usage` (cumulative) and
  `info.last_token_usage` (per response), `info.model_context_window`.
- `event_msg` with `payload.type == "thread_settings_applied"` (CLI ≥ 0.144.0): `service_tier` priority/fast vs
  default/standard (pricing tier; inherited by later usage).
- Token fields: `input_tokens` (**includes** cached), `cached_input_tokens`, `cache_write_input_tokens`
  (newer, default 0), `output_tokens` (**includes** reasoning), `reasoning_output_tokens` (informational),
  `total_tokens`.

### Traps (each needs a fixture)
1. Token events exist only from 2025-09-06; some Sept-2025 builds lack `turn_context` → price as fallback model
   and mark `isFallback`.
2. **Resume** writes a new file with the same session id and a **restarted** cumulative counter. Sum per-file
   segments; never overwrite by session id.
3. Newer builds emit streaming `token_usage_record` / `turn_token_usage` snapshots several times per turn.
   Use deltas only when the cumulative total **advances**; never sum snapshots.
4. Codex can overwrite its running total with a synthetic "context window full" value
   (`fill_to_context_window`). A delta must never be negative and never exceed the context window; discard such steps.
5. MultiAgent V2 subagent rollouts replay the parent's history: usage before `task_started` /
   `inter_agent_communication(_metadata)` with `trigger_turn === true` is inherited, not new.
6. `codex-auto-review` is a server-routed alias; effective model must be inferred from a dated table.
7. Normalize: fresh input = `input_tokens − cached_input_tokens`; cache read = `cached_input_tokens`;
   cache write = `cache_write_input_tokens`; output = `output_tokens`. Never add reasoning again.

### Not comparable across providers
Tokenizers and cache semantics differ. Show raw tokens per provider; compare in `≡` dollars and `≈` Wh.

## Tested versions
| Tool | Versions | Fixtures |
| --- | --- | --- |
| Claude Code | 2.1.237, 2.1.281 (real logs 2.1.205–2.1.281 scanned) | `packages/core/fixtures/claude/` |

## Later sources
Gemini CLI and Copilot CLI (ccusage parses both), Cursor/OpenCode (SQLite; Cursor needs a cloud token → opt-in
only), ChatGPT/Claude.ai exports (no token counts; tokenize locally and label `≈`).

## Known divergences from ccusage
Keep this list current. Check with `pnpm oracle` (local logs) and `pnpm oracle:fixtures` (CI).

**None on token totals** as of ccusage 20.0.24 (2026-09-24): the fixture corpus matches exactly (348,051 tokens,
2 days), and so did 24 days of real logs (3.79B tokens) in every field. ccusage has fixed #888 (first-seen
undercount) and #913 (`/btw` overcount), and handles advisor iterations and missing `requestId` the same way.

Not compared, because ccusage does not report them: words typed and prompts. A day with prompts but no model
call exists only on our side, with zero tokens; the oracle skips all-zero days.

Use `ccusage claude daily`, not `ccusage daily`: since v20 the top-level report also includes Codex, Gemini,
OpenCode and Amp logs from the home directory.
