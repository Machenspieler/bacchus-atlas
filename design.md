# Bacchus's Atlas — Design System

This documents the visual language of a dark, bilingual (EN/RU) field guide to
Daggerheart-compatible environments, journeys, and perils. Nothing here is
staged: every colour was measured against the surface it sits on, every size
step is a token, and the tone follows the source material — a worn atlas, not
a SaaS dashboard.

The system lives in [`css/styles.css`](css/styles.css) as CSS custom
properties on `:root`, with the reasoning for each decision kept as comments
next to the rule it explains. This file is the map of that territory, not a
replacement for it — when the two disagree, the CSS (and its tests) win.

## Core philosophy

- **Measured, not guessed.** Every text/border colour in `:root` carries its
  contrast ratio against the surface it's used on as a code comment (e.g.
  `--parchment: #e9dfc7; /* 12.74:1 */`). A colour that drops below AA gets
  replaced, not excused — see `--muted` and `--fear-soft`, both bumped after
  the original shade measured under 4.5:1.
- **Gold is the only affirmative colour.** `--hope` (and its `-soft`/`-hover`/
  `-ink` variants) is reserved for "this is selected, this is primary, this is
  the thing to click" — the active nav pill, `.btn-primary`, the focus ring,
  the pinned-list toggle. Nothing decorative borrows it.
- **Three border weights, not one.** A single mid-grey border read as
  invisible on a card (1.34:1), so resting, default, and hover/interactive
  states each get their own step (`--line-faint`, `--line`, `--line-strong`),
  each strong enough to actually read as an edge.
- **One focus indicator, everywhere.** `:focus-visible { outline: var(--focus-ring); }`
  is global: one gold 2px ring, never a second colour, never a border-only
  swap. Only its *placement* varies, in three offsets:
  - **external** (`--focus-offset`, 2px) — standalone controls with room around
    them: buttons, links, triggers, text inputs, session control.
  - **tight** (`--focus-offset-tight`, 1px) — small boxes beside a neighbour or an
    edge: icon buttons, rank icons, thumbnails, the Prep title input.
  - **inset** (`--focus-offset-inset`, -2px) — boxes whose edge is a shared border
    or a clip: the language switch, stepper/segments, Prep rows, menu items,
    multiselect rows, the notes textarea.

  **Card-style surfaces** (`.card`, `.list-card`) wear the ring themselves via
  `:has(.…-open:focus-visible)`; the stretched button inside draws none, and the
  card keeps its rest border so hover (border step + lift) and focus (ring) stay
  distinguishable. A **selected + focused** control keeps a ring that contrasts
  with its fill (the selected language segment is gold, so its ring is dark and
  sits 4px in). A visually-hidden input never draws its own ring — the row or
  sibling that stands in for it does.
  **Exemptions:** programmatically focused containers (`.modal`, `.adv-art-modal-card`,
  `.bp-popover`, `.sb-panel`, `.prep-central-title`) suppress their own outline;
  focus is on the dialog/panel, not a control. `aria-disabled` controls stay
  focusable by design (so their reason is reachable) and keep the ring; native
  `:disabled` controls cannot take focus.
