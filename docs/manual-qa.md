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

## Add to… dialog (detail overlay's bottom button)

- [ ] Title "Add “Name”" / "Добавить «Name»"; sections "Current Prep" and
      "Lists" with a rule between them.
- [ ] Prep row: checkbox mirrors membership, shows the active Prep's title and
      `n/3`; toggling adds/removes immediately (matching buttons behind it
      change too).
- [ ] At 3/3 with the environment not selected the row stays visible, is
      disabled, and states why; when selected it stays enabled.
- [ ] List checkboxes and "create list" still work, the new list is ticked;
      the dialog stays open after **every** change and closes only by ×,
      Escape or a backdrop click, with focus back where it started. Focus is
      trapped while open.
- [ ] The compact bookmark popup is unchanged (list-only, closes itself after
      adding).

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
- [ ] Session control in the header (between brand and nav, never after the
      language switch): fresh storage opens expanded; clicking collapses/
      expands the Prep Bar and the choice survives a reload; the header stays
      one row at 1920/1440/1366px in EN and RU, the title truncates with an
      ellipsis after the "Session ·" prefix drops; the one-time hint shows
      once in compact mode and dismisses on click, outside click, Escape or
      timeout; rename/switch/new/duplicate/delete update the title at once.
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

Automated coverage: `scripts/journey2/stage1-verify.js` and `browser-verify.js` (real pointer input, isolated
contexts; run them with `--out <scratch dir>` so the committed evidence is not rewritten, and
`J2_BROWSER_CHANNEL=chrome` to use an installed Chrome). Scenario regions are created through the
`createBatch` command because the editor only offers the fully random Generate action. The manual path below is for a quick human pass in your own browser — use a
private window, or accept that it writes the four `dhcodex_journey2_*` keys.

- [ ] Route cutover: `#/journey2` and `#/journey2/env/<id>` replace themselves with `#/journey` / `#/journey/env/<id>` (Back does not
      bounce); the Journey nav button stays active on the overlay route; opening/closing an Environment overlay, Back and Forward never
      remount the map (camera, selection, sidebar kept); `#/prep` then Back returns to the same saved campaign; no old generator page,
      V1/V2 switch or "Journey 2" text in EN or RU. Automated: `node scripts/journey2/route-cutover-verify.js` (`J2_BROWSER_CHANNEL=chrome`).
- [ ] Open `#/journey`: header, one compact toolbar (map name, save status, Undo/Redo,
      zoom, the Fog group: Fog / Reveal / Hide / Player Preview), a left sidebar (generator + stock), the map fills the rest. No page scroll
      at 1366×768 and 1920×1080; Diagnostics is closed.
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
      generated glyph; the hatch veil marks unexplored hexes, **Fog** toggles it (stored), and the sanctuary
      icons and MARROGATE / HORIZON labels stay clean under it. Generating, placing, moving or deleting a
      region never changes the fog. Reload keeps the fog.
- [ ] Player Preview: the sidebar, rail, cards, Undo/Redo, save status, fog controls and inspector are gone;
      only the Player Preview flag, zoom/Fit and **Back to GM** remain. Unexplored hexes carry the stronger gray
      texture and no generated glyphs; revealed hexes show their glyphs; a region half revealed shows only its
      revealed hexes; the base map, labels and sanctuary icons are unchanged. Pan and zoom work, clicks do
      nothing, Ctrl+Z does nothing. **Back to GM** (or Esc) restores the previous pan/zoom, the sidebar state and
      the Fog preference without reopening the inspector or adding an Undo entry. Reload leaves the preview.
- [ ] Soul Echoes (GM only, PD-022): **Soul Echoes** places nine small animated blue diamonds, each right above its sanctuary icon (the icon stays visible), on nine different sanctuaries
      (never HORIZON/MARROGATE), one in each of nine west-to-east bands, spread over the whole map, and the
      pressing it again asks "Place new Soul Echoes?" (Cancel is focused) and replaces them;
      **Remove Echoes** is disabled when there are none, otherwise asks first and removes all. Each action is one Undo entry
      and Redo restores the same sanctuaries. Reload keeps them; the shimmer stops with reduced motion; crystals stay
      visible over the fog veil. **Player Preview** shows no crystal and no Echo button. The JSON backup round-trips them.
