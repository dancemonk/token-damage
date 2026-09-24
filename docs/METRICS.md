# Metrics and the truth tiers

Every number the product shows carries exactly one tier. Tiers never mix in one figure and are printed
inside every share image.

| Tier | Mark | Style on paper | Rule |
|---|---|---|---|
| MEASURED | none | plain ink | read from logs; exact integers |
| PRICED | `≡` | plain ink, label "list price" | public API list price × measured tokens; labeled "API-equivalent", never "you spent" |
| ESTIMATED | `≈` | ochre `#7a5a12` | always a **range**, ≤ 2 significant figures, method public |
| SATIRE | `✶` | red `#b3261e` | made up on purpose; always accompanied by "made up / nobody can measure it" |

Every receipt is stamped `method v1 · prices as of <date>`.

## Measured
- tokens: fresh input, cache write, cache read, output; total = sum of the four
- model calls, sessions, active days, subagents ("interns"), first/last call of the day, longest session
- words typed (see DATA-SOURCES §Words typed)
- ratios shown as measured: tokens per typed word, cache-read share, output share

## Priced
`prices.json` (in `core`), with an `asOf` date. Per model: `input`, `cacheWrite`, `cacheRead`, `output`
in USD per 1M tokens. **Verify against the providers' price pages before every release**; the values in
the mockups are illustrative: Opus 5 / 6.25 / 0.50 / 25, Sonnet 3 / 3.75 / 0.30 / 15, Haiku 1 / 1.25 / 0.10 / 5.
Unknown model → nearest version in the same family by name, flag `isFallback`, show "≡ (est. model)"; no family
→ not priced, and the receipt says so. `packages/core/src/metrics/prices.json` holds the real per-model prices
(`asOf` 2026-09-24); the mockup values above are Opus 4.x/5, Sonnet 4.6 and Haiku 4.5 prices (Sonnet 5 is 2 / 2.5 / 0.20 / 10).

Cache writes have two prices: 5-minute TTL 1.25× input, 1-hour TTL 2× input. Claude Code writes the main thread with
the 1-hour TTL (87% of cache writes on real logs; a single write price understated list price by 7.6%), so
`cacheWrite1h` (from `usage.cache_creation.ephemeral_1h_input_tokens`) is priced separately. With no 1-hour
writes the formulas below are unchanged.

- `listPrice = Σ tokens × price / 1e6` per type and model
- `cacheSaving = Σ cacheRead × (input − cacheRead price) − Σ cacheWrite5m × (cacheWrite − input price)
  − Σ cacheWrite1h × (cacheWrite1h − input price)`
  ("You saved … with your Cache Rewards card"). `withoutCache = listPrice + cacheSaving`.
- `planMultiple = listPrice / planPrice` when the user gives `--plan 200` (or config). Label:
  "value extracted: 4.0× your plan". Never say the user paid the list price.

## Estimated (method v1)
Providers publish no per-token energy for Claude/GPT-class models. We use per-token coefficients by token
type, **calibrated so that Hausfather's published Claude Code log (3.2 B tokens, 96% cache reads, 0.4% output)
reproduces his central 170 kWh**, with low/high scaled to his 70–330 kWh range.

Central coefficients (Wh per 1,000 tokens):
- fresh input and cache write: **0.25**
- cache read: **0.025** (10% of fresh; the dominant uncertainty, bounds 1%–25%)
- output: **5.2**
- low = central × 0.41, high = central × 1.94

`kWh = (fresh + write) × 0.25/1e3 + read × 0.025/1e3 + out × 5.2/1e3` (÷1000 for kWh), shown as `low–high`.
Sanity anchors: ~50 kWh per billion agent tokens (20–100); a median Claude Code session ≈ 41 Wh (Couch).
If a result lands far outside these, the parser is wrong, not the world.

Context lines (never moralizing): "≈ a fridge running for 1–4 months" (fridge ≈ 33 kWh/month),
"≈ 4–20 phone charges" (15 Wh each). One chat prompt ≈ 0.24 Wh (Google, Gemini, Aug 2025); one heavy
agent prompt ≈ 150 Wh (60–290), ≈ 600× a chat prompt (Hausfather).

