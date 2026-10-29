# Bacchus's Atlas — pilot artwork for list covers

Specification for the first batch of reusable thematic illustrations. Nothing here was generated; this is the brief. Analysis behind it: [lists-cover-archetypes.md](lists-cover-archetypes.md); data: [lists-cover-classification.json](lists-cover-classification.json).

## Recommended batch (8)

| Archetype | Primary | As secondary | Palette | Setting |
| --- | --- | --- | --- | --- |
| `haunted-and-deathly` | 18 | 10 | cold slate blue, bone grey, one sickly green lantern, a thread of warm window light | Gothic graveyard on a hill under a heavy moon, a ruined manor beyond |
| `forgotten-ruins` | 15 | 7 | moss green, warm sandstone gold, deep forest shadow | An enormous temple facade half-consumed by ancient trees |
| `storms-and-calamity` | 12 | 4 | charcoal, teal-grey, crimson lightning, a strip of amber at the horizon | A tornado and thunderhead over an open plain |
| `infernal-and-profane` | 13 | 5 | black iron, ember orange, ash grey, one sickly green flame | A hell-city of chains and furnaces |
| `arcane-sanctums` | 10 | 10 | deep indigo, teal glow, violet, warm lit windows | A wizard tower at nightfall with floating instruments |
| `drowned-depths` | 9 | 2 | deep teal, jade, pale sunbeam, bone-white coral | A sunken city seen through the water column |
| `feasts-and-revelry` | 11 | 2 | amber gold, crimson, deep walnut, a touch of mask-white | A candlelit ballroom banquet |
| `cursed-and-blighted-lands` | 11 | 4 | sickly green-violet, bone white, ash | A valley devoured by blight |

Together they serve **99 environments as primary theme (31.3%)** and **129 counting secondary themes (40.8%)**. The eight most common archetypes would serve 106 (33.5%); the pilot gives up 7 environments (2.2 points) of raw count on purpose (see next section).

### Why not just the eight largest?

| Dropped from the top 8 | Count | Reason |
| --- | --- | --- |
| `starfaring` | 14 | Only science-fiction archetype (StarHeart). A sci-fi image beside the fantasy paintings is a style decision for the owner; test it in Cover Lab scenario S13 first. Strong wave-2 candidate. |
| `planar-rifts` | 12 | Existing `fully-shadowblighted` art (cracked ground over a violet galaxy) is already the right idea. Reuse. |
| `streets-and-towns` | 11 | Existing settlement harbour painting covers cities; reconsider after Cover Lab. |
| *Replaced by* `arcane-sanctums`, `drowned-depths`, `feasts-and-revelry` | 10 / 9 / 11 | Three new palettes and settings (indigo tower, underwater, candlelit interior) where nothing exists. |

Balance achieved: **night** (haunted), **overgrown daylight** (ruins), **storm sky** (calamity), **ember dark** (infernal), **indigo/teal magic** (arcane), **underwater** (drowned), **warm interior** (revelry), **sickly green** (blight). Physical settings: graveyard, jungle-forest ruin, open plain, built city, cliff tower, sea floor, ballroom, valley. All eight share a hook for secondary uses: haunted ↔ crypts, infernal ↔ sacred, arcane ↔ libraries, revelry ↔ intrigue/taverns, blight ↔ mires/woods.

**Not in the pilot, for later:** `starfaring`, `monster-lairs`, `strongholds-and-sieges`, `sacred-sanctuaries`, `intrigue-and-underworld`, `chase-and-ambush`, `taverns-and-inns`, `crypts-and-tombs`, `blighted-mires`. **Reuse, no new art:** `planar-rifts`, `streets-and-towns`, `fey-and-enchanted` (plus every plain-terrain environment on its biome painting).

## Common rules for every image

