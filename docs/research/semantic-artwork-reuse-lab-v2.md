# Semantic Artwork Reuse Lab V2

Final validation pilot, 2026-11-03. **No production behaviour changed**: Catalog, Session Prep, My Lists, Journey, the artwork registry (`js/list-cover-art.js`, `js/catalog-art.js`),
the classification, `data/` and every saved list are untouched. The V1 report (`semantic-artwork-reuse-lab-v1.md`) and its data are preserved as they were.
The lab is the V1 lab, extended: `lab/semantic-reuse/` (excluded from `dist/`, as is this report's evidence folder). Nothing here is a production approval and no `PD-` decision was appended.

Launch: `node scripts/semantic-reuse-lab.js --pilot=v2` (regenerates stats, export and lab-only derivatives), serve the repo root with any static server (`atlas-lab`, port 8107) and open
`/lab/semantic-reuse/#pilot=v2` (the **Comparison sheet** tab is the one-page summary). Screenshots: `node scripts/shoot-semantic-reuse-lab-v2.js`.

## The answer, first

**LIMITED GO: a hand-written override table of about 11 environments. A close call over NO-GO, and not a crop framework.**

- Three more sources, **14 regions proposed, 7 approved, 2 left for human review, 5 rejected**; **65 environment mappings reviewed: 0 Strong, 14 Acceptable, 33 Rejected, 18 Needs review.**
- **Five more environment IDs gain a themed picture they have nowhere today** (`chapel-of-st-brenna`, `chthon-verlies`, `gang-hideout`, `garden-of-the-tranquil-order`, `heist`); a sixth, `murder-mystery`, was already found by V1.
  **Zero environments get a demonstrable qualitative replacement.** One of the five (`chthon-verlies`) is contestable (see §8).
- **Combined V1 + V2: 9 environment IDs (2.7 % of 329) gain a themed picture, and 2 (V1's `bustling-marketplace`, `resting-dagger-inn`) get a better one.** V2 raised V1's 4 to 9 and V1's 2 qualitative to 2.
- Cross-archetype reuse was **again rare and gave nothing**: one approved cross mapping (`street-chase`, already themed), none Strong.
- Against integrating the 28 whole illustrations in Prep (the cheaper, larger win), crops add **8 environments new and 2 better** (combined), not the 26 the old biome baseline suggests.
- Native resolution was not the limit (every counted frame is DPR 2 clean). **Meaning was**: of 65 candidate mappings only 14 survived, and most surviving ones reach environments that already wear the archetype picture.

If the team will not take on new resolver code for roughly 2.7 % of the catalogue, NO-GO is a defensible reading of the same evidence. The recommendation below is the smallest version that still captures it.

## 1. V1 findings and limitations

V1 (6 sources) proposed 18 regions, approved 13, reviewed 79 mappings (8 strong, 22 acceptable, 33 rejected, 16 needs-review) and found 4 environments newly covered and 2 improved.
Re-verified from the stored data and recomputed through the V2 gain function (test V2-11): Catalog 3 new + 2 qualitative, My Lists 3 new + 2 qualitative, Prep 16 (biome baseline).
V1's limits that still hold: one reviewer's verdicts, no human art review, no browser-measured sharpness audit, the My Lists rule that a crop must hold in all three layouts.

## 2. Why these three sources

V1 named them as the strongest unpiloted sources (§12, §20.3): `intrigue-and-underworld` (its Catalog picture is `none`, so its two fits show biome strips today), `sacred-sanctuaries`, `dungeon-delves`.
They are the right test: a crop-based gain needs environments without a themed picture, and these archetypes own many (`chapel-of-st-brenna`, `humble-altar`, `chthon-verlies`, `heist`, ...).

## 3. Source inventory

All three masters present, unchanged, used only as crop sources (no production derivative, one resample per lab file).

| Source | Master | px | Production use |
|---|---|---|---|
| `intrigue-and-underworld` | `intrigue-and-underworld.png` | 1671×941 | archetype picture, 2 fits, Catalog strip: none |
| `sacred-sanctuaries` | `sacred-sanctuaries.png` | 1671×941 | archetype picture, 2 fits, Catalog strip: all |
| `dungeon-delves` | `dungeon-delves.png` | 1670×941 | archetype picture, 2 fits, Catalog strip: strong |

## 4. Regions: proposed, approved, rejected

14 proposed → **7 approved**, 2 proposed (needs human review), 2 insufficient-resolution, 3 not-independently-meaningful. Coordinates are normalised (x, y, w, h) in `lab/semantic-reuse/data-v2.js` and `review-export.json`.

| Region | Status | Region px | Catalog | Prep | Lists 1/2/3 |
|---|---|---|---|---|---|
| `intrigue-and-underworld-covert-table` | approved | 500×530 | ✔ | ✔ | ✔·/✔/✔ |
| `intrigue-and-underworld-arch-alley` | approved | 470×680 | ✔ | ✔ | ✘/✘/✘ |
| `intrigue-and-underworld-plotters-table` | approved | 830×501 | ✘ | ✔ | ✔/✔/✔ |
| `intrigue-and-underworld-serpent-banner` | not-independently-meaningful | 201×520 | | | |
| `intrigue-and-underworld-night-skyline` | insufficient-resolution | 281×169 | | | |
| `sacred-sanctuaries-statue-altar` | approved | 500×710 | ✔ | ✔ | ✘/✘/✔ |
| `sacred-sanctuaries-arched-vista` | proposed (review) | 510×630 | (✔) | (✔) | ✘/✘/(✔) |
| `sacred-sanctuaries-lotus-pool` | approved | 770×221 | ✘ | ✔ | ✔/✔/✔ |
| `sacred-sanctuaries-candle-steps` | not-independently-meaningful | 680×290 | | | |
| `dungeon-delves-barred-gate` | approved | 620×680 | ✔ | ✔ | ✘/✘/✔ |
| `dungeon-delves-stair-bridge` | approved | 700×640 | ✔ | ✔ | ✘/✘/✔ |
| `dungeon-delves-explorers-kit` | proposed (review) | 860×421 | ✘ | (✔) | (✔/✔/✘) |
| `dungeon-delves-flooded-steps` | not-independently-meaningful | 710×320 | | | |
| `dungeon-delves-hanging-cage` | insufficient-resolution | 160×320 | | | |

A ✔· is usable but DPR 2 is limited (the only upscaled lab file, `covert-table--lists1-636x180`, is drawn 1.27×; no counted gain depends on it). Parentheses: the frame passes, but the region is not approved, so nothing counts.
A My Lists crop must hold in all three layouts, which excludes every tall region (the 3.5:1 band keeps a slice of a 1:1 region and cuts the subject away). Yield: **2.33 approved regions per source** (V1: 2.17).

**Why the rejected ones failed** (screens `07-*`):

- `candle-steps`: the statue crop minus the statue, a near duplicate (the "do not multiply crops of one statue" rule).
- `serpent-banner`: an emblem, not a place; a faction mark is no evidence of a criminal faction.
- `flooded-steps`: sharp, but generic wet stone; pixels fine, meaning not.
- `night-skyline`, `hanging-cage`: too small in the master (about 280×170 and 160×320) for any frame.
- `explorers-kit` (needs review): a still life like V1's rejected dining table, but it names an activity (delving). Left for a human; its mappings are not counted.
- `arched-vista` (needs review): lovely and recognisable, but its only candidate (`blade-root-sanctum`) is contestable and no other environment describes an open arcade over a valley.

## 5. Source-resolution audit

Computed from the part of a region that survives `object-fit: cover` (`stats.json`, per frame and DPR). Of 24 usable frames, **23 are clean at DPR 1 and 2**, 1 is limited at DPR 2 (above). Subject size, not file size, is the limit: the two failures are 160–280 px subjects.
All 7 approved regions have at least one DPR-2-clean frame. A browser-measured decoded-size audit was **not** run (as in V1); the lab frames are cut at exactly frame × DPR from the master.

## 6. Environment-level suitability

Every mapping carries a written reason in terms of the environment's lore and what the crop shows (`review-export.json`). Counted (Strong/Acceptable on an approved region, in a passing frame):

| Environment | Crop | Review | Today | Honest limits |
|---|---|---|---|---|
| `gang-hideout` | covert table | Acceptable | Catalog: biome strip | table under a stall awning fits "attached to a legitimate business"; no gang, goods or gambling shown |
| `chapel-of-st-brenna` | statue and candle altar | Acceptable | Catalog, Lists: none | the statue holds a bowl of flame (the Sacred Flame); the lore is "moldering", this chapel is clean |
| `chthon-verlies` | barred gate | Acceptable | Catalog: biome strip (a blue crystal cavern) | prison fits "political prisoners", the crystals are lost; contestable |
| `garden-of-the-tranquil-order` | lotus pool | Acceptable | Lists: none | no guardians or secrets |
| `heist` | plotter's table | Acceptable | Lists: none | a sealed map and a dagger are "Prep Work"; no target shown |
| `murder-mystery` | plotter's table | Acceptable | Lists: none (V1 already) | reads as a plot, not a crime scene |
| `hallowed-temple`, `hallowed-cathedral`, `deadly-dungeon`, `dangerous-dungeon`, `street-chase` | statue / gate / stair / alley | Acceptable | already themed | suitable, **no gain** |

**Rejected on purpose** (the semantic cautions held): `the-undermarket` (above ground, not sewers), `jazz-speakeasy`, `trading-post`, `den-of-vice-and-violence`/`thieves-guild` (lighting alone is no evidence: needs-review), `blade-root-sanctum` for the saint statue (faith-specific iconography),
`darkened-temple`, `moonlight-temple`, `divine-audience`, `scorching-dungeon`, `collapsing-floor`, `prison-city-pyrrhexis`, `the-dungeoneer` for the gate, `abandoned-mine` for the stair.
Needs review (18, not counted) include `thieves-guild` ×2, `bank-heist`, `humble-altar` (lore is a Cathartoid, not a robed statue), `blade-root-sanctum`, `ruined-castle`, `city-out-of-time`.

## 7. Cross-archetype reuse

One approved cross-archetype mapping: `arch-alley` → `street-chase` (chase-and-ambush), already themed, so no gain. Nothing Strong. Every other approved mapping stays inside the source's archetype.
V1 found 5 cross environments; V2 found 1. The idea works only where an environment's lore names a thing a crop shows, and V2's sources were close to their own archetypes' environments. Taxonomy untouched (test V2-7).

## 8. Context-specific visual quality

Screens `03-*` (real card, real picker row, real cover, 1280×800 to 1920×1080 and DPR 2). Catalog 95×249: the covert table shows a hooded patron, a candle and barrels; the statue shows halo, flame bowl and candles; the gate shows bars, chain and torch; all read.
**The two Catalog frames I would defend least:** `gang-hideout` (one cloaked figure stands in for a meeting) and `chthon-verlies`, whose current biome strip already is a crystal cavern, while the crop shows the prison and drops the crystals. Both counted, both flagged.
Prep 48×48: all seven read at normal size. My Lists: only the wide regions (plotter's table, lotus pool) make bands; **a cover holds one region per parent** (`Core.dedupeByParent`, test V2-8). The lotus pool is the one that is Prep- and Lists-only.

## 9. Real screenshots

`docs/research/semantic-artwork-reuse-lab-v2/screens/` (WebP, q80; `browser-audit.json`: 0 page errors, 0 console errors, 0 failed requests). **`00-comparison-sheet.webp` (and `-dpr2`) is the one-page summary**:
the three sources with every proposed region (green approved, amber review, red rejected), the approved crops, and every gaining environment as the real Catalog card and Prep row, before and after.
Also: `01-source-*` (overview, four viewports), `03-contexts-*`, `05-abc-*` (existing vs crop), `05-nogain-*` (suitable but no gain), `06-cross-street-chase`, `07-*` (rejected regions and mappings), `10-approved-grid-and-sizes`, `11-coverage`, `13-export`.
Caveat as in V1: the verdicts and the images were judged by the same reviewer; no human art review has happened and every verdict is provisional.

## 10. New coverage vs qualitative replacement vs no gain

Counted per environment per context, at its best category (`Core.gains`), kept apart. **Session Prep production = biome thumbnail for all 329, so any picture is "new" there; the meaningful Prep rows are the future-strategy ones.**

| V2 only | New | Qualitative | No gain |
|---|---|---|---|
| Catalog | 3 | 0 | 5 |
| Prep vs today's biome | 11 | 0 | 0 |
| Prep vs archetype-first | 5 | 0 | 6 |
| My Lists | 3 | 0 | 1 |

New IDs: Catalog `chapel-of-st-brenna`, `chthon-verlies`, `gang-hideout`; Lists `garden-of-the-tranquil-order`, `heist`, `murder-mystery`; Prep vs archetype-first the same five except `gang-hideout`.
**Distinct V2 environment IDs with new coverage (Catalog or My Lists): 6; with better artwork and no increase: 0.**

## 11. Combined V1 + V2 (deduplicated)

Mappings are pooled and counted once per environment, context, parent and region (test V2-13: `murder-mystery` has two crops from two parents and is counted once).

| V1 + V2 | New | Qualitative | No gain |
|---|---|---|---|
| Catalog | 6 | 2 | 16 |
| Prep vs today's biome | 26 | 0 | 0 |
| Prep vs archetype-first | 8 | 2 | 16 |
| My Lists | 5 | 2 | 13 |

**Distinct environment IDs: 9 new** (`chapel-of-st-brenna`, `chthon-verlies`, `city-festival`, `gang-hideout`, `garden-of-the-tranquil-order`, `heist`, `murder-mystery`, `pitched-battle`, `the-dungeoneer`) **and 2 qualitative**
(`bustling-marketplace`, `resting-dagger-inn`): **11 of 329 (3.3 %)**, 20 approved regions, 41 counted mappings on 27 environments (31 environment/parent pairs).

## 12. What crops add beyond the existing 28 whole illustrations in Prep

Option 1: archetype-first or context-adaptive whole pictures (117 environments already have one). Option 2: option 1 plus approved crops. The crops' increment, combined: **8 new, 2 better**
(V2 adds `chapel-of-st-brenna`, `chthon-verlies`, `garden-of-the-tranquil-order`, `heist`, plus V1's `city-festival`, `pitched-battle`, `the-dungeoneer`, `murder-mystery`). Everything else the old Prep comparison called a gain is the whole-picture work.

## 13. Derivative costs

53 lab files (293 KB AVIF + 91 KB WebP) for 7 approved regions; the 5 gaining regions need 38 AVIF files, 248 KB. Average AVIF 1x / 2x: Catalog 4.8 / 12.9 KB, Prep 0.9 / 2.3 KB, My Lists 1-tile 6.8 / 17.2, 2-tile 3.9 / 10.6, 3-tile 2.6 / 7.4.
An existing 200 px Catalog strip is 22.4 KB. Lanczos3, one resample from the master, no sharpening, no AI upscaling, no stretch.

## 14. Architecture options

| | A. Do nothing further | B. Curated override table | C. Full Semantic Artwork Reuse system |
|---|---|---|---|
| Coverage | 0 | 9 new, 2 better, 11 of 329 | the same 11: the evidence found no more |
| Visual quality | unchanged | 11 hand-picked crops, human-reviewed | the same crops, more review overhead |
| Complexity | none | one table beside `ENV_IMAGE_OVERRIDES`, one resolver branch per context | region registry, mappings, framing, validation, editor, review workflow |
| Build | none | one script (the lab's is the prototype) cutting ~70 files | generator, validator, CI check |
| Runtime | none | none (the file is the frame, like today's strips) | none, plus registry loading |
| Data upkeep | none | 11 rows go stale if a lore line or master changes | hundreds of (region, env, frame) tuples |
| Future environments | none | none unless someone adds a row | every new environment needs a review pass |
| Testing | none | a pinned table plus parent-dedupe cases | the full harness |
| Wrong-image risk | none | low, one reviewer per row | high: 65 candidate mappings gave 14 usable |
| My Lists dedupe | none | rule: one crop per parent illustration, never beside its whole picture | the same, generalised |

C buys no environment B does not already cover: V1 + V2 found an average of 2.2 usable regions per source and the ceiling is how many descriptions name something a crop can show. Not recommended.

## 15. Decision: LIMITED GO

Criteria: unique environments improved (**9 new, 2 better**, 3.3 %); quality (good for the stall, inn terrace, statue chapel, plotter's table, lotus pool, trebuchet; contestable for `chthon-verlies` and the strip for `gang-hideout`);
independent subjects per source (2.2–2.3); cross-archetype potential (low); DPR 2 viability (not a limit); benefit beyond whole archetype images in Prep (8 new, 2 better); maintenance (small for a table, large for a system); integration (three resolvers, one dedupe rule).
Results are mixed and the gains small, so: **the simplest thing that captures them, Option B, or Option A if the team prefers no new resolver code.**
There is no further research pilot: V1 + V2 cover the strongest candidate sources. The remaining 19 sources are rated low or medium and the evidence is that estimates overstate.

## 16. Production implications if approved

- A human art review of the ~11 crops first (every verdict here is one reviewer's).
- A `CROP_OVERRIDES` table next to `ENV_IMAGE_OVERRIDES` (env id → source id → region → per-context derivative), `scripts/generate-crop-art.js` cutting derivatives from the masters, `scripts/check-*` coverage, resolver branches in Catalog, My Lists (and Prep only if wanted), a `PD-` decision, `docs/architecture.md`, tests.
- My Lists: one crop per parent illustration in a cover, never beside that illustration's whole picture.
- Prep: do the archetype-first integration first; crops add 8 environments to it.

## 17. Known limitations

One reviewer; no human art review; several counted mappings rest on one-line lore (`heist`, `garden-of-the-tranquil-order`, `gang-hideout`); the My Lists all-three-layouts rule discards every tall region; Catalog-only gains for `gang-hideout` and `chthon-verlies` are judgement calls;
no browser sharpness audit; no phone-width pass of the lab; `explorers-kit` and `arched-vista` could change the numbers (up to 2 more environments) if a human approves them.

## 18. Tests and build

`tests/semantic-reuse-lab-v2.test.js` (17 tests): stable ids and bounds, normalised ↔ pixel conversion, DPR maths against `stats.json`, independent contexts, missing masters, rejected / needs-review never eligible, cross-archetype without taxonomy change,
parent identity and per-parent dedupe, unique-id gain counts with categories apart, proposed vs approved, V1 intact and reproduced through the new function, V2 export valid, combined deduplication, Prep beyond archetype, production registries / Catalog / Prep / My Lists / Journey unchanged, isolation and build exclusion, derivatives.
Full suite **1653 / 1653 pass**; `validate-data.js` 0 errors (2 existing warnings); `build.js`, `version-assets.js`, `check-asset-versioning.js`, `check-unlisted-build.js`, `check-journey2-build.js` pass. `scripts/build.js` now excludes both V1 and V2 evidence folders (`lab/` was already excluded).
