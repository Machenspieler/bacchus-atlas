# Bacchus's Atlas — list-cover archetype research

Research only. Nothing in the app, the catalogue, the Journey, the design system or any list was changed; no image was generated.
Companion files: [lists-cover-classification.json](lists-cover-classification.json) (machine-readable dataset) and [lists-cover-pilot-artwork.md](lists-cover-pilot-artwork.md) (the first batch of illustrations).

## 1. Executive findings

1. **316 environments** are in `data/environments.json` (all ids unique; counted, not assumed). 3 have unique paintings.
2. **A cover already ships.** `listCoverHtml()` in `js/app.js` draws up to three tiles from `ENV_ART` (the three painted environments), 90 px tall; most lists get no cover at all. The new system extends that, not replaces a blank.
3. **The data supports 28 archetypes**, plus two honest fallback classes. 274 environments (86.7%) receive a primary archetype: 174 high confidence (55.1%), 100 moderate (31.6%). 12 (3.8%) are ambiguous and 30 (9.5%) need only a biome or universal image (26 plain terrain, 4 setting-neutral events).
4. **The distribution is a flat long tail, not a head.** The biggest archetype is only 5.7% of the catalogue. Eight pictures cover 33.5%, fifteen cover 55.7%, twenty-five cover 81.0%. There is no "20 pictures cover 80%" knee; the case for the library rests on *relevance* (replacing an identical biome picture), not on raw coverage.
5. **The biome picture is the weak point the archetypes fix.** 151 environments (47.8%) can only ever show the `settlement` or `universal` picture (`artBiome()`); 141 of them have a real archetype. 111 environments list `settlement` first and 53 list `universal` first.
6. **Keyword rules are not reliable enough.** A post-hoc keyword classifier, tuned after reading the whole catalogue (so optimistic), reproduces only 71% of the hand classification. Use an explicit id → archetype mapping, validated like the other data files.
7. **Several archetypes are already half-covered by existing paintings** (Planar rifts by the fully-shadowblighted art, Towns by the settlement harbour, Fey by the Field of Dreams / Cauldera paintings), and 26 environments are pure terrain for which the 12 existing 16:9 biome paintings are the right cover. There is **no 16:9 `universal` painting** — only a 1:3 strip.
8. **Recommended pilot (8):** haunted-and-deathly, forgotten-ruins, storms-and-calamity, infernal-and-profane, arcane-sanctums, drowned-depths, feasts-and-revelry, cursed-and-blighted-lands — 99 environments by primary theme (31.3%), 129 counting secondary themes (40.8%). Detail in the pilot report.

## 2. Sources and method

- **Canonical catalogue:** `data/environments.json` → `{ environments: [...] }`. Contract: [docs/data-contracts/environments.md](../data-contracts/environments.md).
- **Fields read for every record:** `id`, `name`, `lore`, `features[].name`, `impulses`, `biomes`, `type`, `tier`, `source`; `data/regions.json` for region membership. `potential_adversaries` and feature descriptions were consulted when lore was thin.
- **Method:** every record was read and classified by hand from its own text. The id is the stable key (routes, Lists and Prep already use it). Records without `lore` (5) were classified from their names, feature names and impulses.
- **Not done:** no second annotator, no inter-rater measurement, no model call; confidence is the classifier's own judgement.
- Existing code reviewed: `artBiome()`, `ENV_ART`, `ENV_ART_FOCUS`, `listCoverHtml()`, `envsInList()`, `state.envLists` (`dhcodex_env_lists`, keyed by environment id), `css/styles.css` `.list-card-cover`. Nothing was modified.
- A temporary analysis script lived outside the repository (session scratchpad); only the three research artifacts were added.

## 3. Catalogue statistics

