# Task 03 - Journey side drawer: UX and consistency pass

Status: specification only. Nothing in this document has been implemented.
Author role: senior UI/UX review. Audience: the implementing session.

## 1. Objective and stop condition

Make the `#/journey` side drawer (the `.j2-side` panel and its collapsed `.j2-rail`) calmer, easier to scan and fully consistent with the rest of the site, in both of its views:

- **GM view** - nav row, tool rows, "New region", "Hex stock" cards.
- **Player Preview view** - the same panel, controls swapped (PD-040).

This is a presentation, copy and small-interaction pass. It does not change map rules, the Journey model, storage keys or any settled product decision.

Supported surface: desktop and laptop screens with a mouse or trackpad. Phones and touch-first layouts are not supported and are not a design or verification target in this task.

Stop after the work packages in section 4 and the verification in section 7. Do not redesign the map canvas, the Region Inspector, the sanctuary overlay or the Print Preview. Do not add features that are not listed here. The product/UX decisions D1-D5 are already settled in section 5; implement them as written and do not reopen them. If implementation shows one of them cannot work (for example it fails its measurement), stop and report instead of switching to another option silently.

## 2. Inputs and precedence

Read before starting:

- `design.md` (all of "Palette", "Colour roles", "Typography", "Components > Buttons / Icon-only buttons / Chips & badges", "Journey map panels", "Accessibility constraints", "Anti-patterns").
- `.claude/rules/ui.md` and `docs/manual-qa.md`.
- `docs/product-decisions.md`: PD-040 (toolbar lives in the side panel; Player Preview is the same screen), PD-034 (Reveal/Hide live in Player Preview), PD-033, PD-023, PD-029.
- `docs/translation-glossary.md` for every new or changed Russian string.
- `docs/architecture.md` "Journey 2 map editor".

Code that owns this surface (the live repository is the source of truth; line numbers are from the review date and will drift):

| Concern | Where |
| --- | --- |
| Panel + toolbar + preview-bar markup | `js/journey2-view.js` ~607-648 |
| Region card markup / update | `js/journey2-view.js` ~1088-1154 (`createCard`, `updateCard`) |
| Collapsed rail markup | `js/journey2-view.js` ~667-700 |
| Panel / toolbar / card CSS | `css/journey2.css` ~47-115 (controls), ~149-176 (stage, side, rail), ~187-270 (gen form, cards, handles) |
| Strings | `data/i18n.json`, keys `journey2_*` (EN and RU blocks) |

Hard constraints that apply to every package:

1. Use existing tokens only (`--s-*`, `--r-*`, `--fs-*`, `--hope*`, `--teal*`, `--fear*`, `--line*`). No literal hex, no raw px next to a token that equals it. If a token is missing, raise it as a finding instead of inventing one.
2. Gold (`--hope*`) is the only affirmative/selected colour. Teal is informational. Red is destructive/error only (`design.md`, `ui.md`).
3. The expanded panel and the collapsed rail are two views of one toolbar (PD-040). Every change to the order, grouping, labels, state or tooltips of a control in the panel must be mirrored in the rail in the same change.
4. Keep the internal `journey2` / `j2-*` names and the four `dhcodex_journey2_*` storage keys. Do not say "Journey 2" in public text.
5. Every new or changed string exists in EN and RU, with RU terms checked against the glossary. Never translate dice notation.
6. No new persisted state unless an OWNER DECISION below explicitly adds it; if it does, it goes through `SafeStorage` with a fallback factory and validator, and is documented in `.claude/rules/browser-state.md`.

## 3. Findings the work is based on

The review looked at the live GM and Player Preview screens at the default 340px panel width. Severity: **P1** fix, **P2** should fix, **P3** polish/verify.

Things that are already good and must not regress: the camera/history strip is identical in both views; the `PLAYER PREVIEW` badge (gold mono uppercase) marks the mode clearly; `SHADOWBLIGHTED` follows the badge recipe; the biome tile makes cards scannable; unplaced cards already get a gold wash (`.has-unplaced`); Remove Echoes and Generate sanctuaries already ask for confirmation, and Echo removal is undoable.

