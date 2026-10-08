# Product decisions

This file is the source of truth for **current product behavior** in
Bacchus's Atlas. When older prose documentation (a comment, a README section,
a stray note) disagrees with a decision recorded here, this file wins —
update or remove the stale text instead of following it.

This is not a changelog and not a feature list. It records decisions that
were explicitly made and that an agent could otherwise get wrong by guessing
"reasonably." Routine, uncontested behavior belongs in
[docs/architecture.md](architecture.md), a data contract, or the code itself
— not here.

Format: each decision gets a stable `PD-NNN` id (never reused, never
renumbered), a status, a date, the decision itself, its implications,
what it explicitly rules out, and — when identifiable — what it replaced.

---

## PD-001: Prep environments have no primary state

- **Status:** Active
- **Date:** 2026-09-28
- **Decision:** Selected environments in Prep (`#/prep`) are
  an unordered-in-meaning collection of selections. No environment is ever
  "the" primary, main, or default one.
- **Implications:**
  - Selected environments are stored as a plain array of ids
    (`prep.environmentIds` in `data/prep` schema v2) with no
    primary-id field alongside it.
  - Selection order is the GM's own manual order (PD-012) and exists for
    presentation only; it must never be read as priority, importance, or a
    default choice. Dragging an environment to the front is not "making it
    primary".
  - The interface exposes exactly one control per environment — the
    selection checkbox (`.prep-select-checkbox`) — and never a "Make
    primary" action, star, or promotion affordance.
  - The three-environment cap (`PrepUtils.toggleEnvironment()`) is the
    only limit Prep enforces on environment selection; there is no
    promotion logic when an environment is added, removed, or reordered.
  - Loaders and validators must treat a legacy `primaryEnvironmentId` field
    as dead data: `js/safe-storage.js`'s v1 → v2 migration
    (`migratePrepV1ToV2()`) drops it silently rather than
    erroring or trying to preserve it as a hint.
- **Explicitly excluded:** `primaryEnvironmentId`, "primary environment",
  "main environment", first-selected-becomes-primary behavior, a "Make
  primary" control, and any rendering that visually distinguishes one
  selected environment from the others as more important.
- **Supersedes:** Schema v1 (`data/prep` local storage, pre this
  decision) carried `primaryEnvironmentId` on a prep. That field, and any
  UI that read or set it, no longer exists in the shipped product; only the
  migration path in `js/safe-storage.js` still references it, to consume and
  discard it safely from old browser storage.

## PD-002: Prep items have no quantity

- **Status:** Active
- **Date:** 2026-09-28
- **Decision:** A Prep item selection is binary — selected or not
  selected. There is no concept of "how many" of an item is prepared.
- **Implications:**
  - Selected items are stored as a deduplicated array of ids
    (`prep.itemIds`), never as `{ id, quantity }` pairs.
  - Selecting an already-selected item is a no-op with respect to count —
    `PrepUtils.toggleId()` adds an id at most once and `.length` is
    always the count of unique items, never a summed quantity.
  - The interface has exactly one control per item card — the selection
    checkbox — and never a stepper, +/- button, or a quantity badge.
  - "Selected: {n}" counters (`prep_selected_count`) always mean unique
    selected items, never a summed quantity.
  - A legacy persisted quantity is normalized away, not preserved: the v1 →
    v2 migration in `js/safe-storage.js` reads a v1 `{ id, quantity }[]`
    entry and keeps only the id, tolerating arrays that mix plain strings
    and `{ id, quantity }` objects from a partially-migrated store.
- **Explicitly excluded:** an `itemQuantity`/`itemQuantities` field anywhere
  in the persisted schema or the UI, increment/decrement controls, a
  quantity badge on a selected item card, and any "total items" count that
  is not simply the number of unique selected item ids.
- **Does not apply to:** adversary counts, dice quantities in rules text
  (`2d4`, "spend a Fear"), or any other legitimate quantity concept in the
  app outside Prep's own item selections — those are unaffected by
  this decision.
- **Supersedes:** Schema v1 stored `adversaries`/`items` as
  `{ id, quantity }[]` arrays with increment/decrement UI. That storage
  shape and UI no longer exist in the shipped product; only the migration
  path in `js/safe-storage.js` still references the old shape, to consume
  and discard the quantity field safely from old browser storage.

## PD-003: Public-but-unlisted deployment

- **Status:** Active
- **Date:** 2025 (see README.md "Unlisted public deployment"; date of
  original decision predates this file)
- **Decision:** The site is deployed reachable by direct link but not meant
  to be found by search engines or AI crawlers browsing for content. This is
  a request to well-behaved crawlers, not access control.
- **Implications:**
  - `index.html` ships a static `noindex, nofollow, nosnippet, noimageindex`
    robots meta tag, present before any JavaScript runs.
  - The initial HTML never contains the environment catalog — it renders
    client-side only, after `data/environments.json` loads.
  - `scripts/build.js` stays a plain copy step; it must never grow into a
    prerenderer that bakes catalog content into `dist/index.html`.
  - `scripts/check-unlisted-build.js` runs in CI on every build and fails it
    if any of the above regresses.
- **Explicitly excluded:** `llms.txt`, `sitemap.xml`, a project-level
  `robots.txt`, JSON-LD environment listings, or any other crawler-discovery
  file or server-side prerendering — none of these belong in this repo
  unless the repository owner explicitly decides the site should become
  discoverable again.
- **Supersedes:** n/a — this has been the deployment model since the
  catalog was moved to client-side rendering; there is no earlier indexed
  version to migrate away from.

## PD-004: "Daggerheart" is not part of the project's brand name

- **Status:** Active
- **Date:** predates this file; consolidated here from CLAUDE.md's
  "Branding" section
- **Decision:** The project's name is "Bacchus's Atlas" / "Атлас Бахуса".
  "Daggerheart™ Compatible" is a separate compatibility statement, not part
  of the brand — it is never translated, never inside the `<h1>` or the
  logo's accessible name, and always visually secondary to the title.
- **Implications:**
  - `app_title`/`app_subtitle`/`app_subtitle_compact` (the brand) and
    `compatibility_label` (the compatibility statement) stay distinct keys
    in `data/i18n.json` and distinct elements in `renderHeader()`.
  - The word "Daggerheart" is still correct and expected in the
    compatibility label itself, `source` attributions, rules terminology,
    and any documentation describing system compatibility — this decision
    is about the brand name, not the word itself.
- **Explicitly excluded:** "Daggerheart" as part of the project title,
  logo, or main brand name anywhere; imitating the official Daggerheart
  logo or artwork.
- **Supersedes:** n/a.

## PD-005: Prep's adversary catalogue is full-SRD, picker-metadata-only

- **Status:** Active
- **Date:** 2026-09-28 (art schema amended 2026-09-29 — see below)
- **Decision:** Prep's adversary picker (`data/prep.json`'s
  `adversaries` array) covers all 264 adversaries in the official Daggerheart
  SRD 2.0, each carrying only picker metadata — id, English/Russian name,
  Tier (1-4), official Adversary Type (one of ten fixed keys: bruiser,
  horde, leader, minion, ranged, skulk, social, solo, standard, support),
  and optional local artwork (`art: { thumb, full }`, both pre-generated
  WebP derivatives — see `scripts/generate-adversary-art.js` and
  "Prep's compact 'All Adversaries' toolbar" in
  [architecture.md](architecture.md); a bare `image` string is a retired
  shape, now a forbidden field). It never carries a full stat block, a
  source/book attribution, or Core-vs-Hope & Fear membership.
- **Implications:**
  - `scripts/validate-data.js` hard-fails the build if the array isn't
    exactly 264 records, if any record is missing Tier/Type/a non-empty
    English or Russian name, if `art` is present without both `thumb` and
    `full`, or if a record carries a forbidden stat-block-shaped field
    (`role`, `source`, `book`, `difficulty`, `hp`, `stress`, `attacks`,
    `features`, `description`, the retired `image`, etc. — see
    `PREP_ADVERSARY_FORBIDDEN_KEYS`).
  - The 17 adversary ids from the original MVP
    (`PREP_MVP_IDS`/`scripts/validate-data.js`) are permanent and
    must never be renamed or removed — a GM's already-saved Prep
    selection must keep resolving.
  - English name/Tier/Type were sourced from a GitHub mirror of the
    official Daggerheart SRD 2.0 text (matthttam/daggerheart-srd-2.0),
    cross-checked against each adversary's own stat-block header line
    ("Tier N <Type>.").
  - Russian names come from whichever is available first: (1)
    daggerheart.ru's own adversary listing (`https://daggerheart.ru/adversary`)
    with its "На Русском" language toggle switched on — a session-scoped
    cookie, not a URL prefix, which is why an initial archive.org-only
    research pass wrongly concluded the site had no adversary translations
    at all; it covers 129 of the 264 (confirmed directly by the project
    owner: the site doesn't cover all of them), matched by the site's own
    `/adversary/<slug>` English URL, with zero Tier/Type discrepancies
    against the canonical SRD source for every match, (2) a non-empty
    translation already in the project's existing data (the original MVP's
    own translations — all 7 that overlap with daggerheart.ru's listing
    matched it byte-for-byte, confirming that's where they originally came
    from), (3) `data/adversary-translations-manual.json`, this project's
    own literary translations for the ids daggerheart.ru doesn't cover. No
    adversary ships with an empty or placeholder Russian name.
  - `scripts/import-prep-adversaries.js` is the one-time,
    dependency-free tool that (re)builds the array from these sources and
    writes a translation-status audit report; it refuses to write anything
    if a record is left unresolved/ambiguous.
  - Adding a filter (Tier, Type, "Selected only") to the adversary picker
    is in scope; adding a Core/Hope & Fear source filter, full stat blocks,
    or any other book-attribution UI is not — see the "OUT OF SCOPE"
    boundary this decision inherits from PD-001/PD-002's binary-selection
    spirit.
- **Explicitly excluded:** a `role`/`source`/`book` field on any adversary
  record, a Core-vs-Hope & Fear filter or badge for adversaries, importing
  or displaying Difficulty/HP/Stress/attacks/features/Experiences/
  descriptions, renaming any of the 17 original MVP ids.
- **Supersedes:** the original Prep MVP's 17-adversary hand-picked
  subset (no Tier/Type fields at all) — see git history predating this
  decision for that shape.

## PD-006: Prep's item catalogue is the full 240-entry loot table

- **Status:** Active
- **Date:** 2026-09-28
- **Decision:** Prep's item picker (`data/prep.json`'s
  `items` array) references exactly 240 ids: `ci1`-`ci60` (Core Items),
  `cc1`-`cc60` (Core Consumables), `hi1`-`hi60` (Hope & Fear Items),
  `hc1`-`hc60` (Hope & Fear Consumables) — the Daggerheart Loot Generator's
  complete roll-table loot, not just the original MVP's `ci1`-`ci10`
  subset. The full metadata for every one of these ids is merged into the
  shared `data/items.json` catalogue (which keeps its other, non-Prep-
  Prep entries — aliases, environment-linked items — unchanged);
  `prep.json` itself still only ever stores the ordered id list.
