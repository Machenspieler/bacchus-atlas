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

## PD-001: Session Prep environments have no primary state

- **Status:** Active
- **Date:** 2026-09-28
- **Decision:** Selected environments in Session Prep (`#/session-prep`) are
  an unordered-in-meaning collection of selections. No environment is ever
  "the" primary, main, or default one.
- **Implications:**
  - Selected environments are stored as a plain array of ids
    (`session.environmentIds` in `data/session-prep` schema v2) with no
    primary-id field alongside it.
  - Selection order may still exist for presentation (the order a GM picked
    things in) but must never be read as priority, importance, or a default
    choice.
  - The interface exposes exactly one control per environment — the
    selection checkbox (`.prep-select-checkbox`) — and never a "Make
    primary" action, star, or promotion affordance.
  - The three-environment cap (`SessionPrepUtils.toggleEnvironment()`) is the
    only limit Session Prep enforces on environment selection; there is no
    promotion logic when an environment is added, removed, or reordered.
  - Loaders and validators must treat a legacy `primaryEnvironmentId` field
    as dead data: `js/safe-storage.js`'s v1 → v2 migration
    (`migrateSessionPrepSessionV1ToV2()`) drops it silently rather than
    erroring or trying to preserve it as a hint.
- **Explicitly excluded:** `primaryEnvironmentId`, "primary environment",
  "main environment", first-selected-becomes-primary behavior, a "Make
  primary" control, and any rendering that visually distinguishes one
  selected environment from the others as more important.
- **Supersedes:** Schema v1 (`data/session-prep` local storage, pre this
  decision) carried `primaryEnvironmentId` on a session. That field, and any
  UI that read or set it, no longer exists in the shipped product; only the
  migration path in `js/safe-storage.js` still references it, to consume and
  discard it safely from old browser storage.

## PD-002: Session Prep items have no quantity

- **Status:** Active
- **Date:** 2026-09-28
- **Decision:** A Session Prep item selection is binary — selected or not
  selected. There is no concept of "how many" of an item is prepared.
- **Implications:**
  - Selected items are stored as a deduplicated array of ids
    (`session.itemIds`), never as `{ id, quantity }` pairs.
  - Selecting an already-selected item is a no-op with respect to count —
    `SessionPrepUtils.toggleId()` adds an id at most once and `.length` is
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
  app outside Session Prep's own item selections — those are unaffected by
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

## PD-005: Session Prep's adversary catalogue is full-SRD, picker-metadata-only

- **Status:** Active
- **Date:** 2026-09-28 (art schema amended 2026-09-29 — see below)
- **Decision:** Session Prep's adversary picker (`data/session-prep.json`'s
  `adversaries` array) covers all 264 adversaries in the official Daggerheart
  SRD 2.0, each carrying only picker metadata — id, English/Russian name,
  Tier (1-4), official Adversary Type (one of ten fixed keys: bruiser,
  horde, leader, minion, ranged, skulk, social, solo, standard, support),
  and optional local artwork (`art: { thumb, full }`, both pre-generated
  WebP derivatives — see `scripts/generate-adversary-art.js` and
  "Session Prep's compact 'All Adversaries' toolbar" in
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
    `SESSION_PREP_ADVERSARY_FORBIDDEN_KEYS`).
  - The 17 adversary ids from the original MVP
    (`SESSION_PREP_MVP_IDS`/`scripts/validate-data.js`) are permanent and
    must never be renamed or removed — a GM's already-saved Session Prep
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
  - `scripts/import-session-prep-adversaries.js` is the one-time,
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
- **Supersedes:** the original Session Prep MVP's 17-adversary hand-picked
  subset (no Tier/Type fields at all) — see git history predating this
  decision for that shape.

## PD-006: Session Prep's item catalogue is the full 240-entry loot table

- **Status:** Active
- **Date:** 2026-09-28
- **Decision:** Session Prep's item picker (`data/session-prep.json`'s
  `items` array) references exactly 240 ids: `ci1`-`ci60` (Core Items),
  `cc1`-`cc60` (Core Consumables), `hi1`-`hi60` (Hope & Fear Items),
  `hc1`-`hc60` (Hope & Fear Consumables) — the Daggerheart Loot Generator's
  complete roll-table loot, not just the original MVP's `ci1`-`ci10`
  subset. The full metadata for every one of these ids is merged into the
  shared `data/items.json` catalogue (which keeps its other, non-Session-
  Prep entries — aliases, environment-linked items — unchanged);
  `session-prep.json` itself still only ever stores the ordered id list.
- **Implications:**
  - `scripts/validate-data.js` hard-fails the build if the array isn't
    exactly 240 entries, or if any of the four prefix groups is missing a
    roll number 1-60 or has one outside that range.
  - Session Prep's item picker gained a Category toggle (Items/
    Consumables) and a Source toggle (All/Core/Hope & Fear), each
    combining with the existing name-or-exact-roll-number search — see
    `SessionPrepUtils.filterItems()`.
  - The `ci1`-`ci10` ids from the original MVP resolve exactly as before
    (same metadata, unchanged) — nothing about them was touched by this
    expansion.
- **Explicitly excluded:** item quantities (still PD-002), a second
  storage key or duplicated item metadata inside `session-prep.json`.
- **Supersedes:** the original Session Prep MVP's `ci1`-`ci10` subset.
