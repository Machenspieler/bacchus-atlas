# Hex Stock biome artwork — production verification (PD-050)

Regenerate everything here with `node scripts/journey2/verify-hex-stock-art.js` (real Chrome, fixture of 10 regions built through the model; exit 1 on any failed check). 28 checks, all pass.

## Screenshot package
1. Final Hex Stock EN 1280×800 — `list-en-1280x800.png` (whole list), `context-en-1280x800.png`
2. RU 1366×768 — `list-ru-1366x768.png`, `context-ru-1366x768.png`
3. EN 1440×900 — `list-en-1440x900.png`
4. EN 1920×1080 — `list-en-1920x1080.png` (also 2560×1440 EN, and RU at 1280/1440/1920)
5. Selected region (gold border) — `card-selected-expanded-en-1280x800.png`
6. Fully placed — `card-fully-placed-…png`, `card-frozen-fully-placed-…png`
7. Partially placed with controls — `card-partial-expanded-…png` (collapsed: `card-partial-collapsed-…png`)
8. Shadowblighted — `card-shadowblighted-aquatic-…png`
9. Aquatic text contrast — `polish-before-aquatic.png` / `polish-after-aquatic.png`
10. Hex Stock beside the map — `context-*.png`
Before/after of the readability polish (Aquatic, Drylands, Frozen, Grassland, Forest): `polish-before-after.png` (left = approved prototype mask, right = final). `fallback-art-blocked.png` = art requests aborted: plain card, no errors. `inspect-open-1366x768.png` = Region Overlay from the `i` button.

## Geometry (EN 1280×800, same fixture; before = original code with no artwork)
Collapsed card 303 × 69.84, expanded 303 × 165.84, fully placed 303 × 51.84, list 805.48 px, gaps 8 px, panel 340 px — identical before/after (max per-card delta 0.0 px; `geometry-before-1280x800.json` vs `geometry-after.json`). All 9 viewport/language combinations match the original card heights/widths to the pixel.

## Readability (text hidden, background luminance behind name + meta, 95th percentile vs parchment text; `contrast-*.json`)
Worst name contrast: before 3.26 (Forest), 3.50 (Aquatic) → after 5.57 / 5.48. All metadata ≥ 7.96. Art stays clearly recognisable (see before/after).

## Completed cards
Kept the existing treatment (art opacity 0.5 vs 0.85, compact row, dimmed icon); in the full list completed cards are clearly subordinate and not disabled-looking, so no further reduction.

## Interactions (Playwright pointer events at 1366×768 EN)
Real pointer drag of Place 1 onto a valid hex: PASS (tile on the hex under the cursor, status updates, camera unchanged, card stays active). Invalid drops — occupied hex, detached hex, released over the sidebar: PASS (nothing placed, camera untouched). Click-to-place: PASS. Inspect → Region Overlay with its illustrated header: PASS. Delete: Cancel keeps, Delete removes region + its tiles only: PASS. Card selection / expand: PASS. Wheel scroll over the art strip and reaching the last card's controls: PASS. Hit areas: layer is `pointer-events: none`, every on-screen control wins its own centre: PASS. Selected/Shadowblighted indicators: visual review in the screenshots above `scripts/journey2/verify-shadowblight-state.js` (badge on Hex Stock / Hex overlay / Region overlay vs the model, EN+RU) re-run on the final code: 464 pass, 0 fail. Hover on Place and keyboard focus on the `i` button: `state-hover-place.png`, `state-focus-inspect.png` (gold hover / focus ring clearly visible over the art).

## Build / regression
`node --test`: 1261 pass, 1 fail — `print PDF: the submitted Stage 0 proof starts with a dark full-page fill`, the same failure as on the untouched tree (verified with this change stashed). `validate-data.js` 0 errors; build, version-assets, check-asset-versioning, check-unlisted-build all pass; `dist/` contains the 11 `img/biomes/*-200.webp` and no `stockArt`/`PROTOTYPE` code.
