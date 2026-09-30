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
js/prep-utils.js — Prep pure selection/search/filter logic
js/freshcutgrass-utils.js — FreshCutGrass encounter-URL encoder (shared by env detail + Prep)
js/battle-points.js     — Battle Points arithmetic (pure)
js/battle-points-ui.js  — Battle Points summary + popover in the Prep Adversaries header
js/app.js               — everything else: state, rendering, event wiring
```

Everything above `js/app.js` is a dependency-free module exposing a global
(`SafeStorage`, `RouteUtils`, `ListUtils`, `SearchIndex`, `PrepUtils`, `FreshCutGrassUtils`)
that also works under plain Node `require()` — that's what makes each one
directly unit-testable in `tests/*.test.js` without a DOM or bundler.

## Catalog toolbar row

`#toolbar` and `#result-count` are siblings inside `.catalog-bar`, a wrapping
flex row. `#toolbar` is `display: contents`, so the filter `.toolbar` and the
status (`Showing X of Y · Clear filters`) are items of one row; from 901px up
the status is pushed right with `margin-left: auto`, and only it wraps below
when the controls plus status don't fit. Controls are never shrunk (the
toolbar is `flex: 0 0 auto; width: max-content`, with pills/fields
non-shrinking). At 900px and below each takes its own row, as before.

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
`prepCatalog`), the search index (`environmentSearchIndex`, a
`Map<envId, record>` built once — see below), every persisted slice loaded
through `SafeStorage` at construction time (`lists`, `envLists`, `journey*`,
`prep`), transient UI-only state that is deliberately never persisted
(`filtersOpen`, `prepUI`, `journeyDraft`), and the current parsed
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
behind it (catalog, Lists overview, a single list, Journey, Prep),
not a route of its own — `applyDetailRoute()` opens/closes the overlay
without touching the base route's own state.

## Rendering boundaries

`render()` dispatches on `state.route.name` to one of the page renderers —
`renderGrid()`/`renderToolbar()` (catalog), `renderListsHome()`,
`renderJourneyPage()`, `renderPrepPage()` — each of which owns a
top-level DOM region (`#toolbar`, `#grid-wrap`, `#footer`) and replaces its
contents wholesale on a full render. `renderHeader()` owns the persistent
`#header`/`#prep-chrome` chrome shared by every route.

Two pages avoid a full rerender per interaction instead of replacing
themselves wholesale each time:

- **Prep** (`renderPrepPage()` builds the page once per route
  entry/language switch/catalog retry; a checkbox toggle, remove, or search
  edit afterward goes through a targeted `refresh*()` —
  `refreshCentralEnvironments()`, `refreshCentralAdversaries()`,
  `refreshCentralItems()`, `refreshEnvPicker()`, `refreshAdvPicker()`,
  `refreshItemGrid()` — that replaces only the list/count it affects, so
  search text, scroll position, and focus survive a selection change).
  Click/change/error listeners are delegated once per `#grid-wrap` lifetime
  (`bindPrepDelegation()`); the pure selection/search logic behind
  every one of these lives in `js/prep-utils.js`
  (`toggleId`/`removeId`/`toggleEnvironment`/`removeEnvironment` — see
  [docs/product-decisions.md](product-decisions.md) PD-001/PD-002 for what
  this logic deliberately does not do). Prep supports multiple
  independent saved preps (see "Prep multi-prep model" below);
  switching, creating, duplicating, or deleting one goes through a full
  `renderPrepPage()`, never a targeted `refresh*()`, since the active
  prep itself changed rather than one of its fields.
- **Lists rename** goes through `bindListRename()`/`commitListRename()`,
  resolved via the pure `ListUtils.resolveListRename()` — see
  [.claude/rules/browser-state.md](../.claude/rules/browser-state.md).

An open environment/item detail overlay is layered on top of whichever page
is behind it (`syncDetail()`/`applyDetailRoute()`), rendered against a
blurred backdrop of the environment's own art when one exists
(`syncEnvBackdrop()`).

## Prep multi-prep model

> **Compatibility artifacts.** This feature was once called "Session Prep".
> The `dhcodex_session_prep` / `dhcodex_session_prep_header_mode` storage keys
> and the persisted `activeSessionId` / `sessions` field names are kept
> deliberately: renaming them would need a data migration for no user-visible
> value, and a mistake would lose saved preps. All code and UI say "prep";
> only these persisted names and the legacy `#/session-prep` route (which
> `RouteUtils.parseRouteHash()` resolves to `#/prep` and repairs in place)
> remain. Do not "clean them up" without a real migration.

`state.prep` (persisted as `dhcodex_session_prep`) is a *store*, not a
single preparation: `{ schemaVersion: 2, activeSessionId, sessions: [...] }`,
each prep carrying its own `id`/`title`/`createdAt`/`updatedAt`/
`environmentIds`/`adversaryIds`/`itemIds`. `activePrep()`
(`PrepUtils.getActivePrep()`) is the one source of truth the whole
page renders from — there is no separate `selectedEnvironmentIds`-style
global to keep in sync with it.

- **Same-prep edits** (a picker toggle, a remove, a title keystroke) go
  through `updatePrep()`, which mutates only the active
  prep's own fields and stamps `updatedAt` — unchanged by multi-prep
  support.
- **Prep lifecycle** (which preps exist, which one is active) is
  centralized in a small set of `js/app.js` functions, each persisting once:
  `createPrep()`, `switchPrep(id)`,
  `duplicatePrep(id)`, `deletePrep(id)` — backed
  by pure store-shape helpers in `js/prep-utils.js`:
  `addPrep()`, `setActivePrep()`, `removePrep()`. `removePrep()`
  itself may return zero preps (deleting the last one); guaranteeing at
  least one prep always exists again is `deletePrep()`'s
  job, not that helper's. Renaming reuses the existing title field/
  `updatePrep()`; on blur, an empty/whitespace-only title
  resolves to the localized default (`PrepUtils.resolvePrepTitle()`)
  rather than being stored empty.
- **Prep order** is creation order — `addPrep()` always appends and
  never reorders `preps` on an edit, so a prep's position in the
  switcher never jumps around from autosaving.
- **Migration**: a stored v1 (single legacy preparation, `primaryEnvironmentId`
  + quantity-bearing `adversaries`/`items`) or a malformed store is sanitized/
  upgraded to v2 by `SafeStorage.validators.prep`
  (`sanitizePrep()`/`migratePrepV1ToV2()` in
  `js/safe-storage.js`) — see [.claude/rules/browser-state.md](../.claude/rules/browser-state.md).
  This runs on every load (idempotent: a store already at v2 with nothing to
  fix is returned unchanged) and repairs an `activeSessionId` that doesn't
  match any surviving prep by pointing it at the first one.
- **Prep Bar** (`prepBarHtml()`/`bindPrepBar()`, first child of
  `.prep-wrap`): one compact bar replacing the old switcher row + title
  field. The active prep's name appears exactly once, as a title-styled
  button that opens the prep menu (a `role="menu"` of `menuitemradio`
  rows, the current one checked; it holds no create or manage actions).
  The actions menu's "Rename" calls `beginPrepRename()`
  (inline input, same line box as the title, Enter/blur commit, Escape
  cancel); New/Duplicate also start it so the GM can name the fresh prep.
  "+ New" is the only always-visible collection action; Duplicate and Delete
  live only in the actions (⋯) menu, Delete behind
  `openPrepDeleteConfirm()` (an `alertdialog` built on
  `registerOverlay()`, Cancel focused first) and disabled — with a hint —
  while only one prep exists. The bar is presentation only: every action
  calls the lifecycle functions above, then `updateSaveStatusDisplay()` and,
  where the active prep changed, a full `renderPrepPage()`.
  Rename validation is the pure `PrepUtils.resolvePrepRename()`
  (an empty name is rejected and the previous name restored, never replaced
  by the placeholder). Both menus share `bindPrepMenu()` (one open at a
  time, outside click/Escape/Tab close, arrow/Home/End navigation, focus
  returned to the trigger, viewport clamping via `positionPrepMenu()`).
  The bar is hidden by the same `data-sp-header-mode="compact"` switch as
  the site header chrome.
- **Save status** sits directly under the title and reflects only real
  `persist()` outcomes (`prepSaveStatusView()`): `ready` (before the first
  write this visit), `ok` ("Saved locally · HH:MM"), `error`. There is no
  "Saving…" state — SafeStorage writes are synchronous, so it could never be
  observed, only faked.

## Battle Points

A Battle Points summary lives in the Prep "Adversaries" section header (see
[PD-007](product-decisions.md)): `Characters [−] 4 [+]` and a `BP spent / available`
button that opens a breakdown popover.

- **Arithmetic** is the pure `js/battle-points.js` (`BattlePoints.calculate()`,
  `formatBP()`, `parsePcsInput()`), unit-tested in `tests/battle-points.test.js`.
  Adversaries are counted by the canonical `adv.type` id, never a translated
  label. Prep has no quantity (PD-002), so every selected adversary counts once.
- **DOM layer** is `js/battle-points-ui.js` (`BattlePointsUI`). `js/app.js` only
  calls `slotHtml()` (via `centralHeadHtml()`'s `midHtml`), `mount()` at the end of
  `renderPrepPage()`, and `refresh()` from `refreshCentralAdversaries()`.
- **Rendering**: controls are rendered once and patched in place (`update()`), so
  focus is never lost mid-click or mid-typing. The popover is `position: fixed`,
  clamped to the viewport, so opening it never shifts layout. Every changing figure
  sits in a fixed-width box so the right-aligned summary never resizes.
- **Persistence**: only the character count, in its own raw key
  `LS_KEYS.battlePointsPcs` (`dhcodex_battle_points_pcs`), written with `persistRaw()`
  and read once per page load with `SafeStorage.readRawFlag()` (anything that is not
  an integer 1-20 reads as the default 4). Encounter style and the two manual-adjustment
  checkboxes are per-session view state. Nothing is written to the saved Prep (no schema
  change) and nothing reaches the FreshCutGrass export.
- **Advisory only**: over budget shows an amber tint and dotted underline — it never
  blocks, disables, or confirms anything.

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

## Prep's compact "All Environments" toolbar

The `#/prep` environment picker's search/Tier/counter row is a
second, narrower environment search index — deliberately separate from
`js/search-index.js`'s main-catalog one above, since it covers a different,
smaller field set (name/tier/type/biome only, never lore/features/story
seeds/source/adversaries) and needs multi-token AND matching plus tier
aliases the main catalog's alias-group search doesn't. `js/prep-utils.js`
owns it: `buildEnvironmentSearchIndex()` builds a `Map<envId, searchText>`
once (in `setEnvironmentCatalog()`, alongside the main index — state.i18n is
already loaded by the time that runs, see "Application startup" above), each
record already carrying both EN/RU name, every `tier N`/`rank N`/`ранг N`
alias for that environment's tier, its type's canonical id + EN/RU label,
and each biome id + EN/RU label, all pre-normalized through the shared
`normalizeSearchToken()` (Unicode NFKC, ё→е folding, punctuation/whitespace
collapsed to single spaces). `filterEnvironmentsByToolbar()` ANDs a Tier
multiselect (`state.prepUI.envFilters.tiers`, OR within the set,
same Set-based shape as `advFilters.tiers`) with the tokenized query
against that precomputed text — never rebuilt per keystroke.

The toolbar itself lives *inside* `.prep-picker-list` as a plain static
block stacked above `#prep-env-list` (the row list, one level deeper here
than the adversary picker's equivalent) — `#prep-env-list` is the only
element that scrolls (its own `max-height`/`overflow-y: auto`), not the
toolbar-plus-list wrapper, so the native scrollbar's track spans just the
rows and never overlaps the toolbar row above it. Because the toolbar sits
outside that scroll container entirely, it stays visible without needing
`position: sticky`. `refreshEnvPicker()` only ever
replaces `#prep-env-list`'s innerHTML and `#prep-env-count`'s text, never
the toolbar wrapper, so the search input and the four pentagonal Tier
buttons (`.rank-icon`, the same control the main catalog toolbar and the
adversary picker's own Tier filter already use) never lose focus or get
rebuilt mid-interaction; a Tier button's pressed state is toggled directly
on the clicked element in `bindPrepDelegation()` rather than through
a rebuild, for the same reason.

## Prep's compact "All Adversaries" toolbar

The `#/prep` adversary picker's toolbar (`advToolbarHtml()`) is
structurally the same pattern as the environment toolbar above — search,
Tier buttons, and a right-aligned "{n} of {total}" count, stacked as a
plain static block above `#prep-adv-list` inside `.prep-picker-list` —
plus one more control: a Type multiselect
(`PrepUtils.ADVERSARY_TYPES`, the ten official Adversary Types)
between the Tier buttons and the count, built on the same shared
`bindMultiSelectField()` every other Type/Biome/Source dropdown in the app
already uses. It replaced an earlier visible heading + separate search row +
collapsible Filters disclosure + "Selected only" checkbox + standalone
"Clear filters" button — all retired; there is no `advFiltersOpen` or
`selectedOnly` state left anywhere in `state.prepUI`.

`js/prep-utils.js` owns the search side: `buildAdversarySearchIndex()`
builds a `Map<advId, searchText>` once (in `setPrepCatalog()`,
alongside `state.adversaryPrepSearchIndex` — state.i18n is already loaded by
the time that runs), each record carrying both EN/RU name, a richer set of
Tier aliases than the environment index's own
(`adversaryTierAliasFields()`: bare digit, `tier N`/`tierN`/`tN`,
`ранг N`/`рангN`, `тир N`/`тирN` — covering `tier1`/`t1`/`тир 1`/`тир1`,
which the environment toolbar's own aliases don't need to), the raw Type
key, and its EN/RU label. `filterAdversariesByToolbar()` ANDs a Tier
multiselect and a Type multiselect (`state.prepUI.advFilters.tiers`/
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
own pressed state directly in `bindPrepDelegation()` (bound once,
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
detail route). The central adversaries list keeps a plain, non-interactive
thumbnail (`centralThumbHtml('adv', …)`) — this redesign is scoped to the
All Adversaries picker only.

### Prep's selection cell

Every selection checkbox (environment rows, adversary rows, compact item
rows and the gallery item tile) is built by `prepSelectionCellHtml()` — a
`.prep-checkbox-hit` `<label>` (whole area toggles) around an 18px
`.prep-select-checkbox`. Its geometry is the `--sel-*` tokens on `:root` in
`css/styles.css` (`--sel-box` 18px, `--sel-col` 20px (the layout column), `--sel-hit`
32px (click height; an invisible `::after` overlay widens the target into the
row padding/gap at no layout cost), `--sel-gap` and
`--sel-pad` 4px; `--sel-hit-touch` 44px on coarse pointers/phones, where the
larger target is kept on purpose). The layout is 4px row padding → 20px column
→ 4px gap → thumbnail; change a number there, never per picker.

### Prep's central selected-content panel

`centralSectionHtml()` renders one compact "prep manifest" — Environments,
Adversaries, Items — from a single selected-entity primitive rather than
three bespoke layouts: `selectedEntityHtml()` (name ≤2 lines, one-line meta,
semantic remove `<button>`), `centralThumbHtml(kind, src)` (fixed 38–40px
wrapper, `object-fit: contain`, icon fallback; the `data-sel-thumb-img`
error listener swaps a broken image for it), `centralHeadHtml()` and
`centralCountHtml()`. Each section header is one `.prep-central-lead` group — title, a muted `·`, then the count — aligned on a shared text baseline (the icon stays centred on its text); the group takes the free space and any action sits after it. The lead group also carries, after the count, an Items-only `Roll …` metadata span (`itemRollMetaHtml()`, derived from `prep.itemIds` via `PrepUtils.formatRollCoverage()` — item rolls are single integers and any subset can have gaps, so coverage renders as compressed ranges like `4–6, 10–11`, never a bare min–max) and a tertiary trash button (`clearAllSlotHtml()`, absent when the category is empty) whose delegated click runs `clearPrepCategory()` — the same `updatePrep()` path as a single `×`, no confirmation. Environments and items are `.prep-sel--card` tiles in
a grid; adversaries are compact `.prep-sel--row` tiles (48px, one-line name
and meta, ellipsized) in `.prep-sel-grid--adv`: one column by default, two
once the `prep-central` container is ≥528px wide (a container query, not a
viewport one — two ≥260px tiles plus the 8px gap; at 1280px the panel is
narrower, so it stays one column there). Sections are semantic `<section>`s with
`<ul>` lists — no table markup.

- **Density is tokenised** on `.prep-central` (`--pc-*`: header/card/row
  height, thumb, remove size, paddings, gap). Cards and rows have a *fixed*
  height so a long or translated name never changes a row; names clamp to
  two lines (adversaries: one) and `syncCentralTruncationTips()` attaches the
  full text as a `data-tip` tooltip only where the layout actually clipped
  it (re-run after every central refresh, on resize, and when fonts load).
  The token set also covers type sizes (`--pc-title-size`, `--pc-name-size`,
  `--pc-meta-size`, …) and the section icon, so the large-monitor
  *comfortable density* (`@media (min-width: 1800px) and (min-height: 900px)`,
  CSS-only, directly under the `.prep-central` rule) is nothing but a token
  override block. `--pc-pad-x` is excluded on purpose: it sets the panel's
  content width, which the Battle Points `@container prep-central
  (max-width: 760px)` rules measure (exactly 760px at 1920).
- **Interaction zones are sibling elements, never nested** (and never one big
  wrapper with `stopPropagation()` on its children). Card layout
  (environments, items): one `.prep-sel-main` `<button>` covering the
  thumbnail, text and all the card's empty space, carrying the *same*
  `data-sp-open-env` / `data-sp-open-item` attribute the catalog rows use —
  so the existing delegated handler opens the very same environment route
  overlay / `openItemDetail()`; the remove `<button>` is its sibling.
  Adversary rows have three: the thumbnail as its own `.prep-sel-thumb-btn`
  (`data-sp-open-adv-art` → `openAdversaryArtOverlay()`; a missing or
  broken thumbnail is a plain non-interactive icon, never a button that
  opens an empty overlay), a `.prep-sel-main` `<a target="_blank" rel="noopener noreferrer">`
  built by `adversaryFreshCutGrassUrl()` (a real link, so Cmd/Ctrl-click,
  middle-click and "copy link" work) with a secondary `↗` beside the name,
  and remove. The "All Adversaries" picker row uses the same three zones
  (art button → `openAdversaryArtOverlay()`, FreshCutGrass link, checkbox)
  and the same `adversaryFreshCutGrassUrl()` + `adversaryExtIconHtml()`
  (`↗`); an adversary with no URL renders plain text with no link and no
  `↗`. The Environment and Adversary picker "{n} of {total}" counters are
  hidden at `max-width: 1536px` (CSS only, the text is still updated; the
  toolbar grid drops that track). DOM order is tab order: primary action →
  external link → remove. Tooltips come from the shared `data-tip` system
  (`prep_tip_*` keys); the `aria-label`s stay name-specific.
- **Counts:** only environments have a configured cap
  (`PrepUtils.MAX_ENVIRONMENTS`), so only that header reads `n/3`;
  adversaries and items are uncapped (PD-002) and show a plain number. At the
  cap the pill turns gold with a tooltip; the limit sentence is also in
  `.sr-only` text, so it never depends on colour alone. There is no permanent
  "limit reached" text line.
- **Scrolling:** `.prep-central` (≥1200px) is the only vertical scroller,
  with `scrollbar-gutter: stable`; section headers are sticky inside it.
  It is a size container (`prep-central`) — environment cards step 3→2→1
  columns and item cards 2→1 at its width breakpoints, not the viewport's.
- **Thumbnail exception:** biome art is a 200×600 strip meant to be cropped,
  so environment thumbs use `object-fit: cover`; adversary/item art use
  `contain` (adversaries with a small inset for their uneven transparent
  padding).
- The FreshCutGrass link label is the product name only ("FreshCutGrass ↗",
  both languages); its localized sentence is the `aria-label` and tooltip.

### Quick add to the current Prep (outside `#/prep`)

An environment can be added to / removed from the **active** Prep from three
places besides the Prep picker: the catalog and Lists cards, the detail
overlay's title row, and the expanded "Add to…" dialog (the detail card's
bottom button). This is an *entry point*, not a second store — there is no
new persisted key and no second copy of the limit.

- **One mutation path:** `toggleEnvironmentInActivePrep(envId)` in
  `js/app.js`. It reads `activePrep()`, calls `PrepUtils.toggleEnvironment()`,
  handles `limitReached` defensively (a stale control re-syncs and shows the
  `prep_env_full` sentence as an error toast — no mutation), persists through
  `updatePrep()` (→ `persist()` → SafeStorage), then
  `updateSaveStatusDisplay(result)`, `syncEnvPrepControls()` and
  `syncPrepPageForEnvironment()`. The success toast
  (`prep_env_added_toast` / `prep_env_removed_toast`, using
  `prepDisplayTitle()`) is shown only if `result.ok`; a failed write has
  already reported itself.
- **State model is pure:** `PrepUtils.environmentActionState(prep, envId)` →
  `'selected'` (always removable, even 3/3), `'full'` (absent at the cap),
  `'available'`. It shares its length check with `toggleEnvironment()` and
  reads `MAX_ENVIRONMENTS`; JS never hardcodes 3 (the count in the tooltip is
  `{n}`/`{max}` substituted at runtime).
- **Synchronization, not re-rendering:** `syncEnvPrepControls()` walks every
  rendered `[data-env-prep-toggle]` button and rewrites `aria-pressed`,
  `aria-disabled`, the `is-selected`/`is-unavailable` classes, `aria-label`
  and `data-tip` (and refreshes a tooltip that is currently showing), then
  repaints the expanded dialog's Prep row. It is deliberately global: adding
  the third environment changes every *other* unselected button. Catalog
  cards are never rebuilt for this, so focus, scroll and the overlay
  lifecycle survive. The picker's own change/remove handlers call it too, so
  all instances stay in step whichever surface changed the Prep.
  `syncPrepPageForEnvironment()` updates the Prep page behind an overlay
  opened above `#/prep` — picker checkbox and label **first**, then
  `refreshCentralEnvironments()`, because that re-derives each picker row's
  `disabled` from the checkboxes' own `checked`.
- **The unavailable state is `aria-disabled`, not `disabled`:** the button
  stays focusable so the reason is reachable from the keyboard;
  `handleEnvPrepToggleClick()` is the explicit activation guard.
- **Expanded dialog:** `openAddToListPopup(envId, { expanded: true })` shares
  the renderer with the list-only popup. It adds a "Current Prep" row
  (checkbox, `prepDisplayTitle()`, `n/max`) and a "Lists" section, applies every
  change immediately, and never self-closes (the list-only popup still closes
  itself shortly after a list add). `repaintAtlPrepRow` is the module-level hook
  `syncEnvPrepControls()` uses to reach it while open. A full Prep leaves the
  row visible but disabled with the reason as text.
- **The Environment symbol** (`ENV_SYMBOL_BODY`) is a single hand-drawn
  24×24 `currentColor` SVG body used twice: the neutral Prep section icon
  (`ICON_TABLE_ENVIRONMENTS`, no badge, ring closed) and the action icon
  (`ICON_ENV_ACTION`, with a lower-right badge holding both the plus and the
  check glyph; CSS shows one from the button's state class). The ring is open
  at the lower right so the badge never covers the symbol. Adversaries and
  Items keep their raster section icons.

### Adversary artwork data and generation

An adversary record in `data/prep.json` optionally carries
`art: { thumb, full }` (both required together; never a bare `image`
string, which is now a rejected legacy field — see
`PREP_ADVERSARY_FORBIDDEN_KEYS` in `scripts/validate-data.js`).
Both paths point at pre-generated WebP derivatives under
`img/adversaries/prep/generated/{thumbs,full}/<source-stem>.webp`,
produced offline by `scripts/generate-adversary-art.js` (a dev-only tool
using the `sharp` npm package — this project's only devDependency; nothing
under `dist/` or the runtime `js/`/`css/` references it, and `node_modules/`
is gitignored) from the original artwork already committed directly under
`img/adversaries/prep/`. Thumbnails are capped at a 128×128 box;
full images at a 1536px long edge; both preserve aspect ratio and
transparency and never upscale. Filenames are the source file's own stem,
not a content hash — deterministic and stable, and consistent with every
other image in this project, none of which participate in
`scripts/lib/asset-versioning.js`'s content-hash scheme (only `css`/`js`/
`data` are hashed there). `scripts/import-prep-adversaries.js`
derives the same `{ thumb, full }` pair from its existing source-image
mapping (`deriveArtPaths()`), so a future catalogue regeneration keeps
producing the current schema rather than reintroducing `image`.

## Main catalog progressive loading

The main catalog (`state.route.name === 'catalog'` only — never the
single-list view, Lists, Journey, or Prep) renders a slice of
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
  routes), unlike the Prep item nav's create/destroy pair. Its
  callback is a no-op off the catalog route and debounced
  (`CATALOG_RESIZE_DEBOUNCE_MS`) so a dragged window edge doesn't rebuild
  the grid on every intermediate frame.

## Random Environment card

The main catalog's first grid item (`state.route.name === 'catalog'` only —
never the single-list view, Lists, Journey, or Prep) is an action
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
`setPrepCatalog()`) so catalog assignment and any derived index
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
Prep's multi-prep store (see "Prep multi-prep model"
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
| `js/prep-utils.js` | Prep default shape, prep lifecycle (add/switch/remove prep, title resolution), selection toggling, search/Tier/Type/Category/Source filtering |
| `js/freshcutgrass-utils.js` | FreshCutGrass encounter URL encoding |
| `js/battle-points.js` | Battle Points base budget, per-type cost, automatic/manual adjustments, number formatting |
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
| Prep selection/search/filter logic | `js/prep-utils.js` | `tests/prep-utils.test.js` |
| FreshCutGrass URL encoding | `js/freshcutgrass-utils.js` | `tests/freshcutgrass-utils.test.js` |
| Battle Points calculation | `js/battle-points.js` | `tests/battle-points.test.js` |
| Initial loading shell lifecycle | `js/app.js` (`beginInitialLoading()` etc.) | `tests/loading-state.test.js` |
| Random Environment card Tier badge/pick | `js/random-environment-utils.js` | `tests/random-environment-utils.test.js` |

Run all of them with `node --test tests/*.test.js`.
