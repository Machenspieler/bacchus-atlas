# Curated Semantic Artwork Overrides

Production integration, 2026-11-03. The research verdict of [Semantic Artwork Reuse Lab V1](semantic-artwork-reuse-lab-v1.md) and [V2](semantic-artwork-reuse-lab-v2.md)
was **LIMITED GO: a small, hand-curated override table, not a framework.** This is that table, after a fresh artistic review of every candidate against the real
environment text and the real Catalog card / My Lists cover. Decision record: [PD-090](../product-decisions.md); architecture: [docs/architecture.md](../architecture.md) "Curated semantic artwork overrides".

## The answer, first

**6 environments are improved (4 gain a thematic picture they had nowhere, 2 get a clearly better one); 3 more candidates are rejected on review and 2 are deferred.** The research's provisional 11 shrank to 6 — quality over the statistic.

| | Catalog | My Lists | Unique environment IDs |
|---|---|---|---|
| Newly themed (no thematic picture before) | 3: `city-festival`, `the-dungeoneer`, `chapel-of-st-brenna` | 3: `city-festival`, `the-dungeoneer`, `garden-of-the-tranquil-order` | **4** (`city-festival`, `the-dungeoneer`, `chapel-of-st-brenna`, `garden-of-the-tranquil-order`) |
| Qualitative replacement (themed before, clearly better now) | 2: `bustling-marketplace`, `resting-dagger-inn` | 2: the same | **2** |
| Approved overrides | 5 | 5 | **6** (6 table rows; 4 distinct crops in My Lists, 4 in the Catalog) |

An environment affected in both contexts is counted once in the last column. Session Prep opportunities are not counted: nothing in Session Prep changed.
"Newly themed" for `the-dungeoneer` means: before, it wore the generic underground biome (a blue crystal cavern with a mine rail) in both contexts; the Catalog strip had no tavern in it at all.

## 1. Method

Every candidate of both pilots (20 approved regions, 41 counted mappings on 27 environments) was re-read against the actual `lore` text in `data/environments.json`, the crop as the real Catalog strip
(95×249, DPR 1 and 2) and the real My Lists cover (318 / 158 / 105 × 90), and the picture the environment wears today (`before`/`after` renders in `curated-semantic-artwork-overrides/screens/`).
A candidate needed **semantic correctness AND visual improvement**; neither alone was enough. Crops were re-cut from the original PNG masters in `img/cover-archetypes-source/` (never from a derivative).

## 2. Final inventory and verdicts

### Approved (6 environments, 4 crops)

| Environment | Crop (region id) | Source / parent artwork | Contexts | Why |
|---|---|---|---|---|
| `bustling-marketplace` | `streets-and-towns-market-stalls` | `streets-and-towns` | Catalog, My Lists | Lore: "economic heart… artisans, traveling merchants, patrons". A vendor, bread, cheese and garlic under an awning *is* that; the old strip was a clock tower and a gate. Qualitative. |
| `city-festival` | same | `streets-and-towns` | Catalog, My Lists | Lore: carts of baked goods, produce and meat around a plaza. The stall shows bread, cheese, apples. Not a festival picture (no banners or crowd) and the card does not pretend it is; it replaces a burning-harbour biome. New. |
| `resting-dagger-inn` | `streets-and-towns-tavern-terrace` | `streets-and-towns` | Catalog, My Lists | Lore: "A bustling inn along a busy street." Diners at a lantern-lit table under an awning with leaded windows; the old strip was a market street with a clock tower. Qualitative. |
| `the-dungeoneer` | `taverns-and-inns-bar-counter` | `taverns-and-inns` | Catalog, My Lists | Lore: a "subterranean tavern" with "a polished stone bar". The crop is unmistakably a bar (casks, bottles, a candle); the crystal cavern it replaces has no tavern. **Accepted abstraction**: the bar is wooden and nothing in the crop shows a ceiling or window, so it does not contradict "low-ceilinged, underground". New. |
| `chapel-of-st-brenna` | `sacred-sanctuaries-statue-altar` | `sacred-sanctuaries` | **Catalog only** | Lore: "remains of heroes of the Sacred Flame". The statue holds a bowl of flame, haloed, ringed by candles, ivy on the stone. The "moldering" and "puzzling doors" are not shown (the sanctuary is cleaner than the lore); judged an honest portrait of the faith and the flame, and a clear gain over a harbour sunset. Tall region: fails the 3.5:1 My Lists band, so no My Lists picture. New. |
| `garden-of-the-tranquil-order` | `sacred-sanctuaries-lotus-pool` | `sacred-sanctuaries` | **My Lists only** | Lore: "A tranquil garden shrine hiding secrets in serenity." A lotus pool in a stone cloister reads as tranquil at once; no guardians, no shrine (secrets are not shown). A 3.5:1 region keeps ~11 % of its width in the 1:3 Catalog strip, so no Catalog picture. New. |

