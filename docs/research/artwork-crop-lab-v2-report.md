# Artwork Crop & Integration Lab V2 — four archetypes, landscape-first

Experiment only. Catalog, Session Prep, My Lists, Journey, `ENV_ART`, `data/` and the classification dataset are unchanged. The one production-adjacent edit is a one-line build exclusion (below). Builds on [artwork-crop-lab-report.md](artwork-crop-lab-report.md) (V1).

Open: `python3 -m http.server 8107` from the repo root (or the `atlas-lab` launch entry), then `http://localhost:8107/.claude/mockups/artwork-crop-lab/artwork-crop-lab.html`.

**Provisional.** Crops are starting values and the verdicts below are my reading of the lab and of contact sheets rendered with the same crop math. Nothing is approved until you judge it in the lab. Screenshots in the embedded pane are downscaled, so Prep 48 px legibility was judged on a magnified 1× render, not on the live page.

## 1. Artwork inventory

All five masters were found in `img/cover-archetypes-source/` under the suggested names. Nothing is missing. Masters were never resized or overwritten; the lab draws 1280 px (800 px portrait) WebP previews in `.claude/mockups/artwork-crop-lab/assets/`.

| Archetype | Source | Master | Aspect | Lab preview |
| --- | --- | --- | --- | --- |
| Haunted & Deathly | landscape | 1672×941 | 16:9 | 1280×720 |
| Haunted & Deathly | portrait | 1024×1536 | 2:3 | 800×1200 |
| Forgotten Ruins | landscape | **1536×1024** | **3:2** | 1280×853 |
| Arcane Sanctums | landscape | 1672×941 | 16:9 | 1280×720 |
| Feasts & Revelry | landscape | 1672×941 | 16:9 | 1280×720 |

Crop geometry reads each loaded image's real width and height (`visibleRect`), so the 3:2 and 2:3 sources get correct overlays; the 3:2 image is never stretched or forced to 16:9.

## 2. What changed in the lab

