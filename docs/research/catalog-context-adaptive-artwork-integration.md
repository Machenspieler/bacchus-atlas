# Catalog context-adaptive artwork integration (PD-089)

Production rollout, 2026-11-02. **Catalog only.** Session Prep thumbnails, the central Prep column, Journey and My Lists are untouched.

## 1. Existing Catalog behaviour
`.card-art` is 95 px wide (88 px under 640 px) and stretches to the card (measured 219–271 px at 1280/1440, up to 303 px at 1920). It drew the 1:3 biome strips `img/biomes/<biome>-{100,200,250,300}.avif` (+200 WebP) for all 329 environments: 13 distinct pictures, `settlement` and `universal` alone covering 158 cards. Paintings never appeared in the Catalog.

## 2. Research basis
Artwork Lab V3 ([catalog-prep-artwork-lab-v3.md](catalog-prep-artwork-lab-v3.md)) preferred Strategy C (thematic only where the picture survives the frame). Its ratings were one provisional reviewer's, from lab renders. They were **not** promoted blindly: every picture was re-reviewed as the real card at DPR 2 (short 221 px and tall 253–275 px cards), and the lab's marginal/poor split was kept only where that review agreed.

## 3. Implemented selection (`js/catalog-art.js`, `catalogArtHtml()`)
Order: own painting → explicit override (harbour = the existing settlement strip) → approved thematic picture → unchanged biome strip (`biomeArtHtml`, byte-identical). Thematic needs both gates: `ARCHETYPE_FIT` mapping (semantic) **and** a `PICTURES` entry with `use` = `all` / `strong` (only a strong fit) / `none` (contextual). No entry = never used. Deterministic, id-only, language-independent; no brightness/edge/aesthetic score. `ENV_KEEP_BIOME` (per-environment escape hatch) is empty.

## 4–5. Mappings and what stayed on biome
| Picture `use` | Pictures |
|---|---|
| `all` (21) | arcane-sanctums, archives-and-libraries, arenas-and-duels, crypts-and-tombs, drowned-depths, feasts-and-revelry, fey-and-enchanted, forgotten-ruins, infernal-and-profane, planar-rifts, sacred-sanctuaries, seafaring, sinister-woods, sky-realms, starfaring, storms-and-calamity, streets-and-towns, taverns-and-inns + the 3 paintings |
| `strong` (6) | blighted-mires, cursed-and-blighted-lands, dungeon-delves, haunted-and-deathly, perilous-passages, strongholds-and-sieges (dark, generic or small-subject in a strip; read fine for the place they show exactly) |
| `none` (4, not cut) | time-and-dream (a strip holds one of three seasons — premise lost), monster-lairs, chase-and-ambush, intrigue-and-underworld (marginal, and no environment has a strong fit, so they could never be drawn) |

Coverage on the real data (329 environments; `report.json`, `tests/catalog-art.test.js`):