- **Implications:**
  - `scripts/validate-data.js` hard-fails the build if the array isn't
    exactly 240 entries, or if any of the four prefix groups is missing a
    roll number 1-60 or has one outside that range.
  - Prep's item picker gained a Category toggle (Items/
    Consumables) and a Source toggle (All/Core/Hope & Fear), each
    combining with the existing name-or-exact-roll-number search — see
    `PrepUtils.filterItems()`.
  - The `ci1`-`ci10` ids from the original MVP resolve exactly as before
    (same metadata, unchanged) — nothing about them was touched by this
    expansion.
- **Explicitly excluded:** item quantities (still PD-002), a second
  storage key or duplicated item metadata inside `prep.json`.
- **Supersedes:** the original Prep MVP's `ci1`-`ci10` subset.

## PD-007: Prep shows Battle Points in the Adversaries header, always

- **Status:** Active
- **Date:** 2026-09-30
- **Decision:** The Prep Adversaries section header carries a Battle Points
  summary (Daggerheart Battle Guide budgeting): a character stepper
  (`Characters [−] 4 [+]`, 1-20, default 4) and a `BP spent / available`
  button opening a breakdown popover (base budget, encounter style,
  manual and automatic adjustments, cost per adversary type). It is shown
  **always**, including `BP 0 / 14` with no adversaries selected, and the
  empty encounter never receives the "no Bruiser/Horde/Leader/Solo" +1.
  Chosen after comparing three prototypes (inline stepper, segmented
  control, summary-first popover): the stepper is directly visible and
  editable, at a cost of the widest header footprint.
- **Implications:**
  - Battle Points are advisory. Exceeding the budget shows a restrained
    amber warning and never blocks adding adversaries, disables a control,
    asks for confirmation, or marks the prep invalid.
  - Only the character count persists (its own raw key, not the Prep
    schema); style and the two manual checkboxes reset on reload. Nothing is
    part of the saved Prep, duplication, or the FreshCutGrass export.
  - No adversary quantity is introduced (PD-002): each selected adversary
    counts once, so a Minion group is priced as 1 ÷ characters per Minion.
  - Adversary types are the canonical `adv.type` ids, never translated labels.
- **Explicitly excluded:** per-prep character counts, persisted manual
  adjustments, and any blocking behaviour.

## PD-008: Prep recommends adversaries from the selected environments, advisorily

- **Status:** Active
- **Date:** 2026-10-01
- **Decision:** In Prep (`#/prep`), the selected environments' English
  `potential_adversaries` text produces *recommended adversaries*: those
  names that resolve to an adversary in `data/prep.json`. They are surfaced
  in the All Adversaries picker (a "Recommended for selected environments"
  group at the top, each row marked with a gold ★ naming its source
  environments) and through one explicit `★ +N` bulk-add button in the
  central Adversaries header. The GM always makes the final selection.
- **Implications:**
  - **Advisory only.** Selecting an environment never selects an adversary;
    removing an environment never removes one. Adding an environment can
    only make an already-selected adversary gain a ★; removing one can only
    take it away. The only path from recommendation to selection is the
    user's own checkbox or the `★ +N` click.
  - **`data/prep.json` is the whitelist.** Only a name that matches a
    catalogue adversary is ever recommended; unsupported, custom,
    third-party or unknown names are silently ignored — no placeholder rows,
    no warnings, no validation failure. No adversary is added to the
    catalogue for the sake of this feature.
  - **Canonical English names, conservative matching.** Matching compares
    `adversary.name.en` with the English text only (never Russian), after
    trim, NFKC, case folding, whitespace collapsing and folding of Unicode
    apostrophe/dash variants — nothing fuzzier. Names that differ by
    punctuation or a subtitle stay different.
  - **One parser.** The Potential Adversaries parsing/alias/family rules
    live in `js/potential-adversary-utils.js` and are shared with the
    environment card's FreshCutGrass links; Prep adds only the catalogue
    match.
  - **Generic Bandits mean the Jagged Knife family.** `Bandit`, `Bandits`,
    `Bandits (tier 2)`, `any Bandit(s)`, `Jagged Knife Bandits`, `Jagged Knives`, `any Jagged
    Knife` and `any Jagged Knife Bandit` all expand to the complete
    seven-adversary Jagged Knife roster (Bandit, Hexer, Kneebreaker, Lackey,
    Lieutenant, Shadow, Sniper) through explicit family entries, not name
    guessing. The plural forms (`Bandits`, `Jagged Knife Bandits`) also mean
    the family when listed as a member of some other group (e.g. `Outlaws
    (Bandits, Pirates, …)`); the singular `Bandit` inside a group stays the
    one Jagged Knife Bandit (`Jagged Knife Bandits (Bandit, Hexer, …)`).
  - **Bare Guards, Skeletons, Assassins and Cultists mean their rosters**
    (added 2026-10-05, so the FreshCutGrass support gate of PD-014 doesn't
    leave them as plain text). Only as a whole entry; inside another group
    they stay as written. This also widens Prep's recommendations for the
    environments that list them.
  - **"Beasts (any)" is a tiered family.** The exact entry `Beasts (any)` (RU
    `Звери (любые)`) renders as four links — Beasts Tier 1 … Tier 4 (RU
    `Звери Ранг N`) — each opening its own FreshCutGrass encounter, and
    resolves for Prep to all 32 SRD 2.0 beasts (those FreshCutGrass tags
    `Beasts` that `data/prep.json` holds, plus Glass Snake, Giant Scorpion and
    Giant Mosquitoes, which environments' explicit Beasts lists use). The rosters are explicit in
    `BEAST_TIER_ROSTERS`; a test cross-checks them against `data/prep.json`.
    Explicit lists such as `Beasts (Bear, Dire Wolf)` are unchanged.
  - **Derived, never persisted.** Recommendations are recomputed from the
    active Prep's `environmentIds`; nothing is stored and the Prep schema is
    unchanged.
  - **Bulk add ignores the picker filters.** `★ +N` counts and adds every
    supported recommendation the Prep lacks, regardless of the picker's
    search/Tier/Type filters, which stay as they were. The picker itself
    never force-shows a recommendation the filters hide. With nothing
    supported to recommend the button is absent; with everything already
    selected it reads `★ ✓` and is inert (`aria-disabled`, still focusable).
- **Explicitly excluded:** automatic selection/removal, custom adversaries,
  fuzzy matching, recommendations from Russian text, stored weights, a
  Recommended-only filter, stars in the central selected list or on
  environment cards, and any change to the Prep persistence schema.

---

## PD-009: Atlas of Adventure environments scale between Tier 1 and 2 by their own rule

- **Status:** Active
- **Date:** 2026-10-01
- **Decision:** An environment whose `source` is `"Atlas of Adventure"`,
  read through the detail card's "view as tier" pills at the *other* of
  Tier 1/Tier 2, uses the book's own "Scaling" rule instead of the Core
  Rulebook tier table: difficulty (and every in-text check DC) moves by a
  flat 3 — up to Tier 2, down to Tier 1 — and a damage roll of exactly one
  die becomes two dice (up) or exactly two dice become one (down), keeping
  the die size and the `+N` modifier.
- **Implications:**
  - The rule is keyed on `env.source` and applies to that one tier pair
    only. Every other environment, and every other tier pair of an Atlas
    environment (Tier 1↔3, 2↔3, anything involving Tier 4), keeps the
    original table-based scaling. The environment's own tier is never
    rewritten.
  - A damage roll that doesn't fit the one-die/two-dice shape (Raging
    Fire's 2d10+2 going up, Wretched Mire's 1d10 going down) is not covered
    by the book's rule and falls back to the original table scaling for
    that roll.
  - No clamping to 10–20 on the Atlas rule (the table path clamps; the
    book's rule is a plain ±3).
  - Code: `retierFor()`, `retierValue()`, `retierDamage()` in `js/app.js`.
- **Explicitly excluded:** changing how any non-Atlas environment scales,
  and a per-environment override field in the data.

## PD-010: Prep sessions are shared as serverless snapshot links

- **Decision:** "Copy session link" (Prep actions menu) puts a
  `?prep=<payload>#/prep` URL on the clipboard. The payload is a compact
  JSON snapshot — title, Session Notes, and the environment/adversary/item
  id lists — as UTF-8, unpadded URL-safe Base64 (`js/prep-share-utils.js`,
  `PrepShareUtils`). No backend, shortener or account.
- **Import is always a confirmed copy:** opening a link never overwrites
  anything; a confirmation dialog (Cancel focused) appends a *new* prep with
  a fresh id and timestamps and makes it active. The `prep` parameter is
  stripped with `replaceState` on every outcome, so a refresh can't import
  twice. Duplicate titles are fine; sessions are never merged.
- **Never in the payload:** local prep id, timestamps, `activeSessionId`,
  other sessions, search/filter state, display mode, UI language, Battle
  Points state (character count is a global preference; style/adjustments
  are transient).
- **Unknown ids are dropped, not fatal:** ids missing from the loaded
  catalogues (and environments beyond the cap of three) are omitted with a
  warning toast; the rest imports. A malformed/oversized/unsupported payload
  changes nothing and shows one generic "invalid or damaged" toast.
- **No silent truncation on export:** a link longer than
  `PrepShareUtils.MAX_URL_LENGTH` is refused with an explanation.
- Code: `copyPrepShareLink()`, `handleSharedPrepLink()`,
  `openSharedPrepDialog()` in `js/app.js`; read only after the catalogues
  load (`init()` and `retryPrepCatalog()`).

## PD-011: The soundboard is a global, icon-only, one-shot effects panel

- **Decision:** one soundboard, reachable from the header on every route,
  with eight bundled effects. It plays *effects only*, over whatever music
  the GM runs elsewhere — no music, uploads, playlists, looping, ordering,
  per-session sound sets, hotkeys or output-device handling.
- **Icon-only:** a sound button shows an icon and nothing else — no caption,
  filename or tooltip, in the panel or in settings mode. Names exist only as
  localized `aria-label`s. Do not add visible names without a new decision.
- **Every sound is a one-shot,** including `footsteps-in-a-tunnel-loop` and
  `big-fire-burning`: a filename never implies looping.
- **One instance per sound:** replaying a sound restarts it; different sounds
  overlap. A sound that is still loading refuses the click — a click is never
  queued, so nothing fires late.
- **Levels are global preferences** (master 35%, each sound 100%, max unity),
  not part of a Prep session, and playback never resumes after a reload.
- Mechanics: [docs/architecture.md](architecture.md) "Global soundboard".

## PD-012: Prep's selected cards keep a manual order — the arrays are the order

- **Status:** Active
- **Date:** 2026-10-02
- **Decision:** The GM can drag the selected Environments, Adversaries and
  Items into any order, and drag an unselected catalog entry straight to a
  position. `prep.environmentIds` / `adversaryIds` / `itemIds` are the
  canonical display order and are rendered without sorting; the catalogs
  keep their automatic sort. There is no separate order field.
- **Everywhere the session is read, the order is the same:** the central
  panel, autosave/reload, session switch and duplicate, Copy session link,
  Copy session summary and the FreshCutGrass export. Existing saved sessions
  keep their stored (selection) order, which now shows as-is rather than
  Tier-sorted.
- **Desktop pointers only.** Whole-card drag with a fine pointer; no grip or
  handle of any kind (the grab cursor is the cue). Keyboard: Alt+↑/↓ (one step) and
  Alt+Shift+↑/↓ (start/end — not Home/End, which MacBooks lack). Touch and
  phone reordering are out of scope.
- **Explicitly excluded:** Reset order / restore default order / automatic
  re-sort, undo, drag-to-delete (dragging outside is *cancel*), visible
  Move earlier/later menus, a `+` placeholder that occupies a grid cell
  (layout must not jump), a new schema, a server.
- **Constraints preserved:** same-section drops only, no duplicates, the
  three-environment cap (cards already selected stay reorderable at 3/3),
  checkbox selection and the × remove are unchanged.
- Code: `js/prep-reorder-utils.js`, `js/prep-reorder-ui.js`,
  `commitPrepOrder()`/`initPrepReorder()` in `js/app.js`; see
  [architecture.md](architecture.md) "Prep manual ordering".

## PD-013: One item meta line everywhere — "#roll · Kind · Source"
- **Date:** 2026-10-02
- **Decision:** Wherever Prep shows an item's roll number, kind and source
  together, they appear in this one order: `#19 · Consumable · Core`. The
  picker row's second line, the gallery tile's tooltip and the selected item
  card all use it, built by `PrepUtils.formatItemMeta()` via `itemMetaText()`
  in `js/app.js`.
- **Why roll-first:** an ellipsis truncates from the end. The roll is the
  shortest field and the one the dice-roll filter matches on, so it must
  survive narrow rows and longer RU strings; Source ("Hope & Fear") is the
  longest and least useful when picking, so it is the one allowed to lose.
- **How to apply:** a new surface that shows these facts calls
  `itemMetaText()` — never a second inline template.

## PD-014: FreshCutGrass links exist only for adversaries FreshCutGrass supports
- **Date:** 2026-10-05
- **Decision:** An adversary is linked to, or exported to, FreshCutGrass only
  if it is in the supported dataset: the English names of the adversary
  catalogue `data/prep.json` (official adversaries, spelled as FreshCutGrass
  spells them). Anything absent is unsupported — fail closed, never "probably
  supported". The decision is never inferred from source, book, tier or
  homebrew status, and never from a localized label; RU/EN do not change it.
- **Why:** FreshCutGrass opens an effectively empty encounter for a name it
  does not know, so a link for it looks broken.
- **Behaviour:** an unsupported adversary renders as plain text — no `<a>`, no
  icon, not greyed out (the adversary is valid; only the integration is
  missing). The environment overlay's "Open Encounter" exports the supported
  subset; when that is a strict subset it shows a small count badge and a
  tooltip naming what is left out (long lists are cut with "and N more");
  with no supported adversary the action and the "Adversary names open a
  prepared encounter" hint are absent (the hint shows only when at least one
  encounter link is rendered). All-supported and
  no-adversary environments are unchanged. Group links ("Beasts", a family)
  export their supported members and are plain text when none remain.
