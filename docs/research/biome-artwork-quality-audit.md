# Biome artwork quality audit

Scope: the 13 biome illustrations (`aquatic … wetland`, `universal`) as the fallback tier of the artwork
hierarchy (unique painting → archetype → biome → neutral). Journey's own header art and the Fully
Shadowblighted card art were inspected for sharing, not changed. Evidence pack:
`docs/research/biome-artwork-quality-review/` (screenshots) and the lab's **I · Biome Quality Comparison**
(`.claude/mockups/artwork-crop-lab/`, section `#sec-biome-quality`). Measurement scripts are not kept in
the repo; the method is described under each result so it can be repeated.

## 1. Bottom line

1. **The Catalog strip is not technically blurry.** At DPR 1 and 2 the pixels Chrome draws match the PNG
   master resampled with Lanczos to within 36–39 dB PSNR, with the same high-frequency energy (ratio
   0.93–1.06). Nothing is upscaled, no transform or filter applies, the right tier is selected.
2. **Two real defects were found and fixed**: the 48 px Prep thumbnail (aliased/speckled downscale of a
   40 KB strip) and the 33 MB of PNG masters copied into `dist/`.
3. **One defect is latent, not yet in production**: the 1:3 strips cannot serve wide My Lists covers
   (3.2× upscale at DPR 2). Production draws no biome cover today, so nothing was shipped for it; the lab
   shows the problem and a measured remedy.
4. **Intrinsic softness exists** in a few masters (wetland, badlands, underground) and cannot be fixed
   technically. Details in §6.

## 2. Asset inventory

Masters: `img/biomes src/<biome>.png`, 1024 × 1536 (2:3), 2.4–2.8 MB, 32.6 MB in total, tracked in git.
Every shipped strip is the **centre 512 × 1536 column** of its master (x 256–768, found by matching the
300 px AVIF against master crops; MSE ≈ 8–10) resized to 1:3 and mildly sharpened (the strips'
Laplacian energy matches `sharpen(σ0.5)` on a Lanczos downscale). No script in the repo produces the strips;
they were made externally. Journey's header art is a different family (`img/biome-artwork-source/*-h.png`,
1672 × 941 → `img/journey2/headers/*.webp`, 960 × 540) and its Hex Stock cards read the same
`-300.avif` / `-200.webp` strips through `css/journey2.css` — which is why the strips were left alone.

Shipped derivatives: strips `-100/-200/-250/-300.avif` (100×300 … 300×900), `-200.webp` (200×600, the
`<img>` fallback), `fully-shadowblighted-{200.webp,300.avif}` (600×244, 1000×407; Journey only), and, new,
`-thumb-{48,96,144}.webp`. AVIF encoder settings are not recorded anywhere in the repo (unknown).

