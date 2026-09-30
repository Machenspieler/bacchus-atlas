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
  is global. Older rules that stripped the outline and swapped a border colour
  instead now keep both — the ring is the indicator, the border is a bonus,
  never a replacement.
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

### Buttons (`.btn`)
One base class, four modifiers: `.btn-primary` (gold fill, the only
affirmative surface), `.btn-ghost` (transparent), `.btn-danger` (fear-red
outline), and `.btn-sm` (compact). `.active` is a *fill*
(`rgba(217,164,65,0.14)` background + gold border), not a border alone — a
border-only active state was visually indistinguishable from hover. A loading
button swaps its label for a centered spinner via `[data-loading="true"]`
without changing width, so the layout doesn't jump.

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
Deliberately a **copy** of the companion loot generator's item-card styling —
same tokens, same corner radius — because it's the same kind of object
(a stat card for a discrete piece of content) reused across two related
projects. Kept scoped to its own card boundary; nothing about it leaks into
the environment card's own conventions.

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

## Responsive breakpoints

The layout uses a small, deliberate set of breakpoints rather than a generic
grid framework — each tied to a specific content collision, not a device
category:

| Breakpoint | What changes |
| --- | --- |
| `max-width: 641px` | phone: toolbar filters collapse into a disclosure, watermark shrinks/dims |
| `min-width: 641px` | tablet and up: toolbar filters expand inline |
| `max-width: 480px` / `400px` | further compaction of specific controls (tier pills, search field) |
| `max-width: 760px` / `900px` | Prep's picker columns stack |
| `max-width: 1536px` | Prep's Environment/Adversary picker result counters hide (Items and central counters stay) |
| `min-width: 1200px` / `max-width: 1199px` | Prep's three-column layout threshold |
| `min-width: 1440px`+ (1480/1836/2192/2548px) | catalog grid gains extra columns on very wide screens |

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