- **Non-active states are five different things, not one dimmed look.**
  - **Disabled** — a compact control that exists but cannot be used (`.btn`,
    `.icon-btn`, `.bp-step`, `.prep-select-checkbox`, `.sb-ctl`, the unavailable
    `.env-prep-btn` glyph). One recipe: `opacity: var(--opacity-disabled)` (0.5 —
    the only opacity in the system for this), `cursor: not-allowed`, no hover
    fill/border/colour (hover restores the variant's *own* resting look, so a ghost
    button never gains a fill), no pressed offset. Native `:disabled` is preferred
    (not focusable, no `pointer-events: none`); `aria-disabled="true"` is used only
    where the control must stay focusable so its reason is reachable (`.env-prep-btn`,
    sound-board `.sb-ctl`, the Prep "★ ✓" button, the Delete menu item) and then
    needs an explicit activation guard in JS.
  - **Unavailable** — a labelled row or option the current context rules out
    (`.atl-row.is-unavailable`, `.prep-menu-item.is-disabled`). Text is **not**
    faded: the label swaps to `--muted` (one muting mechanism — never muted colour
    *and* opacity), so a Russian label still reads. Only a checkbox box inside it
    takes `--opacity-disabled`. The reason (hint line / tooltip) stays visible.
  - **Inactive** — not selected/active but still interactive (unpressed
    `.sb-ctl`, unselected segment, idle toggle). Never dimmed, never uses
    `--opacity-disabled`; keeps hover, focus ring and click affordance.
  - **Loading** — work in progress, not a refusal. `.btn[data-loading]` is natively
    disabled to block a second click but stays at full opacity with its spinner;
    a loading `.sb-sound` tile keeps its icon at `--opacity-disabled` plus a corner
    spinner and `cursor: progress`.
  - **Failed** — an error, not a mute. A failed `.sb-sound` tile has a dashed edge,
    muted icon colour and the fear-coloured alert glyph; its icon is not also faded.
  Hover is suppressed on every disabled/unavailable/loading/failed element. Hide vs
  disable for no-op controls is unchanged and deliberate: the adversary search "×" is
  hidden when empty, the item-filter clear button stays (disabled) so the toolbar
  never shifts. Selected + disabled (a checked box) keeps its gold fill at the same
  token.
- **The book, not the app.** Display type is a classical inscriptional face
  (Forum) used only for names/headings; body copy is a literary serif
  (Spectral); numbers, dice, and stats get a monospace face (JetBrains Mono)
  so values in a column actually line up. Prep is the one screen that
  breaks from this on purpose (see below) because it's a dense working tool,
  not a page to read.

## Palette

Defined once in `:root` in [`css/styles.css`](css/styles.css:13); do not
hard-code a hex value anywhere else.

| Token | Value | Role |
| --- | --- | --- |
| `--ink` | `#14110f` | page background (near-black) |
| `--ink-raised` / `--ink-hover` / `--ink-card` | `#1c1815` / `#241d17` / `#211c18` | one step up from the page: inputs, buttons, cards |
| `--parchment` | `#e9dfc7` | primary text — 12.74:1 on `--ink-card` |
| `--parchment-dim` | `#b9ad91` | secondary text — 7.60:1 |
| `--muted` | `#9a8f7d` | tertiary/meta text — 5.30:1 (AA) |
| `--hope` / `--hope-soft` / `--hope-hover` | `#d9a441` / `#f0cf8c` / `#e6b355` | the one affirmative accent — selection, primary actions, focus ring |
| `--hope-ink` | `#1c1408` | text colour *on* gold fills — 8.10:1 |
| `--fear` / `--fear-soft` | `#9c2b3b` / `#d9707e` | destructive actions, danger states |
| `--teal` / `--teal-soft` | `#3f7b74` / `#6fa89f` | structural accent (biome chips) — never affirmative, never a call to action |
| `--line-faint` / `--line` / `--line-strong` | `#3a322b` / `#4d4238` / `#6a5d4f` | internal divider / default edge / hover edge |

