# Live view and status line

How `token-damage live` and `token-damage statusline` work, and why they look the way they do. Shipped in 0.3.0.

## Why

The receipt is a moment product: first run, end of month, a friend's link. This adds one ambient surface so
Token Damage is useful while you work, not only after. Two commands share one engine:

- `token-damage live` — a terminal pane that shows the day's damage as it happens.
- `token-damage statusline` — two rows inside Claude Code's own status line.

The useful core is one line: **the open turn, live.** "This prompt is at 9.8M read, ≡ $7.10, still going,
3 interns." You see a runaway subagent swarm while it runs. Nobody shows per-prompt live cost. Everything
else (today's total, rate, plan limits, the class, the adjuster) is a glance or a joke.

Rules from `CLAUDE.md` hold unchanged: nothing leaves the machine, prompt text is never stored, every number
wears its tier, red means joke or fire, no engagement bait. Zero new dependencies.

## Decisions taken

| Decision | Why |
|---|---|
| Full-pane TUI that degrades to a strip, plus the Claude Code status line | The status line is the surface most people will actually use (no extra pane); the pane serves tmux and wide screens. One engine feeds both. |
| Hand-written ANSI, no Ink or other TUI library | Dependency rule (`@resvg/resvg-js` only); `npx` start time; the status line is a one-shot print anyway. |
| Live receipt, calm and dark, not painted paper or a printer skin | An ambient pane is looked at all day next to dark code. Bright paper, blinking LEDs, stepped print reveals and a 15-row header were rejected as an annoyance dressed as a feature. The brand transfers through voice, tiers, class names and events; not through chrome. |
| One row per **turn** (`4 words → 9.8M`), not per model call | Calls arrive dozens a minute with subagents; turns are readable and the ratio is the tagline as data. |
| Plan limits shown as MEASURED (Claude's own numbers), never forecast | Forecasting stays on the Never list. |
| Adjuster speaks only on real events, rate-limited | A heckler that talks constantly gets muted; one that never talks is ccusage. |
| Truth = the receipt's `aggregate()`; incremental reading only fills the seconds between | A wrong number is worse than a boring one. Live totals must equal the receipt's own totals for today, which equal ccusage. |
| Red only on `✶` lines and on the "stamped" event line at the moment it lands | A red class name on screen all day is a permanent alarm; red means joke or fire. |

## Surface 1: the pane (`token-damage live`)

Fills the pane width (minimum 50 columns), any height. Glance rows on top (six with both limit windows), the tape below, a legend
footer. Short panes (< 12 rows) show the glance rows only. One design, not two modes.

```
 WATER DAMAGE   next STRUCTURAL at 100M ■■···· 38%
 today   1,212 words → 38.2M read          ≡ $41.20
 now     claude+3 · 4 words → 9.8M ▸        ≡ $7.10
 rate    1.4M/min ▁▂▃▅█▇▅▃▂▁   ● printing
 limits  5h ■■■■■■■■■■■········  58%  resets 16:00
         7d ■■■················  21%  resets mon
 ─────────────────────────────────────────────────
 time   agent       you typed → it read       list
 13:05  ━━━━━━━━━ stamped WATER DAMAGE ━━━━━━━━━━━
 13:41  claude      12 words →   3.1M      ≡ $2.40
 13:52  codex       31 words → 410.0K      ≡ $0.31
        · · · · · · · idle 14 min · · · · · · ·
 14:09  claude·2    88 words →   1.2M      ≡ $0.90
 ✶ four words in. a library out. the usual.
                  ≡ list price · ✶ satire · q quit
```

Rows:

1. **Class** — today's damage class (`ROASTS.md` thresholds on today's tokens), bold ink, never red. Then the
   distance to the next class as a bar on the leader (`receipt/glyphs.ts`, at most 24 wide) and a linear
   percentage of the next threshold, measured from
   the current class's floor (`roasts/classes.ts`'s one threshold table, shared with the receipt).
2. **Today** — words typed, tokens read (input + cache write + cache read), list price. Written tokens are left
   off the glance (small, not the story; they are on the receipt).
3. **Now** — bold. The open turn: agent, `+N` interns, words → read, static `▸`, list price so far. Counts in
   place. When nothing is open: `now     idle 14 min · last turn ≡ $0.90`. Always meaningful.
4. **Rate** — tokens per minute over the last 30 minutes, ten 3-minute buckets as a sparkline, then a state
   glyph: `● printing` (a call in the last 60 s) or `● idle 14 min`. Static, no blink.
