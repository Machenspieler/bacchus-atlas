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
  with no supported adversary the action is absent. All-supported and
  no-adversary environments are unchanged. Group links ("Beasts", a family)
  export their supported members and are plain text when none remain.
- **How to apply:** ask `FreshCutGrassUtils.isFreshCutGrassSupported()` and
  build URLs only through `buildFreshCutGrassEncounterUrl()` in `js/app.js`
  (which gates through `buildSupportedEncounterUrl()`); never add a second
  allowlist or an `if (source === …)` check. Supported names are sent under
  the catalogue spelling. Making an adversary linkable means adding it to
  `data/prep.json`.
