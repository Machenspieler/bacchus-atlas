# Architecture map

Bacchus's Atlas is a build-free static site: plain HTML/CSS/JS, no framework,
no bundler for the runtime itself (only a copy-and-version pipeline for
deployment — see "Build and deployment flow" below). This document is a map
of ownership boundaries — where a concern lives — not a line-by-line account
of the largest file. Read the section for the area you're touching, then go
read the actual code; don't treat this as a substitute for it.

## Entry point and script load order

`index.html` is the only HTML page. It ships a static, generic loading shell
(`#toolbar`/`#grid-wrap`, no environment data — see "Rendering boundaries"
below and [.claude/rules/ui.md](../.claude/rules/ui.md)) and loads scripts in
a fixed dependency order, each also marked `data-cache-version="ui"` for the
build's asset-versioning pass:

```
js/safe-storage.js      — localStorage read/write boundary
js/data-version.js      — versionedDataUrl() for data/*.json fetches
js/route-utils.js       — location.hash parsing/building
js/list-utils.js        — Lists name validation
js/search-index.js      — environment search index builder
js/session-prep-utils.js — Session Prep pure selection/search/filter logic
js/freshcutgrass-utils.js — FreshCutGrass encounter-URL encoder (shared by env detail + Session Prep)
js/app.js               — everything else: state, rendering, event wiring
```

Everything above `js/app.js` is a dependency-free module exposing a global
(`SafeStorage`, `RouteUtils`, `ListUtils`, `SearchIndex`, `SessionPrepUtils`, `FreshCutGrassUtils`)
that also works under plain Node `require()` — that's what makes each one
directly unit-testable in `tests/*.test.js` without a DOM or bundler.

## Application startup (`init()` in `js/app.js`)

`init()` starts the i18n fetch and the application-data fetches together —
there is no i18n-first waterfall. `beginInitialLoading()` marks
`#main`/`#toolbar`/`#grid-wrap` `aria-busy` immediately; once i18n resolves,
`localizeInitialLoading()` updates only the `#result-count` status text
(never `#toolbar`/`#grid-wrap` themselves); `finishInitialLoading()` (on
success) or `failInitialLoading()` (on data-load or fatal i18n failure)
clears the busy state. The static skeleton markup in `index.html` disappears
only as a side effect of `renderToolbar()`/`renderGrid()`/`renderLoadError()`/
`renderFatalError()` unconditionally replacing `#toolbar`/`#grid-wrap`'s
contents on the first real render — nothing re-injects an equivalent
skeleton afterward.

## State ownership (`state` object, top of `js/app.js`)

One module-level `state` object holds everything: `lang`, the loaded
catalogs (`builtinEnvs`, `regions`, `itemCatalog`, `adversaryCatalog`,
`sessionPrepCatalog`), the search index (`environmentSearchIndex`, a
`Map<envId, record>` built once — see below), every persisted slice loaded
through `SafeStorage` at construction time (`lists`, `envLists`, `journey*`,
`sessionPrep`), transient UI-only state that is deliberately never persisted
(`filtersOpen`, `sessionPrepUI`, `journeyDraft`), and the current parsed
route (`state.route`, from `readCurrentRoute()`).

There is no separate "store" abstraction or reducer — functions read and
mutate `state` directly, then call `render()` or a narrower `refresh*()`.

## Routing

`js/route-utils.js` (`RouteUtils`) is the one place `location.hash` is
decoded or built — see [.claude/rules/browser-state.md](../.claude/rules/browser-state.md)
for the safety contract. `js/app.js` reads the current route only through
`readCurrentRoute()`, which repairs a malformed hash via
`repairHash()`/`history.replaceState()` before returning a safe fallback.
An environment overlay (`/env/<id>`) is a suffix on whichever base route is
behind it (catalog, Lists overview, a single list, Journey, Session Prep),
not a route of its own — `applyDetailRoute()` opens/closes the overlay
without touching the base route's own state.

## Rendering boundaries

`render()` dispatches on `state.route.name` to one of the page renderers —
`renderGrid()`/`renderToolbar()` (catalog), `renderListsHome()`,
`renderJourneyPage()`, `renderSessionPrepPage()` — each of which owns a
top-level DOM region (`#toolbar`, `#grid-wrap`, `#footer`) and replaces its
contents wholesale on a full render. `renderHeader()` owns the persistent
`#header`/`#session-prep-chrome` chrome shared by every route.