A soft radial wash of gold and crimson (`body`'s `background-image`) sits
behind everything, plus a single fixed watermark of the atlas illustration on
the main catalog-shaped routes only (`body[data-route="catalog|lists|list|journey|prep"]::before`)
— scoped to routes, not URLs, and switched off automatically when a modal or
an environment backdrop already owns the screen. It's disabled entirely under
`forced-colors: active`.

`color-scheme: dark` is set once on `:root` so native chrome (scrollbars, the
`<select>` popup, autofill) follows the theme without extra rules.

## Typography

| Token | Face | Used for |
| --- | --- | --- |
| `--font-display` | Forum, 400 weight only (no bold cut exists) | environment/card/detail titles, the site `<h1>` |
| `--font-body` | Spectral | body copy, buttons, form fields |
| `--font-mono` | JetBrains Mono | dice notation, stat numbers, counters |
| `--font-ui` | system sans (`system-ui`, Segoe UI, …) | **Prep only** — see below |

Fonts are requested via a `<link>` in `index.html` with `preconnect`, not an
`@import` inside `styles.css` — an `@import` can't start downloading until
the stylesheet itself has been fetched and parsed, costing a full extra round
trip before first paint.

Sizes are tokens (`--fs-micro` 11px through `--fs-2xl` 31px), each paired with
its own line-height (`--lh-*`). Display type uses `--tracking-display`
(0.02em); all-caps labels use the wider `--tracking-caps` (0.1em) because
uppercase inscriptional caps need tracking to read, not weight.

**Prep's exception:** it's a dense working tool (three simultaneous
pickers, checkboxes, counters), not a page meant to be read start to finish,
so it uses `--font-ui` instead of the display/body serif pairing. This
typeface never appears on the brand (header, `<h1>`) or on any reading page
elsewhere in the app.

## Spacing, radii, elevation, motion

- **Spacing** is a 4px base scale, `--s-1` (4px) through `--s-10` (80px).
  Never write a raw pixel margin/padding/gap — reach for the nearest step.
- **Radii** are scaled to the object, not uniform: `--r-xs` (2px, chips/
  badges) < `--r-sm` (4px, inputs/buttons) < `--r-md` (6px, cards) < `--r-lg`
  (10px, modals/popovers) < `--r-pill` (999px, pill controls).
- **Elevation** is four shadow steps (`--e-1`…`--e-4`), each a two-layer
  shadow (tight + diffuse) rather than one blurred rectangle — used for card
  rest/hover, modals, and the environment detail overlay in increasing order.
- **Floating surfaces** come in three families by role:
  - *Interactive panels* (`.ms-panel`, `.prep-menu`, `.bp-popover`,
    `.sb-panel`) share one shell, declared once in a grouped rule above
    `.ms-panel`: `1px solid --line-strong`, `--r-lg`, `--e-3`, `--ink-raised`
    (the Soundboard keeps `--ink-card` because its tiles are `--ink-raised`
    wells). Rows inside use `--r-sm`; hover is the neutral
    `rgba(255,255,255,0.06)`, selected stays gold. Width, padding and interior
    layout remain per-component.
  - *Small informational surfaces* (`.tooltip`, `.sp-session-hint`,
    `.dice-result-pop`) stay compact: `--r-sm`, tight padding, `--e-3`
    (tooltip is `--line-strong`; the hint and dice pop use a gold edge).
  - *Modals* (`.modal`, `.adv-art-modal-card`) use `--r-lg` + `--e-4`. The
    countdown overlay keeps its teal frame as a semantic exception.
  A new dropdown/popover joins family A by adding its selector to the grouped rule.
- **Motion** has two timing tokens (`--t-fast` 120ms, `--t-base` 180ms,
  `--t-slow` 260ms) and two eases (`--ease-out`, `--ease-enter`). Prep
  Prep's item strip explicitly respects `prefers-reduced-motion` and has no
  autoplay/idle-timer animation of any kind — nothing in that controller
  moves except a direct user action.

## Components

### Cards (`.card`, `.card-art`, `.card-body`)
The catalog grid is `repeat(auto-fill, minmax(340px, 1fr))` — 340px is set by
the point a Russian environment name starts wrapping to three lines, and
there's deliberately no upper `minmax` bound (auto-fill counts repetitions
against the *maximum* track size, so a `minmax(340px, 420px)` would drop a
1440px viewport down to two columns instead of three).

A card is a flex row: a fixed 95px `.card-art` picture panel (cropped 1:3,
anchored top so the biome reads in the visible portion and a short card just
cuts the bottom of the same image) beside a flexible `.card-body`. The tier
badge sits on the picture (`.card-tier-badge`, absolutely positioned), never
in the text column, so it reads as a stamp rather than copy. The whole card
opens the detail overlay through one real anchor (`.card-open`, `all: unset`)
so the accessible name and the tab stop live in one place — never a `<div>`
with a click handler.

Hover raises the border to `--line-strong`, lifts the card 2px, and steps the
shadow from `--e-1` to `--e-2`. `content-visibility` was tried and measured
out: card heights vary 176–235px, so a single intrinsic-size estimate over-
or under-shoots by 12–18% depending on viewport, and a scrollbar that lies
about catalogue length costs more than the skipped paint saves.

