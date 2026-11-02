# Catalog & Session Prep Artwork Lab V3

Research and design-validation experiment, 2026-11-02. **No production behaviour changed**: Catalog, Session
Prep, My Lists, Journey, the registry (`js/list-cover-art.js`) and every saved list are untouched. The lab is
`lab/artwork-v3/`, excluded from `dist/`. This document records what it shows; it does not make the product
decision (§17 lists what that decision still needs).

## 1. Research objective

Should Catalog and Session Prep keep biome artwork, switch to the 28 thematic archetype pictures where
they exist, or use a context-aware hybrid? The answer may differ per context, so the lab compares three
strategies on the real production card and picker row, at the real frame sizes, with real data:

| | Strategy | Rule |
|---|---|---|
| A | Current Biome | What production draws today, via the production `artBiome()` |
| B | Archetype First | painting → explicit override → `ARCHETYPE_FIT` picture (strong or acceptable) → A. No visual judgement |
| C | Context Adaptive | B's candidate, kept only if the lab's per-frame review says the picture survives that frame; else A |

## 2. Current production baseline (verified from `css/styles.css` and `js/app.js`)

- **Catalog**: `.card-art` is 95 px wide and stretches to the card (≈ 219–249 px depending on text; 88 px on phones),
  shows the 1:3 biome strips `img/biomes/<biome>-{100,200,250,300}.avif` (+ 200 WebP) with `sizes="95px"`.
- **Prep picker row**: `.prep-thumb` is 48 × 48, `object-fit: cover`, pre-cut squares
  `img/biomes/<biome>-thumb-{48,96,144}.webp`. (The 40–44 px tile of the *central* column reads the same files; the lab
  covers the picker row, selected and unselected.)
- **Every one of the 329 environments gets a biome picture in both contexts**, including `universal` and `settlement`
  (`artBiome()` drops generic biomes only when a specific one exists). My Lists differs: there `universal` and generic
  `settlement` get nothing, so the My Lists "89 neutral" figure does not apply here.
- **Production Catalog and Prep never draw a unique painting.** The three paintings (`ENV_ART`) appear only in the detail backdrop and
  My Lists covers. So Strategy A is biome-only; unique paintings first appear in B and C.
- **Baseline sharpness** (browser-measured, §12): the production strips and thumbs are sharp at DPR 1 and 2
  (minimum 1.05× and 1.00× the pixels needed). No baseline blur defect found at those ratios.

## 3. Artwork inventory

329 environments; 28 archetype pictures (`archetype:*`, 16:9, cuts 320/640/960 AVIF + 640 WebP); 3 unique paintings
(3:2, 200/400/800); 1 picture reached through the explicit overrides (`biome:settlement`, for `port-city` and
`raiding-party`). All registered files exist (checked per environment × strategy × context in the test suite and
`scripts/artwork-lab-v3-stats.js`: 0 missing).

## 4. Strategies and 5. data sources

Eligibility comes only from `ListCoverUtils.resolveEnvironmentArt()` over the existing registry — `ARCHETYPE_FIT`
(117 environments: 45 strong, 72 acceptable), `UNIQUE_ENV_IDS` (3), `ENV_IMAGE_OVERRIDES` (2) = **122 authorised**. The
classification (`docs/research/lists-cover-classification.json`) is shown for diagnosis only: **157 environments have a taxonomy
archetype that the registry deliberately does not authorise** (judged "poor" or never mapped); neither B nor C can pick those.
Strategy A calls the real `artBiome()` and the real `biomeArtHtml()` / `prepEnvThumbHtml()` extracted from `app.js`.

**C's rule, stated plainly**: `lab/artwork-v3/context-review.js` holds a rating (`good` / `marginal` / `poor`) and a start crop for each
registered picture in each frame. `good` → used for any authorised fit; `marginal` → used only for a *strong* fit (paintings and overrides
count as strong); `poor` → biome kept; **no review → biome kept and flagged "unreviewed"** (today: 0 unreviewed). It is one
reviewer's provisional judgement (me, from renders at DPR 1 and 2), per picture and frame, not per environment, and not a classifier.

## 6. Comparison methodology