| Biome | Master | Strip KB 100 / 200 / 250 / 300 AVIF / 200 WebP | New thumb KB 48 / 96 / 144 | Catalog PSNR vs master, DPR1 / DPR2 (dB) | Prep PSNR vs master, before → after, DPR1 (dB) |
|---|---|---|---|---|---|
| aquatic | 1024×1536 PNG, 2.55 MB | 11.8 / 37.2 / 54.6 / 72.6 / 40.4 | 1.4 / 4.4 / 9.0 | 37.2 / 37.5 | 25.0 → 30.6 |
| badlands | 1024×1536 PNG, 2.28 MB | 8.2 / 27.3 / 40.8 / 55.2 / 33.1 | 1.2 / 4.2 / 8.6 | 39.0 / 39.1 | 27.7 → 33.0 |
| drylands | 1024×1536 PNG, 2.57 MB | 10.2 / 36.6 / 55.7 / 76.7 / 42.4 | 1.3 / 4.5 / 9.7 | 37.2 / 37.0 | 26.1 → 35.5 |
| forest | 1024×1536 PNG, 2.70 MB | 10.6 / 38.7 / 59.3 / 80.1 / 45.2 | 1.2 / 4.5 / 9.6 | 36.4 / 36.3 | 26.5 → 35.1 |
| frozen | 1024×1536 PNG, 2.54 MB | 8.3 / 29.2 / 43.7 / 60.0 / 34.8 | 1.3 / 4.5 / 9.4 | 37.4 / 37.0 | 24.3 → 30.8 |
| grassland | 1024×1536 PNG, 2.55 MB | 9.6 / 34.6 / 53.2 / 73.9 / 41.1 | 1.4 / 4.6 / 9.7 | 36.8 / 36.5 | 23.7 → 31.9 |
| mountain | 1024×1536 PNG, 2.55 MB | 12.5 / 42.2 / 63.5 / 85.4 / 45.6 | 1.5 / 5.0 / 10.8 | 36.0 / 35.8 | 23.8 → 30.4 |
| rolling | 1024×1536 PNG, 2.60 MB | 10.4 / 36.5 / 55.9 / 75.7 / 43.3 | 1.4 / 5.0 / 10.8 | 36.5 / 36.6 | 24.4 → 33.3 |
| settlement | 1024×1536 PNG, 2.45 MB | 9.1 / 33.0 / 51.0 / 69.5 / 39.0 | 1.2 / 4.2 / 9.2 | 37.6 / 37.2 | 26.8 → 35.1 |
| tropical | 1024×1536 PNG, 2.56 MB | 10.0 / 35.6 / 54.0 / 73.8 / 41.5 | 1.2 / 4.1 / 8.7 | 36.2 / 35.6 | 25.4 → 34.7 |
| underground | 1024×1536 PNG, 2.37 MB | 9.0 / 27.9 / 40.0 / 52.7 / 32.7 | 1.3 / 4.0 / 7.7 | 37.6 / 38.5 | 28.6 → 36.7 |
| universal | 1024×1536 PNG, 2.60 MB | 11.0 / 40.0 / 60.9 / 83.4 / 44.9 | 1.4 / 4.9 / 10.6 | 36.6 / 36.0 | 24.1 → 34.4 |
| wetland | 1024×1536 PNG, 2.29 MB | 8.1 / 27.9 / 41.7 / 55.7 / 34.1 | 1.1 / 3.6 / 7.2 | 37.9 / 38.0 | 27.5 → 33.5 |

UI consumers: Catalog `biomeArtHtml()` (strip, `<picture>` AVIF with `sizes="(max-width: 640px) 88px, 95px"`,
WebP fallback) · Prep picker row `prepEnvThumbHtml()` (48 px) and Prep central tile `centralEnvCardHtml()`
(40/44 px) · Journey Hex Stock cards (`css/journey2.css`, `image-set` of `-300.avif` / `-200.webp`) · My
Lists: **none** (`listCoverHtml()` draws only `ENV_ART` paintings).

## 3. Hypotheses, tested one at a time

Method: Chrome (Playwright, `channel: chrome`) at DPR 1, 2 and 3, 1280 × 800 viewport; production markup and
CSS injected at integer pixel positions; element screenshots compared with the master resampled once
(Lanczos3) to the same device-pixel size. "HF" is the ratio of Laplacian variance, rendered ÷ reference.

| | Hypothesis | Verdict | Evidence |
|---|---|---|---|
| A | Source too small | **Catalog: no. Prep: n/a (fixed). Lists strip: yes.** | Catalog box 95 × 195–250 CSS px; `object-fit: cover` on a 1:3 image is width-driven (95 × 285), so the image never scales up. Needed device width 95 / 190 / 285 px at DPR 1 / 2 / 3; served 100 / 200 / 300. A 318 × 90 cover from the 200–300 px-wide strip would need 636 px → 2.1–3.2× upscale. |
| B | Wrong asset selected | **No** | `currentSrc`: `forest-100.avif` at DPR 1, `forest-200.avif` at DPR 2 (`naturalWidth` reports 95 because density-corrected), `-300.avif` at DPR 3. `sizes` is correct for the fixed 95/88 px panel. Prep used `-200.webp` for a 48 px tile at every DPR: right file family, wrong shape. |
| C | Compression | **No (Catalog)** | AVIF vs Lanczos reference: 31.7–37.6 dB, HF 1.9–2.5× at native tier size because the strips carry a mild sharpen (σ≈0.5), not a loss. (Banding and halos were not inspected per file; the PSNR/HF figures and the normal-size screenshots show no defect.) The 100 px AVIF (8–13 KB) holds up as well as 300 px. WebP vs AVIF: within ±1.5 dB, neither systematically better. |
| D | CSS | **No** | `object-fit: cover`, `object-position: 50% 0%`, `transform: none`, `filter: none`, `image-rendering: auto` on every strip; the only `zoom` (0.9) is on `.catalog-bar`, not on cards. |
| E | Original softness | **Partly** | §6. |

### Catalog (production, unchanged)

