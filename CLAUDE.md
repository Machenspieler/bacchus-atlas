# Bacchus's Atlas

A Daggerheart™ Compatible field guide to environments, journeys, and perils —
search, filters, an RU/EN toggle, and clickable dice inside property text.
Static site, no build step: `index.html` loads `css/styles.css` and
`js/app.js` directly; content lives under `data/*.json`. Deployed
public-but-unlisted (see [docs/product-decisions.md](docs/product-decisions.md)
PD-003) via GitHub Pages.

This file is a concise, project-wide index. Detailed procedures, schemas,
and feature specs live in the canonical files linked from each section below
— when this file and a linked file disagree, the linked file wins; fix this
file's summary rather than trusting it over the detail.

## Branding

The project name is "Bacchus's Atlas" / "Атлас Бахуса"
(`app_title`/`app_subtitle*` in `data/i18n.json`, rendered by
`renderHeader()`). "Daggerheart™ Compatible" (`compatibility_label`) is a
separate compatibility statement — never part of the brand name, never
translated, never inside the `<h1>` or the logo's accessible name, always
visually secondary. Do not put "Daggerheart" in the project title, logo, or
main brand name, and do not imitate the official Daggerheart logo/artwork.
"Daggerheart" itself stays correct and expected in `source` attributions,
rules terminology, and compatibility documentation — check an occurrence
against [docs/product-decisions.md](docs/product-decisions.md) PD-004
before a blind find-and-replace.

## Identity

This project is published under one identity only:

    Machenspieler <machenspieler@gmail.com>

Never write the following anywhere in this project — not in code, comments,
commit messages, commit author/committer fields, documentation, or
generated output:

- the name `obfuscated`
- `obfuscated`
- `obfuscated`

This includes any real-name or work-address form of them. The repo-local
git config already sets the correct `user.name`/`user.email`; do not
override it, and do not fall back to a globally configured or
auto-detected identity.

## Technology

Plain HTML/CSS/JS, no framework, no runtime dependency and no bundler for
the site itself. All user data (language, lists, Journey saves, Prep) lives in the browser's
`localStorage`, loaded/written through a single safe-storage boundary — never touches `environments.json` or any
server. Deployment is copy-and-version, not a real build: GitHub Actions
copies the runtime files into `dist/` and stamps in content-hash cache
versions; there is no compilation, transpilation, or bundling step. See
[docs/architecture.md](docs/architecture.md) for the full map (entry point,
script load order, state ownership, rendering boundaries, and the build
pipeline in detail).

