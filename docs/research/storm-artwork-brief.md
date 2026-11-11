# Bacchus's Atlas — storm artwork brief (ChatGPT image generation)

Brief only. Nothing here is generated or wired in; no app, data or asset changes. Companion to the earlier [pilot brief](lists-cover-pilot-artwork.md) (git `c09ec38`) and PD-085…PD-094.

## 1. Why, and what exactly

18 environments carry `tags: ["storm"]` (PD-094); Rondolo and Green Doom Skies are storms too but untagged. Today one picture serves storms (`storms-and-calamity`: tornado, lightning, sea, castle) and it is mapped to only 6 (`tornado`, `megastorm` strong; `thunderstorm`, `magical-storm`, `unbound-arcanostorm`, `green-doom-skies` acceptable). The 11 Fractus storms, Snow Squall and Flickerstorm fall to a biome (or, in My Lists, to nothing for `universal`).

**Plan: 8 new pictures + 1 optional**, one dominant hue each, covering ~13 environments. Not 18: three storms are abstract and stay on existing art.

| # | Picture id | Environments (proposed `ARCHETYPE_FIT`) | Dominant hue |
| --- | --- | --- | --- |
| 1 | `storm-downpour` | thunderstorm, torrential-rain | wet slate-teal + amber lantern |
| 2 | `storm-lightning` | lightning | near-black indigo + white-violet bolt |
| 3 | `storm-hail` | hail | sulphur-yellow grey + white ice |
| 4 | `storm-blizzard` | blizzard-cold, snow-squall | steel-blue / white + one dark anchor |
| 5 | `storm-miasma` | plague-poison | acid green-black |
| 6 | `storm-lifedrain` | life-draining | black + dim crimson + bone |
| 7 | `storm-radiance` | searing-light | gold-white + long dark shadows |
| 8 | `storm-arcane` | magical-storm, unbound-arcanostorm, elemental-chaos (replaces their "acceptable" fit to the old picture) | iridescent magenta / cyan / gold |
| 9 (optional) | `storm-rondolo` | rondolo (own picture, unique creature) | eclipse black + jungle green + dull gold |

Kept as they are: `tornado`, `megastorm` and `violent-winds` stay on the existing tornado picture (add `violent-winds` as a *strong/acceptable* fit only if reviewed); `green-doom-skies` stays. **Not painted:** `spatial-rifts`, `reality-time-altering`, `flickerstorm` — the lore names no scene (PD-085 "taxonomy is not artwork"); reuse `planar-rifts` / `time-and-dream` only if their fit review passes, else biome.

Existing picture for comparison and style anchor: `img/cover-archetypes-source/storms-and-calamity.png` (1672×941; blue-charcoal sky, amber glow far left). New pictures must not share its dominant hue.

## 2. Common rules (every image)

- **Format:** 16:9 PNG, as large as the tool gives (existing masters are 1672×941; ≥1536 px wide is enough). If the tool returns 3:2, generate with extra sky/foreground and crop to 16:9; never stretch. Save to `img/cover-archetypes-source/<picture id>.png` (not shipped).
- **Crops it must survive:** My Lists tile ~3.6:1 (middle 50 % of height), two tiles ~1.8:1, three tiles ~1.2:1; Catalog strip 1:3 (full height, a 1:3 window at an `x` chosen per picture); Prep 48×48 square. Therefore: subject inside the **central safe zone x 25–75 %, y 25–75 %**, focal point near y 45–55 %, nothing critical in the outer 17 % left/right, and **one strong silhouette** readable at 48 px.
- **Distinguishable at 48 px:** differ by hue *and* silhouette (funnel / single bolt / streaks / whiteout / low fog / black shroud / light burst / spiral). If two candidates look alike when shrunk to 48 px side by side, regenerate one.
- **Dark anchor:** every picture has a mass of dark (rock, trees, a roof, tiny figures) against the light areas, so a bright or white picture (hail, blizzard, radiance) does not wash out in a strip.
- **Consistency:** same painterly-realistic dark-fantasy rendering and grain as the existing masters, tiny figures seen from behind or far away (scale only, no faces), one warm accent light per image where the palette allows, gentle vignette.
- **Never:** text, lettering, runes that read as writing, logos, watermarks, borders, UI, gore, readable symbols. No imitation of the official Daggerheart art or of any publisher's illustration for these books (Fractus, Atlas of Adventure, Wondrous Environments…); do not name them in prompts. Generic weather only (CLAUDE.md "Branding").
- **Review checklist:** (1) reads at 48×48 as one clear shape; (2) survives the 1:3 strip; (3) at a third width in My Lists; (4) no text-like marks; (5) matches the lore sentence of every environment it will be mapped to; (6) hue differs from all other storm pictures; (7) sits next to `storms-and-calamity.png` without a style seam.

