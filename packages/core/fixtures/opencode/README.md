# OpenCode fixtures

`opencode/` is an OpenCode data dir (`OPENCODE_DATA_DIR`, default `~/.local/share/opencode`). Built by
`scripts/opencode-fixture.ts` from a real `opencode.db` (OpenCode 1.17.15 and 1.17.18): the real `session`,
`message`, `part` and `session_message` schema; every session and message row, with each payload run through
`scripts/sanitize-fixture.ts` (every string except ids, roles and model names is `"x"`, `cwd` is `/p/a`); only the
parts of user messages. Session columns other than `id`, `parent_id` and `version` are `"x"`. Then the constructed
traps below are added (rows with ids `msg_trap_*`, `msg_v2_*`, `prt_trap_*`; **invented text**).
`test/opencode/scan.test.ts` fails if any other payload is not already sanitized. Rebuild after an OpenCode format
change: `pnpm -F core opencode-fixture <opencode.db>`.

| Case | Where | Origin |
| --- | --- | --- |
| Real sessions | `opencode.db` `message` | Real. gpt-5.5 (provider `openai`, `cost` 0) with reasoning tokens; glm-5.2, kimi-k2.7-code, qwen3.7-plus (provider `opencode-go`, `cost` recorded). 3 subagent sessions (`session.parent_id`). 4 failed calls with all-zero tokens: dropped. |
| Real prompts | `opencode.db` `part` | Real, text `"x"`. One synthetic text part: not the user's. |
| Only a total | `msg_trap_total_only` | `tokens: {total: 1000}`: all 1,000 are output. |
| Reasoning and extra total | `msg_trap_total_extra` | 100 in, 50 out, 25 reasoning, 200 cache read, total 400: output 100 (50 + 25 + the 25 only the total has). |
| No provider, all zero | `msg_trap_no_provider`, `msg_trap_zero` | Dropped, as ccusage does. |
| Odd values | `msg_trap_cache_not_object`, `msg_trap_string_tokens` | `cache: 7` is no cache; `input: "100"` and `total: "500"` are no count. |
| Claude names | `msg_trap_claude_dotted`, `msg_trap_vendor_prefix` | `claude-sonnet-4.5` (github-copilot) → claude-sonnet-4-5; `anthropic/claude-opus-4.1` (openrouter) → claude-opus-4-1. Both priced exactly. |
| Nested subagents | sessions `ses_trap_child`, `ses_trap_grandchild` | Grandchild → child → root: both count toward `ses_trap_root`; the child's prompt is not the user's. |
| Long context | `msg_trap_gemini_long` | gemini-2.5-pro, 150K fresh + 60K cached > 200K: long-context price. |
| Alias | `msg_trap_alias` | `gemini-3-pro-high` → gemini-3-pro-preview, priced as a guess (not on Google's page). |
| Not an object | `msg_trap_not_json`, `msg_trap_array` | Skipped. |
| Typed words | `msg_trap_user` | 7 typed words; a synthetic text part and a file part add none. |
| OpenCode v2 rows | `session_message` | `model: {id, providerID}`; a user row; a payload without `time.created` dated by `time_created`; an id already in `message` (first copy counts); an assistant row without tokens. |
| Legacy files | `storage/message/` | `msg_legacy_1.json` counts; `ses_trap_root/msg_trap_total_only.json` is named after a database id, so never read (its 10M tokens would show); `renamed.json` holds a database id, so it is a duplicate; a user message has no usage. |
| Channel database | `opencode-beta.db` | Next to `opencode.db`, so never opened (its 16M tokens would show). |

## `expected.json`

Aggregate of the deduped corpus in UTC. `pnpm oracle:fixtures` checks the same per-day totals against ccusage.
- 147 calls (136 real, 8 constructed in `message`, 2 in `session_message`, 1 legacy file), 9,054,733 tokens.
  Per day: 2026-07-08 1,238,597; 2026-07-10 235,095 (1,000 + 400 + 15 + 20 + 13,800 + 4,620 + 211,000 + 780
  + 3,460); 2026-07-11 1,416 (1,350 + 66); 2026-07-12 7,579,625.
- 5 sessions, 4 subagents, 10 prompts, 20 words.
