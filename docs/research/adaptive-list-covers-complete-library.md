# Adaptive List Covers — complete library (Phase 4)

Decision record PD-088. Selection algorithm, card design, Catalog, Prep, Journey, `data/`, the classification dataset and saved lists are unchanged. Code touched: the registry (`js/list-cover-art.js`), `scripts/generate-list-covers.js` (14 `SOURCES` lines), `scripts/shoot-list-covers.js` (`--phase4`), tests.

## 1. Baseline
Phase 3 (PD-087, commit d4dfc21) was already executed: 14 archetype pictures, 66 mappings, 104 derivative files. It was preserved, not redone. Phase 4 adds the other 14.

## 2. Inventory and source availability
All 28 masters exist in `img/cover-archetypes-source/` (1670–1672 × 941). The 14 new ones were untracked; five had capitalised names (`Arenas-and-Duels`, `Planar-Rifts`, `Seafaring`, `Sky-Realms`, `Time-and-Dream`) and were renamed to lowercase to match the rest and to be safe on case-sensitive hosts. Nothing was missing, nothing fabricated. `haunted-and-deathly-portrait.png` is an older Catalog-lab file, not registered.

## 3. Approved versions
Every archetype has exactly one master in the repository; no `-v1` file, no second candidate, no V1 derivative exists. For the two revised pictures that are new here I checked the content against the approved description rather than timestamps: **Time & Dream** is a village square with blossom, autumn tree and snow side by side (V2); **Sky Realms** is natural floating rock islands over a sea of cloud, no architecture (V2). Starfaring, Sacred Sanctuaries, Streets & Towns, Cursed Lands, Monster Lairs were verified in Phases 2–3. A test pins all 14 new masters by SHA-256 and 16:9, and asserts each has exactly the four expected derivatives, so a swapped file or a stray derivative fails.

## 4. Derivatives
Same recipe as before (Lanczos, AVIF q52 at 320/640/960 + one 640 WebP, no sharpening, no filters; only the 14 new stems were generated). New: 56 files, 2.6 MB on disk (AVIF ladders 1.9 MB). `img/list-covers` / `dist/img/list-covers`: 160 files, 11 MB. Masters never ship (`dist/img/cover-archetypes-source` does not exist); a test checks every derivative belongs to a registered picture and every registered picture has a master.

## 5. Mapping audit
Each archetype's taxonomy members (primary + secondary), the 14 records the classification lacks, and a keyword sweep of all 329 environments were read against the actual picture. Grades: Strong / Acceptable go in `ARCHETYPE_FIT`; Poor stays out and keeps biome art or none. Rule for settingless (`universal`) places: only when the lore itself names what the picture shows.

| Picture | Strong | Acceptable | Main rejections (reason) |
|---|---|---|---|
| crypts-and-tombs | heros-tomb, hallow-rest | necromancers-ossuary, ancient-tomb, endless-catacombs, catacomb-tunnels | open graveyards, martyrs-rest (mound), titan-boneyard, chapel-of-st-brenna (above-ground chapel), para-lichs-archive |
| taverns-and-inns | teal-heart-inn, local-tavern* | the-wandering-tavern, squealing-boar-brawl | jazz-speakeasy and rats-nest (criminal/ratling), the-dungeoneer (subterranean; picture has windows) |
| blighted-mires | shadowfen, corrupted-swamp, wretched-mire, dread-mire | buzzing-swamp, blood-marsh, heart-of-the-mire, swamp-ruins, beelzebufo-bog | sentient-ink-marsh, chronon-pools, lizardfolk-village |
| archives-and-libraries | library-of-the-dusk-tree | civic-library, neverhome-library | the-waking-archives and para-lichs-archive (ruined/buried; picture is a sunlit living library), forum, museum |
| planar-rifts | stop-the-collapse-of-reality, extraplanar-breach | portal-beyond, planar-incursion-invasion, -arcane-vortex, shattered-lands | chaos-realm, shadow-well, astral-realm (realms seen from inside), interdimensional-building, storms |
| arenas-and-duels | fighting-arena | the-proving-pyre | fighting-pit, every duel/quickdraw/high-noon, races, frozen-chalice |
| chase-and-ambush | — | ambushed, ambushers, road-blockade | rooftop/street/bankburgh chases, pursued/pursuers, mounted, stagecoach, canyon, train, space chases |
| intrigue-and-underworld | — | gang-hideout, thieves-guild | the-undermarket (sewers), courts, heists, den-of-vice |
| time-and-dream | — | time-loop, time-loop-atlas | dreamlands, nightmares (cosmic), city-out-of-time, time-court, chronon-pools, flickerstorm |
| dungeon-delves | deadly-dungeon, dangerous-dungeon | — | scorching (lava), chthon-verlies (crystal), mines, hazards, underroot-tunnels |
| perilous-passages | mountain-pass | cliffside-ascent, perilous-cliff, haunted-mountain-pass | rivers, frozen lake, lion-ascendant |
| seafaring | ocean-voyage | terror-of-the-deep | skyship, lake, shipwreck, beach, harbours (port-city keeps its harbour override) |
| sinister-woods | unsettling-forest, spooky-forest, gnarled-glen* | gloaming-forest, devouring-green | huts, fey courts, burning tree, tunnels, endless-forest |
| sky-realms | floating-mountains | stones-adrift, cloudy-sky | lion-ascendant, the-garden, skyship (architecture/vessels) |