Two pages avoid a full rerender per interaction instead of replacing
themselves wholesale each time:

- **Session Prep** (`renderSessionPrepPage()` builds the page once per route
  entry/language switch/catalog retry; a checkbox toggle, remove, or search
  edit afterward goes through a targeted `refresh*()` —
  `refreshCentralEnvironments()`, `refreshCentralAdversaries()`,
  `refreshCentralItems()`, `refreshEnvPicker()`, `refreshAdvPicker()`,
  `refreshItemGrid()` — that replaces only the list/count it affects, so
  search text, scroll position, and focus survive a selection change).
  Click/change/error listeners are delegated once per `#grid-wrap` lifetime
  (`bindSessionPrepDelegation()`); the pure selection/search logic behind
  every one of these lives in `js/session-prep-utils.js`
  (`toggleId`/`removeId`/`toggleEnvironment`/`removeEnvironment` — see
  [docs/product-decisions.md](product-decisions.md) PD-001/PD-002 for what
  this logic deliberately does not do). Session Prep supports multiple
  independent saved sessions (see "Session Prep multi-session model" below);
  switching, creating, duplicating, or deleting one goes through a full
  `renderSessionPrepPage()`, never a targeted `refresh*()`, since the active
  session itself changed rather than one of its fields.
- **Lists rename** goes through `bindListRename()`/`commitListRename()`,
  resolved via the pure `ListUtils.resolveListRename()` — see
  [.claude/rules/browser-state.md](../.claude/rules/browser-state.md).

An open environment/item detail overlay is layered on top of whichever page
is behind it (`syncDetail()`/`applyDetailRoute()`), rendered against a
blurred backdrop of the environment's own art when one exists
(`syncEnvBackdrop()`).

## Session Prep multi-session model

`state.sessionPrep` (persisted as `dhcodex_session_prep`) is a *store*, not a
single preparation: `{ schemaVersion: 2, activeSessionId, sessions: [...] }`,
each session carrying its own `id`/`title`/`createdAt`/`updatedAt`/
`environmentIds`/`adversaryIds`/`itemIds`. `activeSessionPrep()`
(`SessionPrepUtils.getActiveSession()`) is the one source of truth the whole
page renders from — there is no separate `selectedEnvironmentIds`-style
global to keep in sync with it.

- **Same-session edits** (a picker toggle, a remove, a title keystroke) go
  through `updateSessionPrepSession()`, which mutates only the active
  session's own fields and stamps `updatedAt` — unchanged by multi-session
  support.
- **Session lifecycle** (which sessions exist, which one is active) is
  centralized in a small set of `js/app.js` functions, each persisting once:
  `createSessionPrepSession()`, `switchSessionPrepSession(id)`,
  `duplicateSessionPrepSession(id)`, `deleteSessionPrepSession(id)` — backed
  by pure store-shape helpers in `js/session-prep-utils.js`:
  `addSession()`, `setActiveSession()`, `removeSession()`. `removeSession()`
  itself may return zero sessions (deleting the last one); guaranteeing at
  least one session always exists again is `deleteSessionPrepSession()`'s
  job, not that helper's. Renaming reuses the existing title field/
  `updateSessionPrepSession()`; on blur, an empty/whitespace-only title
  resolves to the localized default (`SessionPrepUtils.resolveSessionTitle()`)
  rather than being stored empty.
- **Session order** is creation order — `addSession()` always appends and
  never reorders `sessions` on an edit, so a session's position in the
  switcher never jumps around from autosaving.
- **Migration**: a stored v1 (single legacy preparation, `primaryEnvironmentId`
  + quantity-bearing `adversaries`/`items`) or a malformed store is sanitized/
  upgraded to v2 by `SafeStorage.validators.sessionPrep`
  (`sanitizeSessionPrep()`/`migrateSessionPrepSessionV1ToV2()` in
  `js/safe-storage.js`) — see [.claude/rules/browser-state.md](../.claude/rules/browser-state.md).
  This runs on every load (idempotent: a store already at v2 with nothing to
  fix is returned unchanged) and repairs an `activeSessionId` that doesn't
  match any surviving session by pointing it at the first one.
