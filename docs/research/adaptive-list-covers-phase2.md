# Adaptive List Covers — Phase 2 report

Decision record PD-086. Selection algorithm, card design, Catalog, Prep, Journey, `data/`, the classification dataset and saved lists are unchanged. The only code outside the registry: `scripts/generate-list-covers.js` (optional stem arguments so new pictures are cut without re-encoding the old ones) and `scripts/shoot-list-covers.js` (`--phase2` scenarios).

## 1. Inventory
Existing (unchanged): haunted-and-deathly, forgotten-ruins, arcane-sanctums, feasts-and-revelry; 12 biome pictures; 3 unique paintings.
New and integrated: storms-and-calamity, infernal-and-profane, drowned-depths, strongholds-and-sieges, monster-lairs, cursed-and-blighted-lands, fey-and-enchanted.
Not integrated, by instruction: starfaring, sacred-sanctuaries, streets-and-towns (no files in the repository; nothing added, nothing deleted).

## 2. Source files and versions
All seven masters are 1672×941 PNG (16:9) in `img/cover-archetypes-source/` (committed with the existing masters, excluded from `dist/`).

**Version ambiguity (needs your confirmation):** only *one* file exists for Monster Lairs and for Cursed & Blighted Lands, and no earlier version was found on disk (Downloads, Desktop, Pictures, repo). I could not confirm "v2" from file names, so I checked the content against your descriptions: `monster-lairs.png` shows a subterranean cavern with a colossal dragon skeleton, eggs, waterfalls and underground water; `cursed-and-blighted-lands.png` shows dying trees, sickly pools, pale mist and dark ruins. Both match the revised scenes, so they are integrated. If either is actually the older version, replace the master and run `node scripts/generate-list-covers.js archetype-monster-lairs archetype-cursed-and-blighted-lands`.

## 3. Mappings (22 environments)
| Picture | Strong | Acceptable | Rejected (examples → fallback) |
|---|---|---|---|
| storms-and-calamity (6) | tornado, megastorm | thunderstorm, magical-storm, unbound-arcanostorm, green-doom-skies | volcanic-eruption, forest-wildfire, snow-squall, raging-fire, rain-ritual, stampede, flickerstorm, cloudy-sky, the-proving-pyre → biome / none |
| infernal-and-profane (5) | circles-below-dis, fallen-citadel, prison-city-pyrrhexis | infernal-railyard, the-metal-throne-of-sin | cult-ritual, darkened-temple, unhallowed-ground, moonlight-temple, divine-usurpation, demonic-abyss, the-profane-ascendancy (rituals, shrines, a chasm — no fortress-city) |
| drowned-depths (3) | sunken-citadel, deep-one-city | drowned-sanctum | shipwreck (washed ashore), realm-of-the-dead (colourless, lifeless), undersea-trench, umbral-basin, fathomless-baths (open water / darkness) |
| strongholds-and-sieges (2) | castle-siege | defense-of-the-river-fort | fortress (peaceful), bandit-hideout, bandit-attack, capital-ship-assault, occupied-town, pitched-battle, hold-the-line, sovereignty-outpost |
| monster-lairs (1) | — | dragons-lair | acid-burrows, astral-mound, webbed-terrain, thrumming-hives, rats-nest-tavern, escape-the-swarm, scorching-dungeon, progenitor-minds-lair (insects, spiders, burrows, lava) |
| cursed-and-blighted-lands (3) | rewritten-grove | gnarled-glen, cursed-valley | devouring-green(+ritual), green-doom-tangle (lush/slimy green), heart-of-the-mire (swamp → blighted-mires), obsidian-forest, valley-of-ruination, rimefouled-wastes, burning-heart-of-the-woods |
| fey-and-enchanted (2) | court-of-cats | fey-lands | court-of-hounds, faestone-wode, dark-forest-revel, hags-hut, witchs-hut, gloaming-forest, wishmaker-glade (dark, wild or without architecture); cauldera-valley / field-of-dreams keep their paintings |

