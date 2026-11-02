# Adaptive List Covers — Phase 3 report

Decision record PD-087. Selection algorithm, card design, Catalog, Prep, Journey, `data/`, the classification dataset and saved lists are unchanged. Code outside the registry: `scripts/generate-list-covers.js` (three `SOURCES` lines) and `scripts/shoot-list-covers.js` (`--phase3` scenarios).

## 1. Source inventory
The three V2 masters are in `img/cover-archetypes-source/`, untracked until this commit, created today; no V1 file exists anywhere in the repository (no `-v1` names; Phase 2 had left these stems unregistered). Content inspected: a science-fantasy spaceport market under a planet (starfaring), a luminous Gothic temple with a statue, candles and offering bowl (sacred), a medieval market street with clock tower (streets). A test pins each master by SHA-256 and checks 16:9, so a swapped file fails.

| Master | Size | Bytes |
|---|---|---|
| starfaring.png | 1671×941 | 2.8 MB |
| sacred-sanctuaries.png | 1671×941 | 3.2 MB |
| streets-and-towns.png | 1670×941 | 3.3 MB |

## 2. Derivatives (same recipe as before: Lanczos, AVIF q52 at 320/640/960 + one 640 WebP, no sharpening, no filters)
| Picture | 320 | 640 | 960 | WebP 640 |
|---|---|---|---|---|
| starfaring | 16 KB | 52 | 98 | 66 |
| sacred-sanctuaries | 20 | 69 | 140 | 85 |
| streets-and-towns | 21 | 75 | 147 | 90 |
12 new files, 859 KB; `dist/img/list-covers` is now 104 files, 7.7 MB. Masters never ship. Nothing preloads: a visitor pays ~16–150 KB per picture, only for pictures a visible card uses.

## 3. Mappings (9 environments)
| Picture | Strong | Acceptable |
|---|---|---|
| starfaring (1) | — | planetary-blockade |
| sacred-sanctuaries (2) | hallowed-temple | hallowed-cathedral |
| streets-and-towns (6) | bustling-marketplace, resting-dagger-inn | local-tavern, emberwood-village, outpost-town, street-chase |

Reviewed: starfaring 17 taxonomy members (14 primary) + 4 by name/lore (cosmic-crash, trading-post, dreamlands, city-travel); sacred 21 (10 primary) + humble-altar-type look-alikes; streets 32 (11 primary) + ~10 by name. Totals reviewed ≈ 80 distinct environments (taxonomy plus keyword search of all 329, including the 14 records the classification lacks).

## 4. Rejected (Poor — not in `ARCHETYPE_FIT`; they keep biome art or none)
- **Starfaring:** the picture is a peaceful, crowded civilian port. Capital-ship-*, sovereignty-base, operations-center, conclave-hall, archons-throne-room (military interiors), asteroid-chase, stream-fold, lunar-surface (empty space), canyon-dogfight (a canyon), cosmic-crash (a wreck in a desert), sovereignty-outpost (soldiers' checkpoint), planetary-invasion (war), trading-post (a Western). Only Planetary Blockade — ships in orbit, a planet, people queuing to board — is acceptable, and its hostile mood keeps it at that grade.
- **Sacred:** the statue strongly reads as one religious tradition, so only benevolent, built, worshipful places pass. Rejected: mystic-ring, throne-of-three, blade-root-sanctum, sanctuary-of-the-story-tree (nature, no architecture), darkened/moonlight-temple, divine-usurpation, the-profane-ascendancy (profane), hallow-rest, martyrs-rest (burial), chapel-of-st-brenna (moldering — the picture is pristine), humble-altar (a Cathartoid, not a robed statue), garden-of-the-tranquil-order and moonlight-bastion (a different order / a field hospital), divine-audience (abstract).
- **Streets:** only ordinary, prosperous street life. Rejected: drakkenheim-outer-city, the-undermarket, gang-hideout, den-of-vice-and-violence (slums, crime), lost-village, haunted-city, ancient-city (abandoned), occupied-town, bastion, chaotic-marketplace (mood), city-streets (toxic smog), city-festival, town-festival (festival, and already rejected in PD-085's audit), rooftop-chase, bankburgh-chase, village/jungle/lizardfolk villages (wrong geography or inhabitants), the-village-of-hush, civic-library, arcane-magic-shop, upscale-casino, the-garden, city-travel. `port-city` keeps its harbour override; `magic-city` keeps arcane-sanctums.

## 5. Counts (all 329 environments, each counted once)
| | Phase 2 | Phase 3 |
|---|---|---|
| unique paintings | 3 | 3 |
| thematic archetype picture | 57 | 66 (+9) |
| biome picture | 150 | 150 |
| neutral / no tile | 119 | 110 |
Per picture: haunted 10, ruins 10, arcane 7, feasts 8, storms 6, infernal 5, drowned 3, strongholds 2, monster lairs 1, cursed 3, fey 2, starfaring 1, sacred 2, streets 6. All 9 new ones previously had no tile (settlement/universal). Computed with the registry's own resolver; the biome pick approximates `artBiome` in `js/app.js`.

## 6. Crops (object-position % x,y — 1-up / 2-up / 3-up)
starfaring 50,40 / 60,40 / 75,40 · sacred 50,12 / 30,30 / 15,25 · streets 50,28 / 62,40 / 80,35. Starting points were adapted from the Catalog/Prep notes and verified in the real component: the statue stays recognisable in all layouts; the 1-up band keeps planet, ships and vessel; streets keep tower, gate and stalls. Catalog and Prep were not changed.

## 7. Tests and checks
`node --test tests/*.test.js`: 1560 pass, 0 fail (new: V2 master pinning, 14 archetypes, exact grade per mapping, 53 poor matches resolve to biome/none, existing mappings untouched, collage distinct/≤3/deterministic/painting-first, missing picture falls through). Phase 2 tests asserting "unapproved" status were replaced. `validate-data.js` 0 errors; build, versioning, unlisted and Journey checks pass.

## 8. Visual QA
`node scripts/shoot-list-covers.js --phase3` seeds 21 lists (A starfaring, B sacred, C streets, D mixed 3/5/8/10, E regression) in a fresh browser profile at 1280×800, 1440×900, 1920×1080, DPR 2, English, phone 390: `docs/research/adaptive-list-covers-phase3-review/` (`lists-1440x900-dpr2.png` is the overview, `covers.json` lists pictures). Machine checks at every size: 0 broken images, 0 duplicates, no overflow, one card height (231) and cover height (90), ≤3 tiles, no upscaling. Observed: new pictures appear only for mapped environments; rejected lists show biome art or nothing; paintings keep priority; empty and stale-reference lists unchanged.

## 9. Limitations
- Starfaring has one environment; the picture is a civilian port and most StarHeart places are military or empty space.
- The sacred picture carries one religious tradition; mapping is deliberately minimal.
- The images carry heavy micro-contrast; not corrected, by instruction.
- 110 environments still get no cover tile (mostly settlement/universal).
