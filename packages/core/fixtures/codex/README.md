# Codex fixtures

This folder is a Codex home (`CODEX_HOME`): `sessions/YYYY/MM/DD/rollout-*.jsonl` plus `archived_sessions/`.
Real lines come from `~/.codex` rollouts, picked by line number and run through `scripts/sanitize-fixture.ts`
(every string except ids, versions, model names and timestamps is `"x"`, `cwd` is `"/p/a"`). Each file keeps
only the lines its case needs. `test/fixtures.test.ts` fails if any line is not already sanitized.

| Case | File (under `sessions/`) | Origin |
| --- | --- | --- |
| Repeated total, `info: null` | `2026/05/10/…019e1430…` | Real, CLI 0.130.0. Line 29 repeats line 23's total with its stale `last_token_usage`: adds nothing. 2 prompts. |
| Streaming records, service tier | `2026/09/19/…01a0bacd…` | Real, 0.155.1. `token_usage_record` lines are never read; `thread_settings_applied` `default` makes later usage `standard`. 2 prompts. |
| Resumed session | `2026/09/20/…01a0bacd…` | Constructed: same session id as the file above, cumulative counter restarted. Both files count. |
| Total goes backwards | `2026/09/10/…01a08b4d…` | Real, 0.153.4. 38,855,028 → 201,210: `last_token_usage` is used, never a negative delta. |
| No model, totals only, split line | `2025/09/06/…0199200a…` | Constructed: usage before any `turn_context` (priced as `gpt-5`, fallback), totals without `last_token_usage` (deltas), one record split over two lines. |
| Subagent fork, parent present | `2026/08/11/…019ff385…` (parent), `…019ff38c…` (fork) | Real, 0.147.0-alpha.6.5. The fork's first 3 usage lines copy the parent's: dropped. The parent's line after the fork time is not part of the copy. Both count toward root session `019fee34…`. |
| Subagent, parent missing | `2026/07/27/…019fa426…` | Real, 0.143.0. The 4 usage lines written within a second at the head are the replayed burst: dropped. Its prompt is the parent's: not counted. |
| Auto-review thread | `2026/07/10/…019f4c2a…` | Real, 0.144.0-alpha.4. Model `codex-auto-review`, kept as written. |
| Words typed | `2026/09/22/…01a0c5f0…` | Real line structure, **invented text** (excluded from the sanitization test by name). Prompts of 8, 4, 4 and 3 words; a repeated copy of the third; an image part. |
| Archived copy | `../archived_sessions/…019e1430…` | Constructed: a byte copy of the first file. Every event and prompt dedupes away. |

## `expected.json`

Aggregate of the deduped corpus in UTC. `pnpm oracle:fixtures` checks the same per-day totals against ccusage.
- 28 usage events are read; 7 more are dropped as replayed (3 copied from the parent, 4 in the burst).
  The archived copy's 4 dedupe away: 24 calls, 1,100,054 tokens.
- Per day: 2025-09-06 10,500 + 15,400; 2026-05-10 14,537 + 14,838 + 14,910 + 14,867; 2026-07-10 6,221;
  2026-07-27 18,877 + 18,982; 2026-08-12 22,095 + 23,194 + 23,594 + 95,909 (parent) + 21,894 + 22,327 (fork);
  2026-09-11 197,627 + 201,210 + 215,938; 2026-09-19 22,597 + 25,365 + 45,272; 2026-09-20 20,300 + 21,400;
  2026-09-22 12,200.
- 8 sessions; the 4 subagent threads count toward their root sessions.
- Words: 1 + 1 + 1 + 1 (sanitized prompts) + 8 + 4 + 4 + 3 = 23 over 8 prompts.