- Artwork registry (one or two sources per archetype), Archetype selector, per-archetype × context × source crop state, per-archetype brightness/contrast and Strategy C picks.
- "Crop shown": Recommended/edited vs Center 50/50. Editing while Center is shown returns to Recommended.
- Archetypes without a portrait offer no Portrait button, matrix column or strategy; they say "one master only".
- Catalog: selected environment plus short / medium / tall cards. Heights are **measured** from the real card at the real grid width (188–251 px in the lab's viewport), not set. A strip lineup shows every archetype at those heights.
- Prep: single row, three mixed lists (biome / alternating / four archetypes adjacent), five-environment repetition per archetype.
- Lists: scenarios A–F (single, two-up pairs, three-up trios, mixed sources, repeated archetype with distinct-image collage and a labelled ×3 negative, and real lists of 1/2/3/5/10 environments with an illustrative, non-final picker).
- Library gallery (full art, actual-size UI table, side-by-side library), inspector with extra short/tall catalog windows, stress tests (plus a four-archetype Catalog row), relevance audit, sticky section navigation, V2 JSON/CSS export.
- No color normalization anywhere. Filters are per-archetype lab experiments at 100 % by default.

## 3. Results by archetype

| Archetype | Catalog | Prep 48 | Lists single | Lists 3-up | Focal fix needed | Portrait? |
| --- | --- | --- | --- | --- | --- | --- |
| Haunted & Deathly | Works (x 64) | Works | Works, best case | Works (x 88) | Mild | No |
| Forgotten Ruins | Works (x 67): arch, statue, stairs, roots | Works: the dark arch reads | Works (y 38) | Works (x 90) | Mild | No |
| Arcane Sanctums | **Works only after x 67** | Works; the blue orb is the most distinct thumb | Mostly: y 8 keeps the orb | Works (x 85) | **Yes** | No |
| Feasts & Revelry | Mostly: reads as a candlelit hall, busy | **Weakest**: warm gold blur | Works | Works | No | No |

## 4. Catalog findings (the priority)

- **Forgotten Ruins:** the entrance survives. At x 67 the strip holds the arch, the flanking statue and the stair; the colossal roots at the left are lost, but the architecture still reads as monumental ruin, not generic forest. Center 50/50 slices the arch in half, so focal positioning matters.
- **Arcane Sanctums:** the predicted failure is real. Center crop cuts the tower in half and keeps the bridge and a glowing orb edge. `object-position-x` 67 recovers the whole tower and the orb, and the strip reads as an arcane tower on a cliff with a waterfall. The mechanism is recognizable.
- **Feasts & Revelry:** center is already near the best crop. The strip clearly says "candlelit grand hall" (chandeliers, red drapery, a statue, chairs and tables), but it is dense and bright beside the cold archetypes and is the warmest next to existing sunset biome strips. Not noise, but the least iconic.
- **Haunted & Deathly:** V2 reproduces V1 exactly with the same settings: same 95×249 strip and identical object-position values for all five contexts (compared in the page).
- Short, medium and tall cards all work with one crop because a 95 px strip is always much narrower than the image; only the vertical band changes, so x is the setting that matters.

## 5. Prep thumbnails (48×48)

Judged on a magnified 1× render. Haunted is a dark manor silhouette, Ruins a pale arch, Arcane a tower with a blue orb (the clearest), Feasts an orange-gold mass with dark tables. The four are mutually distinguishable and each says more than a biome gradient. Feasts is the exception: its warm palette overlaps the orange sunset biome thumbnails (drylands, settlement), so "can you tell it from biome art" is only a partial yes.

## 6. My Lists

- Single hero is the best use of every landscape master; the 318×90 band keeps the full width.
- Two- and three-up collages work, but crops matter: Arcane at 3-up needs x 85, otherwise the tower is halved.
- Colour temperature: Haunted (cold slate) beside Feasts (hot gold) or Ruins (golden-green) looks intentional, not clashing; Arcane (blue-violet with an orange sunset) sits between them. Mixed collages with a unique painting and a biome tile hold up because all share painterly lighting.
- Repetition: the same image ×3 is plainly bad. Where list members share an archetype *and* a biome (every Feasts member is `settlement`), the distinct-image count falls to two. Lists should use one hero or as many distinct images as exist, never a repeat.

## 7. Visual consistency

The set reads as one library: painterly, high-detail, cinematic, strong single light source, deep value range. Variation is deliberate (cold moonlight, golden shafts, sunset-over-cliffs, candle gold). Feasts is the only interior and the busiest; Arcane has the strongest focal point. No normalization is recommended.

## 8. Relevance audit (taxonomy ≠ artwork mapping)

Judged against the actual masters and the catalog lore; the full reasoning is in the lab (section G) and `relevance-audit.json`.

| Archetype | Strong | Acceptable | Poor | Typical poor matches |
| --- | --- | --- | --- | --- |
| Haunted & Deathly (18) | 3 | 8 | 7 | Deserted Moor, Haunted Mountain Pass, Wispy Wasteland, Valley of Death, Realm of the Dead, Bubbly's Bottom, Empty Cliffside Village |
| Forgotten Ruins (15) | 3 | 7 | 5 | Lost Village, Swamp Ruins, Mystic Ring, Titan Boneyard, Valley of Automata |
| Arcane Sanctums (10) | 2 | 5 | 3 | Alchemist's Workshop, Arcane Laboratory, Arcane Magic Shop |
| Feasts & Revelry (11) | 4 | 4 | 3 | Local Festival, Town Festival, City Festival (outdoor, commoner) |

**Of 54 assigned environments, 12 are strong matches (22 %), 24 acceptable and 18 poor (33 %).** The poor cases are geography the picture does not contain (moors, passes, plazas, water, bones). This supports a separate, reviewable suitability field per environment (strong / acceptable / poor), with poor falling back to biome art, instead of assigning an archetype image to everything in the taxonomy. The classification dataset was not changed.

## 9. Is Landscape-first viable?

**Yes, on this evidence, for all four.** No archetype needed a portrait to be acceptable in any context once a focal point was set. The cases the brief worried about all resolved: the tall off-centre tower (x 67), the temple entrance inside vegetation (x 67), and dense interior detail (readable, if busy). The one pair with a portrait (Haunted) gained only a modestly richer strip in V1.

A second master is justified only if a landscape fails after reasonable cropping. None did here. Two things could still change that: (a) a future archetype whose subject is inherently tall and narrow with no usable width (a skyscraper-scale tower on a flat sky), and (b) a Catalog redesign with a wider strip, which would weaken the case further. Arcane is the nearest candidate, and its tower is recovered by one x value.

## 10. Recommended artwork-generation guidelines

1. **Landscape master, 3:2 or 16:9.** 3:2 gave the best strip: more vertical height per width.
2. **Put the focal subject in one vertical third** that can be addressed by a single `object-position-x`, with the primary subject at least ~15 % of the width so a ~23 %-wide strip still holds it whole (Arcane's tower is 16 %, and survives).
3. **Keep the focal subject away from the top edge** when possible: Arcane's orb touches it, so the single-hero band needs y 8.
4. **A bright, saturated accent** (the blue orb) is the best thumbnail insurance; interiors should carry one distinct cool or contrasting element so they do not merge with orange biome art.
5. **Avoid second focal points near the edges**, which collage panels turn into half-objects.
6. Judge every new master at: 95 px strip at three heights, 48 px, 318×90, and 105×90, in this lab, with a Center-crop check.
7. Produce a second portrait only after the landscape fails that check, and record why.

## 11. Verification

| Check | Result |
| --- | --- |
| All five masters found, dimensions recorded | pass |
| Four archetypes selectable, previews load, zero broken images, no horizontal overflow (1440 and 1024 px) | pass |
| Haunted portrait offered; the other three show no portrait button, column or strategy | pass |
| Isolation: editing Forgotten Ruins · Catalog changed exactly the Ruins/catalog/landscape images; Haunted catalog stayed at x 90; Ruins prep stayed at x 80; settings survived archetype switching | pass (DOM snapshots) |
| Center vs Recommended; editing leaves Center view; presets; Reset crop | pass |
| JSON export carries all four archetypes, selected archetype, per-context crops and recommended values; CSS carries the selected one | pass |
| V1 parity (Haunted): catalog 95×249, identical object-position for all five contexts | pass |
| Duplicated collage panels | only the four labelled "Problem: same image ×3" negatives |
| `node --test tests/*.test.js` | 1497 / 1497 |
| `validate-data.js` | 0 errors, 2 existing warnings |
| `build.js` → versioning, unlisted, Journey 2 checks | pass; `dist/` contains no `cover-archetypes-source` and no `.claude` |
| `git diff` on `js/`, `css/`, `data/`, `index.html` | empty |

Not checked: the clipboard write for "Copy JSON/CSS" (falls back to a selectable `<pre>`), touch/phone widths, and fine visual QA of every scenario at true device pixels in the pane (it downscales; I used magnified contact sheets for aesthetics).

## 12. Build safeguard

`img/cover-archetypes-source/` was not excluded from `dist/`. It is untracked, so CI would not have shipped it, but a local build copied it. `scripts/build.js` now excludes it (`EXCLUDE_PATHS`, same pattern as `biome-artwork-source`). Confirmed absent in a fresh `dist/`.

## 13. Open items

- Crops are provisional; judge them in the lab, especially Feasts at 48 px.
- The relevance verdicts are mine and reviewable.
- A suitability field and the adaptive cover rule are future decisions; the lab's Scenario F picker is illustrative only.
