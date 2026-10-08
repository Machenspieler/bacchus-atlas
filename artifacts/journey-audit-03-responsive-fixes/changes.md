# Changes

| Fix | File | Change |
|---|---|---|
| F-01 | `js/app.js` `openDetailOverlay` | Over `#/journey` only (`state.route.name === 'journey'`), the × is rendered in a `.modal-close-dock` before the header instead of inside it; modal gets `.modal--close-dock`. Same button, same handlers. |
| F-01 | `css/styles.css` | `.modal--close-dock`: dock is `position: sticky; top: 0; height: 0`; button absolutely placed at its original spot with a card background; header gets right padding so title/tier pills never sit under it. |
| F-02 | `css/journey2.css` `.j2-insp-scroll` | Scroll-cue layers: dark radial shadows replaced by 22px parchment-tinted (`0.2` alpha) linear fades; covers lengthened (24px) so a cue is fully hidden at scroll start/end. |
| F-03 | `css/journey2.css` `.j2-hexenv-list` | Removed `overscroll-behavior: contain` (native chaining). Height cap unchanged. |
| F-04 | `js/journey2-view.js` | `window` `resize` → 140 ms debounce → `reconcileInspectorAfterResize()`: if the inspected hex centre is outside the map area, clamp it in by a minimal pan (zoom kept, `fitMode` untouched), then `ensureInspectorClear()`. `inspectorAnchor(view, keepOffscreen)` gained an optional flag. |
| docs | `docs/product-decisions.md` | PD-042. |
