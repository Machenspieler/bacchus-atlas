# Session Prep — context-adaptive environment artwork (PD-091)

Production rollout of a conservative, 48×48-first thematic thumbnail for Session Prep environments. Evidence lives in
[session-prep-context-adaptive-artwork-integration/](session-prep-context-adaptive-artwork-integration/) (dev-only, excluded from `dist/`).
Regenerate: `node scripts/generate-prep-art.js` (the shipped cuts), then
`node scripts/generate-prep-art.js docs/research/session-prep-context-adaptive-artwork-integration/candidates --all && node scripts/shoot-prep-art.js all`.

## 1. Original behaviour

Every Prep environment thumbnail was its biome's square tile (`img/biomes/<biome>-thumb-{48,96,144}.webp`, `biomeThumbAttrs()`), in two places that
share it: the picker row (`prepEnvThumbHtml`, 48×48 CSS px, `.prep-thumb`) and the selected-environment card (`centralEnvCardHtml`, 40–44 px
`.prep-sel-thumb`, fed from the same 48/96/144 files). Even the three painted environments showed their biome. The biome thumbnails are already
resampled once from the masters at their drawn size, so no blurry-biome defect was found (every drawn thumbnail is ≥ 1.0 file pixel per device pixel; see §14).

## 2. Artwork Lab V3 findings used

Lab V3's Strategy C (context adaptive, conservative) was the right shape; its 93-environment figure was a lab state and **not a target**. Nothing
was promoted from the lab: every one of the 28 pictures was re-judged at the real 48 px / 96 px size (matrix below), and eligibility is still the
reviewed `ARCHETYPE_FIT` table. (The final count happens to be 93 = 90 thematic + 3 paintings; the two numbers are unrelated.)

## 3–6. Strategy, resolver, priority, suitability

`js/prep-art.js` → `PrepArt.resolvePrepArt(env)` (pure, id-only, no language, no randomness — the same environment always gets the same file).

1. **Own painting** (`UNIQUE_ENV_IDS`: Cauldera Valley, Field of Dreams, Ouroborean Pass) — now shown in Prep too, as a square cut of the painting.
2. **Semantic gate** — the environment must be mapped to the picture in `ARCHETYPE_FIT`; never loosened here.
3. **Prep gate** — `PICTURES[id].use`: `all` (any mapped fit), `strong` (only a strong fit), `rejected` / `deferred` (biome keeps the row); no entry = never used. `ENV_KEEP_BIOME` is the per-environment escape hatch (empty).
4. Otherwise `biome` — the caller's unchanged biome thumbnail.

