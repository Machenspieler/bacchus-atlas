# My Lists — Adaptive 3-or-2 cover composition (production integration)

Date: 2026-11-03 · Decision: [PD-092](../product-decisions.md) · Builds on the [Cover Composition Lab V2](my-lists-cover-composition-lab-v2.md).

## 1. User feedback
The cover of "Врата Балдура – test" (a misty marsh, a detailed tavern interior and a ship in three 106 px panels) was
visually overcrowded; "Darkheart of the forest" already works as a triptych and must not change.

## 2. Laboratory findings
Five strategies were compared on real components. The recommendation was the simplified rule below ("triptych only if all
three read at a third, else two"). Hero/asymmetric/dynamic-ratio variants were evaluated and are **not** shipped.

## 3. The rule
Operates on the final candidate set, after eligibility, ranking and family dedup (`selectCoverImages`):

| Candidates | Result |
| --- | --- |
| 0 | neutral cover (unchanged) |
| 1 | full-width (unchanged) |
| 2 | two equal panels (unchanged) |
| 3 | triptych iff **all three `readsAtThird` and ≤ 1 `busy`**; otherwise two equal panels |
| any picture unreviewed | triptych kept (no guessing) |

## 4. Metadata
`PANEL_REVIEWS` in `js/list-cover-art.js`: `{ readsAtThird, busy }` for each of the 47 `IMAGES` ids (28 archetypes, 3 paintings,
4 crops, 12 biomes). Derived from the lab's `reviews.js`: `readsAtThird = third rating ≠ poor`, `busy = complexity == busy`.
A crop has its own record (`crop:market-stalls` is calm and readable though its parent `streets-and-towns` is busy and not).
`tests/adaptive-cover-composition.test.js` requires an entry for every `IMAGES` id, so the "unreviewed" fallback only guards
a picture added without its review.

## 5. Final review of the nine third-width failures
Re-checked on a contact sheet of all 47 pictures cut with production's own 3-up framing (`pos[3]`) at 106×90 (shown 2×).
Verdicts unchanged — all nine stay `readsAtThird: false`:

| Picture | Verdict at ~106 px |
| --- | --- |
| Feasts & Revelry | candle lights merge into texture — fails |
| Monster Lairs | murky, no single subject — fails |
| Cursed & Blighted Lands | low contrast, focal point dissolves — fails |
| Fey & Enchanted | foliage and falls noisy — fails |
| Streets & Towns | market mosaic of awnings and figures — fails |
| Taverns & Inns | only the fireplace survives — fails |
| Archives & Libraries | shelves become noise — fails |
| Intrigue & Underworld | lamps and cloaks clutter — fails |
| Dungeon Delves | dark clutter — fails |

Spot-checks of the positives (sky realms, sinister woods, blighted mires, storms, planar rifts, all biome landscapes,
the three paintings, the crops) hold. The ten `busy` pictures are eight of the nine failures (all but Cursed & Blighted Lands, which is merely low-contrast) plus Strongholds & Sieges and
Starfaring (busy yet readable: the castle / ship still read at a third). The ratings are
still one reviewer's (Claude) judgement of the real panels; they are a flat table, so any can be flipped in one line.

## 6. Implementation
`composeCover(ranked, reviews)` in `js/list-cover-utils.js` (pure, exported), called by `selectCoverImages` on the best
three. `coverForEnvironments` passes its `art` through so `ART_RUNTIME` (which spreads `ListCoverArt`) carries the reviews.
`listCoverHtml()`, the CSS, derivatives, `srcset`/`sizes`, storage and every other surface are untouched; the result is an
ordinary 2-tile cover.

## 7. Which picture is dropped (one deliberate refinement)
The brief asks for the two *strongest by existing ranking*. Applied literally this fails the report's own example: the
Baldur list's existing ranking puts the ship last of the three, so a pure "drop the lowest-ranked" would keep
marsh + tavern. The lab's Strategy E, whose expected outcome the brief states ("marsh and ship"), chooses by narrow
readability. So: **the picture that fails at a third is dropped, else a busy one, and ties go to the lowest rank**
(never a new ranking — rank is the tie-break and survivors keep their rank-derived catalogue order). This is the single
point where the implementation reads the brief for its stated outcome rather than its literal wording.

## 8. Family dedup
Unchanged and still first: a semantic crop and its parent (or a sibling crop) are one candidate before the decision.

## 9. Before / after (real app, throw-away profile, identical lists)
Screens in `my-lists-adaptive-cover-composition-v2-integration/screens/` (dev-only, excluded from `dist/`):
`lists-<1280|1440|1920|1440-dpr2|1440-ru>-{before,after}.png` (full page; the 1440 EN/RU pair are the language checks) and
`card-<fixture>-{before,after}.png` per fixture. "Before" empties `PANEL_REVIEWS` on the same page.

Triptychs → two panels: Baldur-test (marsh + ship), Campaign Test, Three busy pictures, Fourteen environments.
Unchanged: Darkheart (three), Three calm pictures, Painting + archetypes, Crops + biome fallbacks, one-, two-image and empty
covers. Page rhythm: the busy rows are calmer, three-panel covers remain the majority of the image-rich ones, no monotony.

## 10. Delivery and layout (requests / transferred / CLS, cold cache, lists page only)
| Viewport | Before | After |
| --- | --- | --- |
| 1280×800 | 18 / 243.3 KB / 0.0227 | 17 / 230.8 KB / 0.0227 |
| 1440×900 | 18 / 243.3 KB / 0.0407 | 17 / 230.8 KB / 0.0407 |
| 1920×1080 | 18 / 243.3 KB / 0.3763 | 17 / 230.8 KB / 0.3763 |
| 1440×900 @2x | 19 / 405.9 KB / 0.0407 | 18 / 393.4 KB / 0.0407 |

No duplicate or failed requests, 0 broken images, no horizontal overflow, card 320×231 and cover 318×90 in every run,
identical in both modes. CLS is identical before and after; the 1920 value (0.376) is the pre-existing issue documented in
[my-lists-cls-investigation.md](my-lists-cls-investigation.md) and was not touched.

## 11. Tests
`tests/adaptive-cover-composition.test.js` (16 tests: registry completeness, the nine/ten verdicts, every rule branch,
drop order, unreviewed fallback, purity, the real Baldur / Darkheart / crowded / calm lists, family dedup, 0-1-2 layouts,
no other surface reads it). Older assertions that pinned the previous three-panel result
(`tests/list-cover-utils.test.js` phase 4, `tests/semantic-reuse-lab.test.js` #20) were updated to the new behaviour, and the
lab test now analyses the pre-adaptive arrangement (`PANEL_REVIEWS: {}`) it was written about. Full suite, data validation and
build chain green.

## 12. Limitations
- Fixtures stand in for the user's real lists (their contents are in their browser, never read); the Baldur fixture is invented.
- Reviews are single-reviewer judgement; some two-panel pairs still share palette or texture (accepted, no palette rules).
- When two pictures fail at a third, the lower-ranked drops but the survivor may itself be a poor third; at half width it is acceptable.
- The 1920 px CLS issue remains.
