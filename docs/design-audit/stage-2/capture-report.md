# Stage 2 — Visual Screenshot Suite: Capture Report

Evidence capture for [docs/design-consistency-audit.md](../../design-consistency-audit.md). No application code, markup, CSS or tokens were modified; nothing in this report is a design judgement.

## Environment

| Item | Value |
|---|---|
| Browser | Chromium (Playwright 1.56.1), version 141.0.7390.37, headless |
| Device scale factor | 1 (crops are magnified afterwards with nearest-neighbour, zoom recorded per file) |
| Locale / timezone / colour scheme | en-US / UTC / dark |
| App language | EN (`dhcodex_lang` seeded to "en"); a single RU context is used only for the `.badge` probe |
| Browser flags | `--font-render-hinting=none --disable-lcd-text` (greyscale AA so output does not depend on OS subpixel settings) |
| Server | in-process static server (`scripts/design-audit/lib.mjs#startServer`) serving the repository root unmodified (source, not `dist/`) on an ephemeral 127.0.0.1 port |
| Command | `npm run design:audit:screenshots` (= `node scripts/design-audit/capture.mjs`) |
| Commit | `a30ea5f` (working tree had unrelated untracked files; app source unmodified) |
| Date | 2026-10-02 |
| Determinism | Math.random replaced by a seeded xorshift and Date frozen at 2026-10-02T12:00:00Z before app boot (Journey rolls, timestamps); animations/transitions neutralised by injected test-only CSS; fonts, images and toasts awaited before every capture |
| Run time | 8m 28s |

### Audit state (deterministic, clean context per run)

Seeded into `localStorage` through the app's own keys before boot (never by editing HTML): `dhcodex_lang="en"`, storage notice dismissed, three lists (Frozen north / Heist night / Desert caravans) with environment memberships, and one Prep (“Audit prep”, schema v2) holding 3 environments (Harsh Desert, Port City, Ancient Tomb), 4 adversaries (Ahuizotl, Acid Burrower, Apprentice Assassin, Arch-Necromancer) and 4 items (ci1–ci4). Other profiles: `empty` (no data), `partial` (1 environment + 1 adversary), `hint` (Prep hint flag unset), `notice` (storage-notice flag unset). Journey entries are created through the real Roll/Keep buttons under the seeded PRNG.

## Coverage

| Metric | Count |
|---|---|
| Full-context screenshots (viewport / full page) | 91 |
| Component crops | 359 |
| Contact sheets (tiled real crops with captions) | 13 |
| Total image files | 463 |
| Viewports covered | 7 (1366x768, 1440x900, 600x900, 1920x1080, 640x900, 641x900, 642x900) |
| Captures reached through an interaction (hover / focus / click / type / scroll …) | 207 |
| Distinct page/topic groups | 11 |
| Capture steps that failed | 0 |

Page/topic groups: `catalog`, `checkbox`, `chips`, `detail`, `disabled`, `focus`, `journey`, `links`, `lists`, `prep`, `ui`.

| Viewport | Files |
|---|---|
| 1366x768 | 76 |
| 1440x900 | 278 |
| 600x900 | 1 |
| 1920x1080 | 80 |
| 640x900 | 5 |
| 641x900 | 5 |
| 642x900 | 5 |

## Stage 1 “Needs Visual Review” coverage