| | Count |
|---|---|
| Mapped to a picture, any gate (122 = 117 fits + 3 paintings + 2 overrides) | 122 |
| **Switched to a new strip** | **97** = 45 strong + 47 acceptable thematic, 3 own paintings, 2 harbour overrides |
| Kept biome: picture only for strong fits, fit is "acceptable" (deferred for human review) | 17 |
| Kept biome: picture fails the strip / not cut (Time Loop ×2, Dragon's Lair, 3 ambush, 2 intrigue) | 8 |
| No fit mapped (biome, by design) | 207 |
| Missing imagery | 0 |

Distinct strips over the catalogue: 13 → 40. Ambiguous and kept on biome by design: Time Loop (biome portal is closer to its lore), Dragon's Lair, Haunted City and the other acceptable fits of dark pictures.
Not decided here: whether the 47 "acceptable" fits of `all` pictures (right kind of place and mood, not the exact building) deserve a second look; they come from the environment-by-environment My Lists review and look right in the strip, but are the first candidates for an art-director pass.

## 6–8. Crops and derivatives
Each used picture is cut **once** into a dedicated 1:3 window of its master (full height, 314 px wide on a 1672×941 master; 341 px on the 1536×1024 paintings), left edge at `x`% of the horizontal travel (`PICTURES[id].x`, derived from the lab's crop positions and verified in the card; e.g. seafaring 16 shows mast and sail, storms 94 shows the tornado, archives 16 the shelves). Independent of My Lists crops and Prep. Output `img/catalog-art/<stem>-{100,200,250,300}.avif` (quality 55) + `-200.webp`, Lanczos3, no sharpening/denoise/tint; the widest cut (300) never exceeds the window, so nothing is upscaled; 27 pictures × 5 files = 135 files, 3.3 MB on disk (≈ 120 KB per picture ladder). Pictures that cannot be drawn are not cut; the script deletes stale files. The card markup, `sizes` and lazy loading are the biome strip's, so one fixed 1:3 file serves every card height (the panel shows the top of the picture; `cover` only scales past 285 px).

## 9. Visual QA
`node scripts/shoot-catalog-art.js` loads the real catalogue twice per viewport — baseline = `catalog-art.js` stubbed to "always biome" (identical code and data) vs shipped — at 1280×800, 1440×900, 1920×1080, DPR 1 and 2. Screenshots (this folder): `grid-*` / `grid-mid-*` baseline vs final, `pair-<id>-{baseline,final}.jpg` for 20 environments (crypts, taverns, archives, mires, sky realms, drowned depths, seafaring, arenas, planar rifts, haunted, storms, starfaring, the three paintings, harbour, and negative cases Time Loop, Dragon's Lair, Haunted City, Gang Hideout), `catalog-final-{en,ru}-*.jpg`. Findings: all 329 cards identical in x, y, width, height, strip panel and title height between baseline and final in all six viewport/DPR combinations; no horizontal overflow; 0 broken images; 0 page errors or failed requests; no clipped titles or moved controls. The strongest results are the Hero's Tomb sarcophagus, the Teal Heart Inn hall, the Library of the Dusk Tree shelves, the Ocean Voyage ship, the Floating Mountains island and the Stop-the-Collapse rift; dark pictures (haunted, dungeon) read at DPR 2 but are the weakest, hence strong-fit only. Field of Dreams loses its standing stones in the strip but keeps the meadow.

## 10–11. Sharpness and delivery (browser-measured)
Sharpness = shipped file width ÷ device pixels drawn: minimum **1.05** at DPR 1 and 2 on every viewport (never < 1: no upscaling). Image requests and bytes, cold cache, whole catalogue walked (HTTP content-length):

| | Requests | DPR 1 | DPR 2 |
|---|---|---|---|
| Baseline | 13 | 129 KB | 447 KB |
| Final | 40 | 321 KB | 1027 KB |
| Lab Strategy C (landscape cuts) | 41 | 1333 KB | 2903 KB |

Typical first screen (1440×900): 7 → 11 requests, 76 → 102 KB at DPR 1 and 262 → 330 KB at DPR 2. Warm reload: 0 new image requests. Dedicated strips cut the lab's worst-case transfer by ≈ 76 % (DPR 1) and ≈ 65 % (DPR 2). Layout shift: none — geometry is identical before and after.

## 12. Tests
`tests/catalog-art.test.js` (18 tests): priority of paintings and overrides, mapping gate, contextual gate, ambiguous/rejected/unreviewed pictures, safe fallbacks, no dead assets and no stray files, 1:3 dimensions and no upscaling, deterministic and reproducible cuts, My Lists registry/resolution unchanged, Prep/Journey code never reading `CatalogArt`, geometry/markup contract, script order, build exclusions, coverage. Full suite 1614 pass / 0 fail; `validate-data` 0 errors; build, version-assets, check-asset-versioning, check-unlisted-build, check-journey2-build pass. The Artwork Lab V3 bridge now stubs `catalogArtHtml` so the lab's Strategy A stays the pre-rollout biome baseline (its 20 tests still pass).
Functional checks in the harness (search, biome+tier filter, detail open, random, add-to-list dialog, RU/EN) pass.

## 13. Known limitations
- Strips are one fixed crop per picture; a picture whose subject needs a different band for different cards cannot be tuned per environment (that is what `ENV_KEEP_BIOME` is for).
- Bytes rise (2.5× at DPR 1, 2.3× at DPR 2 for a full walk) because the catalogue now uses 40 pictures instead of 13; cost is only paid for pictures a visitor scrolls to.
- Quality ratings are still one reviewer's; 17 deferred and 47 acceptable-fit cases want an art-director look.
- Time & Dream, Monster Lairs, Chase & Ambush and Intrigue & Underworld pictures remain My Lists-only.

## 14. Future Session Prep
Prep tiles are 48 px squares fed from `-thumb-{48,96,144}.webp`; the lab found 17 of 28 pictures survive there and a 320 px landscape cut costs ≈ 430 KB. A Prep rollout needs its own square cuts and frame review (the lab's Prep ratings, e.g. planar-rifts marginal, differ from the strip's) and a new decision; nothing here reads or changes it.
