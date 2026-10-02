# Stage 2 — screenshot suite

Visual evidence for the Stage 1 design-consistency audit. Capture-only: no UI was changed.

## Layout

- `1366x768/`, `1440x900/`, `1920x1080/` — full-context viewport screenshots (`<viewport>__<page>__<state>.png`).
- `crops/` — component crops (`__crop.png`, magnified, zoom recorded in the manifest) and captioned contact sheets (`__sheet.png`) that tile real crops for side-by-side comparison.
- `breakpoint-640-642/` — the 640 / 641 / 642 × 900 diagnostic.
- `manifest.json` — index of every file + measurements. `capture-report.md` — environment, coverage, Stage 1 checklist, objective findings, gaps.

## Re-run

```bash
npm install            # installs the dev-only Playwright dependency
npx playwright install chromium   # once, if the browser is not cached
npm run design:audit:screenshots
```

Options: `--only=core,prep,ui,icons,states,breakpoint`, `--vp=1440x900`, `--out=<dir>`. A partial run writes `manifest.partial.json` instead of overwriting `manifest.json`.

## Reading crops

Crops are cut from a 1x render and enlarged with nearest-neighbour (no smoothing), so edge sharpness is the browser's real 1x output. The `zoom` field in the manifest gives the factor; `cropRegionCssPx` gives the source rectangle.