Real production templates: `prod-bridge.js` reads `js/app.js` as text, extracts `cardHtml`, `envPickerRowHtml`, `artBiome` and helpers
by name, and runs them in a private scope (app.js itself is never booted, so no storage or hash is touched). Only `biomeArtHtml` and
`prepEnvThumbHtml` are replaced; all other markup is byte-for-byte production, so "only the artwork differs" holds by construction (and
`tests/artwork-lab-v3.test.js` fails if those functions drift). Each comparison shows A/B/C side by side, a browser-measured quality line
under each picture, a diagnostic zoom (explicitly labelled), a source×crop editor and a judgement panel.

## 7. Crop settings

Independent per context and per picture (`labv3:crops`): X, Y, zoom (1–3), presets (production, registry/B start, recommended/C start,
center, ◀▶▲▼), copy CSS, copy JSON. Edits apply to the selected candidate in B *and* C so source choice and crop are judged separately; the
production biome keeps its baked crop (not adjustable). Geometry: in the 95 × 249 strip a 16:9 master shows ~21 % of its width (x is the
only axis until you zoom); in the 48 × 48 tile it shows 56 %. The registry's existing crops (tuned for My Lists tiles) are wrong for the
strip in places — the **tornado** picture's registry x = 55 shows no tornado (needs ≈ 95), **seafaring** needs x ≈ 15 to show the ship rather than
open sea, **archives** x ≈ 15 for the shelves.

## 8. Visual review findings (provisional)

Frame ratings of the 28 pictures (`context-review.js`):

| | good | marginal | poor |
|---|---|---|---|
| Catalog strip | 18 | 9 | 1 |
| Prep tile | 17 | 11 | 0 |

Answers to the brief's questions (screenshots in §14):

- **Strip, survives**: Starfaring (ships + planet at x ≈ 85), Sky Realms (island + cloud sea), Seafaring (only at x ≈ 15: sail, rigging, lantern),
  Arenas (portcullis, banners, sand), Planar Rifts (striking), Archives (shelves + ladder at x ≈ 15), Taverns, Sinister Woods, Drowned Depths.
- **Strip, fails**: **Time & Dream** — a strip can hold only one of the three seasons, so it reads as an autumn village and the premise is lost (rated *poor*).
- **Tile, survives**: Sky Realms reads as floating islands, Arenas as an arena, Starfaring as sci-fi, Drowned Depths as underwater (the most distinctive tile),
  Crypts (sarcophagus + candles), Taverns (table, mugs, candle).
- **Tile, weak**: Monster Lairs → generic cave (bones lost); Planar Rifts → a purple abstract shape, though not noise; Haunted & Deathly → very dark; Time & Dream → "village by a pond"
  (two of three seasons fit at x ≈ 23). Dark pictures (haunted, dungeon, intrigue, chase) are legible on a bright screen only.
- **Biome clearly wins**: *Time Loop* in Catalog — `universal`'s purple portal strip is closer to the lore than the autumn village.
  Haunted City / Vampire's Castle in Prep (a near-black tile beside brighter rows).
- **Archetype clearly wins**: Sunken Citadel / Deep One City (aquatic biome tile vs a recognisable drowned city), Ancient Tomb (blue crystal underground biome vs a candle-lit tomb),
  Civic Library, Magic City, Ruined Castle, Court of Cats.
- **Ambiguous**: Dragon's Lair (cave and bones vs a lava biome that is closer to "active volcano" in the lore).

## 9. Known unsuitable artwork × context combinations

Catalog `poor`: `archetype:time-and-dream` (affects `time-loop`, `time-loop-atlas`). Marginal in both frames (used by C only for a strong fit): haunted-and-deathly (10 envs, 7 downgraded),
blighted-mires (9 / 5), perilous-passages (4 / 3), chase-and-ambush (3 / 3, no strong fit), intrigue-and-underworld (2 / 2), time-and-dream, monster-lairs, cursed-and-blighted-lands, strongholds-and-sieges (1 each), dungeon-delves (kept: both fits strong).
Prep only: planar-rifts (6 envs, 4 downgraded). Needs a different crop to work at all: storms-and-calamity, seafaring.

## 10. Separate conclusions (evidence, not a decision)