Not read in Prep: `ENV_IMAGE_OVERRIDES` (harbour) and `SEMANTIC_OVERRIDES` (curated crops) — approved for Catalog / My Lists only. The four
curated semantic crops are future Prep candidates, not enabled (see §21).
Both Prep views call one function (`prepEnvThumbAttrs(env)`), so a row and its selected card always agree. A thematic file that fails to load is replaced in
place by the biome thumbnail and remembered for the page load (capture-phase `error` listener; the central column's own handler skips that one failure).

## 7–9. The 28 archetypes at 48 px

Full matrix with the real 48 px (1x/2x/3x srcset) and 96 px files: [matrix-dpr1.jpg](session-prep-context-adaptive-artwork-integration/matrix-dpr1.jpg),
[matrix-dpr2.jpg](session-prep-context-adaptive-artwork-integration/matrix-dpr2.jpg), [matrix.html](session-prep-context-adaptive-artwork-integration/matrix.html).
Window = full-height square at `x`% (haunted: 75 % window at x62/y20).

| Archetype | Status | Crop | Mapped envs (strong) | Why |
|---|---|---|---|---|
| arcane-sanctums | approved | x62 | 7 (2) | Spire and glowing ring read at once |
| archives-and-libraries | approved | x25 | 3 (1) | Shelves, ladder, desk; window sacrificed |
| arenas-and-duels | approved | x50 | 2 (1) | Tiers of arches over sand: an arena |
| blighted-mires | strong only | x80 | 9 (4) | Ruined arch on water, but a generic swamp |
| chase-and-ambush | **rejected** | — | 3 (0) | Muddy track, no subject |
| crypts-and-tombs | approved | x15 | 6 (2) | The sarcophagus with candles |
| cursed-and-blighted-lands | **rejected** | — | 2 (1) | Uniform dark texture |
| drowned-depths | approved | x30 | 3 (2) | Light shafts over sunken arches |
| dungeon-delves | strong only | x15 | 2 (2) | Barred gate and lantern; dark |
| feasts-and-revelry | strong only | x15 | 8 (4) | Candles on a laden table; busy |
| fey-and-enchanted | approved | x80 | 2 (1) | Waterfall, bridge, blossom |
| forgotten-ruins | approved | x70 | 10 (3) | Overgrown arch |
| haunted-and-deathly | strong only | x62 y20 zoom .75 | 10 (3) | Zoomed on the manor; still dark, so only graveyards and the possessed abode |
| infernal-and-profane | approved | x62 | 5 (3) | Red citadel; strong colour but balanced by the neighbours |
| intrigue-and-underworld | **rejected** | — | 2 (0) | Dark street, tiny figure |
| monster-lairs | **rejected** | — | 1 (0) | Generic cave |
| perilous-passages | approved | x20 | 4 (1) | Cliff path with a chain rail |
| planar-rifts | approved | x65 | 6 (2) | Purple tear and floating ruins: the most legible tile |
| sacred-sanctuaries | approved | x15 | 2 (1) | Haloed statue and candles |
| seafaring | approved | x25 | 2 (1) | Sails and rail: a ship, not open sea |
| sinister-woods | approved | x20 | 5 (3) | Twisted trunks and mist |
| sky-realms | approved | x60 | 3 (1) | Floating island over cloud |
| starfaring | approved | x80 | 1 (0) | Spaceport, ship, planet |
| storms-and-calamity | approved | x70 | 6 (2) | Tornado and lightning |
| streets-and-towns | approved | x62 | 5 (2) | Clock tower and market street |
| strongholds-and-sieges | strong only | x62 | 2 (1) | Castle under assault |
| taverns-and-inns | approved | x25 | 4 (2) | Barrels, shelves, laid table (not a generic furniture crop) |
| time-and-dream | **deferred** | (x45) | 2 (0) | A square holds one season and a hint of the next; the premise is not clear. Biome kept until someone decides |

## 10–11. Approved / rejected / deferred environments

* **Approved (90):** 44 strong fits + 46 acceptable fits, spread as: forgotten-ruins 10, arcane-sanctums 7, crypts-and-tombs 6, storms 6, planar-rifts 6,
  sinister-woods 5, infernal 5, streets 5, perilous 4, blighted-mires 4, feasts 4, taverns 4, drowned 3, archives 3, haunted 3, sky 3, arenas 2, fey 2,
  seafaring 2, dungeon 2, sacred 2, strongholds 1, starfaring 1.
* **Rejected for Prep (8, picture fails the tile):** `gang-hideout`, `thieves-guild`, `dragons-lair`, `rewritten-grove`, `cursed-valley`, `ambushed`, `ambushers`, `road-blockade`.
* **Deferred (2):** `time-loop`, `time-loop-atlas`.
* **Mapped but a weak picture needs a strong fit (17):** `vampires-castle`, `castle-of-wails`, `abandoned-building`, `haunted-city`, `neverhome-corridors`, `shatter-the-heart`, `haunted-oratorium`
  (haunted); `upscale-casino`, `fairwell-casino`, `the-commanders-dinner`, `divine-feast` (feasts); `blood-marsh`, `beelzebufo-bog`, `swamp-ruins`, `heart-of-the-mire`, `buzzing-swamp` (mires); `defense-of-the-river-fort` (strongholds).
* The negative examples of the brief stay biome by the existing semantic gate: sky *cities* (`magic-city`-type environments are not mapped to sky-realms), a private duel (not mapped to arenas), urban chases and forest ambushes (chase picture rejected), time distortion (deferred), a natural grove (statue sanctuary is mapped only to `hallowed-*`).

## 12–14. Square derivative pipeline

`scripts/generate-prep-art.js` cuts each in-use picture once from the **original master** (`img/cover-archetypes-source/*.png`, 1672×941; paintings `img/env/*.jpg`, 1536×1024) —
never from a Catalog strip or My Lists tile. A square window (full height; `zoom`/`y` only for haunted) is resampled with Lanczos3 to **48 / 96 / 144 px WebP (q86, no sharpening)**
into `img/prep-art/<stem>-thumb-{48,96,144}.webp` — the biome tile ladder, so `src` = 1x and `srcset` = `96 2x, 144 3x` with the existing `.prep-thumb` / `.prep-sel-thumb` CSS
(`object-fit: cover` on a square, so nothing is stretched). All windows hold ≥ 706 px, so no cut is upscaled. 26 pictures × 3 = 78 files; totals 104 KB (48), 148 KB (96), 252 KB (144).
Masters stay out of `dist/` (`isExcluded`). Archetypes shared by several environments share one file; there are no per-environment crops.
DPR check (browser, DPR 2): every drawn thumbnail has ≥ 1.00 file pixel per device pixel (picker 48 px tile: 96 px file = 1.00; selected card 40 px tile: 96 px file = 1.20).

## 15–16. Screenshots and dense lists

Fixture (real ids, nothing saved to the user's profile — a fresh browser context each time): Hero's Tomb, Circles Below: Dis, Floating Mountains selected (cap = 3).

* Full page before / after, 1440×900 DPR 2 (also 1280×800, 1920×1080): `prep-baseline-*.jpg` / `prep-new-*.jpg`.
* Same list before / after: `list-dense-{top,mid,tombs}-{baseline,new}.png` (17 rows each), DPR 1: `list-dpr1-*`, RU: `list-ru-*`, `prep-ru-*`.
* Selected environments (centre column) are in every `prep-new-*.jpg`; unique paintings are in the Cauldera Valley row of the `tombs` strips.
* Missing derivative: `prep-missing-derivative-fallback.jpg` (all `img/prep-art/**` aborted → every thumbnail is the biome tile; 0 broken images, 0 icons).
* Not captured: a separate DPR 3 screenshot (the 144 px files exist and are tested; the measured ratio is the DPR 2 one).

Dense-list reading: thematic tiles are distinguishable at a glance from biome tiles (they have one clear subject; the biome tiles are texture), and mix well with the bright
aquatic/frozen/tropical tiles. Dark neighbours (`mires`, `haunted`, `dungeon`, `underground` biome) are the weakest contrast; that is why those three pictures are strong-only.

## 17. Repetition

The 90 thematic tiles come from 23 pictures, so repeats are inevitable and legitimate (all 10 forgotten-ruins environments wear the arch, `Endless Catacombs` and `Hallow Rest` the same sarcophagus). They sit
among 236 biome tiles that already repeat far more (12 biome files cover them), so the thematic ones *reduce* sameness. No diversification was added: no random alternates, no second
pictures. Affected archetypes worth watching if the list ever feels monotonous: forgotten-ruins (10), arcane-sanctums (7), crypts / storms / planar-rifts (6 each); because the tier-then-name sort rarely puts
them next to each other, no environment pair showed a serious scanning problem in the 17-row strips.

## 18. Coverage (329 environments)

| | count |
|---|---|
| Own painting in Prep | 3 |
| Approved thematic (44 strong fit, 46 acceptable fit) | 90 |
| Biome thumbnail | 236 |
| — no `ARCHETYPE_FIT` mapping | 209 |
| — mapped, weak picture needs a strong fit | 17 |
| — mapped, picture rejected for Prep | 8 |
| — mapped, picture deferred | 2 |
| Neutral icon fallback | 0 |

Context comparison: My Lists eligibility = 117 mapped environments (+3 paintings, +the harbour pair, +the lists crops); Catalog = 90 thematic + 3 paintings + 5 crops + 2 harbour = 100
(229 biome); Prep = 90 thematic + 3 paintings = 93 (236 biome). The two thematic sets are equally large by coincidence and differ by five environments each way. Prep-only:
`haunted-mountain-pass`, `cliffside-ascent`, `perilous-cliff` (the cliff path reads in a square, only as a `strong` fit in a strip) and `bustling-marketplace`, `resting-dagger-inn` (they wear curated crops in the Catalog,
which Prep does not read, so the plain street picture applies). Catalog-only: `upscale-casino`, `fairwell-casino`, `the-commanders-dinner`, `divine-feast` (the feast picture reads in a strip but is too busy for
48 px, so strong fits only) and `rewritten-grove` (the cursed-lands picture is `strong` in a strip, rejected as a tile). The Catalog's five crops and two harbour strips are never read by Prep.

## 19. Performance (1440×900, DPR 2, whole 329-row list scrolled through, cold cache)

| | image requests | image bytes |
|---|---|---|
| Baseline (biome only) | 13 | 58.8 KB |
| New | 39 | 157.9 KB |

+26 requests and +99 KB, only for what the viewer scrolls to (`loading="lazy"` unchanged; identical files are requested once, a repeated picture is a cache hit). At DPR 1 the same
walk would cost at most the 104 KB of 48 px files in total. Nothing is preloaded; the layout is untouched: **0 row-geometry or thumbnail-size differences** across 329 rows, 0 horizontal overflow
difference, 0 console errors. Warm-cache request counts were not measured reliably (the local static server's headers differ from GitHub Pages) and are not claimed.
Dist: +78 files, 504 KB on disk (≈ 0.5 MB of which a visitor fetches only the lazy few).

## 20. Tests

`tests/prep-art.test.js` (11 tests): painting priority, harbour/curated overrides not read, semantic gate, strong/rejected/deferred gate (+ pinned negative examples), determinism, 28-archetype coverage and no dead
or unapproved assets, exact 48/96/144 squares and no upscaling, one function for both views, biome fallback wiring, Catalog output pinned (229/2/90/3/5), reproducible encode, load order.
Existing tests were not weakened. `lab/artwork-v3/prod-bridge.js` froze the pre-PD-091 biome-only Prep tile as Strategy A (the same treatment PD-089 gave the Catalog seam), because it extracted
`prepEnvThumbHtml` from `app.js` as "production". Full suite 1680/1680, `validate-data` 0 errors, build + version + unlisted + journey checks pass.

## 21. Limitations and recommendation

* Haunted-and-deathly, blighted-mires, dungeon-delves and feasts remain strong-fit-only because they are dark or busy at 48 px.
* Time & Dream (deferred) would need a different crop of the master or a designed 1:1 variant — one decision, not a framework.
* Future Prep candidates from PD-090 (not enabled, need separate approval): `bar-counter` (`the-dungeoneer`), `market-stalls` (`bustling-marketplace`, `city-festival`), `tavern-terrace` (`resting-dagger-inn`) are square-friendly.
* 209 environments have no mapping; they are biome tiles by design. More artwork is not needed for Prep to work; new pictures should be judged per environment as before.
