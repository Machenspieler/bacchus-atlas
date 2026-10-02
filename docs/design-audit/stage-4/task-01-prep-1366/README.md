# Stage 4 · Task 01 — Prep column allocation at 1366×768

CSS-only change (`css/styles.css`, 1200–1439px media block). Measured with
`node scripts/design-audit/stage4-prep-layout.mjs --label=before|after`
(same deterministic "full" Prep profile as Stage 2). Raw numbers:
`measurements__before.json`, `measurements__after.json`.

| 1366×768 (measured) | Before | After |
| --- | --- | --- |
| Shell side padding | 20px | 12px |
| `.prep-main` width | 1311px | 1327px |
| Column gap | 16px | 12px |
| Left (env picker) | 334.5px | 315.9px |
| Center | 551px | 592.3px |
| Right (adv picker) | 393.5px | 394.8px |

1440×900 and 1920×1080 measure identically before/after (354/583/416 and 479/790/564).
Files `*__before*` are the pre-change captures; unsuffixed PNGs are the after state.