**Catalog.** B/C replace a page of near-identical strips with specific ones (distinct pictures over the whole list 13 → 45 / 41; first 18 cards 6 → 9 / 8) and
18 of 28 pictures read clearly in the strip. The cost is bytes (§13) and a handful of dark or generic pictures. Unique paintings look fine.
**Prep.** At 48 px the picture still communicates for 17 of 28 pictures, and the thematic tile is more informative than a biome tile that 101 environments share (settlement) —
but 11 pictures degrade to generic or dark, adjacent repeats remain (an archetype shared by several adjacent rows, up to 4 in a row), and delivery rises from 17 KB to ~430 KB at 1×
because the 320 px cut is the smallest available for an 85 px-wide render. A pre-cut 48/96/144 square set (as for biomes) would remove that cost — not built here.

## 11. Coverage statistics (recalculated; `docs/research/artwork-lab-v3/stats.json`)

| Source drawn | Catalog A / B / C | Prep A / B / C |
|---|---|---|
| unique painting | 0 / 3 / 3 | 0 / 3 / 3 |
| explicit override | 0 / 2 / 2 | 0 / 2 / 2 |
| thematic archetype | 0 / 117 / 92 | 0 / 117 / 88 |
| biome (production) | 329 / 207 / 232 | 329 / 207 / 236 |
| no picture | 0 / 0 / 0 | 0 / 0 / 0 |
| eligible but C keeps biome | – / – / 25 | – / – / 29 |
| reviewed / unreviewed (those downgrades) | – / – / 25 / 0 | – / – / 29 / 0 |
| missing or invalid files | 0 | 0 |

Authorised thematic: 122 (45 strong, 72 acceptable, 5 painting/override). Not authorised: 207, of which 157 have a taxonomy archetype that was deliberately rejected.
Repetition in the real (tier, then name) order — adjacent repeats / longest run / distinct pictures: A 56 (17.1 %) / 4 / 13; B 27 (8.2 %) / 4 / 45; C 32–33 (≈ 10 %) / 4 / 41.
The settlement strip serves 101 environments (31 %) and `universal` 57 under A (51 and 38 under B).

## 12. Image-quality findings

Measured in Chrome at 1280 × 800, 1440 × 900 (DPR 1 and 2) and 1920 × 1080 over all 329 × 3 strategies × 2 contexts (`browser-audit.json`, "sharpness" = source pixels ÷ device pixels drawn):
**0 broken images, 0 upscaled pictures at DPR 1 and 2** for every strategy; minimum sharpness 1.05 (Catalog) and 1.00 (Prep). Derivative choice is explicit (`lab-core.pickDerivative`): strips use 640 AVIF at 1×, 960 at 2×, tiles use 320 at every DPR ≤ 3.7.
At **DPR 3** B/C would upscale (960 px cut vs 1328 px needed, ×1.38; 32 pictures) while A does not (300 px strip) — a real ceiling of the archetype cuts for a hypothetical high-DPI desktop.
One comparison asymmetry to know: A's tile is pre-resampled to 48/96/144, while B/C are browser-downscaled from 320 (3.75×). By eye the B/C tiles show no visible aliasing, but this is not objectively measured, and the lab deliberately has no CSS blur, sharpening, saturation or contrast changes.

## 13. Performance findings (all 329 environments, sizes via HEAD in-browser and `fs.stat`, which agree exactly)

| | Catalog DPR 1 / 2 | Prep DPR 1 / 2 |
|---|---|---|
| A | 13 files · 129 / 447 KB | 13 files · 17 / 57 KB |
| B | 45 files · 1535 / 3316 KB | 45 files · 432 / 473 KB |
| C | 41 files · 1333 / 2903 KB | 41 files · 375 / 415 KB |

Lazy loading means a real session fetches a fraction of this (first 18 cards touch 6 / 9 / 8 distinct pictures under A / B / C). Layout shift while switching a grid between strategies: 0 for all three. This is the worst-case catalogue walk, not a production estimate.

## 14. Screenshots (`docs/research/artwork-lab-v3/`)

