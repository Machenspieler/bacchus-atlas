# Stage 4 · Task 06 — breakpoint cleanup

Measured with `node scripts/design-audit/stage4-breakpoints.mjs --label=before|after`
(raw: `boundaries__before.json`, `boundaries__after.json`; N-1/N/N+1 for every
width breakpoint, plus the 1800×900 / 1920×900 height edges). Contact sheets:
`node scripts/design-audit/stage4-breakpoints-shots.mjs --before-css=<old styles.css>`
(the "before" frames serve the pre-change stylesheet into the same page/state).

Diff of before→after across the whole sweep (only these fields changed):

| Change | Where it shows |
| --- | --- |
| `max-width: 641px` → `640px` (watermark) | catalog @641: watermark opacity 0.14 → 0.26, size 640px → 525.62px (now matches 642) |
| Prep adversary Type panel anchor: dropped the stray `min-width: 761px` | Prep ≤760: panel `left:0` (ran off the right edge by ~40px) → `right:0` |
| Prep Items toolbar wrap: `<=900` viewport → `@container prep-items-panel (max-width: 1100px)` | Prep 901–1092: page overflow 213/113/22px → none; toolbar wraps to 2 rows (79px) |

Everything at ≥1200px (including 1366/1440/1920, 1800×900) is identical
before/after. Sheets: `contact-sheet__640-641-642__before-after.png`,
`contact-sheet__tablet-fixes__before-after.png`,
`contact-sheet__main-targets__1366-1440-1920.png`.
