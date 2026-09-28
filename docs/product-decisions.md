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
