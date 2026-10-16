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
  - The static `og:type`/`og:site_name`/`og:title`/`og:description` tags in
    `index.html` exist only so a link pasted into a messenger (Telegram) shows
    "Атлас Бахуса" instead of the bare host. They carry no catalog content and
    a single static `og:image` (`img/og-card.jpg`, 1200×630, forest artwork + title; the same card for every route, since the hash never reaches a crawler) and no `og:url`; they are a link-preview card, not discovery output.
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
  with nine bundled effects. It plays *effects only*, over whatever music
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
- **Where:** [architecture.md](architecture.md) "Journey 2 diagnostic view"; the Stage 0 evidence folder was removed (recoverable from git history before `b8b386f`).

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
- **Where:** [architecture.md](architecture.md) "Journey 2 map editor"; the Stage 1 evidence folder was removed (recoverable from git history before `b8b386f`).

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
- **Status:** Active. **Amended by PD-052 (planned):** a *collected* Echo — and only that, only on a revealed sanctuary cell — becomes visible to players; an Available Echo stays secret.
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
- **Decision (what it is):** a translucent, saturated watercolour-like fill (`fill-opacity` about 0.26–0.30, tuned per hue; raised from 0.06–0.10 on 2026-10-14 for richer colour while the map terrain still shows through) inside every placed generated
  hex, taken from the region's Habitat. It is presentation of existing data, never campaign data: nothing is stored in the document, backup,
  history or geometry, and it is recomputed on every render, so place / move / return / delete / Undo / Redo / import need no extra code.
- **Decision (palette):** one table, `js/journey2-biome-tint.js` (`PALETTE`): the eleven Habitats plus `overtaken`. The four greens (Grassland,
  Tropical, Forest, Wetland) must stay distinct in hue. No gradients, glow, colored outline or animation; the layer is `aria-hidden`,
  `pointer-events: none`, painted after the feathered glyph lift and before the hex outlines and black symbols (so it is one even colour over them; there is no separate tinted box over the glyph).
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
- **Decision (paper tone, 2026-10-14):** the "sepia" map paper (`--j2-paper` in `css/journey2.css`) was lightened from `#e4d3ab` to `#f1e8d2` so the stronger tint reads true on it, mostly the greens.
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
  Generated symbols and Terrain dots print in black; Shadowblight X's never print (amended 2026-10-16: neither on a tile nor on open ground), and the print overlays carry the anonymous `region` number so the "Regions" switch draws one icon per region there too; region boundaries are black and use the same player-safe edge rule as Player
  Preview (no edge toward an unrevealed neighbour, so no false ending line leaks the hidden shape).
- **Decision (one renderer):** the on-screen Print Preview and the physical print are the same DOM (`.j2-print-root` → two `.j2-print-page`, each a vector SVG over the map raster);
  `@media print` only hides everything else. Entry is the "Print player map" button in Player Preview; Back returns to Player Preview (never to the GM view). The
  preview is transient: not stored, not in `dhcodex_journey2_ui`, not in history; printing or cancelling changes nothing.
- **Decision (native printing is safe, Audit 07 / O-01):** the browser's own Print command (Cmd/Ctrl+P, the Print menu) on the ordinary Journey page — GM view or screen Player Preview — prints
  **one localized instruction line** ("To print the player map, open Player Preview and select “Print player map”." / RU equivalent, `journey2_pp_native_safe`) and nothing else: no drawer, cards,
  Environments, Soul Echoes, Shadowblight, tools or fog. It is print-CSS only, scoped to `body[data-j2]` (set only while the Journey page is mounted; the Catalog, Prep and Lists never match) and
  excludes the official print (`body.j2-printpreview-mode`) and the legacy proof (`.j2-print-mode`), whose output is unchanged. The official two-page flow stays the only way to print the map.
- **Decision (label ink, Audit 07 / F-01):** a printed sanctuary name is clamped inside its page by its *rendered* width — real glyph advances of the uppercase map lettering plus the full 3 px halo,
  a 6 % safety factor and 1 px rounding (`Journey2Geometry.inkLineWidth`, opt-in `ink` option of `layoutSanctuaryLabels`, constant `LABEL_STROKE_PX` in `journey2-print.js` mirrors the print halo) —
  never the flat 0.6 em estimate. Screen Player Preview keeps the flat estimate. The screen fog hatch over Old Valloren stays (Audit 07 F-02 closed as intended design).
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

## PD-030: Journey — "Locate Soul Echoes" is a GM-only map tool with a magic compass, and Echoes can be collected
- **Status:** Active. **Amended by PD-052 (planned):** the Collected state is no longer GM-only (see PD-022); the compass and everything else stay GM-only.
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
  When both are the same path, only one line and one bubble remain ("Fastest and shortest"). **Amended 2026-10-15:** Shortest breaks hex-count ties by fewer travel days (a tiny per-day cost weight in the A*, never part of the reported cost), and the two collapse into one "Fastest and shortest" bubble whenever they are the same path OR both complete with equal hexes and equal days — a route that is no better on any number shown is never offered. The cost belongs to the hex **entered**: the start is free, so A -> B and B -> A can differ.
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
- **Amended by PD-051 (2026-10-12):** the A and B pins can be dragged. **Amended by PD-052:** the planner also runs on the read-only player page and in Player Preview, over the cells the players know (so "GM-only" and "never reaches Player Preview" below no longer hold there; the print still never carries it).
- **Decision (interaction):** while choosing A or B the planner owns the map (no tile drag, inspector, overlay or tile selection; a drag above the pan slope, or Space + drag, still pans). Escape
  steps back (details -> closed; choosing B -> choosing A -> closed). In the result the map behaves normally. Bubbles stay on screen (clamped to the map edge, nudged apart when they overlap) and
  follow pan and zoom. No draw-in or looping animation: the routes appear immediately (nothing to reduce for `prefers-reduced-motion`).
- **Out of scope:** saved routes, a party token or automatic movement, a travel calendar, encounter rolls or simulation, resources, user-weighted costs, "safest" or danger ratings, Environment
  or adversary difficulty as cost, a Shadowblight penalty, sharing or printing a route for players, automatic fog reveal, assumed terrain for unknown cells, roads / rivers / blocked hexes,
  multi-stop routes, keyboard hex selection (the map has none), "Plan route here" from the sanctuary overlay.
- **Where:** `js/journey2-route.js` (pure engine + planner state machine), `js/journey2-view.js` ("Route Planner" block), `css/journey2.css`, `data/i18n.json` (`journey2_route_*`),
  `tests/journey2-route.test.js`.

- **Addendum (2026-10-15):** a Shortest route is dropped as redundant whenever Fastest is complete (every hex rated) and has the same hex count, even if Shortest's own days are unknown (it crosses ungenerated hexes): same length plus known days dominates it (`sameRoute`).
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

## PD-039: Journey — the Encounter Roll in the Region Inspector

- **Decision:** the book's rule — "when the party enters a hex, roll a number of d6s equal to the hex's terrain rating; if any die shows a 1, activate an encounter you designed during region creation; otherwise you can spend a Fear to activate one" — is one button in the Region Inspector's Encounter header (moved there from the Terrain line: the dice and the Fear hint appear directly under it, inside the same red frame), labelled "Nd6" (N = the region's Terrain Rating, 1-4; the die size is fixed at d6 — the book's d4 / d8 variant is deliberately not offered yet, though `rollEncounterDice` already takes `sides`). One click rolls and re-rolling is always allowed (never disabled, never debounced), as on Prep. The same button appears whether the inspector was opened from a hex or from a card, because the rating belongs to the region.
- **Result:** the rolled faces stay visible (they are not a 1.2 s flash as on Prep — the GM has to read them), ones in Fear red, with a verdict: "Encounter!" when any die is a 1, otherwise "No 1s" plus a muted reminder that a Fear may be spent to activate one. A miss is not "no encounter", because of that Fear option. A second 1 changes nothing, so no count is shown. On a hit the Encounter section gets a Fear-red frame and a text flag ("Triggered") — red is the "dangerous game state" colour; gold stays affirmative-only and colour is never the only cue. A miss leaves the section untouched.
- **State:** transient GM view state (`encRoll`): never stored, never in Undo, never in Player Preview or print; dropped when the inspector closes or the region / hex changes. Announced through the live region.
- **Fully overtaken regions:** a region rolled 1-then-1 (PD-038) has nothing to read or roll for, so its inspector shows only the title, the "Fully shadowblighted" badge and the hex's Return action — no Terrain, no roll button, no Encounter, no Rumor — and its card has no Inspect button.
- **Not decided here:** no chance (percentage) in the tooltip (not in the book; Route Planner already shows an estimate), no "encounter used" tracking, no d4 / d8 selector.
- **Where:** `js/journey2-encounter-roll.js` (pure `rollEncounterDice({ count, sides, random })`), `js/journey2-view.js` (`renderEncounterRoll`, `rollEncounter`, the `encRoll` state, `setRollRandom` on the debug API), `css/journey2.css` (`.j2-roll-*`, `.j2-die`, `.j2-enc-sec.is-triggered`), `data/i18n.json` (`journey2_roll_*`), `tests/journey2-encounter-roll.test.js`.
- **Dice art:** the roll button shows `img/journey2/dice/d6-3d.png`; each rolled die is `d6-<face>.png` (160px derivatives of the originals; the 1 face carries a red pip). The numeric text is gone from the die, so the accessible name stays on the `.j2-roll-dice` container (`journey2_roll_dice_aria`).

## PD-040: Journey — the toolbar lives in the side panel; Player Preview is the same screen

- **Status:** the toolbar-in-the-panel half is superseded by PD-057 (an always-visible rail, a mode segment and a Campaign menu); the "Player Preview is the same screen" half stands.
- **Decision:** the horizontal toolbar above the map is gone. Its buttons sit at the top of the left side panel, in logical rows, all labelled except Undo / Redo (self-evident): (1) Undo, Redo, zoom − 100% +, Fit, collapse; (2) Biome colors, Player Preview; (3) Plan route, Locate Soul Echoes; (4) Soul Echoes, Remove Echoes; (5) Generate sanctuaries. Below them New region, then Hex stock (only these two scroll). The site header stays where it is. Reason: the map is a wide rectangle, so a Fit is height-limited on wide windows and the strip above it cost 48-90 px of map height (the toolbar used to wrap); the panel is an overlay and takes no map width.
- **Collapsed:** the 44px rail repeats every button, same order and groups, without labels (tooltip + accessible name = the label). The panel can always be collapsed; nothing is reachable only from the expanded half.
- **Player Preview:** one screen, two modes. The same panel stays in place and keeps its collapsed / expanded state; its row 1 (Undo / Redo / zoom / Fit) is unchanged, and the rest is replaced by the preview controls (flag, hint, Reveal / Hide brush, Print player map, Back to GM) in a panel only as tall as its content. New region, the stock and the GM tools are not shown in the preview. Camera and zoom are shared: entering or leaving never saves, restores or refits them (a pan made in the preview is still there after Back to GM). Biome colors is untouched (not offered in the preview, as before).
- **Not decided here:** mobile / narrow layouts keep the same panel (it is already almost full width there); no horizontal toolbar is kept as a fallback.
- **Where:** `js/journey2-view.js` (`buildSurface`, `setupRail` / `syncRail` / `focusTool`, `applyPreviewChrome`, `sideInset`), `css/journey2.css` (`.j2-controls`, `.j2-ctl-*`, `.j2-rail-*`), `index.html` (skeleton), `tests/journey2-controls-panel.test.js`.