Detail view only (not on the share card):
- water, on-site cooling: `kWh × 0.2–2 L/kWh` (Google's disclosure ≈ 1.1 L/kWh). Off-site water is larger and
  disputed; show as a separate note, never added in.
- CO₂e: `kWh × 0.34–0.42 kg/kWh` (US location-based); note market-based figures run lower.

## Satire
Always red, always with the disclaimer line, never a precise-looking number without "made up".
- **RAM-X, your share of the shortage**: `tokens ÷ 60e12 × 0.95 × 0.42` dollars per stick, where 60 T is
  Meta's reported 30-day token usage, 0.95 the Q1-2026 DRAM contract price rise, and 0.42 the Coefficient of
  Vibes. Fully disclosed in "show your work" as a deliberately absurd formula. Pair with the real fact:
  "RAM contract prices +93–98% in Q1 2026 (TrendForce). Real. That you did it: not."
- Other fiction-tier lines, rotated: "GPUs personally harmed: 0.003", "a kettle in Virginia boiled slightly
  later", "cooling tower emotionally overwhelmed", "Suggested tip for Claude: 18% · 20% · 25% · No tip",
  "No refunds. Tokens cannot be un-read."
- Never: fake water/CO₂ numbers, fake per-user attribution presented as an estimate.

## World check (real facts shown next to the satire; update monthly, dated)
- RAM contract prices +93–98% QoQ in Q1 2026; +58–63% expected in Q2 (TrendForce, 1 Jun 2026).
- 1 agent prompt ≈ 600 chat prompts (250–1,200) in energy (Hausfather).
- Data centers ≈ 11.8% of US electricity by 2030, range 9.5–15.3% (LBNL 2025 update, June 2026).
- Median Gemini prompt: 0.24 Wh, 0.26 mL water on-site, 0.03 gCO₂e (Google, Aug 2025).

## Sample data (canonical fake customers; all mockups use these)
Assumed mix: 96.2% cache reads, 0.4% output, ~12 model calls per prompt, model mix 71/24/5 Opus/Sonnet/Haiku.

| TRANS | Who | Typed words | Tokens | List price | Cache saved | Electricity | RAM-X | Class | Note |
|---|---|---|---|---|---|---|---|---|---|
| 0041 | Customer 0041 | 14,690 | 1,183,400,000 | $809.65 | $4,383.85 | 26–120 kWh | +$0.0000079 | ACT OF GOD | For every word you typed, the machine read 80,558 tokens. That's The Great Gatsby, and a third of it again. Per word. |
| 0042 | The Night Shift | 1,960 | 187,022,000 | $129.20 | $749.94 | 3.7–18 kWh | +$0.0000012 | STRUCTURAL | 187 million tokens. Two commits. You're its night-shift supervisor. |
| 0043 | The Restraint Award | 212 | 2,958,400 | $2.06 | $7.04 | 0.094–0.44 kWh | +$0.00000002 | FENDER BENDER | Two sessions, both done by lunch. Flagged for unusual restraint. |
| 0044 | The Uninsurable | 41,200 | 9,842,000,000 | $6,721.10 | $36,385.95 | 220–1,000 kWh | +$0.000065 | UNINSURABLE | You are now the reason the policy exists. |

Customer 0041 detail: 94 sessions, 26 active days, 212 subagents, 7,480 model calls, tokens read
1,178,700,000 (input 2.1M, cache write 38.4M, cache read 1,138.2M), output 4.7M; Opus 840.2M / $665.34,
Sonnet 284.0M / $134.94, Haiku 59.2M / $9.37; latest call 3:47 AM Sep 18; longest session 9h 14m; most
expensive day Sep 17 ($129.20); 80,558 tokens per typed word ("The Great Gatsby, and a third of it again").
`design/sample-numbers.py` reproduces these.
