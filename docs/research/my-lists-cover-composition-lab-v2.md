# My Lists Cover Composition Lab V2

Status: **research, no production change.** Nothing here is an approved design; it needs the user's review and a product decision (PD-0xx) before any cover composition changes. Lab: `lab/cover-composition/` (dev-only, excluded from `dist/`). Evidence: `docs/research/my-lists-cover-composition-lab-v2/` (`screens/`, `metrics.json`, `stats.json`). Reproduce: `node scripts/shoot-cover-composition-lab.js`, `node scripts/cover-composition-stats.js`, `node --test tests/cover-composition-lab.test.js`.

## 1. The feedback

"Врата Балдура – test" (six environments) shows a misty marsh, a warm tavern interior and a ship in three 106px panels; the details compete and the cover reads as a mosaic. "Darkheart of the forest" is a triptych that looks right and must survive. Single-picture covers must not regress. Cover height stays 90px.

## 2. Production baseline (unchanged)

`listCoverHtml()` → `ListCoverUtils.coverForEnvironments()` → 0 pictures (neutral panel), 1 (full width ≈318px), 2 (halves ≈159px) or 3 (thirds ≈106px); picture selection (own painting → override → semantic crop → archetype fit → biome; one candidate per source family; top three by score) is **not** touched. The lab reads `js/app.js` as text and runs the real `listCardHtml` / `coverTileHtml` / `listCoverHtml`; Strategy A is asserted byte-identical to production for every fixture.

The separation the brief asked for is structural: `analyse()` takes production's three tiles as the candidate set, and every strategy only chooses a subset, widths and framing. A strategy can never show a picture production did not select (test 2).

## 3. The five strategies