## 3. Prompt prefix (paste before every scene)

> Cinematic dark fantasy environment illustration, high-end environment concept art, painterly realism with fine material detail and fine grain, layered atmospheric depth, volumetric light, restrained fantasy colour grading, tiny human-scale figures for scale only (seen from behind or far away, no portraits), wide 16:9 landscape. The main subject sits in the centre of the frame, with plain atmosphere at the left and right edges. One mass of dark foreground (rock, trees, roofs) anchors the lower third. Absolutely no text, lettering, runes that look like writing, logos, watermarks, borders, frames, UI or captions. No blood or gore.

If the tool accepts a reference image, attach `storms-and-calamity.png` with: "match the rendering style, level of detail and grain of the reference, but use a completely different palette and subject". Generate **4 candidates per picture** in one session, then choose by the checklist.

## 4. Pictures

### 1. `storm-downpour` — Thunderstorm, Torrential Rain
Lore: "roiling storm of lightning, thunder, and torrential rain"; "rain drowns the region, coming down in sheets and flooding low areas"; visibility poor, ground slick, crows over mortals.
**Scene:** a country road turned to a brown stream at dusk, curtains of rain in layers fading to grey, a flooded field, one far forked bolt behind a wall of rain, a flock of crow silhouettes against the cloud base, a lone roadside shrine with a small warm lantern, a tiny cloaked figure and a cart slipping on the road, puddles reflecting the flash.
**Colour:** wet slate-teal and green-grey, amber lantern as the only warm point. **Focal:** x≈42 %, y≈50 % (shrine and road).

### 2. `storm-lightning` — Lightning
Lore: "electricity and sonic booms"; "jagged fingers of pure energy reach below"; flashes, smoke, deafened people.
**Scene:** a bare ridge under a black sky, one enormous branching bolt striking a lone dead tree / standing stone, a white ground-flash ring, smoke rising, stones glowing, tiny figures thrown flat at a distance, a faint secondary fork far right, no rain in the centre so the bolt stays crisp.
**Colour:** near-black indigo, white-violet bolt, small ember orange at the strike. **Focal:** x≈62 %, y≈50 %.

### 3. `storm-hail` — Hail
Lore: "roiling clouds open up… with stones made of ice, mercilessly pelting"; glass, paper and cloth pulverized.
**Scene:** a bruised yellow-grey sky, diagonal streaks of large white hailstones bouncing off cobbles and rooftops, a shattered market stall with torn awnings and glass glittering on the ground, splintered tiles, a tiny figure with a raised shield over a child / cart, ice piled in drifts.
**Colour:** sulphur-yellow grey sky, white ice, dark wet roofs. **Focal:** x≈50 %, y≈52 %.

### 4. `storm-blizzard` — Blizzard/Cold, Snow Squall
Lore: "cold harsh enough to freeze exposed skin… blowing snow so thick you can't see your hand"; "a sudden blizzard rises while travelling the Frozen Wastes"; snow drifts, crevasses, buried shelter, wolves.
**Scene:** a mountain pass in near whiteout, a rope-linked line of tiny travellers with one lantern leaning into the wind, dark rock teeth breaking out of the snow, a half-buried hut roof, a crevasse edge, a hint of wolf silhouettes at the very edge of visibility (optional), blown snow streaming horizontally.
**Colour:** steel-blue and white, the dark rock and figures as anchors, one small amber lantern. **Focal:** x≈55 %, y≈52 %. *Risk:* low contrast at 48 px; reject candidates with no dark mass.

### 5. `storm-miasma` — Plague/Poison
Lore: "a floating, rolling miasma which carries disease, decay and death"; green-and-black fog; acid rain.
**Scene:** a wall of green-black fog rolling over a drowned village and a dead orchard, acid rain falling in thin sickly streaks, rotting roofs and bleached tree trunks, small pits of foam in puddles, tiny figures with cloth over their faces retreating along a causeway, a faint yellow-green glow inside the fog.
**Colour:** acid green and black, sickly yellow highlights, no warm light. **Focal:** x≈45 %, y≈50 %.