### Rejected

| Environment | Candidate | Reason |
|---|---|---|
| `chthon-verlies` | `dungeon-delves-barred-gate` | Lore is magic-resistant, gravity-defying **crystals**. The current strip *is* a crystal cavern; the crop drops the crystals for generic prison bars. Worse than the current picture. |
| `gang-hideout` | `intrigue-and-underworld-covert-table` | One cloaked patron at a candle-lit table does not distinguish a gang base from any tavern; no goods, no gang, no business front beyond an awning. Re-reviewed and kept as rejected. |
| `pitched-battle` | `strongholds-and-sieges-trebuchet` | A siege engine is a siege, not a massed field battle. |
| `street-chase`, `hallowed-temple`, `hallowed-cathedral`, `deadly-dungeon`, `dangerous-dungeon`, `castle-siege`, `planetary-blockade`, `ocean-voyage`, `local-tavern`, `teal-heart-inn`, `the-wandering-tavern`, `library-of-the-dusk-tree`, `civic-library`, `terror-of-the-deep`, `emberwood-village`, `outpost-town` | various | Already wear an equally appropriate picture: no gain, so no override ("suitable" is not "better"). |
| `the-undermarket`, `jazz-speakeasy`, `trading-post`, `den-of-vice-and-violence`, `thieves-guild`, `blade-root-sanctum`, `humble-altar`, `darkened-temple`, `moonlight-temple`, `divine-audience` and the V1/V2 rejected mappings | | Unchanged from the research: wrong setting, wrong faith iconography, or lighting alone as evidence. |
| `intrigue-and-underworld-arch-alley`, `dungeon-delves-stair-bridge`, `streets-and-towns-market-street`, `taverns-and-inns-fireplace`, `archives-and-libraries-*`, `strongholds-and-sieges-castle-walls`, `starfaring-*`, `seafaring-deck-rigging` | region only | Reach no environment that gains; not activated. |

### Deferred (not activated, evidence insufficient)

| Environment | Candidate | What would change the verdict |
|---|---|---|
| `heist` | `intrigue-and-underworld-plotters-table` (sealed map, dagger, books, candle) | Reads as *planning* / intrigue, not a heist: no target, vault or guard. A human art review that accepts "planning" as a heist portrait would approve it (My Lists only). |
| `murder-mystery` | same | Atmospheric match only: papers and a dagger, no body, clue marker or investigator. A scholar's-desk crop (V1) is no stronger. Do not approve on atmosphere. |
| (V2 "needs review") `explorers-kit`, `arched-vista` regions | | Left open by V2, still no environment that clearly gains. |

## 3. Production derivatives (cut from the original masters)

One Lanczos3 resample per file, no sharpening / denoise / blur / stretch; widths stop at the pixels the window holds (nothing upscaled by the generator). Script: `node scripts/generate-semantic-crops.js`.

| Crop | Catalog window (master px) | Catalog widths | My Lists window | My Lists widths |
|---|---|---|---|---|
| `market-stalls` | 257×772 @ (75, 169) | 100, 200, 250 | 568×772 @ (0, 169) | 320, 568 |
| `tavern-terrace` | 220×659 @ (1422, 282) | 100, 200 | 501×659 @ (1169, 282) | 320, 501 |
| `bar-counter` | 200×600 @ (230, 150) | 100, 200 | 702×471 @ (0, 188) | 320, 640 |
| `statue-altar` | 237×710 @ (430, 60) | 100, 200 | — (fails the band) | — |
| `lotus-pool` | — (fails the strip) | — | 770×221 @ (900, 719) | 320, 640 |

