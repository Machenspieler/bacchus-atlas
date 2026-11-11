# Storm artwork — in-repo review (local, not published)

Source pack: `bacchus_atlas_storm_ui_review_pack.zip` (8 masters, SHA-256 and 1672×941 verified against `manifest.json`; originals copied byte-for-byte to `img/cover-archetypes-source/storm-*.png`). Reviewed with the real renderers (`#/lists`, `#/?type=storm`, `#/prep`) in system Chrome via Playwright, 1440×900 and 1280×800, device scale 2, seeded with 20 lists / 5 Prep sets. No console errors, no 4xx.

## Structure used
The eight pictures are extra variants of `storms-and-calamity` (`ARCHETYPES['storms-and-calamity'].variants`, indexes 1–8), ids `archetype:storm-<name>`; the original tornado picture and its mappings (tornado, megastorm, green-doom-skies) are untouched. `ARCHETYPE_FIT` rows carry the variant index. All 12 environment ids exist in `data/environments.json`.

## Decisions (all PASS = wired through the existing per-view gate)
| Picture → environments (fit) | Catalog 95 px strip (x%) | Prep 48 px (x%) | My Lists (object-position) |
| --- | --- | --- | --- |
| downpour → torrential-rain (strong), thunderstorm (acceptable) | PASS `all`, x40 | PASS `strong` only, x32: murky teal at 48 px, shrine barely visible, so thunderstorm (acceptable) keeps its biome tile in Prep | PASS, hero 50/50, 3-up x42 |
| lightning → lightning (strong) | PASS `all`, x65 | PASS `all`, x77 | PASS, 3-up x62 |
| hail → hail (strong) | PASS `strong`, x50: the lump can read as a snowball/boulder in a strip | PASS `strong`, x50: white lumps on a dark roof, ambiguous at 48 px | PASS, marked `busy` for composition |
| blizzard → blizzard-cold, snow-squall (strong) | PASS `all`, x56 | PASS `all`, x61 | PASS, 3-up x55 (pale but distinct from hail) |
| miasma → plague-poison (strong) | PASS `all`, x44 | PASS `all`, x39 | PASS, 3-up x45 |
| lifedrain → life-draining (strong) | PASS `all`, x50 | PASS `all`, x50 | PASS |
| radiance → searing-light (strong) | PASS `all`, x50 | PASS `all`, x50 | PASS: not blown out, the stone and long shadows anchor all crops; kneeling figures vanish at third width, recognition survives |
| arcane → magical-storm, unbound-arcanostorm (strong), elemental-chaos (acceptable) | PASS `all`, x65 | PASS `all`, x77 | PASS, 3-up x62 |

Crops are the manifest's starting values; no screenshot showed a need to move them. Real sizes measured: cover 318×90 (1-up), 158×90, 105×90; Catalog strip 95 px wide (219–251 px tall); Prep row thumb 48×48, selected tile 40×40.

Evidence (all under `docs/research/storm-art-review/`): `sheet-lists.png` (20 covers: 8 singles, 4 pairs, 4 triples, 4 mixed with tornado/graveyard/Cauldera/vampire castle, all-12), `w1280-sheet-lists.png`, `sheet-catalog.png` (strips beside the old tornado/megastorm), `sheet-prep.png` (real rows), `prep-48px-native.png` / `prep-48px-x4.png` (48 px thumbs beside the existing archetypes; the x4 is diagnostic only), per-item shots in `lists/ catalog/ prep/`.

## Caveats
- Thunderstorm: the distant bolt sits outside the 1:3 and 48 px windows, so it only shows in My Lists' wide tiles; hence `acceptable`.
- Downpour and hail are the weakest at 48 px (`strong` fits only).
- Blizzard-cold/snow-squall, and the three arcane environments, share one picture each, so adjacent Catalog cards repeat.
- Not touched: violent-winds, flickerstorm, spatial-rifts, reality-time-altering, Rondolo, Journey.
- Pre-existing bug found: `node scripts/generate-catalog-art.js` crashes at HEAD (the `crop:*` entries have no master, `path.join(ROOT, undefined)`), so the Catalog strips for these pictures were cut with a one-off script using the same `windowFor`/ladder. Not fixed here.
- Tests that pinned the old counts (117 fits, 90 thematic, 28 archetypes, thunderstorm → tornado picture…) were updated to the new state.

## Not approved yet
Owner has not signed off; nothing committed or pushed. No further generation is needed for any of the eight. If hail or downpour is judged too weak at 48 px, the remaining request is: *hail – same near-camera composition but one clearly faceted ice stone, larger, lit against the dark roof; downpour – shrine larger and lantern brighter, rain still dominant.*
