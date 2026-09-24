# Sources (verified 2026-09-24)

## Log formats
- Claude Code, Manage sessions (location; "format is internal"): https://code.claude.com/docs/en/sessions
- Claude Code, .claude directory (retention rules, cleanupPeriodDays min 1, desktop sessions kept): https://code.claude.com/docs/en/claude-directory
- Claude Code, Monitoring usage (OpenTelemetry metric and event names, prompt redaction): https://code.claude.com/docs/en/monitoring-usage
- ccusage source (Claude adapter README: dedupe, sidechains, advisor iterations; Codex adapter README): https://github.com/ryoppippi/ccusage
- ccusage #888 (first-seen dedupe undercounts ~5×): https://github.com/ryoppippi/ccusage/issues/888
- ccusage #913 (/btw sidechain replay overcount): https://github.com/ryoppippi/ccusage/issues/913
- ccusage #4 (costUSD removed in 1.0.9): https://github.com/ryoppippi/ccusage/issues/4
- ccusage #1790 (4 GB RSS on a 12.7 GB history): https://github.com/ccusage/ccusage/issues/1790
- Codex source (TokenUsage, TokenUsageInfo, cache_write_input_tokens, fill_to_context_window): https://github.com/openai/codex
- CodeBurn #1380 (Codex streaming snapshots overcount ~3.7×): https://github.com/getagentseal/codeburn/issues/1380
- Claude Code #22537 (/stats excluded cache tokens): https://github.com/anthropics/claude-code/issues/22537
- Claude Code #85466 (30-day cleanup deleted ~950 transcripts): https://github.com/anthropics/claude-code/issues/85466

## Energy, water, CO₂
- Hausfather, "The real energy use of agentic AI", 5 Aug 2026 (1,138 prompts → 14,000+ calls, 3.2B tokens, 96% cache reads, 0.4% output, 170 kWh (70–330), ~150 Wh/prompt, ~600× a chat prompt): https://www.theclimatebrink.com/p/the-real-energy-use-of-agentic-ai
- Couch, "Electricity use of AI coding agents", 20 Jan 2026 (median session 41 Wh, median day 1.3 kWh): https://simonpcouch.com/blog/2026-01-20-cc-impact/
- Google, "Measuring the environmental impact of AI inference", 21 Aug 2025 (0.24 Wh, 0.26 mL, 0.03 gCO₂e): https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference
- Altman, "The Gentle Singularity", Jun 2025 (0.34 Wh per query): https://blog.samaltman.com/the-gentle-singularity
- Epoch AI, "How much energy does ChatGPT use?", Feb 2025 (~0.3 Wh): https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use
- Mistral, environmental contribution, Jul 2025 (1.14 gCO₂e, 45 mL per 400-token response): https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai
- LBNL, US Data Center Energy 2025 update, Jun 2026 (11.8% by 2030, 9.5–15.3%): https://eta.lbl.gov/publications/united-states-data-center-energy-2025
- DOE/LBNL 2024 report (4.4% in 2023; 6.7–12% by 2028): https://www.energy.gov/articles/doe-releases-new-report-evaluating-increase-electricity-demand-data-centers
- EcoLogits methodology (ISO 14044 LCA; output-token regression; ignores cache reads): https://ecologits.ai/latest/methodology/
- Jegham et al. fit used by the dev.to analysis (1.35e-4 Wh/input token, 2.88e-3 Wh/output token): https://dev.to/gwittebolle/how-much-co2-does-a-claude-code-session-actually-emit-1gna
- Off-site water (Ren, UC Riverside): https://www.techtarget.com/it-infrastructure/news/366650693/A-shadow-water-problem-AIs-power-demand-shifts-consumption-upstream

## RAM / market
- TrendForce, 1 Jun 2026 (DRAM contract +93–98% QoQ in 1Q26; +58–63% expected 2Q26; industry revenue $97B; Samsung 38.5%): https://www.trendforce.com/presscenter/news/20260601-13070.html
- TrendForce, 2 Feb 2026 (90–95% forecast for 1Q26): https://www.trendforce.com/presscenter/news/20260202-12911.html
- Micron exits Crucial, 3 Dec 2025: https://www.globenewswire.com/news-release/2025/12/03/3199169/
- Big-three DRAM share ≈ 90% in 1Q26 (CXMT ≈ 10%): TrendForce/Counterpoint, see above

## Market / culture
- Fortune, 9 Apr 2026, Meta's Claudeonomics (60T tokens/30 days, top user 281B, shut down): https://fortune.com/2026/04/09/meta-killed-employee-ai-token-dashboard/
- The Pragmatic Engineer, "Tokenmaxxing as a weird new trend", 23 Apr 2026: https://blog.pragmaticengineer.com/the-pulse-tokenmaxxing-as-a-weird-new-trend/
- Viberank: https://www.viberank.app/ · Tokscale: https://github.com/junhoyeo/tokscale · CodeBurn: https://github.com/getagentseal/codeburn
- OpenAI "Your Year with ChatGPT", 22 Dec 2025: https://techcrunch.com/2025/12/22/chatgpt-launches-a-year-end-review-like-spotify-wrapped/

## Name
- Only conflict found: gioppoluca/token-damage, a Foundry VTT module (1 star). npm `token-damage` free; tokendamage.com/.dev unregistered (RDAP) on 2026-09-24. Not a trademark search.
