# Artwork Crop & Integration Lab — report on the first pair (Haunted & Deathly)

Experiment only. Nothing in `js/`, `css/`, `data/`, `index.html` or the build was changed; the Catalog, Session Prep, My Lists and Journey are byte-identical to `c09ec38`. Background: [lists-cover-archetypes.md](lists-cover-archetypes.md), [lists-cover-pilot-artwork.md](lists-cover-pilot-artwork.md).

## What was built

`.claude/mockups/artwork-crop-lab/artwork-crop-lab.html` (+ `.css`, `.js`, `assets/`). `.claude/` is never copied into `dist/`, so the lab cannot ship. Open it from the repo root:

```bash
python3 -m http.server 8107
```

then `http://localhost:8107/.claude/mockups/artwork-crop-lab/artwork-crop-lab.html` (the `atlas-lab` entry in `.claude/launch.json` does the same).

- **Real markup, real CSS.** It links `css/styles.css` untouched and reproduces `cardHtml` / `biomeArtHtml`, `envPickerRowHtml`, `listCardHtml` / `listCoverHtml` from `js/app.js`. The one lab-side rule is `overflow: hidden` on `.card-art`, which production never needs because its image always fits; a zoomed image does.
- **Measured, not assumed.** Catalog strip 95 × 249 px (the card's own height, three-line lore), Prep thumb 48 × 48, Lists tiles 318 / 158.5 / 105.3 × 90 px. The lab re-measures these from the rendered markup and feeds them to the crop inspector.
- **Real CSS cropping.** `object-fit: cover; object-position: x% y%` plus `transform: scale(z)` about the same point, on an image inside a fixed `overflow: hidden` box. Containers never resize. The inspector's crop windows use the same math (`visibleRect`).
- **Crop state** is per context × per source (Landscape and Portrait need different focal points), kept in memory only — no storage, no production script.
- **Sections:** controls (context, source, compare / single, environment, X / Y / zoom, brightness / contrast, presets, reset, copy JSON / CSS); A Catalog; B Prep (compare + mixed list); C My Lists (scenarios 1–5); D crop inspector with overlay toggles; E stress tests (actual sizes, beside warm biome art, six-fold repetition, four dark-to-light surfaces); F matrix and three strategy mock-ups with a per-context pick; G live config JSON / CSS.
- Brightness / contrast are lab-only preview filters. Nothing is applied automatically.

## Verification

| Check | Result |
| --- | --- |
| Both preview WebPs load (1280×720, 800×1200); masters present (1672×941, 1024×1536), checked by `HEAD`, never decoded | pass |
| Zero broken images; no horizontal overflow at 1280×800, 1440×900, 1920×1080 | pass |
| Source switching, X / Y / zoom, presets, Reset crop / Reset all, collapse, overlays, inspector master switch | pass (driven in the browser pane) |
| Isolation: moving Catalog · Landscape changed exactly one `(context, source)` group of images and no other | pass (DOM style snapshot before / after) |
| Copy settings | JSON / CSS are generated live; the clipboard write itself was not exercised in the embedded pane (falls back to a selectable `<pre>` plus a toast) |
| `node --test tests/*.test.js` | 1495 / 1495 pass |
| `validate-data.js` | 0 errors, 2 existing warnings |
| `build.js` → versioning, unlisted, Journey 2 checks | pass; `dist/` contains no `.claude/` |
| `git diff` on tracked files | empty |

Not checked: touch / phone widths (the lab is desktop-only by brief), and the rendered fidelity of the zoom math against a pixel reference (derived analytically; consistent with what the previews show).

## Findings — a first read, mine, not yet yours

These are my own reading of the lab. The starting crops are informed guesses from where the manor sits in each master and are **not experimentally verified**; please judge them in the lab and override.

| Context | Landscape | Portrait | Read |
| --- | --- | --- | --- |
| Catalog strip (95 × 249) | Manor facade and fog reads; no moon, tower mostly cut | Moon, ruined tower, manor, path: the whole scene in one column | Portrait is richer, but landscape is **not** meaningless after cropping. Modest gain. |
| Prep thumb (48²) | Dark gothic silhouette with fog | Same, slightly more sky and moon | Effectively a tie at this size. |
| Lists single (318 × 90) | A wide manor band, the strongest result in the lab | A 19 %-tall slice of the facade; reads but loses the tower | Landscape clearly better. |
| Lists 2-up / 3-up | Landscape survives (2-up shows nearly the whole frame) | Portrait gets cropped to a band, losing its advantage | Landscape better or equal. |

- **Dark art beside warm paintings.** The new image is cold, low-key and noticeably darker than every biome painting. In the mixed Prep list and the Catalog stress row it reads as a deliberate "night" tile rather than a defect, but it is the quietest picture in any collage. A modest lift (brightness ≈ 115–130 %) is worth trying in the lab before any decision; the warm lantern / window accents are what carry it.
- **Repetition is the real problem, not the crop.** Three identical panels (scenario 4) and six identical Catalog strips are visibly repetitive however well framed. A single hero, or a collage that mixes in biome fallback, avoids it. This argues for a few variants of popular archetypes, not for a portrait master.
- **Crop and aspect limits.** The 90 px Lists strip is ≈ 3.5 : 1 for one tile and ≈ 1.2 : 1 for three, so the landscape master keeps its whole width in a wide hero but only the middle ≈ 66 % in a three-panel; the portrait master is cut to a thin band in every wide context. The Catalog strip height depends on the card (150–250 px), so its crop must tolerate a range of heights. The previews are 1280 / 800 px wide; high zoom values were not evaluated for softness.

## Does the two-master strategy survive?

Evidence from this one pair: **Strategy C-by-default looks like Strategy A with one exception.** Landscape wins or ties in Prep, every Lists layout, and is acceptable in the Catalog; portrait's only clear gain is a richer Catalog strip. That gain is real but modest, and it costs a second image per archetype (28 → 56). I would not commit to two masters on this evidence; the cheaper next experiment is a single landscape master composed with the Catalog strip in mind (manor and tower in a vertically cuttable column), and the Strategy A mock-up in section F is the place to judge it. This is a recommendation to look again, not a decision — one archetype is a small sample, and the Catalog is where the portrait helps, so your own visual verdict on that strip should settle it.

## Suggested configuration (lab-only)

The lab's export has this shape (per context: source, `x`, `y`, `zoom`; plus per-source values and the brightness / contrast used):

```json
{
  "archetype": "haunted-and-deathly",
  "sources": { "landscape": "…", "portrait": "…" },
  "adjustments": { "brightness": 1, "contrast": 1 },
  "crops": {
    "catalog":     { "source": "portrait",  "x": 90, "y": 50, "zoom": 1 },
    "prep":        { "source": "portrait",  "x": 30, "y": 30, "zoom": 1 },
    "listsHero":   { "source": "landscape", "x": 50, "y": 34, "zoom": 1 },
    "listsPanel2": { "source": "landscape", "x": 50, "y": 40, "zoom": 1 },
    "listsPanel3": { "source": "landscape", "x": 88, "y": 40, "zoom": 1 }
  }
}
```

These are the lab's initial values, not approved crops. Two things the real CSS taught the structure: `x` only matters on the axis that overflows (so a context needs just the overflowing axis, and which one flips between sources), and the Lists panel needs separate entries for one, two and three tiles because the aspect changes with the count. Not wired into production.

## Housekeeping flagged, not changed

`scripts/build.js` copies everything not excluded, and `img/cover-archetypes-source/` (two ≈ 3 MB PNG masters) is not in `EXCLUDE_PATHS` like `img/biome-artwork-source/` is. They are untracked, so CI would not ship them today, and they were left uncommitted; a local `node scripts/build.js` does copy them into `dist/`. Adding that path to `EXCLUDE_PATHS` before the masters are ever committed is a one-line change for you to approve.