PSNR vs ideal 35.6–39.1 dB, HF 0.93–1.06, every biome, DPR 1 and 2 (table above). The strip is faithful.

### Session Prep — the real technical defect

`.prep-thumb` drew `-200.webp` (200 × 600, 33–46 KB) into 48 × 48 with `object-fit: cover`. That is a
~4:1 browser downscale of an already-sharpened image. Chrome's resampler leaves it speckled: PSNR vs the
Lanczos reference 23.7–28.6 dB at DPR 1 (26.6–33.1 dB at DPR 2) and **3.0–4.6× the reference's high-frequency
energy** — aliasing and ringing, not detail (compare rows 1 and 2 of the 5× diagnostic in the lab). The same
file served the 40/44 px central-column tile.

**Fix:** `scripts/generate-biome-thumbs.js` → `img/biomes/<biome>-thumb-{48,96,144}.webp`, one per DPR
1×/2×/3×, cut from the same framing as before (middle third of the strip = master x 256–768, y 512–1024),
resampled once with Lanczos3, one mild unsharp (σ 0.6, 0.6/0.8; chosen against none / 0.6 / stronger at 5×),
WebP q90. `prepEnvThumbHtml()` and `centralEnvCardHtml()` use `src` + `srcset="… 2x, … 3x"`.
Result: PSNR 30.1–36.7 dB at DPR 1 and 2 (the remaining gap to the unsharpened reference is the intentional
unsharp), HF 1.5–1.95×. Browser-rendered after-pixels at DPR 1/2/3 were checked; `currentSrc` is
`<biome>-thumb-48/96/144.webp`. No new framing, no AI, masters untouched.

Honest scale of the improvement: at the real 48 px size the change is **clean versus speckled**, not
"sharper detail" — a 48 px square of a landscape cannot hold more. Compare `02-prep-*.png`.

### My Lists — latent defect, not shipped

`listCoverHtml()` draws no biome tile, but the lab's mixed-art covers (and any production adoption of the
fallback hierarchy) would feed the strip into a 318 × 90 hero or 159 / 106 px tiles. At DPR 2 that is 636 px
from a 200 px strip. `03-lists-*.png` shows the softness against a wide derivative cut from the master's
full width (1024 × 290 band at the cover focus → 640 × 181 WebP, ~20–30 KB; lab asset only,
`assets/biome-quality/wide-*.webp`). **Recommendation:** when production adopts biome covers, generate
`<biome>-cover-640.{avif,webp}` (+ 320 for DPR 1) with the same script style; do not reuse the strip. Note
this is a framing decision (full master width instead of its centre column), flagged for art direction.
Cover-selection rules were not touched.

### Build — masters in `dist/`

`scripts/build.js` excluded `img/biome-artwork-source/`, `ribbon-fabric-source/` and
`cover-archetypes-source/`, but not `img/biomes src/` (the path has a space; `.gitignore` only listed
`img/biomes/src/`). All 32.6 MB of PNG masters were deployed. Now excluded
(`tests/biome-art-assets.test.js`); `dist/img` shrinks by that amount and `dist/img/biomes src` is gone.

## 4. Archetype comparison

At the rendered Catalog window (190 × 478 device px) the four archetype crops and the biome strips have
overlapping detail energy (Laplacian variance 1.1k–3.1k vs 0.9k–3.8k; contrast SD 37–54 for both). At native
master scale (512² centre crop, Laplacian ÷ variance) biomes score 0.19–1.03 against 0.47–1.51 for the
archetypes. So the archetypes are not technically sharper per pixel in the Catalog; they read better because
they are **landscape sources shown through a window**: a 1280 px image downscaled ×0.66 into the strip versus a
512 px column downscaled ×0.37, plus architectural subjects with crisp edges, and, in Lists, the upscale
above. Perceived softness, composition and the Lists upscale — not the Catalog files — are the plausible
sources of the owner's impression. I could not reproduce a Catalog-level quality gap with measurements.

## 5. Performance

| | Before | After |
|---|---|---|
| Prep picker, one thumb | 33–46 KB (`-200.webp`) | 1.1–1.5 KB (DPR 1), 3.6–5.0 KB (DPR 2), ~8–12 KB (DPR 3) |
| All 13 biomes in a Prep list | 518 KB | 17 / 58 / 121 KB at DPR 1 / 2 / 3 |
| Catalog strip | unchanged: 8–13 KB (DPR 1), 28–43 KB (DPR 2), 41–66 KB (DPR 3) per distinct biome | unchanged |
| Repo/dist, new files | — | 39 thumbs, 195 KB total |
| `dist/` | contains 32.6 MB of PNG masters | none |