### 6. `storm-lifedrain` — Life Draining
Lore: "a storm of night-black fog and rain which leeches away the essence of every living thing"; smoky ephemeral tendrils from dark clouds; wounds that will not close.
**Scene:** a forest withering under a black shroud of fog and rain, translucent smoky tendrils hanging from the cloud and reaching toward the trees, leaves and grass greying and curling at their touch, a wet dark road, a tiny party huddled in the middle distance, a thin dim crimson light seeping through the cloud base onto the wet ground.
**Colour:** black, desaturated crimson, bone-white; no green. **Focal:** x≈50 %, y≈48 %.

### 7. `storm-radiance` — Searing Light
Lore: "radiance personified — bright clouds which burst with blinding rays of pure sunshine, too beautiful for most to bear"; people bow and kneel; overjoyed.
**Scene:** a wide plain under clouds splitting into huge golden-white rays, a blinding burst low in the sky, a crowd of tiny figures kneeling with their arms raised, long hard black shadows streaming toward the viewer, scorched grass at the edge of the rays, a few dark standing stones or a ruined arch as anchors. Beautiful first, menacing second.
**Colour:** gold, white, pale rose, deep black shadows. **Focal:** x≈50 %, y≈45 %. *Risk:* overexposure; keep a real dark foreground.

### 8. `storm-arcane` — Magical Storm, Unbound Arcanostorm, Elemental Chaos
Lore: "an unpredictable storm fuelled by magical energy"; "a storm made of chaotic magic from a failed grand ritual"; "looks more like a living thing than storm clouds"; prismatic lightning, fire tornado, elemental winds.
**Scene:** a ribbon-like spiral storm of iridescent cloud above a broken ritual circle on a plain, prismatic bolts in several colours, a small fire tornado and a column of ice and lightning side by side, floating stones and torn grass, tiny figures with a faint arcane shield at the rim, the cloud shaped almost like a coiled creature (suggested, not drawn).
**Colour:** iridescent magenta, cyan and gold on deep violet-black. **Focal:** x≈62 %, y≈48 %. Must not read as the existing blue tornado.

### 9. `storm-rondolo` (optional) — Rondolo
Lore: "a gigantic bird that brings a great storm and ill omens"; clouds and rain so dense it is hard to find him; his wingbeat makes a storm of lightning.
**Scene:** over a jungle river valley, a colossal bird silhouette barely visible inside black cloud, one wing sweeping lightning down in a fan, a dull gold eclipse ring behind the cloud, dense rain, tiny canoe or riverside huts for scale, trees bent flat.
**Colour:** eclipse black, jungle green, dull gold. **Focal:** x≈50 %, y≈40 %. Avoid any real-world cultural motifs beyond generic jungle architecture.

## 5. After generation (for the implementation session)

Not part of this brief, listed so nothing is forgotten:

1. Drop the chosen masters into `img/cover-archetypes-source/`; cut derivatives with `scripts/generate-list-covers.js`, `generate-catalog-art.js`, `generate-prep-art.js` (new entries per picture).
2. Registry in `js/list-cover-art.js`: new pictures (as variants of `storms-and-calamity`, or new ids — check the registry supports several variants), explicit `ARCHETYPE_FIT` rows per the table, `PANEL_REVIEWS` per picture. Re-point `magical-storm`, `unbound-arcanostorm`, `elemental-chaos` to `storm-arcane`.
3. Gate reviews: `js/catalog-art.js` `PICTURES[...].use` (reviewed in the real strip) and `js/prep-art.js` `PICTURES[...].use` (reviewed at 48 px). No entry = never used.
4. Tests (`tests/list-cover-art.test.js`, `catalog-art.test.js`, `prep-art.test.js`), visual QA (`node scripts/shoot-list-covers.js`, Catalog and Prep screenshots with the "Storms" filter on), a PD entry in `docs/product-decisions.md`, then `node --test tests/*.test.js` and the build chain.
5. Open question: is the generator recorded anywhere for the existing 28 masters? If the new pictures come from a different tool, decide in the style review whether the seam next to `storms-and-calamity.png` is acceptable.
