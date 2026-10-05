# Stage 4 · Task 08 — Semantic colour and alpha roles

Rules live in `design.md` "Colour roles"; tokens at the top of `css/styles.css`.

| Component | Before | After | Reason |
| --- | --- | --- | --- |
| `.feature-type.action` | Fear | `--parchment` + `--type-chip-border` (neutral taxonomy) | Passive/Action/Reaction is a category, not danger |
| `.adversary-link-btn` + `.adversary-summary ▸` | Fear | Teal (+ `--teal-hover-bg`) | in-page reference link, like item links |
| `.badge.pending` | Fear dashed | `--parchment-dim` on `--line-strong`, dashed kept | untranslated is incomplete, not an error |
| `.ms-row:hover`, `.prep-menu-item:hover` | neutral fill + gold text | neutral fill only | hover must not look like selected |
| selected fills | .12 / .14 / .16 | `--hope-selected-bg` (.16); hover `--hope-selected-hover-bg` (.22) | one selected strength |
| gold hover fills | .10 / .16 | `--hope-hover-bg` (.10) | one hover strength |
| teal hover fills | .14 / .18 | `--teal-hover-bg` (.16) | one teal hover |
| gold washes | .045 / .06 / .08 / .10 | `--hope-wash` (.08) | one wash |
| gold borders | .35 / .45 / .5 / .55 / .4 / .7 | soft .35, `--hope-border` .5, strong .7 | three roles |
| scrollbar thumbs | .34 / .38 (+ .56 hover) | `--scrollbar-thumb(-hover)` | same role |

Kept on purpose: `.jr-blight` (Fear, negative state), tier hexagon palette, `.region-chip` gold edge, Task 02 gold-glyph icon hovers, ink overlays, `--e-*` shadows.
Removed: the unreferenced `.dice-result-pop .value.tumbling` Fear rule.

Files: `contact-sheet__semantic-colors__1440x900.png`, `gold-strength__hierarchy__1440x900.png`, `before-after__recoloured-components.png`, `states__hover-selected-focus-disabled__1440x900.png`, `before/` + `after/` crops, `after/regression/` (1440 catalog, lists, prep, journey, detail, soundboard; Prep at 1366 and 1920), `verification.json` (19 checks), `after/measurements.json`.
Scripts: `scripts/design-audit/stage4-semantic-colors.mjs [before|after]`, `stage4-semantic-colors-compose.mjs`. The `.badge.pending` marker is injected into a real card (no untranslated data exists).
