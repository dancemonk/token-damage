# Token Damage — brand kit

## Mark
- `token-damage-mark.svg` — colour (paper body, ink lines, red flame, orange inner tongue). Use at 48 px and up.
- `favicon.svg` — colour without the inner tongue. Use for 16–32 px (browser tab, npm avatar).
- `token-damage-mark-mono.svg` — one colour, fills with `currentColor`. Use in README badges, on GitHub, on the receipt itself (ink), or on red (paper).
- `token-damage-app-icon.svg` — 512 px rounded square for app icons and social avatars.

## Wordmark
The wordmark is text, not an outline: **TOKEN DAMAGE** in IBM Plex Mono Bold, uppercase, letter-spacing 0.24em. Mark on the left; gap = 0.6× the mark's height; mark height ≈ 1.5× the cap height.

## Colours
| Name | Hex | Use |
|---|---|---|
| Desk | `#0e0e0d` | site background |
| Paper | `#f6f2e9` | receipt, mark body |
| Ink | `#17160f` | text on paper, mono mark on paper |
| Red | `#e0331b` | flame, stamps, ✶ satire lines, hover states. Never for buttons at rest. |
| Orange | `#ff8a4c` | inner flame tongue only, 48 px and up |
| Ochre | `#7a5a12` | ≈ estimate lines on paper |

## Rules
- Red means "joke or fire". Not for facts, not for buttons at rest.
- The mark is ink-only when it sits on the receipt paper.
- Clear space around the mark: at least half its height.
- No gradients, glows, or a second flame.

## PNG / ICO
Render `favicon.svg` at 16, 32 and 48 px into `favicon.ico`; render `token-damage-app-icon.svg` at 512 and 1024 px for stores and social. Any SVG renderer works (`@resvg/resvg-js`, Inkscape, Figma).