| | Arrangement |
|---|---|
| A Current | production: 1 → full, 2 → halves, 3 → thirds |
| B Two Equal | the two strongest candidates (production's own score and tie-break), 50:50, catalogue order |
| C Single Hero | the strongest candidate, full width |
| D Asymmetric | strongest as main + second strongest, 60:40 / **67:33** / 75:25 (main left) |
| E Adaptive | 3 / 2 equal / asymmetric / hero chosen from per-picture panel reviews; unreviewed → production arrangement, marked *provisional* |

Every choice carries a rule id and a sentence (`explanation`). E's rules, in order: one candidate → hero; any candidate unreviewed → production arrangement (provisional); three candidates that all read at a third with at most one busy → three; otherwise the pair that reads best narrow → two equal if both read at half → else asymmetric if the main reads as hero and the other at a third → else hero.

## 4. Fixtures

The user's lists live in their own browser; the lab never reads them. Four **stand-ins** (labelled in the lab, contents invented, real environment ids) reproduce the report: `baldur-test` (shadowfen, teal-heart-inn, port-city, ocean-voyage, outpost-town, dread-mire → blighted-mires, seafaring, taverns-and-inns, i.e. marsh, ship, warm interior), `campaign-test` (12 mixed), `darkheart` (gloaming-forest, witchs-hut, abandoned-grove, spooky-forest → forest biome, forgotten-ruins, sinister-woods), `baldur-upper` (one picture). Ten synthetic cases cover 0/1/2/9/10/14 environments, ten environments sharing one picture, three calm, three busy, painting + archetypes, crops + biome fallbacks, and crops sharing one parent artwork. Only the picture a stand-in resolves to matters; they are not the user's exact lists.

## 5–6. Review method and panel suitability of the library

Every picture a cover can wear (28 archetypes, 3 paintings, 4 crops, 12 biomes = 47, `lab/cover-composition/reviews.js`) was rated **excellent / acceptable / poor** separately as hero (≈318×90), half (≈159×90) and third (≈106×90) with production's framing, plus complexity (calm / moderate / busy), palette, main subject, whether the subject survives narrow, a note and an optional experimental focal point. The review is explicit and context-dependent (no brightness/edge-density claims); it was made by Claude from contact sheets of the real panels and is **provisional until the user confirms it** (`reviewer: claude-provisional`, repeated in the export). Gallery: `screens/library-gallery.png`.

Findings: no picture is poor as a hero or at half width. 9 of 47 are poor at a third — all 9 archetypes: feasts-and-revelry, monster-lairs, cursed-and-blighted-lands, fey-and-enchanted, streets-and-towns, taverns-and-inns, archives-and-libraries, intrigue-and-underworld, dungeon-delves. 10 are busy (those plus strongholds-and-sieges and starfaring). All 12 biome pictures, the paintings and the crops read at a third; the calmest archetypes (sky-realms, sinister-woods, blighted-mires, crypts-and-tombs, sacred-sanctuaries, storms, planar-rifts) are excellent at every width. So the problem is specific and bounded: interiors, markets, libraries and dense fantasy cities lose their subject at 106px; landscapes and single-subject pictures do not.

## 7. Crop experiments

Lab-only x / y / zoom (zoom capped at 1.35×; the registry is never mutated, test 12). On taverns-and-inns at a third, moving the focus from 30% to 88% (fireplace) gives the panel one recognisable subject and is better than production's crop, but the picture stays busy: a better crop mitigates, it does not make the picture a good third (`screens/crops-taverns.png`, `crops-feasts.png`, `crops-starfaring.png`). The suggested focal points remain experimental and are not applied to production.

## 8–13. Cases

Screenshots: `screens/case-*.png` (all five strategies per list), `collage-busy-vs-calm.png`, `cases-synthetic.png`, `ratio-*.png`.

- **Three panels work:** Darkheart (forest, ruins, woods — all calm/moderate, third-excellent or acceptable), three calm pictures, painting + archetypes. E keeps all of these.
- **Three panels fail:** the Baldur stand-in (the tavern is poor at a third and busy), three busy pictures (tavern + market + library), campaign-test (arena, dungeon, library).
- **Two panels preferable:** every one of those. Marsh + ship at half width is calm and readable (`case-baldur-test.png`, B/E). B and E give the same cover there.
- **Single hero preferable:** rarely. C always reads cleanly but reduces a diverse list to one place (campaign-test shows only the arena) and makes every card in the page a single wide picture — monotonous at a page level.
- **Asymmetric preferable:** not in this library. D looks deliberate on the Baldur stand-in, but the narrow side (≈105px) is still a third, so a busy secondary keeps its problem; it also adds a fourth cover shape and a `grid-template-columns` rule that production does not have. E's asymmetric and hero branches never fired in 2,000 random lists because no picture is poor at hero or half width — they are dead code with this artwork.

## 14. Adaptive rules and maintenance

Over 2,000 deterministic pseudo-random lists (3–12 real environments, `stats.json`): 1,748 produce three tiles, 182 two, 64 one. For the three-tile lists E keeps three in 974 (56%) and drops to two in 774 (44%); asymmetric 0, hero 0. B would change 100% of the triptychs (including every good one), C and D ≈ 96% of all covers. The decision needs only **two per-picture facts** (reads at a third; busy) — never a combination table. Nine archetypes fail a third; combinations that include one of them account for the 44%. A per-combination override table (Option 5) would need hundreds of entries for the same coverage.

Limitation (see the busy collage): E's pair choice does not look at colour. Two warm, dense pictures (tavern + market) become a warm two-up that is calmer but still similar. A palette rule is possible (`palette` is recorded) but untested and adds a second axis; not recommended before a user review.

## 15. Full-page comparison

`screens/page-{A..E}-{1280,1440,1920}.png` are the **real app** (`index.html#/lists`, real header, ribbons, grid), fresh profile seeded with the 14 fixture lists, `listCoverHtml` swapped by `page-hook.js`; list order, names, card size and chrome are identical, only covers differ. Observations: A shows 12 three-up covers in 14 cards and several look like mosaics; B is uniform and calm but makes the page uniformly two-up and loses the good triptychs; C is the calmest and the most repetitive; D adds a rhythm of unequal pairs that reads as intentional but inconsistent beside any three-up; E keeps the three calm triptychs, changes only the busy ones, and the mix of 1-, 2- and 3-up reads as natural variety rather than inconsistency because the two-up shape already exists. DPR 2: `page-*-1440-dpr2.png`.

## 16. Performance (real browser, 14 fixture lists, 1440 wide)

| | requests / bytes @DPR1 (all 320w AVIF) | @DPR2 |
|---|---|---|
| A | 17 / 244.9 kB | 18 / 400.3 kB |
| B | 14 / 207.7 kB | 15 / 363.0 kB |
| C | 10 / 164.0 kB | 10 / 500.2 kB (hero loads 568–640w) |
| D | 14 / 207.7 kB | 18 / 626.8 kB (67% panel loads the 568w crop) |
| E | 16 / 232.1 kB | 17 / 387.5 kB |

Fewer pictures mean fewer requests; E saves ≈5% bytes over A. No strategy loads an unused width or a duplicate (`distinct` equals requests; the derivative ladder is reused, `sizes` follows each panel's real width). Cover height measures 90px and card size 320×231 under every strategy at 1280 / 1440 / 1920; layout shift is identical across strategies at each viewport (`metrics.json`; the lists page's own shift, 0.02 / 0.04 / 0.38 at 1280 / 1440 / 1920, is the same under A and therefore pre-existing, not caused by composition — the 1920 value is worth a look in its own right). No console errors or failed requests.

## 17. Human review

The lab's *Cases* tab records A–E / "no acceptable option" plus a note per case in its own `labcc2:state` key; *Review & export* produces `bacchus-cover-composition-review/1` JSON (fixture, environment ids, candidates, parent ids, preference, notes, included/omitted pictures per strategy, crop settings, picture reviews). No review has been recorded yet — that is the user's step.

## 18. Tests and build

`tests/cover-composition-lab.test.js` (15 tests): baseline = production, selection/composition separation, family dedupe and unique priority, no repeated picture, 0/1/2/3-image covers, determinism on large lists, stable ordering, crop isolation and zoom cap, export validity, storage / geometry / other-surface isolation, dist exclusion. Full suite, data validation and the build chain: see the commit.

## 19. Recommendation

**Option 4, in its smallest form** — not the five-way adaptive strategy tested as E.

> A three-panel cover stays only if all three pictures read at a third and at most one is busy; otherwise show the two strongest pictures as two equal panels. One and two pictures are unchanged.

Why it wins: it is the only option that fixes the reported cover *and* leaves Darkheart and the other calm triptychs alone (B and C change every triptych; D adds a shape and does not help a busy secondary). It needs no new layout — two equal panels already exist — and no CSS, so card geometry, cover height and the image ladder are untouched. Asymmetric and single-hero branches are dropped: they never fire with this artwork and E's extra complexity buys nothing.

- **Demonstrated on:** Baldur stand-in (3 → marsh + ship), campaign-test (arena + dungeon), busy-three (tavern + market). **Unchanged:** Darkheart, three calm, painting + archetypes, crops + biomes, every one- and two-picture cover, the empty list.
- **Would change in practice:** about 44% of three-picture covers in randomly built lists — those containing at least one of 9 archetypes or two busy ones. Worth stating plainly: that is a lot, driven by 9 of 28 archetypes (feasts, monster lairs, cursed lands, fey, streets/towns, taverns, archives, intrigue, dungeon delves) being poor at 106px.
- **Metadata:** two flags per picture in `list-cover-art.js` (`readsAtThird`, `busy`) for ~47 pictures, already drafted in `reviews.js` — per-picture, never per-combination. A new picture needs two judgements.
- **Production complexity:** small — a pure `composeCover(candidates)` step in `list-cover-utils.js` after `selectCoverImages` (rank the three, drop the weakest), unit tests, a PD entry. The ranking that picks "strongest" already exists.
- **Risks:** the ratings are the AI-made provisional review and must be confirmed; "two strongest" is production's own score, so a list's most thematic picture may not be its most readable one; similar-palette pairs (above) are not addressed; the lab uses stand-in lists, so confirm the result on the user's real lists before shipping.
- **Fallback if the user dislikes per-picture metadata:** Option 2 (always two panels, three-up only for an approved short list) is simpler but demonstrably worse on calm triptychs. Option 1 (keep) is defensible only if the user is content with ~44% of three-up covers looking dense.
