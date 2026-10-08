# Forest illustrated header — prototype review

Experimental, Forest only. Not a product decision (nothing added to `docs/product-decisions.md`).

## What changed
- `js/journey2-view.js` — `applyHeaderArt()` + `HEADER_ART_BIOMES` (flags the shared Region Inspector with `data-art`, `data-art-pos`, `data-art-h`). Dev-only `?hdr=` switch lives here.
- `css/journey2.css` — `[data-art]` block just before `.j2-insp-scroll` (artwork on a `::before` layer, gradient, close-button backing). Artwork path is set per biome there (`--j2-art`).
- `img/journey2/headers/forest.webp` — 960×540 WebP derivative (146 KB). The source `img/forest_h.png` (2.9 MB) is untouched and not loaded by the app.

## Both overlays share one implementation
The hex-opened overlay and the card `i` overlay are the same element (`#j2-region-inspector`), so one header rule covers both. No other biome, the overtaken state, Sanctuary and Locate popovers are unaffected (`control-drylands-*.png`).

## Switching variants
Append a query to the URL, then open an overlay: `http://localhost:8099/?hdr=A1#/journey`

| `?hdr=` | position | height |
|---|---|---|
| `A1` (default) | `center center` | original (64 px) |
| `A2` | `center center` | +24 px (88 px) |
| `B1` | `center 25%` | original |
| `B2` | `center 25%` | +24 px |

Remove `?hdr=` handling (the 4 lines in `applyHeaderArt`) before any rollout.

## Screenshots (this folder)
`{hex,region}-{A1,A2,B1,B2}-en-desktop.png` (8 primary, 1440×900), plus `*-ru-desktop`, `*-B1-en-laptop` (1280×800), `*-B1-ru-tablet` (820×1024), `*-B1-ru-mobile` / `*-B2-en-mobile` (390×844), and `control-drylands-*` (unchanged header).

---

# Final responsive polish (approved direction)

Screenshots: `final/{hex,region}-default-{en,ru}-{390,820,1280,1440}.png` (16) + `final/proposed-z-index-fix-region-en-390.png`.
Defaults now (no query): image `center 25%`; header **min-height** 64+24 = 88px; **+0 at ≤600px**. `?hdr=A1…B3` still overrides (`3` = +12px).

## Breakpoint decisions
| Width | Header | Why |
|---|---|---|
| ≥601px (tablet, laptop, desktop) | 88px, one line or wrapped | B2. Extra height is a *min-height*, not padding, so a wrapped meta line (901–~1300px) grows the header naturally: 88px, not 88+24. The earlier padding version gave 111px at 1280. |
| ≤600px (phones) | natural: 64px single line, 87–105px when meta wraps | B1. Header already wraps taller than 88px at 390px, so adding space is pure cost. |
| B1 vs +12px at 390px | identical (105px) | +12px gives no benefit once the meta wraps (min-height 76 < natural 105), so it is not recommended. |

Transition checked at 360/480/600/601/700/899/901/1024 (RU): 105/87/64/88/88/88/88/88. The one visible step is 64→88 at 600/601, intentional.

Other fix (scoped to `[data-art]` headers): close button `flex:none`. With a 3–4 line meta it was squeezed to 22×32px at 390px; now 32×32 everywhere. Icon, title, meta and close are fully inside the header at every checked size/language.

## Mobile side-panel overlap — root cause (pre-existing, not fixed here)
1. `.j2-sidewrap` (drawer / collapsed rail) is `z-index: 5`; `.j2-region-inspector` is `z-index: 4`. Both are absolute in `.j2-stage`, so on overlap the rail paints **over** the inspector.
2. At ≤900px `Geo.placeInspector` returns early (`if (o.narrow) return { x: centred, y: maxY, side: 'narrow' }`, `js/journey2-geometry.js`), ignoring `blocked` (the sidewrap rect that `inspectorBlocked()` supplies). The panel is full width and bottom-anchored, so the 44px rail column, which is ~460px tall at 390px, lies on top of its left edge: icon and the start of every section line.
3. With the drawer *expanded* (a card `i` click on a phone) the full-width drawer hides the inspector entirely, same z-order cause.

Recommended minimal fix (separate change): `@media (max-width: 900px) { .j2-region-inspector { z-index: 6; } }` in `css/journey2.css`. Verified with an injected style: nothing covers icon/title/meta/close at 390 and 820 in both overlays (`proposed-z-index-fix-region-en-390.png`). Trade-off: while the inspector is open it covers the lower rail buttons; it has its own close button and Esc. A heavier alternative is making the `narrow` branch honour `blocked`, which is not needed.
