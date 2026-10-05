# Stage 4 · Task 04 — Focus states

One gold 2px ring; placement is the only variable (external 2px / tight 1px / inset -2px, tokens in `:root`). Summary in `design.md`.

| Component | Family | Before | After |
| --- | --- | --- | --- |
| `.btn`, links, `.ms-trigger`, `.sp-session-control`, `.bp-summary` | external | global ring, 2px | unchanged |
| `.icon-btn`, `.rank-icon`, thumb buttons | tight | literal `1px` | `--focus-offset-tight` |
| `.field` inputs, search, `.list-rename` | editable (external) | gold border + ring | unchanged |
| `.prep-title-input` | editable (tight) | `outline:none`, gold underline only | tight ring; ring replaces the underline |
| `.card` (catalog) | container | gold border **and** ring (doubled frame) | ring only, rest border |
| `.list-card` | container | gold border + ring on the inner "Open" button | ring on the card only; button draws none |
| `.ms-row` | inset (row) | external ring over neighbouring rows; sr-only checkbox drew a second, clipped ring | inset ring on the row only; checkbox stretched over the row so focus scrolls the whole row in |
| `.prep-row-open` | inset | external ring **clipped** by the scrolling list (≈34 rows flagged) | inset |
| `.lang-switch` | inset segmented | selected segment: gold ring on gold (invisible) | dark ring, 4px in |
| `.bp-seg` | inset segmented | sr-only radio drew a stray ring too | span ring only |

Exceptions: programmatic containers (`.modal`, `.adv-art-modal-card`, `.bp-popover`, `.sb-panel`, `.prep-central-title`) suppress their outline; `aria-disabled` controls stay focusable (and ringed).

## Files
- `contact-sheet__focus-states__1440x900.png` — 12 representative states.
- `before-after__prep-title-input.png`, `before-after__list-card-open.png` — vs the Stage 2 baselines.
- `crops/` — every state at zoom; `1440x900/`, `1366x768/`, `1920x1080/` — full-context shots.
- `verification.json` — 123 keyboard checks; `focus-walk__before.json` / `__after.json` — real-Tab walk of Catalog, Lists, Prep (first 160 stops), Journey, env detail.
- Scripts: `scripts/design-audit/stage4-focus-walk.mjs`, `stage4-focus-states.mjs`, `stage4-focus-compose.mjs`.