- [ ] Locate Soul Echoes (GM only, PD-030): the **Locate Soul Echoes** button (RU «Найти Эхо Души») is disabled with a reason ("Generate Soul Echoes first." / "All Soul Echoes have been collected.") until an Echo is
      Available. Pressing it shows the chip "Select the hex where the party is currently located." (Cancel / Esc leave it; Reveal, Hide, the inspector and the overlay close); hovering shows a dashed hex with a star,
      clicking any valid hex — also one under a sanctuary icon, a tile or an Environment badge — starts the compass: a popover beside that hex, the needle spins two turns and settles on the true bearing, then
      "The compass points …" + `NNE · North-northeast` + the GM reminder appear (not before). No name, distance, route or target is shown, fog and names are unchanged and Undo gains no entry.
      On an Echo sanctuary's own hex it says "The nearest Soul Echo is here." and the centre pulses. **Choose another location** returns to selecting, **Close** (or Esc) returns focus to the button.
      Open an Echo sanctuary: the **Soul Echo** row shows Available + **Mark collected** → Collected + **Restore Echo** (overlay and scroll stay, one Undo each; the map crystal dims). Locate skips collected Echoes.
      Undo/Redo or regenerating Echoes while a result is open closes it. With reduced motion the needle jumps straight to the bearing. Player Preview and Print Preview show none of it; the JSON backup keeps the collected state; EN/RU.
- [ ] Sanctuaries (GM only, PD-023): the toolbar button reads **Generate 56 sanctuaries** (RU: «Создать убежища: 56») and puts a dashed ring round every printed sanctuary icon
      (never HORIZON/MARROGATE). Clicking an icon (also one with a hex under it) opens the overlay: name, then Trade & Exports d20, Quirk d12, Crisis d10, Drive d10,
      Political System d8, Size d6, Population d4, each with its die and result; a combined political system shows the note and one line per system.
      **×** and Esc close it; **Delete sanctuary** asks first (Cancel focused), removes the entry and leaves the printed icon; **Reroll sanctuary** changes the name and all rows,
      keeps the overlay open, and is one Undo entry. Pressing the toolbar button again asks before replacing. Clicking empty map closes the overlay; opening a hex's Region Inspector replaces it.
      `S` / `Shift+S` (map focused) step through the sanctuaries. Reload keeps them; the JSON backup round-trips them. **Player Preview** shows no ring, no overlay and no button.
      Check RU wording against daggerheart.ru/frame/journey-to-horizon, a narrow window (overlay full width) and the overlay beside the sidebar.
- [ ] Sanctuary names for players (PD-027): in the overlay the **Player map** row reads "Name hidden from players" + **Reveal name**; pressing it flips to "Name visible to players" + **Hide name**
      (overlay stays open, map does not move, focus stays on the button, one Undo entry each way). The ring dot disappears (no eye marker); hovering the icon shows "Name · Name visible to players".
      **Player Preview** shows the name in dark serif with a thin light halo beside that fixed icon (not covering it, inside the map, never over MARROGATE/HORIZON), even under fog;
      hidden names, tables and Soul Echoes are absent. Rerolling a visible sanctuary and deleting it each ask first; replacing all mentions how many names are visible. Check RU and a long name (two lines).
- [ ] Export/Import (no toolbar button since the Backup menu was removed — use `Journey2View.debugApi().runAction('export')`
      and the corrupt-map banner's Import): replacing a non-empty map asks first; a bad file is rejected with the
      reason and changes nothing; an import also ends Player Preview and any fog tool.
- [ ] Diagnostics (via `debugApi().runAction('diagnostics')`) opens the drawer (grid, markers, protection, print proof)
      and closes again; the inspector's footer then shows "Hex q,r".
- [ ] RU and EN: no clipped labels in the toolbar, cards or dialogs; `#/journey` still works.

## Journey 2 player map print

- [ ] Prepare regions, reveal a few cells, reveal one sanctuary name and leave another hidden, assign a hex Environment, place Soul Echoes, Biome colors on.
- [ ] Player Preview still shows its fog hatch; the toolbar has "Print player map".
- [ ] Print Preview: exactly two white A4 sheets ("Page 1 of 2", "Page 2 of 2") on a neutral ground; no fog hatch, tint, Environment marker or Echo on either; the full Old Valloren map
      is present; generated symbols/dots/boundaries only in revealed cells; only the revealed sanctuary name shows.
- [ ] Pan/zoom/Fit/sidebar before opening it never changes the pages. Escape and "Back to Player Preview" return to Player Preview (not the GM view) and refocus "Print player map".
- [ ] The browser print dialog (Save as PDF, A4 portrait, default and no margins): two pages, no third blank page, no controls or labels, compass / MARROGATE / HORIZON unclipped.
- [ ] RU and EN: heading, status, buttons and page labels are translated and do not clip.

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
- [ ] Player Preview, Print Preview and the printed pages contain no route line, A / B pin, bubble or statistic. Verify in English and Russian.