5. **Limits** — only when data exists (see Engine → Plan limits): one row per window (5-hour, 7-day), each a
   bar, the used percent and the reset time in local words (`16:00`, `mon`). Both bars share one width, at most
   24; when that would be under 5, one plain row instead (`5h 58% resets 16:00 · 7d 21% resets mon`). The first
   row ends `· as of 14:02` once the data is older than a minute. Plain ink at any percent: a limit is a fact.

Tape: closed turns, newest at the bottom, with a header row (`time agent you typed → it read list`). Events
print between turns:

- `━━ stamped WATER DAMAGE ━━` — class upgrade, red at the moment it lands, ink afterwards.
- `· · · idle 14 min · · ·` — gaps over 10 minutes.
- `✶ …` — adjuster lines, red-text, never containing a digit.
- `✂ tear here · sep 24 · ≡ $41.20` — at local midnight; the day resets, a fresh tape starts.

Turn rows: `HH:MM  agent[·s][+N]  W words → T read  ≡ $P`. `agent·2` is a per-day session badge shown only
when more than one session was active today (never a project name or path). `+N` = interns (distinct
subagent sessions in the turn). Marks carry over from the receipt: `*` estimated model, `not priced`, and a
trailing `+` on any price that leaves unpriced tokens out. Compact numbers (`3.1M`); exact numbers in `--json`.
The list holds only prompts someone typed. Turns with no typed prompt (Agent SDK scripts, often one after every
prompt; or a session started before midnight) are summed in one muted row pinned under the header,
`       18 runs with no prompt today → 3.1M   ≡ $5.20`, so the money still adds up. Totals are unchanged. Session
numbers (`claude·2`) appear only when more than one session has typed prompts. A prompt the model never ran on
(a slash command, an interrupt) read nothing and gets no row.

Width: below 50 columns drop the price column, then the sparkline; below 40, a one-line "widen me".

Colors: ink = default foreground, muted = bright black, `≈` = yellow, `✶` and the landing stamp = red.
`NO_COLOR` honored. No painted backgrounds.

Motion: one count-up on the glance numbers when the pane opens (the print moment). After that every update is
instant; nothing blinks. `--no-anim` removes the opening count-up too (terminals have no reduced-motion
signal, so the flag is the only switch).

Keys: `q` only. Ctrl-C works. No configuration screens.

## Surface 2: the Claude Code status line (`token-damage statusline`)

Claude Code runs the command after each event (debounced 300 ms by Claude) and every `refreshInterval`
seconds, passing session JSON on stdin. We read `session_id`, `transcript_path` (to open it; never written
anywhere), `context_window.used_percentage`, `rate_limits` and `model`. We print rows and exit.

Default two rows, capped at 80 columns:

```
▸ 4 words → 9.8M read ≡ $7.10 · +3 interns · ctx 41%
WATER DAMAGE · today 38.2M ≡ $41.20 · 5h 58% resets 16:00 · 7d 21%
```

- Row 1 — **this session**: its open turn (words → read, list price, interns) and `ctx`, the context window
  percent as Claude reports it. Idle: `▸ idle 14 min · last turn ≡ $0.90`.
- Row 2 — **today, all agents**: class, tokens, list price, plan limits from Claude's own `rate_limits`
  (only when present).
- `--rows 1`: `WATER DAMAGE · ▸ 4 words → 9.8M ≡ $7.10 · 5h 58%`.
- `--rows 3`: adds the last adjuster line, persistent until the next event. Claude's docs warn that multi-row
  output with escape codes gets flaky, so 2 is the default.
- From 70% (as printed), `ctx` and `5h` carry a 5-glyph bar (`ctx ■■■·· 74%`); below that the number alone, since a
  bar that is always there is noise. `7d` stays text. A row whose bars would pass the width prints without them,
  never with a bar cut off.
- `--width N` overrides the 80-column cap. `NO_COLOR` honored; red only on `✶`.

**Speed budget:** under 100 ms typical on a warm cache (Node itself is ~50 ms). The first run of a day reads
all of today once (1–2 s); every run after reads only new bytes. A reconcile run (see Engine) may take 1–2 s
once every 5 minutes; Claude runs the command asynchronously, so that only delays one refresh.

**Install:** `token-damage statusline --install` prints the exact `settings.json` change — including the
existing `statusLine` value it would replace, when one is already set to something else — and writes it only
after confirmation:

```json
"statusLine": { "type": "command", "command": "token-damage statusline", "refreshInterval": 10 }
```

It refuses to write an `npx …` command (slow, may touch the network on every refresh) and requires a global
install or an absolute path to the binary, which it detects and offers. Before writing, it keeps a one-time
backup of the settings file as `settings.json.token-damage.bak` (only if that backup does not already exist).