Corrections to the first-pass review (so the implementer is not misled by it): the tool rows are already four semantic `role="group"` rows (View / Route+Locate / Echoes / Sanctuaries); the Reveal/Hide control is a real `aria-pressed` toggle, not a legend; accordion expansion of the active card is by design.

| ID | Sev | Finding |
| --- | --- | --- |
| F1 | P1 | The four tool rows have no visual grouping or hierarchy: same weight, no dividers, no captions. The collapsed rail shows hairline-separated groups, the expanded panel does not, so the two views of one toolbar disagree. The block is also tall (about 170px of a 340px-wide panel). |
| F2 | P1 | Finished regions dominate Hex stock. Most cards read "All N hexes placed" yet keep full height and the brightest element on the card (the cream 32px biome tile), so the cards that still need work do not stand out enough. |
| F3 | P1 | "Hex stock" with count "29" reads as 29 hexes, but 29 is the number of regions (cards). The rail count is announced as "regions generated". The heading and the number mean different things. |
| F4 | P1 | The card's inspect control is an "i" glyph in a visibly bordered ghost button with a hover-only tooltip ("Inspect region"). "i" means help/info elsewhere; this opens the Region Inspector. On touch there is no hover. The bordered rest state differs from the quiet transparent-border icon-button recipe in `design.md`. |
| F5 | P2 | An active, fully placed card shows a teal check line and, alone in the bottom-right corner, a trash button. The delete button floats with no row, and the card looks unfinished. |
| F6 | P2 | The terrain rating is four small dots (7px) tight under the title, with only an `aria-label` and no visible or tooltip meaning. New users cannot tell it is a Terrain Rating (days per hex, the N of the encounter roll). |
| F7 | P2 | Player Preview: the fog brush button is labelled only "Reveal / Hide" with two 14x20px mouse glyphs; the words "fog brush" appear only in the hint and the tooltip. Its pressed state is not discoverable until clicked; the hint says "here" without saying where. |
| F8 | P2 | Player Preview: "Back to GM" (leaving the mode) has the same weight and position as "Print player map" (a tool). The exit from a mode should not look like a peer action. |
| F9 | P2 | "New region" lives inside the scrolling area (`.j2-side-scroll`) above the list. With a long stock the Generate button scrolls out of reach; the form plus hint costs about 120px before the first card. |
| F10 | P3 | Pressed toggle "Biome colors" uses the documented gold selected fill and sits near the solid gold "Generate region". The hierarchy is correct by the design system; verify it stays unambiguous after F1. |
| F11 | P3 | Disabled Undo/Redo are dimmed to the point of being almost invisible before the first edit, so the control's existence is hard to discover. |
| F12 | P3 | The completion line and progress bar use teal. This is consistent with "teal is informational" but is not documented as a Journey rule. |

## 4. Work packages

Do P1 before P2 before P3. Each package lists the required outcome and acceptance criteria; the exact visual solution is the implementer's to design within the constraints, but must be shown (before/after screenshots) for review.

### WP1 - Toolbar grouping and rail parity (F1, F10)

Required outcome:

- The GM tool block reads as clearly separated groups. Recommended grouping, which also matches the rail's existing three GM groups: **View** (Biome colors, Player Preview) / **Tools** (Plan route, Locate Soul Echoes) / **Echoes and sanctuaries** (Soul Echoes, Remove Echoes, Generate N sanctuaries).
- Separation uses existing hairlines/spacing (`--line-faint`, `--s-*`), the same visual language the rail already uses. Do not add heavy boxes or new colours. A small caps caption per group is allowed only if it does not increase the block's total height; prefer no caption.
- Buttons in one group share a row where they fit and otherwise stack as equal-width rows. Row edges align; no ragged right edge.
- Keep the semantic `role="group"` + accessible name per group and the existing DOM order, so keyboard order is unchanged.
- Remove Echoes is confirmed and undoable, so it stays neutral at rest; per D2 it gets the documented remove/delete hover and focus treatment (fear-red edge plus `--fear-tint`, like `.icon-btn--danger`) and nothing more. The confirmation dialog stays.