- [x] **Optical icon sizing and stroke weight (14/15/16/18/20px in 24/28/32px boxes)** _(Needs Visual Review 1)_ — `crops/1440x900__ui__icon-button-families-default__sheet.png`, `crops/1440x900__ui__icon-optical-by-svg-size__sheet.png`, `crops/1366x768__prep__stroke-sample-new-and-stepper__crop.png`
- [x] **Filled ITEM_* icons beside line icons** _(Needs Visual Review 2)_ — `crops/1366x768__detail__filled-item-icons-vs-line__crop.png`, `1366x768/1366x768__detail__item-modal.png`
- [x] **PNG vs inline-SVG Prep section icons** _(Needs Visual Review 3)_ — `crops/1366x768__prep__section-icon-adversaries__crop.png`, `crops/1440x900__prep__section-icon-environments__crop.png`, `crops/1920x1080__prep__section-icon-items__crop.png`
- [x] **Chips vs interactive pills distinguishable** _(Needs Visual Review 4)_ — `crops/1440x900__chips__all-families__sheet.png`, `crops/1440x900__chips__detail-dice-btn-in-text__crop.png`, `crops/1440x900__chips__detail-adversary-link-btn__crop.png`
- [x] **Prep 35 / 32 / 30px toolbar control heights** _(Needs Visual Review 5)_ — `crops/1440x900__prep__control-heights-row__crop.png`, `crops/1920x1080__prep__control-heights-row__crop.png`, `crops/1440x900__prep__bp-strip__crop.png`
- [x] **sp-session-control 12px radius beside 4px header buttons** _(Needs Visual Review 6)_ — `crops/1366x768__prep__session-control-default__crop.png`, `crops/1366x768__prep__session-control-hover__crop.png`, `crops/1366x768__prep__session-control-active-pressed__crop.png`
- [x] **Prep density at 1366 / 1440 / 1920 incl. central vs picker text and name↔remove spacing** _(Needs Visual Review 7)_ — `1366x768/1366x768__prep__all-sections-populated.png`, `1440x900/1440x900__prep__all-sections-populated.png`, `1920x1080/1920x1080__prep__all-sections-populated.png`
- [x] **Header (1180) vs full-bleed Prep content at 1440 and 1920** _(Needs Visual Review 8)_ — `1440x900/1440x900__prep__all-sections-populated.png`, `1920x1080/1920x1080__prep__all-sections-populated.png`, `crops/1440x900__prep__header-and-bar__crop.png`
- [x] **ms-panel vs prep-menu on the same page** _(Needs Visual Review 9)_ — `1440x900/1440x900__prep__ms-panel-open.png`, `1440x900/1440x900__prep__session-menu-open.png`, `crops/1440x900__ui__floating-surfaces__sheet.png`
- [x] **Focus visibility on prep-title-input and list-card-open** _(Needs Visual Review 10)_ — `crops/1440x900__focus__prep-title-input-focus__crop.png`, `crops/1366x768__lists__list-card-open-focus-visible__crop.png`
- [x] **.btn press feedback (:active absent)** _(Needs Visual Review 11)_ — `crops/1366x768__prep__standard-btn-hover__crop.png`, `crops/1366x768__prep__standard-btn-pressed__crop.png`
- [x] **Disabled contrast .35 vs .45 (and .4/.5/.7)** _(Needs Visual Review 12)_ — `crops/1440x900__ui__disabled-opacity-ladder__sheet.png`
- [x] **Gold-tint hover visibility .10 / .14 / .16** _(Needs Visual Review 13)_ — `crops/1440x900__ui__gold-tint-hover-family__sheet.png`
- [x] **641px gap between 640 and 641 breakpoints** _(Needs Visual Review 14)_ — `breakpoint-640-642/640x900__catalog__default.png`, `breakpoint-640-642/641x900__catalog__default.png`, `breakpoint-640-642/642x900__catalog__default.png`
- [x] **Hex tier icons (26px) vs 24px chips** _(Needs Visual Review 15)_ — `crops/1440x900__chips__card-tier-badge__crop.png`, `crops/1440x900__chips__detail-tier-hexagons__crop.png`, `crops/1366x768__catalog__toolbar-filters-active__crop.png`
- [x] **Empty states (.empty-state, .journey-empty, .prep-empty / .prep-sel-empty)** _(Needs Visual Review 16)_ — `1440x900/1440x900__catalog__empty-result.png`, `1366x768/1366x768__journey__empty.png`, `1366x768/1366x768__prep__empty-default.png`
- [x] **translateY(-2px) hover on .card vs none on .list-card / .journey-entry** _(Needs Visual Review 17)_ — `crops/1440x900__ui__card-hover-comparison__sheet.png`

## Items that could not be captured (or only partly)

- **.badge / .badge.pending** — Only rendered for untranslated environments (isTranslated() false); 0 of 300 environments lack a RU name in the current data, and none appeared on the first RU catalog page. Not reproducible without altering data.
- **ms-checkbox disabled** — ms-rows are never disabled in the shipped UI; the state does not exist to capture.

## Objective browser findings

_Measured or observed facts only; no judgement of appearance._