- **How to apply:** ask `FreshCutGrassUtils.isFreshCutGrassSupported()` and
  build URLs only through `buildFreshCutGrassEncounterUrl()` in `js/app.js`
  (which gates through `buildSupportedEncounterUrl()`); never add a second
  allowlist or an `if (source === …)` check. Supported names are sent under
  the catalogue spelling. Making an adversary linkable means adding it to
  `data/prep.json`.

## PD-015: Journey 2 is a separate experimental route on the original Valloren map
- **Date:** 2026-10-06
- **Decision:** `#/journey2` is a GM-only map workspace built on the
  *original* Journey to Horizon artwork (two native panels assembled into one
  world raster), with one measured hex grid and an immutable catalogue of the
  fixed original markers. `#/journey` and its saved data are untouched;
  there is no migration and no navigation entry yet. Stage 0 delivered only
  geometry, a read-only diagnostic surface and a print proof. (Phase 1 added
  the editor, inventory and its own storage — see PD-016; the immutability
  and legacy-isolation rules here are unchanged.)
- **Immutable by design:** marker positions/artwork live in
  `data/journey2/map-anchors.json` (template), never in campaign state; there
  is no create/move/delete/re-icon control. Marrogate and Horizon are *named
  destinations* with lettering in the artwork (no duplicate text, no sanctuary
  mechanics). The other 56 repeated glyphs are catalogued as kind
  "sanctuary" — the source artwork does not name them, so this follows the
  handoff's convention and is flagged for owner confirmation.
- **Valid cells:** a cell is valid iff its centre lies inside the printed
  frame interior; water and old coastlines never invalidate a cell, and the
  title/compass/legend areas stay valid but are protected from overlays.
- **Gate:** `readyForInteractivePlacement` may be true only when the four
  verification slots (assets, geometry, browser, print proof) all pass; the
  view shows "Unverified" otherwise and never substitutes guessed geometry.
- **Where:** [architecture.md](architecture.md) "Journey 2 diagnostic view";
  evidence in `docs/journey2-implementation/stage-0/`.

## PD-016: Journey 2 Phase 1 — a batch/tile map editor with its own storage
- **Date:** 2026-10-06
- **Decision:** `#/journey2` becomes a usable GM tile editor: generate a
  *batch* (one card per generated region, not per hex), place it one hex at a
  time or all remaining hexes in one drag, move individual tiles, return a
  tile to stock, Undo/Redo, local saving, full GM JSON backup. The map owns
  its data: a batch is copied by value from the generator, so editing or
  deleting a legacy `#/journey` entry never changes a Journey 2 batch.
- **Batches, not merged regions:** two forests are two batches even with equal
  habitat and terrain. A batch is placed in any order; Phase A (PD-017) later
  made every batch one connected shape (the d12 limit is the rolled quantity).
- **Quantity (superseded by PD-017 — the quantity is now always the rolled d12):** any positive integer up to 1000 (about a fifth of the map's
  ~4,670 placeable cells; it must stay placeable by one "All N" drop). Zero,
  negative, fractional and non-numeric input, and anything over the limit, is
  *rejected with an inline error — never clamped*. Leaving the field empty
  rolls the legacy d12. A chosen habitat/terrain/quantity is recorded as
  `manual`; no die result is fabricated for it.
- **"All N" means the unplaced stock**, as one atomic, all-or-nothing
  transaction with one Undo entry. The footprint is a random connected
  shape of exactly N cells (PD-032), frozen for the drag; one occupied,
  outside or decorative cell rejects the whole drop (no truncation, no
  nearest-free fill, no overwrite). Moving an already placed batch as a unit
  is deliberately out of scope.
- **Placement policy:** water/coast cells are usable; a cell holding a printed sanctuary or destination (Horizon/Marrogate) icon is refused for new placement/moves (`checkCells`, reason `sanctuary`; saved tiles already there still load); terrain is refused
  on cells overlapping the title, compass or scale/credit furniture (the cells
  stay valid template cells). One policy serves preview, commit, load and
  import. Fixed markers and labels are protected in the *renderer* — a glyph
  that cannot fit without covering one is withheld, never drawn over it.
- **Preparation is not discovery.** Generating, placing, moving and returning
  tiles never touch any discovered-cell state (there is none yet).
- **History:** Undo/Redo covers batch creation, placement, "All N", move,
  return and notes edits (grouped per commit, not per keystroke); it is in
  memory, bounded (100), survives re-renders but not route changes/reload.
  Importing a backup clears it. The map data always persists.
- **Backup/import:** the export is the versioned document, no assets. Import
  validates everything before replacing anything, rejects unknown schema or
  template versions and unknown fields as a whole, asks for confirmation before
  replacing a non-empty map, and keeps the replaced map as a recovery copy
  (plus a download offer). A corrupt saved map is never autosaved over.
- **Click-to-place** (arm a stock handle, click a cell; Esc exits) exists as a
  supplement to, never a replacement for, the two drag targets.
- **Where:** [architecture.md](architecture.md) "Journey 2 map editor";
  evidence in `docs/journey2-implementation/stage-1/`.

## PD-017: Journey 2 Phase A — random, immutable, connected regions
- **Date:** 2026-10-06
- **Decision:** supersedes the manual-input parts of PD-016. Journey 2 has one
  generator action: every value (habitat, size, terrain, encounter, rumor) is
  rolled; there is no habitat picker, hex-count field or terrain override, and
  the rolled d12 is the region's quantity. A generated region is immutable
  (no reroll, no editing) except its GM notes, and can be deleted whole (with
  all its placed tiles, confirmed, one Undo entry). Raw dice results are never
  shown, only the generated result.
- **Connected regions:** all placed tiles of a region form one edge-connected
  shape (enforced in the model for place, move and return). Different regions
  may touch. This replaces PD-016's "a batch may be disconnected".
- **Enclosed empty hexes are a warning, not a rule:** a toast after the edit
  and a persistent badge on the card; the GM may keep the shape.
- **UI:** the sidebar is an animated overlay with a 44px rail (explicit toggle
  only, persisted separately from the document, never refits the map); one
  compact card is expanded at a time; zoom uses fixed steps including exactly
  100%. Fog of war, sanctuaries, player preview and printing are later phases;
  `#/journey` is not replaced yet.
- **Where:** [architecture.md](architecture.md) "Journey 2 map editor".

## PD-018: Journey 2 Phase B — the map is the inspection surface (Region Inspector)
- **Date:** 2026-10-06
- **Decision:** the sidebar is for **generating, placing, deleting and opening
  the inspector**; reading a region is done in one **Region Inspector**, a
  large floating panel over the map. Clicking any placed hex opens it, and
  every card has an **Inspect region** button (also for an unplaced region,
  also while the card is collapsed). Cards no longer carry Encounter / Rumor /
  Notes tabs. (GM notes were later removed — PD-019.)
- **Generated details are region-level:** Habitat, Terrain, Encounter and Rumor
  belong to the region, never to a hex. Clicking any hex of region #6
  shows the same panel; the clicked hex is only the visual anchor and the
  selected tile. Nothing is copied into tile records.
- **Independent state:** the card expanded for placement (`activeBatchId`) and
  the inspected region (`inspector`) are separate. A map click never expands,
  collapses, opens or scrolls the sidebar; the inspected card only gets a
  subtle `is-inspected` look. The inspector is transient view state — never
  persisted (not in `dhcodex_journey2_ui`), never in the document, backups or
  Undo history; Undo of a region's creation or a deletion closes it and Redo /
  Undo-of-delete never reopens it; import and route exit clear it.
