# Manual QA checklist

Automated tests and `scripts/validate-data.js` verify logic and data shape —
neither verifies that a UI change actually looks and behaves correctly (see
[.claude/rules/ui.md](../.claude/rules/ui.md)). Use this checklist after a
UI-facing change; treat it as an executable list, not a design essay. Check
only the rows relevant to what changed — you don't need every row for every
change, but don't skip a row that's clearly in scope.

Start the site locally (`preview_start`, or see README.md "Running
locally") before starting.

## Header

- [ ] Expanded state (every route except Session Prep): title, subtitle,
      compatibility label, nav links all visible and correctly ordered.
- [ ] Session Prep's collapsed chrome: toggling it visibly and meaningfully
      shrinks the header — not just a cosmetic tweak. Toggle back to
      expanded and confirm it restores exactly.

## Navigation

- [ ] Desktop: all header nav links (Lists, Session Prep, Journey, RU/EN)
      reachable by mouse and by keyboard (Tab + Enter), visible focus ring
      on each.
- [ ] Mobile width: nav still reachable, no overlap/clipping.

## Catalog

- [ ] Loading: skeleton shell shows before data arrives, no environment
      data visible.
- [ ] Populated: cards render, filters/search work, tier/type/biome/source
      filters combine correctly.
- [ ] Empty result: a search/filter combination with zero matches shows the
      empty state, not a blank grid.
- [ ] Failed load: simulate a data fetch failure (e.g. block
      `data/environments.json` in the network panel) and confirm
      `renderLoadError()`'s retry path works.

## Environment overlay

- [ ] An environment with `lore`, `source`, `biomes`, `featured_adversaries`,
      and `story_seeds` all present — every section renders in the right
      order.
- [ ] An environment missing all of the above optional fields — no broken
      layout, no placeholder text where a section is simply absent.
- [ ] Dice buttons, Fear-cost emphasis, and condition-name emphasis render
      and the dice buttons roll correctly.

## Lists

- [ ] Empty state (no lists yet).
- [ ] Populated: cover art, environment counts, open/delete controls work.
- [ ] Rename: valid rename persists; empty/whitespace-only input restores
      the previous name and shows the inline error; Escape cancels without
      persisting.
- [ ] Simulated storage failure on a valid rename: change stays in memory,
      `storage_write_failed_warning` toast shows instead of a success toast.

## Session Prep

- [ ] Empty (no selections yet): all three counters read zero, no stray
      "selected" styling anywhere.
- [ ] Partial (one or two environments, some adversaries/items selected).
- [ ] Populated (three environments — the cap — plus several
      adversaries/items).
- [ ] Long labels: a long environment/adversary/item name doesn't break the
      card layout in either language.
- [ ] **Multiple selected environments, no primary state**: select two or
      three environments and confirm nothing in the UI marks one as
      primary/default/main — no star, no "Make primary" control, no visual
      distinction beyond the shared `is-selected` styling. See
      [docs/product-decisions.md](product-decisions.md) PD-001.
- [ ] **Items are selected/unselected only, no quantity UI**: select the
      same item, confirm there's no stepper/+/-/quantity badge anywhere,
      and the "Selected: {n}" counter only ever increases by one per unique
      item. See PD-002.
- [ ] Three-environment cap: at the cap, unselected checkboxes disable, the
      persistent "Limit reached" status appears, and removing one
      re-enables the rest without losing search text/scroll position.
- [ ] Header chrome collapse/expand (see "Header" above) from within
      Session Prep specifically.
- [ ] **Adversary catalogue reports 264**: the "All Adversaries" count reads
      264 of 264 with no filters active, and hides first (not the search
      field or Tier/Type controls) as the adversary column narrows.
- [ ] **Adversary compact toolbar**: search field, four Tier buttons, and
      the Type dropdown all fit one row at 1920×1080/1440×900/1366×768/
      1280×800; no visible heading, no "Selected only", no standalone
      "Clear filters" button remain.
- [ ] **Adversary Tier/Type filters**: Tier values OR together, Type values
      OR together, Tier and Type AND together with each other and with the
      search text. The Type dropdown's own "Clear types" action appears
      only once a Type is selected, doesn't close the dropdown, and a Tier
      click keeps keyboard focus on the same Tier button.
- [ ] **Adversary smart search**: an English name fragment, a Russian name
      fragment, `tier 2`/`tier2`/`t2`/`тир 2`/`тир2`, a bare `2`, an English
      Type (`solo`), a Russian Type (`одиночка`), and a combined query
      (`tier 2 solo` / `тир 2 одиночка`) each return the expected adversaries
      regardless of the active UI language.
- [ ] **Adversary row action zones**: the checkbox toggles selection only;
      an adversary with local art shows a thumbnail *button* that opens the
      art overlay without changing selection; an adversary without art
      shows the plain fallback icon (never clickable); clicking the name/
      meta text opens that adversary's own FreshCutGrass encounter in a new
      tab (canonical English name, even in the Russian UI) without changing
      selection.
- [ ] **Adversary art overlay**: opens on thumbnail click, shows only the
      large image and the adversary's name (no stat block); the full image
      is not requested until the overlay opens (check the network panel);
      Escape/backdrop/close button all dismiss it; focus returns to the
      thumbnail button that opened it; an adversary sharing group art with
      others (e.g. the four Darkweave adversaries) shows the same image for
      each.
- [ ] **FreshCutGrass export**: "Open in FreshCutGrass" is absent with zero
      adversaries selected, appears the moment one is selected, opens in a
      new tab, and its accessible label/tooltip announces the destination
      and adversary count. Decode the link's payload and confirm it uses
      `name.en` (never the Russian label) at `q: 1`, with no environment or
      item data included.
- [ ] **Item Category/Source controls**: Items/Consumables each report 120;
      Core/Hope & Fear/All sources narrow correctly; switching category or
      source never clears an existing item selection.
- [ ] A selected adversary/item's Tier/Type/source meta line in both the
      picker row and the central selected list.

## Language

- [ ] English: full pass over whatever changed.
- [ ] Russian: full pass over whatever changed.
- [ ] A long Russian string (a long environment/list/session name) doesn't
      clip or overflow.
- [ ] Fallback behavior: a key or field missing in one language falls back
      to English rather than rendering blank.

## Accessibility

- [ ] Full keyboard navigation through whatever changed (Tab, Shift+Tab,
      Enter, Escape where applicable) — no mouse-only interaction.
- [ ] Visible focus ring (`:focus-visible`) on every interactive element
      touched by the change.
- [ ] Every interactive control has an accessible name (inspect with
      `preview_snapshot`, not just a screenshot).

## Viewport sizes

Use these for routine checks (see design.md's breakpoint table for exactly
what changes at each):

- [ ] Desktop (≥1200px)
- [ ] Narrow desktop / tablet (~641–1199px)
- [ ] Mobile (≤640px, and again at ≤480px if the change touches a control
      with a breakpoint there)