Taxonomy sizes for comparison (primary + secondary): storms 16, infernal 18, drowned 11, strongholds 18, monster lairs 24, cursed 15, fey 18 = 120 — only 22 pass. Monster Lairs is the thinnest (one environment, graded acceptable); that is deliberate, the picture is one specific dragon cavern. Environments with a thematic picture: 35 before, 57 now, of 329. Of the 22, 11 previously used a biome picture and 11 had none (universal events, settlements).

## 4. Crops (object-position % x,y — 1-up / 2-up / 3-up)
storms 52,18 / 55,38 / 55,30 · infernal 58,22 / 58,35 / 60,30 · drowned 50,38 / 48,40 / 50,40 · strongholds 60,30 / 72,40 / 80,35 · monster-lairs 50,72 / 30,55 / 22,55 · cursed 50,48 / 40,45 / 30,40 · fey 50,35 / 60,40 / 70,35. Checked in the real component; the first monster-lairs value (y 58) cut the skull off in the 1-up band, so it was moved to 72.

## 5. Assets
Whole-frame Lanczos cuts at 320/640/960 AVIF (q52) plus one 640 WebP, the same recipe as the existing covers, no sharpening or filters.
| Picture | 320 | 640 | 960 | WebP 640 |
|---|---|---|---|---|
| storms | 15 KB | 50 KB | 102 KB | 68 KB |
| infernal | 16 | 49 | 95 | 63 |
| drowned | 17 | 61 | 126 | 75 |
| strongholds | 13 | 45 | 90 | 62 |
| monster-lairs | 13 | 48 | 97 | 64 |
| cursed | 15 | 55 | 112 | 71 |
| fey | 20 | 72 | 146 | 88 |
28 new files, 1.7 MB in `dist/` (list-covers total 92 files, 6.6 MB; masters and PNGs never ship). Cost to a visitor: nothing until a list uses a picture; tiles are lazy and the browser fetches one candidate per tile, so a list card costs ~15–100 KB per picture. Registration alone preloads nothing. Card geometry unchanged (231 px cards, 90 px covers).

## 6. Tests
`node --test tests/*.test.js`: 1555 pass, 0 fail. New: registration, exact grade per mapped environment, rejected environments resolve to biome/none, unique paintings and the original four unchanged, unapproved archetypes absent from registry/generator/fit, masters excluded from `dist/`, same-archetype list not all-tornado, mixed lists (≤3 distinct, deterministic), ten-member list. One existing expectation changed: "universal environments get no picture" now excludes environments with an explicit archetype fit (a tornado is universal and intentionally has a picture), mirroring the settlement line beside it. `validate-data.js` 0 errors; build, versioning, unlisted and Journey checks pass.

## 7. Visual QA
`node scripts/shoot-list-covers.js --phase2` seeds 24 lists (scenarios A–G) in a fresh browser profile — saved lists are never touched — at 1280×800, 1440×900, 1920×1080, DPR 2, English, and phone 390. Screenshots: `docs/research/adaptive-list-covers-phase2-review/` (`lists-1440x900-dpr2.png` is the best overview; `covers.json` lists each cover's pictures). Machine checks at every size: 0 broken images, 0 duplicate tiles, no horizontal overflow, one card height, one cover height, ≤3 tiles, no upscaling. Observed: each new picture appears only for its mapped environments; rejected lists (B2, B4, B6, D) show biome pictures; Starfaring/Sacred/Streets lists show plain biome art; a painting beats the fey picture; empty and stale-reference lists behave as before; original four and three paintings unchanged.

## 8. Limitations
- Monster Lairs / Cursed version unconfirmed (§2).
- The images carry heavy micro-contrast; not corrected, by instruction.
- Environments of the three unapproved archetypes (and most of the other taxonomy groups) still rely on biome art; 130 settlement/universal ones still get a neutral or no tile.
- Strongholds and Monster Lairs cover very few environments; more could be added once rejected ones are reconsidered with new art.
