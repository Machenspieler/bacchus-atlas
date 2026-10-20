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

- [ ] The header is the same 45px bar on every route (Catalog, Lists, Prep,
      Journey): measure it, and check nothing jumps when switching routes.
- [ ] Four bookmark ribbons in the order Catalog, Lists, Prep, Journey; the
      current page's ribbon is longer and fully bright, and carries
      `aria-current="page"`; the Catalog ribbon is current on the home page.
- [ ] Ribbon states: hover on an inactive ribbon lengthens it, the current page
      lengthens again on hover, the label slides down with the ribbon edge;
      switching page drops the new ribbon in with one swing. With
      "reduce motion" on, nothing animates.
- [ ] The footer holds "Daggerheart™ Compatible" (Catalog, Lists); Prep and
      Journey show no such line (decision, PD-047).

## Navigation

- [ ] Desktop: all header nav ribbons (Catalog, Lists, Prep, Journey) and RU/EN
      reachable by mouse and by keyboard (Tab + Enter), visible focus ring
      on each.
- [ ] Mobile width (375px): the ribbons keep their icons, the title is hidden,
      no horizontal scroll, and the first filter row is not covered.

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

- [ ] Header: the Prep action and the bookmark sit beside the title (Prep
      action first), level with the title's first line; a long name wraps
      without the buttons detaching or touching the tier pills / ×.
- [ ] Header Prep action matches the card's state, and toggling it updates
      the card behind (and, when opened above `#/prep`, the central
      Environments list, its count, and the picker checkbox).
- [ ] Bottom button reads "Add to…" / "Добавить в…" and opens the expanded
      dialog (see "Add to… dialog" below).

## Environment quick actions (catalog and Lists cards) — RU and EN

- [ ] Every real card shows [Prep action][bookmark], bookmark at the far
      right and closer to the corner than before; the Random Environment card
      has neither.
- [ ] Long names (RU especially) never run under the buttons, on one-line and
      two-line titles.
- [ ] Clicking the Prep action does not open the overlay; clicking the
      bookmark opens the list popup; a click exactly between the two icons
      hits neither (the boxes are adjacent, not overlapping) — sweep the
      pointer across the pair.
- [ ] Available: muted symbol + plus badge, `aria-pressed="false"`, tooltip
      "Add to current Prep" / "Добавить в текущую подготовку".
- [ ] Selected: gold symbol + check badge (no frame at rest; frame on hover only),
      `aria-pressed="true"`, tooltip "Remove from current Prep" /
      "Убрать из текущей подготовки" — still clickable at 3/3.
- [ ] Full (3/3, not selected): dimmed, plus badge kept, no hover response,
      not-allowed cursor, `aria-disabled="true"`, focusable with the reason
      as tooltip ("… уже выбрано 3 из 3 окружений"); clicking does nothing
      and changes no state. Removing one selected environment re-enables all
      the others immediately, with no catalog re-render (scroll and focus
      unchanged).
- [ ] Toasts name the environment and the Prep's display title
      (untitled Prep → "Untitled"/"Без названия"); a simulated storage
      failure shows the storage warning and **no** success toast.
- [ ] Reload keeps the Prep membership.

## Environment card footer

- [ ] Biome chips at the start, source at the end of one row; a long source or
      several biomes wrap without squeezing each other; ≤480px both are
      left-aligned, the source under the biome. No "Add to…" button — the
      Prep and bookmark icons in the sticky header are the only entry points.
- [ ] The bookmark popup is list-only and closes itself after adding.

## Lists

- [ ] The "Add to list" popup closes on Back/Forward or any route change; it never stays over another route.
- [ ] Empty state (no lists yet).
- [ ] Populated: cover art, environment counts, open/delete controls work.
- [ ] Delete opens an in-site alertdialog naming the list (Cancel focused, Esc/backdrop cancel, no native confirm); confirming removes the list and its memberships.
- [ ] Rename: valid rename persists; empty/whitespace-only input restores
      the previous name and shows the inline error; Escape cancels without
      persisting.
- [ ] Simulated storage failure on a valid rename: change stays in memory,
      `storage_write_failed_warning` toast shows instead of a success toast.

## Prep

- [ ] Empty (no selections yet): all three counters read zero, no stray
      "selected" styling anywhere.
- [ ] Partial (one or two environments, some adversaries/items selected).
- [ ] The central Environments heading shows the neutral SVG symbol (gold, no
      plus/check); the Adversaries and Items icons are unchanged.
- [ ] Opening an environment overlay from Prep and removing/adding it via the
      header action updates the central list, the count, the picker checkbox
      and every other picker row's disabled state behind it.
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
      at 1280; tiles stay 48px tall, a long name/meta ellipsizes with the external-link icon
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
- [ ] Session control in the header (between brand and ribbons, never after the
      language switch): the Prep Bar starts closed; clicking the pill opens it
      as a popover over the workspace (the columns do not move) and clicking
      again, pressing Escape or clicking outside closes it; the state is not
      remembered across a reload; the header stays one row at 1920/1440/1366px
      in EN and RU, the title truncates with an ellipsis after the "Session ·"
      prefix drops; the one-time hint shows once on the first visit and
      dismisses on click, outside click, Escape or timeout;
      rename/switch/new/duplicate/delete update the title at once.
- [ ] Catalog filter row: sticky under the header while scrolling, about 10%
      smaller than before, the result count sits right after the controls (not
      under the ribbons).
- [ ] **Prep Bar**: the active prep name appears once (no separate
      title field or select); at 2048/1440/768/390px the bar is one compact
      block (~84px, two rows on phones) aligned with the columns below,
      with no horizontal overflow, in both languages and with a very long
      prep name (truncates with ellipsis + full-name tooltip).