`package.json` exists only for one dev-only offline tool
(`scripts/generate-adversary-art.js`, which uses `sharp` to pre-generate
Prep adversary art derivatives — see
[docs/architecture.md](docs/architecture.md)'s "Adversary artwork data and
generation"); nothing under `dist/` or the runtime `js/`/`css/` loads
anything from `node_modules/` (gitignored), and this doesn't relax the
"no runtime dependency" rule above.

## Critical invariants

The rules below apply to nearly every change in their area. Each links to
where the full detail actually lives — read that file before touching the
area, don't rely on the summary alone.

### Biome tagging

Every environment's `biomes` array uses eleven fixed terrain ids, checked
first in priority order, falling back to `settlement`/`universal` only when
none fit. Never add a new biome id. Full table and tagging rules:
[docs/data-contracts/environments.md](docs/data-contracts/environments.md).

### Automatic asset versioning

Cache-busting is generated at build time from file contents — never add a
hand-maintained `?v=` or a `DATA_VERSION`-style constant. Source
`index.html` stays version-free (`data-cache-version="ui"` markers, empty
version meta tags); `scripts/version-assets.js` fills in `dist/index.html`
only, and `scripts/check-asset-versioning.js` fails the build if anything's
stale or manually reintroduced. Full contract:
[.claude/rules/build-and-deploy.md](.claude/rules/build-and-deploy.md).

### Unlisted deployment — do not undo

The site is deployed public-but-unlisted on purpose: static `noindex`, no
catalog in the initial HTML, `scripts/build.js` stays copy-only,
`scripts/check-unlisted-build.js` guards it in CI. Don't add SEO/discovery
output or server-side prerendering without an explicit product decision.
Full decision record: [docs/product-decisions.md](docs/product-decisions.md)
PD-003.

### Initial loading shell

`index.html` ships a static, generic loading skeleton with no environment
data in it; `js/app.js` must never recreate or reinject an equivalent
skeleton after startup. Full lifecycle:
[docs/architecture.md](docs/architecture.md) "Application startup",
[.claude/rules/ui.md](.claude/rules/ui.md).

### Production data validation

`node scripts/validate-data.js` is the dependency-free, read-only semantic
validator for everything under `data/`; it runs before every deploy and
blocks it on error. It never rewrites data — fix checked-in data by hand
instead of weakening a rule that caught a real problem. A schema change
requires updating it and `tests/data-validation.test.js` together. Full
rules: [.claude/rules/data.md](.claude/rules/data.md).

### Lists validation

List rename resolution is centralized in the pure
`ListUtils.resolveListRename()`; an invalid or unchanged rename never
persists and never mutates `list.name`. List IDs and routes never change on
rename. Full contract:
[.claude/rules/browser-state.md](.claude/rules/browser-state.md).

### Safe browser storage

Every persisted read/write goes through `js/safe-storage.js`
(`SafeStorage`) — never a direct `localStorage`/`JSON.parse` call from
`js/app.js`. A failed write never shows a success toast. A new persisted
key needs a fallback factory and, if structured, a validator. Full
contract: [.claude/rules/browser-state.md](.claude/rules/browser-state.md).

### Hash routing

`location.hash` is decoded in exactly one place, `js/route-utils.js`
(`RouteUtils`) — never a direct `decodeURIComponent()` on untrusted route
input elsewhere. A malformed component falls back independently without
discarding a valid sibling (base route vs. environment overlay). Full
contract: [.claude/rules/browser-state.md](.claude/rules/browser-state.md).

### Environment search index

The environment catalog's searchable text is built once, in
`setEnvironmentCatalog()`, into `state.environmentSearchIndex` — never
rebuilt per filter pass or per language switch. Adding a searchable field
means updating `js/search-index.js`, not reaching for
`JSON.stringify(environment)`. Full contract:
[docs/architecture.md](docs/architecture.md) "Environment search index".

### Prep

`#/prep` lets a GM assemble one saved workspace of environments,
adversaries, and items. Every selection is **binary** — there is no
primary environment and no item quantity anywhere in this feature; the
three-environment cap is the only limit. These are settled product
decisions, not implementation details to reopen:
[docs/product-decisions.md](docs/product-decisions.md) PD-001/PD-002. Full
architecture (state, rendering, persistence schema, the v1→v2 migration
that safely discards legacy `primaryEnvironmentId`/quantity fields):
[docs/architecture.md](docs/architecture.md), `js/prep-utils.js`,
`js/safe-storage.js`.

Prep's environment-driven adversary recommendations are advisory and
derived: selecting or removing an environment never selects or removes an
adversary, `data/prep.json` is the whitelist, and the only Potential
Adversaries parser is `js/potential-adversary-utils.js` — see
[docs/product-decisions.md](docs/product-decisions.md) PD-008 and
[docs/architecture.md](docs/architecture.md) "Environment → Recommended
Adversaries".

### Manual ordering

The selected cards on `#/prep` are manually orderable: `prep.environmentIds`
/ `adversaryIds` / `itemIds` **are** the display order — the central lists,
the session summary and the FreshCutGrass export read them as-is, and there
is no second order field. Never re-sort a selected list (the catalog
pickers keep their own sort). Desktop fine-pointer only; no reset-order,
undo, drag-to-delete or `+` grid cell. Pointer/geometry logic lives in
`js/prep-reorder-ui.js` and `js/prep-reorder-utils.js`; decision record:
[docs/product-decisions.md](docs/product-decisions.md) PD-012, detail:
[docs/architecture.md](docs/architecture.md) "Prep manual ordering".

### Journey map editor (internally "Journey 2")

`#/journey` is the one canonical Journey page and a GM tile editor on the original Valloren map (its toolbar is the top of the left side panel, repeated icon-only on the collapsed rail; Player Preview is the same screen, panel and camera — PD-040; generate a
batch → drag one / drag all remaining → move, return, Undo/Redo → local save
and full JSON backup). The rules live in the pure `js/journey2-model.js`
(document, placement policy, atomic commands, history); the view only builds
commands. Route cutover (PD-029): `#/journey` (+ `/env/<id>`) is the only public route;
`#/journey2[/env/<id>]` is a replace-redirect kept for old bookmarks; the standalone generator page is retired.
The `journey2` prefix in modules, `j2-*` classes, `css/journey2.css` and the four `dhcodex_journey2_*` storage
keys is a retained internal name — never rename the keys without a migration plan, and never say "Journey 2" in public text.
It owns exactly those four storage keys; a corrupt saved map is never autosaved over;
preparation never implies discovery; original markers are immutable. Fog of War is
cell-based campaign data (`playerVisibility`), hidden by default, edited only by Reveal/Hide strokes made inside Player Preview (PD-034;
one stroke = one Undo entry; the camera is a remembered view preference in `dhcodex_journey2_ui`) and rendered to players solely through the pure projection
`js/journey2-projection.js` (Player Preview now, print later); the fog is translucent over the whole base map with
no cut-outs, so its labels and sanctuary icons stay readable (PD-020/PD-024). The prepared map stays continuous: a
later region must share a full edge with ANY placed tile, an ordinary place/move/return may never increase the
number of prepared areas (non-worsening, so an already split map stays editable), and the only override is the
confirmed "Start separate area" dialog on the exact attempted candidate (transient `allowDetached`, never stored;
PD-024). Every region gets a derived, never-stored thick boundary — one divider between regions, thin
same-region edges — that Player Preview draws only between revealed cells via the projection (PD-021/PD-024). Regions are
read in one transient, GM-only Region Inspector over the map (opened from a hex
or a card's Inspect button, independent of the expanded card, never persisted,
never in history); the sidebar only generates, places and deletes. Soul Echoes are GM-only
campaign data (`soulEchoes`, at most nine sanctuaries): one toolbar button places all nine by the
book's west-to-east rule, one removes them, and they never reach Player Preview or print (PD-022).
Generated sanctuaries are GM-only too (`sanctuaries.entries`, one per printed sanctuary icon, numbers not
sentences): one toolbar button rolls all 56 through the book's sanctuary tables (`journey2Generator`), clicking an icon opens an
overlay with Delete / Reroll / close, and none of it reaches Player Preview or print (PD-023).
A placed hex carries one optional catalog Environment (`tile.environmentId`, id only; follows the tile, dies with
it; GM-only, never in Player Preview or print — PD-025). It is dealt automatically at placement (PD-033): from the region's biome
list via the existing adapter, least-used-in-the-region first and random among equals (pure `js/journey2-env-deal.js`), carried
inside the atomic `place` command; none for an overtaken region. The Region Inspector (opened from a hex, never from a card)
offers only Change — no Choose, no Detach.
Biome Tint (PD-026): a faint derived wash inside each placed hex from its Habitat (palette only in `js/journey2-biome-tint.js`;
Shadowblight keeps the Habitat colour, a fully overtaken region uses a violet-grey fallback); never stored; GM toggle "Biome colors" lives
in `dhcodex_journey2_ui`; Player Preview tints revealed cells only (the projection omits it for hidden cells); black-and-white print
(`buildPrintProjection`) carries no tint at all — never grayscale.
Sanctuary names (PD-027): the only sanctuary datum players ever get is a name the GM revealed by hand
(`playerVisibility.revealedSanctuaryNameAnchorIds`, independent of fog; projection `sanctuaryLabels: [{ anchorId, name }]` and nothing else);
reroll keeps it, delete removes it atomically, Soul Echoes stay secret.
Locate Soul Echoes (PD-030): a GM-only toolbar tool — pick the party's hex, an animated sixteen-point compass answers with a DIRECTION toward the nearest uncollected Echo (pure `js/journey2-locate.js`;
straight-line distance, one frozen RNG draw for ties, "here" on the Echo's own hex) and nothing else (never name, distance, route or target; Fog and names untouched). Its state is transient;
only `soulEchoes.collectedAnchorIds` (Available / Collected, set from the sanctuary overlay, cleared by generating/removing Echoes) is persisted; none of it reaches Player Preview or print.
Shadowblight control (PD-041): a Locate result also opens a red dashed frame + bubble [−] N [+] [×] under the party's hex; each + moves the nearest block(s) of Shadowblight X's one hex closer (pure `js/journey2-shadow-marks.js`; deterministic, − is exact; fully overtaken blocks keep their skulls and release one X each; no sanctuary / destination / skull hex, water not yet an obstacle). Unlike the compass this IS map state: `doc.shadowMarks = { added, suppressed }` (a delta over the regions' implied X's), one bubble session = one Undo entry, × leaves the X's where they are, players and print see them only on revealed cells.
Player map print (PD-028): "Print player map" in Player Preview opens a Print Preview that IS the print — exactly two A4 portrait pages (the west/east halves
of the original map, SVG over the raster), built by the pure `js/journey2-print.js` from the print projection. Screen Player Preview keeps its fog hatch; the print
draws NO fog: fog is a data filter, so unrevealed cells are the untouched Old Valloren map and hidden content is absent, not hidden. Black and white: no tint
(omitted, never greyed), no Environments, Soul Echoes or GM data; sanctuary names only when revealed by hand. Never a screenshot; camera/zoom/sidebar are irrelevant.
Route Planner (PD-031): a GM-only, navigator-style toolbar tool — pick A then B and two parallel lines are drawn on the map, each with a bubble ("12 hexes · 15 days"): Fastest (default; travel days = the Terrain
Ratings of the hexes entered; sanctuary / Marrogate / Horizon hexes are known and cost 0) and Shortest (hex count), computed by the pure `js/journey2-route.js` (A*, six-neighbour grid, admissible heuristics,
deterministic ties). Click a bubble to select a route, click the selected one for details; no permanent panel. "Fewer encounters", Swap and the strategy tabs were dropped. Terrain is never invented for
ungenerated cells: Fastest enters only known hexes, and Shortest then reports days as Unknown. It reads no Fog, Echoes, Environments or Shadowblight, writes nothing (no history, storage or fog change),
recomputes on edits, is mutually exclusive with the other map tools, and none of it reaches Player Preview or print.
Encounter Roll (PD-039): a GM-only "Nd6" button in the Region Inspector's Encounter header (N = the region's Terrain Rating; pure `js/journey2-encounter-roll.js`, fixed d6): the dice stay visible, ones red,
"Encounter!" on any 1 (red frame + "Triggered" flag on the Encounter section) or "No 1s" + a reminder that a Fear may be spent; transient, never stored, never in Player Preview or print.
A fully overtaken region (PD-038) has no roll: its inspector keeps only the title, badge and Return, and its card has no Inspect button.
Decisions:
[docs/product-decisions.md](docs/product-decisions.md) PD-015/PD-016/PD-018/PD-020/PD-021/PD-022/PD-023/PD-024/PD-025/PD-026/PD-027/PD-028/PD-029/PD-030/PD-031/PD-032/PD-033/PD-034/PD-039/PD-040/PD-041 (Place all rolls a random frozen footprint per press), detail:
[docs/architecture.md](docs/architecture.md) "Journey 2 map editor",
[.claude/rules/browser-state.md](.claude/rules/browser-state.md).