Acceptance:

- Total height of the controls block is measured before and after (DevTools, same viewport) and does not increase; the expected result is a reduction.
- EN and RU: no clipped label at the 340px panel width, on a 1366x768 laptop and at the narrowest desktop width in `design.md` "Responsive breakpoints" (the longest RU rows today are "Plan route + Locate" and Fit).
- Panel group order and the rail group order are identical; each rail button has the same tooltip and pressed state as its panel twin.

### WP2 - Hex stock: count semantics and finished-card density (F2, F3, F5)

Required outcome:

- Resolve F3 per D1: the heading stays "Hex stock" and the number beside it becomes the hexes still to place ("6 to place"; when it is 0, a muted "all placed"). The region total moves into the tooltip/`aria-label` of that count ("29 regions - 6 hexes left"). The rail count follows the same rule and its aria text announces both numbers. Counts are derived from existing state in the view; no model change.
- Finished (fully placed) cards that are not the active card become a compact single-row presentation: symbol, name, ordinal, status on one line (or an equivalent that is clearly shorter). Cards with hexes still to place keep today's richer presentation and remain visually dominant.
- Dim the biome tile on finished cards (or reduce its contrast) so it no longer outshouts the title. It must still be recognisable; do not hide it.
- The active card, when complete, puts the "all placed" line and the delete control on one row (text left, delete right, same baseline). No control floats alone in a corner. Delete keeps its confirm dialog.
- Stock order and the `#N` ordinal stay exactly as they are (ordinal is part of how regions are named in the inspector and aria text). Compaction is presentation only; no data or order change. No filter and no re-sort (D3).

Acceptance:

- With 29 regions, 27 of them finished, the list height is measured before and after and is clearly shorter (record the numbers).
- At a 768px-tall viewport, at least one more card is visible without scrolling than before.
- Expanding/collapsing the active card still works with mouse and keyboard (`aria-expanded`, `aria-controls` unchanged); no layout jump of sibling cards other than the intended accordion expansion.
- Drag handles (`.j2-handle`) and drop behaviour are untouched.
- Contrast of the status text on cards (`.j2-card-sum`, mono xs, `--parchment-dim`) is measured and meets the contrast bar `design.md` requires for text; if it does not, raise the token step rather than hand-picking a colour.

### WP3 - Inspect control (F4)

Required outcome:

- Replace the "i" glyph with one that reads as "open region details" (candidates: magnifier, or a side-panel/"details" glyph). The designer picks one and checks it against every other use of `ICON.info` on the site so the glyph's meaning stays unique. It must not be a help/info mark.
- Align the rest state with the quiet icon-button recipe in `design.md`: transparent border at rest, neutral hover, gold `is-on` while that region is open in the inspector (existing behaviour), global focus ring.
- The accessible name and tooltip stay "Inspect region ..." (existing keys `journey2_inspect_region`, `journey2_inspect_aria`); if the glyph changes the wording, change the key text in both languages.
- Hit area stays at least 28px; no pseudo-element enlargement on a 28px control (per `design.md`).
- A fully overtaken region still has no Inspect button (PD-038/PD-039).

Acceptance: the control is identifiable without hover (glyph alone suggests "details"), looks like the other icon-only controls in the panel (undo/redo/collapse), and its `is-on` state is visible in forced-colors mode.

### WP4 - Terrain rating legibility (F6)

Required outcome:

- Keep the four-dot form. Make the meaning discoverable: a tooltip on the dots (for example "Terrain 3 - 3 days per hex", reusing `journey2_terrain_n` / `journey2_days_per_hex`), slightly larger dots (7px -> a token-aligned size) and a small gap below the title so the row no longer touches it.
- Keep `role="img"` with the `aria-label`; do not duplicate the announcement.