## PD-041: Journey — Locate Soul Echoes also opens a Shadowblight control that moves the X's across the map

- **Status:** Active (amends PD-030: the compass stays transient and direction-only, but a Locate result now also opens this control, and the "Out of scope: Seeker automation" / "no Seeker marker" lines no longer hold; every other PD-030 rule stands)
- **Date:** 2026-10-08
- **Decision (what it is):** the book says that, at the GM's discretion, using the move alerts nearby Seekers-in-Shadow. Right after a Locate result starts, the party's hex gets a **red dashed frame** (Fear colour) and a small **bubble under it: [−] N [+] [×]**. Each **+** moves the nearest block of Shadowblight X's one hex closer to that hex; **−** takes the step back; **×** closes the bubble. The compass popover stays as it was, but the two are independent: **closing the compass (Close, Esc, the toolbar button) keeps the red frame and the bubble**, so the GM can keep stepping the Shadowblight with the map clear; only × closes the bubble. Choosing another hex replaces the control; another tool, Player Preview, import, a stale Locate result or any other document change closes it. When the map holds no X and no unreleased skull, nothing happens and no extra UI appears.
- **Decision (blocks):** a block is an edge-connected group of X hexes, or an edge-connected group of fully overtaken ("skull") hexes that still hold their X. X blocks and skull blocks never merge. The block(s) at the minimum **hex distance** from the party's hex move, every block tied at that distance together; all others stand still for the whole session, even when the moving block has stopped. "Nearby" is "anywhere on the map". The block is chosen once, when the bubble opens.
- **Decision (movement):** deterministic (no RNG, so − is the exact inverse of + and Redo can never differ). A breadth-first path field from the party's hex over the hexes an X may enter; each X steps onto a free neighbouring hex strictly closer by that field, nearer X's first, ties by cell id; with no such hex it stays; a hex never holds two X's. The nearest X ends on the party's hex, the others pack right behind it. An X may enter any valid, non-decorative hex — an empty (ungenerated) one or a tile of another region included — but **not** a printed sanctuary / Marrogate / Horizon hex and not a skull tile. **Water is not an obstacle yet** (there is no land / water mask in the map template; add one before making it one). The count of steps per session is capped at 20, and **+** is unavailable as soon as a step would change nothing.
- **Decision (skulls):** an overtaken region keeps its skull for ever. Each skull hex releases **exactly one** X, once, which then walks like any other X; the released hex is recorded as suppressed. The skull never receives an X.
- **Decision (the map changes):** unlike the compass, this is campaign data. X positions are stored as a delta over what the regions already imply: `doc.shadowMarks = { added, suppressed }` (optional on load, `schemaVersion` stays 1). Shown X's = (blighted-tile cells − suppressed) + added. Every step is one `setShadowMarks` command, and **one bubble session is one Undo entry** (Undo returns to step 0 and closes the bubble; Redo restores the last step). **Closing the bubble (×) leaves the X's where they are.** Any other document change (an edit, Undo, Redo, import) closes the bubble; it never reopens by itself. A tile edit (place, move, return, delete batch) keeps the lists canonical: a suppression for a cell with no blighted / overtaken tile is dropped, an added X where a blighted tile now stands is absorbed.
- **Decision (what an X means):** a moved X is a mark on the map, not a region attribute. The "Shadowblighted" badge, the inspector, the Biome Tint, the Route Planner and the Environment deal still depend on the region (batch), never on an X standing on the hex.
- **Decision (players and print):** the X's are fog-filtered like everything else: Player Preview and the print show a moved X only on a **revealed** cell (on a tile through its overlay's `blightMark`, on open ground through the projection's `shadowMarks: [{ q, r }]`, per print page `marks`). The compass, the bubble, the frame and the plan never reach Player Preview or print.
- **Out of scope:** water as an obstacle, X's that persist a step counter between sessions, Fear / encounter automation, moving X's in Player Preview, a "return home" action beyond Undo, more than one party hex at a time.
- **Where:** `js/journey2-model.js` (`shadowMarks`, `getShadowXSet`, `getPendingSkullSet`, `normalizeShadowMarks`, `setShadowMarks`), `js/journey2-shadow-marks.js` (pure planner `createSeekerPlan`), `js/journey2-projection.js` + `js/journey2-print.js`, `js/journey2-view.js` (`openSeekers` / `stepSeekers` / `renderSeekers`, `blightXMarkup`), `css/journey2.css` (`.j2-seek*`), `data/i18n.json` (`journey2_seek_*`), `tests/journey2-shadow-marks.test.js`.

## PD-042: Journey — responsive release polish (details close, scroll cue, scroll handoff, resize context)

- **Status:** Active (refinement only; no new feature)
- **Date:** 2026-10-08
- **Decision:** (1) *(Superseded by PD-064: the Journey-only close dock is gone.)* The Environment details card opened over `#/journey` carried a zero-height sticky close dock. (2) The hex inspector's scroll cue is a faint parchment-tinted fade (not a darker shadow), only on the edge that still has content. (3) The Environment picker list is still a bounded 14rem scroller but no longer traps the wheel: at its top/bottom native scroll chaining continues into the inspector. (4) On an explicit **window resize**, an open hex inspector whose hex left the map area gets the least pan that brings it back (zoom kept, never Fit), then the usual inspector-clearance pan; a hex still in view is not moved. Drawer collapse/expand and other camera flows are untouched (they do not fire window resize).
- **Where:** `js/app.js` (`openDetailOverlay`), `css/styles.css` (`.modal-header`), `css/journey2.css` (`.j2-insp-scroll`, `.j2-hexenv-list`), `js/journey2-view.js` (`reconcileInspectorAfterResize`).

## PD-043: Journey — side drawer UX pass (zones, pinned Generate, count = hexes left, compact finished cards, brush)

- **Status:** Active (refines PD-040; the Player-Preview-is-the-same-screen rule stands; the toolbar-in-the-panel rule is superseded by PD-057).
- **Date:** 2026-10-09
- **Decision (D1):** the Hex stock heading keeps its name; the number beside it is the hexes still to place ("6 to place", muted "all placed" at 0, gold-soft while above 0). The region total lives in that number's tooltip / accessible name, and in the rail count's aria text. The rail count shows the same hexes-left number.
- **Decision (D2):** Remove Echoes is neutral at rest (it is confirmed and undoable); only hover / focus show the fear-red remove treatment.
- **Decision (D3):** no "needs placing only" filter and no re-sort of the stock. Stock order and the `#N` ordinals never change; compact finished cards plus the existing unplaced highlight do the scanning work.
- **Decision (D4):** "Generate region" is one pinned full-width primary row under the toolbar; only the Hex stock heading (sticky) and the cards scroll. The hint is the button's tooltip / description and the empty-state copy.
- **Decision (D5):** the fog brush is not armed automatically on entering Player Preview. The brush button carries a visible name ("Fog brush") and an On / Off state next to the gold pressed fill; "Back to GM" sits on the same row as the mode flag.
- **Also:** tool rows are drawn as the rail's three zones (View / Tools / Echoes + sanctuaries) with hairlines; a finished, collapsed card is a compact two-line row with a dimmed tile; the inspect control is a quiet `.icon-btn` with a magnifier (never the info glyph); terrain dots carry a tooltip ("Terrain N - N days per hex"). Desktop and laptop only; no touch or mobile work.
- **Where:** `js/journey2-view.js` (`buildSurface`, `createCard`, `updateCard`, `renderInventory`, `applyPreviewChrome`), `css/journey2.css` (`.j2-controls`, `.j2-ctl-gm`, `.j2-gen`, `.j2-stock`, `.j2-card*`, `.j2-paint-*`), `data/i18n.json` (`journey2_stock_*`, `journey2_fog_brush*`, `journey2_terrain_tip`), `tests/journey2-drawer.test.js`.

## PD-044: Journey — fully shadowblighted regions: no Terrain dots, red chip and Inspect like any other region; Inspect centres the map

- **Status:** Active (refines PD-038/PD-039: the bare inspector — title, badge, Return — stands).
- **Date:** 2026-10-09
- **Decision:** a fully overtaken region shows no Terrain Rating dots (card, inspector, and its hexes on the GM map, Player Preview and print — the projection emits `dots: 0`). Its card carries the same red "Shadowblighted" chip as a partly blighted region and keeps the Inspect button. Opening Inspect from a card eases the camera (600 ms, instant under reduced motion) to the middle of the region's hexes at exactly 100%.
- **Where:** `js/journey2-view.js` (`updateCard`, `renderInspector`, `specOfBatch`, `focusRegion`, `animateCameraToWorld`), `js/journey2-projection.js`.

## PD-045: Journey — the party marker (a golden four-pointed star that lights seven hexes)