**Failure mode:** on any error print one row, `token damage · (reading)`, and exit 0. Never a stack trace in
the status bar. A hard 2-second guard prints what is known so far.

**Not used:** Claude's `cost.total_cost_usd`. One price source (`prices.json`); ours is the receipt's own number,
not Claude's field. It is a useful sanity check in tests only.

**Later, separate task:** `subagentStatusLine` with one row per intern (`intern #2 · 301K read ≡ $0.49`).

## Engine (in `packages/core/src/live/`, pure, zero dependencies)

### Truth model

- **Snapshot (authoritative):** the receipt's `aggregate()` over today's files. Identical numbers to
  `token-damage --json --since <today>` (`pnpm oracle:live` checks it).
- **Delta (fast):** since the last snapshot, read only new bytes and push them through the existing per-agent
  `parseLine` and the shared deduper (`createDeduper()` keeps state across calls).
- **Reconcile:** re-snapshot every 5 minutes and whenever a new file appears (Codex forks copy their parent's
  history; that rule needs the parent, which the delta path may not have seen). The delta may drift briefly on
  exotic traps; the snapshot snaps it back. Tests assert delta == snapshot at every reconcile.

### Reading each agent

| Agent | Log shape | Live strategy |
|---|---|---|
| Claude Code | append-only JSONL | per-file byte offset up to the last newline; re-read from there |
| Codex | append-only JSONL, cumulative `last_token_usage` | rescan every rollout modified in the last 48 h when any changed (fork rules need the parents) |
| Gemini CLI | small JSONL chat files; a response is written twice, the second time with tokens | rescan every chat file modified today when any changed |
| OpenCode | SQLite (WAL), read-only via `node:sqlite` | rescan the database when it or its WAL changed |

A rescan replaces that agent's pool in the engine; only Claude Code lines accumulate.

If a file shrinks below its offset, it was rewritten: re-read from zero and drop that file's prior delta state
(size only; the reconcile corrects a same-size rewrite).

`scanAll()` (cold start, rollover, reconcile) reads only files that can hold today's records: Claude files
modified since midnight, Codex rollouts modified in the last 48 h (fork parents), Gemini chats modified today;
files older than today are marked and not stat'ed again until the next reconcile. Real-logs cold start ≈ 1 s.

Watching: `fs.watch` recursive on the four roots, debounced 250 ms, plus a 10-second stat-only poll as a
safety net (watchers miss events). The pane's own 2-second interval tick doubles as that safety poll. Idle
CPU is negligible.

### Turns

- A prompt event in a root session opens a turn; it closes at the next prompt in the same session.
- Usage events in that window from the session and its subagents (`parentSessionId` → root) belong to it.
  Interns = distinct subagent sessions in the window.
- **Open turn** = the latest turn with a usage event in the last 5 minutes and no later prompt. The pane's
  `now` row shows the most recently active open turn; the status line shows its own session's (`session_id`).
- A session that started before local midnight has no prompt for its first turn today; it counts in the pane's
  "runs with no prompt today" row.
- All four agents emit prompt events, so turns work for all four.

### Time

Today = local midnight → now, the same window `token-damage --since <today>` covers. At midnight the tape prints the tear row, the
snapshot resets, the cache is re-keyed. Class thresholds from `ROASTS.md` apply to today's tokens. Rate =
tokens per minute over 30 minutes in ten buckets. Idle time and the "printing" state consider only calls at or
before `now` (so a `--clock` demo never sees the future); the totals themselves cover the whole day regardless,
the same as the receipt.

### Plan limits

The pane has no stdin from Claude Code. When the status line is installed, each run writes `rate_limits`
(percent and reset epoch, numbers only) into the shared cache; the pane shows them with an "as of" age once
they are older than a minute. No status line → no limits row. Never an API call.

### Cache

`~/.token-damage/today.json`, next to the existing `state.json`. Contents: the date key; today's deduped usage
and prompt events (numbers, model names, message ids; any id that looks like a path is replaced by its hash);
per file its path hash with byte offset or last-seen mtime; tape events; voice state; plan limits;
`reconciledAt`. Written atomically (temp file + rename). Yesterday's cache is discarded, never merged. A torn
or unparsable cache is treated as missing. Both commands share it; both compute the same deterministic state,
so last-writer-wins is safe. `docs/PRIVACY.md` names it as the one file we write besides `state.json`.