Acceptance: hovering or focusing the dots on a card shows the tooltip in both languages; dots stay legible at the compact finished-card presentation from WP2 (or are intentionally omitted there; state the choice).

### WP5 - Player Preview panel (F7, F8)

Required outcome:

- Fog brush: give the toggle a visible name ("Fog brush", RU per glossary) so the hint's wording refers to something on screen. Keep "Reveal" / "Hide" with the two mouse glyphs as the secondary line of the same button. Enlarge the glyphs enough that the highlighted (gold) button of each mouse is legible (the current 14x20px is the minimum; test larger).
- The pressed state (`aria-pressed="true"`, existing gold fill) must be unmistakable and match the pressed toggles in the GM view; the map chip "Fog brush active ..." keeps working.
- The brush is NOT armed automatically on entering Player Preview (D5); behaviour is unchanged. The panel makes the unarmed state obvious instead.
- Rewrite the hint (`journey2_preview_hint`) so it says what to do and where, for example: "Unexplored hexes show no generated content. Turn on the fog brush, then click the map: left button reveals, right button hides." The implementer proposes the final EN and RU; RU is checked against the glossary.
- Mode exit: "Back to GM" is moved out of the peer list of tools and placed with the mode indicator (for example a ghost action on the same row as the `PLAYER PREVIEW` badge), so the badge + exit read as one header. Fog brush and Print stay below as tools. Escape behaviour and keyboard order are unchanged or improved (exit reachable early in the tab order is acceptable).
- Mirror in the rail: the preview rail group keeps paint / print / back, with the same names, tooltips and pressed state. Note the rail currently shows only the left-mouse glyph for the brush; make sure the pressed state is visible there too.

Acceptance: a first-time viewer can tell, from the panel alone and without hovering, that there is a brush, how to arm it, what each mouse button does and how to leave the mode. EN and RU fit at 340px.

### WP6 - New region block and vertical budget (F9)

Required outcome (D4: split the panel):

- The "Generate region" button is pinned in the fixed header of the panel, directly under the toolbar and above the scrolling list. It is a single full-width primary row: the "New region" heading and the hint paragraph no longer take a row of their own. The hint text moves to the button's tooltip and `aria-describedby`, and stays visible as the empty-state copy when the stock is empty.
- Only the Hex stock heading row and the cards scroll. The heading row (title + count from WP2) is sticky at the top of the list.
- The error line (`#j2-gen-error`) and the banner keep working and are shown without pushing the button out of view.

Acceptance: with 29 regions, scrolling to the bottom of the list still leaves "Generate region" visible; the pinned block is no taller than one button row plus its spacing; the first card's top edge sits higher than today at the same viewport, and at 1366x768 more of the list is visible than before (record the numbers). If this fails its measurement, stop and report; do not fall back to another layout on your own.

### WP7 - Polish and verification-only items (F11, F12)

- Disabled Undo/Redo: raise the disabled treatment (and, if needed, the disabled token step) so the icons stay discoverable while clearly inert. Do not make a disabled control look clickable.
- Teal completion/progress: do not change it unless review finds a conflict. Document the rule in `design.md` "Journey map panels": teal marks informational progress/completion in the stock cards; gold stays selected/primary; red stays destructive.

## 5. Decisions (settled by the UX lead)

These are final for this task. Record D1, D2, D4 and D5 as new PD entries in `docs/product-decisions.md` as part of the work (D3 is a negative decision and gets a one-line note in the same entry).

