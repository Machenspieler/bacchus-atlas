# Verification (Chrome 155 via Playwright, 100 % zoom)

## Automated
- `node --test tests/*.test.js`: 1226 tests, 1220 pass, 0 fail, 6 skipped.
- `node scripts/validate-data.js`: 0 errors, 2 warnings (pre-existing).
- `build.js`, `version-assets.js`, `check-asset-versioning.js`, `check-unlisted-build.js`, `check-journey2-build.js`: all pass.

## F-01 (`logs/f1-modal-close.json`, `screenshots/F1-*`)
EN/RU 1280×720, EN 1512×982, 1920×1080 (+1280×800, 1366×768, 1536×864): × fully in view at top, middle and bottom; closes via button, Escape and backdrop in every run; page scrollY 0; no console messages.

## F-02 (`logs/f2-scroll-cue.json`, `screenshots/F2-*`)
Mean luminance added by the cue over the 22px edge strip (before fix ≈ 5 of 255 darker; now ≈ 15–20 lighter):
- 1280×720 top: top 0.03 / bottom 18.5; middle: 16.8 / 19.8; end: 19.8 / 0.05.
- 1366×768 top: 0.03 / 14.3; middle: 18.3 / 19.1; end: 19.8 / 0.02.
- Content that fits (1280×720 without picker, 1920×1080): ≤ 0.02, i.e. no cue.

## F-03 (`logs/f3-scroll-handoff.json`, `logs/f3-assign.json`)
Pointer kept over the Forest list. At 1280×720 list scrollTop 828/829 (end) with outer 0, continued wheel → outer 204/204; reverse → list back to 0 then outer back to 0. Same at 1366×768 (outer 0→147) and 1536×864 (0→36). Assigning the third row ("Bastion") assigns it correctly. (The assignment step inside `f3-scroll-handoff.json` used a faulty selector; `assign.cjs` is the valid check.)

## F-04 (`logs/f4-resize.json`, `screenshots/F4-*`)
| Case | Result |
|---|---|
| 1920×1080 → 1280×720 (hex x=1700) | hex x 1700→1206 visible; camera x −999→−1493, y same; zoom 1; fit off; one inspector, caret kept; Return to stock in view; grow back keeps hex visible |
| → 1512×982 / 1366×768 | camera x −999→−1261 / −1407; same invariants |
| 1512×982 → 1280×720 | −1369→−1493 |
| bottom-edge hex 1920→1280×720 | only y panned (−559→−893) |
| 1280×720 → 1920×1080 | camera unchanged |
| centred hex 1920→1280×720 / 1366×768 (control) | camera unchanged (−1999,−1199) |

Sequence screenshots: `F4-1920-to-1280x720-right-before-1920x1080.png`, `…-after-1280x720.png`, `…-after-grow-1920x1080.png`. Before (audit 03): `../journey-audit-03-responsive/screenshots/F-04-*`.

## Console
No page errors. Only `ERR_CERT_AUTHORITY_INVALID` for fonts.googleapis.com in the sandbox (network, unrelated) in two control runs.

## Not re-run
The full 8-viewport matrix was run for F-01 on 7 viewports (not 1440×900/1600×900), F-02/F-03 on the viewports where the inspector overflows. Drawer-collapse behaviour is unchanged by construction (no window resize fires).