- **Read-only:** no dice, reroll, Keep/Discard or value editing. (There used to
  be one editable field, GM notes; PD-019 removed it, so the inspector is now
  purely read-only apart from Return to stock.)
- **Priority:** open dialog > active drag or pan > armed Place > (future map
  tools, e.g. fog) > neutral inspection. Escape: menu, then drag/armed
  placement, then the inspector. The inspector and the Diagnostics drawer are
  mutually exclusive.
- **Camera rule:** opening or closing any transient UI (inspector, sidebar,
  Diagnostics drawer) never changes pan or zoom; only an explicit Fit does.
  The Inspect button never toggles: same region keeps it open, another region
  replaces it, closing is explicit (Close, Escape, empty-map click). Hexes
  covered by the panel are not click-through.
- **Still GM-only and out of scope:** fog of war, player-facing output,
  printing, sanctuaries, region reroll and editing are later phases.
- **Where:** [architecture.md](architecture.md) "Region Inspector (Phase B)".

## PD-019: Journey 2 — no GM notes, tile info inside the inspector, environments on the card
- **Date:** 2026-10-06
- **Decision (GM notes removed):** the Region Inspector no longer has a GM notes
  field, the card no longer shows a notes dot, and there is no pending-notes
  pipeline (`notesDirty`/`flushNotes`) any more. The **document keeps** the
  `notes` field and the `setNotes` command: removing them would make every
  already-saved map or backup that carries notes fail validation (and a map that
  fails validation is never autosaved over). Old notes therefore survive in
  saves and exports but are no longer shown or editable.
- **Decision (one panel for a hex):** the separate bottom "selected tile" bar is
  gone. Its content lives in the inspector's footer — "Hex q,r" and **Return to
  stock** — shown only while the inspector is anchored on a placed hex (opened
  by clicking one) and hidden when it was opened from a card's Inspect button.
  The bar's Deselect button went with it (the inspector's Close is the same
  action). A hex dragged to a new cell stays selected only while the inspector
  is anchored on it; otherwise nothing is selected afterwards (Undo remains).
- **Decision (environments on the card — superseded by PD-020, they now live in the
  Region Inspector):** an *expanded* region card had an **Environments (N)** disclosure listing every catalog environment whose
  `biomes` contains the region's biome, sorted by tier then name. Each row is a
  plain link to that environment's overlay on `#/journey2/env/<id>` (the same
  route-driven overlay as everywhere else), so the map and the open card are
  untouched. Matching is exact: `universal` and `settlement` environments are
  *not* mixed into a terrain's list. An overtaken region has no biome and shows
  no dropdown.
- **Where:** [architecture.md](architecture.md) "Region Inspector (Phase B)" and
  "Journey 2 map editor".

## PD-020: Journey 2 Phase C — Fog of War and Player Preview
- **Date:** 2026-10-06
- **Decision (fog is cell data):** what the players have explored is a set of **map cells**
  (`doc.playerVisibility.revealedCells`), not a property of regions or tiles. Every cell is
  **hidden by default** (`[]`); nothing is revealed automatically — not Marrogate, not the
  neighbours of a region, not a whole region at once (a "reveal region" action is out of scope).
  Generating, placing, moving, returning and deleting regions never change fog; content moved into
  a revealed cell becomes visible, into a hidden cell becomes hidden; hiding a cell deletes nothing.
  Only placeable cells (inside the frame, not title/compass/scale furniture) can be revealed.
- **Decision (the base map is never fogged away):** the original Old Valloren raster, its printed
  MARROGATE and HORIZON labels and every sanctuary icon embedded in it stay visible in every view.
  The fog hides only *generated New Valloren content* (Habitat glyphs, Terrain dots, Shadowblight
  marks, overtaken marks, and later points of interest and other cell-bound overlays). The veil is
  masked around the icon/label protection rectangles; the raster is not modified. Sanctuary
  generation, sanctuary names and their visibility remain a future, independent state.
- **Decision (GM vs players, one document):** the GM view always shows all generated content; a
  subtle hatched veil only marks
  unexplored cells (Player Preview only since PD-036; the GM view never draws it). **Player Preview** renders the *same* document through the pure player
  projection (`js/journey2-projection.js`): content in hidden cells is not produced at all (a data
  rule, not CSS), and Encounter, Rumor, notes, suggested environments, region ids, coordinates,
  warnings, selection and diagnostics are never in it. A region spanning revealed and hidden cells
  shows only its revealed hexes.
- **Decision (tools):** Reveal and Hide are map tools that paint by click or drag (one hex wide);
  one pointer stroke is **one Undo/Redo entry** and one autosave; Space (or the middle button) pans
  while a tool is active; a tool outranks the Region Inspector and tile selection but not armed
  placement, a drag/pan or Player Preview. The active tool, the preview, the hover cell and the stroke
  are transient (never in the document, history, backup or storage); no fog preference is stored.
  Fog edits are campaign data: autosaved, exported/imported, validated and undoable.
- **Decision (print):** printing is not part of this phase, but Player Preview is the print
  renderer's first customer: the future print phase draws `buildPlayerProjection(doc)` (via the
  shared `overlayMarkup` routine; the fog has no cut-outs since PD-024) into the two original A4 map halves — never a
  clipped screen, CSS-hidden GM markup or a cloned interactive DOM.
- **Decision (cleanup in the same phase):** suggested environments moved from the sidebar card
  (where a long list swamped it) into a read-only, collapsed-by-default section of the Region
  Inspector, after Rumor, with the same data and order. **GM notes stay removed** (PD-019 was
  reaffirmed when this phase was specified: the brief's "restore GM Notes if omitted" was answered
  "keep them removed"); the document still carries `notes`. The inspector footer no longer shows the
  raw "Hex q,r" — coordinates are Diagnostics-only; Return to stock stays.
- **Out of scope (unchanged):** printing/PDF/A4 splitting, sanctuary generation and names, visited
  sanctuary state, Soul Echo, points-of-interest creation, automatic or region-wide reveal, brushes
  larger than one hex, live player view or accounts, replacing `#/journey`, mobile redesign.
- **Where:** [architecture.md](architecture.md) "Fog of War and Player Preview (Phase C, PD-020)".

## PD-021: Journey 2 — a connected prepared map and a derived region perimeter
- **Status:** Active — the adjacency, move/return and override decisions below are superseded by PD-024 (global component count, confirmation dialog); the perimeter and player decisions stand
- **Date:** 2026-10-06
- **Decision (adjacency):** a Journey 2 map is one prepared area, not scattered islands. The first
  region may begin in any valid empty cell. Every later region's **first placed tile(s)** must share a
  **full hex edge** with a tile of *another* region; one touching tile is enough (a *Place all* footprint
  must be internally connected, free of occupied/prohibited cells and touch the map at least once). The
  remaining tiles only have to stay connected to their own region (Phase A rule). On the flat-top hex
  grid contact at a corner alone cannot occur (cells meeting at a corner already share an edge); a cell
  two steps away is simply rejected. The rule applies when a region has **no tile placed yet** — once it
  is on the map, more tiles only need to join it.
- **Decision (moves and returns):** an ordinary **move** or **return to stock** must not split a region
  internally (unchanged) and must not leave a region that was attached to the prepared map entirely
  detached — neither the edited region nor a neighbour that leaned on the moved tile. A region that was
  never attached (the first region, a separate area, an old save) stays freely editable. Returning the
  last tile of a region is allowed whenever it does not strand another region. **Delete region** is an
  explicit destructive action and is not restricted. Undo/Redo restore snapshots and never re-check.
- **Decision (override):** isolated preparation is allowed only through the explicit **Start separate
  area** toggle on an unplaced region's card — a transient, one-shot choice (`separate: true` on that
  one `place` command; never stored in the document, history, backup or `localStorage`; it turns itself
  off after the placement). Its absence means "must touch". Loading or importing a document does **not**
  re-validate adjacency: separate areas and older saves load as they are.
- **Decision (feedback):** the preview, the tooltip, the rejection hint and the model all use the same
  check (`Model.checkPlacement` → `attachmentCheck`); the messages are localized
  (`journey2_reason_not_adjacent`, `…_detaches_region`, `…_detaches_other`).
- **Decision (perimeter):** every placed region is outlined by a thick near-black cartographic line,
  drawn in a dedicated pointer-transparent SVG layer between the tiles and the fog (selection gold and
  the placement preview stay above it). It is **derived** on every render from the tiles
  (`Model.regionBoundarySegments`, chained by `Geo.chainEdgeSegments`) and is never stored in the
  document, backup, history or UI storage: same-region neighbours draw no edge, an empty neighbour or the
  map edge draws an outer edge, a different region draws one shared divider; a split legacy region is
  outlined per component, an enclosed hole gets an inner outline (the hole warning stays), an unplaced
  region draws nothing.
- **Decision (players):** the perimeter is generated New Valloren content. In Player Preview (and the
  future print output) it comes from the player projection, which emits an edge only when the tile's cell
  *and* the cell on the other side are both revealed (a neighbour the fog never covers — off-map or
  title/compass/scale furniture — needs only the tile). A line therefore never ends falsely against fog and
  never reveals the shape of a hidden region; the GM view always shows the complete perimeter.
- **Explicitly excluded:** storing perimeter geometry or a "separate area" flag, a thick border on every
  tile, and restricting delete/import/Undo by adjacency.
- **Where:** [architecture.md](architecture.md) "Connected placement and region perimeter (PD-021)".

## PD-022: Journey 2 — Soul Echoes are GM-only, placed by one button
- **Status:** Active
- **Date:** 2026-10-07
- **Context:** the *Journey to Horizon* campaign frame says the GM chooses nine sanctuaries before the first
  session to hold a Soul Echo: far enough apart that the PCs cross all of Valloren, not predictable (no
  coastline line, not "every third sanctuary"), and spread **evenly from west to east** so the first Echoes
  come early and the last lies near Horizon. Randomness is inspiration, not edict.
- **Decision (what it is):** `doc.soulEchoes = { anchorIds: ["mk-012", …] }` — **at most nine** distinct
  `kind: "sanctuary"` anchor stable ids (never HORIZON/MARROGATE), canonical string order. It is **GM campaign
  data**: autosaved, in the full JSON backup, validated on load/import and undoable, like Fog of War. The
  hard limit of nine is enforced by the model (validator and command), not just the UI.
- **Decision (how it is placed):** there is **no manual click-to-place**. One toolbar button, **Soul Echoes**,
  rolls the book's rule once (`Model.planSoulEchoes`: the 56 sanctuaries are split into nine equal-count
  west-to-east bands and one is drawn from each, with bounded retries until the picks are far apart, not
  confined to one latitude and not collinear) and commits those exact ids as **one** `setSoulEchoes` command
  — one Undo entry, and Redo never re-rolls. When Echoes already exist the button asks before replacing them
  (Cancel focused). **Remove Echoes** clears them all (confirmed, undoable, disabled when there are none).