| ID | Decision | Why |
| --- | --- | --- |
| D1 | Heading stays "Hex stock". The number beside it is the hexes still to place ("6 to place", muted "all placed" at 0, gold-soft emphasis while above 0). The region total lives in the tooltip/aria text ("29 regions - 6 hexes left"). The rail count follows the same rule. | A number beside a heading should answer the user's working question, which is "how much is left to place", not "how many records exist". The count 29 next to "Hex stock" read as 29 hexes. Region count is secondary information and is still reachable. |
| D2 | Remove Echoes: neutral at rest, fear-red edge and tint on hover and focus only (the `design.md` remove/delete role). | The action already has a confirmation and Undo, so permanent red would shout at a protected action; but it removes campaign data and must not look identical to a harmless toggle when the pointer arrives. |
| D3 | No "needs placing only" filter and no re-sort in this task. Density (WP2) plus the existing unplaced highlight solve the scanning problem. Revisit only if long stocks still hurt after WP2. | A re-sort breaks the stable `#N` ordinals used in the inspector and aria text; a filter is a new persisted view preference and needs its own decision. Compact finished cards fix most of the problem for free. |
| D4 | Split the panel: "Generate region" is pinned under the toolbar as one full-width primary row; only the Hex stock heading row and cards scroll. | The creation action is the primary, repeated action and must never scroll out of reach. A single pinned row costs less height than the heading + hint + button block it replaces. Sticky-header-only would still scroll the button away. |
| D5 | The fog brush is not armed automatically when Player Preview opens. | Arming silently changes what a click and a drag do on the map (reveal instead of pan) the instant a GM enters the preview. Making the unarmed state obvious (WP5) fixes discoverability without that risk. No PD-034 amendment needed. |

## 6. Out of scope

- Map canvas, hex rendering, fog/Biome Tint/route/Echo/Shadowblight logic, Region Inspector content, sanctuary overlay, Print Preview.
- Any change to `js/journey2-model.js`, projection, print, storage schema or command set.
- Prep, catalogue, header or any non-Journey surface.
- New icons beyond what WP3 needs, new fonts, new colour roles.
- Touch and mobile support of any kind. Phones and touch-first devices are not supported (desktop and laptop only), so there is no mobile breakpoint work, no hit-area work for touch and no touch observation in this task. The brush copy may keep describing the left and right mouse buttons.

Planned as a separate iteration (a later task, after this one ships so the drawer is the visual baseline): a UX review of the Region Inspector and the map overlays (the encounter header and roll, the sanctuary overlay, Locate / Route / Shadowblight bubbles, the fog chip). The model and storage are not UX work and stay out unless a concrete UX requirement forces a model change, in which case it is raised as its own decision with a migration plan.

## 7. Verification and definition of done

Follow `CLAUDE.md` "Definition of done" and `docs/manual-qa.md`. In addition:

1. `node --test tests/*.test.js` and `node scripts/validate-data.js` pass; run the full chain from `CLAUDE.md` "Commands" if `index.html` or the build wiring is touched. Add or adjust tests only for pure logic you add; UI-only changes are verified in the running app.
2. Verify in the running app, not by unit tests alone: GM view with an empty stock, with a few regions, and with a long stock (29+ regions, mostly finished); an active complete card; an active incomplete card; Player Preview with the brush off and on; the collapsed rail in both modes.
3. Both languages (EN, RU) at the 340px panel width, on a 1366x768 laptop viewport, at 125% and 150% OS/browser scaling (common on laptops), and at the narrowest desktop breakpoint in `design.md`. Mobile widths are not checked.
4. Keyboard: tab order through nav, tool groups, cards, inspect/delete, preview controls; Enter/Space activation; Escape behaviour in Player Preview unchanged.
5. Accessibility: visible focus everywhere, accessible names on every icon-only control, forced-colors check of pressed/`is-on` states, `prefers-reduced-motion` respected, measured contrast for any text whose colour or background changes.
6. Deliver before/after screenshots (GM, Player Preview, collapsed rail, EN and RU) and the measured numbers called for in WP1, WP2 and WP6.
7. Write durable decisions into their owners: new or changed rules in `design.md` "Journey map panels", settled owner decisions in `docs/product-decisions.md` (new PD entries), and `docs/architecture.md` only if structure changed. Update the `CLAUDE.md` Journey summary only if a PD it cites is amended.
8. Commit and push per `CLAUDE.md` "Git workflow" once the above holds; run `git status` and `git log -1` first, since several sessions share this working tree. Do not commit unrelated untracked Journey documents already in the tree.
