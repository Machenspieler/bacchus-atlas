# Semantic Artwork Reuse Lab V1

Research experiment, 2026-11-02. **No production behaviour changed**: Catalog, Session Prep, My Lists, Journey, the artwork registry
(`js/list-cover-art.js`, `js/catalog-art.js`), the classification and every saved list are untouched. The lab is `lab/semantic-reuse/`
(excluded from `dist/`, as is this report's evidence folder). Nothing here is a production approval and no `PD-` decision was appended.

Launch: `node scripts/semantic-reuse-lab.js` (regenerates data and the lab-only derivatives), serve the repo root with any static server
(the `atlas-lab` entry in `.claude/launch.json` serves port 8107) and open `/lab/semantic-reuse/`. Screenshots: `node scripts/shoot-semantic-reuse-lab.js`.

## The answer, first

**Does Semantic Artwork Reuse provide enough verified benefit to justify production integration? Not as a general crop framework.
At most a very small manual override table — and only after one more pilot.**

Evidence (6 of 28 sources, 18 candidate regions, 79 candidate environment mappings, all judged against the real lore):

- **13 regions survived**, 5 did not: average 2.2 usable regions per pilot source.
- Those 13 regions give **18 environments** at least one Strong/Acceptable mapping, but only **4 environments get a thematic picture they have nowhere today**
  (`city-festival`, `murder-mystery`, `pitched-battle`, `the-dungeoneer`) and **2 get a confirmed, visible improvement** on a picture they already wear
  (`bustling-marketplace`: the Catalog shows a clock tower, the lore is a market; `resting-dagger-inn`: the Catalog shows a market street, the lore is an inn).
  That is **5 of 329 environments (1.5 %) in Catalog and 5 in My Lists** (3 new + the same 2 improved; `murder-mystery` replaces `pitched-battle` in My Lists).
- The Prep figure (**16**) is real but misleading: Session Prep draws a biome thumbnail for every environment, so *any* thematic picture counts as "new" there.
  Most of those 16 already have a whole-archetype picture that the V3 lab showed Prep could use. It is evidence for "use thematic art in Prep", not for cropping.
- Most mappings are rejected or undecidable: **33 rejected and 16 needs-review against 30 Strong/Acceptable**. Environment descriptions rarely say what a crop shows.
  A clock tower, a docked ship, a still life and a lighthouse produced zero valid environments between them.
- **Cross-archetype reuse works but is rare**: 5 environments (1 Strong): `resting-dagger-inn`, `local-tavern`, `city-festival`, `murder-mystery`, `street-chase`.
- **Approach A (runtime CSS crop of the existing 960 px derivative) fails the Catalog at DPR 2** (0 of 11 usable frames). Approach B (pre-generated) works and costs
  ~5.4 KB (1x) / ~14 KB (2x) per Catalog frame, less than an existing 200 px strip (21.9 KB).

If the team wants anything from this, it is a **hand-written override table of about 4–6 environments** (`bustling-marketplace` → stalls, `resting-dagger-inn` → inn terrace,
`the-dungeoneer` → bar counter, `city-festival` → stalls, `pitched-battle` → trebuchet, `murder-mystery` → scholar's desk in My Lists) with pre-generated derivatives.
It is not worth generalising: the benefit is bounded by how many environment descriptions name something a crop can show.

## 1. Research objective

Can the 28 archetype illustrations provide more useful visual coverage by exposing independently usable subjects? The lab separates two concepts the existing system merges:
the **semantic region** (what an existing master visibly depicts, in normalised coordinates, with a parent artwork identity) and the **context crop** (how that region is framed in one frame:
focal x / y and zoom). An environment's canonical archetype is never changed to reuse a picture.

## 2. Current artwork architecture (verified from the repository)

- `js/list-cover-art.js`: 28 `archetype:*` pictures cut from masters by `scripts/generate-list-covers.js` (whole frame, 320/640/960 AVIF + 640 WebP, framed at display time by `object-position`),
  3 paintings, 12 biome pictures; `ARCHETYPE_FIT` (117 environments), `UNIQUE_ENV_IDS` (3), `ENV_IMAGE_OVERRIDES` (2).
- `js/catalog-art.js` (PD-089): 1:3 strips cut once per picture (`img/catalog-art/`, 100/200/250/300 AVIF + 200 WebP), two gates (mapped in `ARCHETYPE_FIT` and reviewed in the real strip).
  Catalog baseline, recomputed: **3 paintings + 2 overrides + 92 thematic = 97 pictures, 232 biome strips** (`stats.json`).
- Session Prep draws the biome thumbnail (48/96/144 WebP) for all 329 environments. My Lists: 3 unique + 2 override + 117 archetype + 118 biome + 89 none; deduplicates by image identity, `COVER_MAX = 3`.

## 3. The model

Region: `{ id: '<source>-<slug>', sourceId, label, description, bounds {x, y, width, height} (0..1, source-normalised), subject (focal subject, region-normalised; optional per-frame `subjects`), status, notes, contexts {frame: {verdict, note, framing?}} }`.
Mapping: `{ regionId, envId, review: strong | acceptable | rejected | needs-review, reason, improves }`. The pure logic is `lab/semantic-reuse/lab-core.js`; the curated data is `lab/semantic-reuse/data.js`; neither is read by the app.
Frames: Catalog 95×249, Prep 48×48, My Lists 318×90 / 158×90 / 105×90, each at DPR 1 and 2 (geometry re-verified against `css/styles.css` and the registry).

## 4. Source master inventory

All 28 masters (plus one unused portrait variant) exist; **none is missing**. All are about 1672×941 PNG (one is 1536×1024), 2.4–3.6 MB, in `img/cover-archetypes-source/` (excluded from `dist/`).
No Catalog, My Lists or Prep derivative was used as a crop source: every region and every lab derivative is cut from the master in one resample.

| Source | File | Dimensions | Format | Size | Existing derivatives | Production use |
|---|---|---|---|---|---|---|
| arcane-sanctums | `arcane-sanctums-landscape.png` | 1672×941 | png | 2.48 MB | list-covers 320/640/960 · strips 100–300 (all) | archetype picture, 7 fits |
| archives-and-libraries | `archives-and-libraries.png` | 1671×941 | png | 2.47 MB | list-covers 320/640/960 · strips 100–300 (all) | archetype picture, 3 fits |
| arenas-and-duels | `arenas-and-duels.png` | 1671×941 | png | 2.60 MB | list-covers 320/640/960 · strips 100–300 (all) | archetype picture, 2 fits |
| blighted-mires | `blighted-mires.png` | 1671×941 | png | 2.71 MB | list-covers 320/640/960 · strips 100–300 (strong) | archetype picture, 9 fits |
| chase-and-ambush | `chase-and-ambush.png` | 1672×941 | png | 2.82 MB | list-covers 320/640/960 · strips 100–300 (none) | archetype picture, 3 fits |
| crypts-and-tombs | `crypts-and-tombs.png` | 1672×941 | png | 2.30 MB | list-covers 320/640/960 · strips 100–300 (all) | archetype picture, 6 fits |
| cursed-and-blighted-lands | `cursed-and-blighted-lands.png` | 1672×941 | png | 2.90 MB | list-covers 320/640/960 · strips 100–300 (strong) | archetype picture, 2 fits |
| drowned-depths | `drowned-depths.png` | 1672×941 | png | 3.05 MB | list-covers 320/640/960 · strips 100–300 (all) | archetype picture, 3 fits |
| dungeon-delves | `dungeon-delves.png` | 1670×941 | png | 2.41 MB | list-covers 320/640/960 · strips 100–300 (strong) | archetype picture, 2 fits |
| feasts-and-revelry | `feasts-and-revelry-landscape.png` | 1672×941 | png | 2.52 MB | list-covers 320/640/960 · strips 100–300 (all) | archetype picture, 8 fits |
| fey-and-enchanted | `fey-and-enchanted.png` | 1672×941 | png | 3.11 MB | list-covers 320/640/960 · strips 100–300 (all) | archetype picture, 2 fits |
| forgotten-ruins | `forgotten-ruins-landscape.png` | 1536×1024 | png | 3.28 MB | list-covers 320/640/960 · strips 100–300 (all) | archetype picture, 10 fits |
| haunted-and-deathly | `haunted-and-deathly-landscape.png` | 1672×941 | png | 2.78 MB | list-covers 320/640/960 · strips 100–300 (strong) | archetype picture, 10 fits |
| infernal-and-profane | `infernal-and-profane.png` | 1672×941 | png | 2.59 MB | list-covers 320/640/960 · strips 100–300 (all) | archetype picture, 5 fits |
| intrigue-and-underworld | `intrigue-and-underworld.png` | 1671×941 | png | 2.45 MB | list-covers 320/640/960 · strips 100–300 (none) | archetype picture, 2 fits |
| monster-lairs | `monster-lairs.png` | 1672×941 | png | 2.73 MB | list-covers 320/640/960 · strips 100–300 (none) | archetype picture, 1 fits |
| perilous-passages | `perilous-passages.png` | 1670×941 | png | 2.71 MB | list-covers 320/640/960 · strips 100–300 (strong) | archetype picture, 4 fits |
| planar-rifts | `planar-rifts.png` | 1671×941 | png | 2.51 MB | list-covers 320/640/960 · strips 100–300 (all) | archetype picture, 6 fits |
| sacred-sanctuaries | `sacred-sanctuaries.png` | 1671×941 | png | 3.02 MB | list-covers 320/640/960 · strips 100–300 (all) | archetype picture, 2 fits |
| seafaring | `seafaring.png` | 1672×941 | png | 2.63 MB | list-covers 320/640/960 · strips 100–300 (all) | archetype picture, 2 fits |
| sinister-woods | `sinister-woods.png` | 1672×941 | png | 2.74 MB | list-covers 320/640/960 · strips 100–300 (all) | archetype picture, 5 fits |
| sky-realms | `sky-realms.png` | 1672×941 | png | 2.57 MB | list-covers 320/640/960 · strips 100–300 (all) | archetype picture, 3 fits |
| starfaring | `starfaring.png` | 1671×941 | png | 2.68 MB | list-covers 320/640/960 · strips 100–300 (all) | archetype picture, 1 fits |
| storms-and-calamity | `storms-and-calamity.png` | 1672×941 | png | 2.94 MB | list-covers 320/640/960 · strips 100–300 (all) | archetype picture, 6 fits |
| streets-and-towns | `streets-and-towns.png` | 1670×941 | png | 3.11 MB | list-covers 320/640/960 · strips 100–300 (all) | archetype picture, 5 fits |
| strongholds-and-sieges | `strongholds-and-sieges.png` | 1672×941 | png | 2.64 MB | list-covers 320/640/960 · strips 100–300 (strong) | archetype picture, 2 fits |
| taverns-and-inns | `taverns-and-inns.png` | 1672×941 | png | 2.40 MB | list-covers 320/640/960 · strips 100–300 (all) | archetype picture, 4 fits |
| time-and-dream | `time-and-dream.png` | 1672×941 | png | 3.46 MB | list-covers 320/640/960 · strips 100–300 (none) | archetype picture, 2 fits |
| haunted-and-deathly-portrait (unused variant) | `haunted-and-deathly-portrait.png` | 1024×1536 | png | 2.82 MB | — | not used |

The three unique paintings and the biome sources were not used: reusing a painting dilutes its unique-art status, and the biome masters were not inspected for regions.

## 5. Pilot selection rationale

Six sources, chosen after a contact sheet of all 28 and full-size looks (the suggested list was a starting point, not a mandate): **streets-and-towns** (urban: market, street, inn, tower),
**taverns-and-inns** (interior: hearth, bar, still life), **archives-and-libraries** (interior: shelves, desk, window hall), **strongholds-and-sieges** (fortress: siege engine, wall),
**starfaring** (sci-fi: ship, orbit, promenade), **seafaring** (maritime: deck, lighthouse, sea). No two are visually alike. The unpiloted source with the most promise is
**intrigue-and-underworld** (market lane, desk, arch), then **sacred-sanctuaries**.

## 6. Regions: proposed, approved, rejected

18 proposed → **13 approved**, 2 needs-better-crop, 1 insufficient-resolution, 2 not-independently-meaningful.

| Region | Status | Region px | Catalog | Prep | Lists 1/2/3 |
|---|---|---|---|---|---|
| `streets-and-towns-market-stalls` | approved | 568×772 | ✔ | ✔ | ✔· / ✔ / ✔ |
| `streets-and-towns-market-street` | approved | 752×612 | ✔ | ✘ fail | ✔ / ✔ / ✔ |
| `streets-and-towns-tavern-terrace` | approved | 501×659 | ✔ | ✔ | ✔· / ✔ / ✔ |
| `streets-and-towns-clock-tower-gate` | not-independently-meaningful | 367×583 | ✘ unreviewed | ✘ unreviewed | ✘ framing / ✘ framing / ✘ unreviewed |
| `taverns-and-inns-fireplace` | approved | 635×612 | ✔ | ✔ | ✔· / ✔ / ✔ |
| `taverns-and-inns-bar-counter` | approved | 702×471 | ✔ (DPR2 limited) | ✔ | ✔ / ✔ / ✔ |
| `taverns-and-inns-dining-table` | not-independently-meaningful | 752×358 | ✘ framing | ✘ framing | ✘ framing / ✘ unreviewed / ✘ unreviewed |
| `archives-and-libraries-shelves-ladder` | approved | 602×471 | ✔ (DPR2 limited) | ✔ | ✔· / ✔ / ✔ |
| `archives-and-libraries-scholars-desk` | approved | 1036×471 | ✘ framing | ✔ | ✔ / ✔ / ✔ |
| `archives-and-libraries-window-hall` | approved | 585×518 | ✔ | ✔ | ✘ framing / ✔ / ✔ |
| `strongholds-and-sieges-trebuchet` | approved | 418×565 | ✔ | ✔ | ✘ framing / ✔ / ✔ |
| `strongholds-and-sieges-castle-walls` | approved | 920×471 | ✔ (DPR2 limited) | ✔ | ✔ / ✔ / ✔ |
| `starfaring-spaceport-promenade` | needs-better-crop | 836×800 | ✘ unreviewed | ✘ unreviewed | ✘ framing / ✘ unreviewed / ✘ unreviewed |
| `starfaring-docked-ship` | approved | 535×376 | ✘ framing | ✘ framing | ✔· / ✔ / ✘ fail |
| `starfaring-orbital-arch-planet` | approved | 752×423 | ✔ (DPR2 limited) | ✔ | ✔ / ✔ / ✔ |
| `seafaring-deck-rigging` | approved | 836×753 | ✔ | ✔ | ✔ / ✔ / ✔ |
| `seafaring-lighthouse-coast` | insufficient-resolution | 368×329 | ✘ resolution | ✘ resolution | ✘ resolution / ✘ resolution / ✘ resolution |
| `seafaring-storm-waves` | needs-better-crop | 920×471 | ✘ framing | ✘ unreviewed | ✘ unreviewed / ✘ unreviewed / ✘ unreviewed |

Legend: ✔ usable in that frame; a `·` after a ✔ means DPR 2 is limited (the DPR 2 file is upscaled by at most 1.19×); ✘ with a word says why (framing = the focal subject is cut away; resolution; fail = the human verdict;
unreviewed = the region itself is not approved). A My Lists crop must hold in all three layouts it may be dealt into to count.

**Rejected or weak, with reasons** (the lab's negative examples):

- `streets-and-towns-clock-tower-gate`: beautiful, but no environment describes an ordinary clock tower. Its literal matches are the frozen arcane `cosmological-clocktower`, the haunted `castle-of-wails`, the wizard's `archmages-tower` and the sci-fi `sovereignty-outpost`: all **rejected** (ordinary tower ≠ magical tower).
- `taverns-and-inns-dining-table`: a still life that says "food", not tavern or feast.
- `seafaring-lighthouse-coast`: the lighthouse is about 50 px in the master; every frame would enlarge a smudge. The resolution-insufficient example (the subject-size rule, `SUBJECT_MIN_PX`, in `lab-core.js`).
- `starfaring-spaceport-promenade`: reads as a fantasy market hall; the sci-fi evidence is outside the crop.
- `seafaring-storm-waves`: generic open water.

## 7. Source-resolution analysis

Resolution is computed from the part of a region that **survives `object-fit: cover`**, not from the region size: a Catalog strip (95×249) takes only a ~38 %-wide slice of a square region.

- **Catalog 95×249** (190×498 at DPR 2): 11 usable frames, 4 limited at DPR 2. The slice is narrow, so the *focal subject* rather than the pixel count is what fails (desk, docked ship, still life).
- **Prep 48×48**: pixels are never the problem (every crop is 2–6× over); recognisability is. `market-street` fails the human verdict (the figures dissolve).
- **My Lists 318×90 (1 tile)**: the band slices a tall region; 5 of 11 usable frames are limited at DPR 2. Tall regions (trebuchet, window hall) fail as a band.
- **Not run**: a browser-measured sharpness audit (decoded `naturalWidth` against rendered size) of the lab's frames. The lab reports the computed requirement per frame and DPR (`stats.json`) and flags upscaled derivatives (13 of 127).

## 8. Context-specific rendering results

Usable of the 13 approved regions: Catalog 11, Prep 11, My Lists 1-tile 11, 2-tile 13, 3-tile 12. Screenshots: `screens/03-contexts-*`, `04-contexts-*`.

- **Catalog**: crops are more specific than the strip they replace for market, inn terrace, hearth and trebuchet. They are **no better** than the existing strip for castle walls, ship deck and shelves (the existing Seafaring and Archives strips already sit at x16): there the region is the archetype picture again.
- **Session Prep**: fireplace, stalls, orbit, trebuchet and shelves read at 48 px; the busy street does not. Prep gains from any thematic picture, so this mostly restates V3.
- **My Lists**: wide regions (desk, bar, castle) make the best bands. A cover may hold **one region per parent illustration** (`Core.dedupeByParent`, tested): two crops of one painting would read as repetition while being dedupe-distinct. The lab's companion tiles are unchanged production pictures; the production composition was not touched.

## 9. Semantic environment mappings

79 mappings (`review-export.json`): **8 strong, 22 acceptable, 33 rejected, 16 needs-review.** Each carries a written reason in terms of the environment's lore. Highlights:

- Strong: `bustling-marketplace` ← market stalls; `resting-dagger-inn` ← inn terrace; `local-tavern` ← bar counter; `library-of-the-dusk-tree` ← shelves; `castle-siege` ← trebuchet and walls; `planetary-blockade` ← orbit; `ocean-voyage` ← deck.
- Needs review (not counted): `port-city`, `city-streets` (the lore says toxic smog and peddlers; the crop is picturesque), `the-skyship-windfall` (a skyship: the crop shows a sea), `capital-ship-high-alert`, `fortress` (burning and besieged against "army drills"), `defense-of-the-river-fort` (a ballista, not a trebuchet).
- Rejected: market stall → `the-undermarket`, `chaotic-marketplace`, `the-garden`; bright terrace → `jazz-speakeasy`; hearth → `the-dungeoneer` (lore: subterranean, this room has a big window); shelves → `the-waking-archives`, `para-lichs-archive`; window hall → `hallowed-cathedral`; castle walls → `hallowed-cathedral`, `ruined-castle`; deck rigging → `undersea-trench`, `deep-one-city`, `raiding-party`; trebuchet → `fallen-citadel`.

## 10. Cross-archetype reuse examples

Five environments reach a picture from a different archetype's master, each explicitly reviewed and none re-classified: `murder-mystery` (intrigue) ← scholar's desk (map, magnifying glass, scrolls: Acceptable);
`city-festival` (feasts) ← market stalls (bread and produce: Acceptable); `street-chase` (chase) ← market street (Acceptable); `resting-dagger-inn` and `local-tavern` (taverns) ← inn terrace (Strong / Acceptable).
Screens: `06-cross-*`. They are the genuinely new reach of the idea, and they are few.

## 11. Coverage (recomputed from the current data, 329 environments)

| | Catalog | Prep | My Lists |
|---|---|---|---|
| Themed now (painting / override / thematic) | 97 | 0 (biome only) | 122 |
| Environments with a usable approved crop | 17 | 16 | 17 |
| Newly covered (no themed picture today) | 3 | 16 | 3 |
| Improved (themed today, confirmed better) | 2 | 0 | 2 |
| **Net improvement** | **5** | **16** | **5** |

Catalog new: `city-festival`, `pitched-battle`, `the-dungeoneer`; improved: `bustling-marketplace`, `resting-dagger-inn`. My Lists new: `city-festival`, `murder-mystery`, `the-dungeoneer`, same two improved.
Prep: every approved environment (see the caveat above). Counted once each: 30 environments have a non-rejected candidate; 18 have a Strong/Acceptable match on an approved region; 16 gain in at least one context; **4 are unlocked by crops** (no thematic option anywhere today).
Not counted: needs-review (16), rejected (33), mappings on unapproved regions, unreviewed frames. `ocean-voyage`, `local-tavern`, `castle-siege` and the like already wear an equally appropriate picture, so they are not gains.
Other metrics: source files inspected 29 (28 + 1 variant; 6 piloted, all 28 scanned); regions proposed 18; passing visual QA 13; passing resolution 13 (in at least one frame); mappings on approved regions that count 30; average usable regions per pilot source 2.17.

## 12. Full-library opportunity scan (preliminary, not approved assets)

From a contact sheet of all 28 masters plus the pilots: **high 7** (archives, intrigue-and-underworld, sacred-sanctuaries, seafaring, starfaring, streets-and-towns, taverns), **medium 11**, **low 10** (three of them judged not viable: cursed lands, sinister woods, storms).
The table with reasons is the lab's *Library scan* tab (`SCAN` in `data.js`). Only the pilots were reviewed region by region; the rest are estimates, and the pilot itself shows that estimates overstate (a "high" source yielded a rejected tower and a rejected still life).

## 13. Real examples where cropping helps (`screens/05-abc-*`)

- `bustling-marketplace`: the Catalog strip is a clock tower and an archway; the stall-and-vendor crop is the market the lore describes.
- `resting-dagger-inn`: the strip is a market street; the terrace shows the griffin sign, the awning and drinkers.
- The fireplace and trebuchet crops are the most legible strips of the pilot (one strong focal subject).

## 14. Real examples where cropping fails

- The ordinary clock tower (no honest match), the still life, the lighthouse (resolution), the docked ship (a long hull cannot live in a 1:2.6 strip), the scholar's desk in Catalog (a 2.2:1 region) and the trebuchet as a My Lists band.
- Crops of a picture the Catalog already uses (castle walls, deck and rigging, shelves) add nothing: the existing strip is that crop.

## 15. Asset optimisation findings

127 lab-only files (852.9 KB AVIF + 210.4 KB WebP; WebP only for Catalog @2x, as production keeps one 200 px WebP fallback). One resample per file from the master, Lanczos3, no sharpening, no AI upscaling, no blur, no stretch;
names `<region>--<frame>-<w>x<h>.avif` in `lab/semantic-reuse/derivs/` (index: `derivs-manifest.json`). Average per usable frame, AVIF 1x / 2x: Catalog 5.4 / 14.0 KB, Prep 1.0 / 2.7 KB,
My Lists 1-tile 6.9 / 16.7 KB, 2-tile 4.1 / 12.1 KB, 3-tile 3.1 / 9.3 KB. For comparison the existing 200 px Catalog strips average 21.9 KB and the 640 / 960 list-cover AVIFs 48.5 / 94.1 KB.

## 16. Runtime cropping (A) versus pre-generated derivatives (B)

| | A · CSS crop of the existing 960 px file | B · pre-generated per frame |
|---|---|---|
| Sharpness | Catalog: DPR 1 ok for 10 of 11 frames, **DPR 2 for 0 of 11** (the file would have to be drawn over 1000 css px wide to show a ~35 % slice at 95 px, so the 960 px derivative is upscaled); Prep fine; 3-tile fine | exact: cut from the master for that frame and DPR |
| Transfer | downloads a 48–96 KB picture to show a strip | 5–14 KB per Catalog frame, at most 17 KB per list tile |
| Runtime | per-picture CSS offsets and zoom for every frame | none: the frame is the file, like today's strips |
| Cache | shares the existing files (no new assets) | new files per region × frame × DPR (127 for 13 regions) |
| Build | none | one script (this lab's is the prototype) |
| Aspect ratios | free (CSS) | one file per frame |

From this evidence: **B for Catalog and the My Lists 1-tile; A is adequate only for Prep and the 2/3-tile covers**, and B's per-frame file count is the real maintenance cost. No permanent architecture is chosen here.

## 17. Visual QA

`docs/research/semantic-artwork-reuse-lab-v1/screens/` (WebP, q80): 1280×800, 1440×900, 1440×900 at DPR 2 and 1920×1080 for the editor and context views, plus each required scenario: full source with regions (`01-*`, `09-*`),
close-up (`02`), one region in Catalog / Prep / My Lists (`03`, `04`), existing vs full vs crop (`05`), biome vs crop (`06-cross-city-festival`: the Catalog A is the biome strip), strong (`05`), rejected (`07`),
weak and insufficient (`08`), several regions from one source (`09`), cross-archetype (`06`), the approved grid with the size comparison (`10`), coverage, library and export.
`browser-audit.json`: no page error, console error or failed request in any capture.

Caveats, stated plainly: the images were judged by the same reviewer who wrote the verdicts, from DPR 1 and 2 captures; a human art review of the 13 approved regions has **not** happened and every verdict is provisional.
The real Catalog card keeps its own height, so it shows only the top of the 95×249 frame; the whole frame is drawn beside it.

## 18. Test results

`tests/semantic-reuse-lab.test.js` (22 tests): bounds, normalised ↔ pixel conversion (including an edge-rounding case that broke the first draft), zoom/pan identity, DPR maths, subject survival and subject size, independent contexts,
missing masters, invalid coordinates, stable parent ids, cross-archetype without taxonomy change, rejected / needs-review / unreviewed never counted, unique-id coverage, per-context coverage, versioned and validated export
(with tamper cases), lab isolation, and production Catalog / Prep / My Lists / registry behaviour pinned.
Full suite **1636 / 1636 pass**; `validate-data.js` 0 errors (2 existing warnings); `build.js`, `version-assets.js`, `check-asset-versioning.js`, `check-unlisted-build.js` and `check-journey2-build.js` pass; `dist/` holds no `lab/` and no lab evidence.
Not executed: a browser-measured sharpness audit (§7) and a phone-width pass of the lab itself (a desktop research tool).

## 19. Maintenance considerations

Every crop is a hand-judged (region × environment × frame) tuple that goes stale silently when an environment's lore, a master or a frame's size changes; the tests pin counts, but nothing re-judges the lore.
A generalised system needs a review tool (this lab), a derivative generator, a registry, a one-region-per-parent cover rule and a regression harness, to serve single-digit environments.
A 4–6 entry override table beside `ENV_IMAGE_OVERRIDES` carries nearly all of the measured value at a fraction of that cost.

## 20. Recommendations for a possible production rollout

1. **Do not build a generalised crop framework** on this evidence.
2. If wanted: a small manual override for about 4–6 environments (see the answer), pre-generated per frame, one region per parent in a cover, each approved by a human (the verdicts here are one reviewer's first pass, not approval).
3. Run one more pilot on `intrigue-and-underworld`, `sacred-sanctuaries` and `dungeon-delves` before closing the idea: the strongest unpiloted sources, and `intrigue` is currently marked "not cut" in the Catalog.
4. Prefer the adjacent, cheaper win the Prep figure points at: thematic archetype pictures in Session Prep (the V3 question), which this lab suggests is larger than anything cropping adds.
5. Keep the lab: it is the review tool, its export (`review-export.json`) is schema-versioned, and none of it touches production.