### Environment action group (`.env-actions`)
Top-right of every environment card and in the detail card's title row:
`[.env-prep-btn][.card-add-btn]` — add/remove from the current Prep, then the
bookmark (list membership). Two 28px square buttons that touch but never
overlap; there is deliberately **no** `::after` hit-area enlargement here, so a
click between the icons cannot reach the neighbour. Muted at rest, gold on
hover. The Prep button draws the reusable Environment symbol (an open compass
ring with N/W/E points, a main and a smaller mountain, a winding road; 24×24,
`currentColor`, no gradients) with a lower-right badge carried in the ring's
gap: **plus** = available, **check** = selected (gold symbol, frame only on hover, still
removable at the cap), plus but dimmed with no hover and `not-allowed` =
unavailable because the Prep is full. State is always badge glyph +
`aria-pressed` + gold colour together, never colour alone. The same symbol without
the badge is the neutral Prep "Environments" section icon.

### Buttons (`.btn`)
One base class, four modifiers: `.btn-primary` (gold fill, the only
affirmative surface), `.btn-ghost` (transparent), `.btn-danger` (fear-red
outline), and `.btn-sm` (compact). `.active` is a *fill*
(`rgba(217,164,65,0.14)` background + gold border), not a border alone — a
border-only active state was visually indistinguishable from hover. A loading
button swaps its label for a centered spinner via `[data-loading="true"]`
without changing width, so the layout doesn't jump.

### Icon-only buttons (`.icon-btn`)
Icon-only controls are grouped by **semantic role**, not squeezed into one
size. Equivalent semantics share state treatment; the box size
(`--ib-size`: 24 / 28 / 32 / 34 / 40) follows the density of the surface.
- **Dismiss / clear** — `.icon-btn` alone. Neutral: muted → parchment on
  hover over a quiet `--ink-raised` fill, never red or gold. One SVG glyph,
  `ICON_CLOSE` (inherits `currentColor`), replaces every `×`/`&times;` text
  glyph. Embedded in a rectangular surface → `--r-sm`.
- **Neutral utility** — `.icon-btn--utility` (copy, reroll, "more" menu).
  Same quiet fill, icon turns `--hope-soft`; `aria-expanded` adds a `--line`
  edge. `.bp-step` is the same recipe as a segment of its stepper's own box.
- **Remove / delete** — `.icon-btn--danger`. Muted at rest, fear-red edge +
  `--fear-tint` on hover/focus. Only for content that actually leaves the
  user's data (a list, a Prep entry, a whole Prep category); clearing a
  search/filter stays neutral.
- **Circular navigation / overlay** — `.icon-btn--circle` (enclosed, gold
  edge on hover: item-strip arrows, countdown ±) and `.icon-btn--overlay`
  (dismiss over imagery: translucent fill, neutral hover). Always `50%`.
- Borders are 1px **transparent** at rest so hover/pressed never shifts
  geometry; enclosed roles (circle, overlay, soundboard `.sb-ctl`) keep a
  visible `--line`. Focus is the global ring, tight (1px) offset on these small boxes.
- Hit area: only the 24px controls opt in (`.icon-btn--reach`, ::after grows
  to 44px); 28px and larger are already sufficient and have none.
  `--ib-hover-bg` steps up to `--ink-hover` when the host is itself
  `--ink-raised` (the Battle Points popover).
- Deliberately outside the family: `.card-add-btn`/`.env-prep-btn` (gold
  affirmative toggles with their own selected states), `.sb-ctl` (enclosed
  audio control with `aria-pressed`), and `.item-clear-btn` (a `.btn` sized to
  the search field; it shares the glyph only).

### Chips & badges (`.environment-type-chip`, `.biome-chip`, `.region-chip`, `.badge`)
Share one shape (`--r-xs`, `--fs-xs`, uppercase, `--tracking-caps`). Type
chips are neutral (`--type-chip-border`, `--muted` text); biome chips use the
structural teal (`--teal` border, `--teal-soft` text) — teal is picked
specifically because it reads as informative metadata, never as a second
affirmative colour competing with gold.

### Tier markers (`.rank-icon`)
A hexagonal badge (clip-path, drawn with pseudo-elements so the focus ring can
be a full box around the clipped shape rather than following the hexagon
outline). `.active` inverts to a gold fill. Two sizes: full-size in the detail
overlay, `.rank-icon-sm` (26px, scaled up to 44px on the touch breakpoint) on
cards and pills.

