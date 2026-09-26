# Antigravity fixture

`antigravity/` is an `ANTIGRAVITY_DATA_DIR` root: `conversations/*.db` and `history.jsonl`. Built by
`pnpm -F core antigravity-fixture <conversations dir> <history.jsonl> <id>...` (`scripts/antigravity-fixture.ts`).

## Source
Two real Antigravity CLI conversations (2026-07-03 and 2026-07-07), the first 60 rows of `gen_metadata` and `steps`
and the first `trajectory_metadata_blob` row of each. Every blob is decoded and re-encoded from its whitelisted
fields only (`scripts/antigravity-proto.ts`: usage numbers, ids, model ids and names, timestamps);
`test/antigravity/fixture.test.ts` fails on any other field. History lines of those conversations keep their ids,
times and types; `display` is replaced by `x` repeated to the same word count (a slash command keeps `/x` plus its
argument count), `workspace` by `/p/a`.

## Traps (constructed, 2026-07-04 UTC)
| Trap | Where | Must contribute |
| --- | --- | --- |
| 1 visible 60 + reasoning 40, no total | `trap-a.db` gen 0 | one call; output 100, cache read 9,000 |
| 2 a retry | `trap-a.db` gen 0, field 17 | one call; input 200, output 30 |
| 3 placeholder model id 1050, no id, no time | `trap-a.db` gen 1 | `model_placeholder_m50` (not priced); time from the trajectory (09:00 UTC) |
| 4 no tokens | `trap-a.db` gen 2 | nothing |
| 5 same response id as trap 1 | `trap-b.db` step 0 | merges with 1: input 1,200, output 100, cache read 9,000, model gemini-3.8-flash, session `trap-a` |
| 6 empty database | `trap-empty.db` | skipped |
| History | `history.jsonl`, conversation `trap-a` | three prompts: 3 + 2 (slash-command arguments) + 2 (shell) words; a bare `/x`, a row without a conversation and an unknown type add nothing |

A malformed blob is not in the corpus: ccusage fails a whole database on one, which would break
`oracle --fixtures`. `test/antigravity/scan.test.ts` covers it.