- At 1366px wide: `.header-inner` = 1180px (x 85.5); `.prep-wrap` = 1311px (x 20); `(min-width:1800px) and (min-height:900px)` does not match.
- At 1440px wide: `.header-inner` = 1180px (x 122.5); `.prep-wrap` = 1385px (x 20); `(min-width:1800px) and (min-height:900px)` does not match.
- At 1920px wide: `.header-inner` = 1180px (x 362.5); `.prep-wrap` = 1865px (x 20); `(min-width:1800px) and (min-height:900px)` matches.
- Prep central row (`.prep-sel--card`) is 56px tall at 1366×768 and 62px at 1920×1080; row name font 14px → 15px; remove button 32×32 → 34×34; central header 44 → 48px.
- Picker row name font is 15px at 1366 and 15px at 1920, versus central row name 14px / 15px.
- At 1366px the Prep central panel has 2 text node(s) that truncate or wrap: “Harsh Desert” (2 lines), “Ancient Tomb” (2 lines).
- At 1440px the Prep central panel has 0 text node(s) that truncate or wrap.
- At 1920px the Prep central panel has 0 text node(s) that truncate or wrap.
- 640→641px, catalog: `shell` {"x":0,"y":103,"w":625,"h":1526.2} → {"x":0,"y":133,"w":626,"h":1578.2}.
- 640→641px, catalog: `grid` {"x":16,"y":205.6,"w":593,"h":1281} → {"x":20,"y":243.6,"w":586,"h":1301}.
- 640→641px, catalog: `firstCard` {"x":16,"y":205.6,"w":593,"h":132} → {"x":20,"y":243.6,"w":586,"h":152}.
- 640→641px, catalog: `headerInner` {"x":0,"y":0,"w":625,"h":102} → {"x":0,"y":0,"w":626,"h":132}.
- 640→641px, catalog: `siteHeader` {"x":0,"y":0,"w":625,"h":103} → {"x":0,"y":0,"w":626,"h":133}.
- 640→641px, catalog: `cols` "593px" → "586px".
- 641→642px, catalog: `artOpacity` "0.14" → "0.26".
- 641→642px, catalog: `artSize` "640px" → "526.44px".
- 641→642px, catalog: `artFilter` "brightness(0.6) saturate(0.6) contrast(1)" → "brightness(0.75) saturate(0.75) contrast(1)".
- 640→641px, lists: `shell` {"x":0,"y":103,"w":625,"h":638.5} → {"x":0,"y":133,"w":626,"h":662.5}.
- 640→641px, lists: `grid` {"x":16,"y":119,"w":593,"h":566.5} → {"x":20,"y":149,"w":586,"h":566.5}.
- 640→641px, lists: `headerInner` {"x":0,"y":0,"w":625,"h":102} → {"x":0,"y":0,"w":626,"h":132}.
- 640→641px, lists: `siteHeader` {"x":0,"y":0,"w":625,"h":103} → {"x":0,"y":0,"w":626,"h":133}.
- 640→641px, lists: `cols` "593px" → "586px".
- 641→642px, lists: `artOpacity` "0.14" → "0.26".
- 641→642px, lists: `artSize` "640px" → "526.44px".
- 641→642px, lists: `artFilter` "brightness(0.6) saturate(0.6) contrast(1)" → "brightness(0.75) saturate(0.75) contrast(1)".
- 640→641px, journey: `shell` {"x":0,"y":103,"w":625,"h":694} → {"x":0,"y":133,"w":626,"h":718}.
- 640→641px, journey: `grid` {"x":16,"y":119,"w":593,"h":622} → {"x":20,"y":149,"w":586,"h":622}.
- 640→641px, journey: `headerInner` {"x":0,"y":0,"w":625,"h":102} → {"x":0,"y":0,"w":626,"h":132}.
- 640→641px, journey: `siteHeader` {"x":0,"y":0,"w":625,"h":103} → {"x":0,"y":0,"w":626,"h":133}.
- 640→641px, journey: `journeyCols` {"x":16,"y":274.3,"w":593,"h":466.8} → {"x":20,"y":304.3,"w":586,"h":466.8}.
- 640→641px, journey: `cols` "593px" → "586px".
- 641→642px, journey: `artOpacity` "0.14" → "0.26".
- 641→642px, journey: `artSize` "640px" → "526.44px".
- 641→642px, journey: `artFilter` "brightness(0.6) saturate(0.6) contrast(1)" → "brightness(0.75) saturate(0.75) contrast(1)".
- 640→641px, prep: `shell` {"x":0,"y":59,"w":625,"h":36637.7} → {"x":0,"y":76.6,"w":626,"h":36661.7}.
- 640→641px, prep: `grid` {"x":16,"y":75,"w":593,"h":36565.7} → {"x":20,"y":92.6,"w":586,"h":36565.7}.
- 640→641px, prep: `headerInner` {"x":0,"y":0,"w":625,"h":58} → {"x":0,"y":0,"w":626,"h":103.6}.
- 640→641px, prep: `siteHeader` {"x":0,"y":0,"w":625,"h":59} → {"x":0,"y":0,"w":626,"h":104.6}.
- 640→641px, prep: `prepWrap` {"x":16,"y":99,"w":593,"h":36541.7} → {"x":20,"y":116.6,"w":586,"h":36541.7}.
- 640→641px, prep: `prepMain` {"x":16,"y":276.3,"w":593,"h":36063.4} → {"x":20,"y":293.8,"w":586,"h":36063.4}.
- 640→641px, prep: `cols` "593px" → "586px".
- 641→642px, prep: `artOpacity` "0.14" → "0.26".
- 641→642px, prep: `artSize` "640px" → "526.44px".
- 641→642px, prep: `artFilter` "brightness(0.6) saturate(0.6) contrast(1)" → "brightness(0.75) saturate(0.75) contrast(1)".
- 640→641px, toast: `x` 16 → 20.
- 640→641px, toast: `y` 56 → 834.5.
- 640→641px, toast: `w` 593 → 226.5.
- 640→641px, toast: `bottom` "798.5px" → "20px".
- `.sp-session-control` radius 12px (120×32); header `.nav-btn` radius 4px (91.05×32); `.sb-trigger` 4px.
- `.prep-title-input` when focused: outline none; border-bottom colour rgb(217, 164, 65); box-shadow none.
- `.list-card-open:focus-visible`: outline 2px solid rgb(217, 164, 65) (offset 2px); box-shadow none.
- Prep section icons at 1440: svg 16×16 (inline SVG); IMG 16×16 (natural 64x64); IMG 16×16 (natural 64x64).
- Prep section icons at 1920: svg 18×18 (inline SVG); IMG 18×18 (natural 64x64); IMG 18×18 (natural 64x64).
- `.badge` availability: 0 instance(s) on the first RU catalog page; 0/300 environments lack a RU name.
- Journey seeded rolls: 3 regions kept, Shadowblighted present: true.