25 files, 851 KB on disk (`img/catalog-art/crop-*` 13 files, `img/list-covers/crop-*` 12). Framing in My Lists is `object-position` per layout, taken from the reviewed lab frames.

### DPR viability

- **Catalog**: a 95 px strip at DPR 2 needs 190 px; every crop has a 200 px cut cut at native resolution (the windows are ≥ 200 px wide). DPR 3 (285 px) is not covered by any crop except `market-stalls` (250): the browser uses the largest cut, a < 1.15× enlargement.
- **My Lists**: DPR 2 of the 318 px band needs 636 px. `bar-counter` and `lotus-pool` have 640. **`market-stalls` (568) and `tavern-terrace` (501) are upscaled 1.12× and 1.27× by the browser in the one-tile band at DPR 2 only**; the 2- and 3-tile layouts and DPR 1 are native. Visible as mild softness in `screens/C-lists-covers-before-after-dpr2.webp`; accepted (the master has no more pixels) and recorded as a limitation.

## 4. Implementation (small, explicit)

- `js/list-cover-art.js`: `crop()` pictures (`kind: 'crop'`, `parent`), `CROP_CATALOG_WINDOWS`, `SEMANTIC_OVERRIDES = { envId: { crop, contexts: ['catalog'|'lists'] } }`.
- `js/list-cover-utils.js`: resolution step 2b (after the painting and `ENV_IMAGE_OVERRIDES`, before `ARCHETYPE_FIT`); a crop scores as a strong archetype picture; `selectCoverImages` groups candidates by **parent artwork**.
- `js/catalog-art.js`: the same step for `'catalog'`, `PICTURES['crop:*']` with their own `widths`; `files(stem, widths)`.
- `js/app.js`: `ART_RUNTIME` (a private copy of the registry) and `bindCropFallback`: a crop whose file fails to load is withdrawn for the page load and the Catalog card / list cover is redrawn with what it wore before.
- `scripts/generate-semantic-crops.js` cuts all 25 files. `ARCHETYPE_FIT`, `ENV_IMAGE_OVERRIDES`, `UNIQUE_ENV_IDS`, `ARCHETYPES`, Session Prep and Journey code are untouched.

### My Lists deduplication

