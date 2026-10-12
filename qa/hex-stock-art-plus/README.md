# Hex Stock artwork — A vs A+ prototype (temporary)

Switch: `#/journey` = **A** (current, PD-050, unchanged) · `?stockArt=extended#/journey` = **A+** (vertical biome art, widened) · `?stockArt=extended-h#/journey` = **A+h** (horizontal Journey header art, evaluation only).
Nothing is stored; no parameter = production styling. Reproduce everything: `node scripts/journey2/verify-hex-stock-art-plus.js` (26 checks, all pass).

## Files changed
- `js/journey2-view.js` — `STOCK_ART_VARIANT` (reads the query string once) + one `data-art-v` attribute in `applyStockArt()`. 5 lines.
- `css/journey2.css` — one removable block "stockArt A+" at the end. Delete it and the JS lines to remove the prototype.
- `scripts/journey2/verify-hex-stock-art-plus.js`, `qa/hex-stock-art-plus/*` — harness and evidence (delete with the prototype).

## CSS strategy
Same decorative `::before` layer as A (`pointer-events:none`, behind content, `isolation:isolate` card), but `inset:0` (whole card) instead of a 96px strip.
Two things shape the image: a **background-layer ink wash** (so the shared gradient, not per-text shadows, carries readability) and the existing **mask-image** fade.
- Mask (alpha): 1 @0 · .92 @14% · .68 @28% · .46 @44% · .30 @62% · .14 @82% · .04 @100%. Layer opacity .92 (A: .85).
- Wash (ink `20 17 15`): 0 @0–12% · .64 @26–60% · .45 @82–100% — keeps the left ~12% (icon area) undimmed and darkens only the text column.
- Open card: same horizontal mask ∩ the existing vertical mask (art stays on the head row, Place controls keep plain dark ground).
- Fully placed collapsed card: layer opacity .60 (A: .50). Text, icon, status and buttons are never faded. Selected: gold border is untouched (layer sits inside it).
- No blur, no filters, no stretching: `background-size: cover`, never a non-uniform scale.

## Artwork source
- A+: `img/biomes/<biome>-300.avif` (300x900) via `image-set()` with the `-200.webp` as fallback. At a ~310px card the 300px asset is ~1.0x (the 200px one would be 1.5x upscaled). +~35 KB per biome vs A when shown, loaded only for biomes actually on screen.
- A+h: `img/journey2/headers/<biome>.webp` (960x540), ~0.32x downscale, ~110-160 KB each (3-4x A+).
- **Vertical art stays suitable but only as colour/atmosphere**: a 56px-tall card shows a ~6% horizontal slice of a 1:3 portrait image, so you see tonal bands (sky/horizon/ground), not recognisable scenes. It reads as an "atmosphere" wash, which is what A already is, just wider.
- **Horizontal art is clearly better as a picture** (trees, rock formations, water are recognisable) but it is darker/lower-key, has bright focal spots that fight text (Aquatic badge 3.3:1, Rolling title 4.4:1 worst case) and is 3-4x the bytes. It would need its own per-biome crop/darkening. Not recommended without that work; not adopted.

## Measurements (identical for A, A+, A+h)
Geometry (15-card list, collapsed + Rolling expanded): every card w/h, inter-card gaps, `.j2-cards` and `.j2-side` size, every button w/h, card margin/padding/border-left — **byte-identical** (`geometry.json`, checks "geometry A+ == A").
Hit areas: layer `pointer-events:none`; 100% of on-screen controls win their own centre in all three variants.
Worst-case text contrast over the artwork (p95 luminance behind the glyph boxes, 9 cards, `contrast.json`):

| element | A | A+ | A+h |
| --- | --- | --- | --- |
| region name | 5.3 | 4.7 | 4.4 |
| status line | 6.7 | 5.2 | 6.9 |
| #number (muted) | 4.9 | 4.2 | 4.3 |
| Shadowblighted badge | 4.8 | 4.3 | 3.3 |
| rating dots (non-text, needs 3) | 3.7 | 3.6 | 4.6 |

A+ trades ~0.5-1.5 contrast points for the extra art; nothing falls below 3:1 and primary text stays >= 4.7. The #number and badge sit slightly under 4.5 in the worst card (Tropical / Aquatic).

## Performance
Extra layer cost is identical (one composited `::before` per card, no blur). A+ decodes a 300px AVIF per visible biome instead of a 200px WebP (~+35 KB each, 11 biomes max, cached). A+h would add ~1.4 MB worst case. No JS runtime cost beyond one attribute.

## Known limitations of A+
- Flat wash dulls saturation in the middle of the card; bright biomes (Aquatic, Badlands, Grassland) need it, dark ones (Forest, Wetland) do not — they look muddier than necessary.
- Vertical art yields bands, not scenes (see above).
- Compared with A, the left accent is slightly less punchy because the wash is shared.

## Recommendation: **3 — one targeted adjustment, then adopt A+ (vertical)**
| | A | A+ |
| --- | --- | --- |
| Artwork visibility | accent strip | clearly more, spans the card |
| Visual balance | black right half | continuous, no visible seam |
| Readability | best | good, ~1 point lower worst case |
| Compactness / geometry | identical | identical |
| Selected clarity | gold border strongest | unchanged |
| Completed hierarchy | fine | fine (.60 layer) |
| 15-card list | calm | richer, warmer, slightly murkier |
| vs. Region Overlay headers (horizontal art, left-to-right gradient) | related | closer in feel |
Adjustment before approval: make the wash **per-biome** (strong only for Aquatic / Badlands / Grassland / Tropical / Rolling, light for Forest / Wetland / Underground / Frozen) so dark biomes regain colour and bright ones keep contrast >= 4.5. Do not switch to horizontal art. Pending PD-050 supersession; A remains production.