### Prep control boxes (rendered, CSS px)

| Control | 1366×768 (w×h) | 1440×900 (w×h) | 1920×1080 (w×h) | radius @1440 |
|---|---|---|---|---|
| prep-search input (env) | 164.5×35 | 183.86×35 | 223.39×35 | 4px |
| prep-search input (adv) | 119.53×35 | 142.3×35 | 204×35 | 4px |
| adv ms-trigger (Type) | 96×35 | 96×35 | 96×35 | 4px |
| item-clear-btn | 35×35 | 35×35 | 35×35 | 4px |
| item toolbar | 1277×40 | 1351×40 | 1831×40 | 0px |
| bp-stepper | 78.59×30 | 78.59×30 | 87.8×30 | 4px |
| bp-summary | 95.69×30 | 95.69×30 | 103.69×30 | 4px |
| prep-recommend-btn / +N control | 48.23×30 | 48.23×30 | 52.23×30 | 4px |
| prep-freshcutgrass-link | 115.02×30 | 115.02×30 | 123.02×30 | 4px |
| prep-icon-btn (first in DOM) | 40×40 | 40×40 | 40×40 | 4px |
| prep-more-btn (⋯ actions) | 40×40 | 40×40 | 40×40 | 4px |
| sp-session-control | 120×32 | 120×32 | 120×32 | 12px |
| prep New button (.btn) | 84.36×40 | 84.36×40 | 84.36×40 | 4px |
| header .btn (nav) | 91.05×32 | 91.05×32 | 91.05×32 | 4px |
| sb-trigger | 32×32 | 32×32 | 32×32 | 4px |
| prep-item-nav-btn | 40×40 | 40×40 | 40×40 | 999px |
| prep-central-clear | 28×28 | 28×28 | 28×28 | 4px |
| prep-sel-remove | 32×32 | 32×32 | 34×34 | 4px |
| lang-switch button | 39.84×30 | 39.84×30 | 39.84×30 | 0px |

### Prep density (identical selection)