- **Decision (look):** a small blue floating diamond with a pale core, drawn
  **right above the printed sanctuary icon** (centred on the icon, just over its top edge; deliberately **not**
  tied to a hex) so the icon stays visible, in a dedicated pointer-transparent SVG layer above the fog and
  below selection; the bobbing and the pulsing glow are CSS and are disabled under
  `prefers-reduced-motion`.
- **Decision (players):** Echoes are a secret. The layer is **emptied** (not CSS-hidden) in Player Preview, the
  toolbar group is hidden there, and `buildPlayerProjection` has no field for them — so neither Player Preview
  nor a future player print can show them. The future print renderer must keep using the projection only.
- **Decision (schema):** the field is **optional with a default** (missing = none), so `schemaVersion` stays 1
  and every existing save/backup loads unchanged — the same approach as `playerVisibility` (PD-020), chosen
  deliberately instead of the "bump on schema change" default because nothing existing is reinterpreted.
  Consequence: a backup *with* Echoes is rejected by an older build as an unknown field (never silently dropped).
- **Explicitly excluded:** manual placing/moving of single Echoes, a "collected/found" state, Echo names or
  effects, showing Echoes to players, and any sanctuary state other than "holds an Echo" (generated
  settlement data is the separate, GM-only PD-023).
- **Where:** [architecture.md](architecture.md) "Soul Echoes (PD-022)".

## PD-023: Journey 2 — generated sanctuaries are GM-only, made by one button, opened by clicking the icon
- **Status:** Active
- **Date:** 2026-10-07
- **Context:** `#/journey` already rolls the book's "Creating Sanctuaries" tables (trade & exports d20, quirk
  d12, crisis d10, drive d10, political system d8, size d6, population d4, plus a name from two d100 elements).
  The GM wants the same generator on the Journey 2 map, attached to the 56 printed sanctuary icons.
- **Decision (what it is):** `doc.sanctuaries = { entries: [{ anchorId, name, trade, quirk, crisis, drive,
  politics: { rolls }, size, population }] }` — at most **one entry per printed sanctuary** (`kind: "sanctuary"`
  anchor stable id, never HORIZON/MARROGATE), sorted by id. It stores the **numbers that came up**, not the table
  sentences, so a save reads back in either language; the only free text is the generated `name`. It is **GM
  campaign data**: autosaved, in the full JSON backup, validated on load/import and undoable.
