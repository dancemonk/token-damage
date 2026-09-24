# Claude Code fixtures

Lines come from real `~/.claude/projects` transcripts, run through `scripts/sanitize-fixture.ts`: every string
except ids, versions, model names and timestamps is `"x"`, `cwd` is `"/p/a"`. `test/fixtures.test.ts` fails if
any line here is not already sanitized.

One folder per Claude Code version the lines were written by.

| Case | File | Origin |
| --- | --- | --- |
| Normal | `2.1.281/normal.jsonl` | Real. User, attachment and one assistant line. |
| Parallel tool use | `2.1.281/parallel-tool-use.jsonl` | Real. One line per `tool_use` block, same `message.id` + `requestId`, same final usage. |
| Subagent file | `2.1.281/subagent/<parentSessionId>/subagents/agent-<id>.jsonl` | Real. Includes a streaming snapshot pair. |
| Streaming duplicate | `2.1.237/streaming-duplicate.jsonl` | Real (from a subagent file). Snapshots with `output_tokens` 1, 1, 395. |
| Synthetic model | `2.1.237/synthetic-model.jsonl` | Real. `model: "<synthetic>"` error row. |
| Missing `requestId` | `2.1.281/missing-request-id.jsonl` | Constructed: the normal line without `requestId`. Real logs only lacked it on synthetic rows. |
| Advisor iterations | `2.1.281/advisor-iterations.jsonl` | Constructed per DATA-SOURCES §Line shape. No `advisor_message` iteration seen in real logs yet. |
| Sidechain replay (`/btw`) | `2.1.281/sidechain-replay.jsonl` | Constructed: the normal line, then a replay with `isSidechain: true` and a new `requestId`. Not seen in real logs yet. |
| Malformed | `2.1.281/malformed.jsonl` | Constructed to match a real breakage: one record split over two lines mid-string, then a valid line. |

Observed in real logs (2.1.205–2.1.281, 2026-09):
- Streaming snapshots only appear in subagent files. Main files write one line per content block, each with the final usage.
- Every subagent line has `isSidechain: true`, an `agentId` equal to the file name, and the parent's `sessionId`.
- The same `message.id` + `requestId` appears in two main session files with different `sessionId` (resumed sessions).

## `expected.json`

Hand-computed totals for the whole corpus, deduped, in UTC. Derivation:
- 16 parsed events share 8 dedupe keys. Streaming (3 copies), parallel tool use (3 + the valid line in
  `malformed.jsonl`), and the normal line (repeated in the advisor and replay cases) each collapse to one; its split copy in `malformed.jsonl` is not an event.
- The replay (`isSidechain`, new `requestId`) is dropped: its `message.id` has a main-thread copy.
- The missing-`requestId` line is keyed by session, so it stays separate from the normal line: 7 events.
- Subagent snapshots `AVr7Z` (output 4, 160) keep 160; `t96vL` keeps 121.
