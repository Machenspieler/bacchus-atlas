# Biome cover source comparison

Final image-source evaluation before adaptive My Lists covers. Experiment only: `listCoverHtml()`, `ENV_ART`, the Catalog, Session Prep, Journey, `data/` and the classification dataset are unchanged; no artwork was generated, downloaded or modified. Builds on [biome-artwork-quality-audit.md](biome-artwork-quality-audit.md) and [artwork-crop-lab-v2-report.md](artwork-crop-lab-v2-report.md).

- Lab: section **K · Biome Cover Source Comparison** of `.claude/mockups/artwork-crop-lab/artwork-crop-lab.html` (`python3 -m http.server 8107` from the repo root, or the `atlas-lab` launch entry). Code: `biome-sources.js`; evidence/derivative script: `make-biome-cover-assets.js`; screenshots: `shoot-biome-covers.js`.
- Machine-readable mapping (lab-only, not wired into production): [biome-cover-registry.json](biome-cover-registry.json), guarded by `tests/biome-cover-registry.test.js`.
- Screenshot pack: [biome-cover-source-review/](biome-cover-source-review/) (file names in §10).

Crops and verdicts are my reading of the lab at real card size; the owner has not approved them. Judged in headless Chrome at DPR 1 and 2 and 1280 / 1440 / 1920 px wide.

## 1. Actual artwork inventory

Cover tile sizes (production CSS): single 318 × 90, two-up 158.5 × 90, three-up 105.3 × 90.

| Source | Files | Pixels | Aspect | Role today |
| --- | --- | --- | --- | --- |
| **A** Catalog strip | `img/biomes/<b>-200.webp` (+ `-100…-300.avif`) | 200 × 600 (up to 300 × 900) | 1:3 | Catalog, Journey Hex Stock |
| **B0** master band | lab `assets/biome-quality/wide-<b>-640.webp` | 640 × 181 | 3.5:1 | audit asset only |
| **B** master 16:9 window | lab `assets/biome-cover/b16-<b>-640.webp` (new, from `img/biomes src/<b>.png`) | 640 × 360, cut from the master's full 1024 px width | 16:9 | lab only |
| **C** Journey header | `img/journey2/headers/<b>.webp`, 12 files, 101–155 KB (mean 129 KB) | 960 × 540, from 1672 × 941 PNG masters in `img/biome-artwork-source/` | 16:9 | Journey Region Inspector / sanctuary overlay |
| D other | `img/journey2/void-nebula.webp`, `headers/fully-shadowblighted.webp` | 1672 × 941, 1280 × 480 | 16:9, 8:3 | Journey only — both **rejected** (below) |

The portrait masters (`img/biomes src/<b>.png`, 1024 × 1536, 2:3) are the highest-quality real source of the strips. Journey's masters are 16:9 and **are the same scenes as the strips composed landscape**: the acacia and sun, the aquatic sea stack, the harbour, the waterfall temple, the mine tracks. I checked all twelve against their strip and master side by side (lab K6, "full image"); none is a different scene, so the mapping is by picture, not by file name.

Coverage mismatch, stated explicitly: Journey has **12 biome headers, no `universal`**. Journey's code comment calls `settlement`/`universal` "catalog categories, never Journey regions"; its Settlement illustration is used only for sanctuaries (`SANCTUARY_ART`). `fully-shadowblighted` is Journey's 13th file and is not a Catalog biome. Rejected as `universal` stand-ins: `void-nebula` is a texture with no subject; `fully-shadowblighted` means "overtaken by the Shadowblight" and would mislead.

Weight of the problem: by `art_biome`, settlement = 98 of 316 environments, universal = 53, underground 37, forest 33, aquatic 22, wetland 14, badlands 14, drylands 12, mountain 10, tropical 9, frozen 7, rolling 4, grassland 3. **Journey covers 263 of 316 (83 %); the 53 universal environments and the 98 settlement ones carry the weakest-fitting art.**

## 2. Vertical masters vs Journey landscapes

