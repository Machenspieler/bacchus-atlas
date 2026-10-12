# Hex Stock artwork — A+ Refined (temporary prototype)

Switch (dev only, read once from the URL, never stored): `#/journey` = **A** production (unchanged) · `?stockArt=extended#/journey` = **A+** previous · `?stockArt=refined#/journey` = **A+ Refined**. `?stockArt=extended-h` is left as it was (not developed further).
Reproduce: `node scripts/journey2/verify-hex-stock-art-refined.js` (28 checks, all pass), then `node scripts/journey2/summarize-contrast.js qa/hex-stock-art-refined/contrast.json`.

## What changed
- `css/journey2.css`, "stockArt A+" block only: the ink-wash gradient on the existing `::before` layer now reads five custom properties (`--j2-wash-from/-to/-mid/-hold/-release/-end`) whose defaults are exactly the old A+ values, so A+ is byte-for-byte what it was. A new "A+ Refined" section overrides them.
- `js/journey2-view.js`: one more accepted value (`refined` -> `data-art-v="ref"`) in the existing switch. No new storage, no new JS rendering.
- Not touched: artwork files, icons, markup, geometry, selected/completed/Shadowblighted rules, pointer-events, A (production) CSS.

## Intensity profiles (two were enough; a "balanced" middle did not earn its keep)
| profile | biomes | wash (mid / end) |
| --- | --- | --- |
| Dark | forest, wetland, frozen, underground | 0.40 / 0.40 (A+: 0.64 / 0.45) |
| Bright | rolling, grassland, tropical, drylands, mountain, badlands | 0.60 / 0.50 |
| Bright+ | aquatic (single override, one line) | 0.76 / 0.50 |

Shared by both: wash ramps up at 8-16% (right after the icon tile; A+ ramped at 12-26%, which left the first characters of name/dots on bare art) and is held to 80%; the art mask lets go a little earlier on the right (0.30@62%, 0.07@72%, 0.025@84%) so the `#number`, at x≈77-84%, no longer sits on painted pixels. Composition, width and the long fade are the same. No filters, no saturation boosts, no card opacity changes.
Mountain and Badlands moved from my first guess (Badlands = Dark) to Bright after measurement: with a light wash Badlands dropped to 3.5:1.

## Contrast (worst case = min over every card of the biome in the 15-card fixture, p95 luminance behind the glyph boxes, text hidden so ONLY art + ground count)
Method: Chrome 1280 px wide, EN, device scale 1; for each card the DOM boxes of name / #number / status / dots / badge are read, the card is screenshotted with the glyphs hidden, and `(Lt+0.05)/(L95+0.05)` is computed over the box. This is conservative: the real text also carries a dark text-shadow halo that this ignores. Full per-card data: `contrast.json`; per-biome minima: `contrast-worst-case.txt`.
Targets: text (name, #number, status, badge) >= 4.5:1; rating dots (non-text indicator) >= 3:1.

| element | worst biome | A+ | A+ Refined | target | result |
| --- | --- | --- | --- | --- | --- |
| Rolling name | rolling | 6.00 | 8.57 | 4.5 | pass |
| Rolling #number | rolling | 4.41 | 4.79 | 4.5 | pass (was fail) |
| Tropical #number | tropical | 4.40 | 4.76 | 4.5 | pass (was fail) |
| Aquatic Shadowblighted badge | aquatic | 4.31 | 4.65 | 4.5 | pass (was fail) |
| Aquatic #number | aquatic | 4.10 | 4.79 | 4.5 | pass (was fail) |
| Forest / Wetland / Frozen name | all three | 10.0 / 9.3 / 5.9 | 9.0 / 8.0 / 6.9 | 4.5 | pass |
| Forest / Wetland / Frozen #number | all three | 4.4 / 4.1 / 4.1 | 4.73 / 4.61 / 4.64 | 4.5 | pass (were fail) |
| Frozen status line | frozen | 5.64 | 5.85 | 4.5 | pass |
| Rating dots, lowest | forest | 4.49 (badlands 2.43 fail) | 4.05 (all >= 4.05) | 3.0 | pass |
Lowest value anywhere in the refined set: 4.05 (forest dots, non-text, target 3.0); lowest text: 4.49 is not reached anywhere - lowest text is the Frozen/Wetland #number at 4.61. No exceptions needed. (A production reference: #number 4.87 everywhere, i.e. the muted token's ceiling on plain ground.)

## Geometry (DOM measured, 15 cards, collapsed + one expanded)
Every card w/h, inter-card gaps, `.j2-cards`, `.j2-side`, every button w/h and each card's margin/padding/border-left: **identical to A** (`geometry.json`, checks "geometry A+R == A"). Hit areas: the layer takes no pointer events; every on-screen control wins its own centre in all three variants. No storage key is written for the switch. No page errors or failed requests.

## Visuals
- Per-biome before/after (A, previous A+, Refined stacked, same states): `card-forest.png` (completed), `card-forestOpen.png`, `card-wetland.png`, `card-frozen.png` (completed), `card-frozenOpen.png`, `card-aquatic.png`, `card-rolling.png` / `card-rollingFull.png` (completed), `card-tropical.png`, `card-drylands.png` (completed), `card-drylandsOpen.png`, `card-grassland.png`, plus `card-mountain/badlands/underground.png` (regression glance), `card-rollingExpanded.png`, `card-selected.png`.
- Full lists, three variants side by side: `list-en-1280x800.png`, `list-ru-1366x768.png`, `list-en-1440x900.png`, `list-en-1920x1080.png`. Full Journey with the map: `context-{A,Aplus,Arefined}-{en-1280x800, ru-1366x768, en-1440x900, en-1920x1080}.png`.
- Read: Forest, Wetland, Frozen and Underground carry visibly more colour (warm forest foliage, water/green, blues) in the first ~45% of the card; Bright biomes are a touch darker than A+ in that zone (Aquatic/Rolling/Mountain) but keep their palette; Badlands, Drylands, Grassland stay warm. Completed cards stay calmer (layer opacity .60 unchanged), the selected gold border is untouched, Place controls on the open card keep their plain ground.

## Performance
Same single composited `::before` per card, same assets as A+ (300px AVIF, loaded only for biomes on screen). Changes are gradient stops only: no runtime analysis, no filters, no new requests.

## Remaining issues
- The `#number` is capped by the muted colour itself (4.87:1 on plain ground), so it can never beat that; it now sits at 4.6-4.8.
- Vertical art still reads as colour bands on a 56px card, not recognisable scenes (known A+ limitation, unchanged).
- The dev-only `print PDF: Stage 0 proof` unit test fails in this tree; unrelated to this CSS/JS (pre-existing).

## Recommendation
**Refined A+ is ready for production approval.** It meets every contrast target with margin, restores the dark biomes' colour, keeps geometry byte-identical and adds no runtime cost. On approval: fold the refined variables into the base `.j2-card[data-art]` rules (replace PD-050's strip), delete the `?stockArt=` switch, the A+ block's `ext-h` rules and this harness, and record the supersession in `docs/product-decisions.md`. Nothing is enabled by default, committed or pushed yet.