Candidates are grouped by parent artwork (`crop.parent`, else the picture's own id). A crop and its parent's whole picture, or two crops of one parent, are one candidate: it shows the member most environments resolved to (a crop on a tie), the earlier member, then the id. `COVER_MAX = 3`, `BASE_SCORE`, `COVERAGE_WEIGHT`, the tile order and the 90 px geometry are unchanged. Verified in `tests/semantic-overrides.test.js` test 9 over every triple of override environments, and in the browser (`screens/C-*`):

| List | Cover |
|---|---|
| `bustling-marketplace` + `resting-dagger-inn` (two Streets crops) | one tile: `crop:market-stalls` |
| `bustling-marketplace` + `emberwood-village` + `outpost-town` (crop + whole) | one tile: the whole Streets & Towns picture (2 members vs 1; the crop wins a 1:1 tie) |
| `field-of-dreams` + `the-dungeoneer` (painting + crop) | two tiles |
| `bustling-marketplace` + `the-dungeoneer` + `garden-of-the-tranquil-order` (unrelated parents) | three tiles, one crop each |
| `chapel-of-st-brenna` alone (Catalog-only crop) | the neutral cover (no My Lists picture, as before) |
| lists without an override environment | byte-identical to before (test 10) |

Side effect to know: a crop is a strong-class picture like a strong archetype fit, so in a list that mixes crop environments with several other strong fits the crop can take a tile that a whole picture had (`screens/C-*`, "Mixed five"). Composition rules were not touched.

## 5. Browser QA

Playwright / Chrome against the source tree (after) and `git archive HEAD` (before), same environments, order, viewport and component sizes: Catalog cards at 1280×800, 1440×900, 1920×1080 and 1440×900 @2x; EN and RU at 1440×900; My Lists page and 12 cover scenarios at the same sizes. `screens/browser-audit.json`: 0 page errors, 0 console errors, 0 failed or 4xx requests on the after build; no horizontal overflow; card strips measured at 95 × (card height) in both builds.

- `A-catalog-approved-before-after.webp`: the five Catalog overrides, before | after.
- `B-catalog-rejected-unchanged.webp`: `chthon-verlies`, `gang-hideout`, `heist`, identical before and after.
- `C-lists-covers-before-after-dpr2.webp`: 12 cover scenarios at DPR 2, before | after (incl. deduplication).
- `D-catalog-grid-before.webp` / `-after.webp`: a Catalog page (Tier 2, Settlement) with modified (Chapel, City Festival) and unchanged cards.
- `lists-page-*`, `catalog-*-ru-*`, `catalog-*-dpr2-*`: the full My Lists page, the RU cards, the DPR 2 cards.
- Fallback: with the market-stalls files blocked, the Catalog card and the list cover redraw with the Streets & Towns picture, no broken image.

Honest caveat: art review and QA were done by one reviewer (Claude), as in the research. A human art pass is still advisable, particularly for `the-dungeoneer` (wood vs stone) and `chapel-of-st-brenna` (clean vs moldering).

## 6. Performance

| | Before | After |
|---|---|---|
| New production files | — | 25 (851 KB on disk), none referenced until an overridden card or cover renders |
| Catalog strip, DPR 1 / 2 (AVIF) | 9–10 KB / 28–34 KB (clock tower, settlement or underground biome) | 6–12 KB / 13–31 KB: neutral or lighter |
| My Lists one-tile cover (AVIF) | 13–21 KB @320 / 42–75 KB @640 | 10–43 KB @320 / 28–87 KB @568-640 (`market-stalls` is a tall window: the heaviest) |
| Requests per card / cover | 1 | 1 (same `<picture>`, lazy, async) |
| Preloading | none | none |
| Masters in `dist/` | none | none (`img/cover-archetypes-source/` stays excluded; checked in `dist/`) |
| Duplicates | — | none: bustling-marketplace and city-festival share one file set |

Decision: cost is within noise except `market-stalls` My Lists (+13–45 KB over the 320/640 pictures it replaces in a list that contains it); the improvement is large enough to keep it. No new runtime dependency; `sharp` is already a dev dependency.

## 7. Tests and build

New `tests/semantic-overrides.test.js` (16 tests): approved table pinned, deterministic resolution, rejected/deferred exclusion, per-context eligibility, missing-derivative fallback in both contexts, painting and explicit-override priority, no change for any non-override environment (all 329 compared with the registry minus the table), stable parent identities, parent deduplication over every triple, unchanged cover limits and scoring, derivative dimensions / no upscaling / ladder, DPR 2 widths, build inclusion and master exclusion, language independence, Session Prep / Journey untouched, fallback wiring.
Existing tests that pinned the pre-crop counts were updated, never weakened (the lab baseline now reads production *before* PD-090, so the research results stay reproducible). Full suite **1669 / 1669**; `validate-data.js` 0 errors (2 existing warnings); `build.js`, `version-assets.js`, `check-asset-versioning.js`, `check-unlisted-build.js`, `check-journey2-build.js` pass.

## 8. Remaining limitations

- `market-stalls` / `tavern-terrace` are 1.12× / 1.27× upscaled in the My Lists one-tile band at DPR 2 only (see §3).
- `bustling-marketplace` and `city-festival` show the same strip; the strip is true to both, but two cards in one view repeat it.
- The My Lists band shows a slice of tall crops: it is subject-framed (`pos`), not the whole crop.
- `heist` and `murder-mystery` remain without a thematic picture in My Lists (deferred).
- Session Prep still draws the biome thumbnail for every environment; the crops are documented here as future material only (the Context-Adaptive Prep integration is separate).
- Each override is a hand-judged (crop × environment × context) row; it goes stale silently if the lore line or the master changes.