- **Format:** master 2560×1440 (16:9), PNG, kept in `img/cover-archetypes-source/` (mirrors `img/biome-artwork-source/`); not shipped. Shipped derivatives are cut by a script, like the existing biome art.
- **Crops the image must survive.** The current cover strip is 90 px tall in a card at most 320 px wide: one tile shows ~3.6:1 (the middle 50% of the image's height, full width); two tiles show ~1.8:1 (almost the whole image); three tiles show ~1.2:1 (the middle ~67% of the width, full height). A larger hero or a vertical crop may come later. So:
  - Put every important element inside the **central safe zone: x 25–75%, y 25–75%.**
  - The **focal point sits on the horizontal centre line (y 45–55%)**; its x position varies by image (listed per entry) to avoid eight identical compositions.
  - Sky above y 25% and foreground below y 75% are atmosphere only; never put a face, door, beacon or horizon-defining element there.
  - **Nothing critical touches the left or right 17%.** Tonal margins fade to darkness or fog so adjacent tiles meet cleanly.
- **Consistency across the set:** the same painterly-realistic rendering, the same level of detail and fine grain, a gentle vignette, atmospheric perspective, tiny figures for scale (never close-up faces), one warm accent light per image so a tile of night art still sits next to the golden biome paintings.
- **Harmony in collages:** do not let two pilot images share a dominant hue — the table above has eight distinct dominant palettes.
- **Review checklist:** (1) reads at 107×90 px as one clear shape; (2) survives the 3.6:1 strip; (3) no text or symbols that look like writing; (4) no gore; (5) no recognisable branded, copyrighted or Daggerheart official art; (6) the focal point is where the entry says it is.
- **Legal posture:** original art in the Atlas's own style; do not imitate the official Daggerheart artwork (CLAUDE.md "Branding").

## 1. `haunted-and-deathly` — The Quiet Dead

**A. Archetype.** Haunted & Deathly Places — "The Quiet Dead".

**B. Catalogue coverage.** 18 environments as primary (5.7%; 8 high, 10 moderate) and 10 more as a secondary theme. Examples: Bubbly’s Bottom, Abandoned Building, Haunted Oratorium, Cursed Graveyard. Why selected: Largest archetype (18); the only one built on night and fog; absent from the golden biome set.

**C. Visual direction.** Scene: Gothic graveyard on a hill under a heavy moon, a ruined manor beyond. Palette: cold slate blue, bone grey, one sickly green lantern, a thread of warm window light. Focal placement: x≈62%, y≈50% — manor silhouette and lantern. Archetype brief: Moonlit overgrown cemetery and a ruined gothic manor beyond it, ground fog, one cold green lantern, ghostly figures barely readable.

**D. Difference from existing artwork.** The nearest biome picture (wetland) is a sunlit swamp. Nothing in the existing set is night, gothic or architectural-funerary. Closest existing asset: `img/journey2/headers/wetland.webp` (weak). Recommendation: **generate** — Mist and gloom exist in the wetland art, but it is a sunlit swamp, not a night-time gothic scene.

**E. Image-generation prompt.**

> Cinematic dark fantasy environment illustration, exceptionally high-end environment concept art with near-photographic material detail, painterly realism, sophisticated atmospheric depth with layered fog and aerial perspective, volumetric light, restrained fantasy colour grading, rich environmental storytelling, tiny human-scale figures for scale only (seen from behind or far away, no portraits), finely detailed natural materials and architecture, one warm accent light source in the scene so it sits beside the Atlas's sunset-lit biome paintings. 16:9 landscape, 2560x1440 or larger. Absolutely no text, lettering, runes that read as writing, logos, watermarks, borders, frames, UI, or captions. A vast overgrown gothic cemetery on a low hill at night, leaning headstones and broken angels half swallowed by ivy and ground fog, a ruined manor with a collapsed tower and a single faintly lit window on the right third of the frame, a mausoleum with an open iron door in the middle distance, twisted dead oak trees, a pale full moon veiled by cloud, a thread of cold green lantern light drifting between the graves, a distant procession of ghostly figures barely visible in the mist, a narrow gravel path leading the eye to the manor. Colour: slate blue and bone grey with one sickly green accent and a warm candle glow in the manor window.

**F. Composition requirements.** 16:9 master, keep the subject inside the central safe zone (x 25–75%, y 25–75%), see the common rules above. Focal point: x≈62%, y≈50% — manor silhouette and lantern.

**Proposed filenames.** `img/cover-archetypes-source/haunted-and-deathly.png` (master, 2560×1440), shipped `img/cover-archetypes/haunted-and-deathly-{480,960,1440}.avif` and `haunted-and-deathly-960.webp`.

## 2. `forgotten-ruins` — Swallowed by the Trees

**A. Archetype.** Forgotten & Ancient Ruins — "Swallowed by the Trees".

**B. Catalogue coverage.** 15 environments as primary (4.7%; 7 high, 8 moderate) and 7 more as a secondary theme. Examples: Abandoned Grove, Forgotten Temple of the Serpent, Ancient City, Moon Kingdom. Why selected: Second largest (15) and the most reusable: a ruin can illustrate castles, temples, lost cities, titan bones and standing stones.

**C. Visual direction.** Scene: An enormous temple facade half-consumed by ancient trees. Palette: moss green, warm sandstone gold, deep forest shadow. Focal placement: x≈50%, y≈50% — the temple doorway and light shaft. Archetype brief: Colossal overgrown temple facade half swallowed by ancient trees, light shafts through canopy, tiny explorers for scale.

**D. Difference from existing artwork.** The forest and tropical paintings are landscapes; this one is architecture with a scale story. Nothing existing shows ruin, collapse or a doorway. Closest existing asset: `img/env/field-of-dreams.jpg` (partial). Recommendation: **generate** — Standing stones and a ruined arch appear, but the focal point is a flower field and it belongs to one environment.

**E. Image-generation prompt.**

> Cinematic dark fantasy environment illustration, exceptionally high-end environment concept art with near-photographic material detail, painterly realism, sophisticated atmospheric depth with layered fog and aerial perspective, volumetric light, restrained fantasy colour grading, rich environmental storytelling, tiny human-scale figures for scale only (seen from behind or far away, no portraits), finely detailed natural materials and architecture, one warm accent light source in the scene so it sits beside the Atlas's sunset-lit biome paintings. 16:9 landscape, 2560x1440 or larger. Absolutely no text, lettering, runes that read as writing, logos, watermarks, borders, frames, UI, or captions. A colossal ancient temple facade with a huge arched doorway at the exact centre of the frame, half swallowed by giant roots and ancient trees, toppled columns and carved statues covered in moss, shafts of warm golden light falling through the canopy onto the broken stone steps, drifting dust and pollen, a still pool in the foreground reflecting the arch, small explorers with a lantern standing at the base of the steps for scale, carvings suggesting a vanished civilization (no readable symbols). Colour: moss green, warm sandstone gold, deep shadowed greens, no sky visible except a few bright gaps in the canopy.

**F. Composition requirements.** 16:9 master, keep the subject inside the central safe zone (x 25–75%, y 25–75%), see the common rules above. Focal point: x≈50%, y≈50% — the temple doorway and light shaft.

**Proposed filenames.** `img/cover-archetypes-source/forgotten-ruins.png` (master, 2560×1440), shipped `img/cover-archetypes/forgotten-ruins-{480,960,1440}.avif` and `forgotten-ruins-960.webp`.

## 3. `storms-and-calamity` — The Sky Comes Down

**A. Archetype.** Storms, Fire & Natural Calamity — "The Sky Comes Down".

**B. Catalogue coverage.** 12 environments as primary (3.8%; 9 high, 3 moderate) and 4 more as a secondary theme. Examples: Raging Fire, Forest Wildfire, Megastorm, Green Doom Skies. Why selected: 12 environments (storm, tornado, wildfire, eruption, blizzard, stampede) plus 4 secondary; weather is a distinct visual register.

**C. Visual direction.** Scene: A tornado and thunderhead over an open plain. Palette: charcoal, teal-grey, crimson lightning, a strip of amber at the horizon. Focal placement: x≈36%, y≈48% — the funnel and lightning. Archetype brief: A tornado and thunderhead over a farmland valley, crimson lightning, wind-bent grass, a lone road.

**D. Difference from existing artwork.** Biome pictures are calm dawn/dusk panoramas. This is motion, violence and sky. Closest existing asset: `img/journey2/headers/badlands.webp` (weak). Recommendation: **generate** — Fire sky only; no weather event.

**E. Image-generation prompt.**

> Cinematic dark fantasy environment illustration, exceptionally high-end environment concept art with near-photographic material detail, painterly realism, sophisticated atmospheric depth with layered fog and aerial perspective, volumetric light, restrained fantasy colour grading, rich environmental storytelling, tiny human-scale figures for scale only (seen from behind or far away, no portraits), finely detailed natural materials and architecture, one warm accent light source in the scene so it sits beside the Atlas's sunset-lit biome paintings. 16:9 landscape, 2560x1440 or larger. Absolutely no text, lettering, runes that read as writing, logos, watermarks, borders, frames, UI, or captions. A vast thunderhead supercell over an open plain at dusk, a huge rope-shaped tornado touching down left of centre, crimson-tinged lightning forking behind it, wind-bent tall grass and a lone road running toward the storm, a farmstead barely visible with its lights on, flying debris and torn roofing in the air, a narrow strip of amber light at the horizon under the cloud base, curtains of rain, sense of immense scale. Colour: charcoal and teal-grey sky, crimson lightning accents, warm amber horizon.

**F. Composition requirements.** 16:9 master, keep the subject inside the central safe zone (x 25–75%, y 25–75%), see the common rules above. Focal point: x≈36%, y≈48% — the funnel and lightning.

**Proposed filenames.** `img/cover-archetypes-source/storms-and-calamity.png` (master, 2560×1440), shipped `img/cover-archetypes/storms-and-calamity-{480,960,1440}.avif` and `storms-and-calamity-960.webp`.

## 4. `infernal-and-profane` — The Iron City

**A. Archetype.** Infernal & Profane — "The Iron City".

**B. Catalogue coverage.** 13 environments as primary (4.1%; 9 high, 4 moderate) and 5 more as a secondary theme. Examples: Cult Ritual, Circles Below: Dis, Fallen Citadel, Darkened Temple. Why selected: 13 environments (Dis, Pyrrhexis, the Metal Throne, cult rituals, demonic chasms) and a strong secondary link to sacred and haunted themes.

**C. Visual direction.** Scene: A hell-city of chains and furnaces. Palette: black iron, ember orange, ash grey, one sickly green flame. Focal placement: x≈50%, y≈55% — the bridge and gate. Archetype brief: Hell-city of iron bars and chained towers under a burning ash sky, a tiny procession of damned souls on a bridge.

**D. Difference from existing artwork.** Badlands is open volcanic terrain in saturated red. This is built architecture with a human-scale narrative (a procession over a bridge), and uses darkness rather than red saturation. Closest existing asset: `img/journey2/headers/badlands.webp` (partial). Recommendation: **generate** — Red lava palette matches, but it is open volcanic terrain with no architecture, chains or ritual focal point.

**E. Image-generation prompt.**

> Cinematic dark fantasy environment illustration, exceptionally high-end environment concept art with near-photographic material detail, painterly realism, sophisticated atmospheric depth with layered fog and aerial perspective, volumetric light, restrained fantasy colour grading, rich environmental storytelling, tiny human-scale figures for scale only (seen from behind or far away, no portraits), finely detailed natural materials and architecture, one warm accent light source in the scene so it sits beside the Atlas's sunset-lit biome paintings. 16:9 landscape, 2560x1440 or larger. Absolutely no text, lettering, runes that read as writing, logos, watermarks, borders, frames, UI, or captions. A hell-city of black iron and basalt towers joined by chained bridges, seen from a high ledge, furnaces glowing ember orange in the walls, an ash-grey burning sky with drifting sparks, huge chains hanging from the clouds, a long procession of tiny hunched figures crossing a bridge toward a vast iron gate at the centre, one column of sickly green flame beside the gate, brimstone mist in the chasm below, hard rim light from below. Colour: black iron, ember orange, ash grey, one green accent. Symmetric, brooding, no gore.

**F. Composition requirements.** 16:9 master, keep the subject inside the central safe zone (x 25–75%, y 25–75%), see the common rules above. Focal point: x≈50%, y≈55% — the bridge and gate.

**Proposed filenames.** `img/cover-archetypes-source/infernal-and-profane.png` (master, 2560×1440), shipped `img/cover-archetypes/infernal-and-profane-{480,960,1440}.avif` and `infernal-and-profane-960.webp`.

## 5. `arcane-sanctums` — The Beacon Tower

**A. Archetype.** Arcane Towers & Laboratories — "The Beacon Tower".

**B. Catalogue coverage.** 10 environments as primary (3.2%; 6 high, 4 moderate) and 10 more as a secondary theme. Examples: Alchemist’s Abandoned Workshop, Arcane Laboratory, Laboratory, Arcanist’s Laboratory. Why selected: 10 primary, 20 touching (magic city, shop, laboratory, observatory, tower, clocktower).

**C. Visual direction.** Scene: A wizard tower at nightfall with floating instruments. Palette: deep indigo, teal glow, violet, warm lit windows. Focal placement: x≈70%, y≈45% — tower crown and beacon. Archetype brief: A spiral wizard tower crowned with a crackling arcane beacon, lit laboratory windows, floating instruments around it.

**D. Difference from existing artwork.** There is no arcane, interior-lit or architectural-magic picture; the settlement harbour is mundane. Closest existing asset: none. Recommendation: **generate** — No architecture-led arcane art.

**E. Image-generation prompt.**

> Cinematic dark fantasy environment illustration, exceptionally high-end environment concept art with near-photographic material detail, painterly realism, sophisticated atmospheric depth with layered fog and aerial perspective, volumetric light, restrained fantasy colour grading, rich environmental storytelling, tiny human-scale figures for scale only (seen from behind or far away, no portraits), finely detailed natural materials and architecture, one warm accent light source in the scene so it sits beside the Atlas's sunset-lit biome paintings. 16:9 landscape, 2560x1440 or larger. Absolutely no text, lettering, runes that read as writing, logos, watermarks, borders, frames, UI, or captions. A tall spiral wizard tower on a rocky promontory at nightfall, its crown crackling with a teal-violet arcane beacon, lit laboratory windows in warm gold along its height, floating brass armillary spheres and loose books orbiting the upper levels, glass domes and copper pipes along the walls, a winding stair carved into the cliff below, faint aurora in the indigo sky, a small figure climbing the stair with a lantern. Colour: deep indigo, teal glow and violet magic, warm gold windows. The tower sits on the right third, open sky on the left.

**F. Composition requirements.** 16:9 master, keep the subject inside the central safe zone (x 25–75%, y 25–75%), see the common rules above. Focal point: x≈70%, y≈45% — tower crown and beacon.

**Proposed filenames.** `img/cover-archetypes-source/arcane-sanctums.png` (master, 2560×1440), shipped `img/cover-archetypes/arcane-sanctums-{480,960,1440}.avif` and `arcane-sanctums-960.webp`.

## 6. `drowned-depths` — Beneath the Citadel

**A. Archetype.** Drowned Depths & Sunken Places — "Beneath the Citadel".

**B. Catalogue coverage.** 9 environments as primary (2.8%; 5 high, 4 moderate) and 2 more as a secondary theme. Examples: Undersea Trench, Drowned Sanctum, Deep One City, Fathomless Baths - Deeps. Why selected: 9 environments (sunken citadel, Deep One City, Umbral Sea, trench, Fathomless Baths, drowned sanctum) with no existing underwater art.

**C. Visual direction.** Scene: A sunken city seen through the water column. Palette: deep teal, jade, pale sunbeam, bone-white coral. Focal placement: x≈40%, y≈52% — colonnade and shaft of light. Archetype brief: A sunken citadel in the deep, sunbeams on columned ruins, a giant shadow gliding above.

**D. Difference from existing artwork.** The aquatic picture is a sunlit lagoon above the waterline; every depth, trench and sunken ruin has nothing of its own. Closest existing asset: none. Recommendation: **generate** — Aquatic art is a sunlit tropical lagoon; nothing underwater.

**E. Image-generation prompt.**

> Cinematic dark fantasy environment illustration, exceptionally high-end environment concept art with near-photographic material detail, painterly realism, sophisticated atmospheric depth with layered fog and aerial perspective, volumetric light, restrained fantasy colour grading, rich environmental storytelling, tiny human-scale figures for scale only (seen from behind or far away, no portraits), finely detailed natural materials and architecture, one warm accent light source in the scene so it sits beside the Atlas's sunset-lit biome paintings. 16:9 landscape, 2560x1440 or larger. Absolutely no text, lettering, runes that read as writing, logos, watermarks, borders, frames, UI, or captions. An underwater view of a sunken citadel, a colonnaded ruin with a toppled dome and coral-encrusted statues on a silt plain, a column of sunlight descending from the surface at left of centre, drifting particles and long ribbons of weed, a huge shadowy shape gliding far overhead, bioluminescent flecks in the dark water at the edges, tiny diver silhouette for scale. Colour: deep teal and jade, a pale sunbeam, bone-white coral, darkness at the frame edges.

**F. Composition requirements.** 16:9 master, keep the subject inside the central safe zone (x 25–75%, y 25–75%), see the common rules above. Focal point: x≈40%, y≈52% — colonnade and shaft of light.

**Proposed filenames.** `img/cover-archetypes-source/drowned-depths.png` (master, 2560×1440), shipped `img/cover-archetypes/drowned-depths-{480,960,1440}.avif` and `drowned-depths-960.webp`.

## 7. `feasts-and-revelry` — The Long Table

**A. Archetype.** Feasts, Festivals & Galas — "The Long Table".

**B. Catalogue coverage.** 11 environments as primary (3.5%; 7 high, 4 moderate) and 2 more as a secondary theme. Examples: Grand Feast, City Festival, Masquerade Ball, Local Festival. Why selected: 11 (grand feast, festivals, masked balls, casinos, dinners) with strong secondary ties to intrigue (5) and taverns; the only interior, social, warm-gold picture in the pilot.

**C. Visual direction.** Scene: A candlelit ballroom banquet. Palette: amber gold, crimson, deep walnut, a touch of mask-white. Focal placement: x≈58%, y≈52% — the chandelier and table. Archetype brief: A vaulted ballroom of masked guests under chandeliers, one masked figure turned toward the viewer, a long laden table.

**D. Difference from existing artwork.** No interior or social scene exists; the settlement harbour is a street-level panorama. Closest existing asset: none. Recommendation: **generate** — No interior or social-gathering art exists.

**E. Image-generation prompt.**

> Cinematic dark fantasy environment illustration, exceptionally high-end environment concept art with near-photographic material detail, painterly realism, sophisticated atmospheric depth with layered fog and aerial perspective, volumetric light, restrained fantasy colour grading, rich environmental storytelling, tiny human-scale figures for scale only (seen from behind or far away, no portraits), finely detailed natural materials and architecture, one warm accent light source in the scene so it sits beside the Atlas's sunset-lit biome paintings. 16:9 landscape, 2560x1440 or larger. Absolutely no text, lettering, runes that read as writing, logos, watermarks, borders, frames, UI, or captions. A vaulted baroque ballroom at the height of a masked ball, a long banquet table laden with food and candles running into the depth of the frame, three enormous chandeliers, crowds of guests in elaborate masks and silk, a spiral of dancers on the polished floor at right, a musician gallery above, golden candle light and crimson drapes, one masked figure at the head of the table turned toward the far end, a half-open door in shadow suggesting intrigue. Colour: amber gold, crimson, dark walnut, touches of mask white.

**F. Composition requirements.** 16:9 master, keep the subject inside the central safe zone (x 25–75%, y 25–75%), see the common rules above. Focal point: x≈58%, y≈52% — the chandelier and table.

**Proposed filenames.** `img/cover-archetypes-source/feasts-and-revelry.png` (master, 2560×1440), shipped `img/cover-archetypes/feasts-and-revelry-{480,960,1440}.avif` and `feasts-and-revelry-960.webp`.

## 8. `cursed-and-blighted-lands` — The Hungry Green

**A. Archetype.** Cursed & Blighted Lands — "The Hungry Green".

**B. Catalogue coverage.** 11 environments as primary (3.5%; 8 high, 3 moderate) and 4 more as a secondary theme. Examples: Cursed Valley, Burning Heart of the Woods, Green Doom Tangle, The Devouring Green. Why selected: 11 environments (Devouring Green, cursed valley, valley of ruination, rewritten grove, heal the land, burning heart of the woods); the only corrupted-nature picture, sharing sickly colour with mires and woods.

**C. Visual direction.** Scene: A valley devoured by blight. Palette: sickly green-violet, bone white, ash. Focal placement: x≈42%, y≈50% — the road and the obelisk. Archetype brief: A once-green valley devoured by glowing violet-green blight, bone-white trees, a cracked road leading to a distant obelisk.

**D. Difference from existing artwork.** The forest picture is a healthy autumn wood; this is its opposite and the Journey's Shadowblight look is cosmic, not botanical. Closest existing asset: `img/journey2/headers/forest.webp` (weak). Recommendation: **generate** — A healthy golden forest; wrong palette and mood.

**E. Image-generation prompt.**

> Cinematic dark fantasy environment illustration, exceptionally high-end environment concept art with near-photographic material detail, painterly realism, sophisticated atmospheric depth with layered fog and aerial perspective, volumetric light, restrained fantasy colour grading, rich environmental storytelling, tiny human-scale figures for scale only (seen from behind or far away, no portraits), finely detailed natural materials and architecture, one warm accent light source in the scene so it sits beside the Atlas's sunset-lit biome paintings. 16:9 landscape, 2560x1440 or larger. Absolutely no text, lettering, runes that read as writing, logos, watermarks, borders, frames, UI, or captions. A once-green valley consumed by glowing violet-green blight, bone-white skeletal trees with grasping vine tendrils, a cracked road running into the depth of the frame toward a distant black obelisk, slow spores and ash drifting in the air, patches of glowing fungus on dead ground, a ruined cart at the roadside, a single warm campfire far off on the road, thin lilac sky. Colour: sickly green and violet, bone white, ash, one warm accent.

**F. Composition requirements.** 16:9 master, keep the subject inside the central safe zone (x 25–75%, y 25–75%), see the common rules above. Focal point: x≈42%, y≈50% — the road and the obelisk.

**Proposed filenames.** `img/cover-archetypes-source/cursed-and-blighted-lands.png` (master, 2560×1440), shipped `img/cover-archetypes/cursed-and-blighted-lands-{480,960,1440}.avif` and `cursed-and-blighted-lands-960.webp`.

## Notes for the generation phase

- If one image fails the 3.6:1 strip (focal element too tall), regenerate rather than crop; the strip is the harshest case.
- A second variant per archetype is advisable for `haunted-and-deathly` and `forgotten-ruins`: scenario S08 (ten haunted environments) shows a collage of three identical images looks repetitive.
- Wave 2 should start with `starfaring` (if the product accepts it), `monster-lairs`, `strongholds-and-sieges`, `sacred-sanctuaries`, then `intrigue-and-underworld` and `taverns-and-inns` (these two can share a candlelit-interior style with `feasts-and-revelry`).
- Do not replace the three unique environment paintings; they stay at the top of the hierarchy for short lists.