### Toolbar & multiselect
Text inputs and `<select>` share one field style (`--h-md` 40px tall,
`--line`/`--line-strong`/`--hope` border progression for rest/hover/focus).
The custom multiselect dropdown (used for the "type" filter) renders its own
scrollable checkbox list rather than relying on native `<select multiple>`
chrome, which reads as loud, unstyleable chrome next to the parchment-on-ink
theme; a user's forced-colors/high-contrast mode is still respected and
overrides it.

### Modal & environment backdrop
A detail overlay is read against a blurred, full-screen copy of the
environment's own art (`.environment-backdrop`) rather than a flat scrim —
the card supplies its own opaque surface, so no text in the modal is ever
contrast-checked against the backdrop itself. The modal grows to its content
and scrolls inside the overlay; switching language re-renders the same card
in place rather than closing and reopening it. The overlay dismisses itself on
an outside click — a click already carries an unambiguous "went here to leave"
meaning, so no separate close affordance duplicates that gesture.

### Toast & tooltip
Toasts stack from one screen corner (the same corner the "back to top" button
claims, so the two never collide). The tooltip is a single reused custom
element rather than the native `title` attribute, which waits ~700ms, can't be
styled, and never appears for a keyboard-only user.

### Item card
Built from the atlas's own parts — the same `.modal` shell, `.modal-header`
(Forum title, × close), chips and `.btn-ghost .btn-sm` buttons as an
environment's detail card — so an item reads as the same kind of page. Only
what an item needs beyond that is specific to `.loot-*`: the square artwork
panel, the roll/kind/source chip row (consumables use the teal biome chip), and
the craft chain (teal dotted links). No second typeface or palette.

### Prep (`#/prep`)
The one screen that departs from the reading-page idiom on purpose: `--font-ui`
instead of the serif/display pairing, a collapsible header chrome
(`#prep-chrome[data-collapsed]`), and a permanently-visible ~20px
checkbox (18px inside a 32px hit area — the shared `--sel-*` tokens) as the *only* control that adds or
removes a selection anywhere on the page — never a whole row/card silently
toggling on click. The item catalog's tiles (`.prep-item-card`) are the one
exception to "permanently visible": there, the tile is an art-first square
dominated by the item's artwork, and the checkbox slides in on hover/
`:focus-within` instead of sitting in the tile at rest — the environment and
adversary pickers are unaffected and keep the always-visible checkbox. See
the "Prep" section of `CLAUDE.md` for the full interaction contract;
this file only covers its visual departure from the rest of the app.

**Prep Bar** (`.prep-bar`): the one place Prep breaks its
own `--font-ui` rule — the active prep's name is set in `--font-display`
(`--fs-xl`, `--fs-lg` on phones) because it is a *title*, not a control
label; everything else in the bar (status, buttons, menus) stays `--font-ui`.
The bar is a dark, restrained local surface (`--sp-bar-bg`, a translucent
`--ink` gradient with a faint gold wash, `--line-faint` border) laid over the
atlas watermark so the artwork stays visible but never competes with the
controls. Save status is muted text with a 14px icon (gold check on success,
Fear alert on failure, neutral dot before the first save); Delete in the
actions menu is the only Fear-coloured item and sits below a divider. On
phones it becomes two rows (title + New/actions, then status) with 40px
controls reaching a 44px hit area through `::after`.

The bar is a three-zone grid — identity/status, **Session Notes**, actions.
Session Notes is a `--fs-xs` caps `--muted` label over a two-line (~46px)
`resize: none` textarea on the shared input surface (`--ink-raised`,
`--line` → `--line-strong` → `--hope` border, the standard gold focus ring
drawn inset so it never spills into the neighbouring zones). The centre column
flexes; the bar grows about 7px to fit it. On phones the notes drop to a third
row (best-effort). Collapsing the header hides the whole bar, notes included.

## Responsive breakpoints