| Measure | Value |
| --- | --- |
| Environments | 316 (all ids unique) |
| With lore | 311 (98.4%); without: 5 (`root-rush-rescue`, `orphanmaker-river`, `the-ritual-of-renewal`, `deathrace`, `digestive-tract`) |
| With `story_seeds` | 26 |
| With unique artwork | 3: `cauldera-valley`, `field-of-dreams`, `ouroborean-pass` (all from the Witches' Cauldera region) |
| Distinct biome ids | 13 (11 terrains + `settlement` + `universal`) |
| Multi-biome records | 40 |
| Type | exploration 105, event 83, traversal 68, social 60 |
| Tier | 1: 91, 2: 105, 3: 82, 4: 38 |
| Biome tag counts | settlement 118, universal 54, underground 38, forest 36, aquatic 27, badlands 16, wetland 15, drylands 13, tropical 13, mountain 12, frozen 9, rolling 5, grassland 4 |
| Sources (top) | Wondrous Environments 61, Atlas of Adventure 30, Daggerheart: Hope & Fear 28, Dread GM Toolbox 26, Archibald's Almanac of Adversaries 25, Resting Dagger 25, Incredible Creatures 24, StarHeart 21 (27 source books) |
| Regions (`regions.json`) | environments in a region share a book location (e.g. Neverhome Manor) |

**Fields suitable for deterministic cover selection:** `id` (stable), `biomes` (always present, already drives `artBiome()`), `tier`, `type`, `source` (StarHeart ⇒ space opera; 21 records, 14 classified `starfaring`), `region`. None of these carries the narrative theme: biome alone predicts the archetype for only 26% of environments.

**Variants of one concept.** 15 groups of records are the same concept in several versions; a cover should not show the same image twice for them:

- **identical-content:** `underground-chasm`, `demonic-abyss` — Identical feature set and near-identical lore (same book scene reprinted under two names).
- **time-loop:** `time-loop`, `time-loop-atlas` — Same concept, two sources.
- **masquerade:** `masquerade-ball`, `masquerade-ball-atlas`, `masquerade-party` — Same concept in three sources.
- **festival:** `local-festival`, `town-festival`, `city-festival` — Same concept, different scale; Town and City Festival share a Russian name (PD-075).
- **capital-ship:** `capital-ship-assault`, `capital-ship-high-alert`, `capital-ship-infiltration`, `sovereignty-base` — Same warship set-piece in four states; identical impulses.
- **planar-incursion:** `planar-incursion-arcane-vortex`, `planar-incursion-invasion` — Escalation pair.
- **devouring-green:** `devouring-green`, `devouring-green-ritual` — Parent and sub-scene.
- **story-tree:** `sanctuary-of-the-story-tree`, `siege-of-the-story-tree` — Peace and siege of one location.
- **fathomless-baths:** `fathomless-baths-surface`, `fathomless-baths-deeps` — Surface and depth of one location.
- **green-doom:** `green-doom-tangle`, `green-doom-skies` — Land and sky of one location.
- **ambush-pair:** `ambushed`, `ambushers` — Mirror pair.
- **pursuit-pair:** `pursued`, `pursuers` — Mirror pair.
- **duel-family:** `duel`, `epic-duel`, `quickdraw` — Duel variants.
- **tavern-brawl:** `local-tavern`, `resting-dagger-inn`, `teal-heart-inn`, `the-squealing-boar-tavern-brawl` — Tavern family, different books.
- **neverhome:** `neverhome-corridors`, `neverhome-library`, `shatter-the-heart` — One manor, three rooms (also a region).

`underground-chasm` / `demonic-abyss` have **identical feature sets**; this is the one true duplicate pair. `masquerade-ball` and `masquerade-ball-atlas` have the same name; `time-loop` pair likewise (PD-075).

### How My Lists references environments

`state.envLists[envId] = [listId, …]` (key `dhcodex_env_lists`); `envsInList(listId)` returns catalogue environments in catalogue order. So a cover function receives environment *ids* and the catalogue and needs no change to persistence — a mapping keyed by id is directly usable.

## 4. Biome versus archetype

The primary biome is a poor predictor of the archetype:

| Primary biome | Environments | Distinct primary archetypes | Most common outcomes |
| --- | --- | --- | --- |
| settlement | 111 | 19 | streets-and-towns 11, feasts-and-revelry 11, arcane-sanctums 10, intrigue-and-underworld 9 |
| universal | 53 | 14 | planar-rifts 9, storms-and-calamity 8, time-and-dream 5, starfaring 5 |
| underground | 35 | 9 | (fallback) 8, dungeon-delves 7, monster-lairs 7, crypts-and-tombs 6 |
| forest | 30 | 9 | fey-and-enchanted 10, sinister-woods 7, cursed-and-blighted-lands 5, storms-and-calamity 2 |
| aquatic | 18 | 5 | drowned-depths 9, seafaring 5, perilous-passages 2, haunted-and-deathly 1 |
| wetland | 13 | 3 | blighted-mires 9, time-and-dream 2, forgotten-ruins 2 |
| badlands | 13 | 7 | cursed-and-blighted-lands 5, forgotten-ruins 3, (fallback) 1, monster-lairs 1 |
| drylands | 12 | 5 | (fallback) 7, chase-and-ambush 2, infernal-and-profane 1, starfaring 1 |
| mountain | 10 | 3 | perilous-passages 4, haunted-and-deathly 3, sky-realms 3 |
| tropical | 8 | 3 | (fallback) 6, forgotten-ruins 1, monster-lairs 1 |
| frozen | 7 | 5 | (fallback) 2, (ambiguous) 2, storms-and-calamity 1, perilous-passages 1 |
| rolling | 3 | 2 | haunted-and-deathly 2, forgotten-ruins 1 |
| grassland | 3 | 3 | sacred-sanctuaries 1, time-and-dream 1, (fallback) 1 |

`settlement` (111) spreads over at least 10 distinct archetypes: the harbour picture would be shown for a tavern, a cathedral, a thieves' guild and a starship alike. `universal` (53) is similar. On the other side, `wetland`, `aquatic`, `forest` are well characterised by their biome plus one or two archetypes.

## 5. Archetype taxonomy

28 archetypes, derived from the content. Two classes sit alongside: `plain-terrain` (biome picture is right) and `abstract-event` (no setting to draw). Counts are *primary* assignments; the last column counts additional environments that carry the archetype as a *secondary* theme.

| # | Archetype id | Name | Primary | % | High / Moderate | As secondary |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `haunted-and-deathly` | Haunted & Deathly Places | 18 | 5.7% | 8 / 10 | 10 |
| 2 | `forgotten-ruins` | Forgotten & Ancient Ruins | 15 | 4.7% | 7 / 8 | 7 |
| 3 | `starfaring` | Starfaring & Space Opera | 14 | 4.4% | 8 / 6 | 3 |
| 4 | `infernal-and-profane` | Infernal & Profane | 13 | 4.1% | 9 / 4 | 5 |
| 5 | `planar-rifts` | Planar Rifts & Shattered Reality | 12 | 3.8% | 8 / 4 | 16 |
| 6 | `storms-and-calamity` | Storms, Fire & Natural Calamity | 12 | 3.8% | 9 / 3 | 4 |
| 7 | `cursed-and-blighted-lands` | Cursed & Blighted Lands | 11 | 3.5% | 8 / 3 | 4 |
| 8 | `feasts-and-revelry` | Feasts, Festivals & Galas | 11 | 3.5% | 7 / 4 | 2 |
| 9 | `streets-and-towns` | Towns, Streets & Markets | 11 | 3.5% | 6 / 5 | 21 |
| 10 | `arcane-sanctums` | Arcane Towers & Laboratories | 10 | 3.2% | 6 / 4 | 10 |
| 11 | `fey-and-enchanted` | Fey Realms & Enchanted Glades | 10 | 3.2% | 8 / 2 | 8 |
| 12 | `monster-lairs` | Monster Lairs, Hives & Nests | 10 | 3.2% | 6 / 4 | 14 |
| 13 | `sacred-sanctuaries` | Sacred Sanctuaries & Divine Places | 10 | 3.2% | 5 / 5 | 11 |
| 14 | `strongholds-and-sieges` | Strongholds, Sieges & Skirmishes | 10 | 3.2% | 4 / 6 | 8 |
| 15 | `arenas-and-duels` | Arenas, Duels & Contests | 9 | 2.8% | 7 / 2 | 2 |
| 16 | `blighted-mires` | Blighted Swamps & Mires | 9 | 2.8% | 6 / 3 | 3 |
| 17 | `chase-and-ambush` | Chases, Pursuit & Ambush | 9 | 2.8% | 4 / 5 | 15 |
| 18 | `drowned-depths` | Drowned Depths & Sunken Places | 9 | 2.8% | 5 / 4 | 2 |
| 19 | `intrigue-and-underworld` | Intrigue, Courts & Underworld | 9 | 2.8% | 7 / 2 | 11 |
| 20 | `time-and-dream` | Time Anomalies & Dreamscapes | 9 | 2.8% | 6 / 3 | 6 |
| 21 | `archives-and-libraries` | Libraries, Archives & Museums | 7 | 2.2% | 5 / 2 | 2 |
| 22 | `dungeon-delves` | Dungeons & Labyrinths | 7 | 2.2% | 4 / 3 | 8 |
| 23 | `perilous-passages` | Perilous Passages & Crossings | 7 | 2.2% | 6 / 1 | 2 |
| 24 | `seafaring` | Seafaring, Ports & Open Water | 7 | 2.2% | 3 / 4 | 2 |
| 25 | `sinister-woods` | Sinister Woods & Hag Haunts | 7 | 2.2% | 6 / 1 | 8 |
| 26 | `taverns-and-inns` | Taverns & Inns | 7 | 2.2% | 7 / 0 | 1 |
| 27 | `crypts-and-tombs` | Crypts, Tombs & Catacombs | 6 | 1.9% | 6 / 0 | 6 |
| 28 | `sky-realms` | Sky Realms & Floating Lands | 5 | 1.6% | 3 / 2 | 3 |

Fallback classes: plain-terrain 26 (8.2%), abstract-event 4 (1.3%), ambiguous 12 (3.8%).

Dimensions that actually separated the data (and the ones that did not):

- **Mattered:** civilization vs wilderness (towns, strongholds vs. woods, lairs); sacred vs corrupted (sacred-sanctuaries vs infernal-and-profane, fey vs sinister woods); alive vs dead/haunted; ruined vs intact (ruins vs towers/temples); above/below ground (sky-realms, dungeon-delves, drowned-depths); natural vs planar/temporal; and "event as setting" (chase, duel, festival).
- **Did not matter on their own:** tier, type, peaceful vs hostile (nearly every environment is a GM tool for danger), and magical vs mundane (it cuts across other axes and works as a *tag*).
- **Merge candidates if the library must be smaller:** haunted-and-deathly + crypts-and-tombs (24); streets-and-towns + taverns-and-inns + feasts-and-revelry (29); sinister-woods + fey-and-enchanted (17); infernal-and-profane + sacred-sanctuaries (23); cursed-and-blighted-lands + blighted-mires (20); chase-and-ambush + strongholds-and-sieges (19). Each merge costs relevance but saves one picture.
- **Split candidates beyond 28:** haunted-and-deathly (graveyard / gothic castle / afterlife), monster-lairs (dragon hoard / hive / web), planar-rifts (breach / chaos realm / metropolis of portals), streets-and-towns (city / village / frontier).

### Archetype definitions

### `haunted-and-deathly` — Haunted & Deathly Places
Places where the dead linger: graveyards, haunted houses and cities, gothic castles, the land of the dead.

- **Count:** 18 (5.7%), 8 high / 10 moderate; also a secondary theme on 10 more.
- **Visual definition:** Night or fog; cold desaturated blues and greys broken by one sickly lantern or will-o-wisp glow; leaning headstones, a gothic silhouette, dead trees.
- **Include:** Ghosts, restless dead, cursed or possessed buildings, gothic vampire seats, afterlife landscapes (River Styx, still dead water).
- **Exclude:** Burial architecture with no haunting (crypts-and-tombs); hell and demons (infernal-and-profane).
- **Representative:** Bubbly’s Bottom, Abandoned Building, Haunted Oratorium, Cursed Graveyard
- **Overlaps with:** infernal-and-profane (3), archives-and-libraries (3), forgotten-ruins (3), arcane-sanctums (2)
- **Artwork direction:** Moonlit overgrown cemetery and a ruined gothic manor beyond it, ground fog, one cold green lantern, ghostly figures barely readable.
- **Existing art:** `img/journey2/headers/wetland.webp` — weak. Mist and gloom exist in the wetland art, but it is a sunlit swamp, not a night-time gothic scene.

### `forgotten-ruins` — Forgotten & Ancient Ruins
Abandoned castles, temples, cities and monuments of vanished civilizations, reclaimed by nature or time.

- **Count:** 15 (4.7%), 7 high / 8 moderate; also a secondary theme on 7 more.
- **Visual definition:** Weathered stone architecture in decay; moss, roots and vines; warm shafts of light; sense of scale and age.
- **Include:** Ruined castles and towers, lost cities and villages, overgrown temples, standing stones, titan remains.
- **Exclude:** Ruins that are actively haunted (haunted-and-deathly); sunken ruins (drowned-depths); intact arcane towers (arcane-sanctums).
- **Representative:** Abandoned Grove, Forgotten Temple of the Serpent, Ancient City, Moon Kingdom
- **Overlaps with:** haunted-and-deathly (3), sacred-sanctuaries (2), time-and-dream (2), arcane-sanctums (2)
- **Artwork direction:** Colossal overgrown temple facade half swallowed by ancient trees, light shafts through canopy, tiny explorers for scale.
- **Existing art:** `img/env/field-of-dreams.jpg` — partial. Standing stones and a ruined arch appear, but the focal point is a flower field and it belongs to one environment.

### `starfaring` — Starfaring & Space Opera
Warships, orbital blockades, space bars and command centers of the StarHeart / Sovereignty setting.

- **Count:** 14 (4.4%), 8 high / 6 moderate; also a secondary theme on 3 more.
- **Visual definition:** Metal corridors, viewports onto nebulae or planets, hard rim light, cold blue and amber.
- **Include:** Capital ships, Sovereignty bases and outposts, space chases, planetary invasion, command centers.
- **Exclude:** Magical moon or planar scenes (planar-rifts).
- **Representative:** Planetary Blockade, Capital Ship Assault, Planetary Invasion, Sovereignty Entanglements
- **Overlaps with:** intrigue-and-underworld (4), chase-and-ambush (2), strongholds-and-sieges (2), forgotten-ruins (1)
- **Artwork direction:** Imperial warship hangar or bridge with a viewport onto a gas giant under fire, small crew silhouettes.
- **Existing art:** `img/journey2/void-nebula.webp` — weak. A nebula backdrop only; no ships, architecture or focal point.

### `infernal-and-profane` — Infernal & Profane
Hell's cities and thrones, desecrated shrines, cult rituals and demonic chasms.

- **Count:** 13 (4.1%), 9 high / 4 moderate; also a secondary theme on 5 more.
- **Visual definition:** Ash, iron and ember light; chains, brimstone, black stone; sickly green or crimson fire.
- **Include:** Circles Below locations, demonic pits, cult rituals, corrupted temples, god-slaying rites.
- **Exclude:** Plain volcanic terrain (plain-terrain / badlands art); undead graveyards (haunted-and-deathly).
- **Representative:** Cult Ritual, Circles Below: Dis, Fallen Citadel, Darkened Temple
- **Overlaps with:** sacred-sanctuaries (4), haunted-and-deathly (3), monster-lairs (2), strongholds-and-sieges (2)
- **Artwork direction:** Hell-city of iron bars and chained towers under a burning ash sky, a tiny procession of damned souls on a bridge.
- **Existing art:** `img/journey2/headers/badlands.webp` — partial. Red lava palette matches, but it is open volcanic terrain with no architecture, chains or ritual focal point.

### `planar-rifts` — Planar Rifts & Shattered Reality
Portals, chaos realms, astral and extradimensional spaces, broken reality.

- **Count:** 12 (3.8%), 8 high / 4 moderate; also a secondary theme on 16 more.
- **Visual definition:** Impossible geometry, cracked ground over starfields, violet and cyan light, floating debris.
- **Include:** Portals, planar incursions, astral and chaos realms, shattered lands, metropolises at a nexus of realms.
- **Exclude:** Time loops and dreams (time-and-dream); space-opera ships (starfaring).
- **Representative:** Portal Beyond, Astral Realm, Chaos Realm, Extraplanar Breach
- **Overlaps with:** cursed-and-blighted-lands (3), storms-and-calamity (2), time-and-dream (2), streets-and-towns (2)
- **Artwork direction:** A tear in a stone plateau opening onto a violet nebula, floating rock shards, a small party at the rim.
- **Existing art:** `img/biome-artwork-source/fully-shadowblighted.png` — strong. Cracked terrain falling away into a purple galaxy. Already the right idea; 2048x768 so it needs a wide crop.

### `storms-and-calamity` — Storms, Fire & Natural Calamity
Weather and disaster as the main event: storms, tornadoes, wildfire, eruption, stampede.

- **Count:** 12 (3.8%), 9 high / 3 moderate; also a secondary theme on 4 more.
- **Visual definition:** Dramatic sky, hard directional light, motion blur of wind and rain, tiny human figures against a huge force.
- **Include:** Thunderstorms, megastorms, magical storms, wildfires, volcanic eruptions, blizzards, stampedes.
- **Exclude:** Time-glitch storms (time-and-dream); settlements merely under siege.
- **Representative:** Raging Fire, Forest Wildfire, Megastorm, Green Doom Skies
- **Overlaps with:** sky-realms (2), planar-rifts (2), time-and-dream (1), fey-and-enchanted (1)
- **Artwork direction:** A tornado and thunderhead over a farmland valley, crimson lightning, wind-bent grass, a lone road.
- **Existing art:** `img/journey2/headers/badlands.webp` — weak. Fire sky only; no weather event.

### `cursed-and-blighted-lands` — Cursed & Blighted Lands
Natural land corrupted by magic, necromancy or cosmic debris.

- **Count:** 11 (3.5%), 8 high / 3 moderate; also a secondary theme on 4 more.
- **Visual definition:** Sickly green and violet palette, twisted vegetation, dead earth, unnatural glow.
- **Include:** Devouring Green, cursed valleys, anti-life scars, meteoric corruption, slime forests.
- **Exclude:** Swamps (blighted-mires); just spooky woods with a witch (sinister-woods).
- **Representative:** Cursed Valley, Burning Heart of the Woods, Green Doom Tangle, The Devouring Green
- **Overlaps with:** sinister-woods (3), planar-rifts (3), infernal-and-profane (1), monster-lairs (1)
- **Artwork direction:** A once-green valley devoured by glowing violet-green blight, bone-white trees, a cracked road leading to a distant obelisk.
- **Existing art:** `img/journey2/headers/forest.webp` — weak. A healthy golden forest; wrong palette and mood.

### `feasts-and-revelry` — Feasts, Festivals & Galas
Celebrations, banquets, masked balls and casinos; social occasions as the setting.

- **Count:** 11 (3.5%), 7 high / 4 moderate; also a secondary theme on 2 more.
- **Visual definition:** Candle and chandelier light, long tables, masks, silk and gold, warm crimson and amber.
- **Include:** Feasts, festivals, balls, casinos, dinners and fey revels.
- **Exclude:** Taverns (taverns-and-inns); crime and courts (intrigue-and-underworld).
- **Representative:** Grand Feast, City Festival, Masquerade Ball, Local Festival
- **Overlaps with:** intrigue-and-underworld (5), seafaring (1), strongholds-and-sieges (1), sacred-sanctuaries (1)
- **Artwork direction:** A vaulted ballroom of masked guests under chandeliers, one masked figure turned toward the viewer, a long laden table.
- **Existing art:** none

### `streets-and-towns` — Towns, Streets & Markets
Lived-in settlements: streets, marketplaces, villages, frontier towns.

- **Count:** 11 (3.5%), 6 high / 5 moderate; also a secondary theme on 21 more.
- **Visual definition:** Crowded lanes, lantern light, rooftops, stalls, banners; warm and busy.
- **Include:** Cities, markets, villages, base-camp towns, street scenes.
- **Exclude:** Interiors like taverns (taverns-and-inns); festivals (feasts-and-revelry); abandoned cities (forgotten-ruins).
- **Representative:** Bustling Marketplace, Emberwood Village, City Streets, Jungle River Village
- **Overlaps with:** chase-and-ambush (4), arcane-sanctums (3), strongholds-and-sieges (3), intrigue-and-underworld (2)
- **Artwork direction:** Dusk market street of a walled town, lantern strings, crowds, rooftops under a violet sky.
- **Existing art:** `img/journey2/headers/settlement.webp` — strong. A harbour town at sunset with lit windows; good for cities, weaker for forest villages and street-level scenes.

### `arcane-sanctums` — Arcane Towers & Laboratories
Wizard towers, laboratories, observatories and magic shops.

- **Count:** 10 (3.2%), 6 high / 4 moderate; also a secondary theme on 10 more.
- **Visual definition:** Tall towers, glowing apparatus, floating books and instruments, teal and violet light.
- **Include:** Archmage towers, laboratories, workshops, observatories, magic shops, magical metropolises.
- **Exclude:** Libraries (archives-and-libraries); ruined towers (forgotten-ruins).
- **Representative:** Alchemist’s Abandoned Workshop, Arcane Laboratory, Laboratory, Arcanist’s Laboratory
- **Overlaps with:** streets-and-towns (3), haunted-and-deathly (2), planar-rifts (2), forgotten-ruins (2)
- **Artwork direction:** A spiral wizard tower crowned with a crackling arcane beacon, lit laboratory windows, floating instruments around it.
- **Existing art:** none

### `fey-and-enchanted` — Fey Realms & Enchanted Glades
Whimsical, dangerous fae courts, wishing glades and story trees.

- **Count:** 10 (3.2%), 8 high / 2 moderate; also a secondary theme on 8 more.
- **Visual definition:** Luminous purple-blue lights, impossible blossoms, glowing standing stones, dreamlike colour.
- **Include:** Fey courts, faerie portals, enchanted groves, fae revels, sentient trees.
- **Exclude:** Hag woods (sinister-woods); blight (cursed-and-blighted-lands).
- **Representative:** Faestone Wode, Dark Forest Faerie Portal, Court of Cats, Dark Forest Revel
- **Overlaps with:** sinister-woods (5), sacred-sanctuaries (2), time-and-dream (2), storms-and-calamity (1)
- **Artwork direction:** A moonlit glade of glowing purple blossoms and standing stones, fae lights drifting, a path of mushrooms.
- **Existing art:** `img/env/field-of-dreams.jpg` — strong. Pastel flowers, glowing stones and ghostly lights. Tied to one environment but the style is exactly right; Cauldera Valley adds a purple fantasy valley.

### `monster-lairs` — Monster Lairs, Hives & Nests
Creature homes: dragon hoards, spider webs, insect hives, acid warrens.

- **Count:** 10 (3.2%), 6 high / 4 moderate; also a secondary theme on 14 more.
- **Visual definition:** Organic tunnels, hoards, egg clusters, bones; claustrophobic scale; sickly or fiery light.
- **Include:** Dragon lairs, hives, webbed terrain, burrows, aeries, creature interiors.
- **Exclude:** Man-made dungeons (dungeon-delves); sunken monster cities (drowned-depths).
- **Representative:** Acid Burrows, Escape The Swarm, Dragon’s Lair, Thrumming Hives
- **Overlaps with:** infernal-and-profane (2), dungeon-delves (2), drowned-depths (2), seafaring (2)
- **Artwork direction:** A dragon hoard cavern inside a volcano, mountain of gold, a vast eye opening in the dark.
- **Existing art:** `img/journey2/headers/underground.webp` — weak. Glowing-crystal mine; no creature.

### `sacred-sanctuaries` — Sacred Sanctuaries & Divine Places
Temples, altars, cathedrals, shrines and divine encounters.

- **Count:** 10 (3.2%), 5 high / 5 moderate; also a secondary theme on 11 more.
- **Visual definition:** Soaring stone, shafts of golden light, incense, quiet reverence.
- **Include:** Healing temples, cathedrals, altars, zen gardens, chapels, divine audiences.
- **Exclude:** Corrupted holy sites (infernal-and-profane).
- **Representative:** Garden of the Tranquil Order, Chapel of St. Brenna, Hallowed Cathedral, Hallowed Temple
- **Overlaps with:** infernal-and-profane (4), crypts-and-tombs (3), forgotten-ruins (2), fey-and-enchanted (2)
- **Artwork direction:** Interior of a luminous cathedral nave with a single beam of light on an altar, tiny pilgrims.
- **Existing art:** none

### `strongholds-and-sieges` — Strongholds, Sieges & Skirmishes
Fortresses, sieges, raids and defensive stands; places to be held or taken.

- **Count:** 10 (3.2%), 4 high / 6 moderate; also a secondary theme on 8 more.
- **Visual definition:** Walls, banners, siege engines, smoke, torchlight and steel.
- **Include:** Fortresses, sieges, raids, bandit hideouts, wall bastions, pitched battles.
- **Exclude:** Pure chases (chase-and-ambush).
- **Representative:** Bastion, Castle Siege, Fortress, Defense of the River-Fort
- **Overlaps with:** chase-and-ambush (3), streets-and-towns (3), starfaring (2), infernal-and-profane (2)
- **Artwork direction:** A river-fort wall at dusk under assault, torches, ladders, a defender on the parapet.
- **Existing art:** none

### `arenas-and-duels` — Arenas, Duels & Contests
Duels, fighting pits, races and contests before an audience.

- **Count:** 9 (2.8%), 7 high / 2 moderate; also a secondary theme on 2 more.
- **Visual definition:** Sand ring, crowd tiers, spotlight, dust.
- **Include:** Duels, fighting pits, racetracks, obstacle courses, tavern brawls (secondary).
- **Exclude:** Battles (strongholds-and-sieges).
- **Representative:** Fighting Arena, Deathrace, The Proving Pyre, Duel
- **Overlaps with:** chase-and-ambush (3), storms-and-calamity (1), taverns-and-inns (1)
- **Artwork direction:** Sunlit fighting arena with a roaring crowd and two small fighters, dust in the air.
- **Existing art:** none

### `blighted-mires` — Blighted Swamps & Mires
Swamps and marshes that are corrupted, poisonous or sentient.

- **Count:** 9 (2.8%), 6 high / 3 moderate; also a secondary theme on 3 more.
- **Visual definition:** Black water, sickly red or green mist, rotting cypress, drowned ruins.
- **Include:** Corrupted swamps, blood marsh, mires, sentient ink marsh.
- **Exclude:** Neutral wetlands (plain-terrain).
- **Representative:** Beelzebufo Bog, Blood Marsh, Dread Mire, Corrupted Swamp
- **Overlaps with:** streets-and-towns (1), haunted-and-deathly (1), infernal-and-profane (1), time-and-dream (1)
- **Artwork direction:** A blood-red mire at dusk with half-drowned standing stones and floating wisps.
- **Existing art:** `img/journey2/headers/wetland.webp` — partial. A misty cypress swamp is a good base; lacks the blight and corruption these environments hinge on.

### `chase-and-ambush` — Chases, Pursuit & Ambush
Scenes defined by motion and surprise: chases, ambushes, escapes.

- **Count:** 9 (2.8%), 4 high / 5 moderate; also a secondary theme on 15 more.
- **Visual definition:** Motion, dust, rooftops, diagonal compositions.
- **Include:** Street and rooftop chases, pursuit, ambushes, train chase.
- **Exclude:** Races for sport (arenas-and-duels).
- **Representative:** Bankburgh Chase, Mounted Train Chase, Rooftop Chase, Street Chase
- **Overlaps with:** streets-and-towns (4), arenas-and-duels (3), strongholds-and-sieges (3), monster-lairs (2)
- **Artwork direction:** A rooftop chase at dusk: figures sprinting across tiles, a gap ahead, lanterns blurring.
- **Existing art:** none

### `drowned-depths` — Drowned Depths & Sunken Places
Underwater and flooded settings: sunken citadels, trenches, the Umbral Sea.

- **Count:** 9 (2.8%), 5 high / 4 moderate; also a secondary theme on 2 more.
- **Visual definition:** Shafts of light through deep teal, drifting silt, coral and ruin silhouettes.
- **Include:** Sunken ruins, undersea cities, dark seas, trenches, rift baths.
- **Exclude:** Ships and open water (seafaring).
- **Representative:** Undersea Trench, Drowned Sanctum, Deep One City, Fathomless Baths - Deeps
- **Overlaps with:** monster-lairs (2), planar-rifts (2), forgotten-ruins (1), haunted-and-deathly (1)
- **Artwork direction:** A sunken citadel in the deep, sunbeams on columned ruins, a giant shadow gliding above.
- **Existing art:** none

### `intrigue-and-underworld` — Intrigue, Courts & Underworld
Heists, thieves' guilds, courts, murder mysteries and criminal dens.

- **Count:** 9 (2.8%), 7 high / 2 moderate; also a secondary theme on 11 more.
- **Visual definition:** Candlelit stone, shadowy alleys, vault doors, chessboard tension.
- **Include:** Heists, guilds, gangs, courts, murder mystery, undermarkets.
- **Exclude:** Parties (feasts-and-revelry).
- **Representative:** Gang Hideout, Corrupt Court, Bank Heist, Imperial Court
- **Overlaps with:** feasts-and-revelry (5), starfaring (4), streets-and-towns (2), time-and-dream (1)
- **Artwork direction:** A candlelit vaulted vault-room with a masked cabal around a table and a single ledger.
- **Existing art:** none

### `time-and-dream` — Time Anomalies & Dreamscapes
Loops, glitching time, prophetic dreams, surreal dream cities.

- **Count:** 9 (2.8%), 6 high / 3 moderate; also a secondary theme on 6 more.
- **Visual definition:** Clockwork motifs, duplicated figures, soft dream light, impossible architecture.
- **Include:** Time loops, chronon pools, time courts, dreamlands, nightmares.
- **Exclude:** General planar breaches (planar-rifts).
- **Representative:** Chronon Pools, Dreamlands, Flickerstorm, Prophetic Nightmare
- **Overlaps with:** forgotten-ruins (2), planar-rifts (2), fey-and-enchanted (2), streets-and-towns (1)
- **Artwork direction:** A stone courtyard in which one sunset repeats along a ring of sundials, motion-trailed travelers.
- **Existing art:** `img/env/ouroborean-pass.jpg` — partial. A looping road with travelers; strong for loops but tied to one environment.

### `archives-and-libraries` — Libraries, Archives & Museums
Repositories of knowledge, often dangerous.

- **Count:** 7 (2.2%), 5 high / 2 moderate; also a secondary theme on 2 more.
- **Visual definition:** Towering shelves, floating books, ink, dust motes.
- **Include:** Libraries, archives, museums, scholar demiplanes.
- **Exclude:** Arcane towers (arcane-sanctums).
- **Representative:** The Civic Library, Neverhome Library, Library of the Dusk Tree, The Waking Archives
- **Overlaps with:** haunted-and-deathly (3), planar-rifts (2), streets-and-towns (1), crypts-and-tombs (1)
- **Artwork direction:** A vast library hall with floating books and a reading desk under a dome of light.
- **Existing art:** none

### `dungeon-delves` — Dungeons & Labyrinths
Man-made underground complexes of traps, guards and treasure.

- **Count:** 7 (2.2%), 4 high / 3 moderate; also a secondary theme on 8 more.
- **Visual definition:** Torchlit stone corridors, doors, pits.
- **Include:** Dungeons, labyrinths, prisons, trap corridors.
- **Exclude:** Natural caves and mines (plain-terrain).
- **Representative:** Chthon Verlies, Scorching Dungeon, Dangerous Dungeon, Deadly Dungeon
- **Overlaps with:** monster-lairs (2), arcane-sanctums (1), haunted-and-deathly (1), streets-and-towns (1)
- **Artwork direction:** A torchlit dungeon corridor with a pit trap and a locked iron door.
- **Existing art:** `img/journey2/headers/underground.webp` — partial. A mine with rails; no corridors or traps.

### `perilous-passages` — Perilous Passages & Crossings
Rivers, cliffs, passes and thin ice as obstacles to traverse.

- **Count:** 7 (2.2%), 6 high / 1 moderate; also a secondary theme on 2 more.
- **Visual definition:** Narrow ledge or ford, vertigo, mist, small figures.
- **Include:** Rivers, cliffs, mountain passes, frozen lakes.
- **Exclude:** Generic mountain terrain (plain-terrain).
- **Representative:** Cliffside Ascent, Mountain Pass, Perilous Cliff, Frozen Lake
- **Overlaps with:** haunted-and-deathly (1), time-and-dream (1), sky-realms (1)
- **Artwork direction:** A party on a rope bridge over a misty gorge at dawn.
- **Existing art:** `img/journey2/headers/mountain.webp` — strong. Peaks above clouds with a path; fine for passes and cliffs.

### `seafaring` — Seafaring, Ports & Open Water
Ships, voyages, harbours and sea monsters.

- **Count:** 7 (2.2%), 3 high / 4 moderate; also a secondary theme on 2 more.
- **Visual definition:** Sails, swells, harbour towns, storm light.
- **Include:** Ocean voyages, port cities, shipwrecks, lakes with sea monsters, pirates.
- **Exclude:** Underwater (drowned-depths).
- **Representative:** Ocean Voyage, Terror of the Deep, Port City
- **Overlaps with:** monster-lairs (2), streets-and-towns (1), strongholds-and-sieges (1), feasts-and-revelry (1)
- **Artwork direction:** A galleon cresting a swell as a tentacle rises, storm light on the sails.
- **Existing art:** `img/journey2/headers/aquatic.webp` — partial. A tropical lagoon with a sailboat; calm, not a voyage.

### `sinister-woods` — Sinister Woods & Hag Haunts
Menacing forests, witches and hags, twisted trees.

- **Count:** 7 (2.2%), 6 high / 1 moderate; also a secondary theme on 8 more.
- **Visual definition:** Dark canopy, brambles, twisted trunks, a single warm window.
- **Include:** Witch huts, hag woods, spooky forests, glens.
- **Exclude:** Fey glades (fey-and-enchanted); blight (cursed-and-blighted-lands).
- **Representative:** Gloaming Forest, Hag’s Hut, Gnarled Glen, Spooky Forest
- **Overlaps with:** fey-and-enchanted (5), cursed-and-blighted-lands (3), forgotten-ruins (1), strongholds-and-sieges (1)
- **Artwork direction:** A hut on chicken legs deep in twisted woods, a warm window, bramble walls.
- **Existing art:** `img/journey2/headers/forest.webp` — partial. Forest base but golden and benign.

### `taverns-and-inns` — Taverns & Inns
Warm social interiors: taverns, inns, speakeasies.

- **Count:** 7 (2.2%), 7 high / 0 moderate; also a secondary theme on 1 more.
- **Visual definition:** Hearth, timber, mugs, lantern glow.
- **Include:** Taverns, inns, speakeasies, brawls.
- **Exclude:** Feasts (feasts-and-revelry).
- **Representative:** Jazz Speakeasy, The Dungeoneer, Local Tavern, Resting Dagger Inn
- **Overlaps with:** streets-and-towns (1), monster-lairs (1), intrigue-and-underworld (1), planar-rifts (1)
- **Artwork direction:** A crowded timber tavern at night, hearth fire, a mysterious stranger in the corner.
- **Existing art:** none

### `crypts-and-tombs` — Crypts, Tombs & Catacombs
Burial architecture: tombs, catacombs, ossuaries.

- **Count:** 6 (1.9%), 6 high / 0 moderate; also a secondary theme on 6 more.
- **Visual definition:** Bones, sarcophagi, candle niches, cold stone.
- **Include:** Tombs, catacombs, ossuaries, crypts.
- **Exclude:** Haunted graveyards (haunted-and-deathly).
- **Representative:** Endless Catacombs, Catacomb Tunnels, Ancient Tomb, Necromancer’s Ossuary
- **Overlaps with:** sacred-sanctuaries (3), haunted-and-deathly (2), archives-and-libraries (1), forgotten-ruins (1)
- **Artwork direction:** A catacomb hall of bone-walled niches and a sarcophagus lit by a single candle.
- **Existing art:** `img/journey2/headers/underground.webp` — weak. A glowing mine, not funerary.

### `sky-realms` — Sky Realms & Floating Lands
Floating mountains, sky ruins, cloud castles and skyships.

- **Count:** 5 (1.6%), 3 high / 2 moderate; also a secondary theme on 3 more.
- **Visual definition:** Floating islands, vine bridges, clouds, golden light.
- **Include:** Floating mountains, cloud realms, aerial platforms.
- **Exclude:** Ground mountains (plain-terrain).
- **Representative:** Lion Ascendant, Floating Mountains, Stones Adrift
- **Overlaps with:** storms-and-calamity (2), monster-lairs (1), seafaring (1), streets-and-towns (1)
- **Artwork direction:** Floating mountains linked by vine bridges, a skyship passing, golden cloud sea.
- **Existing art:** `img/journey2/headers/mountain.webp` — partial. Peaks above clouds, but ground-bound.


## 6. Ambiguity and fallbacks

**Ambiguous (12, primary = null).** The description supports several archetypes equally, or the record is unique with no recurring family:

| Id | Name | Candidates | Why |
| --- | --- | --- | --- |
| `tower-of-slime` | Tower of Slime | arcane-sanctums, monster-lairs | Tower made of dripping slime with slime people; no recurring visual family fits |
| `body` | Body | monster-lairs, planar-rifts | Inside a living body; no recurring visual family |
| `lunar-surface` | Lunar Surface | starfaring, planar-rifts | Surface of the moon; neither fantasy-terrain nor starship interior |
| `boreal-glacier` | Boreal Glacier | sacred-sanctuaries, plain-terrain | Ancient tree growing on a font of icy power; sacred and terrain both plausible |
| `the-endless-song` | The Endless Song | dungeon-delves, arcane-sanctums | Subterranean complex ringing with echoing voices; no recurring family |
| `waterfalls-of-light-and-dark` | Waterfalls Of Light & Dark | plain-terrain, planar-rifts | Waterfall of life energy falling into a pit of aging |
| `almara-forest` | Almara Forest | plain-terrain, monster-lairs | Boreal forest on a colossal spider; unique but no family |
| `root-rush-rescue` | Root Rush Rescue | chase-and-ambush, plain-terrain | No lore; features hint at a race against time in a forest |
| `keep-away` | Keep-Away | chase-and-ambush | Keeping a tiara from the party mid-fight; no place |
| `the-garage` | The Garage | arcane-sanctums, intrigue-and-underworld | Workshop-prison mega-structure; mixed |
| `digestive-tract` | Digestive Tract | monster-lairs | Interior of a giant beast; no family |
| `frozen-chalice` | Frozen Chalice | plain-terrain, arenas-and-duels | Frozen crucible and battlefield |

**Abstract events (4):** setting-neutral records for which any picture would be invented:

- `midnight-monstrosity` (Midnight Monstrosity): Meeting with fleeing travelers; event with no place
- `the-ritual-of-renewal` (The Ritual of Renewal): No lore; ritual event with no setting
- `perilous-journey` (Perilous Journey): Dangerous trek with no place
- `road-blockade` (Road Blockade): Fallen tree or cart blocking a road

**Plain terrain (26).** The biome painting is the correct cover; an archetype image would add nothing. By picture shown:

- **underground** (8): Dripping Caverns, Abandoned Mine, Alcon Maw, Aetherstone Grove, Divert The River, Deep Underground Cave, Industrial Mine, Hydrothermal Caverns
- **drylands** (7): Harsh Desert, Desert, Vast Desert, Yifang’s Blackened Sands, Droughtlands, Sand Sea, Burning Sands
- **tropical** (6): Jungle Path, Domain of Dinosaurs, Jungle Trek, Jungle, Prehistoric Valley, Deadly Jungle
- **frozen** (2): Arctic, Frosted Timber
- **badlands** (1): Crystal Wasteland
- **forest** (1): Endless Forest
- **grassland** (1): Overgrown Field

Together the three groups are 42 environments (13.3%) that should use biome or universal art. Another 100 are moderate: usable, but a cover should prefer a high-confidence member of a mixed list when choosing which three to show.

## 7. Coverage and diminishing returns

Archetypes are added in descending size. "Primary" = environments whose primary archetype is in the set. "High only" counts only high-confidence ones, a proxy for *meaningful* visual coverage. "Primary or secondary" counts any environment with a theme in the set (relevant to lists, where one tile can be chosen from any theme).

| Library size | Primary | % | High only | % | Primary or secondary | % |
| --- | --- | --- | --- | --- | --- | --- |
| 8 | 106 | 33.5% | 64 | 20.3% | 141 | 44.6% |
| 15 | 176 | 55.7% | 106 | 33.5% | 234 | 74.1% |
| 20 | 221 | 69.9% | 134 | 42.4% | 266 | 84.2% |
| 25 | 256 | 81% | 158 | 50% | 288 | 91.1% |
| 28 (whole taxonomy) | 274 | 86.7% | 174 | 55.1% | 295 | 93.4% |

Ranked increments (environments added → cumulative): 
1. haunted-and-deathly +18 → 18 (5.7%)  
2. forgotten-ruins +15 → 33 (10.4%)  
3. starfaring +14 → 47 (14.9%)  
4. infernal-and-profane +13 → 60 (19.0%)  
5. planar-rifts +12 → 72 (22.8%)  
6. storms-and-calamity +12 → 84 (26.6%)  
7. cursed-and-blighted-lands +11 → 95 (30.1%)  
8. feasts-and-revelry +11 → 106 (33.5%)  
9. streets-and-towns +11 → 117 (37.0%)  
10. arcane-sanctums +10 → 127 (40.2%)  
11. fey-and-enchanted +10 → 137 (43.4%)  
12. monster-lairs +10 → 147 (46.5%)  
13. sacred-sanctuaries +10 → 157 (49.7%)  
14. strongholds-and-sieges +10 → 167 (52.8%)  
15. arenas-and-duels +9 → 176 (55.7%)  
16. blighted-mires +9 → 185 (58.5%)  
17. chase-and-ambush +9 → 194 (61.4%)  
18. drowned-depths +9 → 203 (64.2%)  
19. intrigue-and-underworld +9 → 212 (67.1%)  
20. time-and-dream +9 → 221 (69.9%)  
21. archives-and-libraries +7 → 228 (72.2%)  
22. dungeon-delves +7 → 235 (74.4%)  
23. perilous-passages +7 → 242 (76.6%)  
24. seafaring +7 → 249 (78.8%)  
25. sinister-woods +7 → 256 (81.0%)  
26. taverns-and-inns +7 → 263 (83.2%)  
27. crypts-and-tombs +6 → 269 (85.1%)  
28. sky-realms +5 → 274 (86.7%)

**Reading the table.**

- *Taxonomy coverage* is not *artwork availability*: with 8 pictures, 106 environments (33.5%) have a label that has an image; the remaining 210 have a label with no image and fall back to biome art.
- *Meaningful visual coverage* is lower again: 20.3% at 8 pictures counting only high-confidence assignments, 33.5% at 15, 50% at 25.
- **The 40-picture target cannot be reached by this data.** The taxonomy saturates at 28; reaching 40 means splitting archetypes (see section 5), which improves *fit* within an archetype, not coverage. The gain from splits was not measured; it is a relevance gain, not new labelled environments.
- **Diminishing returns.** Average environments added per picture: ranks 1–8 add 13.3, ranks 9–15 add 10.0, ranks 16–25 add 8.0, ranks 26–28 add 6.0. The curve bends gently rather than breaking, so the knee is a judgement: **about 15–20 pictures (55.7–69.9% primary; 74.1–84.2% counting secondary themes)**; past 25 each picture serves 5–7 environments (under 2.5% of the catalogue each) while costing the same to produce.
- **Reuse changes the arithmetic.** Existing paintings already serve plain-terrain (26), and plausibly planar-rifts (12), streets-and-towns (11) and fey-and-enchanted (10): about 59 environments (18.7%). Adding abstract-event and ambiguous records (16), roughly **75 environments (23.7%) need no new picture**. Fifteen *new* pictures (the top 15 excluding the three reused archetypes: haunted, ruins, starfaring, infernal, storms, cursed lands, revelry, arcane, lairs, strongholds, sacred, mires, time-and-dream, drowned, arenas = 170 environments) plus reuse (33) and plain-terrain biome art (26) give an appropriate picture to **229 environments (72.5%)**, and 245 (77.5%) once fallbacks are counted.
- Counting secondary themes is what makes the system work for lists: with 8 archetypes, 141 environments (44.6%) offer at least one tile in the set; with 15, 234 (74.1%).

## 8. Existing artwork inventory

| Path | Purpose | Theme | Size | Wide cover | Three-panel crop | Duplication / note |
| --- | --- | --- | --- | --- | --- | --- |
| `img/env/{cauldera-valley,field-of-dreams,ouroborean-pass}.jpg` | Unique environment paintings (backdrop of the detail card, ENV_ART) | fey/lush valley; flower field with standing stones; looping road pass | 1536x1024 (3:2) | good, needs 16:9 crop (ENV_ART_FOCUS) | good | overlaps fey-and-enchanted, time-and-dream, perilous-passages |
| `img/env/thumb/*-{200,400,800}.avif, *-400.webp` | Thumbnail ladder already used by the current My Lists cover | same as above | 200x133, 400x267, 800x533 | 800w adequate to ~400 CSS px; higher-DPR single hero needs more | good | same |
| `img/biome-artwork-source/{Aquatic,Badlands,Drylands,Grassland,Mountain,Rolling,Tropical,Underground,Wetland}-h.png, forest_h.png, frozen-h.png, settlement-h.png` | Master 16:9 biome paintings (source for Journey headers); not shipped as-is (2.5-3 MB each) | 12 biomes (all but universal) | 1672x941 (16:9) | best master for cover cuts | good | archetype art must stay visibly different from these warm sunset scenes |
| `img/journey2/headers/{aquatic,badlands,drylands,forest,frozen,grassland,mountain,rolling,settlement,tropical,underground,wetland}.webp` | Journey Region Inspector headers (REGION_ART); shipped | 12 biomes | 960x540 (16:9), 104-155 KB | ready as biome fallback; low for a 2x hero (960 px) | good | this IS the biome fallback |
| `img/journey2/headers/fully-shadowblighted.webp (+ img/biome-artwork-source/fully-shadowblighted.png 2048x768)` | Overtaken-region header; cracked ground over a violet galaxy | planar rift / reality collapse | 1280x480 (8:3); source 2048x768 | wide crop only (not 16:9) | works, central galaxy crop | covers planar-rifts |
| `img/journey2/void-nebula.webp` | Nebula cosmos behind torn Journey map | abstract cosmos | 1672x941 | texture only (no focal point) | poor on its own | could back planar-rifts / starfaring compositions |
| `img/biomes/{biome}-{200.webp,300.avif}, universal-*` | Vertical card-art strips (1:3), 13 incl. universal | biomes | 200x600, 300x900 | unsuitable (portrait) | unsuitable | universal exists only here; no 16:9 universal painting exists |
| `img/biomes src/*.png` | Portrait masters 1024x1536 of the vertical strips (incl. universal.png) | 13 biomes | 1024x1536 | could be recropped but low resolution for 16:9 | weak | - |
| `img/journey2/valloren-world.webp / -light.webp` | Journey world map | map | 4848x3185 / 2424x1593 | a cropped map is a cartographic cover, not a scene | - | - |
| `img/ui/catalog-atlas-background.webp` | Catalogue page background texture | atlas parchment | 1024x1024 | texture for a manuscript-style cover | - | - |
| `img/og-card.jpg` | Link-preview card (forest artwork + title) | forest | 1200x630 | text baked in; unsuitable | - | - |
| `img/adv_fallback.png, img/ui/section-*.png, img/bacchus-atlas-table-icons/*` | Icons and adversary fallback | UI | 64-1254 px | not covers | - | - |

Notes:

- The **current cover tile is 90 px tall** and a card column is ≤ 320 px, so a single picture shows a ~3.6:1 strip (the middle 50% of a 16:9 image's height); two tiles show ≈ 1.8:1 (almost the whole image); three tiles show ≈ 1.2:1 (the middle ~67% of the width). New art must hold up in all three.
- The Journey headers (960×540) are the shipped, optimised 16:9 version of the biome paintings; the 1672×941 sources are 2.5–3 MB and are not what the site serves.
- All existing biome art is **warm, saturated, sunset-lit**. A list made of biome fallbacks looks uniformly golden; archetype art is the chance to add night, storm, interior and underwater palettes.
- The three unique paintings are 3:2, not 16:9.
- Pilot archetypes that existing art already serves adequately: **planar-rifts** (fully-shadowblighted art) and **fey-and-enchanted** (two unique paintings, though both belong to a single environment each); **streets-and-towns** (settlement harbour) is adequate for cities, thin for markets and villages. These are excluded from the pilot.

## 9. Selection hierarchy and its tradeoffs

Default: **unique environment art → archetype art → biome art → universal fallback.** It should vary by cover concept:

| Cover concept | Preferred rule |
| --- | --- |
| Single cinematic cover (1 environment, or a hero for a list) | Unique art wins when the list has ≤ 3 members or the unique-art member is ≥ ⅓ of the list; else the dominant archetype (see below) is a better "what is this list about" image. |
| Three-image collage | One tile per distinct archetype, highest-confidence first, unique-art members take a tile only if it keeps the three tiles visually distinct. Use biome art only when fewer than three archetype images exist. |
| Description-aware thematic cover | Dominant archetype by count, ties broken by confidence then catalogue order; ignore fallback/ambiguous members. |
| Asymmetric editorial collage | Same as collage but weight tile size by count. |
| Atlas / manuscript cover | Archetype art as a small vignette on a manuscript ground; unique art as the inset when present. |
| Hybrid collection cover | Hero = dominant archetype; strip = unique-art or secondary archetypes. |

Tradeoffs: a unique painting of one minor environment is *less* representative of a ten-environment list than the dominant archetype; the three existing paintings are strong images, though, so they should lead short lists. A cover that mixes a unique painting with archetype pictures will have two visual registers (painted env art is lilac/pastel; archetype art will be darker) — evaluate in S09.

## 10. Classification strategies

| Criterion | A. Explicit mapping | B. Rule-based | C. Hybrid (mapping + biome fallback) |
| --- | --- | --- | --- |
| Accuracy | Highest; reflects reviewed judgement | Measured 71.4% exact / 78.9% incl. secondary on this catalogue (rules tuned after reading it, so optimistic), 85.6% on high-confidence records | Same as A where mapped; biome picture otherwise |
| Maintainability | One JSON file; corrections are one-line edits | Brittle regexes in two languages; every new phrasing needs a rule | One file plus the existing `artBiome()` |
| Implementation effort | Small: lookup | Medium: rule engine + tests | Small: lookup + existing fallback |
| Runtime cost | O(1) lookup | Regex per environment (precomputable) | O(1) |
| New environments | Unmapped until someone adds it | Gets *some* answer, possibly wrong | Unmapped ⇒ biome art ⇒ still sensible |
| Secondary archetypes | Natural (an array) | Needs scoring | Natural |
| Manual corrections | Trivial | Fight the rules | Trivial |

**Recommendation: C, Hybrid.** Ship `data/cover-archetypes.json` (or a field on the environment) as an explicit `id → { primary, secondary[] }` map, authored like the other data, with `primary: null` for ambiguous/fallback records. Validate it in `scripts/validate-data.js` (every id exists, every archetype id is in the taxonomy, no unmapped environment — a build failure like other data rules), so a new environment cannot ship unclassified by accident; `artBiome()` stays as the final fallback. No AI service and no runtime text interpretation. A one-time keyword suggester could *propose* a mapping for new imports (`/add-environment`), reviewed by a human; that is a tooling idea for later, not part of the runtime.

Implementation note (later phase): a confidence flag in the map lets the cover prefer high-confidence members; the dataset's `classification_status` is the model for that field.

## 11. Cover Design Lab scenarios

Actual ids from the catalogue; no stored list was touched.

| # | Scenario | Environment ids | What to evaluate |
| --- | --- | --- | --- |
| S01 | One environment with unique artwork | `ouroborean-pass` | Single cinematic cover where a real painting exists: 3:2 painting cropped to 16:9 (ENV_ART_FOCUS), no tile logic needed. Baseline for "unique art wins". |
| S02 | One environment without unique artwork | `dragons-lair` | Single cinematic cover from an archetype image (monster-lairs). Checks that an archetype image holds up full-width where a biome picture (badlands, underground, mountain) would be generic. |
| S03 | Two environments with different visual themes | `vampires-castle`, `sunken-citadel` | Two-panel split: night gothic vs underwater teal. Evaluates contrast, panel boundary and palette clash. |
| S04 | Three environments with unique artwork | `cauldera-valley`, `field-of-dreams`, `ouroborean-pass` | Exactly what ships today. The new system must not regress it; compare the existing 3-tile cover with new layouts. |
| S05 | Five environments sharing a biome but differing in narrative identity (all forest) | `court-of-cats`, `witchs-hut`, `forest-wildfire`, `burning-heart-of-the-woods`, `bandit-hideout` | Biome art would give five identical covers; archetypes give fey, hag woods, wildfire, blight and bandit stronghold. Tests which three of five are surfaced and in what order. |
| S06 | Five environments from different biomes | `harsh-desert`, `sunken-citadel`, `mountain-pass`, `deserted-moor`, `ancient-tomb` | Drylands, aquatic, mountain, rolling, underground. Mixes a plain-terrain fallback (biome art) with archetype art (hauntings, tombs, ruins). |
| S07 | Ten environments with strong thematic diversity | `vampires-castle`, `dragons-lair`, `sunken-citadel`, `archmages-tower`, `local-tavern`, `hallowed-cathedral`, `megastorm`, `capital-ship-assault`, `court-of-hounds`, `circles-below-dis` | Ten different archetypes. Tests the "pick best three" rule, the +7 count treatment and whether a sci-fi image (starfaring) is chosen. |
| S08 | Ten environments dominated by one archetype (haunted) | `haunted-city`, `cursed-graveyard`, `desecrated-graveyard`, `possessed-abode`, `abandoned-building`, `bubblys-bottom`, `castle-of-wails`, `vampires-castle`, `deserted-moor`, `haunted-oratorium` | All haunted-and-deathly. Three tiles of the same image would look repetitive: tests whether one hero image beats a collage, or whether variants (two or three images per archetype) are needed. |
| S09 | Mixed list with unique artwork and archetype fallbacks | `ouroborean-pass`, `vampires-castle`, `port-city`, `hallowed-cathedral`, `jungle`, `the-undermarket` | One painting, four archetype images (haunted, seafaring, sacred, intrigue) and one plain-terrain biome image. Tests tradeoff between unique art and a list-wide archetype. |
| S10 | Difficult list where description-based classification adds little | `ambushed`, `ambushers`, `pursued`, `pursuers`, `road-blockade`, `perilous-journey`, `hold-the-line`, `keep-away`, `the-ritual-of-renewal`, `duel` | Setting-neutral encounters on the universal or settlement biome: chase-and-ambush (moderate), strongholds and arenas, plus ambiguous and abstract-event records. Tests the universal fallback and a deliberate no-false-precision cover. |
| S11 | Near-duplicate variants of one concept | `time-loop`, `time-loop-atlas`, `masquerade-ball`, `masquerade-ball-atlas`, `underground-chasm`, `demonic-abyss` | Variant pairs. Tests de-duplication (do not show the same image twice for what is one concept). |
| S12 | Only settlement-biome environments with different archetypes | `local-tavern`, `hallowed-temple`, `thieves-guild`, `arcane-laboratory`, `fortress` | All primary-biome settlement, so biome art is one identical harbour picture; archetypes give tavern, sacred, intrigue, arcane and stronghold. This is the strongest case for archetypes. |
| S13 | Style-mismatch stress test (sci-fi only) | `capital-ship-assault`, `capital-ship-high-alert`, `planetary-blockade`, `operations-center`, `planetary-invasion` | All starfaring. Tests how a sci-fi image sits beside fantasy art and whether a catalogue-wide style guide still holds. |

## 12. Limitations and surprises

- **Single annotator.** Every classification is one reviewer's judgement; the 100 moderate and 12 ambiguous cases are where a second reader would change things. The JSON keeps the status so they can be audited.
- **Flat distribution** (above): no archetype exceeds 5.7%; the library is a breadth problem.
- **`starfaring` is the third-largest archetype (14)** and the only one that is science fiction (StarHeart, 21 records). It is either a style outlier for a dark-fantasy atlas or an honest representation of the catalogue — a product decision, not a research one; it is deliberately kept out of the pilot.
- **No 16:9 `universal` painting exists**, yet 53 environments list `universal` first and 4 of them are only classifiable as abstract events.
- **A cover already exists** for the three painted environments and counts on their 3:2 thumbnails; the new system must keep that behaviour or consciously replace it.
- **Tier and type were not used as predictors** and their relationship to archetype was not measured.
- Several environments are the same scene reprinted (identical features for `underground-chasm` / `demonic-abyss`); a naive "different environments ⇒ different images" assumption would repeat a picture.
- No hierarchy rules were implemented, no art generated, and the next phase has not been started.