Browser caching and `loading="lazy"` are as before. The Prep page no longer shares a cache entry with the
Catalog's `-200.webp` (a user who visited the Catalog first re-downloads a few KB, saving ~40 KB per biome).
Journey: no Journey file or CSS changed; Hex Stock cards still read `-300.avif` / `-200.webp`.

## 6. Scorecard and classification

Classes: 1 resolution · 2 compression · 3 rendering · 4 focal position · 5 inherently soft · 6 composition
unsuited to the target UI. Only 1–4 are technical. "Master lap" = native detail per contrast (Laplacian ÷
variance, 512² centre crop; archetypes 0.47–1.51).

| Biome | Master lap | Catalog before → after | Prep before → after | Main issue | Fix | Remaining |
|---|---|---|---|---|---|---|
| aquatic | 0.34 | faithful → same | speckled → clean | Prep aliasing | thumbs | soft water gradients (5, mild) |
| badlands | 0.23 | faithful → same | speckled → clean | Prep aliasing | thumbs | **soft: lava glow/haze (5)** |
| drylands | 0.61 | faithful → same | speckled → clean | Prep aliasing | thumbs | none |
| forest | 0.47 | faithful → same | speckled → clean | Prep aliasing | thumbs | none |
| frozen | 0.66 | faithful → same | speckled → clean | Prep aliasing | thumbs | none |
| grassland | 0.42 | faithful → same | speckled → clean | Prep aliasing | thumbs | strip top is sky: reads as sky and a tree (6) |
| mountain | 0.49 | faithful → same | speckled → clean | Prep aliasing | thumbs | none |
| rolling | 0.93 | faithful → same | speckled → clean | Prep aliasing | thumbs | none |
| settlement | 1.03 | faithful → same | speckled → clean | Prep aliasing | thumbs | strip is mostly roofs (6) |
| tropical | 0.69 | faithful → same | speckled → clean | Prep aliasing | thumbs | none |
| underground | 0.25 | faithful → same | speckled → clean | Prep aliasing | thumbs | **soft: blue cave glow (5)** |
| universal | 0.64 | faithful → same | speckled → clean | Prep aliasing | thumbs | none |
| wetland | 0.19 | faithful → same | speckled → clean | Prep aliasing | thumbs | **softest master: mist, reflections (5)** |

Class 5/6 judgements are mine from the 5× and normal-size views and the master metric; they are not
measurements of artistic quality.

## 7. Final recommendation

1. **What caused the blur:** not the Catalog derivatives (they are faithful and correctly selected). The
   measurable causes are (a) the 4:1 browser downscale in the 48 px Prep tile and (b) a 1:3 strip stretched into
   wide covers (lab/future Lists). Some perceived softness is the masters' own atmosphere.
2. **Fixed:** Prep thumbnails (dedicated 1×/2×/3× files, −95 % bytes), masters excluded from `dist/`.
3. **Technically adequate now:** all 13 in the Catalog; all 13 in Prep at 48/40/44 px.
4. **Soft by nature:** wetland, badlands, underground (and mildly aquatic). Exporting larger files will not
   add detail.
5. **Regeneration needed?** None strictly. Wetland (and, if the owner still finds them dull beside the
   archetypes, badlands and underground) are the candidates for replacement art; the masters are only 1024 × 1536,
   so a future regeneration should target ≥ 1672 px on the long side to match the archetypes.
6. **Harmony with the archetype library:** at 48 px and in the Catalog strip they now sit at comparable
   detail (see lab §1–2). In wide covers they will only harmonize once the wide derivative above ships.

## 8. Limits of this audit

- PSNR and Laplacian energy are fidelity/detail proxies; the primary evidence is the side-by-side screenshots.
- Screenshots were taken in headless Chrome; Safari's and Firefox's downscalers differ, and the aliasing
  magnitude may differ there.
- The AVIF encoder settings that produced the strips are unrecorded; the strips were not regenerated.
- Not measured: Retina laptops at fractional DPR or browser zoom ≠ 100 % (Chrome then picks the nearest tier).
- 1920 × 1080 was not separately rendered; Catalog and Prep geometry are fixed-pixel and do not change by viewport.
