# Design Consistency Audit

**Scope:** whole application — Catalog, Lists, Prep, Journey, global header (incl. soundboard and language switch), environment/adversary/item cards, overlays, popovers, forms.
**Type:** audit only. No code, CSS, markup, tokens, or docs other than this file were changed.
**Date:** 2026-10-02 · **Commit audited:** `d680e5b`

## Method and limits

- **Static analysis only.** All CSS was parsed from [css/styles.css](../css/styles.css) (3,739 lines, 1,065 rules, 3,904 declarations outside `:root`). Counts below are *declaration* counts, not rendered-element counts. Multi-selector rules (`.a, .b { … }`) count once.
- JS was grepped for inline SVG, `<img>`, and inline `style`. `index.html` has no presentational CSS.
- Nothing was rendered or measured in a browser. Anything that depends on how a value *looks* is in [Needs Visual Review](#needs-visual-review).
- "Count" for a token means how many declarations reference it.
- Classification letters (A–E) and severities follow the task brief. Where a finding spans several classes, the primary one is shown.

---

## Executive Summary

**Overall: strong, real design system with a long tail of drift concentrated in Prep and in small controls.**

- A genuine token system exists and is the dominant way values are expressed: **507 of 641** colour declarations (79%) use `var(--…)`, **130 of 139** font-size declarations (94%) use a token, **287 of 461** spacing declarations use `--s-*` (plus 5 more local spacing tokens), all `transition`s use `--t-*`/`--ease-*`, all four elevation steps are used, and only 10 hex literals exist outside `:root` (9 of them the tier-hexagon gradient).
- The design is documented in [design.md](../design.md) and [.claude/rules/ui.md](../.claude/rules/ui.md). The CSS header comment and contrast ratios in `:root` are the actual source of truth, as design.md itself states.
- **Strongest areas:** colour palette, card/panel padding (`--s-4` everywhere), primary `.btn` family, elevation, motion, modal shell reuse, spacing scale.
- **Weakest areas:**
  1. **Small controls were built per-feature, not from a shared base.** Icon-only buttons have 8 different hit-box sizes, chips/badges have ~10 independent implementations, and Prep adds untokenised control heights (28/30/35) next to the tokenised 24/32/40.
  2. **Alpha tints are not tokenised.** 88 `rgba()` literals include 15 different gold alphas, 6 ink alphas, and 6 black alphas. "Gold-tint hover" uses 0.10, 0.14 and 0.16 for the same role.
  3. **Disabled and focus treatments have several variants** (5 disabled opacities; 3 outline offsets; one border-only focus).
  4. **Docs have drifted from code** in two small places (chip spec; "never raw px").
- Prep is the largest source of one-offs, but a lot of that is documented intent (dense tool, `--font-ui`, compact vs. comfortable density). I have kept those as class **C** unless the value is also off-scale.

**Highest-value later cleanup areas** (no fixes proposed here): icon-only buttons, chips/badges, Prep control heights, alpha-tint and disabled-opacity tokens, popover surface family, near-duplicate breakpoints.

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 3 |
| Medium | 10 |
| Low | 7 |
| Informational | 4 |

---

## Design Source of Truth

| Source | What it is | Status |
|---|---|---|
| `:root` in [css/styles.css:13–120](../css/styles.css) | ~80 custom properties: surfaces, borders, text, accents, type scale + line-heights, 4px spacing scale `--s-1…--s-10`, radii, 4 elevation steps, motion, component heights, icon sizes, focus ring, Prep selection-cell tokens. Contrast ratios are comments beside colours. | **Canonical** — a real token system |
| [design.md](../design.md) (287 lines) | Palette, typography, spacing/radii/elevation, component notes, breakpoints table, anti-patterns. Says CSS wins on conflict. | Map of the CSS; mostly accurate (see drift below) |
| [.claude/rules/ui.md](../.claude/rules/ui.md) | Rules: reuse tokens, colour meaning, state matrix, visually-equivalent controls behave the same. | Normative |
| Local token blocks | `--pc-*` (Prep central, 28 properties × 2 densities), `--sp-*` (Prep session bar/header), `--sb-*` (soundboard), `--ri-*` (tier hexagon), `--sel-*` (selection cell), `--catalog-art-*`, `--bd-*` | Scoped design tokens; **not** in `:root`, not in design.md except `--pc-*`/`--sel-*` partially |
| Screenshots / reference HTML / Figma | none found in repo | — |

**Is the system consistently used?** Mostly. Values that bypass it:

- 10 hex literals (9 in `.rank-icon`, 1 `#0a0806` in `.adv-art-media`).
- 88 `rgba()` literals (alpha tints of palette colours; no tint tokens).
- 72 of 461 spacing declarations use raw px/em (1, 2, 3, 5, 6, 7.5, 10, 22).
- ~25 raw component heights/widths (28, 30, 35, 13, 19, 34 …).
- 7 raw font-size values (10px ×3, 14px, 16px, 26px, 2.75rem) plus 3 in the Prep big-density block.
- `12px` radius ×2, raw `0 8px 20px rgba(0,0,0,.4)` shadow ×1 (the `.ms-panel`).

**Doc ↔ code drift (class D):**

| design.md says | Code does |
|---|---|
| Chips "share one shape (`--r-xs`, **`--fs-xs`**, uppercase, `--tracking-caps`)" | `.environment-type-chip/.biome-chip/.region-chip/.badge` use `--fs-micro` (11px) / `10px` (`.badge`); the three env chips are **not** uppercase and have no tracking; `.badge` uses 0.05em, `.feature-type` 0.06em |
| "Never write a raw pixel margin/padding/gap" | 72 raw-px spacing declarations (16%) |
| "No border-only focus" | `.prep-title-input:focus { outline: none }` with only a gold `border-bottom` (css:2179) |
| "`--font-ui` Prep only" | Holds in CSS (`.prep-wrap`, `.prep-menu`, `.bp-popover`, `.prep-notes-input`). Not verified for `.prep-menu` being reachable outside Prep. |
| Radii: `--r-lg` for "modals/popovers" | `.ms-panel` (the filter dropdown popover) uses `--r-sm` |

---

## Token Inventory

### Colours

Outside `:root`, colour literals: **10 hex**, **88 rgba**, **0 hsl**, **0 named colours except `transparent`/`currentColor`/`inherit`**.

**Palette usage (`var()` references, outside `:root`):**

| Token | Refs | Assessment |
|---|---:|---|
| `--muted` | 78 | canonical text-tertiary |
| `--hope` | 75 | canonical accent |
| `--parchment` | 59 | canonical text |
| `--hope-soft` | 54 | canonical |
| `--ink-raised` | 45 | canonical raised surface |
| `--line` / `--line-strong` / `--line-faint` | 40 / 35 / 24 | three-weight border system in use |
| `--fear-soft` | 26 | heavy; includes non-destructive uses (see top issues) |
| `--parchment-dim` / `--ink-hover` / `--ink-card` | 19 / 18 / 16 | canonical |
| `--teal-soft` / `--teal` | 14 / 6 | structural accent |
| `--ink` / `--hope-ink` / `--fear` / `--hope-hover` | 9 / 8 / 7 / 3 | low-use but in order |

**Hard-coded hex:**

| Value | Count | Where | Assessment |
|---|---:|---|---|
| `#ffe9ae` | 2 | `.rank-icon.active` rim-hi / face-hi | legitimate one-off (tier hexagon gradient) |
| `#d9a441` | 1 | `.rank-icon.active --ri-face-mid` | **duplicate of `--hope`** — drift risk (D) |
| `#201a15 #7a6a52 #5b4f3f #3a3226 #211b15 #6b4514 #8a5a1c` | 1 each | `.rank-icon` | legitimate one-off, scoped to local `--ri-*` tokens |
| `#0a0806` | 1 | `.adv-art-media` background | **same colour as** `--ink-overlay` (`rgba(10,8,7,…)`); near-token (D) |

**Alpha tints (rgba literals):**

| Base colour | Alphas used | Notes |
|---|---|---|
| Gold `217,164,65` | .06 .08 .10 .12 .14 .16 .18 .20 .22 .24 .28 .35 .45 .50 .55 — **15 steps** | most frequent: .08 ×4, .10 ×4, .14 ×4, .16 ×4, .55 ×4; no tokens |
| Fear `156,43,59` | .07 .14 (×7) .18 | `.14` is consistent for destructive hover |
| Teal `63,123,116` | .14 .18 | |
| Ink `20,17,15` | .55 .72 .80 .90 .92 .98 — 6 steps | header, Prep bar gradient, `.adv-art-close`, `.prep-item-name-overlay` |
| Black | .16 .40 .45 .50 .55 .60 — 6 steps | shadows (non-token) and overlays |
| Parchment-dim `185,173,145` | .34 .38 (×11) .56 (×5) | scrollbar thumbs; **`.ms-panel` thumb .34 vs .38 elsewhere** — D |
| White | .06 (×2) .16 .35 | `.ms-row:hover` is the only white-alpha hover in the app |
| `255,250,225 / 80,45,8 / 240,207,140` | .75 / .65 / .35 | tier-hexagon glint / umbra and one encounter-link underline tint |

**Near-duplicate / drift candidates**

| Pair | Where | Class |
|---|---|---|
| Gold tint .10 vs .14 vs .16 for *same role* "gold-tinted hover/active fill" | `.card-add-btn:hover .10`, `.jr-icon-btn:hover .10`, `.btn.active .14`, `.bp-seg:checked .14`, `.countdown-overlay-btn:hover .16`, `.region-env-btn.active .16`, `.ms-row:checked .16` | D |
| Gold border alpha .35 / .45 / .5 / .55 | `.card-random`, `.prep-central-count.is-limit`, `.modal.retiered`, `.bp-summary[aria-expanded]`/`.prep-central` top border | D |
| Gold `.08` vs `.06` | `.prep-central-count.is-limit` / `.bp-summary.is-over` vs body wash | C |
| Neutral button hover: `--ink-hover` (`.btn`, `.adv-art-copy`, `.bp-step`) vs `--ink-raised` (`.btn-ghost`, `.loot-name-act`, `.search-clear-btn`) vs `rgba(255,255,255,.06)` (`.ms-row`) | | D |

**Semantic colour use:**
- Gold = affirmative: held except `.modal.retiered` (gold frame to flag a re-tiered view — arguably intentional).
- Teal = structural: also used for `.item-btn` (item link), `.countdown-btn`, `.feature-type.reaction`, `.jr-note`, `.jr-die`, `.countdown-overlay` — all informational, consistent with "never affirmative".
- Fear = destructive: also used for `.feature-type.action`, `.adversary-link-btn`, `.jr-blight`, `.badge.pending` (non-destructive). ui.md says "Fear-red is destructive actions only." → see M12.

### Border radius

| Value | Count | Used by | Assessment |
|---|---:|---|---|
| `var(--r-sm)` 4px | 44 | buttons, inputs, icon buttons, tooltips, toasts, prep menu items | canonical |
| `var(--r-pill)` | 15 | filter/journey counts, dice/item/countdown/adversary-link inline chips, prep-central-count, `prep-item-nav-btn` | canonical |
| `var(--r-md)` 6px | 13 | cards, list cards, Prep columns, Prep card/row, soundboard sound tiles | canonical |
| `50%` | 11 | circular buttons (`search-clear`, `adv-art-close`, `countdown-overlay-btn`), dots, spinners | legitimate, but see "pill vs 50%" below |
| `var(--r-xs)` 2px | 9 | env chips, badges, feature-type, checkboxes | canonical |
| `var(--r-lg)` 10px | 8 | modal, adv-art modal, Prep bar/central/menu, popover, soundboard panel, countdown overlay | canonical |
| `0` | 4 | focus-ring-inside controls (lang switch, `.bp-pc-input`, `.prep-title-*`), mobile fullscreen modal | intentional |
| **`12px`** | **2** | `.sp-session-control` (+ compact variant) | **one-off** — matches no token (`--r-lg` 10, pill 999); class B, Low |
| `calc(var(--r-md) - 1px)` | 2 | `.prep-sel--card .prep-sel-main`, `.prep-item-icon-btn` | intentional inset (inner radius inside a 1px border) — C |

Cross-role consistency: buttons / inputs / icon buttons all `--r-sm` ✔. Chips `--r-xs` vs inline interactive chips `--r-pill` — a **role split** (info vs interactive), plausibly deliberate but undocumented (E). Dropdown `.ms-panel` is `--r-sm` while every other floating panel is `--r-lg` (except tooltip/toast/dice-pop/hint at `--r-sm`) — see M4.

### Spacing

Top-level frequency across padding / margin / gap (value tokens, not shorthand lists):

| Value | Count | Assessment |
|---|---:|---|
| `0` | 197 | n/a |
| `var(--s-2)` 8px | 118 | dominant |
| `var(--s-3)` 12px | 62 | |
| `var(--s-4)` 16px | 57 | |
| `var(--s-1)` 4px | 41 | |
| `var(--s-6)` 24px / `--s-5` 20px / `--s-7` 32px | 16 / 14 / 10 | |
| **`2px`** | 23 | raw; mostly stack gaps/padding in chips and rows |
| **`1px`** | 11 | raw; list gaps (`.ms-panel`, `.prep-menu-list`, `.prep-row-text`) and margin nudges |
| **`5px`** | 10 | `gap` on inline chips (`dice-btn`, `item-btn`, `countdown-btn`, `bp-summary`, `field-error`, `dice-roll-btn`) + `bp-seg` padding |
| **`6px`** | 10 | Prep central (`--pc-pad-y`, gaps, count padding) |
| `10px` ×3, `3px` ×3, `7.5px` ×2, `7px`, `22px`, `36px` | | one-offs |

Dominant increment is the 4px scale. 16% of spacing declarations are raw; **5px**, **6px** and **7.5px** are not on the 4/8 grid and have no token. In Prep: `--pc-pad-y: 6px`, `--pc-row-gap: 6px`, `.prep-central-title { gap: 6px }`, `.prep-central-lead { gap: 4px }`, `.prep-central-head { gap: 6px }`, `.prep-central-count { padding: 0 6px }` — a **6px sub-scale** that is consistent *inside* Prep central but sits between `--s-1` and `--s-2` globally.

Same-purpose components with different spacing:

| Role | Variants |
|---|---|
| Inline interactive chip padding | `dice-btn` & `countdown-btn`: `2px 8px 2px 6px`; `item-btn`: `1px 10px 2px 8px`; `adversary-link-btn`: `1px 8px` |
| Info chip padding | env/biome/region/`.jr-blight`: `0 8px` fixed 24px; `feature-type`/range badges: `2px 8px` auto height; `region-env-tier`: `3px 4px`; `filter-count`: `0 5px`; `journey-count`: `0 5px` |
| Panel padding | `.card` `16 16 16 0`; `.list-card`, `.journey-entry`, `.prep-col`, `.prep-items-panel`, `.prep-bar` all `--s-4`; `.prep-central` `0 --pc-pad-x --s-4` ✔ consistent |
| Modal | header `20 24 16`, body `20 24 24` (vs `.adv-art-modal-card` `16`, `.sb-panel` `12`, `.bp-popover` `12`, `.prep-menu` `4`) — varies by function |

### Sizes (recurring dimensions)

**Control heights** — tokens: `--h-xs` 24, `--h-sm` 32, `--h-md` 40, `--icon-sm` 14, `--icon-md` 16.

| Height | Where | Tokenised? |
|---|---|---|
| 24 | chips, `search-clear`, `modal-close`, `list-card-del`, `adv-art-close`, `jr-blight` | `--h-xs` ✔ |
| 26 | `adv-art-copy` | raw |
| 28 | `card-add-btn`, `env-prep-btn`, `jr-icon-btn`, `loot-name-act`, `prep-central-clear`, compact Prep header `.btn`/`sb-trigger`/`header-actions` | raw ×7 |
| 30 | `bp-stepper`, `bp-summary`, `prep-recommend-btn`, `prep-freshcutgrass-link` | raw ×4 |
| 32 | `.btn-sm`, lang switch, `prep-icon-btn`, `sb-ctl`, `sb-trigger`, `sp-session-control`, `bp-pop-close`, Prep remove (`--pc-remove`) | `--h-sm` ✔ |
| 34 | `countdown-overlay-btn`; `--pc-remove` at big density | raw |
| **35** | `.prep-search input`, `.prep-adv-toolbar .ms-trigger`, `.item-clear-btn`, `min-height` of `.prep-env-toolbar`/`.prep-adv-toolbar` | raw ×6 |
| 36 | `--pc-head-h`, `--pc-thumb-row` | local token |
| 40 | `.btn`, `.field` inputs, `.ms-trigger`, `.prep-item-nav-btn`, `.item-toolbar` min-height | `--h-md` ✔ |
| 44 | touch targets (`ms-row`, `prep-menu-item`, compact row min-height) | raw ×3 (pointer: coarse) |

Equivalent controls differing by a few px: **search input 40 (catalog/lists) vs 35 (Prep)**; **clear/× button 24 vs 28 vs 32 vs 35**; **ms-trigger 40 vs 35**; **compact buttons 30 vs 32 vs 28**.

**Containers / widths**

| Value | Where | Note |
|---|---|---|
| `1180px` ×3 | `.shell`, `.header-inner`, footer | base content width; header stays 1180 on **every** route by design |
| `1480 / 1836 / 2192 / 2548px` | `.shell` steps | each = one more 340px card column (documented) |
| `1440px` / none ≥1440 | Prep `.shell` | Prep content goes full-bleed at ≥1440 while header remains 1180 |
| `720px`, `400px` | `.modal`, `.modal-sm` | |
| `min(…)` popovers | `.ms-panel` 280, `.prep-menu` 360, `toast` 360, `sp-session-hint` 260, `tooltip` 240 | five different max-widths for floating surfaces |
| Prep main grid | `minmax(260px,.85fr) minmax(480px,1.4fr) minmax(300px,1fr)` | |
| Measure caps | `--measure` 68ch, 60ch, 54ch, 44ch, 30ch, 24ch, 12ch | 7 ch-based caps, 1 token |

**Icons (rendered size):** `--icon-sm` 14, `--icon-md` 16 are the only tokens; raw 13 ×4 (dice/item/craft/countdown svg), 15 (`prep-central-clear`), 18 ×5 (`card-add-btn`, `sb-ctl`, checkboxes), 19 (`dice-roll-icon`), 20 (`env-action-icon`), 26, 32 (`--sb-icon`), 40, 64.

### Typography

**Families:** `--font-mono` 38 refs, `--font-display` 19, `--font-body` 14, `--font-ui` 10, `inherit` 6. No raw font stacks outside `:root` ✔.

**Font sizes:** tokens `--fs-xs` 31, `--fs-base` 24, `--fs-sm` 23, `--fs-micro` 18, `--fs-md` 14, `--fs-lg` 10, `--fs-xl` 3, `--fs-2xl` 1, `--fs-card-copy` 1, `--pc-*` 5. Raw: `10px` ×3 (`.filter-count`, `.badge`, `.dice-result-pop .notation` — **below `--fs-micro` 11px**), `14px` ×1 (`.feature-prompt` — equals `--fs-card-copy`, not using it, D), `15px` (mobile body = `--fs-base`), `16px` body, `26px` (`.dice-result-pop .value`), `2.75rem` (random mark).
Prep big-density block re-expresses `--fs-sm` as `13px`, `--fs-base` as `15px`, and adds an off-scale `18px` (`--pc-title-size`, `--pc-icon`).

**Weights:** 400 ×17, 700 ×11, 600 ×4, **500 ×1** (`.prep-sel-name`, the only 500).

**Line heights:** tokens (`--lh-*`) dominate, but raw: `1` ×17, `1.4` ×4 (Prep rows, notes), `1.2` ×3, `1.5`, `1.55`, `1.3`, `1.25`, `1.15` once each, and **px values** `18px` ×2, `17px`/`15px`/`16px`/`18px` (`--pc-name-lh`, `--pc-meta-lh`) — three units in play (unitless, token, px).

**Letter-spacing:** `--tracking-caps` .1em ×13, `--tracking-display` .02em ×10, **`.06em` ×6**, `.05em` ×2, `.04em`, `.01em`, `0` ×3. Uppercase labels split: `.1em` (section labels: `jr-k`, `journey-saved-title`, `prep-rec-title`, `prep-menu-heading`, `bp-pop-h`) vs `.06em` (`feature-type`, range/damage badges, lang switch, h1) vs `.05em` (`.badge`, `.jr-blight`) — three tracking values for "small uppercase label".

**Semantic roles** (by CSS):

| Role | Font | Size | Notes |
|---|---|---|---|
| Site title `h1` | display | token / .06em (.04em mobile) | caps, differs from `--tracking-display` |
| Page title (`.page-title`) | body? | `--fs-xl` | |
| Modal title | display | `--fs-xl` | |
| Card title | display | `--fs-md` | |
| Journey panel title | display | `--fs-lg` | |
| Prep central title | display | `--pc-title-size` = `--fs-md` (18px big) | the only display type in Prep apart from bar/title input |
| Table/section label | ui or body | `--fs-xs` caps | `.1em` |
| Row name | ui | `--fs-base` (pickers) vs `--pc-name-size` 14/15 (central) | |
| Row meta | ui | `--fs-sm` (pickers) vs `--pc-meta-size` 12/13 (central) | |
| Chip | mono | `--fs-micro` (10px for `.badge`) | |
| Button label | body | `--fs-base` / `--fs-sm` (`btn-sm`) | `.btn` spacing `.01em`, others 0 |
| Tooltip | body | `--fs-xs` | |
| Toast | body | `--fs-sm` | |

### Borders

| Value | Count | Assessment |
|---|---:|---|
| `1px solid var(--line)` | 34 | default edge |
| `1px solid var(--line-faint)` | 20 | |
| `1px solid var(--line-strong)` | 11 (+ 20 `border-color` swaps) | hover edge |
| `1px solid transparent` | 7 | icon-button "space reserved" |
| `1px solid var(--teal/hope/fear)` | 5 / 5 / 3 | semantic outlines |
| `2px solid …`, `3px solid var(--hope)` | 2 / 2 | `.toast` left border (3px), `.prep-central` top border colour override |
| `1px dashed var(--line)` | 1 | `.badge` |
| `1px dotted var(--teal)` | 1 | craft chain link |
| `1px solid var(--type-chip-border)` | 1 | env type chip — the only extra neutral border shade |

`border-color` on interaction: `--hope` ×34, `--line-strong` ×20, `--fear*` ×9 — the hover pattern is coherent. Panel border weight: cards/`list-card`/`modal`/`.btn` use `--line`; Prep columns/rows use `--line-faint`; popovers/dropdowns/Prep-central use `--line-strong`. Three weights, but **modal uses `--line` while all other overlays use `--line-strong`** (class E).

### Shadows and elevation

| Value | Count |
|---|---:|
| `var(--e-3)` | 10 |
| `var(--e-2)` | 4 |
| `var(--e-1)` | 3 |
| `var(--e-4)` | 2 (+ 1 composite `e-4, 0 0 0 1px gold .28` on `.modal.retiered`) |
| raw: `0 8px 20px rgba(0,0,0,.4)` | 1 — **`.ms-panel`**, the only dropdown not using `--e-3` (B) |
| focus-style glows: `0 0 0 3px gold .18`, `0 0 0 1px hope + 0 0 14px gold .35`, `0 0 0 1px hope + inset 0 0 16px gold .18`, `inset 0 0 0 1px …` ×3, `0 0 0 2px ink-raised`, tier-hexagon inset pair | 8 | selection / state highlights, not elevation |
| `text-shadow` | 2 (tier hexagon only) |

Elevation does follow a recognisable system: e-1 rest cards → e-2 hover/central → e-3 popovers/toasts/tooltips → e-4 modals. Exceptions are the `.ms-panel` and the state glows.

**Opacity** (non-0/1): .35 ×2, .4 ×2, .45 ×4, .5, .55, .7 ×2, .75 ×2, .8, .85 ×3 — see disabled-opacity finding.

---

## Component Inventory

| Component type | Variants found | Shared implementation? | Consistency |
|---|---:|---|---|
| Primary / secondary / ghost / danger button (`.btn*`) | 5 modifiers + `.btn-sm` + compact-Prep override | **Yes** (single base) | High |
| Prep ad-hoc buttons (`prep-recommend-btn`, `prep-freshcutgrass-link`, `bp-summary`, `item-clear-btn`, `dice-roll-btn`, `prep-item-nav-btn`) | 6 | Partial (each re-sets height/padding) | Low |
| Icon-only button | **≥15** classes (see Cross-Page) | **No** | **Low** |
| Close/× | 7 (`modal-close`, `search-clear-btn`, `adv-art-close`, `bp-pop-close`, `storage-notice-close`, `countdown-overlay-close`, `prep-sel-remove`) | No | Low |
| Chip / badge / tag | **~10** | No common base | Low |
| Inline interactive chip (dice, item, countdown, adversary link) | 4 | No | Medium |
| Tier marker | 2 (hex `.rank-icon` / plain text) | Hex shared; Prep text separate | Medium |
| Text input / select (`.field`) | 1 base + Prep 35px override | Yes | High |
| Search field | 2 (catalog `.search-input-wrap`, Prep `.prep-search`) | Partial (Prep re-uses `.field` rules, overrides height) | Medium |
| Multiselect dropdown (`ms-*`) | 1 | Yes | Medium (surface off-token) |
| Menu / popover surfaces | 6 (`ms-panel`, `prep-menu`, `bp-popover`, `sb-panel`, `countdown-overlay`, `sp-session-hint`) | No | Medium |
| Modal | 3 (`.modal`, `.modal-sm`, `.adv-art-modal-card`) | `.modal` shared by environment + item | High |
| Card (catalog) | 1 (`.card`), 1 random variant | Yes | High |
| Card-like panels | `.list-card`, `.journey-entry`, `.prep-col`, `.prep-items-panel`, `.prep-sel--card`, `.prep-item-card` | Share tokens, not class | Medium-High |
| Row/list item | 4 (`prep-sel--row`, `prep-item-compact-row`, `atl-row`, `ms-row`) + `prep-menu-item` | No | Low-Medium |
| Checkbox | 3 (`.atl-row input`, `.prep-select-checkbox`, `.ms-checkbox`) | Duplicate recipes | Medium |
| Link | 5 (`a`, `.link-btn`, `.adversary-encounter-link`, `.encounter-builder-link`, `.prep-freshcutgrass-link`) | No | Medium |
| Tooltip / toast | 1 each | Yes | High |
| Empty state | `.empty-state`, `.journey-empty`, `.prep-empty`, `.prep-sel-empty` | partial | Not audited in detail (E) |

---

## Page-by-Page Findings

### Catalog
- Shell/grid/card tokenisation is the cleanest part of the app: `.card` (`--ink-card`, `--line`, `--r-md`, `--e-1`→`--e-2` hover, padding `--s-4`), 340px min-column with documented stepped shell widths.
- Toolbar controls use the shared `.field` recipe (40px, `--r-sm`, gold focus) — consistent.
- Card actions (`card-add-btn`/`env-prep-btn`) are 28px with `--r-sm` and a **transparent-at-rest border**, `svg` 18px/`env-action-icon` 20px — a slightly different recipe from every other icon button (see cross-page).
- `.card-random` uses a literal-tint border `rgba(217,164,65,.35)` and 2.75rem raw font size (one-off, C).
- `.rank-icon-sm` is 26px visible but 44px under `(pointer: coarse)` — documented.

### Lists
- `.list-card` mirrors `.card` (same bg/border/radius/shadow/padding) — good.
- `.list-card-del` 24px with 10px `::after` hit area — same pattern as `search-clear`/`modal-close`, but unlike the 28px icon buttons on cards.
- `.list-card-cover` height 90px, gap 1px — raw one-offs (C).
- Atlas "add to list" overlay rows use `.atl-row` (40px min, no border) — a fourth row implementation.

### Prep
Most one-offs concentrate here. Documented and intentional: `--font-ui`, the `--pc-*` two-density system, compact/expanded header, dense toolbars. Undocumented / off-scale:
- Toolbar controls **35px** (search, ms-trigger, clear) vs global 40; right next to **30px** (`bp-summary`, recommend, FreshCutGrass) and **32px** (`prep-icon-btn`, `sp-session-control`).
- Central rows: `.prep-sel--card` 56/62, `.prep-sel--row` 48/52, picker rows driven by thumbs 48/60 (+7.5px padding), `.prep-item-compact-row` min-height 44 — four row heights.
- Prep-central header count: `line-height: 18px` + 1px transparent border + pill radius; `is-limit` adds gold tint; `.prep-central-roll` same size without pill — a mini-component with its own recipe.
- Duplicate declarations inside one rule: `.bp-step` `width: 26px` then `24px`; `.bp-summary` `padding-inline: 10px` then `8px`; `.prep-central-head` `gap` twice; `.prep-central-lead` `gap: 6px` then `4px`; `.sp-session-name` `max-width` 30ch/24ch/12ch; `.prep-freshcutgrass-link` `padding: 0 10px` then `padding-inline: 6px`. (Probably overrides written after the fact; harmless today, brittle.)
- `prep-central` uses `--ink-raised` + `--line-strong` + gold top border + `--r-lg`, while `prep-col`/`prep-items-panel` use `--ink-card` + `--line-faint` + `--r-md`: intentional (comment says "quieter outer vs brighter central").
- Prep has the highest density of `outline-offset: -2px` (inset focus rings inside bordered groups) — consistent within Prep.

### Journey
- Token usage excellent. `.journey-entry` equals `.card`/`.list-card` recipe.
- `.jr-icon-btn` is the only 28px icon button with a **visible resting border** (`--line`) — the rest of the 28px family is transparent-at-rest.
- `.jr-blight` (fear outline, caps, 24px) is the only status badge in the app with a fixed 24px and `0.05em` tracking beyond `.badge`.
- `.jr-roll` has raw `padding-top: 2px`, `.jr-subroll` min-width 1.6em — em-based sizing in an otherwise px/token app (C).

### Global Header
- Header content width fixed at 1180 on all routes (documented, comment in CSS).
- `.header-actions .btn` is `--h-sm` 32; Prep compact mode forces 28px (documented).
- Soundboard trigger (32px, `--r-sm`, `--ink-raised`, border `--line`) is built on `.btn`; compact mode → 28px. Language switch is 32px with `.06em` tracking and a `border-radius:0` focus override — 3 different controls in the same cluster each with their own state recipe.
- `.sp-session-control`: pill-ish 12px radius, `--line-faint` border, `.is-hinted` raw gold glow — the only header control that isn't `--r-sm`.

### Overlays / Detail views
- `.modal` / `.modal-sm`: shared by environment detail and item card ✔; `.modal-close` 24px with `::after -10`.
- Floating panels split into two families (see M4): **r-lg + e-3/e-4** (`modal`, `prep-menu`, `bp-popover`, `sb-panel`, `countdown-overlay`, `adv-art-modal-card`) vs **r-sm + e-3** (`tooltip`, `toast`, `dice-result-pop`, `sp-session-hint`) vs **r-sm + raw shadow** (`ms-panel`).
- Border: `modal` `--line`, `adv-art-modal-card`/`bp-popover`/`sb-panel`/`ms-panel`/`prep-menu`/tooltip/toast `--line-strong`, `countdown-overlay` `--teal`, `dice-result-pop`/`sp-session-hint` `--hope`.
- `.env-backdrop` uses local `--bd-*` tokens; `.modal.retiered` adds a gold frame via raw `rgba(217,164,65,.5/.28/.35)`.

---

## Cross-Page Inconsistencies

### Icon-only buttons (class A, **High**)

| Class | Page | Box | Radius | Resting border | Hover | Icon | Hit-area growth |
|---|---|---|---|---|---|---|---|
| `search-clear-btn` | Catalog, Prep | 24 | 50% | none | `parchment` + `ink-raised` | `×` glyph | `::after -10px` |
| `modal-close` | modals | 24 | `r-sm` | none | `parchment` + `ink-raised` | `×` glyph | `::after -10px` |
| `list-card-del` | Lists | 24 | `r-sm` | transparent | (delete tint) | svg | `::after -10px` |
| `adv-art-close` | Prep art modal | 24 | 50% | `--line`, bg ink@.72 | `hope-soft` + hope border | `×` glyph | none |
| `adv-art-copy` | Prep art modal | 26 | `r-sm` | none | `hope-soft` + `ink-hover` | svg 16 | none |
| `card-add-btn`, `env-prep-btn` | Catalog, Lists, Detail | 28 | `r-sm` | transparent | hope border + gold .10 | svg 18/20 | **deliberately none** |
| `jr-icon-btn` | Journey | 28 | `r-sm` | **`--line`** | hope border + gold .10 | svg 14 | none |
| `loot-name-act` | Item card | 28 | `r-sm` | none | `hope-soft` + `ink-raised` | svg 16 | none |
| `prep-central-clear` | Prep | 28 | `r-sm` | transparent | fear tint, **opacity .75→1** | svg 15 | none |
| `prep-icon-btn` | Prep bar | 32 | `r-sm` | transparent | (muted→hover bg) | svg 16 | `::after -6px` (−2 mobile) |
| `prep-sel-remove` | Prep rows | 32/34/44 (`--pc-remove`) | `r-sm` | transparent | fear border + fear tint | `×` glyph fs-lg | none |
| `sb-ctl`, `sb-trigger` | Header/soundboard | 32 | `r-sm` | `--line` | `ink-hover` + `line-strong`; pressed = gold | svg 16/18 | none |
| `bp-pop-close` | Prep BP popover | 32 | `r-sm` | none | `ink-hover` | `×` glyph | none |
| `bp-step` | Prep BP | 24 (26 dup) | 0 | none | `ink-hover` + `hope-soft` | svg 14 | none |
| `countdown-overlay-btn` | Detail | 34 | 50% | `--line` | gold .16 + hope border | glyph | none |
| `item-clear-btn` | Prep items | 35 | `.btn` default | `.btn` | `.btn` | glyph | none |
| `prep-item-nav-btn` | Prep items | 40 | **pill** | `--line` | hope border | svg 16 | none |
| `storage-notice-close` | notice | auto (`padding 0 1px`) | `r-sm` | none | **opacity only** | glyph | `::after -12px` |

Assessment: **8 hit-box sizes** (24, 26, 28, 32, 34, 35, 40, + auto), **4 hit-area strategies** (−10, −12, −6, none), **three resting treatments** (none / transparent-border / visible border), **hover = fill vs border-and-tint vs opacity-only**. Some are legitimately contextual (`prep-sel-remove` density, env actions "touch but don't overlap" per design.md). Strong inconsistency remains for the 24–28px "ghost" family where hover recipe (`ink-raised` vs `ink-hover` vs gold tint) and icon size (14/15/16/18/20) differ without a stated reason.

### Chips / badges / tags (class A, **High**)

| Component | Role | Height | Padding | Radius | Border | Typography | Colour |
|---|---|---|---|---|---|---|---|
| `.environment-type-chip` | info | 24 | `0 8` | xs | solid `--type-chip-border` | mono 11, no caps | muted |
| `.biome-chip` | info (structural) | 24 | `0 8` | xs | solid teal | mono 11, no caps | teal-soft |
| `.region-chip` | info | 24 | `0 8` | xs | solid hope | mono 11, no caps | hope-soft (gold on non-selected chip) |
| `.badge` | status | 24 | `0 8` | xs | **dashed** `--line` | mono **10**, caps .05em | muted; `.pending` fear |
| `.feature-type` (+`.passive/.action/.reaction`) | info/status | auto (~22) | `2 8` | xs | solid (dim / fear / teal) | mono 11, caps **.06em** | per type |
| `.adversary-range-badge`, `.adversary-damage-type-badge` | info | auto (~22) | `2 8` | xs | solid `--line` | mono 11, caps .06em | parchment-dim |
| `.jr-blight` | status | 24 | `0 8` | xs | solid fear | mono 11, caps .05em | fear-soft |
| `.region-env-tier` | info (inside button) | auto (~19) | `3 4` | xs | solid `--line` | mono 11, no caps | muted / hope-soft |
| `.filter-count` | count | 18 | `0 5` | pill | none | mono **10** bold | on-gold |
| `.journey-count` | count | 18 | `0 5` | pill | solid `--line` | mono 11 | parchment-dim |
| `.prep-central-count` | count | 20 | `0 6` | pill | transparent / gold when limit | mono 12–13 | muted |
| `.dice-btn` | interactive | ~24 | `2 8 2 6` | pill | solid hope | mono 12 | hope-soft |
| `.item-btn` | interactive | ~26 | `1 10 2 8` | pill | solid teal | **body 15** | teal-soft |
| `.countdown-btn` | interactive | ~24 | `2 8 2 6` | pill | solid teal | mono 12 bold | teal-soft |
| `.adversary-link-btn` | interactive | ~22 | `1 8` | pill | solid **fear** | body | fear-soft |
| `.rank-icon-sm` | tier | 26 hex | — | clip-path | — | `--fs-micro`/sm | gradient |

Assessment: informational chips share height/padding/radius (good) but diverge on caps/tracking (3 values) and font-size (10 vs 11). Counts and inline interactive chips are a separate pill family with **three padding recipes** and mixed fonts (item-btn alone uses the body face). **Fear/teal/hope all appear as outline colours on both informational and interactive chips**, so interactive vs informational is not distinguishable by colour (e.g. teal biome chip vs teal `.item-btn`; gold region chip vs gold `.dice-btn`) — only by radius (xs vs pill). → E (needs visual review).

### Tier markers (class C, Informational)
- Catalog card, detail, filter: hex `.rank-icon` (26/36px). Prep row meta: plain text `"Tier 2 · Type · Biome"` (css `prep-row-meta`). Prep tier filters again use hex. Likely intentional density choice; flagged only because "Tier" has two visual forms.

### Search controls (class B, Medium)
- Catalog: `.search-input-wrap` input 40px, `padding-left --s-8`, icon `--icon-sm`.
- Prep: `.prep-search` input 35px; no icon variant (I did not verify markup); `prep-adv-toolbar .ms-trigger` also 35px (matching, good), but the **item toolbar** is min-height 40 with a 35px clear button.
- Both use `--ink-raised` / `--line` / hover `--line-strong` / focus gold — recipe consistent, **height diverges**.

### Dropdown / popover surfaces (class B, Medium)
- `.ms-panel`: `--r-sm`, border `--line-strong`, raw shadow, padding `--s-2`, rows `--r-xs`.
- `.prep-menu`: `--r-lg`, `--line-strong`, `--e-3`, padding `--s-1`, items `--r-sm` 40px.
- `.bp-popover` / `.sb-panel`: `--r-lg`, `--line-strong`, `--e-3`.
- Both menu variants are "a list of options in a floating panel" — one is square-ish, one rounded.

### Row/list item (class B, Medium) — see Table section below.

### Checkboxes (class B, Low-Medium)
- `.atl-row input[type=checkbox]` 18px hard-coded, check 5×10; `.prep-select-checkbox` `--sel-box` 18px, check 5×9; `.ms-checkbox` separate. Same visual, three recipes (and 9 vs 10px checkmark height).

### Links (class D, Low)

| Class | Colour | Underline | Hover |
|---|---|---|---|
| `a` | `hope-soft` | none; underline on hover, offset 2px | underline |
| `.link-btn` | `hope-soft` | **underline at rest**, offset 2px | colour → `parchment` |
| `.adversary-encounter-link` | `hope-soft` | at rest, 1px, tinted, offset **3px** | colour → `hope-hover`, underline → currentColor |
| `.encounter-builder-link` | `muted` mono caps | none | colour → `hope-soft`, **no underline** |
| `.prep-freshcutgrass-link` | button-styled | — | — |

Underline-at-rest vs on-hover-only is the main split; whether that is semantic (inline body links vs standalone) is E.

---

## Responsive Findings

**Every breakpoint used (declaration counts):**

| Query | Decls | Notes |
|---|---:|---|
| `max-width: 640px` | 72 | main phone breakpoint |
| `max-width: 641px` + `min-width: 641px` | 4 + 1 | **1px off 640** — near-duplicate (D) |
| `min-width: 641px and max-width: 1091px` | 2 | isolated oddity — 1091 appears once |
| `max-width: 760px` / `min-width: 761px` | 28 / 13 | Prep pickers stack; also `(max-width:760px), (pointer:coarse)` ×5 |
| `max-width: 900px` / `min-width: 901px` | 22 / 16 | Prep picker columns (design.md says 760/900) |
| `max-width: 480px` / `400px` | 13 / 2 | |
| `max-width: 1199px` / `min-width: 1200px` | 2 / 44 | Prep three-column threshold |
| `max-width: 1536px` | 3 | Prep picker counters hide — isolated |
| `min-width: 1440px` | 1 | Prep shell goes full-width |
| `min-width: 1480 / 1836 / 2192 / 2548px` | 1 each | catalog `.shell` steps |
| `min-width: 1800px and min-height: 900px` | 20 | Prep central comfortable density |
| `pointer: coarse`, `hover: none`, `forced-colors`, `prefers-reduced-motion` | 7 / 4 / 3 / 5 | capability queries |

**Target viewports (code-derived expectation — needs visual confirmation):**

| Viewport | Catalog | Prep |
|---|---|---|
| 1366×768 | `.shell` 1180, 3 cards | width < 1440 → `max-width:1440` (fills, ≥1200 three columns); central density **compact** (width <1800) |
| 1440×900 | `.shell` 1180 (<1480) | ≥1440 → Prep shell `max-width: none`; central **compact** (width <1800) |
| 1920×1080 | `.shell` **1836** (4–5 cards) | Prep shell full-bleed; central **comfortable** (≥1800 and ≥900) |

Notes:
- The Prep density switch requires **both** `min-width:1800` and `min-height:900`. At 1920×1080 it applies; 1440×900 and 1366×768 do not. This is internally consistent and documented in design.md.
- 1440 (Prep shell) vs 1480 (catalog shell first step) are different thresholds for similar "go wider" intent. Class C (different content collisions), but there is **no single wide-screen breakpoint** — three thresholds (1440, 1480, 1800) govern "wider".
- Between 1440 and 1800 wide: Prep content is full-bleed but still compact density; header stays 1180 (header and Prep content widths diverge). C / needs visual review.
- 640 vs 641, 760 vs 761, 900 vs 901, 1199 vs 1200 pair up complementary min/max queries (correct pattern), but **640 vs 641 mixes two different max values** (`max-width:640` ×72 and `max-width:641` ×4), which makes 641px a one-pixel gap where some phone rules apply and some do not (D).
- 1536, 1091 and 400 are isolated.

## Interaction State Findings

**Hover**
- Neutral hover fill splits three ways (`ink-hover` / `ink-raised` / white .06) — see colours.
- Ghost icon buttons hover with: border + gold tint (`card-add`, `jr-icon`), fill + text colour (`loot-name-act`, `adv-art-copy`, `bp-step`), fear tint (`prep-central-clear`, `prep-sel-remove`), border only (`prep-item-nav-btn`), opacity only (`storage-notice-close`).
- Destructive hover is consistent: fear .14 fill; border `fear-soft` on `btn-danger`, `fear` on `prep-sel-remove`, none on `prep-central-clear`.

**Active (pressed)**
- Only 14 `:active` rules in 3,739 lines; `.btn` has no `:active` style; `.sp-session-control:active` is the main one. State is largely hover-only. (Informational; verify desired.)

**Selected**
- `.btn.active`, `.rank-icon.active`, `.region-env-btn.active`, `.ms-row:checked`, `.prep-item-card.is-selected`, `.sb-ctl[aria-pressed]`, `.bp-seg:checked` all use gold — colour consistent, **fill/border/glow recipe differs** (e.g. `.14`, `.16`, ring + inset glow, border only).

**Disabled** — five opacity levels:

| Opacity | Used by |
|---|---|
| .35 | `.bp-step:disabled`, `.prep-item-nav-btn:disabled` |
| .4 | `.prep-select-checkbox:disabled`, `.sb-sound[failed]` |
| .45 | `.btn:disabled`, `.env-prep-btn.is-unavailable`, `.sb-ctl[aria-disabled]`, `.sb-sound` idle/loading |
| .5 | `.atl-row.is-unavailable` checkbox |
| .7 | `.prep-menu-item.is-disabled` |

Also three disabled mechanisms: `:disabled`, `[aria-disabled]`, `.is-unavailable`/`.is-disabled` classes.

**Focus / focus-visible**
- Global `:focus-visible { outline: var(--focus-ring) }` exists (43 `:focus-visible` rules). Offsets: default `2px` (13), `-2px` (9, inside bordered groups), `1px` (5, `rank-icon`, thumbs, clear).
- `outline: none` on 8 selectors: `#brand-home` and `.card-open` have a container replacement (`.brand:has(...)`, `.card:has(.card-open:focus-visible)`); `.modal`, `.adv-art-modal-card`, `.bp-popover`, `.sb-panel`, `.prep-central-title` are `:focus` (programmatic container focus — acceptable); **`.prep-title-input:focus { outline: none }`** leaves only a gold `border-bottom` → contradicts "never border-only" (class B). `.list-card:has(.list-card-open:focus-visible)` swaps `border-color` — verify a ring is also shown (E).
- `.lang-switch button:focus-visible` sets `border-radius:0` + `outline-offset:-2px` (inside a segmented control; intentional).
- `.field input:focus` changes border to gold **plus** the global outline (both) — consistent with design.md; `.prep-notes-input` same but inset (`-2px`). Slight difference in ring placement between catalog fields (outside, 2px) and Prep notes/BP controls (inset).

**Open states**
- `.ms-trigger[aria-expanded]` gold border; `.sb-trigger[aria-expanded]` `line-strong` + `ink-hover` (not gold); `.bp-summary[aria-expanded]` gold .55 border; `.prep-title-btn[aria-expanded]` icon rotates + `hope-soft`. Four different "open" indicators.

## Icon Findings

**Libraries / sources:** no third-party icon library. All icons are hand-authored inline SVG strings in JS (`js/app.js` 29 × `0 0 24 24`, 1 × `0 0 20 20`; `js/soundboard-icons.js`; `js/battle-points-ui.js`) and CSS data-URI chevrons. Raster PNGs for brand and Prep section icons.

**Families inside the inline set**

| Family | Style | Stroke | Examples |
|---|---|---:|---|
| UI line icons | stroke, `fill="none"`, `currentColor` | **1.6** (24 uses) / 1.8 (7) / 1.5 (5) / 1.4 (3) / 1.7 / 2 / 1 / .8 | alert, minus, check, chevrons, bookmark, plus, more, trash, compass, hex, reroll, checklist, gallery/compact |
| Item action icons (`ITEM_*`) | **filled** (`fill="currentColor"`), Material-style paths | — | craft, link, external, share, image, copy |
| Soundboard icons | stroke, shared `HEAD` wrapper | 1.2, 1.5, 1.8, 1.9, 2 | 8 effects |
| Env symbol / badge | stroke ~1.4–1.7 + filled dot, `overflow: visible` | 1.7 (glyph) | `ENV_SYMBOL_BODY` |
| Search icon | 20×20 viewBox | — | only non-24 viewBox |
| Dropdown chevron | CSS data-URI, 12×8, stroke 1.6, **colour baked in** (`%239a8f7d`/`%23e9dfc7`) | 1.6 | `.field select`, `.ms-trigger` |
| Raster | PNG | — | `brand-logo.png`, `img/ui/section-adversaries.png`, `section-items.png`, `d12-roll.png` (Prep header/section icons and dice), fallback art; `img/icon_env.png`, `icon_adv.png`, `icon_loot.png`, `d12.png` are **untracked** |

**Findings**
- Stroke widths: 10 different values (1, 1.2, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2, .8). Dominant is 1.6 but chevrons/plus/minus use 1.8 (deliberate "heavier for simple glyphs"?) — E.
- **Stroke vs fill mix**: the 6 `ITEM_*` icons are solid Material-style while everything else is line art; they appear in the item card actions next to `loot-name-act` line icons — class B / needs visual review.
- **Raster vs SVG**: Prep section titles use PNG (`tableIconHtml`) for adversaries/items but inline SVG (`ICON_TABLE_ENVIRONMENTS`) for environments — the same "section icon" role in two formats (A/B, Medium). `.prep-central-icon--env` is gold; others are bitmap (colour not controllable via `currentColor`).
- Rendered sizes: 13 / 14 / 15 / 16 / 18 / 19 / 20 (+ 26 / 32 / 40 / 64 for large/fallback) with only 14 and 16 tokenised.
- Close/clear glyph is a **text `×`** in 7 places (`modal-close`, `search-clear`, `adv-art-close`, `bp-pop-close`, `prep-sel-remove`, `item-clear`, `storage-notice-close`) rendered at `--fs-md`/`--fs-lg`/`--fs-base`, whereas remove/clear in other places use SVG (`ICON_TRASH`, `ICON_MINUS`). Which icon represents *remove* vs *clear* vs *close* is not uniform — exact mapping per page needs a manual check (E).
- Colour: icons inherit `currentColor` ✔; resting colour is `--muted` for ghost buttons, `--parchment-dim` for `adv-art-copy`, `--parchment` for `sb-ctl`/`prep-item-nav-btn`.
- Disabled treatment: opacity (.35–.45), not colour; `bp-step`/`prep-item-nav-btn` .35 vs `.btn`/`sb-ctl` .45.
- Hit areas: see icon-only button table.

## Table / List Density (Prep and elsewhere)

| Pattern | Height | Padding | Radius | Border | Hover | Selected | Thumbnail |
|---|---|---|---|---|---|---|---|
| Prep central `--card` (environments/adversaries) | `--pc-card-h` 56 → **62** | main `0 --pc-pad-card` (6→8) | `r-md` | `--line-faint` | border `line-strong` + `ink-hover` + inset gold .08 | — | 40 → 44 |
| Prep central `--row` (items) | `--pc-row-h` 48 → **52** | `0 --pc-pad-x-row` (8→10) | `r-md` | `--line-faint` | border + `ink-hover` | — | 36 → 40 |
| Prep picker rows | content-driven (`line-height 1.4`) | `--sel-pad` 4 | — | — | — | `.is-recommended` gold-6% bg | 48 / 60 |
| `.prep-item-compact-row` | min 44 | `s-2 / calc(sel-pad - 1)` | `r-sm` | `--line-faint` | `ink-hover` | — | — |
| `.prep-item-card` (tile) | `clamp(108–128px)` square | — | `r-md` | `--line` | hover reveals checkbox | gold border + ring + inner glow | art |
| `.atl-row` | min `--h-md` 40 | `s-1 0` | `r-sm` | none | gold text | checkbox | — |
| `.ms-row` | auto (min 44 touch) | `s-2 s-3` | `r-xs` | none | white .06 | gold .16 | — |
| `.jr-row` | auto | `s-2 0` | — | `border-top` faint | — | — | — |

**Does density change at large desktop?** Yes — on Prep central only, via `--pc-*` overrides at `min-width:1800 && min-height:900`: row heights +4–6px, thumbs +4px, gaps 8→10px, font-size 14→15 / 12→13, header 36→40, title 17→18, remove button 32→34. Documented in design.md and deliberate; `--pc-pad-x` intentionally not scaled. Observations: the raised values are expressed as **literals** (13px, 15px, 18px, 62, 52, 44) inside the media block rather than reusing `--fs-*` tokens; `18px` for title/icon is not on the type scale (D); `--pc-remove-room` **decreases** (24→22) while `--pc-remove` increases (32→34) — worth a visual check for cramped name-to-remove spacing (E).
Picker side lists (adv thumb 60 + 7.5px padding) do **not** scale with density, so at 1920×1080 the side pickers and the central list use different text sizes (pickers 15/13, central 15/13 at big; **14/12 at laptop**) — at laptop the central list is *smaller* than the pickers. Probably intentional (central list is dense, pickers need scanning) but undocumented → E.

## Layout Findings

- Page structure: `.shell` 1180 centred on every route except Prep (≥1440 unbounded). Header `.header-inner` 1180 on all routes.
- `.site-header` sticky, z-index 30; soundboard 80; overlay 100; language float 150 (documented in CSS comments). No inconsistencies found in the stack order.
- Section spacing: `.toolbar` margin `s-6 / s-5`, `.page-title` margin-bottom `s-5`, `.journey-cols` gap `s-6`, `.prep-wrap` gap `s-6`, `.prep-main` gap `s-4`, card grid gap `s-4`. Tokenised and rhythmic.
- Prep toolbars use three different column templates (env 3 cols, adv 4 cols collapsing to 3 and 2, items 7 cols) and `min-height` 35/35/40 — intentional per picker but the heights diverge (see sizes).

---

## Top Issues

```text
1.  HIGH   (A) Icon-only buttons: 8 hit-box sizes (24/26/28/32/34/35/40/auto), 4 hit-area strategies, 3 resting-border treatments, 5 hover recipes, 5 icon sizes — across ≥15 classes.
2.  HIGH   (A) Chips/badges/tags: ~10 independent implementations; info chips split on caps/tracking (none/.05/.06) and font-size (10 vs 11); counts and inline interactive pills use 3 padding recipes; colour does not distinguish info vs interactive.
3.  HIGH   (B) Prep control heights are off-token and off-scale: 35px (search/ms-trigger/clear) and 30px (BP, recommend, FreshCutGrass) beside --h-sm 32 and --h-md 40; same-role search is 40px on Catalog and 35px on Prep.
4.  MEDIUM (B) Popover/dropdown surfaces: .ms-panel is r-sm with a raw shadow while sibling menus (.prep-menu, .bp-popover, .sb-panel) are r-lg + --e-3; modal border is --line while other overlays use --line-strong.
5.  MEDIUM (D) Alpha tints are not tokens: 88 rgba() literals — 15 gold alphas (.06–.55), 6 ink, 6 black; "gold-tint hover" uses .10/.14/.16 for one role.
6.  MEDIUM (B) Disabled treatment: five opacity levels (.35/.4/.45/.5/.7) and three mechanisms (:disabled, aria-disabled, .is-unavailable).
7.  MEDIUM (B) Focus: three outline-offsets (2/-2/1), .prep-title-input is border-only (violates the documented rule), list-card focus swaps border-colour (verify ring).
8.  MEDIUM (D) Near-duplicate breakpoints: max-width 640 (72 decls) vs 641 (4), plus isolated 1091, 1536, 400; three "wider screen" thresholds (1440/1480/1800).
9.  MEDIUM (B) Icons: 10 stroke widths; filled ITEM_* icons beside line icons; PNG section icons (adversaries/items) vs SVG (environments); text × in 7 close buttons vs SVG elsewhere; 13/15/18/19/20 px icons off the 14/16 tokens.
10. MEDIUM (B) Row/list items: four implementations (prep-sel--row 48/52, compact-row 44, atl-row 40, ms-row 44) with different radii (md/sm/sm/xs) and backgrounds; three checkbox recipes.
11. MEDIUM (D) Docs drift: design.md chip spec (fs-xs, caps, tracking) ≠ code (fs-micro, no caps for env chips); "never raw px" vs 72 raw-px spacing declarations.
12. MEDIUM (B) Fear (destructive-only per ui.md) is used for non-destructive roles: .feature-type.action, .adversary-link-btn, .jr-blight, .badge.pending.
13. MEDIUM (B) Typography: letter-spacing has 7 values for ~3 roles; line-height mixes unitless, token, and px; 10px (.filter-count, .badge, dice notation) is below --fs-micro; --fs-card-copy bypassed by raw 14px.
14. LOW    (D) One-off radius: 12px (.sp-session-control) beside r-lg 10/pill; 50% vs r-pill for round buttons.
15. LOW    (D) Raw spacing 1/2/3/5/6/7.5/10/22px in 72 declarations; 5px chip gaps and 6px Prep sub-scale have no tokens.
16. LOW    (B) Duplicate declarations inside rules (bp-step width 26→24, bp-summary padding-inline 10→8, prep-central-lead gap 6→4, sp-session-name max-width ×3, prep-freshcutgrass-link padding ×2).
17. LOW    (D) Link recipes: underline-at-rest (.link-btn, encounter-link) vs hover-only (a) vs none (encounter-builder); offsets 2px vs 3px; four hover colours.
18. LOW    (D) Prep big-density block re-expresses scale as literals (13/15 = --fs-sm/--fs-base; 18px off-scale).
19. LOW    (D) Scrollbar thumb alpha .34 (ms-panel) vs .38 (others); .rank-icon.active #d9a441 duplicates --hope; #0a0806 duplicates --ink-overlay.
20. LOW    (B) Checkmark glyph size differs (5×10 in .atl-row vs 5×9 in .prep-select-checkbox).
21. INFO   (C) Prep central panel intentionally brighter/rounder than side panels (ink-raised, line-strong, r-lg, gold top).
22. INFO   (C) Header fixed at 1180 on every route while Prep content goes full-bleed at ≥1440.
23. INFO   (C) Tier shown as hexagon badge on Catalog/filters and as plain text in Prep rows.
24. INFO   (-) Strengths: transitions 100% tokenised; elevation steps coherent; panel padding uniformly --s-4; 94% of font sizes and 79% of colour declarations tokenised.
```

---

## Needs Visual Review

1. Optical icon size and weight: 14/15/16/18/20px icons inside 24/28/32px boxes; env symbol vs bookmark in the 28px action group; 1.6 vs 1.8 stroke chevrons/plus.
2. Filled `ITEM_*` icons next to line icons in the item card.
3. PNG section icons vs inline SVG in Prep central headers (colour, sharpness at 16–18px, gold env icon vs neutral others).
4. Whether chips and interactive pills are distinguishable (teal biome chip vs teal `.item-btn`; gold region chip vs gold `.dice-btn`; fear `.adversary-link-btn` vs fear `.feature-type.action`).
5. Perceived height mismatch between 35px Prep search and adjacent 32px/30px buttons in the toolbars and BP bar.
6. 12px `sp-session-control` radius beside 4px-radius header buttons.
7. Prep central density at 1366×768 and 1440×900 (compact: 14/12px, 48/56px) vs 1920×1080 (comfortable) — rhythm, cramped name↔remove spacing, and the contrast between central text (14/12) and picker text (15/13) at laptop sizes.
8. Prep header (1180) vs full-bleed Prep content at 1440–1920.
9. `.ms-panel` (square-ish dropdown) vs `.prep-menu` (rounded) appearing on the same page.
10. Focus visibility on `.prep-title-input` and `.list-card-open` (border-colour-only candidates).
11. `.btn` press feedback: only hover exists; is the absence of `:active` perceptible?
12. Disabled contrast: .35 vs .45 on dark surfaces — which disabled controls read as disabled vs just muted.
13. Gold-tint hover visibility at .10 vs .14 vs .16.
14. 641px gap between 640 and 641 breakpoints (dev-tools check at exactly 641px).
15. Hex tier icons: 26px hit/visual size at laptop vs the 24px chips next to them.
16. Empty states (`.empty-state`, `.journey-empty`, `.prep-empty`) — not compared in code.
17. Hover transform `translateY(-2px)` on `.card` vs none on `.list-card`/`.journey-entry`.

---

## Machine-Readable Summary

```json
{
  "summary": {
    "critical": 0,
    "high": 3,
    "medium": 10,
    "low": 7,
    "informational": 4
  },
  "metrics": {
    "cssLines": 3739,
    "declarationsOutsideRoot": 3904,
    "colourDeclarations": 641,
    "colourDeclarationsUsingVar": 507,
    "hexLiteralsOutsideRoot": 10,
    "rgbaLiteralsOutsideRoot": 88,
    "fontSizeDeclarations": 139,
    "fontSizeUsingToken": 130,
    "spacingDeclarations": 461,
    "spacingDeclarationsUsingScale": 287,
    "spacingDeclarationsRawPx": 72,
    "disabledOpacityLevels": 5,
    "goldAlphaSteps": 15,
    "iconStrokeWidthValues": 10,
    "iconOnlyButtonSizes": [24, 26, 28, 32, 34, 35, 40],
    "breakpointsDistinct": 24
  },
  "topIssues": [
    { "severity": "high", "class": "A", "category": "icon-button", "description": "Equivalent icon-only controls use 8 hit-box sizes, 4 hit-area strategies, 3 resting-border treatments and 5 hover recipes across >=15 classes." },
    { "severity": "high", "class": "A", "category": "chip-badge", "description": "About 10 independent chip/badge/pill implementations diverge on caps, tracking, font size, padding and radius; info vs interactive roles are not colour-distinguishable." },
    { "severity": "high", "class": "B", "category": "control-height", "description": "Prep uses untokenised 35px and 30px control heights beside --h-sm 32 and --h-md 40; same-role search is 40px on Catalog and 35px on Prep." },
    { "severity": "medium", "class": "B", "category": "popover-surface", "description": ".ms-panel uses r-sm and a raw shadow while sibling menus use r-lg and --e-3; modal border differs from other overlays." },
    { "severity": "medium", "class": "D", "category": "alpha-tints", "description": "88 rgba literals including 15 gold alpha steps; gold-tint hover uses .10/.14/.16 for one role." },
    { "severity": "medium", "class": "B", "category": "disabled-state", "description": "Five disabled opacity levels (.35/.4/.45/.5/.7) and three disabled mechanisms." },
    { "severity": "medium", "class": "B", "category": "focus", "description": "Three outline offsets; .prep-title-input is border-only focus contradicting the documented rule." },
    { "severity": "medium", "class": "D", "category": "breakpoints", "description": "max-width 640 (72 decls) vs 641 (4); isolated 1091/1536/400; three wide-screen thresholds 1440/1480/1800." },
    { "severity": "medium", "class": "B", "category": "icons", "description": "10 stroke widths, filled ITEM_* icons beside line icons, PNG vs SVG section icons, text x close glyphs, off-token icon sizes." },
    { "severity": "medium", "class": "B", "category": "rows", "description": "Four row/list-item implementations and three checkbox recipes with different heights, radii and backgrounds." },
    { "severity": "medium", "class": "D", "category": "docs-drift", "description": "design.md chip spec and 'no raw px' claim differ from the CSS." },
    { "severity": "medium", "class": "B", "category": "semantic-colour", "description": "Fear colour used for non-destructive roles (feature type action, adversary link, blight, pending badge)." },
    { "severity": "medium", "class": "B", "category": "typography", "description": "Seven letter-spacing values for ~3 roles; mixed line-height units; 10px below --fs-micro; --fs-card-copy bypassed." },
    { "severity": "low", "class": "D", "category": "radius", "description": "12px one-off radius on .sp-session-control; 50% vs r-pill for round buttons." },
    { "severity": "low", "class": "D", "category": "spacing", "description": "Raw 1/2/3/5/6/7.5/10/22px spacing in 72 declarations." },
    { "severity": "low", "class": "B", "category": "css-hygiene", "description": "Duplicate declarations within single rules (bp-step, bp-summary, prep-central-lead, sp-session-name, prep-freshcutgrass-link)." },
    { "severity": "low", "class": "D", "category": "links", "description": "Underline-at-rest vs hover-only links, offsets 2px vs 3px, four hover colours." },
    { "severity": "low", "class": "D", "category": "prep-density", "description": "Big-density block uses literals duplicating tokens and an off-scale 18px." },
    { "severity": "low", "class": "D", "category": "colour-duplicates", "description": "Scrollbar alpha .34 vs .38; #d9a441 and #0a0806 duplicate tokens." },
    { "severity": "low", "class": "B", "category": "checkbox", "description": "Checkmark 5x10 vs 5x9 across checkbox recipes." }
  ],
  "needsVisualReview": [
    "Optical icon sizing and stroke weight",
    "Filled ITEM_* icons vs line icons",
    "PNG vs SVG section icons in Prep headers",
    "Info vs interactive chip distinguishability",
    "Prep toolbar control height mismatch (35/32/30)",
    "sp-session-control 12px radius",
    "Prep density at 1366x768 / 1440x900 / 1920x1080",
    "Prep central vs picker text size at laptop sizes",
    "Header 1180 vs Prep full-bleed content at >=1440",
    "ms-panel vs prep-menu surface shape",
    "Focus visibility on prep-title-input and list-card-open",
    "Absence of :active feedback on .btn",
    "Disabled contrast at .35 vs .45",
    "Gold-tint hover visibility at .10/.14/.16",
    "Exact 641px viewport behavior",
    "Empty-state components"
  ]
}
```