- **Decision (how it is made):** one toolbar button, **Generate 56 sanctuaries** (the count is the map's own),
  rolls a settlement for every sanctuary through the **same** rolls as `#/journey` (`journey2Generator
  .rollSanctuary()` over `rollSanctuary()`), re-rolling a name another sanctuary already took a few times
  (`Model.planSanctuaries`), and commits those exact entries as **one** `setSanctuaries` command — one Undo entry,
  Redo never re-rolls. When sanctuaries already exist the button asks before replacing all of them (Cancel
  focused). There is no per-sanctuary "generate", no manual editing of rolls and no number the GM chooses.
- **Decision (the overlay):** clicking a generated sanctuary icon opens a screen-space overlay (not the
  `#/journey` card design) with the name and the seven tables as *label → result* rows (short neighbours share a line: **drive | political system** and **size | population**; the rest are full-width, in the book's order), and these
  actions: **×** closes it; one player-facing button beside the name (PD-027; plus the Soul Echo strip under the header, PD-030, only for an Echo sanctuary); **Delete sanctuary** (confirmed, undoable) removes that entry — the printed icon
  always stays; **Reroll sanctuary** re-throws the name and all seven tables at once (`setSanctuary`, undoable,
  no confirm). A generated icon is marked by a ring so the GM can see which ones are clickable; it outranks the
  hex under it. The overlay never shares the map with the Region Inspector or the diagnostics drawer. Keyboard:
  `S` / `Shift+S` step through the generated sanctuaries west to east.
- **Decision (players):** sanctuaries are GM prep. The ring layer is **emptied** (not CSS-hidden) in Player
  Preview, the toolbar group is hidden there, the overlay cannot open, and `buildPlayerProjection` has no field
  for them — so neither Player Preview nor the printed player map can show one.
- **Decision (schema):** optional with a default (missing = none), so `schemaVersion` stays 1 — the same approach
  as PD-020/PD-022. A backup *with* sanctuaries is rejected by an older build as an unknown field.
- **Decision (Russian):** wording is the official one on daggerheart.ru/frame/journey-to-horizon — all table rows
  match `data/journey.json`; the *Drive* row label is «Движущая сила» (it was «Стремление» before this check).
- **Explicitly excluded:** editing or pinning a single roll, a number of sanctuaries to generate, notes on a
  sanctuary, sanctuaries on hexes without a printed icon, showing sanctuaries to players or in print.
- **Where:** [architecture.md](architecture.md) "Sanctuaries (PD-023)".

## PD-024: Journey 2 Phase D — a continuous prepared map and dynamic region boundaries
- **Status:** Active
- **Date:** 2026-10-06
- **Decision (two kinds of connectivity):** *region connectivity* (all placed tiles of one batch form one
  edge-connected component — Phase A, unchanged) and *prepared-map connectivity* (the placed tiles of ALL
  batches form edge-connected "prepared areas") are independent rules; every command must satisfy both.
  Adjacency always means a full shared hex edge.
- **Decision (continuous placement):** the first placed region may start in any valid empty cell. Every later
  region's first tile / footprint must share a full edge with ANY placed tile (not only the latest region);
  one touching tile is enough. Otherwise the placement is rejected with the specific reason
  `detached-prepared-map` — never the generic `blocked` / `disconnected-region`.
- **Decision (non-worsening):** an ordinary place, move or return may not increase the number of prepared
  areas beyond `max(1, before)`. A move or return that would cut the map is rejected with
  `would-split-prepared-map` (a split of the region itself stays `disconnected-region`). An already
  disconnected (legacy or intentionally separated) map stays editable: an edit may keep or reduce the count,
  never increase it. There is no override for moves and returns.
- **Decision (Start separate area):** the only way to prepare a distant area is an explicit confirmation. It is
  offered only for a batch with nothing placed, an otherwise valid and internally connected candidate whose
  only failed rule is `detached-prepared-map`. Releasing/clicking such a candidate (the preview shows an amber
  dashed outline, a broken-link marker and a hint — not colour alone) opens a dialog (*Start a separate
  area?* — Cancel / Start separate area). Confirming commits **exactly the attempted candidate** (no reroll,
  no re-anchored Place-all footprint) with the transient command flag `allowDetached`, which may add exactly
  one prepared area. The flag is never stored (no `isSeparateArea` on a batch or the document, nothing in the
  backup); it is one Undo entry and Redo never reopens the dialog. This replaces PD-021's per-card toggle.
- **Decision (delete):** deleting a region stays an explicit destructive action even when it is a bridge; if it
  would raise the number of areas the existing confirmation adds "Deleting this region will also split the
  prepared map into N separate areas." One Undo entry restores region, tiles and topology.
- **Decision (boundaries):** every placed region has a permanent, dark, thick cartographic boundary
  (about 2.8x the hex outline), always derived from the current tile coordinates and never persisted.
  Same-batch shared edges stay thin and internal; an empty or off-map neighbour draws an outer edge; two
  different batches share exactly one divider; concave shapes, enclosed holes and legacy split regions follow
  their real outlines. It is recomputed after every committed document change (place, move, return, delete,
  Undo/Redo, import, reset, load) without a history entry. GM mode shows the complete boundary above the
  subtle fog state; selection gold stays above it; it never takes pointer events or focus and is aria-hidden.
- **Decision (players):** boundaries are generated New Valloren content and follow visibility: the player
  projection emits an edge only between revealed cells (a never-fogged neighbour needs only the tile), so a
  hidden neighbour never produces a false ending line and a hidden region's shape cannot be inferred. Fog
  painting changes only visibility, never topology or the GM boundary. The future print renderer reuses the
  projected segments.
- **Decision (fog and the base map):** Player Preview fog is translucent and passes over the whole base-map image,
  including the printed MARROGATE / HORIZON labels and the fixed sanctuary icons; the large rectangular
  cut-outs are removed (they read as stickers). The original base-map asset is never modified, and the labels
  and icons stay readable under the fog.
- **Explicitly excluded:** sanctuary generation or naming, printing, GM Notes (still out of scope), region reroll,
  storing boundaries / component counts / the override flag, and rejecting an imported map for having several
  prepared areas.
- **Where:** [architecture.md](architecture.md) "Prepared-map connectivity and region boundaries (PD-021, PD-024)".

## PD-025: Journey 2 — one optional Environment per placed hex (GM-only)
- **Status:** Active (manual assignment and Detach are superseded by PD-033: the Environment is now dealt at placement and the Inspector only offers Change)
- **Date:** 2026-10-07
- **Decision (region data vs tile data):** the generated batch still owns Habitat, Terrain, size, Encounter,
  Rumor and the perimeter. A *placed tile* may additionally own **zero or one** catalog Environment. Nothing
  else is assigned: no second Environment, no stock tile, no sanctuary anchor, no Soul Echo, no free text, no
  GM Notes (still out of scope, PD-019).
- **Decision (stored by id only):** the tile gains an optional `environmentId` (a stable catalog id: lowercase
  kebab-case, at most 64 characters, never empty). A missing key means "none"; `null`, names, Tier, biome and
  URLs are never stored, so old documents load unchanged and RU/EN switching never rewrites the document. An
  id the catalog no longer knows (or that no longer matches the habitat) is **kept** and shown as
  *Environment unavailable* with *Stored id: …*; it can be changed or detached, never silently cleared.
- **Decision (follows the tile):** the id belongs to the tile object, not the coordinate. Moving a tile keeps
  it; returning a tile to stock or deleting its region removes it; Undo restores it exactly; a stock tile placed
  again starts clean. The fog is cell-based and independent: assigning, moving or detaching never reveals or
  hides anything, and fog commands never touch the id.
- **Decision (one command):** `setTileEnvironment { tileId, environmentId | null }` assigns, replaces and
  detaches. Change is ONE history entry (Undo restores the previous id directly); assigning the stored id is a
  no-op (no history, no `updatedAt`, no autosave, no announcement). Catalog/biome eligibility is the view's
  check, so the model stays independent of localized content.
- **Decision (which Environments):** exactly the list the existing `environmentsForBiome` adapter (app.js)
  returns for the region's biome, in its order — no second index, no fetch of `environments.json`, no
  hand-built overlay URLs. A Shadowblighted region uses its surviving base biome; a **fully overtaken** region
  has no base biome and offers no picker ("No habitat-specific environments are available for this region") —
  never a fall-back to all / universal / settlement lists. No search and no cross-biome browsing.
- **Decision (surface):** the Region Inspector shows *Hex Environment* only when opened from a placed hex
  (source `map`), between the summary and Encounter, ; opened from a card (no hex) it shows no
  environment section (the generic Suggested Environments disclosure was removed entirely). Unassigned: *Choose Environment*;
  assigned: Tier + name (a real link to the **existing** Environment Overlay) with *Change* / *Detach*; the
  picker is inline, vertically scrollable, one row per Environment (name link and a separate *Assign* button;
  the current one reads *Assigned*). Detach needs no confirmation (Undo recovers). Picker state is transient
  (never stored, never in history) and closes on any inspector change, Undo/Redo, fog tool or preview.
- **Decision (GM-only):** a small card-shaped marker sits in the upper-left of every assigned hex on the GM
  map (decorative, `aria-hidden`, no pointer events) and neutral hover shows the name in the shared tooltip.
  The player projection is a field whitelist without `environmentId`; Player Preview and the future print show
  no marker, name, id, picker or tooltip even for a revealed cell.
- **Consequences:** the backup (v1, unchanged) carries `environmentId`; `TILE_KEYS` gained it; a malformed id
  fails import like any other schema error. Out of scope: several Environments per tile, custom/random/automatic
  assignment, player-visible points of interest, encounter tracking, routes, printing.

## PD-026: Journey 2 — Biome Tint (derived, GM display preference, revealed-only for players)
- **Status:** Active
- **Date:** 2026-10-07
- **Decision (what it is):** a very faint, watercolour-like fill (`fill-opacity` about 0.06–0.10, tuned per hue) inside every placed generated
  hex, taken from the region's Habitat. It is presentation of existing data, never campaign data: nothing is stored in the document, backup,
  history or geometry, and it is recomputed on every render, so place / move / return / delete / Undo / Redo / import need no extra code.
- **Decision (palette):** one table, `js/journey2-biome-tint.js` (`PALETTE`): the eleven Habitats plus `overtaken`. The four greens (Grassland,
  Tropical, Forest, Wetland) must stay distinct in hue. No gradients, glow, colored outline or animation; the layer is `aria-hidden`,
  `pointer-events: none`, painted after the label cover and before the hex outlines and black symbols.
- **Decision (Shadowblight):** it never replaces the Habitat colour (a blighted Wetland is Wetland-tinted; the X mark carries the corruption).
  Only a **fully overtaken** region (no base Habitat) uses the neutral violet-grey fallback.
- **Decision (independence):** the tint comes only from Habitat. Hex Environment, Tier, Encounter, Rumor, Soul Echoes, sanctuaries and Terrain
  never affect it; fixed sanctuary icons, Marrogate, Horizon and empty Old Valloren cells are never tinted.
- **Decision (GM preference):** **Biome colors**, default ON, stored only as `showBiomeColors` in `dhcodex_journey2_ui` (a toggle beside **Fog**,
  as no secondary options menu exists in the toolbar). Toggling is a pure display change: no command, no Undo entry, no autosave, no fog,
  visibility or camera change.
- **Decision (Player Preview):** follows Fog of War. The player projection puts `tint` only on overlays of revealed cells, so hidden cells leak
  neither colour nor shape through opacity, DOM or accessibility output. The GM preference does not control the preview.
- **Decision (print):** black-and-white print omits the tint entirely — not grayscale, not desaturated, not gray fills, not hatch density.
  `Journey2Projection.buildPrintProjection(doc, ctx)` returns overlays without `tint` and takes no UI state; `{ color: true }` is reserved for a
  future colour print that may reuse the same keys. Colour printing is **not** implemented; the tint is never baked into the base map raster.
- **Where:** `js/journey2-biome-tint.js`, `js/journey2-projection.js`, `js/journey2-view.js` (`overlayMarkup`, `toggleBiomeColors`),
  tests in `tests/journey2-biome-tint.test.js`.

## PD-027: Journey 2 — a sanctuary's generated name can be revealed to players (manual, independent of fog)
- **Status:** Active
- **Date:** 2026-10-07
- **Decision (what players always see):** the 56 fixed sanctuary icons, the printed MARROGATE and HORIZON labels — they are part of the immutable base map.
- **Decision (what is hidden):** the generated name of a sanctuary is hidden from players by default. Only an explicit GM action reveals it
  (one button beside the name in the Sanctuary Overlay's header: **Reveal to players** / **Hide from players** — its label is the next action, the icon is an eye / crossed eye, no `aria-pressed`, no separate status text or heading; the lettered name on the map is the state cue). Visibility is never inferred from fog, nearby revealed cells,
  the party's position, Soul Echoes, generation, clicking or opening the overlay. There is no generic "visited" flag.
- **Decision (storage):** `playerVisibility.revealedSanctuaryNameAnchorIds` — a sorted, duplicate-free list of stable anchor ids, each of a
  printed sanctuary (never Marrogate/Horizon) that currently has a generated entry (cross-checked on load/import; an orphan or malformed id rejects the
  document). Missing = none, so `schemaVersion` stays 1. No names, coordinates, label geometry or UI state are stored.
- **Decision (command):** `setSanctuaryNameRevealed { anchorId, revealed }` — one Undo entry; already in that state is a pure no-op.
  Reroll (`setSanctuary`) keeps the state (a visible name becomes the new name). `deleteSanctuary` removes the id in the same command.
  `setSanctuaries` keeps ids only for anchors that still have an entry and never reveals a new one; an empty set clears all.
- **Decision (confirmations):** rerolling a visible sanctuary asks first (and rolls only after the confirmation); deleting one adds the
  line "its visible name will also disappear from the player map"; replacing all adds the count of currently visible names.
- **Decision (what players get):** the projection's `sanctuaryLabels: [{ anchorId, name }]` — exactly those two fields, only for revealed
  sanctuaries with a non-empty name, sorted. Trade, Quirk, Crisis, Drive, Politics, Size, Population, rolls, Soul Echoes and GM marker state
  never enter it. A revealed name appears even while its surrounding cells are under fog. Soul Echoes stay entirely secret.
- **Decision (look):** ink on the map, lettered like the printed book's place names — hand-lettered capitals (`--font-map`, Architects Daughter,
  `text-transform: uppercase`), tight light halo (`paint-order: stroke fill`), no box, no glow, no tint; up to two lines;
  placed in world px by `Journey2Geometry.layoutSanctuaryLabels` (below, right, left, above; inside the map; clear of every printed icon and
  of other labels; deterministic). The same projection and layout helper serve Player Preview and the future black-and-white print.
- **Decision (GM view):** the GM map letters every revealed name exactly as Player Preview does (same list — `Journey2Projection.sanctuaryLabelsOf` —
  same layout, same lettering), so the GM sees what the players were given; a hidden name is not drawn. The visually-hidden "Known sanctuaries" list
  stays Player Preview only. A visible-name sanctuary shows no ring dot at all (the lettered name is the cue; amended 2026-10-07), and the hover
  tooltip reads "Name · Name visible/hidden to players". (Amended 2026-10-07: the first version drew names in Player Preview only.)
- **Out of scope:** auto-reveal, party token/route, a visited system, notes, name editing, other sanctuary data for players, print UI.
- **Where:** `js/journey2-model.js`, `js/journey2-projection.js`, `js/journey2-geometry.js`, `js/journey2-view.js`, `css/journey2.css`,
  tests in `tests/journey2-sanctuary-names.test.js`, browser checks in `scripts/journey2/lib/sanctuary-name-checks.js`.

## PD-028: Journey 2 — the player map prints as two A4 portrait pages, black and white, with no printed fog
- **Status:** Active
- **Date:** 2026-10-07
- **Decision (screen fog vs print fog):** Player Preview on screen may keep its fog hatch — it helps the GM verify what is revealed. The
  physical print and the Print Preview draw **no fog at all**: no hatch, wash, grey, dark layer or translucent polygon. Fog of War is a **data
  filter** there: generated New Valloren content exists in the print only for cells in `playerVisibility.revealedCells`; an unrevealed cell is
  the untouched Old Valloren map (nothing is hidden by CSS — it is absent from the model and the DOM).
- **Decision (two pages):** the print is always exactly two A4 portrait pages — the west and the east half of the original map
  (`template.composition.panels`; each page is a 1:1 crop of the lossless world raster, never resampled, stretched or re-tiled). The camera, zoom, pan, sidebar and viewport
  are irrelevant; the pages are built from map data, not a screenshot. The user cannot pick a page count.
- **Decision (black and white):** Biome Tint is **omitted**, not converted to grey (the print model has no tint field, and takes no UI preference).
  Soul Echoes, generated-sanctuary data, per-hex Environments, Encounter/Rumor, ids, selection and every GM marker are omitted. A sanctuary name
  prints only when the GM revealed it by hand (PD-027), as `{ anchorId, name }`, laid out on the page holding its icon (clamped inside that page, never split).
  Generated symbols, Terrain dots and Shadowblight marks print in black; region boundaries are black and use the same player-safe edge rule as Player
  Preview (no edge toward an unrevealed neighbour, so no false ending line leaks the hidden shape).
- **Decision (one renderer):** the on-screen Print Preview and the physical print are the same DOM (`.j2-print-root` → two `.j2-print-page`, each a vector SVG over the map raster);
  `@media print` only hides everything else. Entry is the "Print player map" button in Player Preview; Back returns to Player Preview (never to the GM view). The
  preview is transient: not stored, not in `dhcodex_journey2_ui`, not in history; printing or cancelling changes nothing.
- **Out of scope:** a party marker, auto-reveal, travel history, colour print, one-page or poster tiling, PDF/PNG export, printer settings, manual label placement, GM notes.
- **Where:** `js/journey2-print.js`, `js/journey2-view.js` (`openPrintPreview`, `printPageMarkup`), `css/journey2.css`, tests in `tests/journey2-print.test.js`,
  browser checks in `scripts/journey2/lib/print-checks.js`.

## PD-029: Journey — the map editor becomes the canonical `#/journey`; `#/journey2` is a legacy redirect
- **Status:** Active
- **Date:** 2026-10-07
- **Decision (route):** the interactive map editor is the final Journey product and lives at `#/journey` with the overlay route `#/journey/env/:id`. `#/journey2`
  and `#/journey2/env/:id` stay valid forever as compatibility redirects, repaired in place with `replaceState` (no extra history entry, no Back loop).
  Nothing emits `#/journey2` any more (header, region-card Environment links, docs). Player Preview, Print Preview and the sanctuary overlay remain transient modes — no new routes.
- **Decision (retirement):** the standalone wilderness/sanctuary generator page and the V1/V2 switch are removed. Shared generation code (habitat/encounter/rumor/terrain/sanctuary tables,
  name rolls, `journey2Generator`) is kept because the editor uses it. The legacy `dhcodex_journey_regions` / `dhcodex_journey_sanctuaries` browser data is no longer used or deleted.
- **Decision (names/storage):** the `journey2` prefix (modules, `.j2-*` CSS, `data-boot-route`, and the four `dhcodex_journey2_*` storage keys) is a retained internal name. Keys are **not**
  renamed or duplicated, so a campaign prepared before the cutover loads unchanged; a future rename needs an explicit migration plan. Public text says "Journey" / "Путешествие"
  (title "Journey · map editor — Bacchus's Atlas"); the GM backup file is now `bacchus-atlas-journey-map-<date>.json` (same JSON schema/kind, import unchanged).
- **Out of scope:** renaming internals, any editor behaviour change, removing the legacy redirect.
- **Where:** `js/route-utils.js`, `js/app.js` (`render`, `routeTitle`, `renderJourneyPage`), `index.html` boot script, `tests/routing.test.js`, `tests/journey-route-cutover.test.js`,
  browser check `scripts/journey2/route-cutover-verify.js`.

## PD-030: Journey — "Locate Soul Echoes" is a GM-only map tool with a magic compass, and Echoes can be collected
- **Status:** Active
- **Date:** 2026-10-07
- **Decision (what it is):** the campaign's downtime move "Locate Soul Echoes" becomes a GM-only toolbar action beside **Soul Echoes** / **Remove Echoes**. The GM picks the party's
  hex on the map; the app answers with an animated magical compass pointing toward the **nearest uncollected Soul Echo** and one text line (`NNE · North-northeast`).
  It is a product enhancement, not a book rule: the book says the Vessel reveals the general direction; the sixteen-point rose and the animation are ours.
- **Decision (what it reveals):** **direction only.** Never the sanctuary, its name (even when already revealed to players), the target hex, a route or line, the distance, travel days or
  difficult terrain. It never reveals the origin or any cell, never changes Fog of War or sanctuary-name visibility, and never highlights the destination. The initial Echo already in the
  Vessel (the one Marrogate starts with) is not one of the nine map candidates; Horizon and Marrogate are not sanctuaries and can never be candidates.
- **Decision (math):** the origin is the world-space centre of the picked hex (never the pointer, pan or zoom); the target is the canonical `worldPixelAnchor` of the fixed sanctuary.
  Map north is treated as geographic north (no declination). Bearing `atan2(dx, originY - targetY)`, 0° = north, clockwise; sixteen 22.5° sectors with half-sector rounding
  (`floor((bearing + 11.25) / 22.5) % 16`); the needle stops at the exact bearing, the text uses the sector. Distance is straight-line map-world distance — no hex path, terrain,
  roads, rivers, Fog or revealed cells. Equal distances (within `NEAREST_TIE_EPSILON` = 0.5 world px, far below one hex) pick **one** candidate with an injectable RNG, frozen for the
  animation and the text. If the party's hex is the Echo sanctuary's mapped hex the answer is **"The nearest Soul Echo is here."** — no random direction, the centre crystal pulses.
- **Decision (collected state):** `doc.soulEchoes = { anchorIds, collectedAnchorIds }`. Collected is a sorted subset of the distribution, missing = every Echo Available (`schemaVersion`
  stays 1). It belongs to the **fixed anchor**, not to generated sanctuary data: rerolling or deleting a sanctuary's characteristics changes nothing. The sanctuary overlay shows a GM-only
  **Soul Echo** strip (one real button, *Mark collected* / *Unmark collected*, whose label is the next action — the dimmed crystal on the map is the state cue; no heading or status text; one command, one Undo entry, overlay and camera stay) only for a sanctuary that holds
  an Echo. Because the state lives on the anchor, the overlay also opens for an Echo sanctuary whose characteristics were deleted (it then shows just that row). Generating or removing Echoes
  clears the collected state in the same command; Undo restores both. A collected crystal is drawn smaller, flat and dim on the GM map. Locate only offers **Available** Echoes: the button
  is unavailable (with a reason) with no distribution ("Generate Soul Echoes first.") or when all are collected.
- **Decision (transience):** the tool state (selecting / animating / result, hover hex, frozen bearing and target) and the compass popover are transient — never in the document, history,
  autosave, JSON backup or storage, and Undo/Redo never reopens or restores a result. A result computed from a different Echo set (regenerate, remove, collect, restore, Undo, Redo) is closed as
  stale; import, reset, Player Preview, another map tool (Reveal / Hide / placement), route change and unmount cancel it and its pending timer. Escape and Close leave the tool.
- **Decision (isolation):** Locate, the Available/Collected state, the target and the reminder never reach Player Preview, the player projection, Print Preview or print — the same rule as
  PD-022. The line "GM reminder: Nearby Seekers-in-Shadow may sense the Vessel's general direction." is narrative only: no Seeker marker, Fear change or encounter.
- **Decision (interaction):** while selecting, any valid non-decorative hex can be picked (wilderness, ungenerated Old Valloren, sanctuary, coast); a click on a sanctuary icon picks the hex
  under it instead of opening the overlay; tiles, markers and Environment badges do not intercept; a drag above the pan slope (or Space + drag) pans. The popover is a screen-space dialog (not
  modal, `clamp(280px, 28vw, 380px)`), anchored beside the party's hex. Reduced motion: the needle goes straight to the bearing in ~0.2 s with identical text.
- **Out of scope:** party token or persisted location, auto-reveal of the origin/neighbours, routes, distance or day counts, destination highlighting, sound, Seeker automation, GM notes,
  keyboard hex selection (the map has no keyboard cell selection).
- **Where:** `js/journey2-model.js` (`validateSoulEchoes`, `setSoulEchoes`, `setSoulEchoCollected`, `getCollectedEchoSet`, `availableEchoIds`), `js/journey2-locate.js` (pure),
  `js/journey2-view.js` ("Locate Soul Echoes" block, overlay row), `css/journey2.css`, `data/i18n.json` (`journey2_loc_*`, `journey2_echo_*`), `tests/journey2-locate.test.js`,
  browser check `scripts/journey2/lib/locate-checks.js`.

## PD-031: Journey — the Route Planner is a GM-only, transient, navigator-style map tool that never invents terrain
- **Status:** Active
- **Date:** 2026-10-08
- **Decision (what it is):** a GM-only toolbar action **Plan route** (RU «Проложить маршрут») beside the Soul Echo / sanctuary tools. The GM picks hex **A**, then hex **B**; the app draws the
  routes **on the map only** — like a car navigator, with a **bubble** above each route — and has no permanent panel. It is a planning aid: it never moves the party, never changes the campaign
  document and creates no Undo entry. There are no on-screen swap / new-point / close buttons: Escape (or the toolbar button) closes it, and starting again picks new points.
- **Decision (two routes, side by side):** **Fastest** (a golden blue line; the selected one by default) minimizes total travel days, the cost of entering a hex being its Terrain Rating (1-4).
  **Shortest** (a reddish-gold line) minimizes the number of hexes entered, whatever the terrain. The lines have the same thickness and run side by side (shifted sideways by a constant number
  of screen pixels, mitred at corners) so they never hide each other. Each has a bubble above it: its name and "12 hexes · 15 days"; Shortest across an unknown-terrain hex says "days unknown".
  When both are the same path, only one line and one bubble remain ("Fastest and shortest"). The cost belongs to the hex **entered**: the start is free, so A -> B and B -> A can differ.
  Clicking a bubble selects that route (drawn on top, with chevrons); clicking the selected bubble toggles a small **details** popover (hex count, travel days, expected encounter triggers as an
  estimate, the terrain breakdown, a Fastest-vs-Shortest comparison); Escape closes the details first. With nothing to draw (A = B, no route) the popover opens by itself with the reason.
- **Decision (dropped: "Fewer encounters"):** the original spec's third strategy, minimizing expected encounter triggers, was removed by the product owner on 2026-10-08 — it almost always gave the
  Fastest route. The "expected encounter triggers" figure stays as an informational estimate in the details (`sum(1 - (5/6)^rating)`; an encounter is never described as danger, and the planner is
  never "safest" / "least dangerous"). Also dropped: the Swap A / B, Choose new destination / start and Close controls and the strategy tabs.
- **Decision (unknown terrain):** a Terrain Rating exists only where the GM generated a region (a placed tile's region). Fastest may enter **only** cells with a known rating (the start may
  lack one); it never assumes 1, an average or a biome default. When no fully known path exists Fastest is not drawn and **Shortest** (which ignores terrain and may cross any valid cell) is
  shown; its statistics then say **Unknown** for travel days and expected encounters rather than a partial total (an optional "Known portion: N travel days (partial)" line is labelled partial).
  Segments entering an unknown hex are drawn dashed.
- **Decision (settlement hexes):** a hex holding a printed sanctuary, Marrogate or Horizon icon never gets generated terrain, so it is *known*, not unknown: rating 0, i.e. 0 travel days and 0
  expected encounter triggers (no Encounter Dice), shown as a "Sanctuary" row in the terrain breakdown. A product decision (2026-10-08), not a book rule. With such cells the A* heuristic bound
  drops to 0 (Dijkstra).
- **Decision (what it does not read):** Fog of War, revealed cells, sanctuary names, Soul Echoes, generated sanctuary data, per-hex Environments, Shadowblight and region boundaries. A route
  crosses fog freely and never reveals or hides anything. Routeable = the editor's own valid, non-decorative cell set (the same one Reveal / Hide and Locate use); a click on a sanctuary icon
  selects its hex instead of opening the overlay.
- **Decision (transience / isolation):** planner state (A, B, selected route, details, hover) is never in the document, history, autosave, JSON backup or storage and survives no reload. Undo / Redo
  or any edit **recomputes** an open result (never a stale one) and never reopens a closed planner. The lines, A / B pins, bubbles, statistics and details never reach Player Preview, the player
  projection, Print Preview or print. Route Planner, Locate Soul Echoes, Reveal / Hide and armed placement are mutually exclusive map tools; Player Preview, import and reset close it.
- **Decision (interaction):** while choosing A or B the planner owns the map (no tile drag, inspector, overlay or tile selection; a drag above the pan slope, or Space + drag, still pans). Escape
  steps back (details -> closed; choosing B -> choosing A -> closed). In the result the map behaves normally. Bubbles stay on screen (clamped to the map edge, nudged apart when they overlap) and
  follow pan and zoom. No draw-in or looping animation: the routes appear immediately (nothing to reduce for `prefers-reduced-motion`).
- **Out of scope:** saved routes, a party token or automatic movement, a travel calendar, encounter rolls or simulation, resources, user-weighted costs, "safest" or danger ratings, Environment
  or adversary difficulty as cost, a Shadowblight penalty, sharing or printing a route for players, automatic fog reveal, assumed terrain for unknown cells, roads / rivers / blocked hexes,
  multi-stop routes, keyboard hex selection (the map has none), "Plan route here" from the sanctuary overlay.
- **Where:** `js/journey2-route.js` (pure engine + planner state machine), `js/journey2-view.js` ("Route Planner" block), `css/journey2.css`, `data/i18n.json` (`journey2_route_*`),
  `tests/journey2-route.test.js`.

## PD-032: Journey — "Place all N" rolls a fresh random footprint on every press
- **Status:** Active (supersedes the "deterministic compact ring walk" footprint wording of the "All N" decision; every other "All N" rule — all-or-nothing, atomic, one Undo entry, no truncation — is unchanged)
- **Date:** 2026-10-08
- **Decision:** pressing **Place all N** (drag or click-to-arm) rolls a random connected footprint of exactly N cells, so two batches of the same size rarely look alike. The shape is rolled **once, at press**, and frozen until drop or cancel: moving the pointer, zooming, a rejected drop or a "Start separate area" confirmation never changes it (the dialog still commits exactly the attempted candidate). There is **no reroll control**; the only way to a different shape is to press Place all again.
- **Decision (shape):** each roll draws a raggedness and grows the shape one cell at a time, weighting a frontier cell by (touching shape cells)^p — low raggedness gives round blobs, high raggedness gives arms and peninsulas, so some rolls are round and some spiky. The reach from the seed is capped at the compact ring radius + 2 (no worms); a straight line (N >= 3) or an enclosed hole is re-rolled; after bounded attempts the compact footprint is used. The cell under the pointer is the member nearest the shape's centroid.
- **Decision (persistence):** nothing about the shape is stored; tiles are saved as concrete cells, so Undo/Redo replay the exact placed cells and Redo never re-rolls.
- **Where:** `Model.randomFootprint(n, rng)` in `js/journey2-model.js` (pure, RNG injectable; `compactFootprint` remains as the fallback), called from `js/journey2-view.js` where the stock drag / armed placement start; `tests/journey2-model.test.js`.

## PD-033: Journey — a placed hex gets an Environment automatically; the Inspector only offers Change
- **Status:** Active (supersedes the manual-assignment parts of PD-025: *Choose Environment* and *Detach* are gone and "automatic assignment" is no longer out of scope; every other PD-025
  rule — one optional id per tile, stored by id only, follows the tile, GM-only, never in Player Preview or print — stands)
- **Date:** 2026-10-08
- **Decision (when):** every hex placed from a region's stock — one hex, Place all N, a "Start separate area" confirmation — immediately receives one catalog Environment of that region's
  habitat. There is no switch: it is always on. A region with no habitat list (**fully overtaken**) places hexes without one; nothing is borrowed from other habitats, settlement or universal.
- **Decision (which):** the pool is exactly the list the existing `environmentsForBiome` adapter returns for the region's biome (PD-025). **No Tier filter.** Nothing is dealt across regions:
  "used" is counted inside the region (batch) only, so two neighbouring regions of one habitat may share an Environment.
- **Decision (the rule — least used first, random among equals):** each hex takes an Environment with the lowest running use count in its region and draws at random among the tied ones. So:
  fewer hexes than Environments never repeats one; as many hexes as Environments uses each exactly once in a random order; more hexes than Environments uses every Environment `floor(N/K)` or
  `ceil(N/K)` times (3 Environments on 6 hexes: two each). The cap is therefore *derived*, not a fixed "twice": a habitat with two Environments (grassland) must repeat each of them on a long region.
- **Decision (what already stands counts):** the counts start from the hexes already placed in the region, including ones whose Environment the GM changed by hand. One-by-one placement thus
  spreads exactly like a batch, and a manual change is respected by every later placement. Returning a hex or deleting a region lowers the counts naturally.
- **Decision (one history entry):** the ids are dealt once, at the moment of placement, and travel inside the single atomic `place` command (`tiles[i].environmentId`); one Undo removes the
  hexes and their Environments together and Redo restores the same ids, never re-rolling. An Environment is never dealt to a moved hex (it keeps its own, PD-025).
- **Decision (Inspector):** *Hex Environment* shows the assigned Environment (a link to the existing overlay) and **one** button, *Change*, which opens the inline picker (one *Assign* per
  listed Environment). *Choose Environment* and *Detach* no longer exist; a hex always has an Environment unless its region has no habitat list. A stored id the catalog no longer offers still
  reads *Environment unavailable* and can be changed, never silently cleared.
- **Out of scope:** a "Fill empty hexes" button for older saved hexes without an Environment (none are expected), a Tier or party-level filter, map-wide balancing, an off switch.
- **Where:** `js/journey2-env-deal.js` (pure `dealEnvironments({ pool, used, count, random })`), `placeTiles` / `dealEnvironmentsTo` in `js/journey2-view.js`, `Model.apply` `place`,
  `tests/journey2-env-deal.test.js`, `tests/journey2-hex-environment.test.js`.

## PD-034: Journey — Reveal / Hide live in Player Preview, and the map camera is remembered
- **Status:** Active (amends PD-020: Reveal / Hide are no longer GM-toolbar tools, and Player Preview is no longer read-only; every other PD-020 rule — cell-based visibility, one stroke = one
  Undo entry, the projection as the only thing players are shown — stands)
- **Date:** 2026-10-08
- **Decision (where):** **Reveal** and **Hide** are in the Player Preview bar, beside the picture they change. The GM toolbar keeps **Fog** (the veil overlay toggle), Biome colors and
  **Player Preview**. A tool is armed only inside the preview; leaving the preview, opening Print Preview or pressing Esc turns it off (Esc: stroke → tool → leave the preview).
  Undo / Redo stay in the toolbar while previewing and undo whatever the shared history holds. The sanctuary-name reveal stays in the GM sanctuary overlay.
- **Decision (one fog brush, 2026-10-08):** the two buttons became ONE button in the Player Preview bar showing two schematic mice — left button gold + "Reveal", right button gold + "Hide".
  Arming it gives a single brush (`fogTool` is `null | 'paint'`): the **left** button paints Reveal, the **right** button paints Hide (the stroke's mode is fixed by the button that
  started it), the middle button or Space + left drag still pans. The right button does nothing outside the armed brush (the context menu stays suppressed). With no button held the
  brush outline is neutral (no glyph); the reveal circle / hide cross appear once a stroke starts.
- **Decision (hidden-hex outline):** while a tool is armed in the preview, every placed hex still hidden from the players is outlined with a dashed line — no symbol, Environment or text — so
  the GM can find what there is to reveal. It is a GM aid: drawn only while a tool is armed, never part of the projection, Print Preview, print or any stored value. Without it the preview
  shows nothing under the fog, and painting there would be blind.
- **Decision (camera):** the camera is a view preference in `dhcodex_journey2_ui` (`view: { fit, cx, cy, scale }`): the WORLD point at the viewport centre plus the zoom, or `fit: true` for a map
  that was fitted to the window (so a different window size still fits / lands on the same spot). It is restored once the viewport has a real size, with the zoom and position clamped as for any
  camera change, and written debounced (400 ms) and when the page is hidden or the view is left. A missing or malformed value means Fit. No new storage key.
- **Decision (what is *not* remembered):** Player Preview mode, an armed Reveal / Hide tool, strokes, the Region Inspector, the sanctuary overlay, Locate and Route Planner state, expanded card
  and diagnostics stay transient. A reload lands in the GM view with nothing armed, so a stray press can never paint fog.
- **Where:** `js/journey2-view.js` (`setFogTool`, `renderFogGhost`, `applyPreviewChrome`, `restoreCamera` / `currentView` / `flushCameraSave`), `js/journey2-store.js` (`loadUi` / `saveUi`
  `view`), `css/journey2.css` (`.j2-tb-tools`, `.j2-fog-ghost`), `tests/journey2-fog.test.js`.

## PD-035: Journey — a reload reopens Player Preview

- **Decision:** Player Preview on/off is a remembered view preference (`playerPreview` in `dhcodex_journey2_ui`), like the camera. Reloading `#/journey` while in Player Preview reopens it at the restored camera; Back-to-GM clears it. Supersedes the "Player Preview mode stays transient" line of PD-034.
- **Still transient:** an armed Reveal / Hide tool, strokes, Region Inspector, sanctuary overlay, Locate / Route Planner, expanded card, diagnostics. Entering Player Preview already closes these, so a reload into Preview can never paint fog.
- **Where:** `js/journey2-view.js` (`enterPreview`, `leavePreview`, `maybeResumePreview`, `saveUiPrefs`), `js/journey2-store.js` (`loadUi` / `saveUi`), `tests/journey2-fog.test.js`.

## PD-036: Journey — the GM view never draws the fog veil

- **Decision:** the **Fog** toolbar button (a view-only veil toggle) is removed. Since PD-034 Reveal / Hide live in Player Preview, so the button edited nothing and duplicated the preview. The GM view always shows the bare map; the veil (and the dashed hidden-hex outline while a brush is armed) is drawn only in Player Preview. Amends PD-020 / PD-034.
- **Storage:** `showFogState` is gone from `dhcodex_journey2_ui`; an old stored value is ignored and dropped on the next save. No migration, no new key. i18n keys `journey2_fog_label`, `journey2_fog_show`, `journey2_fog_hide_state` removed.
- **Where:** `js/journey2-view.js` (`renderFog`, `updateFogUi`), `js/journey2-store.js` (`loadUi` / `saveUi`), `tests/journey2-fog.test.js`.

## PD-037: Journey — "Place all" fits the shape to the border it is brought to

- **Decision:** while a "Place all" block is dragged (or armed) and a placed tile lies within two cells of the cell under the pointer, the dashed block is not the rolled random shape but the best fit for the notch, bay or pocket under the pointer, recomputed live as the pointer moves. Always on, no toggle. Away from placed tiles, with a single hex, or when no valid fit exists, the PD-032 random footprint is used unchanged. Extends PD-032 (the random roll still happens on press; it is the open-field shape).
- **Rules:** the shape always contains the seed cell (the cell under the pointer, or the nearest free cell when the pointer is on a placed tile). A pocket smaller than N is filled and the rest spills out connected; a pocket larger than N is filled inside with N cells, any form. Among attempts a valid placement ranks first, then fewest NEW enclosed holes, then least exposed perimeter. Preview and commit use the same cells (`checkPlacement`, same cell policy and prepared-map rule); nothing is stored. Shapes for more than 60 hexes are not fitted.
- **Stability:** the shape is a pure function of the document, the anchor cell, N and a per-drag seed, cached per (document, anchor cell), so it never flickers and returning to a cell restores the same shape.
- **Where:** `js/journey2-model.js` (`fitFootprint`), `js/journey2-view.js` (`computePreview`, `seededRandom`, `tr.seed`), `tests/journey2-model.test.js`.

## PD-038: Journey — fully shadowblighted regions are impassable to the Route Planner

- **Decision:** a region rolled 1-then-1 on the habitat table ("completely overtaken and nigh impossible to traverse") cannot be crossed: neither Fastest nor Shortest ever enters one of its hexes, and one cannot be the start or destination. When that is the only thing between A and B the planner says so ("a fully shadowblighted region cannot be crossed") instead of "no route". Ordinary Shadowblighted regions (a 1 followed by a habitat) stay passable. Extends PD-031.
- **Where:** `js/journey2-route.js` (`isBlockedCell`, reason `impassable`), `js/journey2-view.js` (`blockedCells`, `planRoutesFor`), `tests/journey2-route.test.js`.