A 318 × 90 cover is a 3.5:1 band. From a 2:3 master that is **19 % of the picture's height**; the audit's band (B0) and even a 16:9 window (B, 37 % of the height) are slices of a picture composed to be seen whole. Journey's 16:9 frame shows **50 %** of its height in the hero and **all** of it at two-up, because 158.5 × 90 is 1.76:1.

| Hero 318 × 90 | Source px across the tile | At DPR 2 (636 device px) | Visible fraction of the picture |
| --- | --- | --- | --- |
| A strip (200 px wide) | 200 | **3.2× upscaled** | 9 % of the strip's height |
| B0 / B (640 px) | 640 | 1.0× | 19 % / 37 % of the master's height |
| C Journey (960 px) | 960 | **1.5× oversampled** (1.0× at DPR 3) | 50 % of the picture |

Visual findings (lab K2, K6; screenshots 02, 06):

- **C wins in all 12 biomes it exists for.** It carries the sky, the focal subject and a foreground in one frame; A/B0/B show a tight slice (aquatic loses the sea stack; grassland and mountain are mostly sky or cloud; forest is trunks; settlement is roofs).
- Wetland is the clearest case: B0/B show a large tree trunk in haze, C shows the whole swamp with sun, reflections and cypress knees — the same mood, but readable.
- C is not sharper "per pixel" than the masters; it is **composed for a wide frame**. The strips' softness the audit called inherent (wetland, badlands, underground) remains in the picture's atmosphere, but C presents it as scene, not as a smear.

## 3. Crop suitability by layout

- **Single (318 × 90):** vertical position matters; horizontal is full width. Registry values: forest 30 (lit valley, not the dark foreground), badlands 35, grassland 40, frozen 35, aquatic / rolling / tropical 45, drylands 50, mountain / underground 55, settlement / wetland 50.
- **Two-up (158.5 × 90):** a 16:9 source fits whole (1.76 vs 1.78), so y is irrelevant; all x/y = 50/50. This layout is where Journey looks best: it is just a small copy of the scene.
- **Three-up (105.3 × 90):** shows 66 % of the width, so **x matters and y does not**. The wide-hero subject can be lost: aquatic's sea stack needs x 85 (centre cuts it), badlands needs x 25 (spires), tropical x 75 (waterfall), rolling x 70, mountain 65, forest 62, frozen 55, drylands 55, settlement 40 (sun, ship and town), grassland 35 (acacia). Aquatic, badlands and tropical visibly lose their subject at 50.
- Subjects survive in every biome at 105 px; underground and settlement are the least iconic at that size (a cool glow and a warm skyline, respectively, not a recognisable object).
- **No global crop:** the per-biome values above differ between 25 and 85 on x and 30 and 55 on y.

## 4. Visual compatibility with the archetypes and unique paintings

Mixed covers (lab K5, K8, screenshots 05, 08): an archetype, a Journey-derived biome tile and a unique painting sit together as one family — same painterly rendering, deep value range, one strong light source. Nothing was brightened or saturated. What differed before was **tile geometry, not palette**: strips were pre-cropped and visibly flatter next to the 16:9 archetypes. With C, the biome tiles read like the archetype images (a scene, not a swatch). Serene landscapes (grassland, mountain) stay serene; dark ones (badlands, wetland) stay dark. The one tonal outlier is universal's violet B16 tile, which still fits between Arcane Sanctums and the unique paintings.

## 5. Strategies

| | A — master derivatives | B — Journey only | **C — hybrid** |
| --- | --- | --- | --- |
| Quality | weak: tight slices, 640 px ceiling at 1.0× | best in 12 biomes | = B plus a fallback for universal |
| Coverage | 13 / 13 | 12 / 13 — **universal impossible** | 13 / 13 |
| Representativeness | same as C, worse framing | good, one issue (settlement) | same |
| Verdict | not recommended | not alone | **recommended** |

C is the winner, and its shape is lopsided: **12 biomes use Journey, 1 (universal) uses the master**. No biome is better served by its own master. The expectation that some would need a derivative (underground, wetland) did not hold.

## 6. Per-biome recommendation matrix

Status: **good** = ship as is; **accepted** = fine, with a stated caveat; **replacement** = usable now, art should be replaced. Full per-biome crops and reasoning in the registry and in lab K7.

