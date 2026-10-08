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