## Commands

```bash
node --test tests/*.test.js               # unit tests for every pure module + validator
node scripts/validate-data.js             # semantic validation of data/
node scripts/build.js                     # copy runtime files into dist/
node scripts/version-assets.js            # stamp content-hash versions into dist/index.html
node scripts/check-asset-versioning.js    # verify the versions above are correct
node scripts/check-unlisted-build.js      # verify dist/ still holds the unlisted model
```

This is the exact sequence `.github/workflows/deploy.yml` runs before every
deploy. Run the first two after any `data/`/`js/`/`css/` change; run the
full chain after touching `index.html`, the build scripts, or the
versioning wiring itself.

## Documentation routing

| Working on... | Read |
| --- | --- |
| A UI-facing change | [design.md](design.md), [.claude/rules/ui.md](.claude/rules/ui.md), [docs/manual-qa.md](docs/manual-qa.md), or run `/implement-ui-change` |
| Environment/adversary/region/item data | [.claude/rules/data.md](.claude/rules/data.md), [docs/data-contracts/environments.md](docs/data-contracts/environments.md) |
| Importing/correcting an environment | run `/add-environment` |
| Storage, routing, or Lists/Prep persistence | [.claude/rules/browser-state.md](.claude/rules/browser-state.md) |
| Build, versioning, or deployment | [.claude/rules/build-and-deploy.md](.claude/rules/build-and-deploy.md) |
| Product behavior / "is this intentional?" | [docs/product-decisions.md](docs/product-decisions.md) |
| Russian translation terminology | [docs/translation-glossary.md](docs/translation-glossary.md) |
| Where something lives / how the app is wired together | [docs/architecture.md](docs/architecture.md) |