| Biome | Environments | Hero / collage source | Hero · 3-up crop (x/y) | Quality | Represents | Status |
| --- | --- | --- | --- | --- | --- | --- |
| aquatic | 22 | Journey | 50/45 · 85 | good | good | good |
| badlands | 14 | Journey | 50/35 · 25 | good (dark) | good | good |
| drylands | 12 | Journey | 50/50 · 55 | good | good | good |
| forest | 33 | Journey | 50/30 · 62 | good | good | good |
| frozen | 7 | Journey | 50/35 · 55 | good | good | good |
| grassland | 3 | Journey | 50/40 · 35 | good | good | good |
| mountain | 10 | Journey | 50/55 · 65 | good | good | good |
| rolling | 4 | Journey | 50/45 · 70 | good | good | good |
| **settlement** | **98** | Journey | 50/50 · 40 | good | **acceptable** | **accepted; replacement recommended** |
| tropical | 9 | Journey | 50/45 · 75 | good | good | good |
| underground | 37 | Journey | 50/55 · 50 | good | good | good |
| **universal** | **53** | **master 16:9 (B)** | 50/75 · 50 | acceptable (640 px, portrait master) | acceptable | **existing only; replacement recommended** |
| wetland | 14 | Journey | 50/50 · 50 | acceptable (misty by nature) | good | accepted |

Tradeoffs the numbers hide:

- **Settlement is a sunset harbour with tall ships.** It is beautiful and reads at 105 px, but it is a specific coastal town; the 98 settlement environments are taverns, markets, inland cities, sewers. Journey's own code scopes it to sanctuaries. Reusing the file for list covers is a product decision, and a generic inland-town scene would be a better long-term fit.
- **Universal** is the second-largest fallback and has no landscape source. The 16:9 window of the portrait master is native (no upscale) and shows the portal and floating islands, but never the spire, and tops out at 640 px (DPR 2 hero exactly 1.0×).
- **Wetland** is soft by nature (see the audit). C is the best that exists.

## 7. Performance and delivery

