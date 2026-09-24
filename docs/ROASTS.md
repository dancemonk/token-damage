# The observation engine, roasts, achievements, disputes

## Voice: The Adjuster
A tired insurance adjuster who has seen everything and is still surprised by you.
1. Numbers do the talking. "+95% in 3 months" beats "RAM prices are insane". If a line needs an adjective, cut it.
2. Mock the situation and the machine, never the person's intelligence or job.
3. Dry, developer-aware, occasionally absurd. No meme slang, no emoji, no exclamation marks.
4. No moralizing anywhere near an `≈` line.
5. A roast may only claim what the data measured. "You edited CLAUDE.md mid-session" requires the evidence.
6. Severity must match the data. 2M tokens is never "a financial crime".

## Architecture (deterministic; offline; testable)
1. **Detectors** compute facts with a confidence: tokens per commit, late-night minutes, cache invalidations
   (cache write spike with no idle gap), subscription multiple, typed-to-read ratio, session churn, subagent
   count, weekend share, compactions, personal records vs own history, quiet week.
2. **Scoring**: surprise (z-score vs the user's own history; on first run vs the sample distribution),
   specificity, confidence (MEASURED > ESTIMATED), novelty (cooldown per family in `~/.token-damage/state.json`).
3. **Templates**: ≥5 variants per family, slots, tone tag (dry / absurd / bureaucratic), severity band.
4. **Callbacks**: second-order lines when a family repeats ("For the third Monday running…").
5. Optional V1 "Ask the Adjuster": aggregates only → user's own `claude -p`; the roast's own tokens are
   billed on the receipt ("This roast cost 3,904 tokens. You're welcome.").

Built (`packages/core/src/roasts/`): 13 families with 5 variants each, bands and weights in `families.ts`:
uninsurable, few/zero commits, restraint, iceberg (incl. the tagline and Gatsby ratio), late night, long session,
plan multiple, subagent swarm, output share, weekend, cache hit, quiet period, energy. Score = weight × (0.5 + 0.5 ×
depth into band) × confidence (measured 1, priced 0.9, estimated 0.6) × 0.5 if used on either of the last two
receipts. Variant 0 is the canonical line; later receipts rotate. Waiting for data: cache invalidation,
compactions, session churn (needs per-project grouping), personal records and quiet week vs history (needs
`history.json`), flagship tiny output and speedrun burn (need per-session tokens), revert, commit subjects,
two agents (V1). Commits are an optional input until the V1 git reader exists. Callbacks (§Architecture 4) are not
built yet.

## Adjuster's notes (starter set; each needs ≥5 variants)
1. Huge tokens, few commits: "183 million tokens went in. Six commits came out. Claude isn't your assistant; you're its project manager."
2. Iceberg: "You typed 9,400 words this week. Your agents read 412 million tokens. For every word you wrote, the machine re-read a novella."
3. Output share: "Of 1.4 billion tokens processed, 0.4% was output. The rest was the agent re-reading its notes, 14,000 times."
4. 3:47 AM: "Last model call: 3:47 AM. The model doesn't sleep. That was never supposed to be a challenge."
5. High cache hit: "Cache hit rate 97%. At least someone in this relationship remembers things."
6. Cache invalidation: "At 14:02 your cache was rebuilt from scratch with no idle gap. Somebody edited CLAUDE.md mid-session. We're not saying who. It was you."
7. Plan multiple: "Your $200 plan extracted $2,795 of list-price compute. Somewhere, a pricing analyst is staring at a wall."
8. Flagship, tiny output: "You used the most expensive model available to produce 212 tokens. That's hiring an architect to hang a picture."
9. Session churn: "Eleven sessions in forty minutes, same repo. That's not iteration, that's a slot machine."
10. Nine-hour session: "One session ran 9 hours 14 minutes. It has been through more than most marriages."
11. Subagent swarm: "You spawned 38 subagents today. Middle management has never been this scalable."
12. Zero commits: "412M tokens. Zero commits. Either this was research or it's a crime scene."
13. Revert (local git, V1): "The 61M-token session was reverted 22 minutes later. Speedrun, any%, bad ending."
14. Weekend: "71% of this week's damage happened on Saturday and Sunday. Your employer thanks you; your weekend does not."
15. Two agents: "Claude Code and Codex, same hour, same repo. A second opinion is healthy. Every 6 minutes is a trust issue."
16. Compaction loop: "Five auto-compactions in one session. The context filled up, forgot everything, and filled up again. Relatable."
17. Personal record: "New record: most tokens in a single day. Previous holder: you, 11 days ago. The prophecy continues."
18. Quiet week: "Only 2.1M tokens this week. Did you… write code yourself? We've notified the authorities."
19. Energy, non-preachy: "Estimated electricity this month: 38–150 kWh, about one to five fridge-months. Your fridge, for the record, has never written a unit test."
20. Commit subjects (read locally, never shown): "Nine consecutive commits said 'fix'. The tokens between them could fill War and Peace twice. Neither is finished."
21. Speedrun burn: "A 94-second session consumed 1.3M tokens. It read the codebase, understood it, and left. Honestly, respect."
22. Gatsby ratio: "For every word you typed, the machine read 80,558 tokens. That's The Great Gatsby, and a third of it again. Per word." (Gatsby ≈ 62,600 tokens)
23. Restraint: "Two sessions, both done by lunch. Flagged for unusual restraint."

## Damage classes (stamp; per period, by tokens)
| Tokens | Class | Fine print |
|---|---|---|
| 10K | PAPER CUT | Minor scuff. No claim filed. |
| 1M | FENDER BENDER | Adjuster notified. |
| 10M | WATER DAMAGE | Please do not use the elevator. |
| 100M | STRUCTURAL | Building inspector en route. |
| 1B | ACT OF GOD | Your insurer has stopped returning calls. |
| 5B+ | UNINSURABLE | You are now the reason the policy exists. |

## Achievements (all true, trigger printed on the card; ~⅓ hidden)
- ONE LAST FIX — last model call after 3:00 AM
- TOUCH GRASS — 7 consecutive AI-free days (the only streak we track; celebrated loudly)
- CACHE LORD — >95% of input from cache for a week
- CACHE ARSON (hidden) — cache-write spike with no idle gap
- MIDDLE MANAGER — 5+ concurrent subagents
- SIX COMMITS — >100M tokens in a day with ≤6 commits (V1, local git)
- BILINGUAL — Claude Code and Codex in the same hour (V1)
- MODEL SNOB (hidden) — flagship model, <500 output tokens in a session
- THE LONG GOODBYE — one session spanning 3 calendar days
- COMPACTION ARTIST — 5+ compactions in a session
- RECEIPT HOARDER — 12 statements archived (rewards the tool, not AI use)

## Dispute (the after-receipt action)
Prompt: "dispute this charge?" Options and verdicts (verdicts must quote the user's own numbers):
| Excuse | Verdict |
|---|---|
| It was research | DENIED. {tokens}, {commits} commits. Research rarely happens at {lastCall}. |
| The agent did it by itself | DENIED. You typed {words} words of instructions. You're the manager. |
| It was one last fix | DENIED. {sessionsAfterMidnight} sessions started after midnight. That's not one. |
| I was learning | APPROVED. Learning is allowed. Damage reduced by $0.00. |
| Everyone does it | DENIED. True, but only you are on this receipt. |
| I accept the damage | Respect. Sign here: ______ |
The verdict is stamped on the share card as `CLAIM #<trans> · "<excuse>" · DENIED/APPROVED`.

## The pool: satire, receipt jokes, news (rotate; never the same line twice in a row)
About a hundred lines per language about the AI situation, in `packages/core/src/roasts/pool.ts` (English, id
`kind.fact.n`) and `apps/web/i18n/ru.json` → `pool` (Russian, same ids, written fresh; see `docs/I18N.md`).
Three kinds:
- **✶ satire**: a real, dated AI event and the reader's made-up share of it, red, `{share}` from
  `satireShare` (`docs/METRICS.md` §Satire). "Stargate plans $500 billion of AI data centers. Your share:
  0.0000083 Stargates."
- **Receipt jokes**: store-receipt grammar about AI (tips, loyalty cards, returns, surveys). Some rest on a real
  fact and carry its source; a few use receipt slots (`{cacheSaving}`, `{plan}`, `{venture}`) or a band
  (`joke.lastcall.1` prints only after 2 AM) and are CLI-only.
- **News**: one dated, sourced fact in plain ink, not satire. The date stays in the line, so it ages honestly.

Every satire and news line has a source (`source.date` is `YYYY-MM`, `YYYY`, or `-` for a standing fact);
`/method` lists them all. Off limits: politics and war, religion, drugs, private people, insults to named
public people (quote them accurately or leave them out), anything a company could call a false claim.

**Rotation** (`roasts/deck.ts`, pure): each kind is a seeded shuffle, drawn in order; a line that doesn't fit
(band, slots, same text as the note) is passed over and stays; a new round never opens with the line that closed
the last one. The CLI keeps the deck in `~/.token-damage/state.json` (seed and line ids, never text; fixture runs
use seed 0). The site keeps one deck per browser in `localStorage` `td.deck`, shared by every page and language.

**Placement.** CLI: two receipt jokes, one ✶ line under RAM-X, one "meanwhile" news line before the footer;
`--json` carries `jokes`, `poolSatire`, `news`; the PNG card is unchanged. Site: every printed receipt (home, `/r`)
gets one ✶ line and one joke; the page chrome gets one news line with its source (home footer, under the `/r`
result, quiz end). The home page's no-JS receipt shows the first lines of a seed-0 deck.
