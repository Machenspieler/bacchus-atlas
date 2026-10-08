# Drylands header — validation of the shared Forest design

## Changes
- `img/journey2/headers/drylands.webp` — new (960×540 WebP q82, **132,036 B**). Source `img/drylands-h.png` (1672×941, 2.75 MB) untouched and not loaded by the app. Same sharp resize/quality as `forest.webp` (145,646 B).
- `css/journey2.css` — +1 line: `[data-art="drylands"] { --j2-art: url(…/drylands.webp) }`.
- `js/journey2-view.js` — `HEADER_ART_BIOMES` now `['forest', 'drylands']`.
No other rule, no storage/model/map code touched. Other biomes get no `data-art` and render as before. The `?hdr=` dev switch is unchanged (no new controls).

## Crop position (1440×900, header only): `compare-position-25-40-50-{en,ru}.png`
| Position | Result |
|---|---|
| **25% (kept, = Forest)** | Sun fully visible with its sky glow, red cliff face at right, rock towers faint. Clearest "Drylands". |
| 40% | Sun half-cut at the top, rock towers and canyon floor clearer, noticeably darker/muddier sky. |
| 50% | Sun and sky gone; dark canyon floor. Weakest. |
No clearly better crop, so **no Drylands-specific position**; Forest untouched.

## Screenshots
`forest-hex-en-1440.png`; `drylands-{hex,region}-{en,ru}-{1280,1366,1440,1920,2560}.png` (20). Header is 88px in all of them; icon, title, meta and close stay inside the header.

## Readability
- Title: ≥11.3:1 against the raw artwork at every width/language.
- Close button: white × on its dark 55% backing over the orange cliff ≈ 8:1, clearly visible.
- Meta line (muted `#9a8f7d`): the *bare* artwork behind its right end is bright (sampled worst-case 1.0–1.3:1; Forest 1.3:1), so legibility there depends on the existing text-shadow halo. It reads clearly in all screenshots (EN and RU), but it is the weakest element, for Forest as well. Trying `--parchment-dim` for the meta was tested and was not clearly better, so not applied. If it is ever raised, do it for all art headers at once.
- At 1280 the long EN/RU meta wraps to two lines (existing behaviour at that inspector width); header stays 88px, no clipping or shift.

## Verdict
The shared header was sufficient as is: one image variable per biome and one id in a set. Drylands' bright sun, orange sky and red rock sit comfortably in the existing left-to-right gradient, and the dark interface surface is not overpowered. Suitable for scaling to the remaining 11 biomes; per biome: a 960×540 WebP (≈130–150 KB), one CSS line, one set entry. Brief for art: keep bright focal elements right of centre and the left ~40% calm, as in these two.
