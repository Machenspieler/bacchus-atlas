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
js/prep-reorder-utils.js — Prep manual ordering: id moves/inserts, insertion-slot geometry, autoscroll curve (pure)
js/prep-reorder-ui.js   — Prep drag-and-drop / Alt+Arrow controller (pointer events, insertion line, autoscroll)
js/potential-adversary-utils.js — Potential Adversaries parser + Prep recommendation matching (shared by env detail + Prep)
js/freshcutgrass-utils.js — FreshCutGrass encounter-URL encoder + supported-adversary gate (shared by env detail + Prep); loads after potential-adversary-utils.js, which it requires
js/battle-points.js     — Battle Points arithmetic (pure)
js/battle-points-ui.js  — Battle Points summary + popover in the Prep Adversaries header
js/soundboard-manifest.js — the eight bundled sound effects + stored-level normalization (pure)
js/soundboard-icons.js  — the soundboard's inline SVG icons (pure)
js/soundboard-engine.js — shared Web Audio engine (context injected, so testable)
js/soundboard-ui.js     — global soundboard panel + header trigger
js/app.js               — everything else: state, rendering, event wiring
```

Everything above `js/app.js` is a dependency-free module exposing a global
(`SafeStorage`, `RouteUtils`, `ListUtils`, `SearchIndex`, `PrepUtils`, `PrepReorderUtils`, `FreshCutGrassUtils`, `PotentialAdversaryUtils`, `SoundboardManifest`, `SoundboardIcons`, `SoundboardEngine`)
that also works under plain Node `require()` — that's what makes each one
directly unit-testable in `tests/*.test.js` without a DOM or bundler.
`js/soundboard-ui.js` is the one exception: it needs the DOM, so it is only
exercised in the browser (its logic lives in the engine and manifest).

## Catalog toolbar row

`#toolbar` and `#result-count` are siblings inside `.catalog-bar` (itself inside
`.catalog-bar-wrap`, the container-query target). `#toolbar` is
`display: contents`, so the filter `.toolbar` and the status
(`Showing X of Y · Clear filters`) are grid items. From 901px up the grid is
`1fr auto 1fr`: the controls sit in the middle column, centred on the content
area regardless of the status, which sits right-aligned in the third column.
When the wrap is narrower than 1440px (942px controls plus a ~234px status
column each side) the grid collapses to one column and only the status drops
below, still right-aligned; under 980px the controls may wrap as a group.
Controls are never shrunk. At 900px and below each takes its own flex row.

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

**Route-specific shell.** `index.html` still holds one static shell, but it
carries two skeleton layouts: the catalog card grid (default) and a
`.sk-j2` editor-shaped one (toolbar strip, side panel, map). A synchronous
inline script in `<head>` sets `html[data-boot-route="journey2"]` from
`location.hash` before first paint, and `css/journey2.css` swaps which one is
visible (and applies the route's chrome, so nothing jumps on mount). The
script only sets that attribute — routing stays in `js/route-utils.js`. A new
route that wants its own skeleton follows the same pattern; `js/app.js` still
never builds skeleton markup.

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
each prep carrying its own `id`/`title`/`notes`/`createdAt`/`updatedAt`/
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
  "+ New session" is the only always-visible collection action (the sessions menu also ends with a "+ New session" shortcut, `data-sp-new`); Duplicate and Delete
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
- **Session control** (header chrome): one `<button>` in `.header-inner`
  between the brand and `.header-actions` — "Session · <active prep title>",
  a save-status icon, a chevron — is the only expand/collapse toggle
  (`initPrepChrome()` / `paintSessionControl()`). It is repainted from
  `activePrep()` and `state.prepUI`, never caching a title or save state. The
  expanded/compact mode is a global preference in
  `dhcodex_session_prep_header_mode`, default **expanded**
  (`PrepUtils.resolveHeaderMode()`); a separate
  `dhcodex_session_prep_hint_seen` flag gates the one-time hint shown the
  first time compact mode is entered or restored. Its `saving` icon is the
  real pending state of a debounced Session Notes write (`prepNotesDirty`).
- **Save status** is the second line inside the session selector button
  (`#prep-save-status`, aria-hidden — the header control's live region
  announces it) and reflects only real outcomes (`prepSaveStatusView()`, built
  on `PrepUtils.sessionSaveKind()`): `ready` (before the first write this
  visit), `saving` (only a pending debounced notes write), `ok` ("Local ·
  HH:MM"), `error` ("Save failed"). SafeStorage writes are synchronous, so
  nothing but the notes debounce can ever be observed as "Saving…".

### Session Notes (`prep.notes`)

A plain-text GM scratchpad per prep, in the Prep Bar's centre zone
(`.prep-bar` is a three-column grid: session selector (title + save status) · notes · New session + actions;
the notes column is `minmax(0, 1fr)` so it flexes without pushing the actions
out). It lives only inside the Prep Bar, so collapsing the header hides it
with the rest of the bar and nothing note-related exists in the collapsed
state (no preview, badge or indicator).

- **Shape:** `notes: string`, default `""` (`PrepUtils.createDefaultPrep()`).
  `sanitizePrepCommon()` in `js/safe-storage.js` hydrates a missing value to
  `""` *silently* (the legacy shape, not a recovery event) and a present
  non-string value to `""` as a reported change. The text is never trimmed.
  No schema-version bump: the field is additive and old stores load as-is.
- **Edits** go through the pure, id-targeted `PrepUtils.setPrepNotes(store,
  prepId, value)` (returns the same store when nothing changes). `setPrepNotes()`
  in `js/app.js` applies it to `state.prep` immediately, but the localStorage
  write is debounced (`PREP_NOTES_SAVE_DELAY_MS`) because `SafeStorage` writes
  the whole store. `flushPrepNotesSave()` is the one drain: timer, textarea
  blur, the start of `createPrep()`/`switchPrep()`/`duplicatePrep()`/
  `deletePrep()`, `prepChromeSetMode()` (collapse), `destroyPrepChrome()`,
  `renderPrepPage()`, and `pagehide`/`beforeunload`/`visibilitychange`.
  It reports through the existing save-status line — there is no notes
  indicator.
- **Duplicate** copies notes (`Object.assign({}, source, …)`); New starts
  empty; rename and delete never touch another prep's notes.
- **The textarea's value is assigned via `.value`** in `bindPrepBar()`, not
  written into the markup (an HTML parser drops a textarea's leading newline).
- **Keyboard:** only `input`/`blur` are bound. The page has no global
  hotkeys, so nothing needs `stopPropagation()`; Escape does not clear notes.
- Structural coverage: `tests/prep-notes.test.js`; data behaviour in
  `tests/prep-utils.test.js` and `tests/storage.test.js`.

## Prep manual ordering (drag-and-drop)

The three stored arrays — `prep.environmentIds`, `prep.adversaryIds`,
`prep.itemIds` — **are** the display order of the central Prep panel. The
central lists (`centralEnvListHtml()`, `centralAdvListHtml()`,
`centralItemListHtml()`) map them straight to cards and never sort; the
catalog pickers keep their own Tier/name/roll sort. There is no second
"order" field anywhere, so everything that reads a prep sees the same order:
autosave and reload, switching and duplicating sessions, the shared-link
payload (`PrepShareUtils` already preserved array order), Copy session
summary (`prepSummaryText()`) and the FreshCutGrass export
(`freshCutGrassUrlForPrep()`). A checkbox selection still appends; the
recommended-adversaries bulk add still appends.

- **Pure geometry** — `js/prep-reorder-utils.js`. For N cards there are N+1
  *insertion slots* (before card 1 … after card N). `resolveSlot()` picks the
  row by the pointer's vertical distance, then the slot by horizontal
  distance to that row's anchors (left edge, gaps, right edge); a
  single-column grid uses the card's vertical half instead. The slot after
  the last card of a row and the slot before the first card of the next row
  are the *same* index, so crossing a row boundary never flips between two
  answers. Rows and column count come from the *rendered* rects and the grid's
  computed `grid-template-columns`, so 3/2/1-column layouts and a partial
  last row need no special casing. `slotGeometry()` places the line: vertical
  between two cards of a row, horizontal at a row boundary, below a full last
  row, and for every slot of a one-column grid.
- **Controller** — `js/prep-reorder-ui.js`, wired once by `initPrepReorder()`
  in `js/app.js`, which supplies hooks (`getIds`, `canAdd`, `nameOf`,
  `commit`, `announce`, `text`). It uses **pointer events, not native
  HTML5 drag-and-drop**: a press only becomes a drag after 6px of travel (so
  a wobbly trackpad click is still a click), links/images in a card are
  opted out of native drag on pointerdown (otherwise the browser cancels the
  pointer stream), Esc/blur/pointercancel cancel deterministically, and only
  `mouse`/`pen` pointers ever start one (touch never gets a long-press drag).
  The click that follows a finished or cancelled drag is swallowed.
- **Two drags:** a selected card inside `.prep-central` (reorder, same
  section only) and an unselected catalog row/tile (add at the slot under the
  pointer). Catalog entries that are selected, or environments while 3/3, are
  not sources. Nothing about the prep changes during the drag — only
  temporary UI: `.is-drag-source`, the ghost name chip, one absolutely
  positioned `.prep-drop-line` inside the list, `.is-drop-target` on the
  matching section (adds only), and — for an empty section — its "nothing
  selected" paragraph turned into the drop target in place (no `+` grid cell,
  no layout shift). The drop calls `commitPrepOrder()` → `updatePrep()` →
  the existing `refreshCentral*()`.
- **Autoscroll** is time-based (px/s, ramping inside a 56px zone) and runs on
  `.prep-central` when it is the scroll container (≥1200px) or on the
  document otherwise; it stops on release, cancel, leaving the zone and at
  the scroll bounds.
- **Keyboard:** on a card's main control (`.prep-sel-main`, tab stop), Alt+↑/↓
  moves one position in the *linear* order, Alt+Shift+↑/↓ jumps to the
  start/end. Focus is restored to the same card and a polite live region
  (`#prep-reorder-live`) announces the new position. There is no menu, no
  reset-order, no undo and no drag-to-delete (PD-012).
- **Capability gate:** the grab cursor on selected cards (the whole card is
  the drag source; there is no grip or handle) and the catalog `grab` cursors live in `@media (any-hover: hover) and
  (any-pointer: fine)`.

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

## Prep Items strip: one-row / two-row height

The Compact (list) strip `#prep-item-compact-grid` has exactly two heights,
selected by `data-rows="1|2"` and animated with `height var(--t-layout)`
(160ms ease; `prefers-reduced-motion` removes it). `syncCompactRows()` in
`js/app.js` sets the attribute from rendered capacity — `floor((wrapWidth +
gap) / (colMin + gap))` columns, read from the wrap's full width (arrow
visibility never feeds in) and CSS custom properties — never from a record
count. It only writes on a change, so the ResizeObserver firing during the
transition settles at once. Heights are fixed lengths (rows + padding + the
measured scrollbar track, `--prep-compact-scroll-h`); the toolbar is outside
the strip and never changes. A view switch applies the state without a
transition. The Gallery strip is always one row and is unaffected.

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
`centralCountHtml()`. Each section header is one `.prep-central-lead` group — title, a muted `·`, then the count — aligned on a shared text baseline (the icon stays centred on its text); the group takes the free space and any action sits after it. The lead group also carries, after the count, an Items-only `Roll …` metadata span (`itemRollMetaHtml()`, derived from `prep.itemIds` via `PrepUtils.formatRollCoverage()` — the span renders as a single min–max range like `7–15`, or a bare number when only one roll is selected) and a tertiary trash button (`clearAllSlotHtml()`, absent when the category is empty) whose delegated click runs `clearPrepCategory()` — the same `updatePrep()` path as a single `×`, no confirmation. Environments and items are `.prep-sel--card` tiles in
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
  (max-width: 752px)` rules measure (exactly 752px at 1920, with 16px side padding).
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
  middle-click and "copy link" work) with the shared external-link icon (`extIconHtml()`) beside the name,
  and remove. The "All Adversaries" picker row uses the same three zones
  (art button → `openAdversaryArtOverlay()`, FreshCutGrass link, checkbox)
  and the same `adversaryFreshCutGrassUrl()` + `adversaryExtIconHtml()`
  (the same `extIconHtml()` SVG); an adversary with no URL renders plain text with no link and no
  icon. The Environment and Adversary picker "{n} of {total}" counters are
  hidden at `max-width: 1536px` (CSS only, the text is still updated; the
  toolbar grid drops that track). DOM order is tab order: primary action →
  external link → remove. Tooltips come from the shared `data-tip` system
  (`encounter_link_tip` / `encounter_open_tip`, see design.md "Encounter links"); the `aria-label` repeats the same sentence.
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
- The Prep encounter action reads "Open Encounter" + the shared icon (service-agnostic);
  its "…in FreshCutGrass" sentence is the `aria-label` and tooltip. The Adversaries
  header is width-budgeted (title, Battle Points, ★ +N, this button), so by
  `prep-central` container width the button steps down: full label → short
  label ("Столкновение" / "Encounter", `prep_open_freshcutgrass_short`, ≤600px) →
  section icons hidden + Battle Points trimmed (≤560px) → icon only (≤520px).
  Nothing in that header may ellipsize or overlap at 1200–1920px; re-measure
  after adding anything to it.

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

## Environment → Recommended Adversaries (Prep)

Advisory, derived UI state on `#/prep` — the decision record is
[PD-008](product-decisions.md). Nothing here is persisted, and picking or
removing an environment never changes `prep.adversaryIds`.

**Parsing and matching** live in `js/potential-adversary-utils.js`
(`PotentialAdversaryUtils`), the only parser of an environment's
`potential_adversaries` text. `envAdversaryNames(env)` expands the English
entries (ordinary names, `Label (Member, …)` groups, `Tier N: …` entries,
tier/role annotations, group prefixes and member aliases, `any X` and bare
family references; `Any`/`All` and `see "…"` citations resolve to nothing)
into canonical English adversary names; the environment card's FreshCutGrass
links in `js/app.js` read the same function. The Bandits rule is two
explicit parts of the family table: `Bandit`, `Bandits`, `Jagged Knife
Bandits` and `Jagged Knives` are family keys for the Jagged Knife roster (so `any Bandit(s)` and
a bare `Bandits (tier 2)` reach it through the existing family code), and
`BANDIT_GROUP_MEMBER_FAMILY_ALIASES` lets the plural forms mean the family
as a member of another group too.

Four more families are keys of the same table — `Guards`/`Guard`,
`Skeletons`/`Skeleton`, `Assassins`/`Assassin` and `Cultists`/`Cultist` —
so a *bare* entry of one of those words expands to its roster (Head/Archer/
Bladed Guard, the four Skeleton adversaries, the three Assassins, the three
Cult adversaries). Unlike Bandits they do **not** expand as a member of
another group (`Undead (…, Skeletons)` is left as written, as `Pirates` is);
a full name such as `Skeleton Warrior` stays specific.

On top of that:
`normalizeAdversaryName()` is the conservative comparison key (trim, NFKC,
case fold, collapse whitespace, fold apostrophe/dash variants — no fuzzy
matching); `buildCatalogueNameIndex(adversaries)` maps it to Prep ids from
`adversary.name.en`; `matchCatalogueIds(names, index)` returns `{ ids,
unmatched }` (the UI uses only `ids`); `buildEnvironmentRecommendationIndex(
environments, index)` gives `Map<envId, advIds[]>`; and
`aggregateRecommendations(selectedEnvIds, index)` returns the provenance
map `Map<advId, { environmentIds, sourceCount }>` — each environment counted
at most once, unknown ids ignored.

**Lifecycle.** `state.prepRecommendationIndex` is that per-environment
index, rebuilt by `rebuildPrepRecommendationIndex()` only when the
environment catalogue (`setEnvironmentCatalog()`) or the Prep catalogue
(`setPrepCatalog()`, including a retry) is replaced — never per row or per
Prep change. `prepRecommendations(prep)` unions the selected environments'
entries on demand (at most three lookups), so nothing can go stale.

**Picker.** `advPickerListHtml()` applies the existing search/Tier/Type
filters first, then `PrepUtils.partitionRecommendedAdversaries()` splits the
result: recommended rows sort by `sourceCount` desc, Tier, localized name;
the rest by Tier, name. With at least one visible recommended row the
output is a `<section class="prep-rec-group">` (an `<h3>` "★ Recommended for
selected environments" + the visible count, then a `role="list"`), a thin
divider when ordinary rows follow, then the ordinary `role="list"`; with no
recommendation it is the plain flat list as before. `#prep-adv-list` itself
is just the scroll container. The `{n} of {total}` count is still the whole
filtered set. A recommended row (`.prep-adv-row.is-recommended`) gains a
`.prep-rec-star` — a non-interactive `role="img"` sibling between the
artwork and the name link, outside the `<a>` and out of the tab order — whose
`aria-label`/`data-tip` is "Recommended for: <localized environment names>".
The tint is `color-mix()` over `--hope`; hover, focus and the
selected checkbox keep precedence.

**Bulk add.** `recommendBulkView()` decides the `★ +N` / `★ ✓` button in
`#prep-recommend-wrap` (the central Adversaries header, before the
FreshCutGrass link, both inside `.prep-central-actions`): absent without
supported recommendations, `aria-disabled="true"` when none is missing.
`refreshRecommendBulkAction()` updates it in place (so a focused button keeps
focus). Clicking calls `addRecommendedAdversariesToActivePrep()` →
`PrepUtils.addRecommendedAdversaries()` (appends only missing ids, preserves
the rest, no duplicates, no mutation) → `updatePrep()` → `refreshCentralAdversaries()`
(list, count, warning, FreshCutGrass link, Battle Points, the button) plus an
in-place picker checkbox/label sync that leaves the filters alone; the toast
only follows a successful write.

**Synchronization.** Every path that changes the selected environments (the
picker checkbox, central × and trash, the catalog/Lists quick action, the
detail overlay, the Add to… dialog) ends in `refreshCentralEnvironments()`,
which calls `syncPrepRecommendations()` — the one helper that re-renders the
picker rows and the bulk button. `refreshCentralAdversaries()` re-evaluates
the bulk button when the adversary selection changes. A full
`renderPrepPage()` (route entry, language switch, switching/creating/
duplicating/deleting a Prep, catalogue retry) derives it all from scratch.

Tests: `tests/potential-adversary-utils.test.js` (parser, families, Bandits
rule, catalogue matching, real-data smoke) and
`tests/prep-recommendations.test.js` (index, provenance aggregation, group
ordering, bulk add).

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

## Global soundboard

A compact, non-modal panel of eight one-shot sound effects, available on every
route. A GM plays them over music they run elsewhere; the app never plays,
pauses or ducks music. Product rules: [PD-011](product-decisions.md).

- **Trigger:** one icon button (`#btn-soundboard`) in `.header-utils`, beside
  the language switch, built by `SoundboardUI.triggerHtml()` inside
  `renderHeader()`. `renderHeader()` rebuilds the header every render, so it
  ends with `SoundboardUI.sync()`, which re-applies `aria-expanded`, the
  "playing" dot and the language to the fresh button. The click handler is
  delegated on `document`, so it survives the rebuild.
- **Panel:** `#soundboard-panel` is a child of `<body>` (never of `#header` or a
  page), built once on first open and afterwards only attribute-updated —
  `applyLabels()` (language) and `applyState()` (engine snapshot). It is
  anchored under the trigger with `position: fixed` and never moves layout.
  Dismissal: trigger again, outside `pointerdown`, Escape (only when focus is on
  the panel or trigger — a window capture handler that consumes the key, so a
  card or dialog underneath stays open), or the close button. Closing never
  stops audio.
- **Engine** (`SoundboardEngine.create()`): one `AudioContext`, created from the
  click that opens the panel (user activation) and never torn down. Per sound
  the graph is `source → instance gain (fades) → sound gain → master gain →
  DynamicsCompressor → destination`. Decoded `AudioBuffer`s are cached; a fresh
  `AudioBufferSourceNode` is made per play. Status per sound is
  `idle | loading | ready | failed`; `load()` runs on every panel open and only
  re-requests what is not `ready` (so failures retry, successes never refetch).
  A sound that is not `ready` ignores clicks — **nothing is ever queued**.
- **Race guards:** `stopAll()` bumps a global `epoch` and every sound's `seq`;
  a start that was awaiting `AudioContext.resume()` re-checks both and drops
  itself. An `ended` handler only clears state when its instance is still the
  sound's current one. At most one instance per sound; replaying restarts it.
- **Levels:** master default 35%, per sound 100%, both clamped to 0..1 (no
  amplification) and changed with short `setTargetAtTime` ramps, so they apply
  to what is already playing. Persisted as one global key,
  `LS_KEYS.soundboard` (`dhcodex_soundboard`:
  `{ schemaVersion, master, sounds: { <id>: level } }`), validated by
  `SafeStorage.validators.soundboard` and completed against the manifest by
  `SoundboardManifest.normalizePrefs()`. It is not part of any Prep session.
  Playback state is never persisted — a reload restores levels, not sound.
- **Assets:** `sound/*` is copied by `scripts/build.js` like `img/`. URLs are
  built with `new URL(src, document.baseURI)`, so they resolve under the GitHub
  Pages project base path. They are not content-hashed (only css/js/data are).

### Adding a bundled sound

1. Put the file in `sound/`.
2. Add one entry to `SOUNDS` in `js/soundboard-manifest.js`: `id` (stable —
   it is the storage key), `src` (relative, e.g. `sound/foo.wav`), `icon`,
   `nameKey`, `defaultVolume`.
3. Add its drawing to `ICONS` in `js/soundboard-icons.js` under that `icon` key.
4. Add the `nameKey` string to `data/i18n.json` in both `en` and `ru`.
5. The panel grid is four columns wide and fills from the manifest order; a
   ninth sound starts a third row with no other change. Run
   `node --test tests/soundboard.test.js`, which checks the file exists, the
   icon is unique, and both strings are present.

## Local persistence

`js/safe-storage.js` (`SafeStorage`) is the one boundary between `js/app.js`
and `localStorage` — see [.claude/rules/browser-state.md](../.claude/rules/browser-state.md)
for the read/write/migration contract. `LS_KEYS` (top of `js/app.js`) is the
full list of persisted keys: language, lists, environment-to-list
membership, the storage-notice dismissal flag, the two Journey tables, the
global soundboard levels (see "Global soundboard"), and
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
| `js/prep-utils.js` | Prep default shape, prep lifecycle (add/switch/remove prep, title resolution), selection toggling, search/Tier/Type/Category/Source filtering, recommended-group ordering and the bulk-add of recommendations |
| `js/prep-reorder-utils.js` | Prep manual ordering: `moveId`/`insertId`, `resolveSlot`/`slotGeometry` (virtual insertion slots over the rendered grid), `keyboardTarget`, `autoscrollDelta` |
| `js/freshcutgrass-utils.js` | FreshCutGrass encounter URL encoding and the supported-adversary compatibility gate (`isFreshCutGrassSupported`, PD-014) |
| `js/potential-adversary-utils.js` | Potential Adversaries parsing/alias/family resolution (incl. the Bandits → Jagged Knife rule), canonical-name catalogue matching, per-environment recommendation index, recommendation provenance aggregation |
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
| Prep manual ordering (geometry, id moves, keyboard targets, autoscroll) | `js/prep-reorder-utils.js` | `tests/prep-reorder-utils.test.js`, `tests/prep-manual-order.test.js` |
| FreshCutGrass URL encoding | `js/freshcutgrass-utils.js` | `tests/freshcutgrass-utils.test.js` |
| Potential Adversaries parsing, catalogue matching, recommendation aggregation | `js/potential-adversary-utils.js` | `tests/potential-adversary-utils.test.js`, `tests/prep-recommendations.test.js` |
| Battle Points calculation | `js/battle-points.js` | `tests/battle-points.test.js` |
| Initial loading shell lifecycle | `js/app.js` (`beginInitialLoading()` etc.) | `tests/loading-state.test.js` |
| Random Environment card Tier badge/pick | `js/random-environment-utils.js` | `tests/random-environment-utils.test.js` |
| Soundboard manifest, stored levels, audio engine races | `js/soundboard-manifest.js`, `js/soundboard-engine.js` | `tests/soundboard.test.js` |

Run all of them with `node --test tests/*.test.js`.

## Journey 2 map editor (`#/journey2`, Phase 1; Phase A and B below)
- **Files (load order in `index.html`):** `js/journey2-geometry.js` (pure, UMD:
  measured lattice, cell ids, neighbours, validity, camera maths, readiness
  gate, glyph layout), `js/journey2-model.js` (pure: the map **document**,
  the editor **placement policy**, the command/transaction reducers, bounded
  Undo/Redo history, the "All N" footprint, quantity parsing, full-document
  validation for load **and** import), `js/journey2-store.js` (persistence
  over `SafeStorage`, storage injected), `js/journey2-view.js`
  (`Journey2View.mount/unmount`: DOM, transient pointer state, rendering),
  `css/journey2.css` (scoped to `.j2`, `body[data-route="journey2"]`, the
  print root). Data: `data/journey2/{map-template,map-anchors,symbols}.json`;
  raster `img/journey2/valloren-world.webp` (loaded only on this route).
  The model owns every rule; the view builds commands and never mutates a
  document. Both pure modules are `require()`d by `tests/journey2-*.test.js`.
- **Document** (`schemaVersion` 1, `kind` `bacchus-atlas.journey2.gm-backup`):
  `{ templateId, templateVersion, createdAt, updatedAt, batches[], tiles[] }`.
  A **batch** is one generated region copied *by value* from the generator
  (habitat + provenance, terrain, quantity, encounter rolls, rumor roll,
  notes); a **tile** is `{ id, batchId, cell:"q,r" }`. Counts are derived
  (`remaining = quantity - placed`), never stored; occupancy is keyed by the
  canonical cell id (one tile per cell). Provenance is explicit: a chosen
  habitat/terrain/quantity is `source:"manual"` and carries **no** dice
  rolls; a rolled one keeps its rolls. The export/backup *is* this document —
  no raster, SVG or asset bytes; the template is referenced by identity.
- **Placement policy** (`Journey2Model.createContext().policy`) — the single
  rule for preview, commit, load and import: a cell must be structurally
  valid (`grid.isValid`, i.e. inside the printed frame) and must not overlap a
  template `decorativeAreas` rectangle (title, compass, scale/credit). The
  decorative cells stay *valid template cells* (counts and ids are untouched);
  terrain simply cannot be placed there. Water, coast and fixed-marker cells
  are allowed. Markers and labels are protected by the **renderer**:
  `Geo.layoutProofGlyph` keeps every glyph box clear of every protection rect
  and inside its hexagon, otherwise the glyph is withheld (the tile stays,
  drawn as a dashed outline). `tests/journey2-model.test.js` proves this over
  every allowed cell and symbol.
- **Commands** (`createBatch`, `place`, `move`, `returnTile`, `deleteBatch`, `setNotes`)
  carry every generated value (ids, cells, timestamps), so Redo replays the
  same transaction and never re-rolls. `place` is atomic (all N or nothing).
  `View.dispatch()` is the one path for UI and tests: cancel any drag →
  flush a pending notes edit → `Model.apply` → history → persist → repaint.
  A no-op returns the same document reference and records nothing.
  `deleteBatch` removes the batch and all its tiles atomically (one Undo entry).
- **Region shape rules (Phase A, in the model):** all placed tiles of one batch
  must form one edge-connected component over the six axial neighbours
  (other batches never count). `place`, `move` and `returnTile` fail with
  `disconnected-region` otherwise; the view's preview calls the same
  `Model.checkPlacement()` so preview and commit never disagree. A region that
  is *already* split (an old save) stays usable under a non-worsening rule: an
  edit may keep or reduce the number of components but never increase it; once
  the region is connected the strict one-component rule applies.
  Enclosed empty cells are detected by `enclosedHoles()` / `holeCounts()`
  (flood fill of the batch's bounding area + 1 from its outer ring; only that
  batch's tiles are barriers; pure axial maths, so map edges never give false
  holes; only placeable cells are counted). A hole is a **warning**: a toast
  after the edit and a persistent badge on the card, never a refusal.
- **Generated values are immutable:** the generator is one fully random roll
  (`journey2Generator.roll()`, no arguments); the only commands that touch a
  batch after creation are `setNotes` and `deleteBatch`. No raw dice are shown
  (the stored `rolls`/entry pairs are provenance only).
- **Sidebar / cards / zoom (Phase A, view):** the map fills the stage and the
  sidebar is a `transform`-animated overlay (340px / 44px rail,
  `inert` on the hidden half, `aria-expanded` on both toggles); its state is
  stored via `store.loadUi/saveUi`, never in the document, and toggling never
  touches camera, selection or the active card. Cards are compact; exactly one
  (`activeBatchId`) is expanded (placement controls only — Encounter, Rumor and
  Notes live in the Region Inspector, below); it is view state, not history. Zoom buttons use
  `Geo.ZOOM_STEPS` via `Geo.stepZoom()` (exactly 100% is a stop; Fit may land
  between stops); the readout is a button that resets to exactly 100%.
- **Region Inspector (Phase B):** `inspector = { batchId, tileId, source }`
  (`source` `'map'` | `'card'`) is transient view state next to `activeBatchId`
  and independent of it. The pure helpers live in `js/journey2-model.js`
  (`NO_INSPECTION`, `inspectTile`, `inspectBatch`, `syncInspection`,
  `inspectedTileIds`); the view calls them and never persists the result. One
  `<aside role="dialog" aria-modal="false">` is built once in `.j2-mapwrap`, a
  **sibling** of the scaled `.j2-world`, so it keeps its screen size at every
  zoom; `renderInspector()` fills it in place (the notes textarea node is never
  replaced). Entry points: a plain click on a placed hex (`selectTile` →
  `openInspectorFromTile`, strong outline on that hex + soft `.j2-region-hl`
  outline on the whole region) and a card's Inspect button
  (`openInspectorFromCard`: soft outline only, no hex selected, works for an
  unplaced region). Positioning is `Geo.placeInspector()` (pure, tested): right
  of the hex, else left, above/below, else clamped; it avoids the *measured*
  rectangles of the sidebar/rail and diagnostics drawer (the selected-tile bar is
  a soft constraint) and falls back to a stable top-right corner without an
  anchor or a bottom-centred panel at ≤900px. It is re-run from the camera `rAF`
  (pan, zoom, resize, Fit), a `ResizeObserver` on the panel, the sidebar's
  transition and after every render, never per pointer event. `syncInspection`
  runs after every document change (deleted region → closed; vanished anchor
  hex → dropped). Close paths: button, Escape (after menu and drag/armed
  placement), empty-map click (never a pan), deletion, import/replace, opening
  Diagnostics, unmount — each flushes pending notes first; focus returns to the
  opener (the card's Inspect button, or the map). The pending-notes pipeline is
  the single `notesDirty` (committed through `setNotes`). Browser coverage:
  `scripts/journey2/stage1-verify.js` checks `insp.*` and `browser-verify.js`
  `inspector.*`; pure coverage: `tests/journey2-inspector.test.js`.
- **Interaction state** (view-only, never persisted, never in history):
  `tr` = a stock drag, a tile drag or an armed click-to-place; `pan`;
  selection; the open Region Inspector. The "All N" footprint is generated once per drag
  (`compactFootprint(N)`, a pure function of N) and frozen. A drag remembers
  the document it started on; release revalidates and a changed document
  cancels it. Escape, `pointercancel`, lost capture, a drop outside the map,
  route exit and any dispatched command cancel without touching state.
  Wheel/zoom during a drag recompute the preview with the *current* camera.
- **Storage:** exactly four keys, all `dhcodex_journey2_*` (`js/journey2-store.js`):
  `map` (the document), `map_recovery` (raw text of a map that failed
  validation), `map_previous` (the map an import replaced), `ui` (sidebar
  collapsed state). Nothing else is
  read or written; legacy Journey, Prep and unrelated keys stay byte-identical.
  A document that fails validation is **never** replaced by an empty autosave:
  `load()` reports `corrupt`, the raw text stays under its own key and is
  copied to `map_recovery`, edits are locked until the user imports a backup or
  explicitly starts an empty map. `save()` reports the real outcome; "Saved"
  is shown only after a successful write. Committed edits are written
  immediately; a notes edit is grouped (commit on blur) and the status reads
  "unsaved" until then. Undo history lives in memory only: it survives
  re-renders and language switches but **not** a route change or reload; the
  map itself always does. Import validates the whole document first, requires
  confirmation when replacing a non-empty map, writes the recovery copy only
  after confirmation, and clears the Undo history (so Undo can never combine
  two documents).
- **Lifecycle:** `render()` calls `renderJourney2Page()` on the route and
  `Journey2View.unmount()` on every other one (which flushes a pending notes
  edit). A re-render (language switch) only re-localizes the live mount, so
  camera, selection, sidebar scroll and unsaved text survive; stock cards are
  updated in place (never re-created mid-drag). Teardown releases listeners —
  including the two document-level ones (Escape, Undo/Redo, both ignored while
  a text field or dialog is active) — ResizeObservers, rAF, fetches, blob URLs,
  dialogs, the print root. A late load checks `disposed`.
- **Generator integration:** `journey2Generator` in `js/app.js` is a thin
  adapter over the *existing* `rollHabitat`, `rollEncounter`, `rollDie` and
  `state.journey` tables (no copy of any table). `roll()` takes no arguments
  and rolls everything (d20 habitat, d12 size = the quantity, d8+d6 encounter,
  d4 terrain, d100 rumor). `describe(batch)` returns display text (no dice
  sums) from the same tables.
- **Diagnostics:** the Phase 0 inspector (calibration grid, control cells,
  markers, protection areas, proof overlay, print proof) is a secondary
  drawer behind the toolbar's "More → Diagnostics", closed by default.
- **Dev pipeline (not shipped):** `scripts/journey2/` — `prepare-map.js`,
  `measure-grid.js`, `survey-markers.js`, `build-template.js`,
  `verify-template.js`, `browser-verify.js` (Phase 0 behaviours, via the
  diagnostics drawer), `stage1-verify.js` (the editor: real pointer input in
  isolated Playwright contexts), `print-proof.js` + `verify-print.js`.
- **Deployment note:** `scripts/build.js` copies everything not excluded;
  `docs/journey2-*` (handoff PDFs, review packages, evidence, stage ZIPs) are
  excluded and `scripts/check-journey2-build.js` fails the build if any of it
  — or a known Journey source file — appears in `dist/`. It no longer bans
  PDFs/ZIPs as a class.
