# My Lists CLS investigation

## 1. Reported problem
`docs/research/adaptive-list-covers-complete-library.md` §10 recorded "layout shift on the page measured ~0.32 … predates this phase". No script in the repo produced that number (`scripts/shoot-list-covers.js` never observes layout shifts), so it came from an ad hoc session.

## 2. Was 0.32 valid?
**Yes, and it is a real, user-visible cold-load shift — not an artifact and not the covers.** Re-measured with a proper harness (below): 0.304 cold / 0.316 warm at 1440×900, from a single shift ~80–170 ms after navigation. Fixtures are seeded before the first byte (`addInitScript`), so nothing is injected after first paint. The old note's conclusion ("not caused by the covers") was right; "nothing to fix" was not. The same shift hit the **catalogue** harder (0.44).

## 3. Methodology
- `scripts/measure-cls.js` (new, dev-only): fresh context, localStorage seeded pre-load, `PerformanceObserver({type:'layout-shift', buffered:true})` installed before page scripts, 2.5 s settle, official session-window CLS (`scripts/lib/cls.js`: 1 s gap / 5 s span windows, `hadRecentInput` excluded, max window). Per shift it records time, `document.fonts.status`, pending images, and each source node with previous/current rect.
- Cold = fresh context; warm = second navigation in the same context (HTTP cache; local server sends `max-age`). Google Fonts load from the network in both.
- Run: `node scripts/measure-cls.js [--route=#/lists] [--scenario=illustrated|biome|empty] [--viewport=1440x900] [--lang=ru|en] [--cache=cold|warm|both] [--all --json]`.

## 4. Significant shifts (before, 1440×900, `#/lists`)
| t | value | element | movement |
|---|---|---|---|
| ~80–170 ms | 0.30–0.32 | `footer#footer` | y 859 → below the fold (empty 41 px bar leaves the viewport) |
| same frame | | `div#grid-wrap` | y 150 → 74, height 416 → 826 |
| ~230 ms | 0.003 | `.list-card` | ±6 px as the web font swaps in (`fonts: loading`) |

## 5. Root cause
`index.html` ships the static loading shell, and the shell's `<footer class="site-footer" id="footer"></footer>` is empty but still has padding + border and `margin: auto auto 0`, so it paints as a 41 px bar **pinned to the viewport bottom** under the 6-card skeleton. The first real render grows `#grid-wrap` past the viewport and pushes that bar out of view; Chrome scores a visible element that leaves the viewport at full viewport distance. The visible grid's own 76 px move is a much smaller part. Not fonts, ribbons, images, backgrounds or scrollbars (cards and covers are fixed-height; header is the same 45 px bar before and after).

## 6. Production change
One CSS rule in `css/styles.css` next to `.site-footer`:
`#main[aria-busy="true"] ~ .site-footer { display: none; }`
`#main` carries `aria-busy` for exactly the shell's lifetime (`beginInitialLoading` → `finishInitialLoading` / `failInitialLoading`, which sets `"false"`), so the footer simply appears with the real page. No JS, no markup, no timers; the footer's final look is unchanged, ribbons untouched.

### 6b. Phone follow-up (second change)
At 390 px the footer fix did nothing (0.179): the catalogue-shaped skeleton toolbar wraps tall, then the Lists page — which has no toolbar — replaced it (`#grid-wrap` y 237 → 60, height 607 → 784). Following the existing `data-boot-route` pattern, a pre-paint script in `index.html` sets `bootRoute='lists'` for `#/lists` and `#/lists/env/<id>` only (a single list, `#/lists/<id>`, still renders the catalogue grid and keeps its skeleton), and `css/styles.css` hides `.skeleton-toolbar` and the skeleton cards under it. `finishInitialLoading()` already deletes the flag. Cost: the Lists page has no skeleton while data loads (~100–200 ms); it then appears whole.
After: 390×844 0.008 (illustrated/biome, en), 0.0006 (empty); 1440×900 0.003 / 0.0004; warm phone 0.000.

## 7. Test-script changes
New `scripts/measure-cls.js` and `scripts/lib/cls.js`; `tests/cls.test.js` covers the window maths (gap, 5 s cap, recent-input exclusion, max-not-sum) and the footer/`aria-busy` contract. `shoot-list-covers.js` is unchanged (it never measured CLS).

## 8. Before → after (CLS, session-window, 1440×900 unless noted)
| Scenario | Before | After | Cause |
|---|---|---|---|
| My Lists illustrated, cold ru | 0.304 | 0.042 | footer bar leaving viewport |
| My Lists illustrated, warm ru | 0.316 | 0.038 | same |
| My Lists biome-only, cold / warm | 0.426 / 0.470 | 0.042 / 0.051 | same (longer page) |
| My Lists empty, cold / warm | 0.028 / 0.026 | 0.024 / 0.023 | shell toolbar → page (small) |
| illustrated, en cold | 0.304 | 0.042 | same as ru |
| 1280×800 / 1920×1080 illustrated cold | 0.444 / 0.033 | 0.052 / 0.031 | same |
| Catalogue `#/` cold (out of scope, same cause) | 0.443 | 0.006 | same |
| 390×844 illustrated cold | 0.179 | 0.008 | not the footer: wrapped skeleton toolbar — fixed by §6b |

After-fix, full matrix (4 viewports × illustrated/biome/empty × ru/en × cold/warm = 48 runs): every desktop run 0.017–0.051 (footer fix alone); the 390 px runs 0.171–0.200 until §6b brought them to ≤ 0.008 (spot-checked, not the full matrix). Illustrated vs biome-only differ by ≤0.01 — the covers are not a factor.

## 9. Visual regression
Before/after screenshots in `docs/research/my-lists-cls-investigation/` (lists RU/EN, empty, catalogue, ribbon hover). EN/empty/catalogue/hover PNGs are byte-identical; the RU lists PNG differs only by sub-pixel text antialiasing (viewed side by side: same layout, covers, ribbons, footer). The footer is `display:flex`, 76 px, after load. Card/cover heights, ribbons and hover untouched (CSS touches only the pre-render footer).

## 10. Suite and build
`node --test tests/*.test.js` 1575/1575 pass (incl. new `tests/cls.test.js`); `validate-data` 0 errors; build/versioning/unlisted/journey checks pass (see commit).

## 11. Remaining limitations
- Phone width (390): resolved by §6b.
- `#/prep`: 0.08 (`main.shell` width 1180 → full-bleed after render) — under 0.10, left alone.
- Web-font swap contributes ≈0.003–0.008; not worth a metric-compatible fallback.