- **Status:** Active (implemented 2026-10-09). Amends PD-030 (Locate starts from the marker when it is shown) and PD-031 (Route Planner point A defaults to it); lifts the "more than one party hex" limit of PD-041 only in the sense that the marker is the one party. Desktop and laptop with a mouse / trackpad only; no touch support.
- **Date:** 2026-10-09
- **Decision (what it is):** one **party marker** — a concave four-pointed star (not the straight-sided blue Soul Echo rhombus), gold with a dark outline and, on top of that, a thin white pixel outline so it separates from any hex content. One "Party location" toggle button (same star icon; in the side panel and repeated icon-only on the rail) exists in **both** the GM view and Player Preview, since they are one screen (PD-040).
- **Decision (show / hide):** hide removes the marker **and its light** for everyone, players and print included; the position is remembered and the next show puts the marker back where it was. A first show with no saved position attaches the marker to the cursor (it snaps to the hex under it) until a click drops it; Esc cancels and leaves it unplaced.
- **Decision (moving):** the marker is dragged hex to hex and snaps to hex centres. It may stand on **any** map cell: a fully overtaken hex, Marrogate, Horizon, a sanctuary. **The marker always has input priority** over every other interactive element (tile drag, Reveal / Hide brush, Locate, Route Planner, Inspector); a pointer-down on it starts its drag. **One exception (PD-051):** while the Route Planner is open, a press on its A or B pin outranks the marker; the marker is still dragged anywhere a pin is not.
- **Decision (drawing):** above everything else on the map (tile symbols, dots, X's, Echo crystals, sanctuary icons). Every piece of information on its hex stays; the marker never hides or replaces it.
- **Decision (placing, in detail):** pressing the button with no saved position makes the marker follow the cursor (it is gone while the pointer is off the map); a left click on a hex drops it (one `setParty` command, one Undo entry) and Esc / the chip's Cancel / the button again cancels. A drag of a placed marker is previewed live (Player Preview re-lights as it snaps from hex to hex) and committed once on release; Esc, a cancelled pointer, another tool or Undo restore it. A held Space (temporary pan) is the only press the marker lets through. Placing is mutually exclusive with the fog brush, Locate, the Route Planner and the inspectors; a placed marker coexists with them.
- **Decision (the light — temporary, derived):** while the marker is shown and placed, the **seven cells** (its hex and its six neighbours) count as revealed to players. This is derived, never stored in `playerVisibility`: moving the marker moves the light, hiding it removes the light, and nothing is written into the Fog of War. The union (hand-revealed ∪ the seven cells) is computed in one place, the pure projection, so Player Preview and the print agree; tiles, perimeter and X's inside those cells reach players like any revealed cell. A Hide-brush stroke on a lit cell changes only the stored reveal underneath; the cell stays lit while the party stands there. A Reveal stroke is stored as usual.
- **Decision (storage / history):** the position (a cell id) and the shown flag are campaign data in the map document (optional on load, `schemaVersion` stays 1), so they survive reload, backup and import. A completed drag, and a drop, are one Undo entry each; toggling show / hide is one Undo entry.
- **Decision (print):** the marker is in the player print (black star with a white outline; the print has no colour) and its seven cells are present as in Player Preview.
- **Decision (Locate and Route Planner):** when the marker is placed **and** shown, **Locate Soul Echoes** starts from its hex (no "pick the party's hex" step; the PD-041 Shadowblight control opens on that hex as before) and the **Route Planner** takes it as **point A**; the GM may still change A by hand. When the marker is hidden or unplaced both tools behave exactly as before. The marker is only a source of the starting hex: neither tool moves it, reads its light or writes the fog.
- **Out of scope:** more than one party, a trail of past positions, a permanent reveal along the path, touch / mobile placement, free (non-hex) positioning.
- **Not done (known):** the marker is a mouse interaction (placing and dragging); there is no keyboard way to move it, only to show / hide it with the button.
- **Where:** `js/journey2-model.js` (`party`, `validateParty`, `setParty`, `getPartyCell`, `getPartyLightSet`, `getVisibleCellSet`), `js/journey2-projection.js` (`revealedCells` ∪ light, `party`) + `js/journey2-print.js` (per-page `party`), `js/journey2-view.js` (the "party marker" section: `toggleParty`, `startPartyDrag` / `finishPartyDrag` / `cancelPartyDraft`, `partyMarkup`, `projectionDoc`; the hooks in `startLocate` / `startRoute`; `printPageMarkup`), `css/journey2.css` (`.j2-party-*`, `.j2-ctl-party`), `data/i18n.json` (`journey2_party_*`, `journey2_live_party_*`), `tests/journey2-party.test.js`.

## PD-046: Journey — a "Placed hexes" outline toggle in Player Preview

- **Status:** Active (implemented 2026-10-09). Extends PD-034 (the hidden-hex outline was only a Reveal/Hide aid).
- **Date:** 2026-10-09
- **Decision:** Player Preview has a "Placed hexes" toggle (panel button + rail icon). On, it draws a faint dashed outline (`.j2-fog-ghost.is-soft`) round every placed hex still hidden from players, so the GM can see where prepared hexes are while using the Party marker. Only hidden placed hexes (same set as the brush aid); revealed hexes need none. While the Reveal/Hide brush is armed the stronger outline is always drawn, whatever the toggle says.
- **Decision (default / storage):** **off by default** — Player Preview is often shown to players, and the outline betrays prepared-but-undiscovered hexes. The flag is a view preference, `showPlacedOutline` in `dhcodex_journey2_ui` (no new key); never in the document, history, projection or print.
- **Where:** `js/journey2-view.js` (`renderFogGhost`, `toggleOutline`), `js/journey2-store.js` (`loadUi`/`saveUi`), `css/journey2.css`.

## PD-047: One compact header with four bookmark-ribbon tabs; sticky catalogue filters

- **Status:** Active (implemented 2026-10-09). Supersedes the Prep chrome's expanded / compact header toggle (`data-sp-header-mode`, see `docs/architecture.md` "Prep") and the large header on the catalogue and Lists routes.
- **Date:** 2026-10-09
- **Decision (header):** every route (`#/`, `#/lists`, `#/prep`, `#/journey`) has the same compact, sticky header, 45 px tall, full width with the page's own side gutter (no 1180 px cap). The brand is the logo icon plus the title on one line; the subtitle and the compatibility line leave the header. Prep keeps its session pill in the header's free middle; the session panel becomes a popover from that pill (nothing reflows), replacing the push-down session bar.
- **Decision (navigation):** four bookmark ribbons hang from the top edge: Catalogue, Lists, Prep, Journey. The catalogue gets a tab for the first time (the home page had none, so no tab was ever "current" there). A ribbon is a page identity, not a state. The active page is shown by length, brightness and `aria-current="page"`, never by colour alone.
- **Decision (ribbon look):** satin-ribbon rendering (selvedge edge lines, light from the top left, swallow-tail cut, two-layer cast shadow), the label pinned to the ribbon's bottom so it slides down as the ribbon lengthens. Four states: inactive (short), hover on inactive, active, active + hover (longest). Starting tails below the header: 10 / 22 / 28 / 42 px, tunable. A short spring on the length, a swing on activation and a faint sway on hover; all of it off under `prefers-reduced-motion`. Inactive ribbons are dimmed only lightly so the colour stays visible at rest.
- **Decision (colours):** taken from the real ribbons of the books (sampled from product photos, so approximate, not manufacturer values): Catalogue gold `#c9952f` and Lists purple `#6c3698` (Core Set); Prep green `#2e8062` and Journey red `#b70c28` (Hope & Fear). Core marks the two reference pages, Hope & Fear the two working pages.
- **Decision (exception to the colour rules):** `.claude/rules/ui.md` reserves gold (`--hope*`) for the affirmative state and Fear-red for destructive / error states. The Catalogue ribbon (gold) and the Journey ribbon (red) are a deliberate exception: they are book-ribbon identity, never a state. Do not reuse these ribbon hues for anything else, and do not promote the ribbon red to a Fear / danger token.
- **Decision (compatibility line):** "Daggerheart™ Compatible" is **not shown on Prep and Journey** (they have no footer; only the logo and title identify the project there). It stays in the footer of the catalogue and Lists, with the existing legal copy. The line is still never part of the brand name or the `<h1>` (CLAUDE.md "Branding").
- **Decision (catalogue filters):** the filter row is sticky directly under the header and about 10 % smaller (controls 36 px instead of 40, tighter padding, left-aligned with the card grid). While scrolling 95 px stay pinned (header + filters) instead of 76 px, in return the filters never scroll away. The results counter sits left of the ribbons so they never cover it.
- **Decision (no covering):** the ribbons may overlap page content while extended and sit above it (z-index 30). The result counter is placed right after the filter controls, not under the ribbons. The Prep popover sits just under the header (z-index 29), so a ribbon always draws over it. Journey's screen-space panels are positioned by the map code and are not shifted for the ribbons; an extended ribbon can briefly cover the top edge of a panel in the upper right.
- **Decision (phone, <= 640 px):** the title comes off, the ribbons narrow to 40 px with icons only (the accessible name stays), the tails shorten to 6 / 12 / 14 / 20 px, and the filter row starts below the longest tail.
- **Decision (footer):** the footer is pinned to the bottom of short pages (body is a flex column, the footer takes `margin-top: auto`) and carries the "Daggerheart™ Compatible" line before the legal note.
- **Decision (Prep popover):** its state is transient (always starts closed, not persisted; the old `dhcodex_session_prep_header_mode` key is no longer read or written and may linger harmlessly in storage), and it closes on Escape, on a press outside, and when Prep is left.
- **Open:** the four ribbon colours are CSS tokens (`--rb-*`) but their ink and shadow colours are set per ribbon in `css/styles.css`; a measured contrast check of the label on the gold ribbon is still to do.
- **Fix (2026-10-12):** `ribbon-drop` used to end on the resting length (`--rb-t2`), so a ribbon clicked while the cursor stayed on it snapped from t2 to the hovered t3 when the 0.7s animation finished. Its target is now `--rb-end` (default `--rb-t2`; `.ribbon.drop:hover` sets `--rb-t3`). Timing, easing and the unhovered path are unchanged.
- **Where:** `renderHeader()`, `RIBBONS`, `ribbonHtml()` and the Prep chrome functions in `js/app.js`; `.site-header`, `.header-inner`, `.ribbon*`, `.catalog-bar*`, `.prep-bar`, `.site-footer` and the `--hdr-h` / `--rb-*` tokens in `css/styles.css`; `--j2-header-h` fallbacks in `css/journey2.css`; `data/i18n.json` (`nav_catalog`); `tests/prep-session-control.test.js`, `tests/prep-notes.test.js`, `tests/journey-route-cutover.test.js`.

## PD-048: Journey is not offered on touch-only devices

- **Status:** Active (implemented 2026-10-09). Replaces the earlier "mobile / narrow layouts keep the same panel" note in the Journey toolbar decision: the editor is desktop/laptop with a mouse or trackpad (PD-018, PD-040, PD-045), so a phone no longer gets a broken copy of it.
- **Decision:** when `matchMedia('(pointer: coarse) and (hover: none)')` matches, `#/journey` (and `#/journey/env/<id>`) renders an explanation (title, one sentence, "Back to the catalogue") instead of the editor. Decided by input capability, never by width or user agent, so a narrow desktop window keeps the editor and an iPad without a mouse does not.
- **Decision:** the editor is never mounted there, so no `dhcodex_journey2_*` key is read, written or recovered; a saved map is untouched. The Journey ribbon stays in the header so the section is discoverable; the explanation lives on the page.
- **Also (QA round, same date):** an unknown `#/env/<id>` still drops the suffix but now shows a one-line "environment not found" toast; the catalogue empty state no longer suggests adding a stat block and shows one reset control, not two.
- **Not decided:** a read-only Player Preview for phones (view the revealed map, no editing) — possible later as its own feature.
- **Where:** `journeyUnsupportedHere()`, `renderJourneyUnsupported()` in `js/app.js`; `journey_unsupported_*`, `env_not_found` in `data/i18n.json`; `tests/journey-route-cutover.test.js`.
- **Amends PD-047 (counter vs ribbons, 2026-10-09):** at desktop widths the "Showing N of M" status stays on the first row right after the controls, but starts one ribbon width + the ribbon gap + `--s-7` further on (`margin-left` on `.catalog-bar .result-count`, divided by the bar's 0.9 zoom) **only while the bar is 981–1700px wide** — on a wider bar (e.g. 1920px) it has room and sits right after the controls with no offset — so it clears the current page's ribbon, which hangs down into that row (on a 1536 px window the ribbon spans x 934–1038 and the status now starts at x 1048). It is not wrapped to a second row (that made the sticky bar 32 px taller). Below the container breakpoint, where the controls wrap, the margin is 0. Journey's saved camera (a view preference, clamped to keep 120 px of the map on screen) and the Lists cover-first layout were checked and are by design.
- **Prep header on phones and small tablets (QA round, 2026-10-09):** up to 900 px the Prep header drops the brand mark (the Catalogue ribbon is home) and the session pill shrinks to its status icon and chevron (label and name stay in its accessible name), because the ribbons plus the sound and language buttons need 278 px (≈570 px with labels); the Items dice buttons wrap under 1100 px of panel width. Before, the Prep page scrolled sideways at 375 px and the language switch ran off the screen. A disabled environment checkbox (three already chosen) now carries the reason as a tooltip; list names are capped at 80 characters; toasts break long unbroken words.

## PD-049: Journey — illustrated Region Inspector header for every terrain

- **Status:** Active (implemented 2026-10-09). Extends the Forest / Drylands prototype to all terrains with horizontal artwork.
- **Decision:** the shared Region Inspector (`#j2-region-inspector`, opened from a placed hex or from a Hex Stock card's `i` button — one element, so one implementation) shows a decorative 960x540 WebP of the region's terrain behind its header: min-height 88 px, `center 25%` crop, dark left-to-right gradient for legibility, the original hand-drawn terrain icon, the unchanged title / meta / close button. Hex Stock cards, the vertical catalogue artwork and the hand-drawn icons are untouched and remain separate assets.
- **Decision (one map):** `REGION_ART` in `js/journey2-view.js` is the only terrain -> artwork map (exactly the eleven Journey terrains; `img/journey2/headers/<biome>.webp`, optional per-terrain `pos`). `applyArt()` sets `data-art` and the `--j2-art` / `--j2-art-pos` custom properties on a panel (`applyHeaderArt()` for the Region Inspector); the CSS holds one rule set, no per-terrain blocks. A fully overtaken region (`habitat.overtaken`, never the Shadowblighted badge alone) uses the dedicated `OVERTAKEN_ART` = `fully-shadowblighted` (`img/journey2/headers/fully-shadowblighted.webp`, 1280x480, `center 55%`; Stock card: `img/biomes/fully-shadowblighted-{300.avif,200.webp}`, the right 69% of the source; master in `img/biome-artwork-source/`); a failed image load leaves the plain ink header under the gradient.
- **Decision (Universal and Settlement):** Universal and Settlement are Environment-catalogue categories, not Journey regions (never generated, never in Hex Stock). Universal therefore needs **no** Journey artwork — its absence is intentional, not a missing asset. The Settlement illustration belongs to **Sanctuaries**: `SANCTUARY_ART` gives the GM-only sanctuary overlay (`#j2-sanctuary`, same `.j2-region-inspector` panel and `[data-art]` styling) the same illustrated header (`center 25%`). Purely decorative: no marker, position, discovery state, fog, Player Preview or print is touched, and the art is cleared when the overlay closes.
- **Decision (crops):** `center 25%` is the default; Aquatic, Wetland and Rolling use `center 40%` and Grassland `center 50%` (at 25% the plain is mostly sky). Compared at 25 / 40 / 50 % (screenshots in `qa/biome-headers/`, since removed; see git history before `f4d3287`). Forest and Drylands are unchanged.
- **Decision (meta line):** the region meta (`Region N · examples`) flows inline with no-break spaces around the dot, so the separator never starts a wrapped line.
- **Decision (readability):** the shared gradient was strengthened slightly in the text zone (0.82 at 54 %, 0.4 at 78 %, 0.1 at 100 %) for the bright Aquatic / Grassland / Drylands art; no per-terrain gradients. The prototype's dev-only `?hdr=` switch is gone.
- **Where:** `REGION_ART` / `SANCTUARY_ART` / `applyArt()` / `applyHeaderArt()` in `js/journey2-view.js`; the `[data-art]` rules in `css/journey2.css`; `img/journey2/headers/`; test `tests/journey2-header-art.test.js`.

## PD-050: Journey — biome artwork on Hex Stock region cards (A+ Refined)

- **Status:** Active (implemented 2026-10-09; the extended "A+ Refined" treatment became the permanent design 2026-10-12). Chosen from a current / A / A2 / B comparison (vertical art won), then from A / A+ / A+h / A+ Refined (A+ Refined approved).
- **Decision:** every Hex Stock region card for one of the eleven natural Journey biomes carries the Environment catalogue's vertical illustration (`img/biomes/<biome>-300.avif`, `-200.webp` fallback via `image-set()`), spread over the whole card and fading smoothly into the card's ink. A `::before` layer (`pointer-events: none`, `z-index: -1`) behind the unchanged content — no change to card size, padding, gap, panel width, controls or the hand-drawn icon tile. Card geometry is identical to the pre-artwork cards (measured, 0.0 px difference, before and after the prototype was removed).
- **Decision (mapping):** `applyStockArt()` in `js/journey2-view.js` only sets `data-art="<biome>"` (membership = `REGION_ART`, so Universal / Settlement keep the plain card; a fully overtaken region gets `data-art="fully-shadowblighted"`); the eleven biome `--j2-card-art` rules plus the fully-shadowblighted one live in `css/journey2.css`. No JS image URLs, no new assets, no storage, no query parameter.
- **Decision (Fully Shadowblighted card framing):** its Hex Stock card uses a dedicated 2.46:1 crop of the approved painting (`img/biomes/fully-shadowblighted-{300.avif,200.webp}`, cut from `img/biome-artwork-source/fully-shadowblighted.png`; the Region Inspector header keeps `img/journey2/headers/fully-shadowblighted.webp` untouched) so cliffs, rupture and spiral galaxy all read. It reuses the shared wash, mask direction and open-card fade; the only per-art overrides are a lighter wash (0.3), a higher mask tail (the painting's galaxy sits where the shared mask is near zero) and the framing (`cover` anchored low collapsed; full width shifted up on the open head row). No dedicated gradient layer.
- **Decision (readability):** two shared artwork-intensity profiles, no per-biome CSS. One ink wash (clear to 8 %, ramping to full strength at 16 %, held to 80 %, released by 94 %) sits over the art and one shared mask (opaque at the icon, 0.46 at 44 %, nearly gone from 72 %) lets the art go before the right-hand `#number`. Only the wash strength differs: **Dark** art (forest, wetland, frozen, underground) `--j2-wash-mid/end: 0.4 / 0.4`; **Bright** art (aquatic, rolling, grassland, tropical, drylands, mountain, badlands) `0.6 / 0.5`; aquatic's middle is `0.76` (its Shadowblighted badge sits on the brightest painting). The open card also fades the art vertically so the Place controls stay on plain dark ground.
- **Decision (completed regions):** a fully placed collapsed card draws the art at opacity 0.6 (0.92 otherwise) on top of the existing compact row and dimmed icon; the card itself, its text, status and controls are never faded.
- **Rejected:** horizontal crop (A2), full-card background (B), the original 96 px strip (A) and the un-refined A+ (one wash for every biome: dark art lost its colour, bright art lost contrast), and horizontal header art on the card (A+h; blurry, ~3x the bytes). The dev-only `?stockArt=` switch and its comparison scripts are gone; the parameter is ignored.
- **Where:** `applyStockArt()` in `js/journey2-view.js`; the `.j2-card[data-art]` rules at the end of `css/journey2.css`; verification `scripts/journey2/verify-hex-stock-art.js` (`--part shots|interact|extra|all`: real pointer drags, invalid drops, saved-data checks, keyboard focus, blocked artwork, a 15-card list) (results were in `qa/hex-stock-art-final/`, since removed; see git history before `f4d3287`).

## PD-051: Journey — the Route Planner's A and B pins can be dragged, and outrank the party marker

- **Status:** Active (implemented 2026-10-12). Amends PD-031 (pins were fixed once placed) and PD-045 ("the marker always has input priority").
- **Decision:** while the Route Planner is open, a press on the A pin (while choosing the destination and in the result) or the B pin (result only) drags that pin. It snaps from hex to hex, the routes follow it live, and releasing it keeps the new hex. Esc or a cancelled pointer puts it back where the drag began. A pin never lands on the other pin; off the map it keeps its last valid hex. Grab area: 18 px around the pin (it is a constant screen size).
- **Decision (priority):** a pin outranks the party marker, so A standing on the marker (the default, PD-045) is the pin that moves and the party stays. Anywhere a pin is not, the marker is still dragged as before. To move the marker that sits under a pin, leave the planner (Esc) first. No modifier key.
- **Decision (transience):** unchanged from PD-031 — no document write, no Undo entry, no storage; the drag is a planner state change (`moveEndpoint`) only.
- **Where:** `js/journey2-route.js` (`moveEndpoint`), `js/journey2-view.js` (`routePinAt`, `startRoutePinDrag` / `moveRoutePinDrag` / `finishRoutePinDrag` / `cancelRoutePinDrag`, the order in `onViewportDown`), `css/journey2.css` (`.is-route-pin-hover`, `.is-route-pin-dragging`), `data/i18n.json` (`journey2_route_live_pin_moved`), `tests/journey2-route.test.js`.

## PD-052: Journey — a shareable read-only player link (a snapshot of Player Preview)

- **Status:** Active (implemented 2026-10-12). Fulfils the "read-only Player Preview" left open in PD-048; amends PD-022 / PD-030 (collected Echoes), PD-031 (planner on the player page and in Player Preview) and PD-045 (the same marker and light). **Player copy:** a string may have a `<key>_pl` variant (`journey2_route_unknown_pl`, ...) written without the GM's vocabulary — "generated Terrain" / "Known terrain" become "unexplored" / "explored hexes", "GM only; nothing is saved" is dropped, the load error loses its developer wording. The view's `t()` picks it on the player page for every string and in the GM's Player Preview for the `journey2_route_*` strings players also read; a key without a variant is unchanged, and every variant needs both languages and the base key's placeholders. Known gap: no printed player map from a link.
- **Decision (what it is):** the GM copies a link from Player Preview; a player opens it — most often on a phone (PD-067) — and sees the map exactly as Player Preview shows it at that moment: fog, the revealed hexes' tiles, the party marker and its six lit neighbours, the sanctuary names the GM revealed, and collected Soul Echoes. It is a **snapshot** — a later change needs a new link; there is no server and no live sync.
- **Decision (the link):** everything is in the URL fragment (never sent to a server, so it is compatible with PD-003): a one-byte format version, then a compressed binary snapshot (base64url). Only data a player may already see is encoded — it is filtered like the player projection, so hidden hexes, regions and sanctuaries are not in the link at all. The decoder rebuilds a synthetic map document from the snapshot and runs it through the existing projection, perimeter and route code (spike 2026-10-12: the projection is byte-identical to the GM's). Target length: up to about 2000 characters (Discord without Nitro); a live campaign is a few hundred, half the map revealed about 2000, all of it 3-5 thousand. The GM's copy button shows the length and warns above 2000.
- **Decision (camera, format version 2, 2026-10-12):** the link also carries the GM's camera from the Player Preview it was copied in — the world point at the centre of the map and how much world width is on screen — so the player first sees the same spot at the same zoom (a different screen gets the same *width* of world, not the same scale; a fitted map stays "fit"). After that the player pans and zooms freely; nothing about the camera is saved. Version 1 links (no camera) still open; the writer emits `2.<payload>`; an unknown version is refused with the "newer version" sentence.
- **Decision (first paint):** `#/map/…` boots on the same static map skeleton as the editor (`html[data-boot-route="journey2"]`), never the catalogue's card tiles.
- **Decision (fog first):** a collected Soul Echo (a dim crystal) is drawn only on a **revealed** sanctuary hex; under fog nothing is drawn; an Available Echo is never drawn or encoded. Fog beats every other layer.
- **Decision (isolation):** the player page never reads or writes any `dhcodex_journey2_*` key (the view is mounted with no storage) and has no GM controls; "Back to the GM view", the fog brush, Undo / Redo and Print are not on it.
- **Decision (language):** a small RU / EN switch at the top right. Sanctuary names are stored in the English name-element tables and do not change with the language, so the link does not grow; only the interface strings are translated. The GM's language rides in the link as one bit and is only the default for a player with no saved choice.
- **Decision (touch):** touch support is added **only** for this page — one-finger pan, two-finger pinch zoom with the held point kept between the fingers, tap to pick (10 px tap slop instead of 4), pins with a 56 px grab area. The editor stays mouse-only (PD-048); `#/journey` is still not offered on a touch-only device.
- **Decision (Plan Route for players):** the player picks A and B (A defaults to the shown party marker); the same pure planner runs on the synthetic document, so a hex is **known** only if it is revealed and has a tile, or holds a printed sanctuary / Marrogate / Horizon icon. Fastest enters known hexes only; Shortest may cross the fog and then says "days unknown"; a fully overtaken region under fog does not exist for it. Points may be placed under fog. The details show hexes, travel days and the terrain breakdown but **not** the expected-encounter estimate. The route is the player's own transient state and is never part of the link. The GM gets the same tool in Player Preview.
- **Decision (GM side):** a **Player link** button in Player Preview (panel and rail) builds the link from the same document Player Preview draws (the party's light included, even mid-drag), puts this page's address plus `#/map/<link>` on the clipboard and always shows its length. Above 2000 characters a note warns that some chats cut longer links. If the clipboard is unavailable the link is shown in a read-only field, selected, to copy by hand; a success message appears only after a real copy. The button is absent from the player page.
- **Decision (language, wired):** the language switch on the player page is the site's own (same stored choice as every other page); the GM's language in the link is applied only when the reader has never chosen one, is not saved, and is offered once per visit.
- **Decision (errors):** a link that cannot be opened (empty, damaged or cut, a newer format version, another map template) shows a localized sentence and nothing else; the raw error goes to the console only. Decoding is strict and never throws.
- **Out of scope:** live updates, accounts, a password, a short-link service, editing on the player page, a printed player map from the link.
- **Where:** `js/journey2-share.js` (codec, snapshot, synthetic document), `js/journey2-projection.js` (`collectedEchoes`), `js/journey2-view.js` (`playerMode`, `copyPlayerLink`, touch, `routeIndex` from the projection), `js/route-utils.js` (`#/map/<link>`), `js/app.js` (`renderPlayerMapPage`, the header), `css/journey2.css`, `data/i18n.json` (`journey2_pl_*`, `journey2_share*`), tests `journey2-share`, `journey2-player-page`.

## PD-053: Journey — a stale tab never overwrites a newer saved map; a cancelled import keeps the editing context

- **Status:** Active (implemented 2026-10-09; Undo/Redo Audit 06, findings H-04 and H-03).
- **Decision (H-04):** the map lives whole in `dhcodex_journey2_map` and every tab keeps its own document and Undo history, so a second tab could silently overwrite a newer save. `Journey2Store` now remembers the raw text of the map key as it last read or wrote it; before every write it re-reads the key and refuses (`{ ok:false, reason:'conflict' }`) when it differs. The view checks the same thing before every edit path (`dispatch`, Undo, Redo, import, Start-empty, `replaceDocument`) and on `storage` events for the map key and window focus — never only on events.
- **Decision (what a conflict does):** the tab keeps showing its own map, read-only (`editLocked`), with a persistent banner (EN/RU `journey2_banner_conflict`) offering **Export backup** and **Reload this tab**. Nothing is merged, nothing is reloaded silently, the in-memory document and history are not discarded, and there is deliberately **no "overwrite anyway"**. Only a reload clears it (the new instance loads the latest valid map with empty history). It is sticky for the instance: view-preference writes (`dhcodex_journey2_ui`), import, Start-empty and edits can never clear it. The tab that saved first wins; the other one is the stale tab.
- **Decision (not a storage failure):** `conflict` is its own state (`saveState.status === 'conflict'`, `debugState().conflict`); quota/unavailable/corrupt behaviour and the recovery / previous-map backups are unchanged. An unreadable store is never a conflict.
- **Known limit:** a read-then-compare in front of `localStorage.setItem` is **not** atomic. Two tabs writing within the same few milliseconds can both pass the check (Chrome propagates localStorage between renderer processes asynchronously); the later write wins and each tab is warned by the `storage` event right afterwards, so the loser's edit survives in that tab's memory and is exportable, but the persisted map holds only one of them. Closing that window needs a cross-tab lock (Web Locks) around check+write, not done here. This is protection against ordinary stale-tab use, not collaborative editing.
- **Decision (H-03):** a cancelled import (and an import-validation error) changes nothing — document, storage, history, selection, open Region Inspector, camera and drawer all stay. The "a replaced map never keeps a stale inspector" cleanup lives only in `replaceDocument()` (the confirmed path), which also clears selection and history.
- **Where:** `js/journey2-store.js` (`isStale`, guarded `save`), `js/journey2-view.js` (`enterConflict`, `conflictBlocks`, `renderBanner`, `handleImportText`), `data/i18n.json`; tests `tests/journey2-conflict-guard.test.js`.

## PD-054: Header — the photographic fabric skin for the bookmark ribbons (default; `?ribbonSkin=css` opts out)

- **Status:** Default since 2026-10-12 (implemented 2026-10-12: Catalogue gold, Lists purple, Prep emerald, Journey crimson — all four; final QA passed). Extends PD-047; does not change it.
- **Decision (default, opt-out):** `data-ribbon-skin="fabric"` is set on `<html>` unless the query string has `?ribbonSkin=css`, which gives the original CSS ribbons (`?ribbonSkin=fabric` is still accepted and is the same as no parameter). It is a query parameter, not part of the hash, so it survives every route change. There is no settings control. The CSS ribbons stay as the fallback and are never removed.
- **Decision (paint only):** the skin swaps the *background* of `.ribbon-fab` and hides `.ribbon-cut` (the photo has its own stitched hem). Height transition, `ribbon-sway` / `ribbon-drop`, transform origin, drop shadow, swallow-tail `clip-path`, dim overlay, label and icon, hit area and reduced-motion handling are the originals, so the cloth moves and grows as part of the same element. Labels and icons stay live HTML (RU/EN, accessibility); nothing is baked into an image. A rule in this block may not set animation, transition, transform, height or clip-path (`tests/ribbon-fabric-skin.test.js`).
- **Decision (one continuous cloth):** each ribbon is two layers cut from ONE full-length photographed master in `img/ribbon-fabric-source/` (Catalogue `G-Banner-long.png`, Lists `p-Banner.png`, Prep `E-Banner.png`, Journey `C-banner.png`): a **body** (the top of the master, pinned at the top, never scaled vertically, taller than the longest ribbon plus spring overshoot, so a longer ribbon reveals more of the same cloth) and a **hem** (only the sewn swallow-tail band, pinned at the bottom, its top edge feathered into the body). No tiling, mirroring, warping, procedural folds or synthesised middle; each master keeps its own folds, weave and stitching. Never recolour one master to make another.
- **Decision (pipeline):** `scripts/generate-ribbon-fabric.js` (dev-only, needs `sharp`, offline) holds one `FABRICS` entry per ribbon: source, crop box, V depth, stitch offset, hem start, optional `purgeRadius`. Output is `img/ui/ribbon-fabric/<id>-body.webp` and `<id>-hem.webp` (lossless, 208 px wide = 2x the ribbon). The cut-out's matte colour is replaced by the surrounding cloth colour (alpha kept, so threads and edge irregularity stay); `purgeRadius` additionally clears isolated background specks (used for purple and emerald; the emerald cut-out has the same faint alpha haze). Adding a fabric = one `FABRICS` entry, one master, one CSS rule pair for `data-ribbon="<id>"`, and the test counts. Run the generator with just the new id (`node scripts/generate-ribbon-fabric.js prep`); the approved output of the other fabrics must stay byte-identical — check their MD5s before and after (verified when Prep and Journey were added). The emerald master's measurements: silhouette x 110..727, rows 71..1822, V apex 1691 vs corners ~1821 (depth 130), stitch ~34px above the edge; crop 624 px wide so the 729/730 flare is not clipped (0.16% scale difference to purple, invisible).
- **Crimson master (Journey):** `C-banner.png`, silhouette x 111..728 (flares to 108..733 at the hem rows), rows 73..1830, V apex 1693 vs corners ~1826 (depth 133), stitch ~34px above the edge; crop 629 px wide (0.96% scale difference to purple). Its cut-out has a bright red/pink alpha haze, cleaned by the defringe + `purgeRadius`. Colour is untouched: the four fabrics' colours are to be judged together in a later calibration pass.
- **Decision (build):** the masters are excluded from `dist/` (`scripts/build.js`); the site serves only the `.webp` layers.
- **Not done / known gaps:** a measured label-contrast check on purple; the skin has been checked in the browser at 1440 and 1280 wide, not on touch or phone widths (out of scope for the experiment).
- **Where:** `js/app.js` (the flag, next to `ribbonHtml()`), "Fabric ribbon skin" block in `css/styles.css`, `scripts/generate-ribbon-fabric.js`, `img/ui/ribbon-fabric/`, `tests/ribbon-fabric-skin.test.js`.

## PD-055: Journey — the GM can rename a generated sanctuary from its overlay

A pencil beside the sanctuary name in the overlay ("Change sanctuary name") turns the name into a text field holding the old name, fully selected; the pencil is replaced by a tick (save) and an X (discard), and either returns the view to the pencil (Enter / Esc do the same, and Esc never closes the overlay while editing). Saving is one Undo entry through the existing `setSanctuary` command (name up to `MAX_SANCTUARY_NAME`). An **empty name is valid**: the overlay title and the revealed map label show nothing (the projection already skips blank names). The edit state is transient — it ends on save, cancel, close or opening another sanctuary. Reroll still replaces the name; reveal/hide state is untouched.

## PD-056: Journey — the page names its campaign ("Journey to Horizon" / «Путешествие к Горизонту»)

A visitor arriving on `#/journey` (or a player on `#/map/<link>`) used to see an unlabelled hex map: the campaign was never named in visible text. The top of the side panel now carries a permanent two-line header (`.j2-about`): the campaign title (`journey2_about_title`) and a one-line purpose (`journey2_about_sub`, "Interactive campaign map"). On the player page the second line is the player-friendly `journey2_about_sub_pl` ("What your party knows of the map so far"), via the existing `_pl` mechanism (PD-052). The document title (`journey_title`) became "Journey to Horizon · campaign map". The nav tab stays the short "Journey" / «Путешествие».

- **Russian name:** «Путешествие к Горизонту», as on daggerheart.ru/frame/journey-to-horizon (see [docs/translation-glossary.md](translation-glossary.md)).
- **Not a brand:** the campaign name is a descriptive label of the map's subject, never part of the project's brand (see CLAUDE.md "Branding"); "Daggerheart" is not added to it.
- **Where:** `js/journey2-view.js` (`buildSurface`), `css/journey2.css` (`.j2-about*`), `data/i18n.json`; the title string is pinned in `tests/journey-route-cutover.test.js`. No author or publisher attribution was added (the source page names designers but no publisher; an attribution line is a separate decision).

## PD-057: Journey — an always-visible tool rail, a GM | Players segment and a Campaign menu replace the panel's toolbar

- **Status:** Active (supersedes the toolbar half of PD-040; PD-043's zones, pinned Generate and compact cards stand)
- **Date:** 2026-10-13
- **Why:** the panel's toolbar held eleven labelled buttons in six rows of changing widths, grouped by when each was added; a GM who knows the page still had to read every label. The frequent tools were mixed with once-per-campaign actions, and the rail was only a collapsed, unlabelled copy.
- **Decision (rail):** the rail is a permanent column left of the panel, and the panel collapses without touching it. Its buttons are the real tools (no proxies): **Party** (P), **Route** (R) and **Find Echo** (E) in fixed slots; in Player Preview the third slot becomes **Brush** (E) and a second group adds **Print** and **Link** (the placed-hex **Outline** is a Display-menu switch, Player Preview only); at the bottom sit the **Campaign** menu and, only while the panel is collapsed, the hexes-left count and a **Players** switch (V). Each button carries an icon, a one-word label and its key as a corner keycap (`aria-keyshortcuts`); the full explanation is the tooltip. Shared tools keep their slot between modes.
- **Decision (shortcuts):** P, R, E, V and [ (fold the panel) are matched by the physical key (`event.code`) so they work on a Russian layout; each just clicks the rail button, so every existing guard (hidden, disabled, locked, dialog open, typing) applies unchanged. Tab is never taken.
- **Decision (mode):** the panel header holds a two-state segment **GM | Players** (Players = Player Preview). It replaces both the old "Player Preview" button and the "Back to GM" button. The preview's panel shows only the hint, the mouse-button legend and the copy-by-hand link field.
- **Decision (Campaign menu):** the rare, whole-campaign actions live in one menu opened from the rail (the shared `.j2-menu` machinery, arrow keys, Esc returns focus): the **Biome colors** switch, **Place the nine Echoes**, **Remove Echoes** (red only on hover / focus, still confirmed and undoable) and **Create sanctuaries: N**. It is GM-only and hidden in Player Preview. The Locate tool stays on the rail because the GM uses it during play.
- **Decision (map bar):** Undo / Redo, zoom, the zoom readout and Fit are icon-only buttons in one bar floating over the map's bottom edge, right of the rail and the panel (`--j2-inset-left`). They are not part of the panel any more. Placement: with the panel folded the bar sits flush on the rail's left margin (`--j2-bar-left` = the side gap, since the rail only fills the top of the strip); with the panel open it sits right of it (`--j2-inset-left`); on a window shorter than 700px it keeps clear of the tall rail as well; between 641px and 710px an open panel leaves no room beside it, so the bar goes back to the left margin and the panel column stops above it.
- **Decision (icons):** one set — Lucide (ISC, lucide-static 0.468) inlined in `LI` in `js/journey2-view.js`, one 24px grid and one stroke (`.j2-li`) — for the rail, bar, segment, menu and the party / route / locate map chips. The party icon is the `sparkle` star that matches the marker on the map; Find Echo is `radar`, Remove Echoes `eraser` (not a trash can), sanctuaries `castle`, Campaign `scroll-text`.
- **Decision (player page):** `#/map/<link>` has no panel: a title chip over the map, the rail holds the one tool (Route), the bar holds zoom and Fit. On a phone (≤640px) the rail becomes a bottom bar with 52px targets and the keycaps are hidden on touch.
- **Not decided here:** no drag-to-reorder of the rail, no user-configurable shortcuts, no tool palette for the editor on touch devices (PD-048 stands).
- **Where:** `js/journey2-view.js` (`buildSurface`, `LI`, `railBtn`, `applyPreviewChrome`, `syncSideToggle`, `focusTool`, `onToolHotkey`), `css/journey2.css` (`.j2-rail`, `.j2-rb*`, `.j2-seg*`, `.j2-camp*`, `.j2-mapbar`, `.j2-li`), `data/i18n.json` (`journey2_rail_*`, `journey2_mode_*`, `journey2_menu_*`, `journey2_campaign_aria`), `tests/journey2-controls-panel.test.js`.

## PD-058: Journey — one button deletes every unplaced region

- **Status:** Active
- **Date:** 2026-10-13
- **Why:** generating regions in bulk leaves a long stock of untouched cards; deleting them one by one (each with its own dialog) was tedious.
- **Decision:** a small trash button sits in the Hex stock header beside the count; it is hidden while no region is fully unplaced. "Unplaced" means a region with **no** placed hex — a partly placed region stays. A confirmation dialog states the count; Cancel is the default focus. The deletion is one atomic model command (`deleteUnplacedBatches`), so one Undo restores all of them. It never touches tiles, Fog, Echoes or sanctuaries.
- **Where:** `js/journey2-model.js` (`deleteUnplacedBatches`), `js/journey2-view.js` (`confirmClearUnplaced`), `data/i18n.json` (`journey2_clear_unplaced*`), `tests/journey2-inspector.test.js`.

## PD-059: Journey — the camera is bounded to the map (24 px slack) and zooms out no further than Fit

- **Status:** Active (amends the "clamped to keep 120 px of the map on screen" note in PD-047's amendment)
- **Date:** 2026-10-13
- **Why:** zooming out around a corner hex left the whole map in one corner of an empty brown viewport — the old clamp only kept 120 px of the map visible, and minimum zoom was 0.8 × Fit.
- **Decision:** per axis, inside the area the left sidebar/rail and the open diagnostics drawer leave free: a map smaller than the area is **centred**; a larger one may never leave more than **24 px** of empty space beside its edges. Minimum zoom is exactly **Fit**. Cursor-anchored wheel/pinch zoom is unchanged; the bounds correction is applied on top.
- **Where:** `js/journey2-geometry.js` (`clampCamera`), `js/journey2-view.js` (`minScale`, `setCamera`), `tests/journey2-geometry.test.js`.

## PD-060: Journey — the screen map is sepia by default, with a "Sepia map" switch

- **Status:** Active
- **Date:** 2026-10-13
- **Why:** the Old Valloren raster is black line art on pure white, which glared against the dark UI and clashed with the atlas look. A first version (parchment ground only) left the overlay's white tile covers and glyph halos as bright patches on the paper and could not be turned off; both were fixed the same day.
- **Decision:** on screen only, `.j2[data-sepia]` gives `.j2-world` a parchment ground (`--j2-paper`) and draws `.j2-base` with `mix-blend-mode: multiply`, so white becomes paper and the ink stays. Everything the overlay paints white to hide or lift the raster (tile cover, glyph halo, Shadowblight halo, party halo, sanctuary-label stroke) takes the paper colour too. The look is pure CSS: the raster file, its hash, the template, the print path (`js/journey2-print.js` / `.j2-pp-svg` draw the untouched raster, black and white; the sepia rules are scoped to `.j2-overlay` and never match it) and every stored/shared datum are unchanged.
- **Follow-up (2026-10-14):** hard-edged opaque boxes still showed as lighter rectangles / flattened hatching. The glyph lift is now a blurred (feathered) patch drawn below the tint, and the printed-label cover (MARROGATE, HORIZON) was removed altogether: a placed hex is a translucent wash over the finished map, so the lettering shows through it like the rest of the artwork.
- **Switch:** a "Sepia map / Сепия" item in the GM's Campaign menu beside "Biome colors", default ON, stored as `sepiaMap` in `dhcodex_journey2_ui` (a view preference like `showBiomeColors`; a non-boolean falls back to ON). The preference also governs Player Preview; the shared `#/map/<link>` page has no storage and is always sepia.
- **Where:** `css/journey2.css` (`.j2[data-sepia]`), `js/journey2-view.js` (`toggleSepia`), `js/journey2-store.js`, `data/i18n.json` (`journey2_sepia_*`), `tests/journey2-biome-tint.test.js`.

## PD-061: Prep — the item browser's Gallery / Compact view is remembered

- **Status:** Active
- **Date:** 2026-10-13
- **Why:** the toggle only changes density, not what is shown, and a GM who prefers Compact had to re-pick it on every visit. It was "transient" by default, not by a product decision.
- **Decision:** `prepUI.itemViewMode` is stored globally (not per Prep session) in its own key `dhcodex_prep_item_view` as the bare JSON string `"gallery"` or `"compact"`, via `SafeStorage` (`validators.prepItemView`; anything else falls back to Gallery). Written on every toggle. Filters, search and dice rolls stay transient.
- **Where:** `js/app.js` (`LS_KEYS.prepItemView`, `setItemViewMode`), `js/safe-storage.js`, `tests/storage.test.js`.

## PD-062: Journey — a "Regions" display switch draws one icon per region, as in the book
- **Status:** Active (experimental; default OFF)
- **Date:** 2026-10-14
- **Why:** the printed book marks a region with ONE symbol (plus its terrain dots), not one per hex; the map reads far cleaner that way.
- **Decision:** a "Regions / Регионы" item in the GM's Campaign menu beside "Biome colors" (a display preference `regionIcons` in `dhcodex_journey2_ui`, default OFF; no command, no history, no document write). When ON, every region (per edge-connected piece of its DRAWN hexes) gets one symbol on the hex nearest the piece's centre of mass that has room for the glyph (pure `Geo.pickRegionIconCells`); the other hexes keep their Biome tint and Shadowblight X but carry no symbol and no per-hex outline — the thick region outline is the only line. The same rule serves every view: the GM draws all of a region's hexes, Player Preview and the player page draw only the revealed ones, so a region with one revealed hex shows its own icon (with its dots) there, and from two connected revealed hexes on they share one icon (its position follows the revealed part as more is revealed). Two revealed patches that do not touch never share an icon.
- **Players:** the projection's overlays carry an anonymous `region` number (first appearance in cell order, never an id) so the renderer can group them. Player Preview follows the GM's switch; the player link carries it as flag bit 4 of format version 3 (3 = 2 plus this flag; 1 and 2 are still read and mean "off"), so the page draws exactly what Preview showed.
- **Not changed:** the player map print (PD-028) still draws one symbol per hex.
- **Where:** `js/journey2-geometry.js` (`pickRegionIconCells`), `js/journey2-view.js` (`overlayMarkup`, `toggleRegions`), `js/journey2-projection.js`, `js/journey2-share.js`, `js/journey2-store.js`, `data/i18n.json` (`journey2_regions_*`), `tests/journey2-region-icons.test.js`.

## PD-063: Journey — Player Preview fog looks like the book's: flat grey, fine grain, feathered edge
- **Status:** Active (refines the look from PD-020/PD-024; the "translucent, nothing cut out, no animation" rules stand)
- **Date:** 2026-10-14
- **Why:** the printed book draws unexplored ground as a flat mid-grey with a faint grain, the base map still faintly legible through it, and the lit area ends in a soft, bleeding edge — not a diagonal hatch with hard hex borders.
- **Decision:** the Player Preview veil (`#j2-fog-player`) is a flat grey wash (`#707070` at 0.68) with a 4 px hairline grain, blurred by one SVG filter (`#j2-fog-soft`, σ = 6 world px) so the revealed area glows softly into the fog. The blur is the only filter allowed in fog CSS (`tests/journey2-fog.test.js`). The GM view's subtle hatch, the print (no fog at all, PD-028) and the projection are unchanged.
- **Where:** `js/journey2-view.js` (`buildFogLayer`), `css/journey2.css` (`.j2-fogp-*.is-player`, `.j2-fog-veil`).
- **Addendum (2026-10-15):** the printed title, compass and scale lettering are the one exception to "nothing cut out": the veil leaves them clear as plain rectangles (the template's `decorativeAreas` padded by half a hex, overlaps merged into disjoint slabs because the veil is even-odd) instead of the old hex-shaped holes, whose zigzag glow looked ragged around the lettering. The lettering stays unfogged, not re-drawn above the veil.

## PD-064: One overlay behaviour — sticky modal header on every page

- **Status:** Active
- **Date:** 2026-10-14
- **Decision:** Every `.modal-header` (title, tier pills, actions and the close ×) is `position: sticky; top: 0` inside the scrolling overlay, on all routes and widths, instead of a Journey-only floating "close dock" outside the card. The same card no longer behaves differently per route; the × never scrolls out of reach and never hangs outside the card. Backdrop click and Escape still close it as a complement.
- **Where:** `css/styles.css` (`.modal-header`), `js/app.js` (`openDetailOverlay`), `js/soundboard-ui.js` (`position()`).
- **Addendum (2026-10-14):** the detail card's bottom "Add to…" button and the expanded destination dialog (Current Prep row + Lists) are removed: the sticky header always carries the same `[Prep][bookmark]` pair as every catalogue card, with state visible on the icons. The footer is now biome at the start, source at the end (wrapping, left-aligned ≤480px). The bookmark popup stays list-only.

## PD-065: Player page — title and legend live in the panel; Legend is a rail tool

- **Status:** Active
- **Date:** 2026-10-14
- **Why:** the player page's title floated over the map as a chip and its zoom bar hung off the rail with a gap; players (mostly on a phone) also had no key to the map's marks. The page reuses the GM view's own components (design.md: no new panel widths or patterns) and spends no vertical space on a header.
- **Decision:** `.j2-side` stays on `#/map/<link>` as title + one-line purpose (`journey2_about_*_pl`) + a **legend** (party, sanctuary, Shadowblight, collected Echo, unknown ground) + controls hint. A labelled **Legend** tool in the rail (icon `info` — the system's help glyph, key I) folds it; Escape closes it. Desktop: open at load; the zoom bar is the same horizontal bar as the GM view's, right of the legend (amended by the Journey UI unification pass — it was a column under the rail). Phone (≤640px): the bottom bar of labelled tools (Route, Legend), the legend opens above it at map width and starts folded, the map bar keeps only Fit (a pinch zooms). The state is never stored (the page touches no storage).
- **Where:** `js/journey2-view.js` (`buildSurface`, `isPhoneWidth`, `syncSideToggle`, `onToolHotkey`), `css/journey2.css` (`.j2-legend*`, `.j2[data-player]`), `data/i18n.json` (`journey2_rail_legend`, `journey2_legend_*`), `tests/journey2-player-page.test.js`.

- **Addendum (2026-10-14):** the legend's glyphs are the map's own, not look-alikes: the party star and Shadowblight X reuse the map's drawing code and classes' values (`partyStarPath`, halo + ink), the Echo is `ECHO_CRYSTAL` with the map's gradients, "unknown" is the Player Preview veil's grey, and the sanctuary is the printed icon itself — a transparent ink crop of mk-001 from the base map (`img/journey2/legend-sanctuary.webp`). All sit on the same parchment tile as a region card's symbol. If a map glyph changes, change it here too.
- **Addendum 2 (2026-10-14):** players rarely read the book and the GM announces each new hex's biome aloud, so the legend also explains the terrain dots ("Terrain: 1–4 dots, days to cross a hex" — the number behind the route planner's days) and lists, under "Biomes on your map", **only the biomes already on the revealed map** (symbol + name, `renderLegendBiomes`, rebuilt on every preview render and language change; hidden when none; the fully shadowblighted state is named like the rest). No full 12-biome table.
- **Addendum 3 (2026-10-14):** the biome list is two columns of 24px tiles (all twelve fit without scrolling in a ~440px-tall panel); the controls hint is shown only on touch / ≤640px (`.j2-legend-touch`; the mouse variant and its key are gone); the legend scrolls with the Region Inspector's soft edge cue. Biomes stay open by default — folding them would hide what the GM has just announced.
- **Addendum 4 (2026-10-14):** the two Shadowblight states that a picture alone does not explain carry a one-line meaning, always visible (no tooltip: a phone has no hover) — the X ("The habitat has been corrupted by fallen stars.") and the fully shadowblighted biome ("The entire region has been completely overtaken and is nigh impossible to traverse."), which is a full-width entry in the biome list. Russian wording follows the d20 habitat table on daggerheart.ru/frame/journey-to-horizon («искажён павшими звёздами», «весь регион полностью захвачен порчей и пройти через него почти невозможно»).

## PD-066: Journey — a Display menu holds Biome colors, Sepia map and Regions in every view; the link carries the GM's choice as defaults
- **Status:** Active (supersedes the "Biome colors / Sepia / Regions in the GM-only Campaign menu" placement of PD-057, PD-060 and PD-062; their behaviour stands)
- **Date:** 2026-10-15
- **Why:** the three switches change only how the map looks, yet sat in the GM-only Campaign menu beside the whole-campaign actions (Soul Echoes, sanctuaries). That hid them from Player Preview — where the GM judges what players will see — and gave the player page no say at all.
- **Decision (menu):** one rail menu, **Display / Вид** (`data-j2-menu="display"`, the shared `.j2-menu` machinery, a Lucide `sliders-horizontal` icon), holds **Biome colors**, **Sepia map** and **Regions**. It is visible in the GM view, in Player Preview and on the player page (`#/map/<link>`); it sits directly above Campaign (which keeps only Echoes and sanctuaries and stays GM-only). On the phone bottom bar of the player page the menu opens upward. Choosing an item keeps the menu open.
- **Decision (what each controls):** Sepia and Regions are as before (PD-060, PD-062). **Biome colors** now also governs Player Preview and the player page: the preview's projection is built with `{ biomeTint: showBiome }`, so players see the tint exactly when the GM's preview does. The print is unchanged (never tinted, PD-028).
- **Decision (persistence):** the GM view and Player Preview use the stored view preferences (`dhcodex_journey2_ui`: `showBiomeColors`, `sepiaMap`, `regionIcons`), unchanged. The player page still never touches storage: it starts from the link's values and keeps a viewer's change for that page load only (a reload returns to the GM's defaults).
- **Decision (link format 4):** the share format gains two flag bits in the existing flags byte — bit 5 sepia on, bit 6 biome colors on (`snap.sepiaMap`, `snap.biomeColors`, both default on) — so a link costs no extra byte. Version 4 is written; 1–3 are still read, and a link older than 4 reads as sepia on and biome colors on, which is how the page always drew them. Formats 1–4 are frozen.
- **Not decided here:** no stored viewer preference on the player page (a separate key would need its own decision), no new display switches, no change to what the projection reveals — a toggle only changes how already-revealed cells are drawn.
- **Where:** `js/journey2-view.js` (`buildSurface`, `toggleSepia` / `toggleRegions` / `toggleBiomeColors`, `renderTiles`, `copyPlayerLink`, `focusTool`), `js/journey2-share.js`, `css/journey2.css` (`.j2-disp`, the `.j2[data-player] .j2-camp` rules), `data/i18n.json` (`journey2_rail_display`, `journey2_display_aria`), `tests/journey2-controls-panel.test.js`, `tests/journey2-share.test.js`.

## PD-067: Player page — phones are the primary platform; mobile quality is a requirement

- **Status:** Active
- **Date:** 2026-10-15
- **Why:** the GM shares `#/map/<link>` in a chat (PD-052) and most players open it on a phone, usually in portrait, one-handed, mid-session. The GM editor stays desktop-only (PD-048); the player page is the opposite — it is the one Journey surface where mobile is the *first* target, not an afterthought. PD-052's wording "a computer or a tablet" and PD-065's "players (mostly on a phone)" are refined here: the phone is the primary device.
- **Decision:** the player page (`Journey2View` in `playerMode`) must be designed, built and verified **phone-first**. Any change that touches it is checked at 375px and 360px portrait, a short landscape phone, and then tablet and desktop — in English and Russian — before desktop polish. In practice:
  - The page fits the viewport with no sideways scroll and no clipped control; the map gets as much of the screen as possible (panel folded by default on a phone, PD-065).
  - Touch is a complete input, not a fallback: one-finger pan, two-finger pinch, tap to pick, drag pins (PD-052); targets are at least 44px (56px grab for pins) and nothing relies on hover, a right-click, a hotkey or a tooltip (the legend's meanings are always visible, PD-065 addendum 4).
  - Respect the phone chrome: `viewport-fit=cover` safe areas for the bottom tool bar, the dynamic browser toolbar (use `dvh`-style sizing, not a fixed `100vh`), and no page-level scroll or pull-to-refresh fighting the map pan (`touch-action` on the map).
  - Text stays readable at phone size (no sub-12px copy; Russian strings checked for wrap and clipping); overlays and the legend are bottom-anchored and reachable by thumb.
  - Weight and first paint matter on a mobile connection: the link is a fragment (no request), and the page must not load GM-only code paths or heavy assets it does not draw.
  - A new feature on the player page ships with its phone behaviour, or it does not ship there.
- **Not decided here:** a phone version of the GM editor, printing from a link, or an installable / offline player page.
- **Where:** `js/journey2-view.js` (`playerMode`, `isPhoneWidth`), `css/journey2.css` (`.j2[data-player]`, ≤640px rules), `tests/journey2-player-page.test.js`; QA: [docs/manual-qa.md](manual-qa.md) "Shareable player link", sub-list "Phone-first".

## PD-068: The catalogue's filters live in the address, so a filtered view can be shared
- **Status:** Active
- **Date:** 2026-10-15
- **Why:** search, Rank, Type, Biome and Source filters were transient state only. A GM who narrowed the catalogue to "Rank 2, forest" could not send that view to anyone, and a reload or an accidental navigation lost it. Found in exploratory testing; not covered by any earlier decision.
- **Decision (format):** the catalogue route carries them as a hash query: `#/?q=wolf&tier=1&tier=2&type=social&type=region&biome=forest&src=Court%20%26%20Shadow`. Keys: `q` (search, at most 200 characters), `tier` (1–4), `type` (a type id, or `region` for the Region pill), `biome` (a biome id), `src` (the English source name, exactly as in the data). A group repeats its key — never a comma list, because source names contain commas. The language-independent ids are used, so a link opens the same view in RU and EN. The query is canonical (fixed key order, each group sorted, each value encoded once) and omitted when nothing is active, so an unfiltered catalogue stays at `#/`.
- **Decision (open card):** an environment overlay stays a suffix after the query: `#/?tier=1&biome=forest/env/bastion`, so a shared card link reopens on the same filtered catalogue and closing the card returns to it. An encoded `/` can never fake the suffix.
- **Decision (direction of flow):** the address follows the state. A filter change rewrites it with `history.replaceState()` — no history entry, no `hashchange`, and the search is written after its existing debounce. An address that arrives carrying a query (a link, Back/Forward, a pasted address) is adopted into `state.filters`. An address with **no** query leaves the filters as they are, as before — the brand and the ribbons keep them — and the address is then rewritten to show them; "Clear filters" is the way to clear them.
- **Decision (untrusted input):** parsed and built only in `RouteUtils.parseCatalogQuery()` / `buildCatalogQuery()` (the one decoder, PD-spirit of "Hash routing"). Each bad piece (a rank outside 1–4, an undecodable value, an unknown key) is dropped alone; a query over 1000 characters is ignored whole; at most 40 values per group. The app keeps only types and biomes it knows, and the existing `renderToolbar()` pruning drops a source the catalogue does not have — the address is then repaired to match.
- **Not decided here:** Lists (`#/lists/<id>`) keep their transient filters and write nothing to the address; the Prep pickers, the "Show more" count, scroll position and the open filter disclosure are not part of the address; no new setting or UI.
- **Where:** `js/route-utils.js` (`parseCatalogQuery`, `buildCatalogQuery`, `baseHash`, `parseRouteHash`), `js/app.js` (`adoptRouteFilters`, `syncFiltersToUrl`, `sameBase`, the `hashchange` handler, `renderGrid`), `tests/routing.test.js`.

## PD-069: Player page — a viewer can hide the party marker from the Display menu

- **Status:** Active (implemented 2026-10-16). Extends PD-066 (Display menu) and PD-052 (shareable player link); touches PD-045 only in what the player page draws.
- **Why:** the star is drawn above every other symbol (PD-045), so on a phone it can cover a sanctuary icon, an X or an Echo crystal that the player wants to read.
- **Decision:** a fourth Display item, **Party marker / Маркер отряда**, exists **on the player page only** (hidden in the GM view and Player Preview, where the rail's own Party tool does this job). It hides or shows the drawn star. It is on by default, so a link looks exactly as before.
- **Decision (what it does not do):** the seven lit cells stay revealed — they are already in the snapshot and hiding the star never closes the map. Route Planner point A still follows the projection's party, not the star's visibility.
- **Decision (persistence):** a display switch for this page load only: no storage, no link flag (format 4 stays frozen), a reload returns to shown. The GM chooses whether the party is in the link by hiding the marker in Player Preview before copying it.
- **Where:** `js/journey2-view.js` (`showPartyMark`, `togglePartyMark`, `paintPartyMarker`, `updateFogUi`), `data/i18n.json` (`journey2_party_mark_*`), `tests/journey2-controls-panel.test.js`.

## PD-070: Journey — destroyed sanctuaries (five printed sanctuaries burnt out), visible to players on revealed hexes and in print

- **Status:** Active (implemented 2026-10-16). Sits beside PD-022 (Soul Echoes: same "one button, random, GM campaign data" shape) but differs on the player side; extends PD-023 (a destroyed sanctuary may still have a generated settlement), PD-027 (its name can still be revealed by hand), PD-028 (the print keeps it) and PD-052 (the link grows to format 5).
- **Why:** the campaign's Old Valloren may have lost some of its refuges; the GM wants a few of the 56 printed sanctuary icons to read as burnt-out ruins the party finds, without changing the printed icon.
- **Decision (what it is):** `doc.destroyedSanctuaries = { anchorIds: [...] }` — at most **five** distinct `kind: "sanctuary"` stable ids (never Marrogate / Horizon), sorted. Optional with a default (missing = none, `schemaVersion` stays 1; a backup *with* the field is rejected by an older build as an unknown field). It is independent of generated settlements (`doc.sanctuaries`), needs none, and uses no new storage key.
- **Decision (never both):** a sanctuary that holds a Soul Echo can never be destroyed and the reverse. The model enforces it both ways — the validator rejects a document with an overlap, `setDestroyedSanctuaries` refuses an Echo id (`destroyed-with-echo`) and `setSoulEchoes` refuses a destroyed id (`echo-on-destroyed`). The two planners cooperate: `planSoulEchoes(ctx, rng, exclude)` cuts its nine west-to-east bands from the sanctuaries that are not destroyed, `planDestroyedSanctuaries(ctx, rng, exclude)` draws from those without an Echo. Each button leaves the other set untouched.
- **Decision (how it is placed):** one button in the Campaign menu's third group, **Generate 5 destroyed sanctuaries / Создать 5 уничтоженных убежищ**, and **Remove destroyed / Убрать уничтоженные**. Five is a constant (no number to choose) and there is no manual "destroy / restore" on a single sanctuary. Unlike the Echoes the five are a plain random draw with a minimum separation (16 % of the sanctuaries' bounding-box diagonal, bounded retries, best attempt wins) — ruin is not "evenly spread west to east". One command = one Undo entry, Redo never re-rolls; replacing asks first (Cancel focused), removing asks first.
- **Decision (look):** every destroyed sanctuary on the screen map (GM view, Player Preview, player page) is the procedural canvas effect of `js/journey2-ruin-fx.js` (see the V2–V4 entries below; rolled out to all ruins 2026-10-16): fire on the printed icon (the icon is never touched) — one tall blaze by the central tower, lower, uneven pockets that now and then die down and flare up, dark gaps between them — and a smoke plume the wind carries up and to the right over the two neighbouring hexes; fixed map colours; one still frame under `prefers-reduced-motion`. The original CSS-animated SVG look (flickering tongues, embers, wisps) is retired on screen; its still black-and-white drawing remains the print (below) and the on-screen fallback where canvas is missing, and the legend swatch keeps the static gradient tongues. The layer `data-j2-g="ruins"` sits above the fog (like the Echoes), is pointer-transparent and `aria-hidden`.
- **Prototype V2 (2026-10-16, approved; history):** the SVG-blob look (V1 and the first prototype) was retired as a technique: stacked translucent shapes can only read as separate balloons. The prototype ruin now renders a per-pixel **smoke density field** and a small fire on two Canvas 2D textures (`js/journey2-ruin-fx.js`, pure core + one throttled shared rAF loop, off-screen instances skipped, a single still frame under `prefers-reduced-motion`): domain-warped fractal noise advected up and right over time, a widening drifting envelope that merges three chimney sources, charcoal base to warm grey aloft, ragged top, volumetric self-shading, fire underlight on the smoke; flame tongues with noise-eroded silhouettes, a deep red castle glow, flickering window combustion points, rare embers. Procedural only (no assets, no services); the canvases sit in pointer-transparent `foreignObject`s inside the same icon-centred group, so map space, camera, fog, visibility and clicks are untouched. `RUIN_V2_COUNT = 1` still limits it to the FIRST ruin of the screen layer for comparison; the print and the legend never use it; without canvas the old SVG ruin is drawn. On approval: set the count to all, retire the old tongues/puffs on screen, keep the print drawing.
- **Decision (who sees it):** the GM view shows all five always. **Player Preview and the player page show a destroyed sanctuary only while its own hex is revealed** (hand-revealed or lit by the party marker — fog wins; how many exist is never emitted): the projection's `destroyedSanctuaries` is the only source, so the layer is rebuilt, not CSS-hidden. The legend's "Destroyed sanctuary" line exists only while one can be seen, so it never says such places exist. The overlay of a destroyed sanctuary with a generated settlement carries a small GM-only "Destroyed" note; the name-reveal button still works (a revealed name reads as the ruin's name).
- **Decision (print):** the black-and-white print **keeps** the revealed destroyed sanctuaries (the print projection blanks only Echoes): static white tongues with a fine black outline and core, and a wavy dashed smoke strand, drawn before the labels; hidden ones are absent like every hidden thing in the print. A ruin is on every page its glyph box touches (`ruins: [{ id, x, y }]` in the print model; the page clips it).
- **Decision (link):** format **5** appends `varint count + sanctuary indexes` (at most five, distinct, never an Echo sanctuary) after the Echoes; formats 1–4 still read (no ruins), a version-4 reader never sees a 5. The snapshot carries only the revealed ones, so a link never reveals a hidden ruin or the count.
- **Explicitly excluded:** a chosen count, manual per-sanctuary toggles, a mechanical effect (it is narrative only — the sanctuary hex is still "known" for the Route Planner), a toggle to hide the flame on the player page, Marrogate / Horizon, and showing a destroyed sanctuary on a hex the players have not revealed.
- **Where:** `js/journey2-model.js` (`validateDestroyedSanctuaries`, `planDestroyedSanctuaries`, `setDestroyedSanctuaries`), `js/journey2-projection.js` (`destroyedSanctuariesOf`), `js/journey2-share.js` (format 5), `js/journey2-print.js` (`ruins`), `js/journey2-view.js` (`ruinMarkup`, `renderRuins`, `placeDestroyedSanctuaries`), `css/journey2.css` (`.j2-ruin*`), `data/i18n.json` (`journey2_*ruin*`), `tests/journey2-destroyed-sanctuaries.test.js`.
- **Prototype V3 fire (2026-10-16):** smoke V2 approved and untouched. Thin horizontal orange strokes came from the old fire pass: in the band just above a tongue's tip the vertical factor (1 − v^1.35) and the width factor (1 − u²) were both negative and multiplied to a positive heat across the whole bed width — a bug, not a compositing/texture effect (smoke-only and fire-only renders isolated it). The fire is now several tapering tongues per pocket in the castle's openings (gaps between the legs, arch, tower window, dome crack), bent by advected noise and eroded by fast fine noise toward the tip, deep red → dark orange → amber with a very small hot yellow-orange core, bounded local glow; every term is clamped before multiplication (regression test). Embers, smoke and underlight unchanged.
- **Prototype V4 fire — procedural with level of detail (2026-10-16):** V3 failed at map scale for measured reasons: at 100 % its whole fire was ~55 CSS px² of solid flame split over seven 2–5 px pockets, its noise drew sub-pixel detail (aliased into shimmer by a 3.3× canvas downsample) and its colours were darker than the parchment (median luminance 0.14 against ~0.80), so it read as orange specks, not light. V4 is designed for the map at 100 % (1 unit = 1.2 CSS px), not for a close-up: five large flame clusters placed on the castle itself — a blaze rising out of the gap between the buildings to the tower's height, the domed hall burning between its legs, flames climbing the tower's right side, at the hall's left wall and in the arch — each a burning bed plus a few tongues UNITED into one connected mass (broad merging foot, snaking noise-bent axis, sharp torn tips, ragged foot line), plus one very hot window. Shape (opacity) and temperature (colour) are separate: a dark saturated red rim separates the silhouette from the paper and a hot amber-to-yellow core sits low on the axis (≈ 600 CSS px² of solid flame at 100 %, about a third of it lighter than L 0.5). **Level of detail** follows the real on-screen size (`lodOf`, CSS px per unit): at 100 % and below the tongues are wider and barely eroded and no noise feature is smaller than about two screen pixels; from ~135 % the contours get finer, the tips tear and two detail flames (through the dome, off the tower roof) fade in, fully from ~225 %. The fire canvas is re-sized to the device pixels it covers (`firePpu`, 2–6 px/unit; a zoomed-in fire draws at 15 fps). The flames are now drawn **in front of** their smoke (its dark base is what makes them glow); the smoke itself is byte-for-byte V2. On-screen culling and the scale come from the ruin group's `getScreenCTM()` — `getBoundingClientRect()` inside the camera-scaled SVG ignores the camera's CSS scale in Chromium, which had silently frozen the V2/V3 prototype at most camera positions. V3's clamp-before-multiply rule and its stroke regression test stay (now at four scales).
- **V4 fire distribution (2026-10-16):** V4 is the approved visual base (algorithm, colours, animation, smoke and effect size unchanged); only the distribution was corrected so it no longer reads as a continuous wall of fire. One tall blaze by the central tower (unchanged: same height, ~234 CSS px² at 100 %); lower, uneven pockets to its left and right (inside the hall, at its left wall, in the arch, up the tower side) with the castle's dark ink showing between them. Measured at 100 % on a DPR-2 screen, averaged over time: solid flame 606 → ~474 CSS px² (−22 %), the secondary pockets 372 → ~240 (−35 %), separate masses 3 → ~6. Each FLAMES entry now carries its own bed and a `breathe` amplitude: every secondary pocket, on its own slow noise clock, now and then dies down to a small ember (same heat and colour, lower and narrower) for a few seconds and flares up again — roughly 10–20 % of the time each, never in step; the blaze never does.
- **Rollout (2026-10-16):** V4 (with the corrected distribution) is approved and drawn on every destroyed sanctuary the viewer may see; `RUIN_V2_COUNT` and the old screen tongues/puffs/embers and their CSS animation are gone; the print drawing is unchanged. To keep five live ruins cheap, both canvases follow the device pixels they cover: the smoke keeps its designed 2 px/unit wherever it covers ≥ 1 device px per unit (≈ 85 % and up on any screen — byte-identical there) and drops to 1 or 0.5 only on a zoomed-out map; the fire rounds its resolution up (0.5–6 px/unit). Off-screen ruins are not drawn; Player Preview no longer rebuilds the canvases while its visible set is unchanged. Measured in Chromium on a DPR-2 120 Hz screen: Fit (all five visible, 22 %) and 50 % keep a steady 8.3 ms frame (p95 ≤ 9.2 ms), no long tasks.
