# Adaptive List Covers — implementation report

Production feature, decision record PD-085 ([product-decisions.md](../product-decisions.md)). Catalog, Session Prep, Journey, `data/`, the classification dataset and the three unique paintings are unchanged.

## 1. Files changed

| File | Change |
| --- | --- |
| `js/list-cover-art.js` (new) | Artwork registry: pictures, framing per layout, archetype fit, biome map, overrides |
| `js/list-cover-utils.js` (new) | Pure resolver and selector |
| `js/app.js` | `listCoverHtml()` rewritten (tiles, neutral panel, error fallback); `listsCoveredFirst()`, `COVER_MAX`, `ENV_THUMB_WIDTHS` removed; `has-cover` class removed. `ENV_ART` / `ENV_ART_FOCUS` untouched |
| `css/styles.css` | `.list-card-cover` uses `--pos`; new `.is-neutral` / `.is-empty` panel |
| `index.html` | two script tags before `app.js` |
| `img/list-covers/` (new, 64 files) | AVIF 320/640/960 + WebP 640 for 12 biomes and 4 archetypes |
| `scripts/generate-list-covers.js` (new) | cuts the above from the masters |
| `scripts/shoot-list-covers.js` (new) | seeds QA lists in a fresh profile, screenshots, machine-checks covers |
| `scripts/build.js` | comment only (masters stay excluded) |
| `tests/list-cover-art.test.js`, `tests/list-cover-utils.test.js` (new, 39 tests) | |
| `img/cover-archetypes-source/*-landscape.png` | the four landscape masters the generator reads are now tracked (still excluded from `dist/`); the portrait master stays untracked |
| `docs/…`, `CLAUDE.md` | PD-085, architecture section, index entry, review screenshots |

## 2. Artwork source hierarchy

Per environment, first match wins: **own painting** → **explicit override** → **archetype picture it fits** (strong/acceptable) → **biome picture** → **nothing** (adds no tile). A step whose picture is missing from the registry is skipped.

## 3. Approved archetype suitability mapping

Source: the per-environment audit in the Crop Lab V2 (`relevance-audit.json`, §8 of the V2 report), checked against `data/environments.json` lore. Strong + acceptable are used; poor are not. I additionally dropped **Forced Penance** (an abstract area of guilt, not a place; a cemetery would mislead).

| Archetype | Strong | Acceptable | Total | Left on biome art |
| --- | --- | --- | --- | --- |
| Haunted & Deathly | cursed-graveyard, desecrated-graveyard, possessed-abode | vampires-castle, castle-of-wails, abandoned-building, haunted-city, neverhome-corridors, shatter-the-heart, haunted-oratorium | 10 | deserted-moor, haunted-mountain-pass, wispy-wasteland, valley-of-death, realm-of-the-dead, bubblys-bottom, empty-cliffside-village, forced-penance |
| Forgotten Ruins | forgotten-temple-of-the-serpent, korathi-temple, ruined-castle | abandoned-grove, ancient-city, ancient-power-conduit, ruined-mage-tower, search-the-ruins, mistfield-of-possibility, moon-kingdom | 10 | lost-village, swamp-ruins, mystic-ring, titan-boneyard, valley-of-automata |
| Arcane Sanctums | archmages-tower, eternal-observatory | tower-of-the-moon, cosmological-clocktower, magic-city, arcanists-laboratory, laboratory | 7 | alchemists-abandoned-workshop, arcane-laboratory, arcane-magic-shop |
| Feasts & Revelry | masquerade-ball, masquerade-ball-atlas, masquerade-party, grand-feast | divine-feast, the-commanders-dinner, upscale-casino, fairwell-casino | 8 | local-festival, town-festival, city-festival |

**35 environments** (12 strong, 23 acceptable) use an archetype picture. Of the 329 environments in `data/`, the tally is: unique 3 · archetype 35 · biome 161 (2 of them the harbour by override) · **no picture 130** (73 settlement, 57 universal). 14 environments are newer than the classification and simply follow biome/none.

## 4. Biome fallback mapping

Journey 16:9 landscapes for all 12 biomes, re-cut from the 1672×941 masters (not from the 960 WebP), with the per-biome crops from [biome-cover-registry.json](biome-cover-registry.json) (e.g. aquatic 3-up x 85, badlands x 25). **Universal: no picture** (the portal/Shadowblight candidates would mislead; the neutral panel is used). **Settlement:** the harbour is drawn only for `port-city` and `raiding-party`; every other settlement-only environment adds nothing.

## 5. Cover-selection algorithm

