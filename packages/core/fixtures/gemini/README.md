# Gemini CLI fixtures

`tmp/` is a Gemini CLI data dir (`GEMINI_DATA_DIR`, default `~/.gemini/tmp`): `<project>/chats/session-*.jsonl`,
subagents in `<project>/chats/<parent session id>/`. Real files come from `~/.gemini/tmp` (Gemini CLI 0.42), run
whole through `scripts/sanitize-fixture.ts` (every string except ids, model names, timestamps and the header's
`kind` is `"x"`); project folders are renamed `p1`, `p2`. `test/fixtures.test.ts` fails if any line is not already
sanitized.

| Case | File (under `tmp/`) | Origin |
| --- | --- | --- |
| Two models, a rewritten response | `p1/chats/…e1b7bbb6.jsonl` | Real. gemini-3-flash-preview and gemini-3.1-pro-preview; one response written twice with tokens: the last copy counts. `$set` lines skipped. |
| Plain session | `p1/chats/…a75aa971.jsonl` | Real. 9 responses, 4 written twice. |
| Resumed session, tokens arrive later | `p2/chats/…f88c20d5.jsonl` | Real. Two headers (resumed); 9 responses first written without tokens, 8 written again with them. |
| Subagent | `p2/chats/f88c20d5-…/5ab0c0de-….jsonl` | Constructed: `kind: "subagent"` in its parent's folder. Counts toward session `f88c20d5…`; its prompt is not the user's. |
| Older whole-file JSON | `p3/chats/…1e9ac701.json` | Constructed: `messages[]`. A response without a timestamp is dated at `startTime`; 250,000 input with 200,000 cached is long context for gemini-2.5-pro; a response without a model is dropped. |
| Traps | `p3/chats/…7a0c0de2.jsonl` | Constructed, **invented text**. `displayContent` (2 words) beats `content` (10); a tool-result-only message is no prompt; a malformed line; a model-less response before any model is dropped; a model carries forward; total with cached inside input vs on top; tokens only the total has go to output, or to thinking when there is output; fractions, strings, negatives; all-zero usage; `created_at` and `prompt_tokens`-style keys; `$set.messages` never read; `gemini-3-pro-preview`, not on Google's page, priced as gemini-3.1-pro-preview (est.). |
| Prompt log | `p1/logs.json` | Constructed. Outside `chats/`: never opened. |

## `expected.json`

Aggregate of the deduped corpus in UTC. `pnpm oracle:fixtures` checks the same per-day totals against ccusage.
- 26 calls, 555,226 tokens. Per day: 2025-10-02 256,300; 2025-10-03 7,100 (3,170 + 1,500 + 800 + 700 + 600 + 330);
  2026-04-28 42,464; 2026-05-18 76,429; 2026-05-30 172,933 (160,433 + the subagent's 12,500).
- 5 sessions, 1 subagent, 8 prompts, 11 words.