\* moved from another picture: `local-tavern` was streets-and-towns (acceptable), `gnarled-glen` was cursed-and-blighted-lands (acceptable); "a twisted wood, dark canopies" and "a lively tavern" are these pictures. `resting-dagger-inn` also fits an inn but stays on its explicit PD-087 streets mapping.

Per archetype, all 28 (taxonomy members reviewed = primary + secondary; "rejected" includes members served by another archetype's picture):

| Archetype | Primary | Reviewed | Strong | Acceptable | Rejected | Mapped total |
|---|---|---|---|---|---|---|
| haunted-and-deathly | 18 | 28 | 3 | 7 | 18 | 10 |
| forgotten-ruins | 15 | 22 | 3 | 7 | 12 | 10 |
| starfaring | 14 | 17 | 0 | 1 | 16 | 1 |
| infernal-and-profane | 13 | 18 | 3 | 2 | 13 | 5 |
| planar-rifts | 12 | 28 | 2 | 4 | 22 | 6 |
| storms-and-calamity | 12 | 16 | 2 | 4 | 10 | 6 |
| cursed-and-blighted-lands | 11 | 15 | 1 | 1 | 13 | 2 |
| feasts-and-revelry | 11 | 13 | 4 | 4 | 5 | 8 |
| streets-and-towns | 11 | 32 | 1 | 3 | 28 | 5 |
| arcane-sanctums | 10 | 20 | 2 | 5 | 13 | 7 |
| fey-and-enchanted | 10 | 18 | 1 | 1 | 16 | 2 |
| monster-lairs | 10 | 24 | 0 | 1 | 23 | 1 |
| sacred-sanctuaries | 10 | 21 | 1 | 1 | 19 | 2 |
| strongholds-and-sieges | 10 | 18 | 1 | 1 | 16 | 2 |
| arenas-and-duels | 9 | 11 | 1 | 1 | 9 | 2 |
| blighted-mires | 9 | 12 | 4 | 5 | 3 | 9 |
| chase-and-ambush | 9 | 24 | 0 | 3 | 21 | 3 |
| drowned-depths | 9 | 11 | 2 | 1 | 8 | 3 |
| intrigue-and-underworld | 9 | 20 | 0 | 2 | 18 | 2 |
| time-and-dream | 9 | 15 | 0 | 2 | 13 | 2 |
| archives-and-libraries | 7 | 9 | 1 | 2 | 6 | 3 |
| dungeon-delves | 7 | 15 | 2 | 0 | 13 | 2 |
| perilous-passages | 7 | 9 | 1 | 3 | 5 | 4 |
| seafaring | 7 | 9 | 1 | 1 | 7 | 2 |
| sinister-woods | 7 | 15 | 3 | 2 | 10 | 5 |
| taverns-and-inns | 7 | 8 | 2 | 2 | 4 | 4 |
| crypts-and-tombs | 6 | 12 | 2 | 4 | 6 | 6 |
| sky-realms | 5 | 8 | 1 | 2 | 5 | 3 |

(Strong/Acceptable count taxonomy members whose mapping is to that archetype; "Mapped total" counts all `ARCHETYPE_FIT` entries for it, including by-name look-alikes outside the taxonomy list. Per-environment grades live in `ARCHETYPE_FIT`.) Ambiguous/borderline calls leaning Poor: para-lichs-archive, chapel-of-st-brenna, fighting-pit, the-dungeoneer, perilous-cliff (sea cliff vs inland pass, kept Acceptable).

## 6. Coverage (all 329 environments, each counted once, registry's own resolver)
| | Phase 3 | Phase 4 | Δ |
|---|---|---|---|
| unique paintings | 3 | 3 | 0 |
| thematic archetype picture | 66 | 117 | +51 |
| biome picture | 150 | 120 | −30 |
| neutral / no tile | 110 | 89 | −21 |
Thematic coverage 20.1% → 35.6%. Accepted mappings: 117 (51 newly eligible environments; 2 moved). Accepted primary-archetype vs secondary split was not tracked separately: `ARCHETYPE_FIT` stores the picture, not the taxonomy role. The library being complete (28/28) does not mean complete coverage: 89 environments (mostly settlement/universal) still get the neutral cover and 120 the biome picture, deliberately. The biome pick approximates `artBiome` in `js/app.js` (the test file mirrors it).

## 7. Crops (object-position % x,y — 1-up / 2-up / 3-up)
crypts 50,45 / 50,50 / 25,50 · taverns 50,45 / – / 30,50 · mires 50,40 / – / 60,45 · archives 50,55 / – / 60,50 · planar 50,30 / – / 55,40 · arenas 50,35 / – / 45,40 · chase 50,35 / – / 45,40 · intrigue 50,35 / – / 60,40 · time 50,40 / – / 55,40 · dungeon 50,50 / – / 40,50 · perilous 50,40 / – / 70,40 · seafaring 50,50 / – / 75,50 · sinister 50,45 / – / 40,45 · sky 50,35 / – / 45,40 (2-up shows the whole 16:9 frame). Checked in the real component: tomb and sarcophagus, inn hearth, ruins in the mire, globe and window, the rupture, arena wall, bridge, back-street figures, three-season square, gate and stair, banner and railing, ship and sea, mist-tree, central island all read in the 1-up band. Time & Dream's three seasons read best in 1-up/2-up; at 3-up the crop keeps blossom and autumn tree.

## 8. Tests and checks
`node --test tests/*.test.js`: 1568 pass, 0 fail. New: 14 masters pinned by SHA-256 and 16:9, exact derivative set per picture, registry/SOURCES/derivative consistency, exact grade for each of 53 mappings, nothing mapped to a new picture unreviewed, rejected lists resolve elsewhere, the audit's negative examples, explicit moves, collage rules (≤3 tiles, distinct, deterministic, painting first, 14 pictures in one list still three tiles), missing picture falls through. Earlier phase tests that asserted "absent from ARCHETYPE_FIT" now mean "absent for the pictures that audit knew" (a place rejected for the haunted picture may fit a later one). `validate-data.js`: 0 errors (2 pre-existing warnings). Build, versioning, unlisted and Journey checks pass.

## 9. Visual QA
`node scripts/shoot-list-covers.js --phase4` seeds 40 lists (A one per new picture, B two-environment, C three, D large 5/8/10/14, E eight negative lists, F regression) in a fresh profile at 1280×800, 1440×900, 1920×1080, DPR 2, EN, phone 390: `docs/research/adaptive-list-covers-complete-library-review/` (`lists-1440x900.png` overview). Machine checks at every size: 0 broken images, 0 duplicate tiles, no horizontal overflow, one card height (231) and cover height (90), ≤3 tiles, no upscaling (source/device ≥ 1.0). Observed: rejected lists show biome art or the neutral cover; the 14-picture list shows three tiles; empty and stale-reference lists unchanged. Keyboard/hover/click and list CRUD were not touched (no code outside the registry) and covered by the unchanged suite; they were not re-driven by hand.

## 10. Performance
Fourteen one-environment lists, one per new picture, 1440×900 DPR 1: 14 cover requests, 178 KB total (≈13 KB each), lazy-loaded; a biome-only list of the same size: 7 requests, 91 KB. No picture is requested unless a visible card uses it; nothing preloads; no new JS or dependency (registry +~100 lines). Layout shift on the page measured ~0.32 for both the new-art and biome-only lists, so it predates this phase and is not caused by the covers (card and cover heights are fixed). No Phase 2/3 byte baseline was recorded, so no improvement figure is claimed.

## 11. Limitations and future Catalog / Prep
- Planar rifts, chase & ambush and intrigue & underworld are conditional pictures: few acceptable environments (6/3/2), none Strong for the latter two.
- The `fully-shadowblighted` cosmic art is untouched; Planar Rifts is only used for My Lists.
- Chase & ambush shows a wooded mountain track; `ambushed`/`ambushers`/`road-blockade` are settingless in the data and are accepted only because their lore names the scene.
- Catalog (1:3 strip) and Prep (small square) were not changed or lab-tested in this pass. Likely trouble for strips: wide scenes whose subject is off-centre (ocean-voyage, sky-realms, arena); Prep squares suit crypts, tavern, library, planar. A lab pass and a separate decision are required before any use there.
- The images carry heavy micro-contrast; not corrected, by instruction.
