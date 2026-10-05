# Stage 4 · Task 07 — typography micro-consistency

Measured with `node scripts/design-audit/stage4-typography.mjs --before-css=<HEAD styles.css>`
(raw: `measurements.json`): 11 identical states rendered with the old and new stylesheet, every visible
element's box, line count and computed type diffed. Sheets: `node scripts/design-audit/stage4-typography-sheets.mjs`.

| Change | Result |
| --- | --- |
| `.filter-count` 10px → `--fs-micro` | font 10→11px; badge geometry fixed (18px) → no layout change |
| `.badge` 10px/.05em → `--fs-micro` (group) + `--tracking-badge` | dormant — no environment is untranslated today, so it cannot be captured in the app |
| `.dice-result-pop .notation` 10px → `--fs-micro` | popup 72.7 → 74.2px tall (+1.5px, transient floating surface) |
| `.feature-prompt` raw 14px → `--fs-card-copy` | identical computed values |
| `--tracking-badge` (.06em) on `.badge`, `.feature-type`, `.adversary-range/damage-type-badge`, `.jr-blight` | only `.jr-blight` moved (.05em → .06em): 118.1 → 119.6px wide, same height/lines |
| Prep comfortable block `13px/15px/13px` → `--fs-sm/--fs-base/--fs-sm` | computed values identical; Prep 1366/1440/1920 has 0 element diffs across ~7,050 elements each |

Everything else — Catalog, Lists, Journey (except the blight chip), both detail overlays at 1440×900 — has zero box/line/overflow diffs.

Sheets: `contact-sheet__typography-roles__1440x900.png`, `before-after__typography-changes.png`;
full frames in `frames/`, per-element crops in `crops/`.