- **Minimal UI**: a native `<select>` session switcher plus New/Duplicate/
  Delete buttons (`sessionSwitcherHtml()`/`bindSessionPrepSwitcher()`), as a
  plain sibling of `.prep-session-header` rather than inside it. Delete asks
  for confirmation (`confirm()`, naming the session) before calling
  `deleteSessionPrepSession()`. This is deliberately minimal — a full visual
  pass on Session Prep's header is separate future work.

## Environment search index

`js/search-index.js` (`SearchIndex`) builds a `Map<environmentId, { aliasText,
literalText }>` once, in `setEnvironmentCatalog()`, right after
`environments.json` loads — never rebuilt on language switch or filter
change, and never stored as a hidden property on the environment records
themselves. `sortedFilteredEnvs()` calls
`SearchIndex.prepareSearchQuery()` once per filtering pass and threads the
prepared query through every `envMatchesFilters()` call; that function only
looks up the precomputed record and calls `SearchIndex.matches()` — it must
never rebuild text haystacks or traverse `env.features` itself. See
`buildEnvironmentSearchRecord()` in `js/search-index.js` for exactly which
fields are alias-eligible vs. literal-only vs. excluded.

## Session Prep's compact "All Environments" toolbar

The `#/session-prep` environment picker's search/Tier/counter row is a
second, narrower environment search index — deliberately separate from
`js/search-index.js`'s main-catalog one above, since it covers a different,
smaller field set (name/tier/type/biome only, never lore/features/story
seeds/source/adversaries) and needs multi-token AND matching plus tier
aliases the main catalog's alias-group search doesn't. `js/session-prep-utils.js`
owns it: `buildEnvironmentSearchIndex()` builds a `Map<envId, searchText>`
once (in `setEnvironmentCatalog()`, alongside the main index — state.i18n is
already loaded by the time that runs, see "Application startup" above), each
record already carrying both EN/RU name, every `tier N`/`rank N`/`ранг N`
alias for that environment's tier, its type's canonical id + EN/RU label,
and each biome id + EN/RU label, all pre-normalized through the shared
`normalizeSearchToken()` (Unicode NFKC, ё→е folding, punctuation/whitespace
collapsed to single spaces). `filterEnvironmentsByToolbar()` ANDs a Tier
multiselect (`state.sessionPrepUI.envFilters.tiers`, OR within the set,
same Set-based shape as `advFilters.tiers`) with the tokenized query
against that precomputed text — never rebuilt per keystroke.

