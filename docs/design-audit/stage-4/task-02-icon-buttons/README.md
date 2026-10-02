# Stage 4 · Task 02 — Semantic icon-button families

Shared recipe: `.icon-btn` + modifiers in `css/styles.css` (block comment above it
documents the roles); one glyph constant `ICON_CLOSE` in `js/app.js`; summary in
`design.md` → "Icon-only buttons".

## Inventory → family

| Control | Role | Family after |
| --- | --- | --- |
| `modal-close` (×4 overlays) | dismiss-close | `.icon-btn.icon-btn--reach` |
| `adv-art-close` | dismiss-close (over imagery) | `.icon-btn--overlay.icon-btn--reach` |
| `bp-pop-close` | dismiss-close | `.icon-btn` (32px, popover hover fill) |
| `storage-notice-close` | dismiss-close | `.icon-btn.icon-btn--reach` |
| `countdown-overlay-close` (not in brief) | dismiss-close | `.icon-btn.icon-btn--reach` |
| `search-clear-btn` (catalog + Prep) | clear-value | `.icon-btn.icon-btn--reach` |
| `item-clear-btn` | clear-value | stays `.btn.btn-ghost`; SVG glyph only |
| `prep-sel-remove` | remove-entry | `.icon-btn--danger` |
| `prep-central-clear` | delete (whole category of the saved Prep) | `.icon-btn--danger` |
| `list-card-del` | delete (saved list) | `.icon-btn--danger.icon-btn--reach` |
| `jr-icon-btn` ×2, `loot-name-act`, `adv-art-copy`, `prep-icon-btn` | utility-toolbar | `.icon-btn--utility` |
| `bp-step` | utility-toolbar (segment) | own box; utility recipe (muted → gold-soft, `--ink-raised`) |
| `countdown-overlay-btn`, `prep-item-nav-btn` | navigation-overlay | `.icon-btn--circle` |
| `card-add-btn`, `env-prep-btn` | context-specific | unchanged (gold affirmative toggles) |
| `sb-ctl`, `sb-trigger` | context-specific | unchanged (enclosed audio control, `aria-pressed`) |

## Files

- `before/`, `after/` — Stage 2 capture routines re-run by `scripts/design-audit/stage4-icon-buttons.mjs` (1440×900 crops; `after/regression/` has full-context shots incl. Prep at 1366×768 and 1920×1080).
- `sheets/{dismiss,clear,utility,circle}` — `before__*`, `after__*` family contact sheets; `before-after__*` pair every control BEFORE | AFTER.
- `verification.json` — 134 checks from `scripts/design-audit/stage4-icon-buttons-verify.mjs`.

Re-run: `--label=before|after`, then `--compose`; `stage4-icon-buttons-verify.mjs` for the checks.
