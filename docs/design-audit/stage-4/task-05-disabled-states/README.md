# Stage 4 · Task 05 — Disabled, unavailable and inactive states

One token, `--opacity-disabled: 0.5`, for compact glyph controls that cannot be used. Rows/options that are merely unavailable swap their label to `--muted` instead of fading (no stacked muting). Inactive controls are never dimmed; loading and failed are their own states. Rules in `design.md` ("Non-active states").

| Component | Before | Family | After |
| --- | --- | --- | --- |
| `.btn:disabled`, `[aria-disabled]` | .45; hover reset forced `--ink-raised` (painted a fill on ghost/danger) | disabled | token .5; hover restores each variant's own resting look |
| `.btn[data-loading]` | inherited .45 from `:disabled` (spinner dimmed) | loading | opacity 1, `cursor: progress` |
| `.icon-btn:disabled` (incl. `prep-item-nav-btn`) | .35 | disabled | token .5 |
| `.bp-step:disabled` | .35 | disabled | token .5 (active steppers untouched) |
| `.prep-select-checkbox:disabled` | .4; `:hover` still turned the border gold | disabled | token .5; hover only when enabled |
| `.env-prep-btn.is-unavailable` | .45 on muted colour | disabled strength, `aria-disabled` (focusable, tooltip kept) | token .5 — rest state is already muted, so it needs the full step to differ |
| `.atl-row.is-unavailable` | muted label, box .5 | unavailable | unchanged in look; box via token |
| `.prep-menu-item.is-disabled` | muted **and** .7 (double muting) | unavailable | muted label only |
| `.sb-ctl[aria-disabled]` | .45 | disabled (focusable by design) | token .5 |
| `.sb-sound` idle/loading | icon .45, hover border still moved | loading | icon token .5 + spinner; hover suppressed for every `aria-disabled` tile |
| `.sb-sound` failed | icon .4 on muted colour | failed | icon not faded: muted colour + dashed edge + fear alert glyph |

Exceptions kept on purpose: `.prep-recommend-btn` "★ ✓" is finished, not refused (default cursor, `aria-disabled`); `.sb-sound` failed keeps `not-allowed` but a click still toasts the error; no `ms-checkbox` disabled state exists; hide-vs-disable of no-op clear buttons is unchanged.

## Files
- `contact-sheet__non-active-states__1440x900.png` — 12 states.
- `before-after__opacity-ladder.png` — Stage 2 crops vs now.
- `crops/` — per-state crops (1440×900); the disabled plain `.icon-btn` is forced via `disabled=true` (nothing in the UI leaves one disabled).
- `verification.json` — 168 checks (hover / click / focus / aria / tokens) at 1366×768, 1440×900, 1920×1080; `measurements.json` — computed styles per viewport.
- Scripts: `scripts/design-audit/stage4-disabled-states.mjs`, `stage4-disabled-compose.mjs`.