The layout uses a small, deliberate set of breakpoints rather than a generic
grid framework — each tied to a specific content collision, not a device
category. Pairs are always complementary (`<=N` with `>=N+1`); never write a
`max-width` of N+1 for a boundary whose other side is `min-width: N+1`
(the old `max-width: 641px` watermark rule made 641px a one-pixel state of
its own). Media queries cannot read CSS custom properties, so consistency is
kept by this table and the comments at each rule. Capability queries
(`pointer: coarse`, `hover: none`, `forced-colors`, `prefers-reduced-motion`)
are not breakpoints and are not listed.

| Threshold | Scope | Purpose |
| --- | --- | --- |
| `<=640` / `>=641` | global (also JS `ENV_ART_ROOM`, `sizes` hints) | phone composition: compact header, sheet-style detail card, dimmed watermark, stacked toasts, full-width filter rows |
| `<=400`, `<=480` | component | nav labels drop to icons; detail footer and Prep "New" compaction |
| `<=760` / `>=761` | Prep, Journey | Prep bar and picker toolbars wrap, 44px touch rows; Journey's two generator columns stack |
| `<=900` / `>=901` | Catalog, Prep | Catalog filters collapse behind the disclosure / sit inline in the three-column bar; Prep goes single column |
| `641–1091` | Catalog | grid capped at two 420px cards (a third 340px column needs a 1092px viewport) |
| `<=1199` / `>=1200` | Prep | two-column (central on top) vs three-column workspace; page scroll becomes internal panel scroll |
| `1200–1439` | Prep | laptop range: shell padding and gap drop one step, grid fractions `.8fr / 1.5fr / 1fr` (≈592px central at 1366) |
| `>=1440` | Prep | full-width shell: the Prep cap is dropped (the global header stays narrower on purpose) |
| `<=1536` | Prep | Environment/Adversary picker counters hide (search field would squeeze under ~90px); the Type panel anchors to its trigger's right edge |
| `>=1800` **and** height `>=900` | Prep | comfortable central density (`--pc-*` token overrides only); both axes required |
| `>=1480 / 1836 / 2192 / 2548` | Catalog | geometry-derived shell steps: each adds one 340px card + 16px gap (356px) to the grid. Not round numbers on purpose |

Container queries own thresholds that depend on a panel's own width, not the
viewport: the catalog bar's 1439px (toolbar 942px + two 234px status columns;
equals the 1480px shell step minus its 40px padding), the Prep Items toolbar's
1100px (its single grid row needs ~1077px EN / ~1101px RU — below that it
wraps), the Items counter at 640px, and the `prep-central` / `prep-adv-col`
rules.

Known quirk: a viewport query cannot see a classic scrollbar, so on Windows
the 1092px third column and the 1480px fourth arrive ~15px later than the
table says. The layouts in between are valid, just one column narrower.

## Accessibility constraints

- Every colour pairing that carries text ships its measured contrast ratio as
  a comment at the point of definition — a new colour must clear the same bar
  before it's added, not be eyeballed.
- Focus is always visible (`:focus-visible`, never suppressed) and never
  colour-only — active/selected states pair a fill or border change with
  something else (icon state, text change), per `CLAUDE.md`'s save-status and
  environment-limit rules.
- Hit targets: visual size stays true to the design (24px chips, 26px rank
  icons) while the actual clickable area is enlarged via a pseudo-element
  inset (`::after { inset: -10px }`) to reach ~44px for touch, rather than
  inflating the visible control itself.
- `forced-colors: active` and `prefers-reduced-motion` are both explicitly
  respected, not just inherited by accident (see the atlas watermark and the
  Prep item-strip scrolling respectively).

## Anti-patterns — do not reintroduce

- Don't hard-code a hex colour, pixel spacing value, or font stack outside
  `:root` — extend the token list instead.
- Don't give teal (or any colour besides gold) an affirmative/selected
  meaning — gold is the only "this is active/primary" colour in the system.
- Don't strip `:focus-visible`'s outline in favor of a border-only focus
  treatment.
- Don't add a second reading typeface (serif or otherwise) outside the
  Forum/Spectral/JetBrains Mono trio, and don't use `--font-ui` outside
  Prep.
- Don't add `content-visibility` or a similar layout-estimate optimization to
  `.card` — it was tried and measured to make the scrollbar lie.
- Don't reach for a native `<select multiple>` for a new multi-choice filter
  — follow the existing custom checkbox-list dropdown pattern instead.