`catalog-compare-{1280x800,1440x900,1440x900-dpr2,1920x1080}.png`, `prep-compare-*.png`, `catalog-compare-page-*.png` (whole page), `catalog-grid-mixed-{A,B,C}.png`,
`catalog-grid-triptych-strips.png`, `catalog-triptych-c-keeps-biome.png`, `prep-list-{mixed,real-order,repetition-archetype}.png`, `stress-narrow-strips.png`, `stress-square-thumbs.png`,
`library-28-matrix.png`, `crop-catalog-x15-experiment.png`, `crop-catalog-editor.png`, `wins-archetype-sunken-citadel.png`, `wins-biome-time-loop.png`, `wins-biome-haunted-city-prep.png`, `ambiguous-dragons-lair.png`.
Regenerate with `node scripts/shoot-artwork-lab-v3.js`.

## 15. Tests and isolation

`tests/artwork-lab-v3.test.js` (20 tests): Strategy A equals the production resolver (markup compared to the extracted production functions for all 329); B only picks authorised pictures; C never picks an unauthorised or review-rejected one and flags unreviewed; unique priority;
missing picture falls back; multi-biome convention; identical card/row markup across strategies except the picture; Catalog and Prep crops independent and registry unmutated; export has stable ids; lab storage only under `labv3:*`;
`lab/` absent from a built tree; every displayed path exists; 28-picture library has reviews for both frames; production files never mention the lab; coverage arithmetic; derivative choice; declared aspect ratios match real files.
Full suite 1596 pass / 0 fail; `validate-data`, `build`, `version-assets`, `check-asset-versioning`, `check-unlisted-build`, `check-journey2-build` pass. Browser QA found no page errors, failed requests or broken images; production routes are untouched because no production file changed (`git diff --stat` lists only `scripts/build.js` — one exclusion line and an export — and docs).

## 16. Unresolved design questions

1. Should Prep keep a flat consistent tile (A's calm uniformity) or accept busier, dark thematic tiles for specificity? The lab shows both are defensible; it cannot settle taste.
2. Would a pre-cut square set for archetypes (≈ biome thumbs) be acceptable work, given the Prep byte cost?
3. Is one reviewer's per-picture rating enough, or should an art director confirm the 9 + 1 weak Catalog and 11 weak Prep pictures (and the crops, e.g. tornado x95)?
4. The 101-environment settlement strip and 57-environment `universal` strip dominate A's repetition; does a thematic fix matter more there than anywhere else?
5. Should unique paintings enter Catalog/Prep at all (they never did)? In the strip, Field of Dreams loses its stones and flowers.
6. For environments where biome beats the authorised picture (Time Loop, Dragon's Lair), is the right fix a different registry mapping (a product decision) or C-style gating (a lab idea)?
7. Dark pictures (haunted, dungeon, intrigue, chase): worth a brighter alternate illustration?

## 17. Recommended future product decision (not made here)

A decision is only well-founded after (a) art-direction sign-off on the §9 list and crops, (b) a choice on the Prep byte cost, and (c) the confirmation in question 5. If those hold, the evidence points to **C-style gating per context** (Catalog: thematic for the 18 good + strong-fit marginal; Prep: thematic for the 17 good,
biome elsewhere) with per-picture, per-context crops stored beside `ARCHETYPE_FIT` — as a new `PD-0xx` with its own tests. That would be a registry + `biomeArtHtml`/`prepEnvThumbHtml` change and is **out of scope here**.

## How to run

```bash
python3 -m http.server 8099      # any static server at the repo root
```

Open <http://localhost:8099/lab/artwork-v3/> (hash `#tab=catalog&env=<id>&lang=en` deep-links). Pick an environment in the sidebar (search by name, id, biome, tier, archetype; filter by artwork availability; ↑/↓ moves). **Catalog** and **Session Prep** tabs show A/B/C; adjust crops in the editor (per context, saved in `labv3:crops`); record a judgement and notes; **Review & export** copies or downloads the JSON. **Stress tests** and **Library · 28** show the named cases and the full set; **Summary** has the live coverage table and a "Run audit" button.
`node scripts/artwork-lab-v3-stats.js` refreshes `stats.json`; `node scripts/shoot-artwork-lab-v3.js` refreshes the screenshots and `browser-audit.json`.
