# Stage 4 · Task 03 — Floating surface families

Shared shell (one grouped rule above `.ms-panel` in `css/styles.css`, summary in `design.md` → "Floating surfaces").

| Component | Family | Before | After |
| --- | --- | --- | --- |
| `.ms-panel` | A interactive | r-sm, raw `0 8px 20px` shadow, rows r-xs | r-lg, `--e-3`, rows r-sm |
| `.prep-menu` | A | r-lg, e-3, ink-raised | unchanged values (now from the shared rule) |
| `.bp-popover` | A | r-lg, e-3, ink-raised | unchanged values (shared rule) |
| `.sb-panel` | A | r-lg, e-3, **ink-card** | unchanged; keeps ink-card (tiles are ink-raised wells) |
| `.tooltip`, `.sp-session-hint`, `.dice-result-pop` | B small | r-sm, e-3, compact padding | unchanged |
| `.modal`, `.adv-art-modal-card` | C | r-lg, e-4 | unchanged |
| `.countdown-overlay` | semantic exception | r-lg, e-3, teal border | unchanged |

## Local fixes found while verifying

- Prep adversary Type panel (≤1536px, ≥761px): the trigger is flush with the column's right edge, so the left-anchored 190px panel ran ~42px past the column/viewport and was clipped. It is now right-anchored.
- The same panel sits in an `overflow:hidden` Prep column that cut off its lower rows (e.g. "Support" unreachable). `capMultiSelectRoom()` in `js/app.js` sets `--ms-room` (the room above the clipping ancestor); the panel scrolls instead. No effect where there is no clipping ancestor.

## Files

- `1440x900/`, `1366x768/`, `1920x1080/` — full-context shots (`multiselect-open`, `session-menu-open`, `bp-popover-open`, `soundboard-open`).
- `crops/contact-sheet__interactive-panels__1440x900.png` — the four panels at 1:1.
- `before-after__ms-panel.png` — Stage 2 baseline vs. now.
- `crops/…ms-panel-scrolling…`, `…scrolled-end…` — scroll vs. rounded corners.
- `verification.json`, `measurements.json` — checks from `scripts/design-audit/stage4-floating-surfaces.mjs` (re-run it to regenerate everything).
