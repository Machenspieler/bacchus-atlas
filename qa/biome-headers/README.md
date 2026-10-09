# Journey illustrated headers — all terrains (PD-049)

Captured with Chrome against the source tree (`python3 -m http.server`), real `#/journey` page, one placed hex per terrain, EN and RU, at 1280x800, 1366x768, 1440x900, 1920x1080, 2560x1440. Hex overlay (click a placed hex) and Region overlay (card `i` button) both checked for every terrain.

## Artwork inventory
Source: `img/biome-artwork-source/*.png` (1672x941, untouched, excluded from `dist/`). Derivative: `sharp` resize 960x540 (lanczos3) + WebP q82 — the identical recipe that reproduces the approved `forest.webp` / `drylands.webp` byte-for-byte (145,646 / 132,036 B).

| Biome | File (`img/journey2/headers/`) | Size | Bytes | Position | Status |
|---|---|---|---|---|---|
| Forest | forest.webp | 960x540 | 145,646 | center 25% | approved, unchanged |
| Drylands | drylands.webp | 960x540 | 132,036 | center 25% | approved, unchanged |
| Frozen | frozen.webp | 960x540 | 133,518 | center 25% | pass (aurora + peaks kept) |
| Underground | underground.webp | 960x540 | 118,954 | center 25% | pass |
| Aquatic | aquatic.webp | 960x540 | 159,066 | center 40% | pass (more water) |
| Wetland | wetland.webp | 960x540 | 131,096 | center 40% | pass (flooded ground) |
| Grassland | grassland.webp | 960x540 | 132,822 | center 50% | pass (25% was mostly sky) |
| Tropical | tropical.webp | 960x540 | 154,586 | center 25% | pass |
| Rolling | rolling.webp | 960x540 | 140,166 | center 40% | pass (layered ridges) |
| Mountain | mountain.webp | 960x540 | 113,000 | center 25% | pass |
| Badlands | badlands.webp | 960x540 | 103,984 | center 25% | pass |
| Settlement | settlement.webp | 960x540 | 119,984 | center 25% | pass via fixture (Journey never produces it) |
| Universal | — | — | — | — | **MISSING: no `universal` horizontal source supplied**; falls back to the plain header |

## Files
- `comparison-1440-en-ru.png`, `comparison-1280-en-ru.png` — all 13 headers, final styling, review only.
- `crop-comparison-25-40-50-en.png` — the crop evaluation.
- `viewports/laptop-vs-desktop-{en,ru}.png` — header at the five viewports.
- `real-ui/` — full-page Journey screenshots (hex overlay per terrain, Region overlay, EN/RU, long meta at 1280).
- `fixture/` — Settlement / Universal through the real inspector DOM + CSS with the shared URL builder.

## Results
- Every terrain: correct `data-art`, header 88 px at all 10 viewport/language combinations, no title/meta overlap with the close button, switching between regions updates the art; no 404s except the expected Universal one.
- Weakest element (as in the Forest/Drylands review): the muted meta line over the brightest right-hand art (Aquatic, Grassland, Drylands). It stays readable via the existing text-shadow halo; no per-biome gradients were needed. Not measured numerically this round — visual review only.