1. Resolve each member to a picture (above). 2. Group by picture id (two environments on one image are one candidate). 3. Score = class base (painting 100, strong 60, acceptable 50, biome 40) + 20 × (members on the picture ÷ list size). 4. Keep the top three; ties by larger share, earlier member, picture id. 5. Show them in catalogue order of their first member (the old behaviour for three paintings). Layout = number of tiles; 0 = neutral panel.

Consequences: a painting always gets a place; a strong fit always beats a biome; a biome that is most of a list can pass a lone acceptable fit; ten forest environments give one panoramic forest, not three copies; ten mixed-biome environments give three different biomes rather than the first three members. Adding or removing members re-derives the cover on the next render; nothing is stored. Duplicates cannot occur (`envsInList` walks the catalogue); stale ids in `envLists` are ignored by it.

## 6. Crop strategy

Landscape-first, `object-fit: cover`, `object-position: var(--pos)` per layout from the registry (single: y matters, 2-up: whole frame, 3-up: x matters). Archetype values are the Crop Lab's recommendations; unique paintings keep `ENV_ART_FOCUS` (a test keeps the two in step). No distortion, no zoom.

## 7. Performance

- Tile geometry unchanged (318 / 158.5 / 105.3 × 90). `sizes` per layout, AVIF `srcset` 320/640/960 (unique paintings keep 200/400/800), lazy + async decode, fixed height → no layout shift.
- A page fetches only the tiles it shows: ≤ 3 per card at 20–60 KB (320 px) to 40–145 KB (640–960 px). No PNG master ships; `dist/` holds the 64 derivatives and none of the source folders (verified).
- No per-card classification: one `Map` lookup per environment, an O(n) group-and-sort per card.

## 8. Visual QA

`node scripts/shoot-list-covers.js` → [adaptive-list-covers-review/](adaptive-list-covers-review/): `lists-1280x800`, `lists-1440x900`, `lists-1920x1080`, `lists-1440x900-dpr2`, `lists-1440x900-en`, `lists-phone-390-dpr2`, `hover-three-paintings`. 16 seeded lists on every page (empty; one painting / archetype / biome; two; three paintings; five forests; five mixed; ten mixed biomes; ten haunted; mixed priorities; universal-only; settlement-heavy; harbour plus streets; stale reference; haunted plus dark biomes). Machine checks in all six runs: all cards equal height (231 px at desktop), all covers 90 px, zero broken images, zero duplicate pictures in a cover, ≤ 3 tiles, no horizontal overflow, no console errors, every chosen file at least as wide as the device pixels it fills (1.0× at DPR 1 and 2, 1.17× on the phone). By eye: cards align in the existing grid; dark (haunted, underground) beside bright (drylands, harbour) reads as one family; the neutral panel is clearly quieter than any picture; hover brightens as before; RU and EN identical. Not checked: Safari/Firefox, fractional DPR, browser zoom.

Also exercised in the app: adding the first environment to an empty list turns the neutral panel into a picture and removing it turns it back; the language switch re-renders without touching covers. Create / rename / delete / open paths are untouched code (the only edits are inside the cover and the grid map), and `tests/list-rename.test.js` still passes.

## 9. Automated tests

`node --test tests/*.test.js`: **1544 pass, 0 fail** (39 new). They cover unique priority, strong/acceptable/poor resolution against real records, biome fallback, missing assets falling through, universal/settlement neutrality, harbour-only-by-override, exact-image dedup, tie-breaking, one/two/three layouts, > 3 candidates, repeated archetypes, list edits, stale references, determinism with a warm cache, registry integrity, file existence, `dist/` exclusion of masters, and `ENV_ART` / `ENV_ART_FOCUS` agreement. `validate-data`, `build`, `version-assets`, `check-asset-versioning`, `check-unlisted-build`, `check-journey2-build` all pass.

## 10. Remaining artwork limitations

- 130 environments (all `universal`, and settlement-only taverns, streets, vaults, ships) show the neutral panel; a list made only of them has no picture. Most-wanted art: a generic inland settlement scene and a universal/abstract scene (16:9, ≥ 1672 px).
- Only four archetypes have art; the other 24 take the biome picture until generated (add an `archetype()` line, a `variants` entry and `ARCHETYPE_FIT` rows).
- 23 of the 35 archetype uses are "acceptable" (right kind of place, not the exact building), e.g. a manor exterior for Neverhome's corridors.
- The ruins master is 3:2 (1536×1024), so its 640 px tile is 427 px tall; fine at 90 px.
- Forest-heavy and settlement-heavy catalogue weights mean forest, rolling and underground appear most often in mixed lists.
