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

- [ ] Expanded state (every route except Prep): title, subtitle,
      compatibility label, nav links all visible and correctly ordered.
- [ ] Prep's collapsed chrome: toggling it visibly and meaningfully
      shrinks the header — not just a cosmetic tweak. Toggle back to
      expanded and confirm it restores exactly.

## Navigation

- [ ] Desktop: all header nav links (Lists, Prep, Journey, RU/EN)
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

## Prep

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
      central Environments count shows a gold "3/3" pill (tooltip "Maximum
      limit reached" / «Достигнут максимальный лимит»; no permanent text
      line), and removing one re-enables the rest without losing search
      text/scroll position.
- [ ] **Central selected-content panel** (see docs/architecture.md "Prep
      Prep's central selected-content panel"): at ~1536×760 with 3
      environments, 3 adversaries and 4 items the panel fits with no
      vertical scrollbar; with many items only the panel scrolls (no nested
      scrollbars, cards keep their height); a long name clamps to two lines
      (one line for adversaries) and shows its full text as a tooltip; the
      empty state is one short line per section; every remove button is a
      32×32 button with a localized name («Удалить окружение «…»») and a
      visible keyboard focus ring; RU/EN both hold at 1536, 1280 and 900.
- [ ] **Central comfortable density** (`min-width: 1800px` and
      `min-height: 900px`): at 1920×1080 the central cards, thumbnails,
      headings and remove buttons are visibly (~8–12%) larger than at
      1536×864, with 3 environment cards still on one row and adversaries/
      items still in two columns; the Battle Points group keeps its label and
      one line; only the centre changes — the left/right pickers and the
      Items strip are pixel-identical between the two sizes. Check the edge
      of the query too: 1799×900 and 1800×899 stay compact, 1800×900 and
      1920×950 are comfortable, with no horizontal scrollbar at any of them.
- [ ] **Selected-adversary grid**: 4+ selected adversaries form a two-column
      grid at 1536 and 1440 (central panel ≥528px) and fall back to one column
      at 1280; tiles stay 48px tall, a long name/meta ellipsizes with the ↗
      right after it and never touches the ×, the full name shows as a
      tooltip, and there is no horizontal overflow at 1536/1440/1280.
- [ ] **Selection cell**: Environments, Adversaries and compact Items rows all
      show 4px padding → 20px checkbox column (18px box, centred, ~28×32 click
      area via an overlay) → 4px gap →
      thumbnail (44px area on touch/phone); the whole 32px area toggles;
      selecting/unselecting never shifts the text; disabled boxes (env cap)
      keep their state.
- [ ] **Central panel interaction zones**: clicking anywhere on an
      environment or item card (thumbnail, text, empty space) opens the same
      overlay as the catalog and Escape returns focus to that card; the ×
      removes without opening anything. An adversary thumbnail opens the art
      overlay only; its name/meta link opens FreshCutGrass in a new tab (Cmd/
      Ctrl-click and middle-click work) without opening the overlay; × removes
      only that adversary. A fallback-image adversary has no thumbnail button.
      Tab order per adversary: image → link → ×; every stop shows a focus
      ring; Enter/Space work on the buttons; tooltips and labels in both RU
      and EN; no layout shift on hover/focus; long names clamp.
- [ ] Header chrome collapse/expand (see "Header" above) from within
      Prep specifically — the Prep Bar hides in compact mode and
      returns in expanded mode.
- [ ] **Prep Bar**: the active prep name appears once (no separate
      title field or select); at 2048/1440/768/390px the bar is one compact
      block (~80–90px, two rows on phones) aligned with the columns below,
      with no horizontal overflow, in both languages and with a very long
      prep name (truncates with ellipsis + full-name tooltip).
- [ ] **Prep Bar menus**: the title opens the prep menu (current
      prep checked; scrolls past ~340px; stays inside the viewport);
      the ⋯ button opens Rename/Duplicate/Delete. Only one is open at a
      time; outside click and Escape close them and Escape returns focus to
      the trigger; Arrow/Home/End move through items.
- [ ] **Prep rename**: menu "Rename" (no pencil beside the title) starts the inline
      input (text selected, no layout shift); Enter/blur saves (trimmed),
      Escape cancels, an empty name restores the previous one.
- [ ] **Prep delete**: Delete opens a dialog naming the prep with
      Cancel focused; Escape/Cancel leave data untouched; Delete removes only
      that prep; with one prep left, Delete is disabled with a hint.
- [ ] **Save status**: directly under the title; "Saved locally · HH:MM" after
      an edit, and the failure wording (with the storage-failure toast) when
      the browser blocks writes.
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
- [ ] **FreshCutGrass export**: the central "FreshCutGrass ↗" link is absent with
      zero adversaries selected, appears the moment one is selected, opens
      in a new tab, and its accessible label/tooltip announces the
      destination ("Open selected adversaries in FreshCutGrass in a new
      tab"). Decode the link's payload and confirm it uses
      `name.en` (never the Russian label) at `q: 1`, with no environment or
      item data included.
- [ ] **Items compact toolbar**: Type buttons (Items/Consumables), Source
      buttons (Core/Hope & Fear), search, five dice buttons, and the
      Gallery/Compact switch all fit one row at 1920×1080/1440×900/
      1366×768/1280×800; a subtle vertical separator sits at least between
      the Type and Source groups; the counter (and only the counter) hides
      first as the panel narrows.
- [ ] **Item Type/Source multiselect**: Items/Consumables each report 120
      and never change when Source/search/a roll is applied; neither
      pressed shows both Kinds, one pressed restricts, both pressed shows
      both again — identical behavior for Core/Hope & Fear; Type and
      Source AND together and with the search text; switching either never
      clears an existing item selection.
- [ ] **Item smart search**: a partial English name, a partial Russian
      name, an English Kind alias (`item`/`items`), a Russian Kind alias
      (`предмет`/`предметы`/`расходник`/`расходники`), a Source alias
      (`core`/`hope and fear`/`hope & fear`, and the bare word `hope`),
      exact `30`, exact `#30`, inclusive range `1-10` (and `1–10`/`1—10`/
      `1 - 10`/`#1-10`/the reversed `10-1`), and combined queries (`core
      consumable 1-10`, `hope item #30`, `расходник 20-30`) each return the
      expected records regardless of the active UI language; a malformed
      numeric query (`1-`, `abc-def`) never throws or breaks the toolbar.
- [ ] **Item dice roll-and-filter buttons**: each of 1d12-5d12 rolls the
      right number of dice, immediately filters to the resulting item
      number (ANDed with any active Type/Source/search), and temporarily
      shows the rolled number in place of its own label for ~1.2s before
      reverting — the roll filter stays active after reverting, the search
      field is never written to, and the button is never disabled.
      Clicking the same button rerolls; clicking a different button while
      one is still showing its number moves the transient number and
      restores the first button immediately; rapid repeated clicks always
      show the newest result. Each button's tooltip (hover and keyboard
      focus) shows the correct rarity guidance for its dice count, plus a
      "Last roll: N" line once it holds the active filter, and stays inside
      the viewport in both languages.
- [ ] **Item clear-all control**: a separate square [×] button right after
      the search field (not inside it), enabled whenever
      search/Type/Source/a roll is active; it stays on screen, disabled, when nothing is active,
      so the search field never resizes. Clicking it resets all four
      (search text, both multiselects, the roll filter, any pending
      reveal) but leaves the current Gallery/Compact view untouched.
- [ ] **Item strip doesn't jump while filtering** (both views): typing a
      search that leaves 1 / a few / zero results keeps the panel's height
      (scrollbar space is always reserved, Compact keeps two rows, "no
      results" takes a tile's height), the tiles don't slide sideways when
      the prev/next arrows stop being needed, and the toolbar counter stays
      one width.
- [ ] **Item Gallery view** (default): unchanged from before this
      redesign — same large art tiles, hover/selection/click behavior.
- [ ] **Item Compact view**: two-line records (thumbnail, name, "Item ·
      Core · #1"-style meta with the item number always visible even when
      a long Russian name/source combination truncates the rest); flows
      into exactly two horizontal rows with native scrolling and no nested
      vertical scrollbar; clicking a compact record opens the same detail
      overlay as its gallery card; a long name still exposes its full text
      via hover/focus (native `title`).
- [ ] A selected adversary/item's Tier/Type/source meta line in both the
      picker row and the central selected list.

## Language

- [ ] English: full pass over whatever changed.
- [ ] Russian: full pass over whatever changed.
- [ ] A long Russian string (a long environment/list/prep name) doesn't
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
