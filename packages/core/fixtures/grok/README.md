# Grok Build fixture

`grok/` is a `GROK_HOME`: `sessions/p/<session>/updates.jsonl` and `summary.json`. Built by
`pnpm -F core grok-fixture ~/.grok/sessions` (`scripts/grok-fixture.ts`), then
`pnpm exec prettier --write "packages/core/fixtures/grok/**/*.json"`.

## Source
The owner's three real Grok Build sessions (CLI 1.0.40, 2026-09-21/22 local), one of them with a completed turn:
`grok-4.7`, 13 model calls, 741,703 input tokens of which 462,080 cached, 3,962 output (2,292 of it reasoning). Only
`user_message_chunk`, `agent_message_chunk`, `agent_thought_chunk` and `turn_completed` lines are kept, each through
`sanitize-fixture` (text becomes `x`; ids, event kinds and `modelUsage` model keys stay); the project directory (an
encoded path) is renamed `p`; `summary.json` goes through the same sanitizer (`cwd` becomes `/p/a`).

This is little real data (owner's decision, 2026-09-26): the traps below stand in for what one turn cannot show.

## Traps (invented, 2026-09-23 UTC, session `trap-a`)
| Trap | Must contribute |
| --- | --- |
| Two user chunks, then an agent chunk | one prompt, 4 words |
| A turn with two models (`grok-4.7`, `grok-4.5-build`) | `grok-4.7`: input 200, cache read 800, output 40, 3 calls; `grok-4.5`: input 350, cache write 50, cache read 100, output 20, 1 call |
| The same turn again in `trap-b` (a resumed copy, same event id) | nothing |
| A cancelled turn (no `usage`) | nothing |
| A turn without `modelUsage` | `grok-4.7` from `summary.json`: input 300, output 5, 2 calls |
| A turn without an event id | input 150, cache read 50, output 7, 1 call |

Day total 2,072 tokens, 7 model calls, 1 prompt.
