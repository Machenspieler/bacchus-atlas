# Stage 4 · Task 09 — Spacing and radius micro-drift (conservative)

Rules live in `design.md` "Spacing, radii, elevation, motion".

| Change | Before | After | Visual effect |
| --- | --- | --- | --- |
| `.prep-adv-thumb`, `.prep-adv-thumb-btn` padding | 7.5px | `--s-2` (8px) | artwork 45→44px in the 60px thumb |
| `.prep-item-name-overlay` padding | 5px 7px 4px | `--s-1 --s-2` | hover overlay 24.6→23.6px tall |
| `gap: 5px` ×6 (dice, item, countdown, field-error, bp-summary, d12 roll) | literal | `--inline-control-gap` | none |
| `gap: 1px` ×2 (`.ms-panel`, `.prep-menu-list`) | literal | `--menu-item-gap` | none |
| Dense-Prep 6px (header/title/lead gaps, count pill, `--pc-pad-y/-card/-row-gap`) | 11 literals | `--pc-dense` | none |
| 8px / 4px literals equal to a step (adv link, bp summary, Prep list/checkbox/sound offsets) | literal | `--s-2` / `--s-1` | none |
| `.feature-bullets` 22px indent + `.has-item` -22px | two literals | `--bullet-indent` | none |
| Session control 12px radius (×2) | literal | `--sp-session-radius` on the control | none; kept as documented exception |

Kept on purpose: pill icon-side padding, 1px border compensation, icon-button negative margins, `calc(var(--s-2) + 8px)` (padding + scrollbar track), checkmark/rank/SVG geometry, 2px/3px list and badge micro-spacing (no repeated role beyond what is above), focus offsets.
No duplicate `gap` declarations remain (re-audited).

`measurements.json`: computed w/h/padding/gap/radius/margins of ~30 selectors at 1366/1440/1920 (Prep), plus catalog and detail pills, before vs after. Only the rows above changed.
Files: `contact-sheet__spacing__1440x900.png`, `contact-sheet__radius__1440x900.png`, `before-after__visible-geometry.png`, `regression/` (Prep + Catalog at 1366/1440/1920, Lists + Journey at 1440), `crops/`, `before/`, `after/`.
Script: `scripts/design-audit/stage4-spacing-radius.mjs --before-css=<pre-change styles.css>`.