Any id that looks like a path (contains `/` or `\`) is hashed before anything reaches the file, including the
keys the adjuster uses to remember which lines it has already said today.

### Voice

Priority when several fire: window, library, speedrun, swarm, snob, re-read, second opinion, one last fix, back,
quiet.

Pure detectors on (previous snapshot, new snapshot), with its own per-day rotation in `today.json` so no line
repeats in a day. Each fires on measured facts only, severity matched to the data. Starter set, each with at
least five variants:

| Event | Trigger |
|---|---|
| stamped | class upgrade; prints the event rule; exempt from cooldown |
| library | open turn with ≤ 10 words and ≥ 5M read |
| speedrun | a turn that closed with ≥ 3 calls and ≥ 1M read, within two minutes of its prompt |
| swarm | ≥ 3 interns on one turn |
| snob | a turn that closed with ≥ 3 calls, ≥ 1M read and < 200 written, on flagship models only (opus, fable, mythos) |
| re-read | three consecutive turns in a session with cache-read share > 95% |
| second opinion | two or more agents with turns in the last hour, one of them fresh; once a day per pair |
| back | a call after more than 60 minutes idle |
| one last fix | a call after 3 a.m. local (the achievement's threshold) |
| window | 5-hour limit ≥ 90%, from Claude's own number; stated, never forecast |
| quiet | no calls for 3 hours between 9:00 and 18:00 local |

The `back` and `quiet` lines were each reworded once during implementation to claim only what the trigger
measured ("a long break…" for `back`, "quiet day. suspicious." for `quiet`), not what it might imply.

Cooldown: one `✶` line per 10 minutes. Numbers inside `✶` lines only as words (`numberWord`); a test
rejects any digit in a satire line.

## CLI (thin, in `packages/cli/`)

- `live`: alt screen, watchers and timers, resize handling, redraw of changed lines only, `q`/Ctrl-C.
  Refuses to start when stdout is not a TTY: "live needs a terminal; pipe `--json` instead." Opens with
  "no agent logs yet. start one." when nothing is found. Alt screen and cursor are restored on exit, Ctrl-C
  and crash (`process.on("exit")`). A tick that fails to read the logs keeps the last good frame on screen;
  three consecutive failures restore the terminal and exit 1 with "token-damage live: could not read the
  agent logs (<errno code>)" — never the error's own message, which can hold a path.
- Flags for `live`: `--no-anim`, `--json` (NDJSON, one snapshot per change; the answer for tmux bars and
  other agents without writing integrations), `--once` (print one JSON snapshot and exit; what
  `pnpm oracle:live` compares against the receipt), `--fixtures <dir>` with `--clock <iso>` for demos and
  screenshots, plus the existing `--config-dir`, `--codex-home`, `--gemini-dir`, `--opencode-dir`.
- Flags for `statusline`: `--rows 1|2|3`, `--width N`, `--install`.
- Node < 22.13 skips OpenCode with the existing note.

## Tests

1. **Delta == snapshot.** Replay every fixture corpus as appends at random cut points (mid-line, mid-UTF-8),
   plus one rewritten file and one file appearing mid-stream; exact equality with `aggregate()` at every
   reconcile. All four agents.
2. **Turns.** Fixtures with prompts, subagents and a session crossing midnight → expected JSON.
3. **Cache.** Round-trip, resume, other-day discard, torn JSON treated as missing.
4. **Privacy.** Cache and `--json` output contain no fixture path segment and none of a list of sentinel
   words planted in fixture prompts.
5. **View.** Snapshot → lines at widths 40/50/64/100 and heights 5/12/30; no line overflows; ANSI-stripped
   output equals the plain rendering.
6. **Status line.** Stdin fixtures (with and without limits, malformed, empty) → rows; error → fallback row
   and exit 0; warm-cache run under 500 ms in CI.
7. **Voice.** Injected clock and seeded picker; cooldown; the no-digits rule.
8. **Oracle.** `pnpm oracle:live` compares the live snapshot's tokens with our own daily totals for today,
   summed across the four agents (the same aggregation the receipt uses), on real logs.

## Docs to update when built

`ARCHITECTURE.md` (live pipeline and cache), `CLI.md` (both commands), `PRIVACY.md` (the cache file),
`DATA-SOURCES.md` (per-agent live strategy), `TASKS.md` (Task 12 engine + pane, Task 13 status line, after
Task 10), READMEs. `PRODUCT.md` (gitignored, local): "a moment product, plus one ambient surface."

## Out of scope

Forecasting limits, budgets or alerts, streaks, notifications, per-intern status rows (later task), a tmux
plugin (use `--json`), Antigravity or other new adapters, painted paper.