The toolbar itself lives *inside* `.prep-picker-list` (the env picker's own
scroll container) as its sticky `position: sticky; top: 0` first child,
rather than above it — the same sticky-inside-its-own-scroll-container
pattern `.prep-central-section h3` already uses — so it stays visible while
`#prep-env-list` (the row list, one level deeper here than the adversary
picker's equivalent) scrolls underneath. `refreshEnvPicker()` only ever
replaces `#prep-env-list`'s innerHTML and `#prep-env-count`'s text, never
the toolbar wrapper, so the search input and the four pentagonal Tier
buttons (`.rank-icon`, the same control the main catalog toolbar and the
adversary picker's own Tier filter already use) never lose focus or get
rebuilt mid-interaction; a Tier button's pressed state is toggled directly
on the clicked element in `bindSessionPrepDelegation()` rather than through
a rebuild, for the same reason.

## Session Prep's compact "All Adversaries" toolbar

The `#/session-prep` adversary picker's toolbar (`advToolbarHtml()`) is
structurally the same pattern as the environment toolbar above — search,
Tier buttons, and a right-aligned "{n} of {total}" count, sticky inside
`.prep-picker-list` — plus one more control: a Type multiselect
(`SessionPrepUtils.ADVERSARY_TYPES`, the ten official Adversary Types)
between the Tier buttons and the count, built on the same shared
`bindMultiSelectField()` every other Type/Biome/Source dropdown in the app
already uses. It replaced an earlier visible heading + separate search row +
collapsible Filters disclosure + "Selected only" checkbox + standalone
"Clear filters" button — all retired; there is no `advFiltersOpen` or
`selectedOnly` state left anywhere in `state.sessionPrepUI`.

`js/session-prep-utils.js` owns the search side: `buildAdversarySearchIndex()`
builds a `Map<advId, searchText>` once (in `setSessionPrepCatalog()`,
alongside `state.adversaryPrepSearchIndex` — state.i18n is already loaded by
the time that runs), each record carrying both EN/RU name, a richer set of
Tier aliases than the environment index's own
(`adversaryTierAliasFields()`: bare digit, `tier N`/`tierN`/`tN`,
`ранг N`/`рангN`, `тир N`/`тирN` — covering `tier1`/`t1`/`тир 1`/`тир1`,
which the environment toolbar's own aliases don't need to), the raw Type
key, and its EN/RU label. `filterAdversariesByToolbar()` ANDs a Tier
multiselect and a Type multiselect (`state.sessionPrepUI.advFilters.tiers`/
`.types`, each OR within its own set, same Set-based shape as the
environment toolbar's `envFilters.tiers`) with the tokenized query against
that precomputed text — reusing the same `tokenizeEnvironmentQuery()`/
`matchesEnvironmentTokens()` machinery the environment toolbar's own
`filterEnvironmentsByToolbar()` uses (neither is actually
environment-specific; they just operate on a precomputed string and a
token list). The old `filterAdversaries()`/"Selected only" filtering no
longer exists.

`refreshAdvPicker()` only ever replaces `#prep-adv-list`/`#prep-adv-count`,
never the toolbar wrapper, so the search input, Tier buttons, and an open
Type dropdown all survive a filter/search change; a Tier click updates its
own pressed state directly in `bindSessionPrepDelegation()` (bound once,
delegated) rather than through a rebuild, the same as the environment
toolbar's Tier buttons. `.prep-col-adv` is a CSS size container
(`container-type: inline-size`) so the count — the least important toolbar
element — hides via a container query before any other control has to
shrink or wrap.

Each row in this picker (`advPickerRowHtml()`) has three isolated action
zones, never a whole-row click target: the selection checkbox (unchanged);
an artwork thumbnail that is a real `<button>` (`prepAdvThumbHtml()`) when
the adversary has local art (`adv.art`), opening a focused art overlay
(`openAdversaryArtOverlay()`, reusing `registerOverlay()` — the same focus-
trap/Escape/scroll-lock/focus-restore primitive `openItemDetail()` uses —
rather than duplicating that lifecycle) and otherwise the same
non-interactive fallback icon as before; and one `<a target="_blank"
rel="noopener noreferrer">` wrapping the name and "Tier N · Type" meta,
opening that adversary's own FreshCutGrass encounter
(`adversaryFreshCutGrassUrl()`, built from `adv.name.en` alone — the same
single-adversary encounter-URL pattern `potentialAdversaryLinkHtml()`
already uses elsewhere, since FreshCutGrass exposes no stable per-adversary
detail route). The central "Selected Adversaries" list keeps its existing
plain, non-interactive thumbnail (`centralAdvThumbHtml()`) — this redesign
is scoped to the All Adversaries picker only.

### Adversary artwork data and generation

An adversary record in `data/session-prep.json` optionally carries
`art: { thumb, full }` (both required together; never a bare `image`
string, which is now a rejected legacy field — see
`SESSION_PREP_ADVERSARY_FORBIDDEN_KEYS` in `scripts/validate-data.js`).
Both paths point at pre-generated WebP derivatives under
`img/adversaries/session-prep/generated/{thumbs,full}/<source-stem>.webp`,
produced offline by `scripts/generate-adversary-art.js` (a dev-only tool
using the `sharp` npm package — this project's only devDependency; nothing
under `dist/` or the runtime `js/`/`css/` references it, and `node_modules/`
is gitignored) from the original artwork already committed directly under
`img/adversaries/session-prep/`. Thumbnails are capped at a 128×128 box;
full images at a 1536px long edge; both preserve aspect ratio and
transparency and never upscale. Filenames are the source file's own stem,
not a content hash — deterministic and stable, and consistent with every
other image in this project, none of which participate in
`scripts/lib/asset-versioning.js`'s content-hash scheme (only `css`/`js`/
`data` are hashed there). `scripts/import-session-prep-adversaries.js`
derives the same `{ thumb, full }` pair from its existing source-image
mapping (`deriveArtPaths()`), so a future catalogue regeneration keeps
producing the current schema rather than reintroducing `image`.

## Main catalog progressive loading

The main catalog (`state.route.name === 'catalog'` only — never the
single-list view, Lists, Journey, or Session Prep) renders a slice of
`sortedFilteredEnvs()` rather than the whole result set once it passes 30
environments, revealing more via a "Show more" control below the grid
(`#catalog-more`, filled by `renderCatalogMore()`). The constants and
arithmetic (initial six-row count, four-row batches, the resize-alignment
formula) are pure and live in `js/catalog-progressive.js`
(`CatalogProgressive`), tested in `tests/catalog-progressive.test.js`; only
the DOM/state wiring lives in `js/app.js`:

- **`state.catalogVisibleCount`/`state.catalogLastColumnCount`** are
  purely presentational (never persisted, never in the URL). `null`
  means "recompute the initial count on next render" — this is how a
  genuine search/filter change resets progressive loading:
  `resetCatalogVisibility()` is called at each site that mutates
  `state.filters` (search input, tier/type/biome/source toggles, "Clear
  filters", `showBiomeInCatalog()`), never from `renderGrid()` itself. A
  language switch, a route revisit, or a "Show more" click all leave the
  count alone.
- **`getRenderedColumnCount()`** reads the grid's own resolved
  `grid-template-columns` (`getComputedStyle`) rather than duplicating
  `css/styles.css`'s `auto-fill`/`minmax()`/`.shell` breakpoints in JS —
  auto-fill always resolves to a plain space-separated pixel track list by
  the time a layout pass has run.
- **`renderGrid()`** decides the visible slice once per render: a `null`
  count computes the initial six-row count; an unchanged column count just
  clamps the existing count to the (possibly new) total; a changed column
  count runs the resize-alignment formula, which only ever grows or holds
  the visible count, never shrinks it below what was already on screen.
- **`initCatalogGridObserver()`** attaches one `ResizeObserver` to
  `#grid-wrap` at startup and never tears it down — that element is a
  permanent part of the static shell (only its innerHTML changes across
  routes), unlike the Session Prep item nav's create/destroy pair. Its
  callback is a no-op off the catalog route and debounced
  (`CATALOG_RESIZE_DEBOUNCE_MS`) so a dragged window edge doesn't rebuild
  the grid on every intermediate frame.

## Random Environment card

The main catalog's first grid item (`state.route.name === 'catalog'` only —
never the single-list view, Lists, Journey, or Session Prep) is an action
card, not a real environment record: `randomCardHtml()` in `js/app.js`
builds it directly in `renderGrid()`, prepended to the rendered card slice,
and it is never added to `state.builtinEnvs`/`state.environmentSearchIndex`
— so it never enters search, filtering, sorting, bookmarks, lists,
`localStorage`, or the `#result-count` total. Its Tier badge and the
environment a click opens are both derived from `sortedFilteredEnvs()`
directly — the *complete* filtered result set, before the "Show more"
slice — so a card hidden behind "Show more" is still eligible and the
badge reflects the true candidate pool, not just the active Tier-filter
buttons. The pure arithmetic (Tier-badge derivation, the random pick given
a pluggable RNG) lives in `js/random-environment-utils.js`
(`RandomEnvironmentUtils`), tested in
`tests/random-environment-utils.test.js`; `handleRandomCardActivate()`
re-reads the pool at click time and opens the pick through the same
`showEnv()` path a regular card's click uses, reusing the existing details
overlay unchanged.

## Production JSON loading

Every `data/*.json` fetch in `js/app.js` goes through `versionedDataUrl()`
(`js/data-version.js`), which appends the build-generated data version (or
falls back to an unversioned path in source/dev, where the version meta tag
is empty). `getJSON()` wraps `fetch()` + `.json()` for all of these calls.
Catalogs are assigned via a single setter each
(`setEnvironmentCatalog()`, `setItemCatalog()`, `setAdversaryCatalog()`,
`setSessionPrepCatalog()`) so catalog assignment and any derived index
(search index, item name index) happen together, once.

## Localization

`data/i18n.json` is `{ en: {...}, ru: {...} }`, loaded once at startup;
`t(key)` (`js/app.js`) looks up the active language with an EN fallback.
`state.lang` is persisted (`LS_KEYS.lang`) and switching it
(`setLang()`) re-renders in place — it does not reload or re-fetch
catalogs. Bilingual data fields (`name`, `description`, …) follow the same
`{ en, ru }` shape as `i18n.json` and are read through small per-record
helpers (`envName()`, `envField()`, `bilingual()`, `itemField()`,
`adversaryName()`) rather than inline property access, so the EN-fallback
rule stays in one place.

## Local persistence

`js/safe-storage.js` (`SafeStorage`) is the one boundary between `js/app.js`
and `localStorage` — see [.claude/rules/browser-state.md](../.claude/rules/browser-state.md)
for the read/write/migration contract. `LS_KEYS` (top of `js/app.js`) is the
full list of persisted keys: language, lists, environment-to-list
membership, the storage-notice dismissal flag, the two Journey tables, and
Session Prep's multi-session store (see "Session Prep multi-session model"
above). `persist()`/`persistRaw()`/`persistBatch()`
in `js/app.js` wrap `SafeStorage`'s write functions and centralize
write-failure reporting (`reportStorageWriteFailure()`).

## Pure utility modules

Each of these is dependency-free, loadable in both a browser `<script>` tag
and plain Node, and has its own `tests/*.test.js` file that imports it
directly rather than driving it through the DOM:

| Module | Owns |
| --- | --- |
| `js/safe-storage.js` | localStorage read/write/migration/sanitization |
| `js/route-utils.js` | hash parsing, building, and safe decoding |
| `js/list-utils.js` | list name normalization and rename resolution |
| `js/search-index.js` | environment search record building and matching |
| `js/session-prep-utils.js` | Session Prep default shape, session lifecycle (add/switch/remove session, title resolution), selection toggling, search/Tier/Type/Category/Source filtering |
| `js/freshcutgrass-utils.js` | FreshCutGrass encounter URL encoding |
| `js/random-environment-utils.js` | Random Environment card's Tier-badge derivation and pool pick |

## Build and deployment flow

```
node --test tests/*.test.js         # unit tests for every pure module + validator
node scripts/validate-data.js       # semantic validation of everything under data/
node scripts/build.js               # copy-only: index.html, css/, js/, data/, img/, favicons → dist/
node scripts/version-assets.js      # computes UI/data content hashes, writes them into dist/index.html
node scripts/check-asset-versioning.js  # re-derives both hashes, fails on any mismatch
node scripts/check-unlisted-build.js    # fails if dist/ regresses the public-but-unlisted model
```

This is exactly the sequence `.github/workflows/deploy.yml` runs on every
push to `main`; `dist/` is then published to GitHub Pages. See
[.claude/rules/build-and-deploy.md](../.claude/rules/build-and-deploy.md)
for the conventions that keep this pipeline correct, and
[docs/product-decisions.md](product-decisions.md) PD-003 for why the build
stays copy-only.

## Test and validator ownership

| Concern | Lives in | Covered by |
| --- | --- | --- |
| Environment/region/adversary/item/journey/i18n schema | `scripts/validate-data.js` | `tests/data-validation.test.js` |
| Asset content hashing | `scripts/lib/asset-versioning.js` | `tests/asset-versioning.test.js` |
| localStorage read/write/migration | `js/safe-storage.js` | `tests/storage.test.js` |
| Hash routing | `js/route-utils.js` | `tests/routing.test.js` |
| List rename resolution | `js/list-utils.js` | `tests/list-rename.test.js` |
| Environment search index | `js/search-index.js` | `tests/search-index.test.js` |
| Session Prep selection/search/filter logic | `js/session-prep-utils.js` | `tests/session-prep-utils.test.js` |
| FreshCutGrass URL encoding | `js/freshcutgrass-utils.js` | `tests/freshcutgrass-utils.test.js` |
| Initial loading shell lifecycle | `js/app.js` (`beginInitialLoading()` etc.) | `tests/loading-state.test.js` |
| Random Environment card Tier badge/pick | `js/random-environment-utils.js` | `tests/random-environment-utils.test.js` |

Run all of them with `node --test tests/*.test.js`.