- [ ] **Session Notes**: expanded bar shows a two-line textarea (no visible label; sr-only label + placeholder)
      between the prep name/status and New/⋯ (single row at 1280/1440/1920px,
      no horizontal overflow, EN and RU). Typing keeps Enter/arrows/space
      working; text is stored verbatim (blank lines and edge spaces kept) and
      survives reload. Switching preps — even immediately after typing — shows
      each prep's own notes; New starts empty; Duplicate copies them. Collapsing
      the header hides the field and shows no note preview/badge anywhere;
      expanding restores the text. The textarea is never auto-focused.
- [ ] **Prep Bar menus**: the title opens the prep menu (current
      prep checked; scrolls past ~340px; stays inside the viewport);
      the menu is headed "Sessions" and ends with a "+ New session" shortcut; the ⋯ button opens Rename/Duplicate/Copy/Delete. The save status (Local · HH:MM / Saving… / Save failed) sits inside the title selector and never changes the bar height. Only one is open at a
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
- [ ] **FreshCutGrass support gate (PD-014)**: on `#/env/fathomless-baths-surface`
      (RU and EN) Merchant and Petty Noble are links with the external icon,
      Tourists is plain text (no icon, no hover, not greyed); "Open Encounter"
      shows a `2` badge and its tooltip (on the label, the badge and the icon
      alike, and on keyboard focus) names Tourists, and the opened
      encounter holds only Merchant and Petty Noble. The Merchant / Petty Noble
      links themselves show no tooltip. On `#/env/port-city` the tip lists
      the three unsupported names after "Not supported:" / "Не поддерживаются:". `#/env/cursed-graveyard`
      (all supported) has no badge; `#/env/civic-library` (none supported) has
      no links and no "Open Encounter".
- [ ] **FreshCutGrass export**: the central "Open Encounter" link is absent with
      zero adversaries selected, appears the moment one is selected, opens
      in a new tab, and its accessible label/tooltip announces the
      destination ("Open encounter in FreshCutGrass"). Hovering or focusing it, and
      any adversary link on the page, moves nothing. Decode the link's payload and confirm it uses
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
      results" takes a tile's height), and the toolbar counter stays
      one width. The prev/next arrow slots are *not* reserved: with nothing
      to scroll they are gone and the strip uses the panel's full width
      (more tiles/columns fit); they appear only when the content overflows
      even at that full width.
- [ ] **Item Gallery view** (default): unchanged from before this
      redesign — same large art tiles, hover/selection/click behavior.
- [ ] **Item Compact view**: two-line records (thumbnail, name, "Item ·
      Core · #1"-style meta with the item number always visible even when
      a long Russian name/source combination truncates the rest); flows
      into exactly two horizontal rows with native scrolling and no nested
      vertical scrollbar — except when every match fits one row with no
      horizontal scroll: four or fewer always (e.g. dice roll 3d12), five
      once the Items panel is ≥1350px wide, six at ≥1602px, seven at
      ≥1854px. One more match than fits grows it back to two rows; clicking a compact record opens the same detail
      overlay as its gallery card; a long name still exposes its full text
      via hover/focus (native `title`).
- [ ] A selected adversary/item's Tier/Type/source meta line in both the
      picker row and the central selected list.

### Environment → Recommended Adversaries

Advisory only — see [PD-008](product-decisions.md). Check in EN and
RU. Useful environments: **Bandit Hideout** (7 Jagged Knife), **Raging River**
(the same 7 + Bear + Glass Snake — overlaps Bandit Hideout), **Green Doom
Skies** (only an unsupported name).

- [ ] **No environment selected**: no ★ on any row, no "Recommended" group,
      no `★` button in the Adversaries header, picker looks like the plain
      flat list.
- [ ] **One environment** (Bandit Hideout): a "★ RECOMMENDED FOR SELECTED
      ENVIRONMENTS  7" group sits above the regular rows, followed by a thin
      divider and no second heading; the 7 rows have a gold ★ before the
      name, a faint gold tint (no side line); hovering the ★ shows
      "Recommended for: Bandit Hideout" (RU: "Рекомендовано для: …"); the
      checkbox state of every row is unchanged — **nothing is selected
      automatically**.
- [ ] **Row geometry**: a recommended row is exactly as tall as an ordinary
      one; the checkbox, artwork button and name link are still the only
      three interactive zones, in that Tab order (the ★ is not focusable and
      not inside the link).
- [ ] **Two overlapping environments** (+ Raging River): no duplicate rows;
      the 7 shared adversaries come before Bear/Glass Snake; their tooltip
      lists both environments (names localized); the group count is 9.
- [ ] **Filters**: search, Tier and Type still work. A Tier that excludes
      every recommendation removes the group entirely (no empty heading); a
      search matching some keeps only those under the heading, above the
      regular matches; hidden recommendations are never force-shown;
      `{n} of {total}` still counts every filtered row; the `★ +N` number
      does **not** change with the filters.
