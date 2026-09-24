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