| Element | 1366×768 | 1440×900 | 1920×1080 |
|---|---|---|---|
| centralPanel (`.prep-central`) | 550.95×288.36, 16px | 582.83×420.36, 16px | 789.61×580.36, 16px |
| centralHeadEnv (`.prep-central-head`) | 548.95×44, 16px | 580.83×44, 16px | 787.61×48, 16px |
| centralTitle (`.prep-central-title`) | 121.48×20.39, 17px | 121.48×20.39, 17px | 129.34×21.59, 18px |
| envRow (`.prep-sel--card`) | 166.98×56, 16px | 177.61×56, 16px | 245.2×62, 16px |
| itemRow (`.prep-sel--row`) | 516.95×48, 16px | 270.41×48, 16px | 372.8×52, 16px |
| rowName (`.prep-sel-name`) | 80.98×34, 14px | 82.52×17, 14px | 88.41×18, 15px |
| rowMeta (`.prep-sel-meta, .prep-sel-sub`) | 80.98×15, 12px | 91.61×15, 12px | 151.2×16, 13px |
| rowThumb (`.prep-thumb`) | 48×48, 16px | 48×48, 16px | 48×48, 16px |
| removeBtn (`.prep-sel-remove`) | 32×32, 20px | 32×32, 20px | 34×34, 20px |
| centralCount (`.prep-central-count`) | 35.61×20, 12px | 35.61×20, 12px | 37.41×20, 13px |
| pickerRowName (`.prep-picker-list .prep-row-name`) | 151.55×21, 15px | 151.55×21, 15px | 151.55×21, 15px |
| pickerRowMeta (`.prep-picker-list .prep-row-meta`) | 151.55×18.19, 13px | 151.55×18.19, 13px | 151.55×18.19, 13px |
| pickerThumb (`.prep-adv-thumb`) | 60×60, 16px | 60×60, 16px | 60×60, 16px |
| toolbarSearch (`.prep-search input`) | 164.5×35, 15px | 183.86×35, 15px | 223.39×35, 15px |

### Floating-surface computed styles @1440×900

| Surface | radius | border | box-shadow | background |
|---|---|---|---|---|
| msPanel | 4px | 1px solid rgb(106, 93, 79) | rgba(0, 0, 0, 0.4) 0px 8px 20px 0px | rgb(28, 24, 21) |
| bpPopover | 10px | 1px solid rgb(106, 93, 79) | rgba(0, 0, 0, 0.35) 0px 4px 8px 0px, rgba(0, 0, 0, 0.55) 0px 14px 28px | rgb(28, 24, 21) |
| sbPanel | 10px | 1px solid rgb(106, 93, 79) | rgba(0, 0, 0, 0.35) 0px 4px 8px 0px, rgba(0, 0, 0, 0.55) 0px 14px 28px | rgb(33, 28, 24) |
| countdownOverlay | 10px | 1px solid rgb(63, 123, 116) | rgba(0, 0, 0, 0.35) 0px 4px 8px 0px, rgba(0, 0, 0, 0.55) 0px 14px 28px | rgb(33, 28, 24) |
| tooltip | 4px | 1px solid rgb(106, 93, 79) | rgba(0, 0, 0, 0.35) 0px 4px 8px 0px, rgba(0, 0, 0, 0.55) 0px 14px 28px | rgb(28, 24, 21) |
| prepMenu | 10px | 1px solid rgb(106, 93, 79) | rgba(0, 0, 0, 0.35) 0px 4px 8px 0px, rgba(0, 0, 0, 0.55) 0px 14px 28px | rgb(28, 24, 21) |

### Disabled states reached naturally (computed opacity)

| State | opacity |
|---|---|
| prep-select-checkbox:disabled | 0.4 |
| prep-menu-item.is-disabled | 0.7 |
| env-prep-btn.is-unavailable | 0.45 |

| Icon family reached in a disabled state | opacity of the resting-state control |
|---|---|
| env-prep-btn | 0.45 |
| item-clear-btn | 0.45 |
| prep-item-nav-btn-prev-disabled | 0.35 |
| bp-step-disabled | 0.35 |
| sb-ctl-stop-aria-disabled | 0.45 |

## Console / network issues relevant to rendering

_No console errors, warnings, non-aborted failed requests or HTTP errors were recorded in any context (656 requests cancelled by the suite's own navigations are not counted)._

## Files

- `manifest.json` — every file with route, viewport, state, interactions, related Stage 1 finding, type, notes.
- `measurements` inside `manifest.json` — raw computed-style / box data referenced above.
- `README.md` — how to re-run and how to read the folders.