- [ ] **Bulk add**: `★ +9` (tooltip "Add 9 recommended adversaries")
      appears before the FreshCutGrass link; one click adds only the missing
      recommendations, keeps the ones already selected, and updates the
      central list and its count, Battle Points, the >10 warning, the
      FreshCutGrass export, every affected picker checkbox and its
      "Add…/Remove…" label; one toast "Added 9 recommended adversaries";
      the button becomes `★ ✓` ("All recommended adversaries are already
      selected"), stays focusable, ignores Enter/Space/click, and keeps
      keyboard focus; the picker's filters are untouched. With exactly one
      missing it reads `★ +1` / "Add 1 recommended adversary".
- [ ] **Remove an environment after bulk add** (central ×, picker checkbox,
      trash, or the quick action / detail overlay): the selected adversaries
      all stay; stars and tooltips update immediately (the shared rows lose
      the removed environment, the exclusive ones lose the ★ and drop out of
      the group); removing the last one hides the group and the button.
      Adding an environment only adds stars — never a selection.
- [ ] **Unsupported/custom names only** (Green Doom Skies): no ★, no group,
      no button, no placeholder rows, nothing in the console.
- [ ] **Prep switching**: create, switch, duplicate and delete a Prep — the
      stars, group and button always reflect the *active* Prep's
      environments; a language switch rebuilds them in the new language.
- [ ] **Storage failure** (e.g. block `localStorage.setItem` in DevTools),
      then `★ +N`: the selection changes for this tab, the storage warning
      appears, and there is **no** "Added …" success toast.
- [ ] **Layout**: 1920×1080 — group heading on one line; ~1366×768 laptop —
      the central Adversaries header (title, count, Battle Points, `★ +N`,
      FreshCutGrass) doesn't overlap, wrap or clip the title in EN or RU
      (with a two-digit `★ +12` the RU title may ellipsize by a few pixels);
      the long RU group heading wraps inside the narrow picker column; rows
      keep their height; focus ring visible on the `★` button.

## Prep manual ordering

Desktop pointer only (mouse or trackpad); also 1366×768, 1440×900, 1536×864,
1920×1080 and a window resized across the 3/2/1-column switches.

- [ ] Drag a selected Environment / Adversary / Item card inside its own
      section: the gold line shows the landing slot, drop reorders, reload
      keeps the order. No line when the drop would change nothing.
- [ ] Across a row boundary (C → D, F → G in a 2- or 3-column grid) the line
      does not jump; a partial last row and an empty cell are reachable.
- [ ] Drag an unselected row from All Environments / All Adversaries and a
      tile or text row from the Items strip into the matching section: it
      lands at the line, the picker checkbox/tile turns selected, the other
      sections are not highlighted, nothing below shifts. An empty section's
      "nothing selected" line becomes "Drop here to add" with the same height.
- [ ] Invalid drags do nothing: other section, an already-selected entry (not
      draggable), an unselected environment at 3/3 (not draggable), Esc,
      releasing outside. Cards already selected still reorder at 3/3.
- [ ] A long selection: holding the pointer within ~56px of the central
      panel's top/bottom scrolls it (faster nearer the edge) and stops on
      release / leaving the zone / the end of the list; the page itself does
      not scroll at ≥1200px.
- [ ] Click ≠ drag: environment/item detail, adversary art preview,
      FreshCutGrass link and × all still work; a light trackpad wobble does
      not reorder; links/images in a card never start a native drag.
- [ ] Selected cards show `grab` on their non-interactive parts and keep pointer / zoom-in over the controls that open something (no grip/handle). Alt+↑/↓ and Alt+Shift+↑/↓ on a focused card move it,
      focus stays on it, a screen reader hears "moved to position N of M".
- [ ] Copy session summary, Copy session link (open it in a fresh profile) and
      the FreshCutGrass link list the adversaries in the on-screen order;
      Duplicate session keeps it.
- [ ] A touch-only device shows no grab cursor and cannot start a
      drag. No Reset order, undo or drag-to-delete anywhere.

## Journey map editor (`#/journey`)

Automated coverage: the pure `tests/journey2-*.test.js` suites plus the browser checks in `scripts/journey2/lib/` and
`verify-hex-stock-art.js` / `verify-shadowblight-state.js` (the older Stage 1 / Phase 0 harnesses were removed; see git history
before this commit; use `J2_BROWSER_CHANNEL=chrome` to run against an installed Chrome). Scenario regions are created through the
`createBatch` command because the editor only offers the fully random Generate action. The manual path below is for a quick human pass in your own browser — use a
private window, or accept that it writes the four `dhcodex_journey2_*` keys.

- [ ] Route cutover: `#/journey2` and `#/journey2/env/<id>` replace themselves with `#/journey` / `#/journey/env/<id>` (Back does not
      bounce); the Journey nav button stays active on the overlay route; opening/closing an Environment overlay, Back and Forward never
      remount the map (camera, selection, sidebar kept); `#/prep` then Back returns to the same saved campaign; no old generator page,
      V1/V2 switch or "Journey 2" text in EN or RU.
- [ ] Open `#/journey`: header, a left rail (Party, Route, Find Echo, Campaign) and panel (title, GM | Players segment, Generate region, stock), a floating bar with Undo/Redo, zoom and Fit at the map's bottom, the map fills the rest. No page scroll
      at 1366×768 and 1920×1080; Diagnostics is closed. Shortcuts P / R / E / V / [ work on a Russian layout too; the Campaign menu opens, Esc closes it and focus returns to its button; Remove Echoes and Create sanctuaries still ask first.
- [ ] PD-034: **Player Preview** shows Reveal / Hide beside Undo/Redo. Arm one: dashed outlines mark hidden placed hexes; painting reveals/hides and Undo reverts; Esc turns the tool off, a second Esc returns to the GM view (no tool left armed). Zoom and pan, reload: the same zoom and spot return (a fitted map stays fitted); a corrupt `dhcodex_journey2_ui` falls back to Fit.
- [ ] **Generate region** rolls everything at random. A card appears: Placed 0 / N, drag targets
      **1 hex** and **All N**. Nothing is on the map.
- [ ] Drag **1 hex** onto the map: gold preview + tooltip while dragging; release places one.
      Do this seven times in a connected chain (the first hex anywhere, each next one touching an edge of
      the previous). A hex placed apart from the map is rejected with "A new region must share a full edge…".
      Counts read 7 / 20 and **All 13**; the targets do not move.
- [ ] Drag **All 13**: a 13-hex cluster previews under the pointer; over an occupied cell, outside the
      map or over the title/compass/scale it turns red with a reason and a release places nothing.
      On a clear area, release → 20 / 20, **All 0** disabled, the first seven unchanged.
- [ ] Connected map: generate a second region — its first hex (or *All* footprint) must touch ANY placed hex by a full
      edge. A detached but otherwise valid candidate previews amber/dashed with a marker and the hint; releasing
      opens "Start a separate area?" (Cancel keeps focus on the handle and changes nothing; confirming places
      exactly the previewed hexes, one Undo entry, Redo needs no dialog). Occupied/prohibited/internally split
      candidates are red and never offer the override. Moving or returning a hex that would split the prepared map is
      refused ("Moving/Returning this hex would split the prepared map"); deleting a bridge region works and the
      dialog warns "…split the prepared map into N separate areas"; Undo restores exactly.
- [ ] Player Preview fog: MARROGATE, HORIZON and the sanctuary icons stay readable under the fog at 67 / 100 / 150 %
      with no white rectangular patches.
- [ ] Region perimeter: every placed region has a thick dark outline with one divider between touching regions
      and the thin grid visible inside; it follows place / move / return / delete / Undo / Redo / import; clicks,
      drags and panning pass through it; the gold selection stays above it. In Player Preview the outline
      appears only where the hexes on both sides are revealed (no line ends against fog).
- [ ] Drag a placed tile to a free cell (counts unchanged); drop it back on itself (nothing happens);
      drag it onto an occupied cell (rejected, stays). Click a tile → **Return to stock** (or Delete).
- [ ] Esc during any drag, releasing outside the map, or leaving the route → nothing changes.
- [ ] Undo/Redo (buttons or Ctrl+Z / Ctrl+Y outside text fields): undo the move, then the whole All-13
      drop → exactly the seven and 13 in stock. Reload → the same seven, details and 13 remaining.
- [ ] Region Inspector: click a placed hex → one panel beside it (Habitat, Region #, Terrain, days per
      hex/placed/remaining counts, Encounter, Rumor, Suggested environments, no notes field) with the whole
      region softly outlined and that hex strongly; a footer shows **Return to stock** and no raw "Hex q,r"
      (click it: the hex goes back to stock, the footer disappears; Undo restores it). There is no separate bar at the bottom of the map; the sidebar does not expand, scroll or open. Click another hex of the region,
      then a hex of another region, then empty map (closes). A pan keeps it open; a hex drag never opens it.
- [ ] Hex Environment: click a placed hex → the inspector shows **Hex Environment** (above Encounter) and no Suggested environments;
      *Choose Environment* opens an inline scrollable list with only that biome's environments (a Shadowblighted region uses
      its base biome; an Overtaken one says "No habitat-specific environments…"). A name opens the normal overlay without assigning
      (camera, inspector and picker unchanged after Esc); *Assign* closes the picker, shows Tier + name, adds a small card marker on
      the hex and a hover tooltip. Change = one Undo step; Detach needs no dialog; moving the hex carries the marker; Return to stock
      + Undo restores it; the same environment may sit on several hexes. Player Preview (even on a revealed hex) shows no marker.
      A card-opened inspector shows no environment section. RU/EN relabels names without changing the saved map.
- [ ] Biome Tint: placed hexes carry a very faint, distinct wash per Habitat (greens stay distinguishable; a Shadowblighted Wetland is still
      Wetland-coloured, a fully overtaken region is violet-grey); black symbols, Terrain dots, the thick perimeter and the thin grid stay clear
      and no colored outline appears. **Biome colors** (Fog group) hides/shows it with no Undo entry, no "Saving" flash, no camera or fog change,
      and the choice survives a reload. Move / Return / Undo / Redo / Import move the wash with the tiles. Player Preview tints only revealed
      cells (hidden cells show nothing, even in DOM); the GM toggle does not affect it. Sanctuary icons and Soul Echoes are unchanged.
- [ ] A card's **Inspect region** button opens the same panel for an unplaced region too, without
      expanding the card; the panel never sits under the sidebar/rail and stays the same size at 50%, 100%
      and 200%. Esc cancels an armed Place first, then closes the panel; focus returns to the opener.
- [ ] A card opened with **Inspect region** has no Hex/Return to stock footer (no anchor hex).
- [ ] An expanded region card has no environment list (equally compact for any region), and the Region
      Inspector has no "Suggested environments" section (its last section is Rumor); the inspector body scrolls normally.
- [ ] Fog of War (Fog group): Reveal / Hide are toggles (`aria-pressed`, a status chip names the tool and
      "Hold Space and drag to pan"); click and drag paint hexes (a fast flick leaves no gap); one stroke =
      one Undo / Redo; Space + drag pans, the wheel zooms; Esc cancels a stroke, then leaves the tool;
      a click on a region hex paints fog and never opens the inspector or moves the hex; activating a tool
      closes the inspector and cancels an armed Place; arming Place switches the tool off. The GM keeps every
      generated glyph and the GM view never draws the fog veil (no Fog button, PD-036); the veil appears only in Player Preview, with the sanctuary
      icons and MARROGATE / HORIZON labels staying clean under it. Generating, placing, moving or deleting a
      region never changes the fog. Reload keeps the fog.
- [ ] Display menu (PD-066): the rail's **Display / Вид** button is present in the GM view, in Player Preview and on a `#/map/<link>` page (on a phone ≤640px it is in the bottom bar and the menu opens upward). Biome colors, Sepia map and Regions each toggle live in all three; in Player Preview Biome colors hides/shows the tint on revealed hexes; a copied link opens with the GM's three values, a change on the player page lasts until reload and writes no `dhcodex_journey2_*` key; an old (`3.`) link still opens sepia + tinted.
- [ ] Player Preview: the cards, Campaign menu, Find Echo, save status and inspector are gone;
      the Players side of the segment is selected, the rail gains Brush, Outline, Print and Link, and zoom/Fit and the **GM** side of the segment remain. Unexplored hexes carry the stronger gray
      texture and no generated glyphs; revealed hexes show their glyphs; a region half revealed shows only its
      revealed hexes; the base map, labels and sanctuary icons are unchanged. Pan and zoom work, clicks do
      nothing, Ctrl+Z does nothing. **Back to GM** (or Esc) restores the previous pan/zoom, the sidebar state and
      without reopening the inspector or adding an Undo entry. A reload reopens the preview at the restored camera (PD-035).
- [ ] Soul Echoes (GM only, PD-022): **Soul Echoes** places nine small animated Echo markers (PD-071: a luminous core with three broken ripple rings blooming outward in turn), each right above its sanctuary icon (the icon stays visible), on nine different sanctuaries
      (never HORIZON/MARROGATE), one in each of nine west-to-east bands, spread over the whole map, and the
      pressing it again asks "Place new Soul Echoes?" (Cancel is focused) and replaces them;
      **Remove Echoes** is disabled when there are none, otherwise asks first and removes all. Each action is one Undo entry
      and Redo restores the same sanctuaries. Reload keeps them; with reduced motion the rings stop on a still frame (all three rings and the core still shown); markers stay
      visible over the fog veil and at 100 % none of them covers its sanctuary icon. **Player Preview** shows no Available marker and no Echo button. The JSON backup round-trips them.
- [ ] Shadowblight reset and Clear map (PD-074): walk an X off its region with Locate → + (leave the bubble), then Campaign → **Return Shadowblight home** (RU «Вернуть Теневую порчу домой»): a Cancel-first dialog, then the wandering X is gone and the X that left its region is back; it is ONE Undo entry and the item is disabled when there is nothing to reset.
      Campaign → **Clear the whole map…** (red, last group): dialog 1 shows the counts, what goes and what stays, and "Download current map" (it downloads and the dialog stays open); Cancel (or Esc) at either dialog changes nothing; dialog 2 "Are you sure?" has Cancel focused.
      After confirming, the map is empty, Undo / Redo are disabled, the camera and Display switches are kept, Prep and Lists are untouched, and importing the downloaded `bacchus-atlas-journey-map-*.json` brings the old map back. Check both languages (the RU dialog text is long) and a map with one region and one hex (singular wording).
- [ ] Destroyed sanctuaries (PD-070): Campaign → **Generate 5 destroyed sanctuaries** (RU «Создать 5 уничтоженных убежищ») puts a small animated flame ON five sanctuary icons and a smoke column drifting up and to the right over the next two hexes;
      none of the five holds a Soul Echo (press it with and without Echoes placed; re-place the Echoes afterwards: no Echo ever lands on a flame, and the flames stay). Pressing it again asks "Destroy other sanctuaries?" (Cancel focused);
      **Remove destroyed** is disabled when there are none, otherwise asks first. Each action is one Undo entry and Redo never re-rolls. The legend shows "Destroyed sanctuary" while any exists.
      Open a destroyed sanctuary that has a generated settlement: a "Destroyed" note sits under the header and the name-reveal button still works. **Player Preview** shows a flame only on a revealed hex (reveal one with the brush, or stand the party next to one: it lights when the party arrives), none under fog,
      and the legend line is absent until one is visible. **Player link** and **Print preview** carry the same revealed ones only (the print is a still black-and-white flame with outlined smoke, drawn on the right page, not covering the icon's neighbours' names; check a ruin near the seam).
      With reduced motion the flame stops and the still smoke replaces the moving one. Check RU and EN, 375 px on the player page, and that the JSON backup round-trips them.
- [ ] Locate Soul Echoes (GM only, PD-030): the **Locate Soul Echoes** button (RU «Найти Эхо Души») is disabled with a reason ("Generate Soul Echoes first." / "All Soul Echoes have been collected.") until an Echo is
      Available. Pressing it shows the chip "Select the hex where the party is currently located." (Cancel / Esc leave it; Reveal, Hide, the inspector and the overlay close); hovering shows a dashed hex with a star,
      clicking any valid hex — also one under a sanctuary icon, a tile or an Environment badge — starts the compass: a popover beside that hex, the needle spins two turns and settles on the true bearing, then
      "The compass points …" + `NNE · North-northeast` + the GM reminder appear (not before). No name, distance, route or target is shown, fog and names are unchanged and Undo gains no entry.
      On an Echo sanctuary's own hex it says "The nearest Soul Echo is here." and the centre pulses. **Choose another location** returns to selecting, **Close** (or Esc) returns focus to the button.
      Open an Echo sanctuary: the Soul Echo strip shows **Mark collected** → **Unmark collected** (overlay and scroll stay, one Undo each; the map marker turns into the static spent drawing — a hollow core and a frozen broken ripple, no motion, still easy to find at 100 %; the legend's "Soul Echo collected" swatch is the same drawing). Locate skips collected Echoes.
      Undo/Redo or regenerating Echoes while a result is open closes it. With reduced motion the needle jumps straight to the bearing. Player Preview and Print Preview show none of it; the JSON backup keeps the collected state; EN/RU.
- [ ] Shadowblight FX (PD-072), GM view, Player Preview and a player link (phone width too): Shadowblighted hexes show the living Hybrid shadow (moving at 100 %, continuous across touching hexes and regions, no X); Fully Shadowblighted hexes are one torn hole per connected group onto the Nebula (no skull, no shadow inside, no hex outline); pan and zoom — the Nebula never moves or scales, the tear edges stay on their hexes; a printed icon next to a tear stays on parchment; after Locate '+' the walked X's shadow moves with it; in Player Preview a hidden blighted hex or tear shows nothing (no shadow, hole or rim edge leaks it); Print player map shows the X's and skulls and no FX; with reduced motion the shadow is still and the holes stay; the legend shows the two swatches.
- [ ] Shadowblight control (GM only, PD-041): with no Shadowblighted or fully overtaken region on the map, Locate shows only the compass (no red frame, no bubble). With at least one: after the needle starts, the party's hex has a A blocked front X lets the X's behind it slide round it (never back and forth); when **+** is disabled its tooltip says "The Shadowblight has reached the party" (an X on or next to the party's hex) or "The way is blocked…" (nothing can get closer), and the old "No further steps available" only at the 20-step cap.
      red dashed frame and a bubble under it: − (disabled at 0), the step number, +, ×. Each + moves the nearest block of X's (and every block tied at the same distance) one hex toward the frame; the nearest X finally stands on the party's hex and
      the rest pack behind it, + disables ("No further steps available", also when the 20-step limit is hit before the party hex). − steps back exactly. A fully overtaken block keeps its skulls and sends one X per skull (a skull never gets an X on it). An X never lands on a sanctuary / Marrogate / Horizon hex or on
      another X. × closes the bubble and the X's stay put; Undo returns them all in one step (and closes the bubble), Redo restores the last step. Closing the compass (Close / Esc) keeps the frame and the bubble working; choosing another location replaces them and × closes the bubble. Pan / zoom keep the bubble under the hex.
      Player Preview and the printed player map show a moved X only on revealed hexes (also on open ground with no tile); neither shows the frame or the bubble. The JSON backup round-trips the moved X's. Check English and Russian.
- [ ] Sanctuaries (GM only, PD-023): the toolbar button reads **Generate 56 sanctuaries** (RU: «Создать убежища: 56») and puts a dashed ring round every printed sanctuary icon
      (never HORIZON/MARROGATE). Clicking an icon (also one with a hex under it) opens the overlay: name, then Trade & Exports d20, Quirk d12, Crisis d10, Drive d10,
      Political System d8, Size d6, Population d4, each with its die and result; a combined political system shows one line per system (no separate note).
      **×** and Esc close it; **Delete sanctuary** asks first (Cancel focused), removes the entry and leaves the printed icon; **Reroll sanctuary** changes the name and all rows,
      keeps the overlay open, and is one Undo entry. Pressing the toolbar button again asks before replacing. Clicking empty map closes the overlay; opening a hex's Region Inspector replaces it.
      `S` / `Shift+S` (map focused) step through the sanctuaries. Reload keeps them; the JSON backup round-trips them. **Player Preview** shows no ring, no overlay and no button.
      Check RU wording against daggerheart.ru/frame/journey-to-horizon, a narrow window (overlay full width) and the overlay beside the sidebar.
- [ ] Sanctuary names for players (PD-027): in the overlay header the button beside the name reads **Reveal to players** (crossed eye); pressing it flips to **Hide from players** (eye)
      (overlay stays open, map does not move, focus stays on the button, one Undo entry each way). The ring dot disappears (no eye marker); hovering the icon shows "Name · Name visible to players".
      **Player Preview** shows the name in dark serif with a thin light halo beside that fixed icon (not covering it, inside the map, never over MARROGATE/HORIZON), even under fog;
      hidden names, tables and Soul Echoes are absent. Rerolling a visible sanctuary and deleting it each ask first; replacing all mentions how many names are visible. Check RU and a long name (two lines).
- [ ] Export/Import (no toolbar button since the Backup menu was removed — use `Journey2View.debugApi().runAction('export')`
      and the corrupt-map banner's Import): replacing a non-empty map asks first; a bad file is rejected with the
      reason and changes nothing; an import also ends Player Preview and any fog tool.
- [ ] Diagnostics (via `debugApi().runAction('diagnostics')`) opens the drawer (grid, markers, protection, print proof)
      and closes again; the inspector's footer then shows "Hex q,r".
- [ ] Party marker (PD-045): the "Party" button is the first rail tool (shortcut P), in the GM view AND in Player Preview. With no saved position a press makes the gold star follow the cursor (a chip says so; gone off the map); a click drops it, Esc / the chip's Cancel / the button cancels. Drag the placed star hex to hex: it snaps, and in Player Preview the seven lit hexes move live. One drop or drag is one Undo step. Hide removes the star AND its light for everyone and the next show puts it back where it was. It can stand on a sanctuary, Marrogate, Horizon and a fully overtaken hex, and it stays above hex symbols, X's and Echo crystals with a white outline. With the star shown, "Locate Soul Echoes" starts at once from its hex and "Plan route" starts with point A set (Esc once lets you pick A by hand); hidden, both behave as before. Pressing the star while Route / Locate / the fog brush is active drags the star, not the tool. Check RU and EN and zoomed-out sizing.
- [ ] RU and EN: no clipped labels in the toolbar, cards or dialogs; `#/journey` still works.

## Journey 2 player map print

- [ ] Prepare regions, reveal a few cells, reveal one sanctuary name and leave another hidden, assign a hex Environment, place Soul Echoes, Biome colors on.
- [ ] Player Preview still shows its fog hatch; the toolbar has "Print player map".
- [ ] Print Preview: exactly eight white A4 portrait sheets ("Sheet 1 of 8" … "Sheet 8 of 8", each saying "Trim to the edge of the map") on a neutral ground; no fog hatch, tint, Environment marker or Echo on any; the full Old Valloren map
      is present across the 4 x 2 grid (no frame or marks; tiles are butt-joined, no shared strip); generated symbols/dots/boundaries only in revealed cells; only the revealed sanctuary name shows.
- [ ] Pan/zoom/Fit/sidebar before opening it never changes the pages. Escape and "Back to Player Preview" return to Player Preview (not the GM view) and refocus "Print player map".
- [ ] The browser print dialog (paper A4 — not Letter, which shrinks the sheets about 6 % — margins None, scale 100): eight pages, no ninth blank page, no controls, only the sheet label; compass / MARROGATE / HORIZON unclipped.
- [ ] On paper: trim each sheet to the edge of the printed map and join the sheets edge to edge (1 2 3 4 over 5 6 7 8); the map lines and hexes continue across every join. Check that the printer's own unprintable margin does not eat the map's edge (the map starts 5 mm from the paper edge). A hex measures about 10 mm across the flats.
- [ ] RU and EN: heading, status, buttons and page labels are translated and do not clip.

## Journey browser harnesses: release gates vs retired

Run browser scripts with Chrome (`channel: 'chrome'`) when Playwright's bundled chromium is not installed. Dated status (release cleanup, source `HEAD 7e95872` + working tree):

| Script | Status | Why |
| --- | --- | --- |
| `scripts/journey2/lib/print-checks.js` | **Current gate** | Player Print: eight A4 portrait sheets, no GM data, native-print safety |
| `scripts/journey2/verify-shadowblight-state.js` | **Current gate** | 464/464 |
| `scripts/journey2/verify-hex-stock-art.js` | Current | hex card artwork |
| `scripts/journey2/lib/locate-checks.js` | **Not a gate (stale)** | strict-mode selector clash on the duplicated drawer + rail controls (same defect fixed only in `print-checks.js`) |
| `scripts/journey2/lib/sanctuary-name-checks.js` | **Not a gate (stale, 1 check)** | `sancname.03` asserts the removed eye ring |

None of the stale scripts indicates a product defect; their failures are obsolete assertions, not regressions. They are not rewritten, and a red run of them must never be reported as passing. Current coverage that replaces them: Place all / atomic placement → `tests/journey2-model.test.js` + Audit 08 INT-05; Locate → `tests/journey2-locate.test.js` + Audit 08 E2E-18; sanctuary names → `tests/journey2-sanctuary-names.test.js` + Audit 08 E2E-16/PRN; camera/layout → Audit 08 responsive suite.

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

### Route Planner (PD-031)
- [ ] **Plan route** (RU «Проложить маршрут») is a real button in the GM toolbar; absent in Player Preview and Print Preview. Pressing it shows "Select the starting hex." and a crosshair; hovering a hex shows a ghost **A**.
- [ ] Click A, then B (a wilderness hex, an ungenerated hex, a sanctuary icon — the icon selects its hex and the overlay does not open). A drag pans without selecting. Escape: B-selection -> A-selection -> closed.
- [ ] With mixed Terrain regions two lines of the same thickness run side by side (golden blue = Fastest, reddish gold = Shortest), each with a bubble above it ("12 hexes · 15 days"). Zoom and pan: the gap stays
  constant on screen and the bubbles follow and stay on screen. Where both are the same path there is one line and one "Fastest and shortest" bubble. Fastest's days equal the sum of the entered hexes' ratings
  (start excluded; sanctuary / Marrogate / Horizon hexes count 0).
- [ ] Click the other bubble: it becomes the selected route (on top, with chevrons). Click the selected bubble: a details popover opens (hexes, travel days, expected encounter triggers as an estimate, terrain
  breakdown, comparison); Escape closes the details, then the planner. No Undo entry, no camera change.
- [ ] A route that crosses an ungenerated hex: only Shortest is drawn, its bubble says "days unknown", unknown segments are dashed and the details explain; Fastest is not guessed.
- [ ] A = B opens the details with "Start and destination are the same hex." (no line). Locate Soul Echoes, Reveal / Hide and armed placement close the planner and vice versa; Undo / Redo recompute an open route
  and never reopen a closed one; fog and revealed cells are unchanged.
- [ ] Player Preview, Print Preview and the printed pages contain no route line, A / B pin, bubble or statistic. Verify in English and Russian. (Planned, PD-052: Player Preview and the player page will gain the planner; update this line then.)
- [ ] **Dragging the pins (PD-051).** Show the party marker and press Plan route (A lands on the marker). Hovering A shows a grab cursor; dragging it moves **A, not the party**: the pin snaps hex to hex, the routes and bubbles follow live, the party stays (Undo list unchanged). Drag B the same way. Esc during a drag puts the pin back. A pin dropped on the other pin, or off the map, stays on its last valid hex. In the destination-selection step A is draggable too. Dragging the party marker where no pin is still moves the marker (one Undo entry). Leave the planner (Esc), and the marker under the old A is draggable again.

### Shareable player link (PD-052)
- [ ] In Player Preview (with some hexes revealed, the party shown, a sanctuary name revealed, one Echo Collected on a revealed sanctuary and one Collected under fog) the **Player link** button
  (in the rail while Player Preview is on) copies a link and shows "Link copied · N characters" and a toast; with the clipboard blocked the link appears in a selected read-only field and no success
  toast is shown. A link over 2000 characters adds the warning. The button is absent in the GM view and on the player page. A new link is needed after any later change (it is a snapshot).
- [ ] Open the link in a **fresh browser profile / private window**: only the site's brand and the RU / EN switch are in the header (no ribbons, no soundboard); the map is the preview — fog, the
  revealed tiles and region outlines, the party star with its six lit hexes, only the revealed sanctuary name, the static spent Echo marker (hollow core, frozen broken ripple) on the revealed collected Echo sanctuary and **none** on the fogged or Available one.
  There are no GM controls: no Undo / Redo, no Party, no fog brush, no "Back", no Print, no Locate / Echo / sanctuary buttons. Escape does nothing destructive.
- [ ] DevTools -> Application -> Local Storage: the player page created **no** `dhcodex_journey2_*` key (a GM who opens their own link keeps their map untouched). Reload and change language: still the same map.
- [ ] Language: a reader who never chose one sees the GM's language; one who chose keeps theirs; the RU / EN switch changes the interface (sanctuary names stay as written).
- [ ] **Plan route** on the player page: A is the party star; click B under fog -> only Shortest, "Days unknown"; revealed tiles' dots count as known days; the details show hexes, days and the terrain
  breakdown but **no** expected-encounter row. Drag A and B (a pin over the star moves, the star never does). The same tool works in the GM's Player Preview, and Escape closes the route before the preview.
- [ ] Tablet (or touch emulation): one finger pans, two fingers pinch-zoom around the point between them, a tap picks a hex in Plan route, a finger on a pin drags it; after a pinch the remaining finger does
  not tap. Phones: the page fits (no sideways scroll). Verify in English and Russian.
- [ ] **Player legend shows only what is visible** — on a player link with everything fogged and the party hidden, the legend lists only the "Not yet known" line (plus the Sanctuary line if a printed sanctuary hex is revealed); Party, Shadowblight, Soul Echo collected, Destroyed sanctuary, Terrain and the Biomes block each appear only once a matching thing is visible on a revealed hex, and disappear again when the GM hides it.
- [ ] **Phone-first (PD-067)** — the primary platform for this page. At 375x667 and 360x640 portrait (mobile emulation, touch), and a short landscape phone: no sideways page scroll; the map fills the screen; the bottom tool bar clears the home indicator (safe area) and the browser toolbar showing/hiding does not resize the map jarringly; tool targets are >= 44px; the legend opens above the bar, scrolls, and starts folded; Fit stays visible and tappable (44px) with the legend and route details open, and legend + details stack without covering the route chip's Cancel; on desktop the zoom bar is horizontal like the GM view's; nothing needs hover, a hotkey or a tooltip; the page does not scroll or pull-to-refresh while panning the map; no text is under 12px. Repeat in Russian (longest labels: Route / Legend, the biome names, the legend sentences).
- [ ] Bad links: `#/map/`, a truncated link, `#/map/2.xx` and a link for another template each show one localized sentence (and nothing else); the console, not the page, has the detail.

### Encounter Roll (PD-039)
- [ ] Open the Region Inspector from a placed hex and from a card's Inspect button: the Encounter section header shows a "Nd6" button (N = the dots; "4d6" for Extreme) with a small d6 icon, right-aligned. Hover / long focus shows the rule text. The Terrain line folds its flavour text behind a chevron (closed by default); the examples sit in the header subtitle after "Region #N"; in Hex Environment, Change sits at the right of the name card and the name has no ↗ arrow.
- [ ] Click it: the dice appear one by one (no motion with reduced motion on), ones are red, the verdict reads "Encounter!" (any 1) or "No 1s" with the "you may spend a Fear" reminder. The Encounter section is framed in red with a "Triggered" flag only on a hit; a miss leaves it unchanged. Click again: it re-rolls.
- [ ] Switching to another hex or region, closing and reopening the inspector, clears the roll. Nothing about it is in the saved map, Undo/Redo, Player Preview or the printed pages.
- [ ] A fully shadowblighted region: no Inspect button on its card; clicking its hex opens a compact inspector with only the title, the badge and "Return to stock" — no Terrain, roll button, Encounter or Rumor.
- [ ] Verify in English and Russian (the verdicts and the Fear hint must not clip).

## Catalogue filters in the address (PD-068)

- [ ] On `#/`, press Rank 2, pick a Biome and a Source, type a search: the address becomes `#/?q=…&tier=2&biome=…&src=…` after each change, with no new history entry (Back leaves the catalogue, it does not undo a filter).
- [ ] Reload, and open the same address in a new tab: the same toolbar state (pressed rank, ticked biome/source, search text) and the same result count; switch RU/EN and the filters and address stay.
- [ ] Open a card from the filtered grid: the address is `#/?…/env/<id>`; × / Escape returns to the same filtered grid; opening that address cold shows the grid filtered, the card open.
- [ ] Paste a different filter address into the same tab: the toolbar and grid follow it. Open Lists, then Back: the filters are back.
- [ ] "Clear filters" returns the address to `#/`. Hand-edit a rank to `tier=9`, a biome to `biome=nope`, a source to a name that does not exist, or a malformed `%E0%A4%A`: nothing breaks, the bad pieces are ignored and the address is repaired.
- [ ] `#/lists/<id>` filters do not touch the address.