| Option | Per image | 12 biomes |
| --- | --- | --- |
| Reuse Journey header as is (960 × 540 WebP) | 101–155 KB, mean 129 KB | 1548 KB |
| Dedicated 640 × 360 AVIF (q52) / WebP (q82), cut from the shipped header | 31–54 KB / 44–67 KB (mean 39 / 55) | 472 / 656 KB |
| Dedicated 320 × 180 AVIF / WebP for DPR 1 | 10–17 KB / 15–20 KB | 146 / 200 KB |
| Strip A drawn into the cover (today's alternative) | 34–45 KB, 3.2× upscaled | — |
| Master B16 640 × 360 WebP (lab only) | 54–85 KB | 939 KB for 13 |

- **Quality does not require new files.** The 960 px header is already 1.5× oversampled for a DPR 2 hero and exactly 1.0× at DPR 3, so no upscaling occurs and a new derivative cannot add detail.
- **Bytes do.** A list page can show up to 12 distinct biomes; reusing headers costs ~1.5 MB worst case against ~0.5 MB for 640 AVIF, and covers are lazy. Browser cache reuse with Journey is a real but minor benefit (only users who opened a Region Inspector have the headers).
- AVIF vs WebP: AVIF is ~30 % smaller at equal visible quality here and the site already ships AVIF with a WebP fallback (`listCoverHtml()`); keep that pattern.
- 3-up panels need only the 320-wide tier at DPR 1/2 (105 CSS px = 211 device px); a 640 file is enough for everything up to DPR 3.

**Dedicated derivatives: not required for quality, recommended for bytes and decoupling.** If made: 12 biomes × {320, 640} × {AVIF, WebP} = 48 files, ~0.8 MB in total, cut from the **1672 × 941 PNG masters** in `img/biome-artwork-source/` (not from the 960 WebP, to avoid a second lossy generation), named `img/biomes/<b>-cover-{320,640}.{avif,webp}` to sit beside the strips and thumbnails, produced by a script in the style of `scripts/generate-biome-thumbs.js`. The same 16:9 aspect serves all three layouts, so there is no per-layout file.

## 8. Build and path safety

- `img/biomes src/`, `img/biome-artwork-source/` and `img/cover-archetypes-source/` stay in `EXCLUDE_PATHS` — the registry's `master` fields all point into excluded folders, and `tests/biome-cover-registry.test.js` asserts it.
- Every `shipped` path in the registry is outside the exclusions and exists; Journey assets are referenced, not copied or overwritten; no image is duplicated.
- Lab derivatives live under `.claude/mockups/…/assets/biome-cover/`, which `scripts/build.js` never copies. `make-biome-cover-assets.js` regenerates them deterministically (Lanczos3, WebP q90) and rewrites `biome-cover-metrics.json`.
- No original artwork was changed.

## 9. Findings against the brief's questions

- **Which strategy performed best:** C (hybrid), which in practice means Journey for 12 biomes plus the master for universal.
- **How many biomes can reuse Journey:** 12 of 13 (263 of 316 environments).
- **Better served by the existing masters:** one, universal, and only because nothing else exists.
- **Lacking a suitable asset:** universal (weak), settlement (representative only of a harbour town).
- **Is the My Lists blur solved:** yes — the cause was geometry, not codec (audit §3). With a 16:9 source no tile is upscaled at DPR ≤ 3; the strip never needs to be used for covers.
- **Remaining artwork to generate (optional, not blocking):** a generic inland settlement scene (16:9, ≥ 1672 px); a universal / abstract-encounter scene (16:9, ≥ 1672 px; the current universal portrait master is only 1024 × 1536); optionally a stronger wetland, as in the audit.

## 10. Screenshot pack

`docs/research/biome-cover-source-review/`, DPR 1 unless noted:

| File | Shows |
| --- | --- |
| `01-inventory` | measured dimensions and sizes of every source |
| `02-single-forest` (1280, 1440, 1440@2×, 1920) | single cover, all four sources, with density labels and full images |
| `03-pair-forest-mountain` | two-image collage: strip / A / B / C |
| `04-trio-aquatic-frozen-badlands` (1280, 1440, 1440@2×, 1920) | three-image collage, the narrow-panel test |
| `05-mixed-sources` | archetype + biome + unique painting, strip / A / C |
| `06-gallery-<biome>` ×13 | every candidate × single / 2-up / 3-up |
| `07-matrix` | selection matrix |
| `08-mixed-collections` | real lists of 1, 2, 3, 5, 10 environments, plus all-settlement and all-universal |
| `09-hybrid-all-biomes` | best proposed hybrid, single / two-up / three-up |

Before/after is every strip column against its hybrid column (02, 03, 04, 05, 08).

## 11. Verification

| Check | Result |
| --- | --- |
| 293 images in section K load at 1280 / 1440 / 1920 px, DPR 1 and 2; zero broken images, zero placeholder holes in the normal views | pass |
| Registry dimensions equal `naturalWidth × naturalHeight` of every loaded file (inventory flags mismatches) | pass |
| No horizontal page overflow; no stretching (`object-fit: cover` on every tile) | pass |
| Crop sliders, Center vs Recommended, JSON output of edited crops | pass (lab interaction) |
| `node --test tests/*.test.js` | see commit notes |
| Production diff on `js/`, `css/`, `data/`, `index.html` | empty |

Not checked: Safari / Firefox resampling, fractional DPR or browser zoom ≠ 100 %, touch widths, and the crop overlay inspector (section D) for these sources, which is archetype-specific.

## 12. Executive summary and readiness

Reuse Journey's headers for covers: they win every comparison in all 12 biomes where they exist, at no new artwork cost, and 83 % of environments sit in those biomes. The remaining gaps are art, not engineering: universal (53 environments) has only a portrait master, and settlement (98) is a very good picture of one specific place.

**Ready to begin adaptive list covers.** Suggested order for production: (1) cut `-cover-{320,640}` AVIF/WebP from the 1672 px masters (optional but cheap); (2) ship the registry's crops as the per-biome table; (3) keep universal on the master window and settlement on the harbour until new art exists, with the owner's explicit OK to reuse the Journey Settlement illustration; (4) leave the selection algorithm (archetype strength, uniqueness, distinct images) for its own decision — the lab's picker is illustrative only.