## Definition of done

A change is done when:

- Applicable automated tests pass (`node --test tests/*.test.js`, plus
  `node scripts/validate-data.js` for a `data/` change).
- Relevant validators/checks pass (see "Commands" above for which apply).
- A user-visible change has been verified in the running app, not just
  covered by unit tests — see [docs/manual-qa.md](docs/manual-qa.md).
- A durable decision or convention discovered along the way is written into
  the canonical file that owns it (`docs/product-decisions.md`, the
  relevant `.claude/rules/*.md`, or `docs/architecture.md`) — not left only
  in a scratch plan under `.claude/plans/`, a commit message, or this
  conversation.

## Git workflow

Once an implementation meets the "Definition of done" above, commit and
push it automatically — code, data, and docs alike — without a
confirmation round. Report what landed rather than asking whether it
should be committed; this authorizes that autonomy in advance, per the
system prompt's own escape hatch for durable instructions. Before
committing: run `git status` and `git log -1` (multiple sessions may
share this working tree — a dirty tree or a HEAD that moved is another
session's in-flight work, not yours to commit around; say so and let the
user sequence it instead).

## Session effort

The user authorizes in advance, without a confirmation round, switching
the session effort with `set_session_effort` based on the kind of request:

- Discussion, brainstorming, analysis, "think about" questions → `high`.
- Implementation tasks → `medium`.
- A mixed request ("discuss and then implement") → `high`.
- Unclear → do not guess; restore the user's original effort (the value on
  the UI switch).

Before the first change in a session, read the current effort (e.g. via
`get_session`) and remember it as the original. Restore it whenever a
request is unclear. A change likely takes effect from the next message,
not the current one. Mention a switch in one short line.
