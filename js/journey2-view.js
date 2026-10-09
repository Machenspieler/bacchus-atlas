/* ============================================================
   Bacchus's Atlas — journey2-view.js
   The #/journey GM map editor (internally "Journey 2"; Phase 1): a fixed, measured map
   of Valloren with a region generator, a per-batch hex stock, drag-one /
   drag-all-remaining placement, individual tile movement, return-to-stock,
   Undo/Redo, local saving and full GM JSON backup import/export. The
   Phase 0 diagnostics (calibration grid, control cells, markers, protection
   areas, temporary proof overlay, print proof) are still here, but behind a
   secondary "Diagnostics" action, closed by default.

   Phase A: the generator is one fully random action (no manual habitat, size
   or terrain); a generated region is immutable and
   can be deleted whole. The sidebar is an animated overlay on the map, region
   cards are compact with one expanded at a time, zoom uses fixed steps
   including exactly 100%, and the model enforces connected region shapes
   while only warning about enclosed empty hexes.

   Phase B: the map is the primary inspection surface. Clicking any placed hex
   (or the card's Inspect button, which also works for an unplaced region) opens
   one screen-space Region Inspector over the map: the region's Habitat, Terrain,
   Encounter, Rumor and counts, plus — when opened from a placed hex — that
   hex's cell and its Return to stock action. The
   sidebar is only for generating, placing, deleting and opening the inspector;
   the inspector's state is transient and independent of which card is expanded.

   Phase C: Fog of War and Player Preview. Visibility is CELL-based campaign data (`doc.playerVisibility`, edited only
   through the model's `setCellsRevealed` command). Reveal/Hide are map tools: one pointer stroke (hex-line
   interpolated so a fast drag leaves no gap) is ONE Undo entry committed on release. The GM always sees every
   generated tile; a subtle veil only marks unexplored cells. Player Preview is a temporary read-only render of
   `Journey2Projection.buildPlayerProjection(doc)` — generated content in hidden cells is not produced at all, and
   the same projection is what the future print renderer will draw. The active tool, the preview mode, the hover
   cell and an in-progress stroke are transient view state (never in the document, history or backup); only the
   "Show fog state" preference is stored (dhcodex_journey2_ui).

   Sanctuaries (PD-023): GM-only generated settlements on the printed sanctuary icons. One toolbar button rolls all of them
   (one undoable `setSanctuaries` command); clicking a generated icon opens a screen-space overlay with the seven tables and
   Delete / Reroll / close. The open sanctuary is transient view state; the ring layer is emptied in Player Preview.
   Sanctuary names (PD-027): the overlay's Player map row reveals / hides ONE name (`setSanctuaryNameRevealed`); Player Preview draws only the
   projection's `sanctuaryLabels` (world-px layout from Geo.layoutSanctuaryLabels) above the fog, never the tables.

   Locate Soul Echoes (PD-030): a GM-only map tool. "Locate Soul Echoes" asks for the party's hex, finds the nearest uncollected Echo by
   straight-line map distance (js/journey2-locate.js, pure) and shows an animated sixteen-point compass in a screen-space popover —
   direction only, never a name, distance or target. The tool state (selecting / animating / result, hover, frozen bearing) is transient:
   never in the document, history, backup or storage; the sanctuary overlay's Soul Echo row (Available / Collected) is the only persisted part.

   Route Planner (PD-031): a GM-only map tool. "Plan route" asks for A then B and shows Fastest (default), Shortest and Fewer encounters as a line
   with A / B pins and a compact summary (js/journey2-route.js, pure). Terrain Ratings are never invented for ungenerated cells. The state is
   transient: never in the document, history, backup or storage, and never in Player Preview, the projection or a print.

   Layering (see docs/architecture.md "Journey 2 map editor"):
     js/journey2-geometry.js  measured lattice + camera math (pure)
     js/journey2-model.js     document, policy, commands, history (pure)
     js/journey2-projection.js the player-facing projection (pure)
     js/journey2-locate.js    Locate Soul Echoes: bearing, sixteen directions, nearest Echo, session state machine (pure)
     js/journey2-env-deal.js  Environment dealer: least-used-first random Environments for freshly placed hexes (pure)
     js/journey2-encounter-roll.js  Encounter Roll: Terrain-Rating d6s, any 1 triggers (PD-039; pure)
     js/journey2-route.js     Route Planner: A* over the hex grid, three strategies, route statistics, planner state machine (pure)
     js/journey2-store.js     local persistence over safe-storage
     js/journey2-view.js      this file: DOM, pointer state, rendering
   The model owns every rule; this file never mutates a document, it only
   builds commands and dispatches them through one validated path that the
   tests share.

   Isolation contract:
   - Mounted into #grid-wrap by app.js only on the journey2 route and torn
     down by Journey2View.unmount() on every other route. Everything it adds
     (DOM, listeners incl. the document-level ones, ResizeObserver, rAF,
     in-flight fetches, blob URLs, dialogs, the print root) is released there;
     a late load never mounts into another page and a late callback never
     writes a stale snapshot.
   - Geometry comes only from the geometry module and the promoted
     data/journey2/*.json. A load/validation failure shows an error state —
     never guessed geometry.
   - Transient interaction state (drag, preview, armed click, selection, the
     open Region Inspector) is never persisted and never enters Undo history.
   - Keyboard handling: map keys are bound to the focused viewport; the only
     document-level handlers are Escape (close a menu, else cancel a fog stroke,
     a drag/pan or armed placement, else leave Player Preview, else leave the fog
     tool, else close the Region Inspector), Space (temporary pan while a fog tool is
     active) and Undo/Redo; Undo/Redo is ignored while a text field, select,
     contenteditable or dialog is active, and in Player Preview.
   ============================================================ */
(function (root, factory) {
  root.Journey2View = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const Geo = root.Journey2Geometry;
  const Model = root.Journey2Model;
  const Store = root.Journey2Store;
  const Projection = root.Journey2Projection;
  const Tint = root.Journey2BiomeTint;
  const Print = root.Journey2Print;
  const Locate = root.Journey2Locate;
  const Seekers = root.Journey2ShadowMarks;
  const Route = root.Journey2Route;
  const EnvDeal = root.Journey2EnvDeal;
  const EncRoll = root.Journey2EncounterRoll;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MAX_ZOOM = 8;
  const CLICK_SLOP_PX = 4;
  const MARKER_HIT_SCREEN_PX = 14;
  const GLYPH_SCALE = 0.55;                         // native symbol px -> world px
  const BLIGHT_X_HALF = 7;                           // half-size of the blight X drawn at the top of a blighted tile
  const TERRAIN_DEMO = [1, 2, 3, 4, 2, 3, 1];
  const HABITAT_DEMO = ['forest', 'mountain', 'aquatic', 'grassland', 'tropical', 'drylands', 'rolling'];
  // Fixed world rectangles for the print proof (A4 landscape, 0.2 mm per world px).
  const PRINT_SCALE_MM_PER_PX = 0.2;
  const PRINT_PAGE = { paper: 'A4 landscape', widthMm: 297, heightMm: 210, marginMm: 10, contentMm: [277, 190], proofMm: [277, 172] };
  const PRINT_PROOFS = [
    { id: 'marrogate', titleKey: 'journey2_print_marrogate', rectPx: [0, 2325, 1385, 860] },
    { id: 'seam', titleKey: 'journey2_print_seam', rectPx: [1732, 1170, 1385, 860] },
  ];
  const HINT_MS = 3600;

  let current = null;

  function mount(container, opts) {
    if (current && current.container === container && !current.disposed) { current.relocalize(opts); return current; }
    unmount();
    current = createInstance(container, opts);
    return current;
  }
  function unmount() {
    if (current) { const c = current; current = null; c.dispose(); }
  }
  function isMounted() { return !!(current && !current.disposed); }
  function preparePrintProof(id) { return current ? current.preparePrintProof(id) : Promise.reject(new Error('Journey view is not mounted')); }
  function cleanupPrintProof() { if (current) current.cleanupPrintProof(); }
  function debugState() { return current ? current.debugState() : null; }
  function debugApi() { return current ? current.debugApi : null; }

  /* ---------------- small helpers ---------------- */

  function el(tag, attrs, html) {
    const n = document.createElement(tag);
    if (attrs) for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function fmt(v, d) { return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
  function pathOf(pts) { return 'M' + pts.map(p => fmt(p[0], 2) + ' ' + fmt(p[1], 2)).join('L') + 'Z'; }
  function rectAttrs(r) { return 'x="' + r[0] + '" y="' + r[1] + '" width="' + r[2] + '" height="' + r[3] + '"'; }
  function versioned(path, key) {
    return typeof root.appendVersionParam === 'function' && key && /^[a-f0-9]{16}$/.test(key) ? root.appendVersionParam(path, key) : path;
  }
  function fetchJson(path, signal) {
    const url = typeof root.versionedDataUrl === 'function' ? root.versionedDataUrl(path) : path;
    return fetch(url, { signal: signal }).then(r => {
      if (!r.ok) throw new Error(path + ': HTTP ' + r.status);
      return r.json();
    });
  }
  function isEditableTarget(t) {
    if (!t || !t.closest) return false;
    if (t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return true;
    return !!document.querySelector('dialog[open]');
  }

  /* ---------------- instance ---------------- */

  function createInstance(container, opts) {
    let t = (opts && opts.t) || (k => k);
    let lang = (opts && opts.lang) || 'en';
    let generator = (opts && opts.generator) || null;
    let environmentsFor = (opts && opts.environmentsForBiome) || (() => []);   // biome id -> [{ id, name, tier, href }], supplied by app.js from the catalog
    const toast = (opts && opts.toast) || (() => {});
    const storage = opts && 'storage' in opts ? opts.storage : null;
    let nf = makeNumberFormat();

    const inst = {
      container: container, disposed: false, relocalize: relocalize, dispose: dispose,
      preparePrintProof: preparePrintProof, cleanupPrintProof: cleanupPrintProof, debugState: debugState, debugApi: null,
    };
    const abort = new AbortController();
    const cleanups = [];
    let data = null;                       // { template, anchorsDoc, symbols[], symbolById, grid, ctx, readiness, protections }
    let baseImg = null;
    let cam = { scale: 0.25, tx: 0, ty: 0 };
    let fitMode = true;
    let savedView = null, cameraReady = false, cameraSaveTimer = 0;   // the stored camera ({ fit, cx, cy, scale } | null), whether a stored camera may be overwritten yet, and the debounce timer
    let rafId = 0, pendingApply = false;

    /* committed state */
    let doc = null, history = null, store = null;
    let saveState = { status: 'loading', reason: null };    // loading | saved | unsaved | failed | blocked | unavailable
    let loadInfo = null;                                    // result of store.load()
    let editLocked = false;                                 // saved map unreadable and unresolved: edits would be lost/overwrite
    /* transient state (never persisted, never in history) */
    let tr = null;                                          // active drag / armed click
    let pan = null;
    let spaceDown = false;
    let sel = { tileId: null };
    let inspector = Model.NO_INSPECTION;                    // { batchId, tileId, source } — the open Region Inspector (transient: never persisted, never in history)
    let encRoll = null;                                     // transient: { batchId, tileId, faces, triggered, n } — the last Encounter Roll in the open Region Inspector (never persisted, never in history, GM-only)
    let envPicker = null;                                   // transient: { tileId } while the inline Hex Environment picker is open (never persisted, never in history)
    let envTipKey = null;                                   // tileId whose environment tooltip is showing
    let inspectorShown = null;                              // batchId the inspector DOM currently shows (so its scroll position survives re-renders)
    let followUntil = 0;                                    // keep re-positioning the inspector every frame until this time (sidebar slide)
    let hintTimer = 0;
    let liveTimer = 0;
    let cardRefs = new Map();                               // batchId -> { root, ...nodes }
    let openMenu = null;
    const dialogs = new Set();
    const urls = [];
    let importInput = null;
    /* diagnostics (Phase 0) */
    let diagOpen = false;
    let layers = { grid: false, control: false, markers: false, protection: false, proof: false };
    let hoverCell = null, hoverMarker = null, selCell = null, selMarker = null;
    let placeMode = false;
    let proofSymbolId = 'forest';
    let userPlacements = [];
    let ui = {};
    let printRoot = null, printUrls = [];
    let printOpen = false, pp = null;                        // Print Preview (transient, never stored): pp = { el, model, ready, failed, token }
    const pointer = { x: 0, y: 0, inside: false, cx: 0, cy: 0 };
    const glyphCache = new Map();
    const hexPathCache = new Map();
    let activeBatchId = null;                               // the one card expanded for placement controls (independent of the inspector)
    let sideCollapsed = false;                              // view preference, persisted apart from the document
    /* Fog of War (Phase C) — all transient; the veil is drawn only in Player Preview, never in the GM view */
    let showBiome = true;                                   // "Biome colors": GM-view tint inside placed hexes (UI only, never in the document, backup or history; Player Preview ignores it)
    let fogTool = null;                                     // null | 'reveal' | 'hide' — the active map tool
    let fogStroke = null;                                   // the in-progress pointer stroke { mode, pointerId, seen:Set, cells:[key], pendD, last, hover }
    let fogHover = null;                                    // { q, r } under the pointer while a tool is active and no stroke runs
    let fogPaintRaf = 0;
    let fogDrawn = { vis: null, mode: null, doc: null };   // what the fog layer currently shows (so an unrelated document change never rebuilds it)
    let ghostDrawn = { tiles: null, vis: null };            // what the GM-only hidden-hex outline currently shows
    let foggable = null;                                    // Map cellKey -> hex path, every cell the GM can reveal/hide (built once)
    let detachedConfirm = null;                             // transient: the frozen detached candidate whose "Start separate area" dialog is open (never stored, never in history)
    let perimDrawn = { tiles: null, vis: null, mode: null }; // what the perimeter layer currently shows (an unrelated change never rebuilds it)
    let resumePreview = false;                              // the stored "Player Preview was open" flag, consumed once the camera is restored
    let previewMode = false;                               // Player Preview: a read-only render of the player projection
    let playerProjection = null;                            // the projection currently drawn in Player Preview
    let echoDrawn = null;                                   // the soulEchoes object the GM echoes layer currently shows (an unrelated change never rebuilds it)
    let sanctuaryOpen = null;                               // anchor id of the sanctuary whose overlay is open (transient: never persisted, never in history)
    let sanctuaryShown = null;                              // anchor id the overlay DOM currently shows (so its scroll position survives re-renders)
    let sancDrawn = { sanctuaries: null, open: null, names: null };   // what the sanctuary ring layer currently shows
    let sancLabelsDrawn = null;                             // the sanctuaryLabels currently drawn (GM map and Player Preview share them)
    let sancAnchors = null;                                 // Map anchor id -> the printed sanctuary anchor (built once)
    let locateHover = null;                                 // { q, r } under the pointer while Locate Soul Echoes is selecting (transient: never persisted, never in history)
    let locateNeedleStarted = false;                        // the needle transition of the current result has been started (a re-render must not restart it)
    let seekers = null;                                     // the open Shadowblight control of the current Locate result (PD-041): { origin, plan, step, baseDoc, doc, entry } — transient; the X's it moved are document state
    let locateNote = '';                                    // why an Undo/Redo closed a stale result (appended to the Undo/Redo announcement)
    let rollRandom = Math.random;                           // the RNG the Encounter Roll draws with (replaceable through the debug API for the browser checks)
    let dealRandom = Math.random;                           // the RNG the Environment dealer draws with (replaceable through the debug API for the browser checks)
    let locateRandom = Math.random;                         // the one RNG a tie is drawn with (replaceable through the debug API for the browser checks)
    let routeHover = null;                                  // { q, r } under the pointer while the Route Planner is selecting A or B (transient: never persisted, never in history)
    let routeTerrain = { doc: null, index: null };          // Terrain Ratings by cell for the current document (derived, never stored)
    let routeDrawn = { line: '', mark: '' };
    let routeDetails = false;                               // the selected route's details popover is open (a click on its bubble; transient)
    let routeBubbleSpecs = [];                              // [{ s, x, y }] world anchor of each drawn route's bubble (rebuilt by every paint)                                    // signature of what the route layers currently show (a re-render with the same state must not restart the draw-in)
    /* the Route Planner state machine (js/journey2-route.js): select-start -> select-end -> result, GM-only, never persisted */
    const routePlanner = Route.createRoutePlanner({ plan: (a, b) => planRoutesFor(a, b), onChange: (state, ev) => onRouteChange(state, ev) });
    /* the Locate state machine (js/journey2-locate.js): selecting -> animating -> result, one guarded completion timer, never persisted */
    const locateSession = Locate.createLocateSession({
      schedule: (fn, ms) => setTimeout(fn, ms), cancel: h => clearTimeout(h),
      reducedMotion: () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (err) { return false; } },
      onChange: (state, ev) => onLocateChange(state, ev),
    });

    container.innerHTML = '';
    container.classList.add('j2-host');
    document.body.dataset.j2 = 'on';
    renderLoading();
    load();

    function makeNumberFormat() { try { return new Intl.NumberFormat(lang); } catch (e) { return new Intl.NumberFormat('en'); } }
    function n(v) { return nf.format(v); }
    /** Route length for the bubble: one hex is about 24 miles; Russian shows whole kilometres, everything else whole miles. */
    function routeDistanceText(hexes) {
      const miles = hexes * 24;
      return lang === 'ru' ? fill('journey2_route_dist_km', { n: n(Math.round(miles * 1.609344)) }) : fill('journey2_route_dist_mi', { n: n(Math.round(miles)) });
    }
    function fill(key, vars) {
      let s = t(key);
      if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
      return s;
    }

    /* ---- lifecycle ---- */

    function dispose() {
      if (inst.disposed) return;
      flushCameraSave();                                   // leaving the page keeps the camera (the debounce may still be pending)
      inst.disposed = true;
      abort.abort();
      cancelAnimationFrame(rafId);
      clearTimeout(hintTimer); clearTimeout(liveTimer);
      routePlanner.dispose(); routeHover = null;
      seekers = null;
      locateSession.dispose(); locateHover = null;   // cancels a pending compass completion: nothing may write into the detached DOM
      tr = null; pan = null; fogStroke = null; fogTool = null; previewMode = false; inspector = Model.NO_INSPECTION;
      cancelAnimationFrame(fogPaintRaf);
      document.body.classList.remove('j2-dragging');
      for (const d of Array.from(dialogs)) { try { d.close(); d.remove(); } catch (e) { /* gone */ } }
      dialogs.clear();
      cleanupPrintProof();
      closePrintPreview({ quiet: true });
      for (const fn of cleanups.splice(0)) { try { fn(); } catch (e) { /* teardown is best-effort */ } }
      for (const u of urls.splice(0)) URL.revokeObjectURL(u);
      if (baseImg) { baseImg.onload = baseImg.onerror = null; baseImg.src = ''; baseImg = null; }
      container.classList.remove('j2-host');
      container.innerHTML = '';
      delete document.body.dataset.j2;
      userPlacements = [];
      data = null; ui = {}; doc = null; history = null; store = null; foggable = null; playerProjection = null; cardRefs.clear(); glyphCache.clear(); hexPathCache.clear();
    }

    function listen(target, type, fn, options) {
      target.addEventListener(type, fn, options);
      cleanups.push(() => target.removeEventListener(type, fn, options));
    }

    function relocalize(o) {
      if (o && o.t) t = o.t;
      if (o && o.lang && o.lang !== lang) { lang = o.lang; nf = makeNumberFormat(); }
      if (o && o.generator) generator = o.generator;
      if (o && o.environmentsForBiome) environmentsFor = o.environmentsForBiome;
      applyStrings();
      if (data && ui.root) {
        updateStatus(); updateReadouts(); renderControlList(); renderAll(true); applyPreviewChrome();
      }
      if (ui.loading) renderLoading();
    }

    function applyStrings() {
      for (const x of container.querySelectorAll('[data-t]')) x.textContent = t(x.getAttribute('data-t'));
      for (const x of container.querySelectorAll('[data-t-aria]')) x.setAttribute('aria-label', t(x.getAttribute('data-t-aria')));
      for (const x of container.querySelectorAll('[data-t-title]')) x.setAttribute('title', t(x.getAttribute('data-t-title')));
      for (const x of container.querySelectorAll('[data-t-ph]')) x.setAttribute('placeholder', t(x.getAttribute('data-t-ph')));
    }

    /* ---- loading ---- */

    function renderLoading() {
      ui = { loading: true };
      container.innerHTML = '<div class="j2-state" role="status"><span class="j2-spinner" aria-hidden="true"></span><span data-t="journey2_loading"></span></div>';
      applyStrings();
    }

    function renderError(detail) {
      ui = {};
      container.innerHTML = '<div class="j2-state j2-state--error" role="alert"><p class="j2-state-title" data-t="journey2_load_error"></p>' +
        '<p class="j2-state-hint" data-t="journey2_load_error_hint"></p>' +
        '<p class="j2-state-detail"></p>' +
        '<button type="button" class="btn btn-primary" data-j2-retry data-t="journey2_retry"></button></div>';
      container.querySelector('.j2-state-detail').textContent = detail || '';
      container.querySelector('[data-j2-retry]').addEventListener('click', () => { renderLoading(); load(); });
      applyStrings();
    }

    function load() {
      const signal = abort.signal;
      Promise.all([
        fetchJson('data/journey2/map-template.json', signal),
        fetchJson('data/journey2/map-anchors.json', signal),
        fetchJson('data/journey2/symbols.json', signal),
      ]).then(([template, anchorsDoc, symbolsDoc]) => {
        if (inst.disposed) return null;
        const v = Geo.validateTemplate(template, anchorsDoc);
        if (!v.ok) throw new Error('Template validation failed: ' + v.errors.slice(0, 4).join('; '));
        const ctx = Model.createContext(template, anchorsDoc);
        const symbols = symbolsDoc.symbols.filter(s => s.kind === 'habitat' || s.kind === 'special-state');
        data = {
          template: template, anchorsDoc: anchorsDoc, grid: ctx.grid, ctx: ctx, symbols: symbols,
          symbolById: new Map(symbols.map(s => [s.id, s])),
          readiness: Geo.assessPlacementReadiness(template, anchorsDoc),
          protections: ctx.protections,
          glyphProtections: ctx.protections.filter(p => p.kind !== 'built-in-label'),
          labelRects: ctx.protections.filter(p => p.kind === 'built-in-label').map(p => p.rectPx),
        };
        return loadImage(versioned(template.assembledAsset.path, template.assembledAsset.cacheKey));
      }).then(img => {
        if (inst.disposed || !img) return;
        baseImg = img;
        buildSurface();
      }).catch(err => {
        if (inst.disposed || (err && err.name === 'AbortError')) return;
        renderError(err && err.message ? err.message : String(err));
      });
    }

    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('World raster failed to load: ' + src));
        img.src = src;
      });
    }

    /* ============================================================
       Surface
       ============================================================ */

    const ICON = {
      undo: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M7.5 4.5 3.5 8.5l4 4M4 8.5h8a4.5 4.5 0 0 1 0 9H8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      redo: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m12.5 4.5 4 4-4 4M16 8.5H8a4.5 4.5 0 0 0 0 9h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      hex: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5.5 3.5h9l4.5 6.5-4.5 6.5h-9L1 10z" transform="translate(0 0) scale(.9) translate(1.1 .8)" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
      hexes: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6 2.5h5l2.5 3.7L11 10H6L3.5 6.2zM11 10h5l2.5 3.7L16 17.5h-5l-2.5-3.8z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
      grip: '<svg viewBox="0 0 12 16" aria-hidden="true" focusable="false"><g fill="currentColor"><circle cx="3.5" cy="3" r="1.1"/><circle cx="8.5" cy="3" r="1.1"/><circle cx="3.5" cy="8" r="1.1"/><circle cx="8.5" cy="8" r="1.1"/><circle cx="3.5" cy="13" r="1.1"/><circle cx="8.5" cy="13" r="1.1"/></g></svg>',
      dice: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="3" y="3" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><g fill="currentColor"><circle cx="7.2" cy="7.2" r="1.2"/><circle cx="12.8" cy="12.8" r="1.2"/><circle cx="10" cy="10" r="1.2"/></g></svg>',
      more: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><g fill="currentColor"><circle cx="4.5" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="15.5" cy="10" r="1.5"/></g></svg>',
      caret: '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      check: '<svg viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="m3 7.5 2.7 2.7L11 4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      trash: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4.5 6h11M8 6V4h4v2M6 6l.6 9.5h6.8L14 6M8.5 9v4M11.5 9v4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      warn: '<svg viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M7 1.8 12.8 12H1.2zM7 5.6v3M7 10.3v.1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      chevL: '<svg viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="m8.8 3 -4 4 4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      chevR: '<svg viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="m5.2 3 4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      inspect: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="8.5" cy="8.5" r="5.3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m12.5 12.5 4.3 4.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
      info: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 9.2v4.3M10 6.3v.1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
      palette: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 2.8c-4.1 0-7.2 2.9-7.2 6.6 0 3.8 3 7.4 6.6 7.4 1.5 0 1.9-1 1.3-1.9-.7-1 .1-2.1 1.2-2.1h1.7c1.4 0 2.6-1 2.6-2.7C16.2 5.4 13.6 2.8 10 2.8z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><g fill="currentColor"><circle cx="6.3" cy="8.6" r="1.1"/><circle cx="9.2" cy="6" r="1.1"/><circle cx="12.6" cy="6.6" r="1.1"/></g></svg>',
      mouseLeft: '<svg viewBox="0 0 14 20" aria-hidden="true" focusable="false"><path class="j2-mouse-hit" d="M7 1.2H6.5A5 5 0 0 0 1.5 6.2V7.6H7z"/><rect x="1.5" y="1.2" width="11" height="17.6" rx="5.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M1.5 7.6h11M7 1.2v6.4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
      mouseRight: '<svg viewBox="0 0 14 20" aria-hidden="true" focusable="false"><path class="j2-mouse-hit" d="M7 1.2h.5a5 5 0 0 1 5 5V7.6H7z"/><rect x="1.5" y="1.2" width="11" height="17.6" rx="5.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M1.5 7.6h11M7 1.2v6.4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
      reveal: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M1.8 10S5 4.8 10 4.8 18.2 10 18.2 10 15 15.2 10 15.2 1.8 10 1.8 10z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.4" fill="currentColor"/></svg>',
      conceal: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M1.8 10S5 4.8 10 4.8 18.2 10 18.2 10 15 15.2 10 15.2 1.8 10 1.8 10z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M3.5 16.5 16.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
      players: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="7.5" cy="7" r="2.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 16c0-2.9 2.2-4.7 5-4.7s5 1.8 5 4.7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="14" cy="8" r="2.1" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M14.4 11.6c2 .2 3.4 1.6 3.4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
      close: '<svg viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="m3.5 3.5 7 7m0-7-7 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
      eye: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M1.5 10C4 5.8 7 4 10 4s6 1.8 8.5 6c-2.5 4.2-5.5 6-8.5 6s-6-1.8-8.5-6z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.6" fill="currentColor"/></svg>',
      d6: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 2 17 6v8l-7 4-7-4V6z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M3 6l7 4 7-4M10 10v8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><g fill="currentColor"><circle cx="10" cy="5.9" r=".9"/><circle cx="6.1" cy="11.6" r=".8"/><circle cx="13.9" cy="11.6" r=".8"/></g></svg>',
      eyeOff: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M1.5 10C4 5.8 7 4 10 4s6 1.8 8.5 6c-2.5 4.2-5.5 6-8.5 6s-6-1.8-8.5-6z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3.5 16.5 16.5 3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
      sanctuary: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3 17h14M5 17V9l5-5.5L15 9v8M8.5 17v-4.5h3V17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      crystal: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 1.8 6.6 6.6 7.6 14 10 17.4 12.4 14 13.4 6.6zM10 1.8v15.6M6.6 6.6h6.8M6.2 13.2 3 15.4l2.6-5.2M13.8 13.2 17 15.4l-2.6-5.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>',
      route: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="4.6" cy="15.4" r="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="15.4" cy="4.6" r="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6.6 14.2c3.4-1.4 1.2-4.4 3.8-5.6 1.6-.7 2.6-.8 3-2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="2.4 2.2"/></svg>',
      fit: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      print: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5.5 7.5V3h9v4.5M5.5 14.5h-2v-6h13v6h-2M5.5 12h9v5h-9z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>',
      back: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M16.5 10h-13M8.5 4.5 3 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      compass: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="7.4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m13.2 6.8-1.7 4.7-4.7 1.7 1.7-4.7z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M10 1.6v1.8M10 16.6v1.8M1.6 10h1.8M16.6 10h1.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    };

    /**
     * Soul Echo crystal (PD-024): a small floating diamond with a pale core, drawn right above the sanctuary icon, not tied to any hex. Gradients live in <defs>; the shape is inlined per Echo.
     * Fixed blues (a map object, not UI chrome) with a dark outline so it reads on the parchment in both themes; the shimmer is CSS only.
     */
    const ECHO_DEFS =
      '<radialGradient id="j2-echo-glow"><stop offset="0" stop-color="#9fe0ff" stop-opacity=".85"/><stop offset=".55" stop-color="#4a90ff" stop-opacity=".35"/><stop offset="1" stop-color="#2a5fd6" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="j2-echo-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4db4ff"/><stop offset="1" stop-color="#1b5fd0"/></linearGradient>';

    const ECHO_LIFT = 26;                                   // world px from the icon's top edge to the diamond's centre (it is ~19 px tall at scale, so it clears the icon)

    /** The crystal shape, centred on (0,0): inlined once per Echo (CSS does not reach a <use> clone). */
    const ECHO_CRYSTAL =
      '<g class="j2-echo-bob"><path class="j2-echo-body" d="M0-15 8.5 0 0 15-8.5 0z" fill="url(#j2-echo-body)"/><path class="j2-echo-core" d="M0-8 3.8 0 0 8-3.8 0z"/></g>';


    /**
     * The Locate compass (decorative: the equivalent text sits right under it). 200x200 user units, centre (100,100); sixteen ticks (stronger on
     * N / E / S / W), a gold ring, a central crystal and ONE needle that CSS rotates about the centre. Colours are fixed (a map-style instrument on its own dark panel).
     */
    const COMPASS_SVG = (() => {
      let ticks = '';
      for (let i = 0; i < 16; i++) {
        const major = i % 4 === 0, len = major ? 15 : 8, a = i * 22.5;
        ticks += '<line class="j2-cmp-tick' + (major ? ' is-major' : '') + '" x1="100" y1="' + (12 + 0) + '" x2="100" y2="' + (12 + len) + '" transform="rotate(' + a + ' 100 100)"/>';
      }
      return '<svg class="j2-compass" data-j2-l="compass" viewBox="0 0 200 200" aria-hidden="true" focusable="false">' +
        '<defs><radialGradient id="j2-cmp-glow"><stop offset="0" stop-color="#f6dc9a" stop-opacity=".9"/><stop offset=".6" stop-color="#d9a441" stop-opacity=".25"/><stop offset="1" stop-color="#d9a441" stop-opacity="0"/></radialGradient></defs>' +
        '<circle class="j2-cmp-face" cx="100" cy="100" r="92"/><circle class="j2-cmp-ring" cx="100" cy="100" r="92"/><circle class="j2-cmp-ring is-inner" cx="100" cy="100" r="76"/>' + ticks +
        '<circle class="j2-cmp-core-glow" data-j2-l="glow" cx="100" cy="100" r="30" fill="url(#j2-cmp-glow)"/>' +
        '<g class="j2-cmp-needle" data-j2-l="needle"><path class="j2-cmp-needle-n" d="M100 30 108 100 100 108 92 100Z"/><path class="j2-cmp-needle-s" d="M100 170 108 100 100 92 92 100Z"/></g>' +
        '<path class="j2-cmp-core" data-j2-l="core" d="M100 90 108 100 100 110 92 100Z"/>' +
        // painted last (with a dark halo) so the needle, whatever its direction, never hides a cardinal letter
        '<text class="j2-cmp-letter" data-j2-l="cn" x="100" y="52" text-anchor="middle"></text><text class="j2-cmp-letter" data-j2-l="ce" x="152" y="105" text-anchor="middle"></text>' +
        '<text class="j2-cmp-letter" data-j2-l="cs" x="100" y="158" text-anchor="middle"></text><text class="j2-cmp-letter" data-j2-l="cw" x="48" y="105" text-anchor="middle"></text>' +
        '</svg>';
    })();

    function buildSurface() {
      const tpl = data.template, [W, H] = tpl.worldSizePx;
      ui = {};
      container.innerHTML = `
        <section class="j2" data-t-aria="journey_title">
          <div class="j2-stage" data-j2-stage>
            <div class="j2-mapwrap">
              <div class="j2-viewport" tabindex="0" role="application" data-t-aria="journey2_map_label" aria-describedby="j2-keys">
                <div class="j2-world" style="width:${W}px;height:${H}px">
                  <img class="j2-base" alt="" draggable="false" width="${W}" height="${H}">
                  <svg class="j2-overlay" xmlns="${SVG_NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">
                    <defs data-j2-defs></defs><defs>${ECHO_DEFS}</defs>
                    <g data-j2-g="tiles"></g><g data-j2-g="player"></g><g data-j2-g="perimeterPlayer" pointer-events="none"></g><g data-j2-g="fog"><path class="j2-fog-veil" data-j2-fog-veil d=""/><path class="j2-fog-edge" data-j2-fog-edge d=""/><path class="j2-fog-ghost" data-j2-fog-ghost d=""/></g><g data-j2-g="perimeter" pointer-events="none"></g><g data-j2-g="fogstroke"></g><g data-j2-g="sanct" pointer-events="none"></g><g data-j2-g="echoes" pointer-events="none"></g><g data-j2-g="sanctlabels" pointer-events="none" aria-hidden="true"></g><g data-j2-g="routeline" pointer-events="none" aria-hidden="true"></g>
                    <g data-j2-g="grid"></g><g data-j2-g="protection"></g><g data-j2-g="markers"></g><g data-j2-g="control"></g>
                    <g data-j2-g="proof"></g><g data-j2-g="select"></g><g data-j2-g="preview"></g><g data-j2-g="locate" pointer-events="none"></g><g data-j2-g="seekers" pointer-events="none" aria-hidden="true"></g><g data-j2-g="routemark" pointer-events="none" aria-hidden="true"></g>
                  </svg>
                </div>
                <p class="sr-only" id="j2-keys" data-t="journey2_keys_hint"></p>
                <div class="j2-badge" data-j2-proof-badge hidden data-t="journey2_proof_badge"></div>
              </div>
              <div class="j2-hint-chip" data-j2-hint role="status" aria-live="polite" hidden></div>
              <div class="j2-fog-chip" data-j2-fog-chip hidden>
                <span class="j2-ico" aria-hidden="true" data-j2-fog-chip-ico></span>
                <strong data-j2-fog-chip-title></strong>
                <span class="j2-fog-chip-count" data-j2-fog-chip-count></span>
                <span class="j2-fog-chip-hint" data-j2-fog-chip-hint></span>
              </div>
              <div class="j2-fog-chip j2-locate-chip" data-j2-locate-chip hidden>
                <span class="j2-ico" aria-hidden="true">${ICON.compass}</span>
                <strong data-t="journey2_echo_locate"></strong>
                <span class="j2-fog-chip-hint" data-t="journey2_loc_select_hint"></span>
                <span class="j2-fog-chip-hint" data-t="journey2_loc_esc_hint"></span>
                <button type="button" class="btn btn-sm" data-j2-locate-cancel data-t="journey2_loc_cancel"></button>
              </div>
              <aside class="j2-panel" id="j2-panel" data-t-aria="journey2_panel_label" hidden></aside>
              <aside class="j2-region-inspector" id="j2-region-inspector" role="dialog" aria-modal="false" aria-labelledby="j2-region-inspector-title" data-j2-inspector hidden>
                <span class="j2-insp-caret" aria-hidden="true"></span>
                <header class="j2-insp-head">
                  <span class="j2-insp-sym"><img alt="" width="28" height="28" data-j2-i="img"></span>
                  <div class="j2-insp-titles">
                    <h3 class="j2-insp-title" id="j2-region-inspector-title" data-j2-i="name"></h3>
                    <p class="j2-insp-sub"><span data-j2-i="ord"></span><span class="j2-insp-ex" data-j2-i="examples" hidden></span><span class="j2-blight" data-j2-i="blight" hidden></span></p>
                  </div>
                  <button type="button" class="btn btn-ghost btn-sm j2-btn-icon" data-j2-insp-close data-t-aria="journey2_inspector_close" data-t-title="journey2_inspector_close">${ICON.close}</button>
                </header>
                <div class="j2-insp-scroll" data-j2-i="scroll">
                  <details class="j2-insp-summary" data-j2-i="summary">
                    <summary class="j2-insp-line"><span class="j2-dots" data-j2-i="dots" role="img"></span><strong data-j2-i="terrainName"></strong><span data-j2-i="terrainN"></span></summary>
                    <p class="j2-insp-terrain-text" data-j2-i="terrainText" hidden></p>
                  </details>
                  <section class="j2-insp-sec j2-hexenv" data-j2-i="hexEnvSec" aria-labelledby="j2-hexenv-title" hidden>
                    <h4 class="j2-insp-h" id="j2-hexenv-title" data-t="journey2_hexenv_title"></h4>
                    <div data-j2-i="hexEnvBody"></div>
                  </section>
                  <section class="j2-insp-sec j2-enc-sec" data-j2-i="encSec">
                    <div class="j2-insp-sechead">
                      <h4 class="j2-insp-h"><span data-t="journey_k_encounter"></span><span class="j2-enc-flag" data-j2-i="encFlag" data-t="journey2_roll_triggered" hidden></span></h4>
                      <button type="button" class="btn btn-sm j2-roll-btn" data-j2-roll data-j2-i="roll" data-t-title="journey2_roll_tip"><span class="j2-ico" aria-hidden="true"><img src="img/journey2/dice/d6-3d.png" alt="" width="33" height="33" draggable="false"></span><span data-j2-i="rollLabel"></span></button>
                    </div>
                    <div class="j2-roll-out" data-j2-i="rollOut" hidden>
                      <span class="j2-roll-dice" data-j2-i="rollDice" role="img"></span>
                      <span class="j2-roll-verdict" data-j2-i="rollVerdict"></span>
                      <span class="j2-roll-hint" data-j2-i="rollHint" data-t="journey2_roll_fear" hidden></span>
                    </div>
                    <div data-j2-i="enc"></div>
                  </section>
                  <section class="j2-insp-sec" data-j2-i="rumorSec"><h4 class="j2-insp-h" data-t="journey_k_rumor"></h4><p class="j2-insp-p" data-j2-i="rumor"></p></section>
                </div>
                <footer class="j2-insp-tile" data-j2-insp-tile hidden>
                  <span class="j2-insp-tile-text" data-j2-i="tileText"></span>
                  <button type="button" class="btn btn-sm j2-insp-return" data-j2-return data-t="journey2_return"></button>
                </footer>
              </aside>
              <aside class="j2-region-inspector j2-sanctuary" id="j2-sanctuary" role="dialog" aria-modal="false" aria-labelledby="j2-sanctuary-title" data-j2-sanctuary hidden>
                <span class="j2-insp-caret" aria-hidden="true"></span>
                <header class="j2-insp-head">
                  <div class="j2-sanc-headmain">
                    <div class="j2-insp-titles"><h3 class="j2-insp-title" id="j2-sanctuary-title" data-j2-s="name"></h3></div>
                    <button type="button" class="btn btn-sm j2-sanc-act" data-j2-sanc-name><span class="j2-ico" aria-hidden="true" data-j2-s="nameIco"></span><span data-j2-s="nameLabel"></span></button>
                  </div>
                  <button type="button" class="btn btn-ghost btn-sm j2-btn-icon" data-j2-sanc-close data-t-aria="journey2_sanc_close" data-t-title="journey2_sanc_close">${ICON.close}</button>
                </header>
                <div class="j2-sanc-echo" data-j2-s="echo" hidden>
                  <button type="button" class="btn btn-sm j2-sanc-act" data-j2-echo-collect><span class="j2-ico" aria-hidden="true">${ICON.crystal}</span><span data-j2-s="echoLabel"></span></button>
                </div>
                <div class="j2-insp-scroll j2-sanc-rows" data-j2-s="rows"></div>
                <footer class="j2-sanc-foot" data-j2-s="foot">
                  <button type="button" class="btn btn-sm btn-danger" data-j2-sanc-delete data-t="journey2_sanc_delete"></button>
                  <button type="button" class="btn btn-sm btn-primary" data-j2-sanc-reroll><span class="j2-ico" aria-hidden="true">${ICON.dice}</span><span data-t="journey2_sanc_reroll"></span></button>
                </footer>
              </aside>
              <aside class="j2-region-inspector j2-locate" id="j2-locate" role="dialog" aria-modal="false" aria-labelledby="j2-locate-title" tabindex="-1" data-j2-locate hidden>
                <span class="j2-insp-caret" aria-hidden="true"></span>
                <header class="j2-insp-head"><div class="j2-insp-titles"><h3 class="j2-insp-title" id="j2-locate-title" data-t="journey2_loc_title"></h3></div></header>
                <div class="j2-locate-body">
                  ${COMPASS_SVG}
                  <p class="j2-locate-searching" data-j2-l="searching" data-t="journey2_loc_searching"></p>
                  <div class="j2-locate-out" data-j2-l="out" role="status" aria-live="polite" aria-atomic="true">
                    <p class="j2-locate-line" data-j2-l="line"></p>
                    <p class="j2-locate-dir" data-j2-l="dir" hidden></p>
                    <p class="j2-locate-note" data-j2-l="note"></p>
                  </div>
                </div>
                <footer class="j2-sanc-foot j2-locate-foot">
                  <button type="button" class="btn btn-sm" data-j2-locate-again data-t="journey2_loc_again"></button>
                  <button type="button" class="btn btn-sm btn-primary" data-j2-locate-close data-t-aria="journey2_loc_close"><span data-t="journey2_loc_close_label"></span></button>
                </footer>
              </aside>
              <div class="j2-fog-chip j2-route-chip" data-j2-route-chip hidden>
                <span class="j2-ico" aria-hidden="true">${ICON.route}</span>
                <strong data-t="journey2_route_plan"></strong>
                <span class="j2-fog-chip-hint" data-j2-route-chip-text></span>
                <span class="j2-fog-chip-hint" data-t="journey2_route_esc_hint"></span>
                <button type="button" class="btn btn-sm" data-j2-route-cancel data-t="journey2_route_cancel"></button>
              </div>
              <div class="j2-route-bubbles" data-j2-route-bubbles></div>
              <div class="j2-seek" data-j2-seek role="group" data-t-aria="journey2_seek_group" hidden>
                <button type="button" class="j2-seek-btn" data-j2-seek-less data-t-aria="journey2_seek_less" data-t-title="journey2_seek_less"><span aria-hidden="true">&minus;</span></button>
                <output class="j2-seek-count" data-j2-seek-count></output>
                <button type="button" class="j2-seek-btn" data-j2-seek-more data-t-aria="journey2_seek_more" data-t-title="journey2_seek_more"><span aria-hidden="true">+</span></button>
                <button type="button" class="j2-seek-btn j2-seek-x" data-j2-seek-close data-t-aria="journey2_seek_close" data-t-title="journey2_seek_close">${ICON.close}</button>
              </div>
              <aside class="j2-route" id="j2-route" role="region" aria-labelledby="j2-route-title" tabindex="-1" data-j2-route hidden>
                <header class="j2-route-head">
                  <div class="j2-route-titles">
                    <h3 class="j2-route-title" id="j2-route-title"><span class="j2-ico" aria-hidden="true">${ICON.route}</span><span data-t="journey2_route_title"></span></h3>
                    <p class="j2-route-sub" data-j2-r="sub"></p>
                  </div>
                  <button type="button" class="btn btn-ghost btn-sm j2-btn-icon" data-j2-route-details-close data-t-aria="journey2_route_details_close" data-t-title="journey2_route_details_close">${ICON.close}</button>
                </header>
                <div class="j2-route-body" data-j2-r="body" role="status" aria-live="polite" aria-atomic="true"></div>
                <div class="j2-route-cmp" data-j2-r="cmp" hidden></div>
              </aside>
            </div>
            <div class="j2-sidewrap" data-j2-sidewrap>
              <aside class="j2-side" id="j2-side" data-t-aria="journey2_side_label">
                <div class="j2-controls" role="toolbar" data-t-aria="journey2_toolbar_label">
                  <div class="j2-ctl-row j2-ctl-nav">
                    <div class="j2-tb-group" role="group" data-j2-history-group data-t-aria="journey2_history_label">
                      <button type="button" class="btn btn-sm j2-btn-icon" data-j2-undo data-t-aria="journey2_undo" data-t-title="journey2_undo">${ICON.undo}</button>
                      <button type="button" class="btn btn-sm j2-btn-icon" data-j2-redo data-t-aria="journey2_redo" data-t-title="journey2_redo">${ICON.redo}</button>
                    </div>
                    <div class="j2-tb-group" role="group" data-t-aria="journey2_zoom_label">
                      <button type="button" class="btn btn-sm j2-btn-icon" data-j2-zoom="out" data-t-aria="journey2_zoom_out" data-t-title="journey2_zoom_out">−</button>
                      <button type="button" class="btn btn-sm j2-zoom-readout" data-j2-zoom="reset" data-j2-zoom-readout data-t-title="journey2_zoom_reset_title">100%</button>
                      <button type="button" class="btn btn-sm j2-btn-icon" data-j2-zoom="in" data-t-aria="journey2_zoom_in" data-t-title="journey2_zoom_in">+</button>
                      <button type="button" class="btn btn-sm j2-tool" data-j2-fit><span class="j2-ico" aria-hidden="true">${ICON.fit}</span><span data-t="journey2_fit"></span></button>
                    </div>
                    <button type="button" class="btn btn-sm j2-btn-icon j2-ctl-collapse" data-j2-side-toggle aria-controls="j2-side" aria-expanded="true" data-t-aria="journey2_side_collapse" data-t-title="journey2_side_collapse">${ICON.chevL}</button>
                  </div>
                  <div class="j2-ctl-gm" data-j2-gm-controls>
                    <div class="j2-ctl-row j2-tb-fog" role="group" data-j2-fog-group data-t-aria="journey2_fog_group">
                      <button type="button" class="btn btn-sm j2-tool" data-j2-biome-colors aria-pressed="true" data-t-aria="journey2_biome_show"><span class="j2-ico" aria-hidden="true">${ICON.palette}</span><span data-t="journey2_biome_label"></span></button>
                      <button type="button" class="btn btn-sm j2-tool" data-j2-preview data-t-title="journey2_preview_title"><span class="j2-ico" aria-hidden="true">${ICON.players}</span><span data-t="journey2_preview"></span></button>
                    </div>
                    <div class="j2-ctl-row j2-tb-route" role="group" data-j2-route-group data-t-aria="journey2_route_group">
                      <button type="button" class="btn btn-sm j2-tool" data-j2-route-plan aria-pressed="false" data-t-title="journey2_route_plan_title"><span class="j2-ico" aria-hidden="true">${ICON.route}</span><span data-t="journey2_route_plan"></span></button>
                      <button type="button" class="btn btn-sm j2-tool" data-j2-echo-locate aria-pressed="false" aria-describedby="j2-locate-reason"><span class="j2-ico" aria-hidden="true">${ICON.compass}</span><span data-t="journey2_echo_locate"></span></button>
                      <span class="sr-only" id="j2-locate-reason" data-j2-locate-reason></span>
                    </div>
                    <div class="j2-ctl-row j2-tb-echo" role="group" data-j2-echo-group data-t-aria="journey2_echo_group">
                      <button type="button" class="btn btn-sm j2-tool" data-j2-echo-place data-t-title="journey2_echo_place_title"><span class="j2-ico" aria-hidden="true">${ICON.crystal}</span><span data-t="journey2_echo_place"></span></button>
                      <button type="button" class="btn btn-sm j2-tool" data-j2-echo-clear data-t-title="journey2_echo_clear_title"><span class="j2-ico" aria-hidden="true">${ICON.trash}</span><span data-t="journey2_echo_clear"></span></button>
                    </div>
                    <div class="j2-ctl-row j2-tb-sanc" role="group" data-j2-sanc-group data-t-aria="journey2_sanc_group">
                      <button type="button" class="btn btn-sm j2-tool" data-j2-sanc-generate data-t-title="journey2_sanc_generate_title"><span class="j2-ico" aria-hidden="true">${ICON.sanctuary}</span><span data-j2-sanc-generate-label></span></button>
                    </div>
                  </div>
                  <div class="j2-ctl-preview" data-j2-preview-bar hidden>
                    <div class="j2-preview-head">
                      <span class="j2-preview-flag" role="status"><span class="j2-ico" aria-hidden="true">${ICON.players}</span><strong data-t="journey2_preview"></strong></span>
                      <button type="button" class="btn btn-ghost btn-sm j2-tool j2-preview-back" data-j2-preview-back><span class="j2-ico" aria-hidden="true">${ICON.back}</span><span data-t="journey2_preview_back"></span></button>
                    </div>
                    <p class="j2-preview-note" data-t="journey2_preview_hint"></p>
                    <span class="j2-tb-tools" role="group" data-t-aria="journey2_fog_group">
                      <button type="button" class="btn btn-sm j2-tool j2-paint-tool" data-j2-fog-tool="paint" aria-pressed="false" data-t-aria="journey2_fog_paint_title" data-t-title="journey2_fog_paint_title">
                        <span class="j2-paint-top"><strong data-t="journey2_fog_brush"></strong><span class="j2-paint-state" aria-hidden="true"><span class="j2-paint-on" data-t="journey2_fog_brush_on"></span><span class="j2-paint-off" data-t="journey2_fog_brush_off"></span></span></span>
                        <span class="j2-mouse-pair" aria-hidden="true"><span class="j2-mouse-ico">${ICON.mouseLeft}</span><span data-t="journey2_fog_reveal"></span><span class="j2-mouse-ico">${ICON.mouseRight}</span><span data-t="journey2_fog_hide"></span></span>
                      </button>
                    </span>
                    <button type="button" class="btn btn-sm j2-tool" data-j2-print-open data-t-title="journey2_pp_open_title"><span class="j2-ico" aria-hidden="true">${ICON.print}</span><span data-t="journey2_pp_open"></span></button>
                  </div>
                </div>
                <form class="j2-gen" data-j2-gen novalidate>
                  <button type="submit" class="btn btn-primary j2-gen-go" data-j2-generate data-t-title="journey2_gen_hint" aria-describedby="j2-gen-desc"><span class="j2-ico">${ICON.dice}</span><span data-t="journey2_gen_go"></span></button>
                  <span class="sr-only" id="j2-gen-desc" data-t="journey2_gen_hint"></span>
                  <p class="j2-field-error" id="j2-gen-error" data-j2-gen-error role="alert" hidden></p>
                </form>
                <div class="j2-side-scroll" data-j2-side-scroll>
                  <div class="j2-banner" data-j2-banner hidden role="alert"></div>
                  <section class="j2-stock" aria-labelledby="j2-stock-title">
                    <h3 class="j2-h j2-h--row" id="j2-stock-title"><span data-t="journey2_stock_title"></span><span class="j2-count" data-j2-stock-count></span></h3>
                    <div data-j2-stock-empty><p class="j2-empty" data-t="journey2_stock_empty"></p><p class="j2-gen-hint" data-t="journey2_gen_hint"></p></div>
                    <p class="j2-place-hint" data-j2-place-hint data-t="journey2_place_hint_shared" hidden></p>
                    <div class="j2-cards" data-j2-cards></div>
                  </section>
                </div>
              </aside>
              <div class="j2-rail" data-j2-rail role="toolbar" aria-orientation="vertical" data-t-aria="journey2_toolbar_label">
                <button type="button" class="btn btn-sm j2-btn-icon j2-rail-btn" data-j2-side-toggle aria-controls="j2-side" aria-expanded="false" data-t-aria="journey2_side_expand" data-t-title="journey2_side_expand">${ICON.chevR}</button>
                <div class="j2-rail-grp">
                  <button type="button" class="btn btn-sm j2-btn-icon j2-rail-btn" data-j2-undo data-j2-rail-src="undo">${ICON.undo}</button>
                  <button type="button" class="btn btn-sm j2-btn-icon j2-rail-btn" data-j2-redo data-j2-rail-src="redo">${ICON.redo}</button>
                </div>
                <div class="j2-rail-grp">
                  <button type="button" class="btn btn-sm j2-btn-icon j2-rail-btn" data-j2-zoom="in" data-j2-rail-src="zoomIn">+</button>
                  <button type="button" class="btn btn-sm j2-btn-icon j2-rail-btn j2-rail-zoom" data-j2-zoom="reset" data-j2-rail-src="zoomReset">100%</button>
                  <button type="button" class="btn btn-sm j2-btn-icon j2-rail-btn" data-j2-zoom="out" data-j2-rail-src="zoomOut">−</button>
                  <button type="button" class="btn btn-sm j2-btn-icon j2-rail-btn" data-j2-fit data-j2-rail-src="fit">${ICON.fit}</button>
                </div>
                <div class="j2-rail-grp" data-j2-rail-gm>
                  <button type="button" class="btn btn-sm j2-btn-icon j2-rail-btn" data-j2-biome-colors data-j2-rail-src="biome">${ICON.palette}</button>
                  <button type="button" class="btn btn-sm j2-btn-icon j2-rail-btn" data-j2-preview data-j2-rail-src="preview">${ICON.players}</button>
                </div>
                <div class="j2-rail-grp" data-j2-rail-gm>
                  <button type="button" class="btn btn-sm j2-btn-icon j2-rail-btn" data-j2-route-plan data-j2-rail-src="route">${ICON.route}</button>
                  <button type="button" class="btn btn-sm j2-btn-icon j2-rail-btn" data-j2-echo-locate data-j2-rail-src="locate">${ICON.compass}</button>
                </div>
                <div class="j2-rail-grp" data-j2-rail-gm>
                  <button type="button" class="btn btn-sm j2-btn-icon j2-rail-btn" data-j2-echo-place data-j2-rail-src="place">${ICON.crystal}</button>
                  <button type="button" class="btn btn-sm j2-btn-icon j2-rail-btn" data-j2-echo-clear data-j2-rail-src="clear">${ICON.trash}</button>
                  <button type="button" class="btn btn-sm j2-btn-icon j2-rail-btn" data-j2-sanc-generate data-j2-rail-src="sanc">${ICON.sanctuary}</button>
                </div>
                <div class="j2-rail-grp" data-j2-rail-pv hidden>
                  <button type="button" class="btn btn-sm j2-btn-icon j2-rail-btn" data-j2-fog-tool="paint" data-j2-rail-src="paint">${ICON.mouseLeft}</button>
                  <button type="button" class="btn btn-sm j2-btn-icon j2-rail-btn" data-j2-print-open data-j2-rail-src="print">${ICON.print}</button>
                  <button type="button" class="btn btn-sm j2-btn-icon j2-rail-btn" data-j2-preview-back data-j2-rail-src="back">${ICON.back}</button>
                </div>
                <div class="j2-rail-grp j2-rail-stock" data-j2-rail-stock>
                  <span class="j2-rail-ico" aria-hidden="true">${ICON.hexes}</span>
                  <span class="j2-rail-count" data-j2-rail-count></span>
                </div>
              </div>
            </div>
          </div>
          <div class="j2-tip" data-j2-tip hidden></div>
          <p class="sr-only" data-j2-live role="status" aria-live="polite"></p>
          <ul class="sr-only" data-j2-known-sanc data-t-aria="journey2_sanc_known" hidden></ul>
        </section>`;
      ui.root = container.querySelector('.j2');
      ui.viewport = container.querySelector('.j2-viewport');
      ui.world = container.querySelector('.j2-world');
      ui.base = container.querySelector('.j2-base');
      ui.svg = container.querySelector('.j2-overlay');
      ui.panel = container.querySelector('.j2-panel');
      ui.mapwrap = container.querySelector('.j2-mapwrap');
      ui.inspector = container.querySelector('[data-j2-inspector]');
      ui.i = {};
      for (const x of ui.inspector.querySelectorAll('[data-j2-i]')) ui.i[x.getAttribute('data-j2-i')] = x;
      ui.inspTile = ui.inspector.querySelector('[data-j2-insp-tile]');
      ui.sanctuary = container.querySelector('[data-j2-sanctuary]');
      ui.s = {};
      for (const x of ui.sanctuary.querySelectorAll('[data-j2-s]')) ui.s[x.getAttribute('data-j2-s')] = x;
      ui.sancGroup = container.querySelector('[data-j2-sanc-group]');
      ui.sancGenerate = container.querySelector('[data-j2-sanc-generate]');
      ui.sancGenerateLabel = container.querySelector('[data-j2-sanc-generate-label]');
      ui.sancReroll = ui.sanctuary.querySelector('[data-j2-sanc-reroll]');
      ui.sancDelete = ui.sanctuary.querySelector('[data-j2-sanc-delete]');
      ui.sancName = ui.sanctuary.querySelector('[data-j2-sanc-name]');
      ui.echoCollect = ui.sanctuary.querySelector('[data-j2-echo-collect]');
      ui.knownSanc = container.querySelector('[data-j2-known-sanc]');
      ui.zoomReadout = container.querySelector('[data-j2-zoom-readout]');
      ui.badge = container.querySelector('[data-j2-proof-badge]');
      ui.side = container.querySelector('.j2-side');
      ui.sidewrap = container.querySelector('[data-j2-sidewrap]');
      ui.stage = container.querySelector('[data-j2-stage]');
      ui.rail = container.querySelector('[data-j2-rail]');
      ui.railCount = container.querySelector('[data-j2-rail-count]');
      ui.placeHint = container.querySelector('[data-j2-place-hint]');
      ui.sideToggles = Array.from(container.querySelectorAll('[data-j2-side-toggle]'));
      ui.sideScroll = container.querySelector('[data-j2-side-scroll]');
      ui.historyGroup = container.querySelector('[data-j2-history-group]');
      ui.controls = container.querySelector('.j2-controls');
      ui.gmControls = container.querySelector('[data-j2-gm-controls]');
      ui.railStock = container.querySelector('[data-j2-rail-stock]');
      ui.fogGroup = container.querySelector('[data-j2-fog-group]');
      ui.biomeColors = container.querySelector('[data-j2-biome-colors]');
      ui.fogTool = container.querySelector('[data-j2-fog-tool="paint"]');
      ui.echoGroup = container.querySelector('[data-j2-echo-group]');
      ui.echoPlace = container.querySelector('[data-j2-echo-place]');
      ui.echoClear = container.querySelector('[data-j2-echo-clear]');
      ui.echoLocate = container.querySelector('[data-j2-echo-locate]');
      ui.locateReason = container.querySelector('[data-j2-locate-reason]');
      ui.routeGroup = container.querySelector('[data-j2-route-group]');
      ui.routePlan = container.querySelector('[data-j2-route-plan]');
      ui.routeChip = container.querySelector('[data-j2-route-chip]');
      ui.routeChipText = container.querySelector('[data-j2-route-chip-text]');
      ui.route = container.querySelector('[data-j2-route]');
      ui.routeBubbles = container.querySelector('[data-j2-route-bubbles]');
      ui.r = {};
      for (const x of ui.route.querySelectorAll('[data-j2-r]')) ui.r[x.getAttribute('data-j2-r')] = x;
      ui.seek = container.querySelector('[data-j2-seek]');
      ui.seekLess = ui.seek.querySelector('[data-j2-seek-less]');
      ui.seekMore = ui.seek.querySelector('[data-j2-seek-more]');
      ui.seekCount = ui.seek.querySelector('[data-j2-seek-count]');
      ui.locateChip = container.querySelector('[data-j2-locate-chip]');
      ui.locate = container.querySelector('[data-j2-locate]');
      ui.l = {};
      for (const x of ui.locate.querySelectorAll('[data-j2-l]')) ui.l[x.getAttribute('data-j2-l')] = x;
      ui.previewBtn = container.querySelector('[data-j2-preview]');
      ui.previewBar = container.querySelector('[data-j2-preview-bar]');
      ui.previewBack = container.querySelector('[data-j2-preview-back]');
      ui.printOpen = container.querySelector('[data-j2-print-open]');
      ui.fogChip = container.querySelector('[data-j2-fog-chip]');
      ui.fogChipIco = container.querySelector('[data-j2-fog-chip-ico]');
      ui.fogChipTitle = container.querySelector('[data-j2-fog-chip-title]');
      ui.fogChipCount = container.querySelector('[data-j2-fog-chip-count]');
      ui.fogChipHint = container.querySelector('[data-j2-fog-chip-hint]');
      ui.defs = container.querySelector('[data-j2-defs]');
      ui.fogVeil = container.querySelector('[data-j2-fog-veil]');
      ui.fogEdge = container.querySelector('[data-j2-fog-edge]');
      ui.fogGhost = container.querySelector('[data-j2-fog-ghost]');
      ui.undo = container.querySelector('[data-j2-undo]');
      ui.redo = container.querySelector('[data-j2-redo]');
      ui.banner = container.querySelector('[data-j2-banner]');
      ui.gen = container.querySelector('[data-j2-gen]');
      ui.genError = container.querySelector('[data-j2-gen-error]');
      ui.generate = container.querySelector('[data-j2-generate]');
      ui.cards = container.querySelector('[data-j2-cards]');
      ui.stockEmpty = container.querySelector('[data-j2-stock-empty]');
      ui.stockCount = container.querySelector('[data-j2-stock-count]');
      ui.hint = container.querySelector('[data-j2-hint]');
      ui.tip = container.querySelector('[data-j2-tip]');
      ui.live = container.querySelector('[data-j2-live]');
      ui.g = {};
      for (const g of container.querySelectorAll('[data-j2-g]')) ui.g[g.getAttribute('data-j2-g')] = g;
      baseImg.className = 'j2-base'; baseImg.alt = ''; baseImg.draggable = false; baseImg.width = W; baseImg.height = H;
      ui.base.replaceWith(baseImg);
      ui.base = baseImg;
      syncHeaderHeight();
      setupRail();
      initDocument();
      const prefs = store.loadUi();
      sideCollapsed = !!prefs.sideCollapsed;
      showBiome = prefs.showBiomeColors !== false;
      savedView = prefs.view;
      resumePreview = !!prefs.playerPreview;
      activeBatchId = doc.batches.length ? doc.batches[doc.batches.length - 1].id : null;
      buildStaticLayers();
      buildPanel();
      applySideState(false);
      bindSurface();
      applyStrings();
      updateStatus();
      applyLayerVisibility();
      fitToView();
      restoreCamera();
      updateReadouts();
      renderAll(true);
      applyPreviewChrome();
      maybeResumePreview();
      inst.debugApi = makeDebugApi();
    }

    /** The map fills the viewport below the sticky site header; its height is a CSS variable, kept in step with the header. */
    function syncHeaderHeight() {
      const header = document.getElementById('header');
      const apply = () => document.documentElement.style.setProperty('--j2-header-h', (header ? Math.round(header.getBoundingClientRect().height) : 0) + 'px');
      apply();
      if (header && typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(apply);
        ro.observe(header);
        cleanups.push(() => ro.disconnect());
      }
      cleanups.push(() => document.documentElement.style.removeProperty('--j2-header-h'));
    }

    /* ---- document, history, store ---- */

    function initDocument() {
      history = Model.createHistory();
      store = Store.createStore(storage, data.ctx);
      loadInfo = store.load();
      if (loadInfo.status === 'ok') { doc = loadInfo.doc; saveState = { status: 'saved', reason: null }; }
      else {
        doc = Model.emptyDocument(data.ctx);
        if (loadInfo.status === 'corrupt') { editLocked = true; saveState = { status: 'blocked', reason: loadInfo.code }; }
        else if (loadInfo.status === 'unavailable') saveState = { status: 'unavailable', reason: 'unavailable' };
        else saveState = { status: 'saved', reason: null };      // empty: nothing to lose, nothing unsaved
      }
    }

    function persist() {
      if (inst.disposed || !store) return;
      if (editLocked) { saveState = { status: 'blocked', reason: loadInfo && loadInfo.code }; return; }
      const r = store.save(doc);
      saveState = r.ok ? { status: 'saved', reason: null } : { status: r.reason === 'unavailable' ? 'unavailable' : 'failed', reason: r.reason };
      renderBanner();
    }

    function renderBanner() {
      if (!ui.banner) return;
      const s = saveState.status;
      let html = '';
      if (editLocked) {
        const code = loadInfo && loadInfo.code;
        html = '<p>' + esc(fill('journey2_banner_corrupt', { reason: t('journey2_import_code_' + String(code || 'invalid').replace(/-/g, '_')) })) + '</p>' +
          '<div class="j2-banner-actions"><button type="button" class="btn btn-sm" data-j2-act="import">' + esc(t('journey2_backup_import')) + '</button>' +
          '<button type="button" class="btn btn-sm btn-danger" data-j2-act="start-empty">' + esc(t('journey2_corrupt_start_empty')) + '</button></div>';
      } else if (s === 'failed') {
        html = '<p>' + esc(t('journey2_banner_failed')) + '</p><div class="j2-banner-actions"><button type="button" class="btn btn-sm" data-j2-act="export">' + esc(t('journey2_backup_export')) + '</button></div>';
      } else if (s === 'unavailable') {
        html = '<p>' + esc(t('journey2_banner_unavailable')) + '</p><div class="j2-banner-actions"><button type="button" class="btn btn-sm" data-j2-act="export">' + esc(t('journey2_backup_export')) + '</button></div>';
      }
      ui.banner.hidden = !html;
      if (ui.banner.getAttribute('data-sig') !== html) { ui.banner.innerHTML = html; ui.banner.setAttribute('data-sig', html); }
    }

    /**
     * The one path for every committed edit (UI and tests): cancel any drag,
     * apply the command through the model, record history, persist, repaint. Returns the model result.
     */
    function dispatch(cmd, label, keepTransient) {
      if (inst.disposed || !doc) return { ok: false, error: { code: 'disposed' } };
      if (editLocked) return { ok: false, error: { code: 'locked' } };
      if (!keepTransient) cancelTransient();
      const at = new Date().toISOString();
      const r = Model.apply(doc, Object.assign({ at: at }, cmd), data.ctx);
      if (!r.ok) return r;
      if (r.doc === doc) return r;                    // no-op: no history, no write
      Model.historyCommit(history, doc, r.doc, label || cmd.type);
      doc = r.doc;
      afterDocChange();
      return r;
    }

    function afterDocChange() {
      persist();
      locateNote = '';
      if (sel.tileId && !Model.derive(doc).byId.has(sel.tileId)) sel.tileId = null;
      syncInspector();
      if (sanctuaryOpen && !sanctuaryOpenable(sanctuaryOpen)) closeSanctuary({ quiet: true });   // deleted with no Echo left, or undone away
      syncSeekers();
      syncLocate();
      syncRoute();
      renderAll(false);
    }

    function undo() {
      if (inst.disposed || editLocked) return;
      cancelTransient();
      const e = Model.historyUndo(history);
      if (!e) return;
      envPicker = null;
      doc = e.before;
      afterDocChange();
      announce(t('journey2_live_undo') + (locateNote ? '. ' + locateNote : ''));
    }
    function redo() {
      if (inst.disposed || editLocked) return;
      cancelTransient();
      const e = Model.historyRedo(history);
      if (!e) return;
      envPicker = null;
      doc = e.after;
      afterDocChange();
      announce(t('journey2_live_redo') + (locateNote ? '. ' + locateNote : ''));
    }

    /* ============================================================
       Static layers, inspector, generator form
       ============================================================ */

    function buildStaticLayers() {
      const { grid, template, anchorsDoc } = data;
      const parts = [];
      grid.forEachValidCell((q, r) => parts.push(pathOf(grid.cellCorners(q, r))));
      ui.g.grid.innerHTML = '<path class="j2-grid" d="' + parts.join('') + '"/>';
      let p = '';
      for (const d of template.decorativeAreas) p += '<rect class="j2-deco" ' + rectAttrs(d.rectPx) + '/>';
      for (const id of data.ctx.decorativeCells) { const c = Geo.parseCellId(id); p += '<path class="j2-deco-cell" d="' + pathOf(grid.cellCorners(c.q, c.r)) + '"/>'; }
      for (const a of anchorsDoc.anchors) {
        p += '<rect class="j2-protect" ' + rectAttrs(a.iconProtectionArea.rectPx) + '/>';
        if (a.builtInLabel) p += '<rect class="j2-label-rect" ' + rectAttrs(a.builtInLabel.protectionRectPx) + '/>';
        if (a.labelAnchor) {
          const [x, y] = a.labelAnchor.pointPx;
          p += '<g class="j2-label-anchor"><circle cx="' + x + '" cy="' + y + '" r="2"/><path d="M' + (x - 5) + ' ' + y + 'h10"/></g>';
        }
      }
      ui.g.protection.innerHTML = p;
      let m = '';
      for (const a of anchorsDoc.anchors) {
        const [x, y] = a.worldPixelAnchor, hr = a.hitArea.rectPx, pr = a.iconProtectionArea.rectPx;
        m += '<g class="j2-marker" data-id="' + a.stableId + '"><rect class="j2-hit" ' + rectAttrs(hr) + '/>' +
          '<path class="j2-cross" d="M' + (x - 6) + ' ' + y + 'h12M' + x + ' ' + (y - 6) + 'v12"/>' +
          '<text class="j2-id" x="' + (pr[0] + pr[2] + 2) + '" y="' + (pr[1] + 8) + '">' + a.stableId.slice(3) + '</text></g>';
      }
      ui.g.markers.innerHTML = m;
      let c = '';
      template.grid.controlPoints.forEach((cp, i) => {
        const cell = Geo.parseCellId(cp.id);
        const o = cp.observedCenterPx;
        c += '<g class="j2-ctl" data-id="' + cp.id + '"><path class="j2-ctl-hex" d="' + pathOf(grid.cellCorners(cell.q, cell.r)) + '"/>' +
          '<circle class="j2-ctl-dot" cx="' + o[0] + '" cy="' + o[1] + '"/>' +
          '<text class="j2-ctl-n" x="' + (o[0] + 4) + '" y="' + (o[1] - 4) + '">' + (i + 1) + '</text></g>';
      });
      ui.g.control.innerHTML = c;
      buildFogLayer();
      renderProof();
    }

    function showGenError(msg) {
      ui.genError.hidden = !msg;
      ui.genError.textContent = msg || '';
    }

    /** One fully random region: the adapter rolls every value, the new batch is committed as ONE history entry and becomes the active card. */
    function onGenerate(e) {
      if (e) e.preventDefault();
      if (editLocked) return;
      if (!generator || !generator.ready()) { showGenError(t('journey2_gen_unavailable')); return; }
      showGenError('');
      const region = generator.roll();
      const batch = Model.batchFromRegion(region, { id: Model.newId('b'), createdAt: new Date().toISOString() });
      const r = dispatch({ type: 'createBatch', batch: batch }, 'createBatch');
      if (!r.ok) { showGenError(t('journey2_gen_failed')); return; }
      setActiveBatch(batch.id);
      ui.sideScroll.scrollTop = 0;
      announce(fill('journey2_live_created', { name: batchName(batch), n: n(batch.quantity) }));
    }

    /* ---- sidebar overlay ---- */

    function applySideState(persistIt) {
      ui.stage.setAttribute('data-side', sideCollapsed ? 'collapsed' : 'expanded');
      for (const b of ui.sideToggles) b.setAttribute('aria-expanded', String(!sideCollapsed));
      // the hidden half is taken out of the tab order and the accessibility tree; the transition itself is CSS-only
      ui.side.inert = sideCollapsed;
      ui.rail.inert = !sideCollapsed;
      if (persistIt) saveUiPrefs();
    }

    /* ---- collapsed rail: one icon-only proxy per control ----
     * A proxy carries the same data-j2-* attribute as its source, so the one delegated click handler serves both; only the state is mirrored
     * (disabled / aria-pressed / aria-disabled / accessible name / visibility), so no state-updating code needs to know the rail exists. */
    const RAIL_SOURCES = {
      undo: () => ui.undo, redo: () => ui.redo, zoomIn: () => ui.controls.querySelector('[data-j2-zoom="in"]'), zoomOut: () => ui.controls.querySelector('[data-j2-zoom="out"]'),
      zoomReset: () => ui.zoomReadout, fit: () => ui.controls.querySelector('[data-j2-fit]'), biome: () => ui.biomeColors, preview: () => ui.previewBtn,
      route: () => ui.routePlan, locate: () => ui.echoLocate, place: () => ui.echoPlace, clear: () => ui.echoClear, sanc: () => ui.sancGenerate,
      paint: () => ui.fogTool, print: () => ui.printOpen, back: () => ui.previewBack,
    };
    let railProxies = [];
    const railOf = new Map();

    function setupRail() {
      railProxies = Array.from(ui.rail.querySelectorAll('[data-j2-rail-src]')).map(el => ({ el: el, src: RAIL_SOURCES[el.getAttribute('data-j2-rail-src')]() }));
      for (const x of railProxies) railOf.set(x.src, x.el);
      if (typeof MutationObserver === 'function') {
        const mo = new MutationObserver(syncRail);
        mo.observe(ui.controls, { subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'aria-pressed', 'aria-disabled', 'aria-label', 'title'], childList: true, characterData: true });
        cleanups.push(() => mo.disconnect());
      }
      syncRail();
    }

    function syncRail() {
      if (inst.disposed || !ui.rail) return;
      for (const x of railProxies) {
        const el = x.el, src = x.src;
        if (!src) continue;
        el.hidden = !!src.closest('[hidden]');
        el.disabled = !!src.disabled;
        for (const a of ['aria-pressed', 'aria-disabled']) { const v = src.getAttribute(a); if (v == null) el.removeAttribute(a); else el.setAttribute(a, v); }
        const label = src.getAttribute('aria-label') || src.textContent.trim();
        el.setAttribute('aria-label', label);
        el.title = label;
        if (el.getAttribute('data-j2-zoom') === 'reset') el.textContent = src.textContent;
      }
      for (const g of ui.rail.querySelectorAll('.j2-rail-grp')) {
        if (g.hasAttribute('data-j2-rail-stock')) continue;
        g.hidden = Array.from(g.querySelectorAll('[data-j2-rail-src]')).every(b => b.hidden);
      }
    }

    /** Focuses a toolbar control — its rail proxy while the panel is collapsed (the panel's own half is inert then). */
    function focusTool(src) {
      const el = (sideCollapsed && railOf.get(src)) || src;
      if (el) el.focus({ preventScroll: true });
    }

    /** The stored view preferences (sidebar state, "Show fog state") — never the document, never history. */
    function saveUiPrefs() { if (store) store.saveUi({ sideCollapsed: sideCollapsed, showBiomeColors: showBiome, playerPreview: previewMode, view: currentView() }); }

    /** Explicit toggle only (the user's own click): re-centres the map horizontally in the new free area at the same zoom; never a Fit, and it leaves the selection and active region alone; focus moves to the control that replaces the one used. */
    function toggleSide() {
      const before = sideInset();
      sideCollapsed = !sideCollapsed;
      applySideState(true);
      // the free map area grows/shrinks by the inset difference: keep the zoom and slide the map by half of it, so what was centred stays centred (no Fit)
      if (data && ui.viewport) { const dx = (sideInset() - before) / 2; if (Math.abs(dx) >= 1) animateCameraBy(dx, 0, 250); }
      followInspector(320);
      const target = ui.sideToggles[sideCollapsed ? 1 : 0];
      if (target) target.focus({ preventScroll: true });
    }

    /** Width the overlay sidebar covers on the left of the map (used by Fit only; toggling never refits). */
    function sideInset() {
      if (!ui.sidewrap) return 0;
      const w = sideCollapsed ? ui.rail.offsetWidth : ui.sidewrap.offsetWidth;
      return Math.min(w + 2 * 8, viewSize()[0] * 0.5);
    }

    /* ============================================================
       Inventory (one card per batch, updated in place)
       ============================================================ */

    function batchName(b) { return b.habitat.overtaken ? t('journey2_overtaken') : t('biome_' + b.habitat.biome); }

    function symbolFor(b) { return data.symbolById.get(Model.symbolIdOf(b)); }

    function createCard(b) {
      const root = el('article', { class: 'j2-card', 'data-batch': b.id });
      const bodyId = 'j2-cb-' + b.id;
      root.innerHTML = `
        <div class="j2-card-top">
          <button type="button" class="j2-card-head" data-j2-card-toggle aria-expanded="false" aria-controls="${bodyId}" data-j2-c="toggle">
            <span class="j2-card-sym"><img alt="" data-j2-c="img"></span>
            <span class="j2-card-title">
              <span class="j2-card-name"><span data-j2-c="name"></span><span class="j2-card-ord" data-j2-c="ord"></span></span>
              <span class="j2-card-meta"><span class="j2-dots" data-j2-c="dots" role="img"></span><span class="j2-blight" data-j2-c="blight" hidden></span><span class="j2-card-sum" data-j2-c="sum"></span></span>
            </span>
          </button>
          <button type="button" class="icon-btn j2-inspect" data-j2-inspect data-j2-c="inspect" aria-controls="j2-region-inspector" aria-haspopup="dialog">${ICON.inspect}<span class="sr-only" data-j2-c="inspectSr"></span></button>
        </div>
        <p class="j2-warn" data-j2-c="warn" hidden><span class="j2-warn-ico" aria-hidden="true">${ICON.warn}</span><span data-j2-c="warnText"></span></p>
        <div class="j2-card-body" id="${bodyId}" data-j2-c="body" hidden>
          <div class="j2-status" data-j2-c="status"><span class="j2-num" data-j2-c="placedText"></span><span class="j2-bar" role="presentation"><span data-j2-c="bar"></span></span><span class="j2-num" data-j2-c="leftText"></span></div>
          <div class="j2-actions" data-j2-c="actions">
            <button type="button" class="j2-handle" data-j2-handle="one"><span class="j2-handle-label" data-j2-c="oneLabel"></span><span class="j2-grip">${ICON.grip}</span></button>
            <button type="button" class="j2-handle j2-handle--all" data-j2-handle="all"><span class="j2-handle-label" data-j2-c="allLabel"></span><span class="j2-grip">${ICON.grip}</span></button>
          </div>
          <div class="j2-card-end">
            <p class="j2-done" data-j2-c="done" hidden><span class="j2-done-ico" aria-hidden="true">${ICON.check}</span><span data-j2-c="doneText"></span></p>
            <div class="j2-card-foot">
              <button type="button" class="btn btn-ghost btn-sm j2-btn-icon j2-delete" data-j2-delete data-j2-c="del">${ICON.trash}</button>
            </div>
          </div>
        </div>`;
      const refs = { root: root, id: b.id };
      for (const x of root.querySelectorAll('[data-j2-c]')) refs[x.getAttribute('data-j2-c')] = x;
      refs.handleOne = root.querySelector('[data-j2-handle="one"]');
      refs.handleAll = root.querySelector('[data-j2-handle="all"]');
      return refs;
    }

    /** Updates a card's text and state in place (the handle elements are never recreated mid-drag). */
    function updateCard(refs, b, index, counts, full, holes) {
      const c = counts.get(b.id);
      const sym = symbolFor(b);
      const active = b.id === activeBatchId;
      const name = batchName(b), ord = n(index + 1);
      if (full || refs.img.getAttribute('data-sym') !== (sym && sym.id)) { if (sym) refs.img.src = sym.path; refs.img.setAttribute('data-sym', sym ? sym.id : ''); }
      refs.name.textContent = name;
      refs.ord.textContent = '#' + ord;
      refs.dots.hidden = !!b.habitat.overtaken;           // a fully overtaken region has no Terrain Rating
      refs.dots.innerHTML = [1, 2, 3, 4].map(i => '<i' + (i <= b.terrain.value ? ' class="on"' : '') + '></i>').join('');
      refs.dots.setAttribute('aria-label', fill('journey2_terrain_n', { n: b.terrain.value }));
      refs.dots.setAttribute('title', fill('journey2_terrain_tip', { n: b.terrain.value, d: b.terrain.value }));
      refs.blight.hidden = !(b.habitat.blighted || b.habitat.overtaken);
      refs.blight.textContent = t('journey_shadowblighted');
      // active region: expanded, programmatically identifiable
      const inspected = b.id === inspector.batchId;
      refs.root.classList.toggle('is-active', active);
      refs.root.classList.toggle('is-inspected', inspected);
      refs.inspect.classList.toggle('is-on', inspected);
      refs.inspect.setAttribute('title', t('journey2_inspect_region'));
      refs.inspect.disabled = false;
      refs.inspectSr.textContent = fill('journey2_inspect_aria', { name: name, n: ord }) + (inspected ? ' (' + t('journey2_inspect_open') + ')' : '');
      if (active) refs.root.setAttribute('aria-current', 'true'); else refs.root.removeAttribute('aria-current');
      refs.toggle.setAttribute('aria-expanded', String(active));
      refs.body.hidden = !active;
      const complete = c.remaining === 0;
      refs.root.classList.toggle('is-exhausted', complete);
      refs.sum.hidden = active;
      refs.root.classList.toggle('has-unplaced', !complete);   // unused hexes stand out in the collapsed card
      refs.sum.textContent = complete ? fill('journey2_all_placed', { n: n(c.quantity) }) : fill('journey2_status_placed', { placed: n(c.placed), total: n(c.quantity) }) + ' · ' + fill('journey2_status_left', { n: n(c.remaining) });
      refs.warn.hidden = !holes;
      if (holes) refs.warnText.textContent = fill('journey2_warn_holes', { n: n(holes) });
      refs.root.classList.toggle('has-holes', !!holes);
      if (!active) return;
      // placement: one status row, or — when nothing is left — a single confirmation and no controls at all
      refs.status.hidden = complete;
      refs.actions.hidden = complete;
      refs.done.hidden = !complete;
      refs.doneText.textContent = fill('journey2_all_placed', { n: n(c.quantity) });
      refs.placedText.textContent = fill('journey2_status_placed', { placed: n(c.placed), total: n(c.quantity) });
      refs.leftText.textContent = fill('journey2_status_left', { n: n(c.remaining) });
      refs.bar.style.width = (c.quantity ? (100 * c.placed / c.quantity) : 0) + '%';
      refs.oneLabel.textContent = t('journey2_place_one');
      refs.allLabel.textContent = fill('journey2_place_all_n', { n: n(c.remaining) });
      const single = c.remaining === 1;                  // one hex left: "Place 1" and "Place all 1" are the same action
      refs.actions.classList.toggle('is-single', single);
      refs.handleAll.hidden = single;
      for (const h of [refs.handleOne, refs.handleAll]) h.disabled = editLocked;
      refs.handleOne.setAttribute('aria-label', fill('journey2_handle_one_aria', { name: name }));
      refs.handleAll.setAttribute('aria-label', fill('journey2_handle_all_aria', { name: name, n: n(c.remaining) }));
      refs.del.setAttribute('aria-label', fill('journey2_delete_aria', { name: name, n: ord }));
      refs.del.setAttribute('title', t('journey2_delete_region'));
      refs.del.disabled = editLocked;
    }

    /** The catalog environments this region's hexes may carry: the existing biome adapter's list, untouched. A fully overtaken region has no base biome and no list. */
    function hexEnvironmentList(b) {
      const biome = b.habitat.overtaken ? null : b.habitat.biome;
      return biome ? environmentsFor(biome) : [];
    }

    function envRowHtml(e, current, i) {
      return '<li class="j2-hexenv-row' + (current ? ' is-current' : '') + '"><a class="j2-env-link" href="' + esc(e.href) + '" data-j2-env><span class="j2-env-tier" aria-hidden="true">' + esc(n(e.tier)) + '</span><span class="j2-env-name">' + esc(e.name) + '</span><span class="sr-only">' + esc(fill('journey2_hexenv_tier', { n: n(e.tier) }) + ' · ' + t('journey2_hexenv_open')) + '</span></a>' +
        (current ? '<span class="j2-hexenv-assigned">' + esc(t('journey2_hexenv_assigned')) + '</span>'
          : '<button type="button" class="btn btn-sm" data-j2-hexenv="assign" data-env-id="' + esc(e.id) + '" aria-label="' + esc(fill('journey2_hexenv_assign_aria', { name: e.name })) + '"' + (editLocked ? ' disabled' : '') + '>' + esc(t('journey2_hexenv_assign')) + '</button>') + '</li>';
    }

    /**
     * The Region Inspector's "Hex Environment" section — only for an inspector opened from a placed hex (a card-opened one has no hex and
     * keeps the read-only Suggested environments list). The assignment is the tile's `environmentId`; everything shown (name, tier, link)
     * is looked up again in the current language from the catalog adapter, never stored. Rebuilt only when its signature changes, so an open
     * picker keeps its scroll position and a focused link survives unrelated re-renders.
     */
    function renderHexEnvironment(b, tile) {
      const I = ui.i;
      if (!tile) { clearHexEnvironment(); return; }
      if (envPicker && envPicker.tileId !== tile.id) envPicker = null;
      I.hexEnvSec.hidden = false;
      const list = hexEnvironmentList(b), id = tile.environmentId || null;
      const found = id ? list.find(e => e.id === id) || null : null;
      const open = !!(envPicker && list.length && id);
      if (envPicker && !(list.length && id)) envPicker = null;
      const sig = [lang, tile.id, id || '', open ? 1 : 0, editLocked ? 1 : 0, list.map(e => e.id + ':' + e.name + ':' + e.tier).join(',')].join('|');
      if (I.hexEnvBody.getAttribute('data-sig') === sig) return;
      I.hexEnvBody.setAttribute('data-sig', sig);
      let h = '';
      const dis = editLocked ? ' disabled' : '';
      // PD-033: the Environment is dealt at placement, so the one control is Change (no Choose, no Detach), at the right of the card; a hex without one has nothing to click
      const change = list.length && id
        ? '<button type="button" class="btn btn-sm" data-j2-hexenv="change" aria-expanded="' + open + '" aria-controls="j2-hexenv-picker"' + dis + '>' + esc(t('journey2_hexenv_change')) + '</button>' : '';
      if (!list.length) h += '<p class="j2-insp-p j2-insp-muted">' + esc(t('journey2_hexenv_no_habitat')) + '</p>';
      if (id && found) {
        // the link opens the Environment overlay on this same page (not a new tab), so it carries no external-link arrow
        h += '<div class="j2-hexenv-card"><a class="j2-env-link j2-hexenv-link" href="' + esc(found.href) + '" data-j2-env data-j2-hexenv-link><span class="j2-env-name">' + esc(found.name) + '</span><span class="sr-only"> (' + esc(t('journey2_hexenv_open')) + ')</span></a>' + change + '</div>';
      } else if (id) {
        h += '<div class="j2-hexenv-card is-unavailable"><div class="j2-hexenv-info"><strong class="j2-hexenv-gone">' + esc(t('journey2_hexenv_unavailable')) + '</strong>' +
          '<span class="j2-hexenv-id">' + esc(t('journey2_hexenv_stored_id')) + ': <code>' + esc(id) + '</code></span>' +
          (list.length ? '<span class="j2-insp-muted">' + esc(t('journey2_hexenv_gone')) + '</span>' : '') + '</div>' + change + '</div>';
      } else if (list.length) {
        h += '<p class="j2-insp-p j2-insp-muted">' + esc(t('journey2_hexenv_none')) + '</p>';
      }
      if (open) h += '<ul class="j2-envs-list j2-hexenv-list" id="j2-hexenv-picker" role="group" aria-label="' + esc(t('journey2_hexenv_picker')) + '">' + list.map((e, i) => envRowHtml(e, e.id === id, i)).join('') + '</ul>';
      I.hexEnvBody.innerHTML = h;
    }

    /** Empties the Hex Environment section: a closed inspector (and so Player Preview) keeps no assignment markup, ids or controls in the DOM. */
    function clearHexEnvironment() {
      envPicker = null;
      if (!ui.i || !ui.i.hexEnvBody) return;
      ui.i.hexEnvSec.hidden = true;
      ui.i.hexEnvBody.innerHTML = '';
      ui.i.hexEnvBody.removeAttribute('data-sig');
    }

    function hexEnvButton(kind) { return ui.i.hexEnvBody.querySelector('[data-j2-hexenv="' + kind + '"]'); }

    /** Opens/closes the inline picker. Pure UI state: no command, no history, no autosave. */
    function setEnvPicker(open, o) {
      const tile = inspector.tileId ? Model.derive(doc).byId.get(inspector.tileId) : null;
      if (!tile || previewMode) { envPicker = null; return; }
      envPicker = open ? { tileId: tile.id } : null;
      renderInspector();
      positionInspector();
      ensureInspectorClear();
      if (o && o.focus) { const b = hexEnvButton('change'); if (b) b.focus({ preventScroll: true }); }
    }

    function onHexEnvClick(btn) {
      const kind = btn.getAttribute('data-j2-hexenv');
      const tile = inspector.tileId ? Model.derive(doc).byId.get(inspector.tileId) : null;
      const b = tile ? Model.batchById(doc, tile.batchId) : null;
      if (!tile || !b) return;
      if (kind === 'change') { setEnvPicker(!envPicker, { focus: true }); return; }
      if (kind === 'assign') {
        const id = btn.getAttribute('data-env-id'), pick = hexEnvironmentList(b).find(e => e.id === id);
        if (!pick) return;                                    // only what the biome adapter currently offers can be assigned
        const r = dispatch({ type: 'setTileEnvironment', tileId: tile.id, environmentId: pick.id }, 'changeEnvironment', true);
        if (!r.ok) { hint(t('journey2_hexenv_failed')); return; }
        envPicker = null; renderInspector(); positionInspector(); ensureInspectorClear();
        announce(fill('journey2_hexenv_live_changed', { name: pick.name }));
        const l = ui.i.hexEnvBody.querySelector('[data-j2-hexenv-link]'); if (l) l.focus({ preventScroll: true });
      }
    }

    function renderInventory(full) {
      if (!ui.cards || !doc) return;
      const counts = Model.derive(doc).counts;
      const holes = Model.holeCounts(doc, data.ctx);
      const seen = new Set();
      const list = doc.batches;
      if (activeBatchId && !list.some(b => b.id === activeBatchId)) activeBatchId = list.length ? list[list.length - 1].id : null;
      // newest first
      for (let i = list.length - 1, pos = 0; i >= 0; i--, pos++) {
        const b = list[i];
        let refs = cardRefs.get(b.id);
        if (!refs) { refs = createCard(b); cardRefs.set(b.id, refs); }
        seen.add(b.id);
        updateCard(refs, b, i, counts, full, holes.get(b.id) || 0);
        const atPos = ui.cards.children[pos];
        if (atPos !== refs.root) ui.cards.insertBefore(refs.root, atPos || null);
      }
      for (const [id, refs] of cardRefs) if (!seen.has(id)) { refs.root.remove(); cardRefs.delete(id); }
      ui.stockEmpty.hidden = list.length > 0;
      ui.placeHint.hidden = list.length === 0;
      // the number answers "how much is left to place"; the region total lives in the tooltip / accessible name (D1)
      let left = 0; for (const b of list) left += counts.get(b.id).remaining;
      const countAria = fill('journey2_stock_count_aria', { r: n(list.length), n: n(left) });
      ui.stockCount.textContent = !list.length ? '' : left ? fill('journey2_stock_left', { n: n(left) }) : t('journey2_stock_all_placed');
      ui.stockCount.classList.toggle('has-left', left > 0);
      ui.stockCount.title = list.length ? countAria : '';
      if (list.length) ui.stockCount.setAttribute('aria-label', countAria); else ui.stockCount.removeAttribute('aria-label');
      ui.railCount.textContent = list.length ? n(left) : '';
      ui.railCount.setAttribute('aria-label', fill('journey2_rail_count_aria', { r: n(list.length), n: n(left) }));
      ui.generate.disabled = editLocked;
    }

    /** Makes one card the single expanded one (or none). Touches only the placement controls — never the inspector. */
    function setActiveBatch(id) {
      if (tr && tr.kind === 'armed') cancelTransient();
      activeBatchId = id;
      renderInventory(false);
    }

    function toggleCard(id) { setActiveBatch(activeBatchId === id ? null : id); }

    function warnHoles(batchId) {
      const nHoles = Model.holeCounts(doc, data.ctx).get(batchId) || 0;
      if (nHoles) toast(fill('journey2_warn_holes', { n: n(nHoles) }));
    }

    function confirmDelete(batchId) {
      const b = Model.batchById(doc, batchId);
      if (!b || editLocked) return;
      const idx = doc.batches.indexOf(b), tiles = Model.derive(doc).counts.get(batchId).placed;
      const topo = Model.deleteTopology(doc, batchId);          // a bridge region may still be deleted — the dialog just says what it splits
      openDialog({
        title: t('journey2_delete_title'),
        lines: [fill('journey2_delete_msg', { name: batchName(b), n: n(idx + 1) }), t('journey2_delete_tiles_note')].concat(tiles ? [fill('journey2_delete_tiles_n', { n: n(tiles) })] : []).concat(topo.after > topo.before ? [fill('journey2_delete_splits', { n: n(topo.after) })] : []),
        actions: [
          { label: t('journey2_cancel'), kind: 'btn-ghost', value: 'cancel', autofocus: true },
          { label: t('journey2_delete_region'), kind: 'btn-danger', value: 'delete' },
        ],
      }).then(v => {
        if (inst.disposed || v !== 'delete') { const r = cardRefs.get(batchId); if (r && !inst.disposed) r.del.focus({ preventScroll: true }); return; }
        const r = dispatch({ type: 'deleteBatch', batchId: batchId }, 'deleteBatch');
        if (!r.ok) { hint(errorText(r.error)); return; }
        if (sel.tileId && !Model.derive(doc).byId.has(sel.tileId)) sel.tileId = null;
        announce(t('journey2_live_deleted'));
        const next = cardRefs.get(activeBatchId);
        (next ? next.inspect : ui.generate).focus({ preventScroll: true });
      });
    }

    /* ============================================================
       Region Inspector (screen-space, over the map, region-level and GM-only)
       The one place a generated region's Encounter and Rumor are read. Opened by clicking a placed hex
       (source 'map', that hex is the selected anchor) or from a card's Inspect button (source 'card', works for an
       unplaced region). Its state — `inspector` — is transient and independent of `activeBatchId`: opening, moving
       or closing it never expands, collapses or scrolls a sidebar card, and it is never saved or put in history.
       ============================================================ */

    function inspectorOpen() { return !!inspector.batchId; }

    /** One call for every inspector state change: repaints the card state, the highlight, the panel and its position. */
    function afterInspectorChange() {
      renderSelection();
      renderInventory(false);
      renderInspector();
      positionInspector();
      ensureInspectorClear();
    }

    /** Opens/keeps the inspector on the region of a placed hex and makes that hex the selected anchor. */
    function openInspectorFromTile(tileId) {
      const next = Model.inspectTile(inspector, doc, tileId);
      if (next === inspector) return;
      exitLocate({ quiet: true }); if (routeSelecting()) exitRoute({ quiet: true });
      closeSanctuary({ quiet: true });
      announceInspector(next);
      inspector = next;
      envPicker = null;
      sel.tileId = tileId;
      if (diagOpen) setDiagnostics(false);
      afterInspectorChange();
    }

    /** Opens the inspector on a region from its card; no hex is selected and the card is not expanded. */
    function openInspectorFromCard(batchId) {
      if (tr && tr.kind === 'armed') cancelTransient();   // inspecting and armed placement never coexist
      const next = Model.inspectBatch(inspector, doc, batchId);
      if (next === inspector) return;
      exitLocate({ quiet: true }); if (routeSelecting()) exitRoute({ quiet: true });
      closeSanctuary({ quiet: true });
      announceInspector(next);
      const keepSel = inspector.tileId && sel.tileId === inspector.tileId;
      inspector = next;
      envPicker = null;
      if (keepSel) sel.tileId = null;                    // the strong outline belonged to the inspected hex of the previous region
      if (diagOpen) setDiagnostics(false);
      afterInspectorChange();
    }

    function announceInspector(next) {
      if (next.batchId !== inspector.batchId) announce(t('journey2_live_inspector_opened'));
    }

    /**
     * Closes the inspector: removes the highlight and the inspected hex's outline, optionally returns focus
     * to the opener (the card's Inspect button, or the map). `quiet` skips the live announcement (deletion, import, teardown).
     */
    function closeInspector(opts) {
      if (!inspectorOpen()) return false;
      const o = opts || {};
      const was = inspector;
      inspector = Model.NO_INSPECTION;
      encRoll = null;
      envPicker = null;
      if (was.tileId && sel.tileId === was.tileId) sel.tileId = null;
      if (ui.inspector) { ui.inspector.hidden = true; ui.inspector.style.transform = ''; }
      inspectorShown = null;
      clearHexEnvironment();
      renderSelection();
      renderInventory(false);
      if (!o.quiet) announce(t('journey2_live_inspector_closed'));
      if (o.focus) {
        const refs = cardRefs.get(was.batchId);
        const target = was.source === 'card' && refs && refs.inspect ? refs.inspect : ui.viewport;
        if (target) target.focus({ preventScroll: true });
      }
      return true;
    }

    /** After any document change: a vanished region closes the inspector, a vanished anchor hex is dropped. */
    function syncInspector() {
      if (!inspectorOpen()) return;
      const next = Model.syncInspection(inspector, doc);
      if (next === inspector) return;
      if (!next.batchId) { closeInspector({ quiet: true }); return; }
      inspector = next;
    }

    /** The Encounter Roll in the open inspector: the button ("Nd6", N = the region's Terrain Rating), the dice of the last roll and the Encounter frame.
     *  The result belongs to one region + hex and is dropped the moment either changes. */
    function renderEncounterRoll(b) {
      const I = ui.i, bare = !!b.habitat.overtaken, nDice = b.terrain.value;
      if (encRoll && (encRoll.batchId !== inspector.batchId || encRoll.tileId !== inspector.tileId || bare)) encRoll = null;
      I.roll.hidden = bare;
      I.rollLabel.textContent = n(nDice) + 'd6';
      I.roll.setAttribute('aria-label', fill('journey2_roll_aria', { n: n(nDice) }));
      const r = encRoll;
      I.rollOut.hidden = !r;
      I.encSec.classList.toggle('is-triggered', !!(r && r.triggered));
      I.encFlag.hidden = !(r && r.triggered);
      if (!r) { I.rollDice.textContent = ''; I.rollDice.removeAttribute('data-n'); return; }
      // rebuilt only for a new roll, so an unrelated re-render never replays the tumble
      if (I.rollDice.getAttribute('data-n') !== String(r.n)) {
        I.rollDice.innerHTML = r.faces.map((f, i) => '<i class="j2-die' + (f === 1 ? ' is-one' : '') + '" style="--i:' + i + '"><img src="img/journey2/dice/d6-' + f + '.png" alt="" width="32" height="32" draggable="false"></i>').join('');
        I.rollDice.setAttribute('data-n', String(r.n));
      }
      I.rollDice.setAttribute('aria-label', fill('journey2_roll_dice_aria', { faces: r.faces.map(n).join(', ') }));
      I.rollOut.classList.toggle('is-triggered', r.triggered);
      I.rollVerdict.textContent = t(r.triggered ? 'journey2_roll_hit' : 'journey2_roll_miss');
      I.rollHint.hidden = r.triggered;
    }

    /** Rolls the region's Terrain Rating in d6s; any 1 triggers its Encounter. Re-rolling is always allowed. */
    function rollEncounter() {
      const b = inspectorOpen() ? Model.batchById(doc, inspector.batchId) : null;
      if (!b || b.habitat.overtaken || !EncRoll) return;
      const res = EncRoll.rollEncounterDice({ count: b.terrain.value, sides: 6, random: rollRandom });
      encRoll = { batchId: inspector.batchId, tileId: inspector.tileId, faces: res.faces, triggered: res.triggered, n: ((encRoll && encRoll.n) || 0) + 1 };
      renderInspector();
      positionInspector();
      ensureInspectorClear();
      announce(fill(res.triggered ? 'journey2_roll_live_hit' : 'journey2_roll_live_miss', { faces: res.faces.map(n).join(', ') }));
    }

    /* PROTOTYPE (Forest only): an illustrated header for the shared Region Inspector — hex-opened and card-opened alike.
     * Biome -> artwork lives in css/journey2.css ([data-art] rules); this only flags which biomes have art.
     * The ?hdr=A1|A2|B1|B2 query (A centred / B shifted up, 1 original / 2 taller) is a dev-only comparison switch. */
    const HEADER_ART_BIOMES = new Set(['forest']);
    function applyHeaderArt(b) {
      const root = ui.inspector, art = !b.habitat.overtaken && HEADER_ART_BIOMES.has(b.habitat.biome) ? b.habitat.biome : '';
      if (!art) { root.removeAttribute('data-art'); root.removeAttribute('data-art-pos'); root.removeAttribute('data-art-h'); return; }
      const m = /^([AB])([12])$/i.exec(new URLSearchParams(location.search).get('hdr') || 'A1') || ['', 'A', '1'];
      root.setAttribute('data-art', art);
      root.setAttribute('data-art-pos', m[1].toUpperCase() === 'B' ? 'up' : 'center');
      root.setAttribute('data-art-h', m[2] === '2' ? 'tall' : 'orig');
    }

    /** Paints the open inspector from the committed document. */
    function renderInspector() {
      if (!ui.inspector) return;
      const b = inspectorOpen() ? Model.batchById(doc, inspector.batchId) : null;
      if (!b) { ui.inspector.hidden = true; inspectorShown = null; clearHexEnvironment(); return; }
      const I = ui.i, idx = doc.batches.indexOf(b), sym = symbolFor(b);
      ui.inspector.hidden = false;
      applyHeaderArt(b);
      if (sym && I.img.getAttribute('data-sym') !== sym.id) { I.img.src = sym.path; I.img.setAttribute('data-sym', sym.id); }
      I.name.textContent = batchName(b);
      I.ord.textContent = fill('journey2_region_n', { n: n(idx + 1) });
      const blight = b.habitat.overtaken || b.habitat.blighted;
      I.blight.hidden = !blight;
      I.blight.textContent = b.habitat.overtaken ? t('journey2_overtaken') : t('journey_shadowblighted');
      I.dots.hidden = !!b.habitat.overtaken;
      I.dots.innerHTML = [1, 2, 3, 4].map(i => '<i' + (i <= b.terrain.value ? ' class="on"' : '') + '></i>').join('');
      I.dots.setAttribute('aria-label', fill('journey2_terrain_n', { n: b.terrain.value }));
      I.terrainN.textContent = '';
      // a fully overtaken region has no Terrain, Encounter or Rumor to read or roll for: the panel keeps only its title and the hex's Return (PD-039)
      const bare = !!b.habitat.overtaken;
      I.scroll.hidden = bare;
      renderEncounterRoll(b);
      if (bare) {
        I.examples.hidden = true; I.terrainText.hidden = true; I.summary.classList.remove('has-more'); I.terrainName.textContent = ''; I.enc.innerHTML = ''; I.rumor.textContent = '';
      } else if (generator && generator.ready()) {
        const d = generator.describe(b);
        I.terrainName.textContent = d.terrain ? d.terrain.name : '';
        I.terrainText.hidden = !(d.terrain && d.terrain.text);
        I.terrainText.textContent = d.terrain ? d.terrain.text : '';
        I.summary.classList.toggle('has-more', !!(d.terrain && d.terrain.text));
        I.terrainN.textContent = d.terrain ? ' · ' + fill('journey2_days_per_hex', { n: n(d.terrain.days) }) : '';
        I.examples.hidden = !d.examples;
        I.examples.textContent = d.examples || '';
        I.enc.innerHTML = (d.combined ? '<p class="j2-note">' + esc(t('journey_encounter_combined')) + '</p>' : '') + d.encounter.map(x => '<p class="j2-insp-p j2-enc">' + x.html + '</p>').join('');
        I.rumor.textContent = d.rumor;
      } else {
        I.terrainName.textContent = ''; I.terrainText.hidden = true; I.summary.classList.remove('has-more'); I.examples.hidden = true; I.enc.innerHTML = ''; I.rumor.textContent = '';
      }
      const hexTile = inspector.source === 'map' && inspector.tileId ? Model.derive(doc).byId.get(inspector.tileId) : null;
      renderHexEnvironment(b, hexTile);
      // the anchored hex's placement info + the one action on it (a card-opened inspector has no anchor, so no footer)
      const tile = inspector.tileId ? Model.derive(doc).byId.get(inspector.tileId) : null;
      ui.inspTile.hidden = !tile;
      if (tile) {
        // raw lattice coordinates are diagnostics, not GM information: shown only while Diagnostics is on
        I.tileText.hidden = !diagOpen;
        I.tileText.textContent = diagOpen ? fill('journey2_tile_cell', { cell: tile.cell }) : '';
        ui.inspTile.querySelector('[data-j2-return]').disabled = editLocked;
      }
      if (inspectorShown !== b.id) ui.inspector.querySelector('.j2-insp-scroll').scrollTop = 0;
      inspectorShown = b.id;
    }

    /** Anchor hex in map-area px (centre + half width), or null when there is no anchor or it is off screen. */
    function inspectorAnchor(view, keepOffscreen) {
      const tile = inspector.tileId ? Model.derive(doc).byId.get(inspector.tileId) : null;
      if (!tile) return null;
      const c = Geo.parseCellId(tile.cell), ctr = data.grid.cellCenter(c.q, c.r);
      const vp = ui.viewport.getBoundingClientRect(), wrap = ui.mapwrap.getBoundingClientRect();
      const s = Geo.worldToScreen(cam, ctr[0], ctr[1]);
      const x = vp.left - wrap.left + s[0], y = vp.top - wrap.top + s[1];
      if (!keepOffscreen && (x < 0 || y < 0 || x > view.w || y > view.h)) return null;
      const pts = data.grid.cellCorners(c.q, c.r), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      return { x: x, y: y, r: (Math.max.apply(null, xs) - Math.min.apply(null, xs)) / 2 * cam.scale, ry: (Math.max.apply(null, ys) - Math.min.apply(null, ys)) / 2 * cam.scale };
    }

    /** The rectangles (map-area px) the inspector must stay clear of: the actual visible sidebar/rail and diagnostics drawer. */
    function inspectorBlocked(wrap) {
      const out = [];
      for (const node of [ui.sidewrap, ui.panel]) {
        if (!node || node.hidden) continue;
        const r = node.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.push({ x: r.left - wrap.left, y: r.top - wrap.top, w: r.width, h: r.height });
      }
      return out;
    }

    /** Places one screen-space panel (the Region Inspector or the sanctuary overlay) beside its anchor, clear of the sidebar and the drawer. */
    function positionPanel(node, anchorOf) {
      const wrap = ui.mapwrap.getBoundingClientRect();
      const view = { w: wrap.width, h: wrap.height };
      if (!view.w || !view.h) return;
      const pos = Geo.placeInspector({
        view: view, size: { w: node.offsetWidth, h: node.offsetHeight }, anchor: anchorOf(view),
        blocked: inspectorBlocked(wrap), narrow: window.innerWidth <= 900,
      });
      node.style.transform = 'translate(' + pos.x + 'px,' + pos.y + 'px)';
      node.setAttribute('data-side', pos.side);
      if (pos.caret) { node.setAttribute('data-caret', pos.caret.edge); node.style.setProperty('--j2-caret', pos.caret.offset + 'px'); }
      else node.removeAttribute('data-caret');
    }

    /**
     * Keeps the selected hex in sight beside the open inspector: when no side of the hex has room for the panel (small laptop windows), pans the map
     * by the least amount that makes room — never a Fit, never a zoom change. Called when the inspector opens on a hex or changes height
     * (not while the user pans or zooms, so it never fights the pointer).
     */
    function ensureInspectorClear() {
      if (inspector.batchId == null || !inspector.tileId || !ui.inspector || ui.inspector.hidden || !data || previewMode) return;
      const wrap = ui.mapwrap.getBoundingClientRect(), view = { w: wrap.width, h: wrap.height };
      if (!view.w || !view.h) return;
      const pan = Geo.panForInspector({ view: view, size: { w: ui.inspector.offsetWidth, h: ui.inspector.offsetHeight }, anchor: inspectorAnchor(view), blocked: inspectorBlocked(wrap), narrow: window.innerWidth <= 900 });
      if (pan && (pan.dx || pan.dy)) animateCameraBy(pan.dx, pan.dy, 220);
    }

    /**
     * After an explicit window resize, an open hex inspector whose hex has left the map area gets the least pan that brings it back (zoom kept,
     * never a Fit), then the usual clearance pan makes room beside it. A hex that is still in view is left exactly where it is. Debounced:
     * only the settled size is reconciled. Drawer collapse/expand and the other camera flows do not fire window resize and keep their own rules.
     */
    let resizeReconcileTimer = 0;
    function scheduleResizeReconcile() {
      clearTimeout(resizeReconcileTimer);
      resizeReconcileTimer = setTimeout(reconcileInspectorAfterResize, 140);
    }
    function reconcileInspectorAfterResize() {
      resizeReconcileTimer = 0;
      if (inst.disposed || !data || !cameraReady || previewMode) return;
      if (inspector.batchId == null || !inspector.tileId || !ui.inspector || ui.inspector.hidden) return;
      const wrap = ui.mapwrap.getBoundingClientRect(), view = { w: wrap.width, h: wrap.height };
      if (!view.w || !view.h) return;
      const a = inspectorAnchor(view, true);
      if (!a || (a.x >= 0 && a.y >= 0 && a.x <= view.w && a.y <= view.h)) return;
      const m = 12, rx = Math.min(a.r, view.w / 2 - m), ry = Math.min(a.ry, view.h / 2 - m);
      const nx = Math.min(Math.max(a.x, m + rx), view.w - m - rx), ny = Math.min(Math.max(a.y, m + ry), view.h - m - ry);
      setCamera({ scale: cam.scale, tx: cam.tx + (nx - a.x), ty: cam.ty + (ny - a.y) }, true);
      positionInspector();
      ensureInspectorClear();
    }

    function prefersReducedMotion() { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (err) { return false; } }

    /** Eases the camera by (dx, dy) screen px at the current zoom (instant under reduced motion); any other camera change (pan, zoom, Fit) cancels the rest of it. */
    function animateCameraBy(dx, dy, ms) {
      const from = cam, start = performance.now();
      if (prefersReducedMotion() || !ms) { setCamera({ scale: from.scale, tx: from.tx + dx, ty: from.ty + dy }, true); return; }
      let last = from;
      const step = now => {
        if (inst.disposed || cam !== last) return;
        const k = Math.min(1, (now - start) / ms), e = 1 - Math.pow(1 - k, 3);
        setCamera({ scale: from.scale, tx: from.tx + dx * e, ty: from.ty + dy * e }, true);
        last = cam;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    /** Eases the camera to a world point at an exact scale (the point lands at the centre of the part of the map the side panel leaves visible); instant under reduced motion. */
    function animateCameraToWorld(x, y, scale, ms) {
      const [vw, vh] = viewSize();
      const left = sideInset(), s = Math.min(MAX_ZOOM, Math.max(Math.min(minScale(), Geo.ZOOM_STEPS[0]), scale));
      const target = { scale: s, tx: left + (vw - left) / 2 - x * s, ty: vh / 2 - y * s };
      const from = cam, start = performance.now();
      if (prefersReducedMotion() || !ms) { setCamera(target); return; }
      let last = from;
      const step = now => {
        if (inst.disposed || cam !== last) return;       // any other camera change cancels the rest
        const k = Math.min(1, (now - start) / ms), e = 1 - Math.pow(1 - k, 3);
        // interpolate the world point under the viewport centre and log-scale, so the zoom feels even
        const sc = k >= 1 ? target.scale : from.scale * Math.pow(target.scale / from.scale, e);
        const cx0 = (vw / 2 - from.tx) / from.scale, cy0 = (vh / 2 - from.ty) / from.scale;
        const tcx = (left + (vw - left) / 2 - target.tx) / target.scale;
        const wx = cx0 + (tcx - cx0) * e, wy = cy0 + (y - cy0) * e;
        const centreX = k >= 1 ? left + (vw - left) / 2 : vw / 2 + (left / 2) * e;
        setCamera(k >= 1 ? target : { scale: sc, tx: centreX - wx * sc, ty: vh / 2 - wy * sc });
        last = cam;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    /** Centres the map on a region (the middle of its hexes) at 100%, smoothly. */
    function focusRegion(batchId) {
      if (!data || !doc) return;
      const pts = doc.tiles.filter(tl => tl.batchId === batchId).map(tl => { const c = Geo.parseCellId(tl.cell); return data.grid.cellCenter(c.q, c.r); });
      if (!pts.length) return;
      const x = pts.reduce((a, p) => a + p[0], 0) / pts.length, y = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      animateCameraToWorld(x, y, 1, 600);
    }

    function positionInspector() {
      if (inspector.batchId != null && ui.inspector && !ui.inspector.hidden && data) positionPanel(ui.inspector, inspectorAnchor);
      positionSanctuary();
      positionLocate();
      positionSeekers();
    }

    /** Re-positions every frame for `ms` (the sidebar slides for 250 ms and moves the rectangle the inspector avoids). */
    function followInspector(ms) {
      followUntil = Math.max(followUntil, performance.now() + ms);
      const step = () => {
        if (inst.disposed) return;
        positionInspector();
        if (performance.now() < followUntil) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    /* ---- tiles layer ---- */

    function hexPath(q, r) {
      const k = q + ',' + r;
      let p = hexPathCache.get(k);
      if (!p) { p = data.grid.cellPath(q, r); hexPathCache.set(k, p); }
      return p;
    }

    /** Centre of the blight X: top of the hexagon, as in the book's icon. */
    function blightMarkCenter(q, r) {
      const c = data.grid.cellCenter(q, r), top = Math.min.apply(null, data.grid.cellCorners(q, r).map(p => p[1]));
      return [c[0], top + BLIGHT_X_HALF + 5];
    }

    /**
     * What a generated tile draws, and nothing else: { symbolId, dots, blightMark }. Both the GM render (from a batch) and the
     * Player Preview (from the player projection) go through the same drawing code, so a revealed hex looks identical in both.
     */
    function specOfBatch(b) { return { symbolId: Model.symbolIdOf(b), dots: b.habitat.overtaken ? 0 : b.terrain.value, blightMark: !!(b.habitat.blighted && !b.habitat.overtaken) }; }

    /** Glyph layout (symbol + terrain dots + optional blight mark) that never covers protected artwork; cached. */
    function layoutFor(q, r, spec) {
      const sym = data.symbolById.get(spec.symbolId);
      if (!sym) return null;
      const dots = spec.dots, blight = spec.blightMark;
      const key = q + ',' + r + '|' + sym.id + '|' + dots + '|' + (blight ? 1 : 0);
      let L = glyphCache.get(key);
      if (L === undefined) {
        const gw = Math.round(sym.sizePx[0] * GLYPH_SCALE * 10) / 10, gh = Math.round(sym.sizePx[1] * GLYPH_SCALE * 10) / 10;
        const boxW = gw;
        // the glyph is laid out as for any hex — blight or not — and the blight X is drawn on top of it, at the top of the hexagon;
        // a hex beside a sanctuary icon (no clear box) keeps the standard position and size instead of shrinking, shifting or vanishing
        const glyph = { w: boxW, h: gh, dots: dots };
        let lay = Geo.layoutProofGlyph(data.grid, q, r, glyph, data.glyphProtections, 2);
        if (lay.hidden) lay = Geo.layoutCenteredGlyph(data.grid, q, r, glyph, 2);
        L = { lay: lay, sym: sym, gw: gw, gh: gh, boxW: boxW, blight: blight };
        glyphCache.set(key, L);
      }
      return L;
    }

    /** A placed hex sits above the artwork's printed labels (MARROGATE, HORIZON): true when the cell overlaps one, so it is painted over them. */
    function overlapsBuiltInLabel(q, r) {
      const poly = data.grid.cellCorners(q, r);
      const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
      const bx = Math.min.apply(null, xs), by = Math.min.apply(null, ys), bw = Math.max.apply(null, xs) - bx, bh = Math.max.apply(null, ys) - by;
      return data.labelRects.some(([x, y, w, h]) => bx < x + w && x < bx + bw && by < y + h && y < by + bh);
    }

    /** Committed-tile markup: one monochrome symbol, terrain dots and (when blighted) a blight mark. `cls` selects committed/preview. */
    function tileMarkup(q, r, spec, cls, bodyOnly, tint) {
      const L = layoutFor(q, r, spec);
      let h = '';
      if (!L) return h;
      if (L.lay.hidden) return h;       // no clear space: the glyph is withheld (never drawn over a marker); the tile stays, outlined
      const box = L.lay.boxPx, g = L.lay.glyphRectPx;
      if (!bodyOnly) h += '<rect class="' + cls + '-halo" x="' + fmt(box[0], 1) + '" y="' + fmt(box[1], 1) + '" width="' + fmt(box[2], 1) + '" height="' + fmt(box[3], 1) + '" rx="3"/>';
        // the white halo would otherwise punch a pale patch into the wash: lay the same faint tint over it so the box matches its hex
        const def = tint ? Tint.definitionOf(tint) : null;
        if (def) h += '<rect class="j2-biome-halo" pointer-events="none" aria-hidden="true" fill="' + def.color + '" fill-opacity="' + def.opacity + '" x="' + fmt(box[0], 1) + '" y="' + fmt(box[1], 1) + '" width="' + fmt(box[2], 1) + '" height="' + fmt(box[3], 1) + '" rx="3"/>';
      const gx = g[0] + (L.boxW - L.gw) / 2;
      h += '<image class="' + cls + '-sym" href="' + esc(L.sym.path) + '" x="' + fmt(gx, 1) + '" y="' + fmt(g[1], 1) + '" width="' + L.gw + '" height="' + L.gh + '" preserveAspectRatio="xMidYMid meet"/>';
      for (const d of L.lay.dotsPx) h += '<circle class="' + cls + '-dot" cx="' + fmt(d[0], 1) + '" cy="' + fmt(d[1], 1) + '" r="1.7"/>';
      if (L.blight) h += blightXMarkup(q, r, cls);
      return h;
    }

    /** The Shadowblight X at the top of a hexagon (white halo + ink stroke). Drawn on a tile, or alone on open ground (PD-041: an X that walked off its region). */
    function blightXMarkup(q, r, cls) {
      const m = blightMarkCenter(q, r), k = BLIGHT_X_HALF;
      const d = 'M' + fmt(m[0] - k, 1) + ' ' + fmt(m[1] - k, 1) + 'l' + fmt(2 * k, 1) + ' ' + fmt(2 * k, 1) + 'm0 ' + fmt(-2 * k, 1) + 'l' + fmt(-2 * k, 1) + ' ' + fmt(2 * k, 1);
      return '<path class="' + cls + '-blight-halo" d="' + d + '"/><path class="' + cls + '-blight" d="' + d + '"/>';
    }

    /**
     * The generated-tile layer as SVG markup for a list of { q, r, spec } entries — the ONE drawing routine behind the GM map and
     * Player Preview (and the future print renderer). It knows nothing about regions, selection or visibility: what to draw has
     * already been decided (GM: every placed tile; players: the projection's overlays).
     */
    function overlayMarkup(entries) {
      let outlines = '', quiet = '', body = '', cover = '';
      const tints = new Map();                               // tint key -> merged hex paths; only entries the caller decided to tint
      for (const e of entries) {
        if (e.floating) { body += blightXMarkup(e.q, e.r, 'j2-tile'); continue; }   // a bare X on a hex with no tile
        if (e.tint && Tint.definitionOf(e.tint)) tints.set(e.tint, (tints.get(e.tint) || '') + hexPath(e.q, e.r));
        const L = layoutFor(e.q, e.r, e.spec);
        if (L && L.lay.hidden) quiet += hexPath(e.q, e.r); else outlines += hexPath(e.q, e.r);
        if (overlapsBuiltInLabel(e.q, e.r)) cover += hexPath(e.q, e.r);
        body += tileMarkup(e.q, e.r, e.spec, 'j2-tile', false, e.tint);
      }
      // order inside the layer: label cover, biome tint (aria-hidden, no events), hex outlines, then the black symbols / dots / blight marks
      let wash = '';
      for (const [key, d] of tints) { const def = Tint.definitionOf(key); wash += '<path class="j2-biome-tint" data-biome="' + key + '" fill="' + def.color + '" fill-opacity="' + def.opacity + '" d="' + d + '"/>'; }
      if (wash) wash = '<g class="j2-biome-layer" pointer-events="none" aria-hidden="true">' + wash + '</g>';
      return (cover ? '<path class="j2-tile-cover" d="' + cover + '"/>' : '') + wash + (outlines ? '<path class="j2-tile-hex" d="' + outlines + '"/>' : '') + (quiet ? '<path class="j2-tile-hex is-glyphless" d="' + quiet + '"/>' : '') + body;
    }

    function renderTiles() {
      if (!ui.g || !doc) return;
      if (previewMode) {
        // Player Preview: the GM layer is emptied (not hidden) and only the projection is produced
        ui.g.tiles.innerHTML = '';
        playerProjection = Projection.buildPlayerProjection(doc, data.ctx);
        ui.g.player.innerHTML = overlayMarkup(playerProjection.overlays.map(o => ({ q: o.q, r: o.r, spec: { symbolId: o.symbolId, dots: o.dots, blightMark: o.blightMark }, tint: o.tint }))
          .concat(playerProjection.shadowMarks.map(m => ({ q: m.q, r: m.r, floating: true }))));
        renderEchoes();
        renderPerimeter();
        renderSanctuaryLabels();
        return;
      }
      ui.g.player.innerHTML = '';
      renderEchoes();
      const byBatch = new Map(doc.batches.map(b => [b.id, b])), tints = Tint.gmTintByCell(doc, showBiome);
      const xs = Model.getShadowXSet(doc), onTile = new Set(doc.tiles.map(tile => tile.cell));
      const entries = doc.tiles.map(tile => { const c = Geo.parseCellId(tile.cell); return { q: c.q, r: c.r, spec: Object.assign(specOfBatch(byBatch.get(tile.batchId)), { blightMark: xs.has(tile.cell) }), tint: tints.get(tile.cell) || null }; });
      for (const id of xs) if (!onTile.has(id)) { const c = Geo.parseCellId(id); if (c) entries.push({ q: c.q, r: c.r, floating: true }); }   // an X that walked off its region (PD-041)
      ui.g.tiles.innerHTML = overlayMarkup(entries);
      renderPerimeter();
      renderSanctuaryLabels();
    }

    /**
     * The names the GM revealed (PD-027), as ink on the map beside each fixed icon, in the printed book's hand lettering. Player Preview draws them from the
     * projection's `sanctuaryLabels` alone; the GM map draws the same list through the projection module's `sanctuaryLabelsOf`, so the GM sees what the players were given. Both are
     * laid out in WORLD px by Geo.layoutSanctuaryLabels — no viewport, zoom or sidebar input, so a print renderer can call the same two functions. The layer is
     * above the fog, aria-hidden and pointer-transparent; assistive technology reads the visually-hidden "Known sanctuaries" list (Player Preview only).
     * An unrevealed name is in neither.
     */
    function renderSanctuaryLabels() {
      const g = ui.g && ui.g.sanctlabels;
      if (!g || !doc) return;
      if (ui.knownSanc && !previewMode) { ui.knownSanc.hidden = true; ui.knownSanc.innerHTML = ''; }
      const labels = previewMode && playerProjection ? playerProjection.sanctuaryLabels : Projection.sanctuaryLabelsOf(doc);
      const sig = JSON.stringify(labels);
      if (sancLabelsDrawn === sig) { if (previewMode) renderKnownSanctuaries(labels); return; }
      const placed = Geo.layoutSanctuaryLabels(labels, data.ctx.sanctuaries.map(s => ({ id: s.id, rect: s.rect })), { icons: data.ctx.iconRects, world: data.ctx.worldSize });
      let h = '';
      for (const l of placed) {
        h += '<text class="j2-sanc-label" data-anchor="' + esc(l.anchorId) + '" data-placement="' + l.placement + '" font-size="' + l.fontSize + '">' +
          l.lines.map((line, i) => '<tspan x="' + fmt(l.cx, 1) + '" y="' + fmt(l.y + l.lineHeight * (i + 0.8), 1) + '">' + esc(line) + '</tspan>').join('') + '</text>';
      }
      g.innerHTML = h;
      sancLabelsDrawn = sig;
      if (previewMode) renderKnownSanctuaries(labels);
    }

    function renderKnownSanctuaries(labels) {
      if (!ui.knownSanc) return;
      ui.knownSanc.innerHTML = labels.map(l => '<li>' + esc(l.name) + '</li>').join('');
      ui.knownSanc.hidden = !labels.length;
    }

    /**
     * The thick cartographic region outline — derived on every render from the tiles, never stored. GM: the complete perimeter of every
     * placed region. Player Preview: only the projection's perimeter (edges whose cells are revealed). One path, no fill, no pointer events;
     * redrawn only when the tiles, the visibility or the mode changed.
     */
    function renderPerimeter() {
      if (!ui.g || !ui.g.perimeter || !ui.g.perimeterPlayer || !doc) return;
      const mode = previewMode ? 'player' : 'gm';
      const vis = previewMode ? playerProjection : doc.playerVisibility;
      if (perimDrawn.tiles === doc.tiles && perimDrawn.vis === vis && perimDrawn.mode === mode) return;
      // GM: the complete outline above the (subtle) fog state. Player Preview: only the projection's safe edges, beneath the veil.
      const segs = previewMode ? playerProjection.perimeter : Model.regionBoundarySegments(doc, data.ctx);
      const d = Geo.polylinesPath(Geo.chainEdgeSegments(data.grid, segs));
      const live = previewMode ? ui.g.perimeterPlayer : ui.g.perimeter, idle = previewMode ? ui.g.perimeter : ui.g.perimeterPlayer;
      live.innerHTML = d ? '<path class="j2-perimeter" d="' + d + '"/>' : '';
      live.setAttribute('data-segments', String(segs.length));
      idle.innerHTML = '';
      idle.setAttribute('data-segments', '0');
      perimDrawn = { tiles: doc.tiles, vis: vis, mode: mode };
    }

    /**
     * Soul Echoes (PD-024): GM-only crystals on the chosen sanctuaries. Like the tiles, the layer is EMPTIED (not hidden) in Player Preview, and
     * the player projection has no field for it, so the secret cannot reach the preview or a future print. Redrawn only when the set changed.
     */
    function renderEchoes() {
      if (!ui.g || !ui.g.echoes || !doc) return;
      if (previewMode) { ui.g.echoes.innerHTML = ''; echoDrawn = null; return; }
      if (echoDrawn === doc.soulEchoes) return;
      const at = new Map(data.ctx.sanctuaries.map(s => [s.id, s]));
      const got = new Set(doc.soulEchoes.collectedAnchorIds);
      let h = '', i = 0;
      for (const id of doc.soulEchoes.anchorIds) {
        const s = at.get(id);
        if (!s) continue;
        // right above the printed icon (its centre line, just over its top edge), independent of the hex grid, so the icon itself stays clear
        const x = fmt(s.x, 1), y = fmt(s.top - ECHO_LIFT, 1);
        // a collected Echo is drawn smaller, flat and dim (no glow, no shimmer): shape and brightness, not only colour, tell it from an Available one
        h += got.has(id)
          ? '<g class="j2-echo is-collected" data-echo="' + esc(id) + '" data-collected="true"><g transform="translate(' + x + ' ' + y + ') scale(.8)">' + ECHO_CRYSTAL + '</g></g>'
          : '<g class="j2-echo" data-echo="' + esc(id) + '" style="--j2-echo-i:' + (i++) + '"><circle class="j2-echo-glow" cx="' + x + '" cy="' + y + '" r="34"/><g transform="translate(' + x + ' ' + y + ') scale(1.25)">' + ECHO_CRYSTAL + '</g></g>';
      }
      ui.g.echoes.innerHTML = h;
      echoDrawn = doc.soulEchoes;
    }

    /** Toolbar state of the Soul Echoes group: Remove disabled when there is nothing to remove, both disabled while edits are locked. */
    function updateEchoUi() {
      if (!ui.echoGroup || !doc) return;
      const count = doc.soulEchoes.anchorIds.length;
      ui.echoPlace.disabled = editLocked;
      ui.echoClear.disabled = editLocked || !count;
      // Locate: a real button that stays focusable while unavailable (aria-disabled), with its reason as the title AND a description screen readers read
      const a = locateAvailability(), active = locateSession.isActive();
      ui.echoLocate.disabled = editLocked;
      ui.echoLocate.setAttribute('aria-disabled', String(!a.ok));
      ui.echoLocate.setAttribute('aria-pressed', String(active));
      ui.echoLocate.title = a.ok ? t('journey2_echo_locate_title') : t(a.key);
      ui.locateReason.textContent = a.ok ? '' : t(a.key);
    }

    /** One button, nine Echoes: rolls the book's placement rule once, then commits those exact ids as ONE undoable command. */
    function placeSoulEchoes() {
      if (inst.disposed || editLocked || previewMode || !doc) return;
      const commit = () => {
        const plan = Model.planSoulEchoes(data.ctx);
        const r = dispatch({ type: 'setSoulEchoes', anchorIds: plan.anchorIds }, 'echoesPlace');
        if (!r.ok) { hint(errorText(r.error)); return; }
        announce(fill('journey2_live_echoes_placed', { n: n(plan.anchorIds.length) }));
      };
      if (!doc.soulEchoes.anchorIds.length) { commit(); return; }
      openDialog({
        title: t('journey2_echo_replace_title'),
        lines: [t('journey2_echo_replace_msg'), t('journey2_echo_undo_note')],
        actions: [
          { label: t('journey2_cancel'), kind: 'btn-ghost', value: 'cancel', autofocus: true },
          { label: t('journey2_echo_replace_go'), kind: 'btn-danger', value: 'replace' },
        ],
      }).then(v => { if (inst.disposed) return; if (v === 'replace') commit(); if (ui.echoPlace) focusTool(ui.echoPlace); });
    }

    function confirmClearSoulEchoes() {
      if (inst.disposed || editLocked || previewMode || !doc || !doc.soulEchoes.anchorIds.length) return;
      openDialog({
        title: t('journey2_echo_clear_title_dlg'),
        lines: [fill('journey2_echo_clear_msg', { n: n(doc.soulEchoes.anchorIds.length) }), t('journey2_echo_undo_note')],
        actions: [
          { label: t('journey2_cancel'), kind: 'btn-ghost', value: 'cancel', autofocus: true },
          { label: t('journey2_echo_clear_go'), kind: 'btn-danger', value: 'clear' },
        ],
      }).then(v => {
        if (inst.disposed) return;
        if (v === 'clear') {
          const r = dispatch({ type: 'setSoulEchoes', anchorIds: [] }, 'echoesClear');
          if (!r.ok) { hint(errorText(r.error)); return; }
          announce(t('journey2_live_echoes_cleared'));
        }
        if (ui.echoPlace) focusTool(ui.echoPlace);
      });
    }

    /* ============================================================
       Locate Soul Echoes (PD-030): GM-only. "Locate Soul Echoes" -> the GM clicks the party's hex -> the nearest UNCOLLECTED Echo (straight-line map
       distance, pure js/journey2-locate.js) is frozen and an animated compass answers with a direction on a sixteen-point rose — and nothing else.
       The state machine (selecting -> animating -> result), the hover hex, the frozen bearing and the popover are all transient: never in the
       document, history, autosave, backup or storage, and never in the player projection or a print. Fog, sanctuary names, generated sanctuary data
       and terrain are not inputs. Collected state (the only persisted part) is changed by the sanctuary overlay's Soul Echo row.
       ============================================================ */

    /** The fingerprint of the Echo set a result was computed from: any change (regenerate, remove, collect, restore, Undo, Redo) makes an open result stale. */
    function echoSig() { const e = doc.soulEchoes; return e.anchorIds.join(',') + '|' + e.collectedAnchorIds.join(','); }

    /** { ok, key }: whether a search can start; `key` is the localized reason when it cannot. */
    function locateAvailability() {
      if (!doc || !doc.soulEchoes.anchorIds.length) return { ok: false, key: 'journey2_echo_locate_none' };
      if (!Model.availableEchoIds(doc).length) return { ok: false, key: 'journey2_echo_locate_all' };
      return { ok: true, key: null };
    }

    /** Enters the transient location-selection tool: everything that could compete for the map is cancelled first; pan, zoom, the sidebar and Fog of War are untouched. */
    function startLocate() {
      if (inst.disposed || previewMode || editLocked || !doc || !data) return;
      if (locateSession.isActive()) { exitLocate({ focus: true }); return; }
      const a = locateAvailability();
      if (!a.ok) { hint(t(a.key)); return; }
      exitRoute({ quiet: true });                              // the two map tools are mutually exclusive
      cancelTransient(); cancelFogStroke(); setFogTool(null, { quiet: true });
      closeMenus(); hideEnvTip(); clearHint();
      if (diagOpen) setDiagnostics(false);
      closeInspector({ quiet: true }); closeSanctuary({ quiet: true });
      if (sel.tileId) { sel.tileId = null; renderSelection(); renderInventory(false); }
      locateHover = null;
      locateSession.start();
      announce(t('journey2_echo_locate') + '. ' + t('journey2_loc_select_hint'));      // the instruction is announced once
    }

    /** Leaves Locate (Escape, Close, Cancel, another tool, import, teardown): cancels the pending completion and removes the origin, the popover and the chip. `quiet` skips the announcement. */
    function exitLocate(o) {
      // the user closing the compass (focus: Close, Esc, the toolbar button) keeps the Shadowblight frame and bubble (PD-041); any other exit (another tool, Player Preview, import, a stale result) closes them
      if (!(o && o.focus)) closeSeekers({ quiet: true });
      if (!locateSession.isActive()) return false;
      locateHover = null;
      locateSession.close();                                   // onChange('closed') repaints everything
      if (!(o && o.quiet)) announce(t('journey2_loc_off'));
      if (o && o.focus && ui.echoLocate) focusTool(ui.echoLocate);
      return true;
    }

    /** The GM clicked a valid hex: one search, frozen, then the animation. The document is not touched (no history, no autosave, no fog change). */
    function chooseLocateOrigin(cellId) {
      const st = locateSession.state;
      if (!st || st.status !== 'selecting' || !doc) return;
      const out = Locate.locateSoulEcho({ doc: doc, ctx: data.ctx, originCellId: cellId, random: locateRandom });
      if (!out.ok) {
        if (out.reason === 'no-echo') { exitLocate({ quiet: true }); hint(t('journey2_loc_none_remain')); if (ui.echoLocate) focusTool(ui.echoLocate); }
        return;                                                // a 'bad-origin' hex is never offered, so it is ignored
      }
      locateHover = null;
      locateSession.select(out, echoSig());
    }

    function chooseLocateAgain() {
      if (!locateSession.isActive()) return;
      locateHover = null;
      locateSession.chooseAnother();
      announce(t('journey2_loc_select_hint'));
      if (ui.viewport) ui.viewport.focus({ preventScroll: true });
    }

    /** After a document change (dispatch, Undo, Redo): a result computed from a different Echo set is stale; no Echo left (or none available) ends the tool. */
    function syncLocate() {
      const st = locateSession.state;
      if (!st || !doc) return;
      let note = '';
      if (!doc.soulEchoes.anchorIds.length) note = t('journey2_loc_none_distributed');
      else if (st.status === 'selecting') { if (!Model.availableEchoIds(doc).length) note = t('journey2_loc_none_remain'); }
      else if (st.sig !== echoSig()) note = t('journey2_loc_stale');
      if (!note) return;
      exitLocate({ quiet: true });
      locateNote = note;
      announce(note);
    }

    /** Session transitions drive every repaint; nothing here reads a timer, so a late callback can never write into a closed popover. */
    function onLocateChange(state, ev) {
      if (inst.disposed || !ui.locate) return;
      if (ev === 'selecting' || ev === 'closed') locateHover = null;
      if (ev === 'selecting') closeSeekers({ quiet: true });          // a new location replaces the control
      if (ev === 'animating' && state && state.originCellId) openSeekers(state.originCellId);   // PD-041: the party's hex also gets the Shadowblight control
      paintLocate(); renderLocatePanel(); updateEchoUi();
      if (ev === 'animating' || ev === 'result') positionLocate();
      if (ev === 'result' && !ui.locate.hidden) ui.locate.focus({ preventScroll: true });   // focus enters the popover once its content is ready
    }

    function updateLocateHover(e) {
      const cell = fogCellFromEvent(e);
      const next = cell && foggable.has(Geo.cellId(cell.q, cell.r)) ? cell : null;
      if ((next && locateHover && next.q === locateHover.q && next.r === locateHover.r) || (!next && !locateHover)) return;
      locateHover = next;
      paintLocate();
    }

    /** The hover hex while choosing (dashed outline + compass star: shape, not colour) and the origin hex of a search (solid outline + star; "here" adds a pulse). */
    function paintLocate() {
      const g = ui.g && ui.g.locate;
      if (!g) return;
      const st = locateSession.state;
      if (!st || previewMode || !data) { g.innerHTML = ''; return; }
      const star = (q, r) => {
        const c = data.grid.cellCenter(q, r), k = data.grid.shortDimensionPx * 0.3, m = k * 0.28, x = c[0], y = c[1];
        return '<path class="j2-loc-star" d="M' + fmt(x, 1) + ' ' + fmt(y - k, 1) + 'L' + fmt(x + m, 1) + ' ' + fmt(y - m, 1) + 'L' + fmt(x + k, 1) + ' ' + fmt(y, 1) + 'L' + fmt(x + m, 1) + ' ' + fmt(y + m, 1) +
          'L' + fmt(x, 1) + ' ' + fmt(y + k, 1) + 'L' + fmt(x - m, 1) + ' ' + fmt(y + m, 1) + 'L' + fmt(x - k, 1) + ' ' + fmt(y, 1) + 'L' + fmt(x - m, 1) + ' ' + fmt(y - m, 1) + 'Z"/>';
      };
      let h = '';
      if (st.status === 'selecting' && locateHover) h = '<path class="j2-loc-hover" d="' + hexPath(locateHover.q, locateHover.r) + '"/>' + star(locateHover.q, locateHover.r);
      else if (st.status !== 'selecting' && st.originCellId) {
        const c = Geo.parseCellId(st.originCellId);
        if (c) h = '<path class="j2-loc-origin' + (st.resultType === 'here' && st.status === 'result' ? ' is-here' : '') + '" d="' + hexPath(c.q, c.r) + '"/>' + star(c.q, c.r);
      }
      g.innerHTML = h;
    }

    /** The party's hex in map-area px (centre + half width) for the popover's caret, or null when it is off screen. */
    function locateAnchor(view) {
      const st = locateSession.state, c = st && st.originCellId ? Geo.parseCellId(st.originCellId) : null;
      if (!c) return null;
      const ctr = data.grid.cellCenter(c.q, c.r);
      const vp = ui.viewport.getBoundingClientRect(), wrap = ui.mapwrap.getBoundingClientRect();
      const s = Geo.worldToScreen(cam, ctr[0], ctr[1]);
      const x = vp.left - wrap.left + s[0], y = vp.top - wrap.top + s[1];
      if (x < 0 || y < 0 || x > view.w || y > view.h) return null;
      const xs = data.grid.cellCorners(c.q, c.r).map(p => p[0]);
      return { x: x, y: y, r: (Math.max.apply(null, xs) - Math.min.apply(null, xs)) / 2 * cam.scale };
    }

    function positionLocate() {
      if (!ui.locate || ui.locate.hidden || !data || !locateSession.state) return;
      positionPanel(ui.locate, locateAnchor);
    }

    /** Starts the needle: one CSS transition from the start angle to the frozen final angle (>= 720 + bearing; direct with reduced motion). */
    function startNeedle(plan) {
      const nd = ui.l.needle;
      nd.style.transition = 'none';
      nd.style.transform = 'rotate(' + plan.startAngle + 'deg)';
      void nd.getBoundingClientRect();                         // commit the start angle so the transition really runs from it
      nd.style.transition = 'transform ' + plan.durationMs + 'ms cubic-bezier(0.2, 0.9, 0.25, 1.012)';
      nd.style.transform = 'rotate(' + plan.finalAngle + 'deg)';
      nd.setAttribute('data-final-angle', String(Math.round(plan.finalAngle * 100) / 100));
      ui.locate.style.setProperty('--j2-loc-dur', plan.durationMs + 'ms');
    }

    function hideLocatePopover() {
      if (!ui.locate || ui.locate.hidden) { locateNeedleStarted = false; return; }
      const had = ui.locate.contains(document.activeElement);
      ui.locate.hidden = true; ui.locate.style.transform = '';
      ui.locate.removeAttribute('data-state'); ui.locate.removeAttribute('data-kind'); ui.locate.classList.remove('is-done');
      ui.l.line.textContent = ''; ui.l.dir.textContent = ''; ui.l.dir.hidden = true; ui.l.note.textContent = '';
      ui.l.needle.style.transition = 'none'; ui.l.needle.style.transform = ''; ui.l.needle.removeAttribute('data-final-angle');
      locateNeedleStarted = false;
      if (had && ui.echoLocate) focusTool(ui.echoLocate);   // closing returns focus to the toolbar button
    }

    /** Paints the selection chip, the cursor and the compass popover from the session state. The direction text exists only once the result has settled. */
    function renderLocatePanel() {
      if (!ui.locate || !doc) return;
      const st = locateSession.state, L = ui.l;
      const selecting = !!st && st.status === 'selecting' && !previewMode;
      ui.locateChip.hidden = !selecting;
      ui.viewport.classList.toggle('is-locating', selecting);
      ui.root.setAttribute('data-locate', st && !previewMode ? st.status : '');
      if (!st || st.status === 'selecting' || previewMode) { hideLocatePopover(); return; }
      ui.locate.hidden = false;
      ui.locate.setAttribute('data-state', st.status);
      ui.locate.setAttribute('data-kind', st.resultType);
      for (const k of ['n', 'e', 's', 'w']) L['c' + k].textContent = t('journey2_loc_dir_' + k + '_abbr');
      if (!locateNeedleStarted) { locateNeedleStarted = true; startNeedle(st.plan); }
      const done = st.status === 'result';
      ui.locate.classList.toggle('is-done', done);
      L.searching.hidden = done;
      if (!done) { L.line.textContent = ''; L.dir.textContent = ''; L.dir.hidden = true; L.note.textContent = ''; return; }
      if (st.resultType === 'here') { L.line.textContent = t('journey2_loc_here'); L.dir.textContent = ''; L.dir.hidden = true; }
      else {
        const d = Locate.SIXTEEN_DIRECTIONS[st.directionIndex];
        L.line.textContent = fill('journey2_loc_points', { direction: t(d.labelKey).toLocaleLowerCase(lang) });
        L.dir.textContent = t(d.abbrKey) + ' · ' + t(d.labelKey);
        L.dir.hidden = false;
      }
      L.note.innerHTML = '<strong>' + esc(t('journey2_loc_reminder_label')) + '</strong> ' + esc(t('journey2_loc_reminder'));
    }

    /** One Undo entry: mark the open sanctuary's Echo Collected, or restore it. The overlay stays open, keeps its scroll position and the camera is untouched. */
    function toggleEchoCollected() {
      if (inst.disposed || editLocked || previewMode || !doc || !sanctuaryOpen || !sanctuaryHasEcho(sanctuaryOpen)) return;
      const collect = !Model.isEchoCollected(doc, sanctuaryOpen);
      const r = dispatch({ type: 'setSoulEchoCollected', anchorId: sanctuaryOpen, collected: collect }, collect ? 'echoCollect' : 'echoRestore', true);
      if (!r.ok) { hint(t('journey2_echo_failed')); return; }
      announce(t(collect ? 'journey2_live_echo_collected' : 'journey2_live_echo_restored'));
    }

    /** Read-only snapshot for the browser checks (the frozen target is exposed here for verification only; no UI shows it). */
    function locateDebug() {
      const st = locateSession.state;
      return st ? { status: st.status, originCellId: st.originCellId, targetAnchorId: st.targetAnchorId, bearing: st.bearing, directionIndex: st.directionIndex, resultType: st.resultType, hover: locateHover ? Geo.cellId(locateHover.q, locateHover.r) : null, needle: ui.l && ui.l.needle ? ui.l.needle.getAttribute('data-final-angle') : null } : null;
    }

    /* ============================================================
       Shadowblight control (PD-041): GM-only, opened by a Locate result. The party's hex gets a red dashed frame and a small bubble under it,
       [-] N [+] [x]: each "+" moves the nearest block(s) of Shadowblight X's one hex closer to that hex (pure js/journey2-shadow-marks.js), "-" takes
       the step back. The plan is computed once, when the bubble opens, from the document as it is then; N is the step within it. Unlike the
       compass, what it does is MAP state: every step is the `setShadowMarks` command, one session is ONE Undo entry (Undo returns to step 0
       and closes the bubble), and closing the bubble (x) leaves the X's where they are. Nothing happens, and nothing shows, when the map holds
       no X and no unreleased skull. Any other document change, leaving Locate, Player Preview, import or teardown closes it.
       ============================================================ */

    /** Opens the control for the Locate result's hex; does nothing (no UI) when there is nothing to move. */
    function openSeekers(originCellId) {
      closeSeekers({ quiet: true });
      if (inst.disposed || previewMode || !doc || !data) return;
      const plan = Seekers.createSeekerPlan({ doc: doc, ctx: data.ctx, origin: originCellId });
      if (!plan) return;
      seekers = { origin: originCellId, plan: plan, step: 0, baseDoc: doc, doc: doc, entry: null };
      renderSeekers();
    }

    function closeSeekers(o) {
      if (!seekers) return;
      const had = ui.seek && ui.seek.contains(document.activeElement);
      seekers = null;
      renderSeekers();
      if (had && locateSession.isActive() && ui.locate && !ui.locate.hidden) ui.locate.focus({ preventScroll: true });
      if (!(o && o.quiet) && !inst.disposed) announce(t('journey2_seek_close'));
    }

    /** One press: move to step `target` of the plan (clamped), as one coalesced history entry. */
    function stepSeekers(delta) {
      if (inst.disposed || editLocked || previewMode || !seekers || !doc) return;
      const s = seekers, target = Math.max(0, Math.min(s.plan.maxStep, s.step + delta));
      if (target === s.step) return;
      let next;
      if (target === 0) next = s.baseDoc;
      else {
        const f = s.plan.frames[target];
        const r = Model.apply(s.baseDoc, { type: 'setShadowMarks', added: f.added, suppressed: f.suppressed, at: new Date().toISOString() }, data.ctx);
        if (!r.ok) { hint(t('journey2_seek_settled')); return; }
        next = r.doc;
      }
      const top = history.undo[history.undo.length - 1];
      if (target === 0) { if (s.entry && top === s.entry) history.undo.pop(); s.entry = null; }
      else if (s.entry && top === s.entry) s.entry.after = next;
      else { Model.historyCommit(history, s.baseDoc, next, 'seekers'); s.entry = history.undo[history.undo.length - 1]; }
      s.step = target; s.doc = next; doc = next;
      afterDocChange();
      renderSeekers();
      announce(fill('journey2_live_seek', { n: n(target), max: n(s.plan.maxStep) }));
    }

    /** After a document change from anywhere else (an edit, Undo, Redo, import): the plan belongs to a document that is gone, so the control closes. */
    function syncSeekers() {
      if (seekers && (!doc || doc !== seekers.doc)) { seekers = null; renderSeekers(); }
    }

    /** The red dashed frame on the party's hex and the bubble under it. */
    function renderSeekers() {
      const g = ui.g && ui.g.seekers;
      if (!g || !ui.seek) return;
      const s = seekers, active = !!s && !previewMode && !!data;
      ui.seek.hidden = !active;
      if (!active) { g.innerHTML = ''; return; }
      const c = Geo.parseCellId(s.origin);
      g.innerHTML = c ? '<path class="j2-seek-frame" d="' + hexPath(c.q, c.r) + '"/>' : '';
      ui.seekCount.textContent = n(s.step);
      ui.seekCount.setAttribute('title', fill('journey2_seek_count', { n: n(s.step), max: n(s.plan.maxStep) }));
      ui.seekCount.setAttribute('aria-label', fill('journey2_seek_count', { n: n(s.step), max: n(s.plan.maxStep) }));
      ui.seekLess.disabled = editLocked || s.step <= 0;
      ui.seekMore.disabled = editLocked || s.step >= s.plan.maxStep;
      ui.seekMore.title = s.plan.maxStep === 0 || s.step >= s.plan.maxStep ? t('journey2_seek_settled') : t('journey2_seek_more');
      positionSeekers();
    }

    /** The bubble sits just under the party's hex, centred on it (screen px inside the map area), kept on screen. */
    function positionSeekers() {
      if (!seekers || !ui.seek || ui.seek.hidden || !data) return;
      const c = Geo.parseCellId(seekers.origin);
      if (!c) return;
      const wrap = ui.mapwrap.getBoundingClientRect(), vp = ui.viewport.getBoundingClientRect();
      const ys = data.grid.cellCorners(c.q, c.r).map(p => p[1]), ctr = data.grid.cellCenter(c.q, c.r);
      const s = Geo.worldToScreen(cam, ctr[0], Math.max.apply(null, ys)), w = ui.seek.offsetWidth, h = ui.seek.offsetHeight;
      let x = vp.left - wrap.left + s[0], y = vp.top - wrap.top + s[1] + 8;               // the bubble's top-centre sits 8 px under the hex
      x = Math.min(wrap.width - w / 2 - 8, Math.max(w / 2 + 8, x)); y = Math.min(wrap.height - h - 8, Math.max(8, y));
      ui.seek.style.transform = 'translate(' + Math.round(x - w / 2) + 'px,' + Math.round(y) + 'px)';
    }

    /** Read-only snapshot for the browser checks. */
    function seekersDebug() {
      return seekers ? { origin: seekers.origin, step: seekers.step, maxStep: seekers.plan.maxStep, movers: seekers.plan.movers } : null;
    }

    /* ============================================================
       Route Planner (PD-031): GM-only. "Plan route" -> A -> B -> two routes drawn side by side on the map, each with a bubble above it showing its hex
       count and travel days, like a navigator: Fastest (default; minimum Terrain Ratings entered) and Shortest (minimum hexes), computed by the pure
       js/journey2-route.js (A* over the six-neighbour grid; the cost belongs to the hex entered). Clicking a bubble selects that route; clicking the
       selected bubble opens its details. Terrain Ratings come only from generated tiles (plus 0 for sanctuary / Marrogate / Horizon hexes) and are never
       invented: an unknown hex blocks Fastest, and Shortest then reports travel days as unknown. Everything here is transient: never in the document,
       history, autosave, backup or storage, never in Player Preview, the projection or a print. Fog of War is neither read nor changed.
       ============================================================ */

    const ROUTE_LABEL = { fastest: 'journey2_route_fastest', shortest: 'journey2_route_shortest' };
    const ROUTE_GAP_PX = 6;                                 // centre-to-centre distance of the two parallel lines, in screen px

    /** Cells of fully overtaken regions: impassable to the Route Planner. */
    function blockedCells(d) {
      const over = new Set(d.batches.filter(b => b.habitat.overtaken).map(b => b.id));
      return new Set(d.tiles.filter(tl => over.has(tl.batchId)).map(tl => tl.cell));
    }

    /** Terrain Ratings by cell for the current document (rebuilt only when the document object changes). */
    function routeIndex() {
      if (routeTerrain.doc !== doc) routeTerrain = { doc: doc, index: Route.buildTerrainIndex(doc), blocked: blockedCells(doc) };
      return routeTerrain.index;
    }

    /** Both strategies for one A -> B on the calibrated grid; the canonical routeable test is the editor's `foggable` set (valid, non-decorative). */
    function planRoutesFor(a, b) {
      const idx = routeIndex(), grid = data.grid;
      return Route.planRoutes({
        startCell: a, goalCell: b,
        isRouteableCell: id => foggable.has(id),
        isBlockedCell: id => routeTerrain.blocked.has(id),   // a fully overtaken region cannot be crossed
        getNeighbors: id => { const c = Geo.parseCellId(id); return grid.neighbors(c.q, c.r).filter(x => x.valid).map(x => x.id); },
        getTerrainRating: id => (idx.has(id) ? idx.get(id) : (data.ctx.sanctuaryCells.has(id) ? 0 : null)),   // a sanctuary / Marrogate / Horizon hex is a known, free settlement
        hasZeroCostCells: data.ctx.sanctuaryCells.size > 0,
      });
    }

    /** True while the planner is choosing A or B (it then owns the map; in the result the map behaves normally). */
    function routeSelecting() { const st = routePlanner.state; return !!st && st.status !== 'result' && !previewMode; }

    /** The cell a map point selects: a sanctuary icon selects its own hex, anything else the hex under the point (null when it is not routeable). */
    function routeCellAt(sx, sy) {
      const w = Geo.screenToWorld(cam, sx, sy);
      for (const s of data.ctx.sanctuaries) {
        const r = s.rect;
        if (s.cellId && foggable.has(s.cellId) && w[0] >= r[0] && w[0] <= r[0] + r[2] && w[1] >= r[1] && w[1] <= r[1] + r[3]) return s.cellId;
      }
      const c = data.grid.worldToCell(w[0], w[1]), id = Geo.cellId(c.q, c.r);
      return foggable.has(id) ? id : null;
    }

    /** Enters the transient tool: everything that could compete for the map is cancelled first; pan, zoom, the sidebar and Fog of War are untouched. */
    function startRoute() {
      if (inst.disposed || previewMode || editLocked || !doc || !data) return;
      if (routePlanner.isActive()) { exitRoute({ focus: true }); return; }
      cancelTransient(); cancelFogStroke(); setFogTool(null, { quiet: true });
      exitLocate({ quiet: true });
      closeMenus(); hideEnvTip(); clearHint();
      if (diagOpen) setDiagnostics(false);
      closeInspector({ quiet: true }); closeSanctuary({ quiet: true });
      if (sel.tileId) { sel.tileId = null; renderSelection(); renderInventory(false); }
      routeHover = null;
      routePlanner.start();
      announce(t('journey2_route_plan') + '. ' + t('journey2_route_select_start'));      // the instruction is announced once
    }

    /** Leaves the planner (Escape, the toolbar button, another tool, Player Preview, import, teardown). `quiet` skips the announcement. */
    function exitRoute(o) {
      if (!routePlanner.isActive()) return false;
      routeHover = null;
      routePlanner.close();                                   // onChange('closed') repaints everything
      if (!(o && o.quiet)) announce(t('journey2_route_off'));
      if (o && o.focus && ui.routePlan) focusTool(ui.routePlan);
      return true;
    }

    /** Escape: open details close first; choosing B goes back to choosing A; choosing A or viewing a route closes the planner. Returns true when it consumed the key. */
    function routeEscape() {
      const st = routePlanner.state;
      if (!st) return false;
      if (st.status === 'result' && routeDetails) { routeDetails = false; renderRoute(); return true; }
      if (st.status === 'select-end') { routePlanner.chooseNewStart(); announce(t('journey2_route_select_start')); return true; }
      exitRoute({ focus: true });
      return true;
    }

    /** After a document change (dispatch, Undo, Redo, import): an open result is recomputed from the current tiles, never kept stale. Never opens the planner. */
    function syncRoute() { if (routePlanner.state && routePlanner.state.status === 'result') routePlanner.recompute(); }

    function onRouteChange(state, ev) {
      if (inst.disposed || !ui.route) return;
      if (ev === 'select-start' || ev === 'select-end' || ev === 'closed') { routeHover = null; routeDetails = false; }
      renderRoute();
    }

    function updateRouteHover(e) {
      const [x, y] = localPoint(e);
      const next = insideViewport(e) ? routeCellAt(x, y) : null;
      const cur = routeHover ? Geo.cellId(routeHover.q, routeHover.r) : null;
      if (next === cur) return;
      routeHover = next ? Geo.parseCellId(next) : null;
      paintRoute();
    }

    /** Shortest adds nothing when it is exactly the Fastest route: one line, one bubble. */
    function routeShortestRedundant(routes) { return Route.sameRoute(routes.fastest, routes.shortest); }

    /** The strategies that get a line and a bubble, in drawing order (Fastest first). */
    function routeShownList(routes) {
      const out = [];
      if (routes.fastest.status === 'ok') out.push('fastest');
      if (routes.shortest.status === 'ok' && !routeShortestRedundant(routes)) out.push('shortest');
      return out;
    }

    /** The selected route: the preferred strategy, or Shortest when Fastest has no complete route. { st, eff, route, shown } or null outside the result. */
    function routeView() {
      const st = routePlanner.state;
      if (!st || st.status !== 'result' || !st.routes || previewMode) return null;
      let eff = Route.effectiveStrategy(st.routes, st.strategy);
      if (eff === 'shortest' && routeShortestRedundant(st.routes)) eff = 'fastest';   // no separate bubble: it is the Fastest route
      return { st: st, eff: eff, route: st.routes[eff], shown: routeShownList(st.routes) };
    }

    /** Toolbar, chip, cursor, map layers, bubbles and details from the planner state. */
    function renderRoute() {
      if (!ui.route || !doc || !data) return;
      const st = routePlanner.state, active = !!st && !previewMode, selecting = routeSelecting();
      if (ui.routePlan) { ui.routePlan.disabled = editLocked; ui.routePlan.setAttribute('aria-pressed', String(active)); }
      ui.routeChip.hidden = !selecting;
      if (selecting) ui.routeChipText.textContent = t(st.status === 'select-start' ? 'journey2_route_select_start' : 'journey2_route_select_end');
      ui.viewport.classList.toggle('is-routing', selecting);
      ui.root.setAttribute('data-route', active ? st.status : '');
      paintRoute();
      renderRouteBubbles();
      renderRoutePanel();
      positionRouteBubbles();
    }

    const routeCenter = id => { const c = Geo.parseCellId(id), p = data.grid.cellCenter(c.q, c.r); return [p[0], p[1]]; };

    /** A / B pin: a ring with its letter (B has a second ring, so the two differ by shape and text, not only by colour). */
    function routePin(id, letter, ghost) {
      const p = routeCenter(id);
      return '<g transform="translate(' + fmt(p[0], 1) + ' ' + fmt(p[1], 1) + ')"><g class="j2-route-pin-g is-' + letter.toLowerCase() + (ghost ? ' is-ghost' : '') + '">' +
        (letter === 'B' ? '<circle class="j2-route-pin-ring2" r="15"/>' : '') + '<circle class="j2-route-pin-ring" r="11"/><text class="j2-route-pin-t" text-anchor="middle" dy="0.35em">' + letter + '</text></g></g>';
    }

    /**
     * One route as a line through its hex centres, shifted sideways by `d` world px (so two routes run side by side like lines on a transit map),
     * mitred at the corners. Known steps are solid, steps entering an unknown-terrain hex dashed; the selected route also gets white chevrons.
     * Returns { svg, point(f) } where point(f) is the position at fraction f of the (shifted) line, the anchor of its bubble.
     */
    function routeLine(r, strategy, d, selected) {
      const pts = r.cells.map(routeCenter), m = pts.length - 1, nrm = [];
      for (let i = 0; i < m; i++) { const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], L = Math.hypot(dx, dy) || 1; nrm.push([-dy / L, dx / L]); }
      const v = pts.map((p, i) => {
        if (!d) return p;
        let nx, ny, k = 1;
        if (i === 0) { nx = nrm[0][0]; ny = nrm[0][1]; }
        else if (i === m) { nx = nrm[m - 1][0]; ny = nrm[m - 1][1]; }
        else {
          const sx = nrm[i - 1][0] + nrm[i][0], sy = nrm[i - 1][1] + nrm[i][1], L = Math.hypot(sx, sy);
          if (L < 1e-6) { nx = nrm[i][0]; ny = nrm[i][1]; } else { nx = sx / L; ny = sy / L; k = 1 / Math.max(0.4, nx * nrm[i][0] + ny * nrm[i][1]); }
        }
        return [p[0] + nx * d * k, p[1] + ny * d * k];
      });
      let solid = '', dashed = '', chev = '';
      const cum = [0];
      for (let i = 0; i < m; i++) {
        const a = v[i], b = v[i + 1], seg = 'M' + fmt(a[0], 1) + ' ' + fmt(a[1], 1) + 'L' + fmt(b[0], 1) + ' ' + fmt(b[1], 1);
        if (r.segmentKnown[i]) solid += seg; else dashed += seg;
        cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
        if (selected) chev += '<g transform="translate(' + fmt((a[0] + b[0]) / 2, 1) + ' ' + fmt((a[1] + b[1]) / 2, 1) + ') rotate(' + fmt(Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, 1) + ')"><path class="j2-route-chev" d="M-2.2 -2.6 2 0-2.2 2.6"/></g>';
      }
      const total = cum[m];
      const point = f => {
        const at = total * f;
        let i = 0; while (i < m - 1 && cum[i + 1] < at) i++;
        const seg = cum[i + 1] - cum[i] || 1, u = Math.min(1, Math.max(0, (at - cum[i]) / seg));
        return [v[i][0] + (v[i + 1][0] - v[i][0]) * u, v[i][1] + (v[i + 1][1] - v[i][1]) * u];
      };
      const svg = '<g class="j2-route-line is-' + strategy + (selected ? ' is-selected' : '') + '" data-strategy="' + strategy + '"><path class="j2-route-halo" d="' + solid + dashed + '"/>' +
        (solid ? '<path class="j2-route-solid" d="' + solid + '"/>' : '') + (dashed ? '<path class="j2-route-dashed" d="' + dashed + '"/>' : '') + chev + '</g>';
      return { svg: svg, point: point };
    }

    /** The route lines (the selected one on top), then the A / B pins and the hover hex. Also records where each route's bubble is anchored. */
    function paintRoute() {
      const gl = ui.g && ui.g.routeline, gm = ui.g && ui.g.routemark;
      if (!gl || !gm) return;
      const st = routePlanner.state;
      routeBubbleSpecs = [];
      if (!st || previewMode || !data) { if (routeDrawn.line) gl.innerHTML = ''; if (routeDrawn.mark) gm.innerHTML = ''; routeDrawn = { line: '', mark: '' }; return; }
      let line = '', mark = '';
      const v = routeView();
      if (v) {
        const n = v.shown.length, order = v.shown.filter(s => s !== v.eff).concat(v.shown.indexOf(v.eff) >= 0 ? [v.eff] : []);
        for (const s of order) {
          const r = v.st.routes[s], idx = v.shown.indexOf(s);
          if (r.cells.length < 2) continue;
          const L = routeLine(r, s, (idx - (n - 1) / 2) * ROUTE_GAP_PX / cam.scale, s === v.eff), p = L.point(0.5 + (idx - (n - 1) / 2) * 0.25);
          line += L.svg; routeBubbleSpecs.push({ s: s, x: p[0], y: p[1] });
        }
      }
      const hoverId = routeHover ? Geo.cellId(routeHover.q, routeHover.r) : null;
      if (st.status === 'select-start' && routeHover) mark = '<path class="j2-route-hover" d="' + hexPath(routeHover.q, routeHover.r) + '"/>' + routePin(hoverId, 'A', true);
      else if (st.status === 'select-end') {
        mark = routePin(st.startCell, 'A');
        if (routeHover) mark += '<path class="j2-route-hover" d="' + hexPath(routeHover.q, routeHover.r) + '"/>' + routePin(hoverId, 'B', true);
      } else if (st.status === 'result') {
        mark = routePin(st.startCell, 'A') + (st.endCell !== st.startCell ? routePin(st.endCell, 'B') : '');
      }
      if (line !== routeDrawn.line) { gl.innerHTML = line; routeDrawn.line = line; }
      if (mark !== routeDrawn.mark) { gm.innerHTML = mark; routeDrawn.mark = mark; }
    }

    /** The bubble text of one route: label + "12 hexes · 15 days" (or "days unknown" while any entered hex has no terrain). */
    function routeBubbleText(v, s) {
      const r = v.st.routes[s], merged = s === 'fastest' && !routeShownList(v.st.routes).includes('shortest') && routeShortestRedundant(v.st.routes);
      const label = t(merged ? 'journey2_route_both' : ROUTE_LABEL[s]);
      const dist = routeDistanceText(r.stats.hexes);
      const stats = r.stats.complete ? fill('journey2_route_bub_stats', { hexes: n(r.stats.hexes), dist: dist, days: n(r.stats.travelDays) }) : fill('journey2_route_bub_unknown', { hexes: n(r.stats.hexes), dist: dist });
      return { label: label, stats: stats };
    }

    /** One persistent button per drawn route (so focus survives a re-render): a click selects the route, a click on the selected one toggles its details. */
    function renderRouteBubbles() {
      const host = ui.routeBubbles;
      if (!host) return;
      const v = routeView(), keep = new Set();
      if (v) {
        for (const spec of routeBubbleSpecs) {
          keep.add(spec.s);
          let b = host.querySelector('[data-j2-route-strategy="' + spec.s + '"]');
          if (!b) {
            b = document.createElement('button');
            b.type = 'button'; b.className = 'j2-route-bub'; b.setAttribute('data-j2-route-strategy', spec.s);
            b.innerHTML = '<span class="j2-route-bub-k"></span><span class="j2-route-bub-v"></span>';
            host.appendChild(b);
          }
          const tx = routeBubbleText(v, spec.s), sel = spec.s === v.eff;
          b.querySelector('.j2-route-bub-k').textContent = tx.label;
          b.querySelector('.j2-route-bub-v').textContent = tx.stats;
          b.classList.toggle('is-selected', sel);
          b.setAttribute('aria-pressed', String(sel));
          if (sel) b.setAttribute('aria-expanded', String(routeDetails)); else b.removeAttribute('aria-expanded');
          b.setAttribute('aria-label', tx.label + ': ' + tx.stats);
          b.title = t('journey2_route_bub_hint');
        }
      }
      for (const b of Array.from(host.children)) if (!keep.has(b.getAttribute('data-j2-route-strategy'))) b.remove();
    }

    /** Puts every bubble above its anchor (screen px inside the map area), keeps it on screen like a navigator does, and nudges overlapping ones apart. */
    function positionRouteBubbles() {
      const host = ui.routeBubbles;
      if (!host || !host.firstChild || !data) return;
      const wrap = ui.mapwrap.getBoundingClientRect(), vp = ui.viewport.getBoundingClientRect();
      const W = wrap.width, H = wrap.height, placed = [];
      for (const spec of routeBubbleSpecs) {
        const b = host.querySelector('[data-j2-route-strategy="' + spec.s + '"]');
        if (!b) continue;
        const s = Geo.worldToScreen(cam, spec.x, spec.y), w = b.offsetWidth, h = b.offsetHeight;
        let x = vp.left - wrap.left + s[0], y = vp.top - wrap.top + s[1] - 12;           // the bubble's bottom-centre sits 12 px above the line
        x = Math.min(W - w / 2 - 8, Math.max(w / 2 + 8, x)); y = Math.min(H - 12, Math.max(h + 8, y));
        for (const q of placed) if (Math.abs(x - q.x) < (w + q.w) / 2 + 4 && Math.abs(y - q.y) < (h + q.h) / 2 + 4) y = q.y + h + 6;
        placed.push({ x: x, y: y, w: w, h: h });
        b.style.transform = 'translate(' + Math.round(x - w / 2) + 'px,' + Math.round(y - h) + 'px)';
      }
    }

    function hideRoutePanel() {
      if (!ui.route || ui.route.hidden) return;
      ui.route.hidden = true;
      ui.r.sub.textContent = ''; ui.r.body.innerHTML = ''; ui.r.cmp.innerHTML = ''; ui.r.cmp.hidden = true;
    }

    const dotsHtml = k => '<span class="j2-dots" aria-hidden="true">' + [1, 2, 3, 4].map(i => '<i' + (i <= k ? ' class="on"' : '') + '></i>').join('') + '</span>';

    /** The summary: hex count, travel days, expected encounter triggers (an estimate), the terrain breakdown and any unknown-terrain notice. */
    function routeStatsHtml(route) {
      const s = route.stats;
      let nf2; try { nf2 = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 2 }); } catch (err) { nf2 = new Intl.NumberFormat('en', { minimumFractionDigits: 1, maximumFractionDigits: 2 }); }
      const unknown = '<span class="j2-route-unk">' + esc(t('journey2_route_unknown')) + '</span>';
      let h = '';
      if (route.cells.length === 1) h += '<p class="j2-route-note">' + esc(t('journey2_route_same')) + '</p>';
      h += '<dl class="j2-route-stats">' +
        '<div><dt>' + esc(t('journey2_route_hexes')) + '</dt><dd>' + n(s.hexes) + '</dd></div>' +
        '<div><dt>' + esc(t('journey2_route_days')) + '</dt><dd>' + (s.complete ? n(s.travelDays) : unknown) + '</dd></div>' +
        '<div><dt>' + esc(t('journey2_route_expected')) + '</dt><dd>' + (s.complete ? nf2.format(s.expectedEncounters) : unknown) + '</dd></div></dl>';
      if (!s.complete) {
        h += '<p class="j2-route-warn"><strong>' + esc(t('journey2_route_time_unknown')) + '.</strong> ' + esc(t('journey2_route_enc_unknown')) + '. ' +
          esc(s.unknownHexes === 1 ? t('journey2_route_unknown_one') : fill('journey2_route_unknown_n', { n: n(s.unknownHexes) })) + '</p>' +
          '<p class="j2-route-note">' + esc(t('journey2_route_known_terrain')) + ': ' + n(s.knownHexes) + ' · ' + esc(t('journey2_route_unknown_terrain')) + ': ' + n(s.unknownHexes) +
          (s.knownHexes ? '<br>' + esc(fill('journey2_route_known_days', { n: n(s.knownDays) })) : '') + '</p>';
      }
      const rows = [0, 1, 2, 3, 4].filter(r => s.terrainCounts[r] > 0);
      if (rows.length) {
        h += '<h4 class="j2-route-h">' + esc(t('journey2_route_terrain')) + '</h4><ul class="j2-route-terrain">' + rows.map(r => {
          const c = s.terrainCounts[r], text = fill(c === 1 ? 'journey2_route_terrain_row_one' : 'journey2_route_terrain_row_n', { t: n(r), n: n(c) });
          if (r === 0) return '<li><span class="j2-route-settle" aria-hidden="true">' + esc(t('journey2_route_settlement')) + '</span><span class="j2-route-count" aria-hidden="true">' + n(c) + '</span><span class="sr-only">' + esc(t('journey2_route_settlement') + ': ' + n(c)) + '</span></li>';
          return '<li>' + dotsHtml(r) + '<span class="j2-route-count" aria-hidden="true">' + n(c) + '</span><span class="sr-only">' + esc(text) + '</span></li>';
        }).join('') + '</ul>';
      }
      return h;
    }

    /** Fastest vs Shortest, shown only when they differ and both are fully known. */
    function routeCompareHtml(routes) {
      const f = routes.fastest, s = routes.shortest;
      if (!f || !s || f.status !== 'ok' || s.status !== 'ok' || !f.stats.complete || !s.stats.complete || Route.sameRoute(f, s)) return '';
      const line = (key, r) => '<li>' + esc(fill('journey2_route_compare_line', { label: t(key), hexes: n(r.stats.hexes), days: n(r.stats.travelDays) })) + '</li>';
      const dh = f.stats.hexes - s.stats.hexes, dd = s.stats.travelDays - f.stats.travelDays;
      return '<ul class="j2-route-cmp-list">' + line('journey2_route_fastest', f) + line('journey2_route_shortest', s) + '</ul>' +
        (dh > 0 && dd > 0 ? '<p class="j2-route-note">' + esc(fill('journey2_route_compare_hint', { h: n(dh), d: n(dd) })) + '</p>' : '');
    }

    /** The details of the selected route. Opened by clicking its bubble; shown on its own when there is nothing to draw (same hex, no route). */
    function renderRoutePanel() {
      const v = routeView();
      const nothing = !!v && !v.shown.some(s => v.st.routes[s].cells.length > 1);
      if (!v || !(routeDetails || nothing)) { hideRoutePanel(); return; }
      const R = ui.r, routes = v.st.routes;
      ui.route.hidden = false;
      const tx = v.shown.indexOf(v.eff) >= 0 ? routeBubbleText(v, v.eff).label : t(ROUTE_LABEL[v.eff]);
      R.sub.textContent = tx + ' · A → B';
      let body = '';
      if (v.route.status === 'ok') {
        if (routes.fastest.status !== 'ok' && routes.fastest.reason === 'unknown-terrain') body += '<p class="j2-route-warn">' + esc(t('journey2_route_no_terrain')) + ' ' + esc(t('journey2_route_no_terrain_short')) + '</p>';
        body += routeStatsHtml(v.route);
      } else {
        body += '<p class="j2-route-warn">' + esc(t(v.route.reason === 'unknown-terrain' ? 'journey2_route_no_terrain' : v.route.reason === 'impassable' ? 'journey2_route_impassable' : 'journey2_route_none')) + '</p>';
      }
      R.body.innerHTML = body;
      const cmp = routeCompareHtml(routes);
      R.cmp.innerHTML = cmp; R.cmp.hidden = !cmp;
    }

    /** A bubble was clicked: select that route, or (on the selected one) toggle its details. */
    function chooseRouteStrategy(s) {
      const v = routeView();
      if (!v) return;
      if (v.eff === s) {
        routeDetails = !routeDetails; renderRoute();
        if (!routeDetails && ui.routeBubbles) { const b = ui.routeBubbles.querySelector('[data-j2-route-strategy="' + s + '"]'); if (b) b.focus({ preventScroll: true }); }
        return;
      }
      routePlanner.setStrategy(s);
      const v2 = routeView();
      if (v2) announce(fill('journey2_route_live_result', { strategy: t(ROUTE_LABEL[v2.eff]), hexes: n(v2.route.stats.hexes) }));
    }

    function closeRouteDetails() {
      if (!routeDetails) return;
      routeDetails = false; renderRoute();
      const v = routeView(), b = v && ui.routeBubbles && ui.routeBubbles.querySelector('[data-j2-route-strategy="' + v.eff + '"]');
      if (b) b.focus({ preventScroll: true });
    }

    /** Read-only snapshot for the browser checks. */
    function routeDebug() {
      const st = routePlanner.state, v = routeView();
      if (!st) return null;
      const brief = r => (r.status === 'ok' ? { ok: true, cells: r.cells.slice(), stats: Object.assign({}, r.stats) } : { ok: false, reason: r.reason });
      return {
        status: st.status, start: st.startCell, end: st.endCell, strategy: st.strategy, shown: v ? v.eff : null, drawn: v ? v.shown.slice() : null, details: routeDetails, hover: routeHover ? Geo.cellId(routeHover.q, routeHover.r) : null,
        cells: v && v.route.status === 'ok' ? v.route.cells.slice() : null, stats: v && v.route.status === 'ok' ? Object.assign({}, v.route.stats) : null,
        routes: st.routes ? { fastest: brief(st.routes.fastest), shortest: brief(st.routes.shortest) } : null,
      };
    }

    /* ============================================================
       Sanctuaries (PD-023): GM-only generated settlements on the printed sanctuary icons. One toolbar button generates
       all of them as ONE undoable command; clicking a generated icon opens a screen-space overlay with its details,
       a Delete and a Reroll action. Like Soul Echoes the ring layer is EMPTIED in Player Preview and the player
       projection has no field for any of it, so nothing here can reach the preview or a print.
       ============================================================ */

    const SANC_PAIRS = [['drive', 'politics'], ['size', 'population']];   // short neighbouring tables shown side by side in the overlay
    const SANC_RING_R = 34;                                // world px: the ring drawn round a generated sanctuary icon

    function sanctuaryAnchorMap() {
      if (!sancAnchors) sancAnchors = new Map(data.anchorsDoc.anchors.filter(a => a.kind === 'sanctuary').map(a => [a.stableId, a]));
      return sancAnchors;
    }
    function sanctuaryEntry(id) { return id && doc ? (doc.sanctuaries.entries.find(e => e.anchorId === id) || null) : null; }
    /** The overlay opens for a sanctuary with generated characteristics OR a Soul Echo (the Echo's state belongs to the fixed anchor, not to the generated data). */
    function sanctuaryHasEcho(id) { return !!(id && doc && doc.soulEchoes.anchorIds.includes(id)); }
    function sanctuaryOpenable(id) { return !!(sanctuaryEntry(id) || sanctuaryHasEcho(id)); }
    function openableSanctuaryIds() { const ids = new Set(doc.sanctuaries.entries.map(e => e.anchorId)); for (const id of doc.soulEchoes.anchorIds) ids.add(id); return ids; }
    function sanctuaryTitle(entry) { return entry.name || t('journey2_sanc_fallback'); }
    function sanctuaryReady() { return !!(generator && generator.ready() && typeof generator.rollSanctuary === 'function'); }

    /** The ring round every generated sanctuary icon (the affordance that says "click me"); the open one is stronger. Redrawn only when the set or the open one changed. */
    function renderSanctuaryRings() {
      if (!ui.g || !ui.g.sanct || !doc) return;
      if (previewMode) { ui.g.sanct.innerHTML = ''; sancDrawn = { sanctuaries: null, open: null, names: null }; return; }
      const names = doc.playerVisibility.revealedSanctuaryNameAnchorIds;
      if (sancDrawn.sanctuaries === doc.sanctuaries && sancDrawn.open === sanctuaryOpen && sancDrawn.names === names) return;
      const at = sanctuaryAnchorMap();
      let h = '';
      for (const e of doc.sanctuaries.entries) {
        const a = at.get(e.anchorId);
        if (!a) continue;
        const pr = a.iconProtectionArea.rectPx, x = fmt(a.worldPixelAnchor[0], 1), y = fmt(pr[1] + pr[3], 1);   // a small dot at the foot of the icon
        // a name revealed to players is already lettered on the map beside the icon, so it carries no marker; only a hidden name keeps the dot
        if (Model.isSanctuaryNameRevealed(doc, e.anchorId)) continue;
        h += '<g class="j2-sanc" data-sanc="' + esc(e.anchorId) + '" data-name-visible="false"><circle class="j2-sanc-dot" cx="' + x + '" cy="' + y + '" r="3"/></g>';
      }
      ui.g.sanct.innerHTML = h;
      sancDrawn = { sanctuaries: doc.sanctuaries, open: sanctuaryOpen, names: names };
    }

    /** Toolbar state: the one button carries the sanctuary count of the printed map and is disabled while edits are locked. */
    function updateSanctuaryUi() {
      if (!ui.sancGroup || !doc || !data) return;
      ui.sancGenerateLabel.textContent = fill('journey2_sanc_generate', { n: n(data.ctx.sanctuaries.length) });
      ui.sancGenerate.disabled = editLocked;
    }

    /** Hides the overlay AND empties it: a closed panel keeps no sanctuary name or table in the DOM (Player Preview must not carry any). */
    function clearSanctuaryPanel() {
      if (!ui.sanctuary) return;
      ui.sanctuary.hidden = true; sanctuaryShown = null;
      ui.s.name.textContent = ''; ui.s.rows.innerHTML = ''; ui.s.rows.removeAttribute('data-sig');
    }

    /** Paints the open overlay from the committed document (rows only when they changed, so a scroll position survives). */
    function renderSanctuaryPanel() {
      if (!ui.sanctuary) return;
      const e = previewMode ? null : sanctuaryEntry(sanctuaryOpen), echo = !previewMode && sanctuaryHasEcho(sanctuaryOpen);
      if (!e && !echo) { clearSanctuaryPanel(); return; }
      ui.sanctuary.hidden = false;
      ui.s.name.textContent = e ? sanctuaryTitle(e) : t('journey2_sanc_fallback');
      // an Echo-only sanctuary (its characteristics were deleted) shows just the Soul Echo row: no name toggle, no tables, no Reroll / Delete
      ui.sancName.hidden = !e; ui.s.rows.hidden = !e; ui.s.foot.hidden = !e;
      if (e) {
        const rows = generator && generator.ready() && typeof generator.describeSanctuary === 'function' ? generator.describeSanctuary(e) : [];
        const cell = r =>
          '<section class="j2-sanc-row"><h4 class="j2-sanc-k"><span>' + esc(t(r.label)) + '</span></h4>' +
          r.results.map(x => '<p class="j2-sanc-v"><span class="j2-sanc-text">' + esc(x.text) + '</span></p>').join('') + '</section>';
        // short neighbours in the book's order share one line (two columns); a pair is built by key, so a missing table just leaves a single row
        const byKey = new Map(rows.map(r => [r.key, r])), paired = new Set();
        let html = '';
        for (const r of rows) {
          if (paired.has(r.key)) continue;
          const mate = SANC_PAIRS.find(p => p[0] === r.key && byKey.has(p[1]));
          if (mate) { paired.add(mate[1]); html += '<div class="j2-sanc-pair">' + cell(r) + cell(byKey.get(mate[1])) + '</div>'; }
          else html += '<div class="j2-sanc-pair is-single">' + cell(r) + '</div>';
        }
        if (ui.s.rows.getAttribute('data-sig') !== html) { ui.s.rows.innerHTML = html; ui.s.rows.setAttribute('data-sig', html); }
        // the one player-facing control: its label is the action it will take (no pressed state — the label itself changes), the icon follows the state
        const shown = Model.isSanctuaryNameRevealed(doc, e.anchorId);
        ui.s.nameIco.innerHTML = shown ? ICON.eye : ICON.eyeOff;
        ui.s.nameLabel.textContent = t(shown ? 'journey2_sanc_name_hide' : 'journey2_sanc_name_reveal');
        ui.sancName.title = t(shown ? 'journey2_sanc_name_hide_title' : 'journey2_sanc_name_reveal_title');
        ui.sancName.disabled = editLocked;
        ui.sancReroll.disabled = editLocked || !sanctuaryReady();
        ui.sancDelete.disabled = editLocked;
      } else if (ui.s.rows.getAttribute('data-sig')) { ui.s.rows.innerHTML = ''; ui.s.rows.removeAttribute('data-sig'); }
      // GM-only Soul Echo strip: one real button whose label is the next action (the dimmed crystal on the map shows the state); only when this sanctuary holds an Echo
      ui.s.echo.hidden = !echo;
      if (echo) {
        const got = Model.isEchoCollected(doc, sanctuaryOpen);
        ui.s.echoLabel.textContent = t(got ? 'journey2_echo_restore' : 'journey2_echo_mark');
        ui.echoCollect.disabled = editLocked;
      }
      if (sanctuaryShown !== sanctuaryOpen) ui.s.rows.scrollTop = 0;
      sanctuaryShown = sanctuaryOpen;
    }

    /** The open sanctuary's icon in map-area px, or null when it is off screen (the overlay then takes its stable corner). */
    function sanctuaryAnchorPx(view) {
      const a = sanctuaryAnchorMap().get(sanctuaryOpen);
      if (!a) return null;
      const vp = ui.viewport.getBoundingClientRect(), wrap = ui.mapwrap.getBoundingClientRect();
      const s = Geo.worldToScreen(cam, a.worldPixelAnchor[0], a.worldPixelAnchor[1]);
      const x = vp.left - wrap.left + s[0], y = vp.top - wrap.top + s[1];
      if (x < 0 || y < 0 || x > view.w || y > view.h) return null;
      return { x: x, y: y, r: SANC_RING_R * cam.scale };
    }

    function positionSanctuary() {
      if (!sanctuaryOpen || !ui.sanctuary || ui.sanctuary.hidden || !data) return;
      positionPanel(ui.sanctuary, sanctuaryAnchorPx);
    }

    /** The generated sanctuary under a viewport point (the icon's hit rectangle, or the usual marker slop), or null. */
    function sanctuaryAtScreen(sx, sy) {
      if (previewMode || !doc || !data) return null;
      const ids = openableSanctuaryIds();
      if (!ids.size) return null;
      const w = Geo.screenToWorld(cam, sx, sy), at = sanctuaryAnchorMap();
      let best = null, bestD = Infinity;
      for (const id of ids) {
        const a = at.get(id);
        if (!a) continue;
        const hr = a.hitArea.rectPx;
        const inRect = w[0] >= hr[0] && w[0] <= hr[0] + hr[2] && w[1] >= hr[1] && w[1] <= hr[1] + hr[3];
        const d = Math.hypot(w[0] - a.worldPixelAnchor[0], w[1] - a.worldPixelAnchor[1]);
        if ((inRect || d * cam.scale <= MARKER_HIT_SCREEN_PX) && d < bestD) { best = id; bestD = d; }
      }
      return best;
    }

    /** Opens the overlay for a generated sanctuary. It never shares the map with the Region Inspector or the diagnostics drawer. */
    function openSanctuary(id) {
      if (inst.disposed || previewMode || !doc) return false;
      const e = sanctuaryEntry(id);
      if (!sanctuaryOpenable(id)) return false;
      if (sanctuaryOpen === id) { positionSanctuary(); return true; }
      exitLocate({ quiet: true }); if (routeSelecting()) exitRoute({ quiet: true });
      closeInspector({ quiet: true });
      if (diagOpen) setDiagnostics(false);
      if (sel.tileId) { sel.tileId = null; renderSelection(); renderInventory(false); }
      sanctuaryOpen = id;
      if (envTipKey && String(envTipKey).indexOf('sanc:') === 0) hideEnvTip();
      renderSanctuaryRings(); renderSanctuaryPanel(); positionSanctuary();
      announce(fill('journey2_live_sanc_opened', { name: e ? sanctuaryTitle(e) : t('journey2_sanc_fallback') }));
      return true;
    }

    /** Closes the overlay; `focus` returns focus to the map, `quiet` skips the live announcement (deletion, import, teardown). */
    function closeSanctuary(opts) {
      if (!sanctuaryOpen) return false;
      const o = opts || {};
      sanctuaryOpen = null; sanctuaryShown = null;
      if (ui.sanctuary) { clearSanctuaryPanel(); ui.sanctuary.style.transform = ''; }
      renderSanctuaryRings();
      if (!o.quiet) announce(t('journey2_live_sanc_closed'));
      if (o.focus && ui.viewport) ui.viewport.focus({ preventScroll: true });
      return true;
    }

    /** Keyboard path to the overlay: S / Shift+S step through the generated sanctuaries west to east, centring the map on each. */
    function cycleSanctuary(dir) {
      if (previewMode || !doc || !data) return;
      const have = openableSanctuaryIds();
      const order = data.ctx.sanctuaries.filter(s => have.has(s.id));
      if (!order.length) { hint(t('journey2_sanc_none')); return; }
      const i = order.findIndex(s => s.id === sanctuaryOpen);
      const next = order[i < 0 ? (dir > 0 ? 0 : order.length - 1) : (i + dir + order.length) % order.length];
      centerOnWorld(next.x, next.y, Math.max(cam.scale, 0.5));
      openSanctuary(next.id);
    }

    /** One button, every sanctuary: rolls a settlement for each printed sanctuary, then commits those exact entries as ONE undoable command. */
    function generateSanctuaries() {
      if (inst.disposed || editLocked || previewMode || !doc) return;
      if (!sanctuaryReady()) { hint(t('journey2_sanc_unavailable')); return; }
      const commit = () => {
        const entries = Model.planSanctuaries(data.ctx, () => generator.rollSanctuary());
        const r = entries.length ? dispatch({ type: 'setSanctuaries', entries: entries }, 'sanctuariesGenerate') : { ok: false };
        if (!r.ok) { hint(t('journey2_sanc_failed')); return; }
        announce(fill('journey2_live_sanc_generated', { n: n(entries.length) }));
      };
      const have = doc.sanctuaries.entries.length, visibleNames = Model.getRevealedSanctuaryNameSet(doc).size;
      if (!have) { commit(); return; }
      openDialog({
        title: t('journey2_sanc_replace_title'),
        lines: [fill('journey2_sanc_replace_msg', { n: n(have) })].concat(visibleNames ? [fill('journey2_sanc_replace_visible_msg', { n: n(visibleNames) })] : [], [t('journey2_echo_undo_note')]),
        actions: [
          { label: t('journey2_cancel'), kind: 'btn-ghost', value: 'cancel', autofocus: true },
          { label: t('journey2_sanc_replace_go'), kind: 'btn-danger', value: 'replace' },
        ],
      }).then(v => { if (inst.disposed) return; if (v === 'replace') commit(); if (ui.sancGenerate) focusTool(ui.sancGenerate); });
    }

    /** Player map: reveals or hides the open sanctuary's NAME (a manual player-knowledge state, one Undo entry). The overlay stays open and focus stays on the button. */
    function toggleSanctuaryName() {
      if (inst.disposed || editLocked || previewMode || !doc || !sanctuaryOpen) return;
      const e = sanctuaryEntry(sanctuaryOpen);
      if (!e) return;
      const reveal = !Model.isSanctuaryNameRevealed(doc, e.anchorId);
      const r = dispatch({ type: 'setSanctuaryNameRevealed', anchorId: e.anchorId, revealed: reveal }, reveal ? 'sanctuaryNameReveal' : 'sanctuaryNameHide', true);
      if (!r.ok) { hint(t('journey2_sanc_failed')); return; }
      announce(reveal ? fill('journey2_live_sanc_name_revealed', { name: sanctuaryTitle(e) }) : t('journey2_live_sanc_name_hidden'));
    }

    /** Throws the open sanctuary again — name and all seven tables — keeping its place on the map. One Undo entry. A visible name is replaced on the player map, so that asks first (and rolls only after the confirmation). */
    function rerollSanctuary() {
      if (inst.disposed || editLocked || previewMode || !doc || !sanctuaryOpen) return;
      const e = sanctuaryEntry(sanctuaryOpen);
      if (!e) return;
      if (!sanctuaryReady()) { hint(t('journey2_sanc_unavailable')); return; }
      if (!Model.isSanctuaryNameRevealed(doc, e.anchorId)) { commitReroll(e.anchorId); return; }
      openDialog({
        title: t('journey2_sanc_reroll_visible_title'),
        lines: [t('journey2_sanc_reroll_visible_msg'), t('journey2_echo_undo_note')],
        actions: [
          { label: t('journey2_cancel'), kind: 'btn-ghost', value: 'cancel', autofocus: true },
          { label: t('journey2_sanc_reroll'), kind: 'btn-primary', value: 'reroll' },
        ],
      }).then(v => {
        if (inst.disposed) return;
        if (v === 'reroll' && sanctuaryOpen === e.anchorId) commitReroll(e.anchorId);
        if (ui.sancReroll && ui.sanctuary && !ui.sanctuary.hidden) ui.sancReroll.focus({ preventScroll: true });
      });
    }

    function commitReroll(anchorId) {
      if (inst.disposed || editLocked || previewMode || !doc) return;
      const e = sanctuaryEntry(anchorId);
      if (!e) return;
      const taken = new Set(doc.sanctuaries.entries.filter(x => x.anchorId !== e.anchorId).map(x => x.name.toLowerCase()));
      let rolled = generator.rollSanctuary();
      for (let i = 0; i < 6 && rolled.name && taken.has(rolled.name.toLowerCase()); i++) rolled = generator.rollSanctuary();
      const next = Object.assign({ anchorId: e.anchorId }, rolled);
      const r = dispatch({ type: 'setSanctuary', entry: next }, 'sanctuaryReroll');
      if (!r.ok) { hint(t('journey2_sanc_failed')); return; }
      announce(fill('journey2_live_sanc_rerolled', { name: sanctuaryTitle(next) }));
    }

    function confirmDeleteSanctuary() {
      if (inst.disposed || editLocked || previewMode || !doc || !sanctuaryOpen) return;
      const e = sanctuaryEntry(sanctuaryOpen);
      if (!e) return;
      openDialog({
        title: t('journey2_sanc_delete_title'),
        lines: [fill('journey2_sanc_delete_msg', { name: sanctuaryTitle(e) })].concat(Model.isSanctuaryNameRevealed(doc, e.anchorId) ? [t('journey2_sanc_delete_visible_note')] : [], [t('journey2_echo_undo_note')]),
        actions: [
          { label: t('journey2_cancel'), kind: 'btn-ghost', value: 'cancel', autofocus: true },
          { label: t('journey2_sanc_delete_go'), kind: 'btn-danger', value: 'delete' },
        ],
      }).then(v => {
        if (inst.disposed) return;
        if (v === 'delete' && sanctuaryOpen === e.anchorId) {
          const r = dispatch({ type: 'deleteSanctuary', anchorId: e.anchorId }, 'sanctuaryDelete');
          if (!r.ok) { hint(t('journey2_sanc_failed')); return; }
          announce(t('journey2_live_sanc_deleted'));
          if (ui.viewport) ui.viewport.focus({ preventScroll: true });
        } else if (ui.sancDelete && !ui.sanctuary.hidden) ui.sancDelete.focus({ preventScroll: true });
      });
    }

    function renderSelection() {
      if (!ui.g) return;
      const tile = sel.tileId ? Model.derive(doc).byId.get(sel.tileId) : null;
      // the diagnostic cell/marker selection shares this layer
      let h = renderDiagSelectMarkup();
      // soft outline on the whole inspected region (whichever way the inspector was opened), strong outline on the selected hex only
      const byId = Model.derive(doc).byId;
      let region = '';
      for (const id of Model.inspectedTileIds(inspector, doc)) { const xc = Geo.parseCellId(byId.get(id).cell); region += hexPath(xc.q, xc.r); }
      if (region) h += '<path class="j2-region-hl" d="' + region + '"/>';
      if (tile) {
        const c = Geo.parseCellId(tile.cell), d = hexPath(c.q, c.r);
        h += '<path class="j2-sel-casing" d="' + d + '"/><path class="j2-tile-sel" d="' + d + '"/>';
      }
      ui.g.select.innerHTML = h;
    }

    function updateHistoryButtons() {
      if (!ui.undo) return;
      const lock = editLocked;
      ui.undo.disabled = lock || !history.undo.length;
      ui.redo.disabled = lock || !history.redo.length;
    }

    function renderAll(full) {
      if (!ui.root || !doc) return;
      renderInventory(full);
      renderTiles();
      renderFog();
      updateFogUi();
      updateEchoUi();
      updateSanctuaryUi();
      renderSanctuaryRings();
      renderSanctuaryPanel();
      renderLocatePanel();
      renderRoute();
      renderSelection();
      renderInspector();
      positionInspector();
      updateHistoryButtons();
      renderBanner();
      if (ui.stockCount) updateReadouts();
      if (printOpen) paintPrintPreview(true);                 // read-only, but never stale: a replaced document or a language switch rebuilds the pages
    }

    /* ============================================================
       Camera
       ============================================================ */

    function viewSize() { return [ui.viewport.clientWidth, ui.viewport.clientHeight]; }
    function minScale() { const [vw, vh] = viewSize(); return Geo.fitCamera(Math.max(200, vw - panelInset()), vh, data.template.worldSizePx[0], data.template.worldSizePx[1], 8).scale * 0.8; }

    /** Width the open diagnostics drawer takes from the right edge of the viewport (0 when closed or on a narrow screen). */
    function panelInset() {
      if (!diagOpen || !ui.panel || window.innerWidth <= 900) return 0;
      return ui.panel.offsetWidth + 2 * 12;
    }

    function fitToView() {
      const [vw, vh] = viewSize();
      if (!vw || !vh) { cam = { scale: 0.25, tx: 0, ty: 0 }; scheduleApply(); return; }
      const left = sideInset();
      cam = Geo.fitCamera(Math.max(200, vw - panelInset() - left), vh, data.template.worldSizePx[0], data.template.worldSizePx[1], 8);
      cam.tx += left;                                  // the overlay sidebar covers the left edge: fit into what stays visible
      fitMode = true;
      scheduleApply();
      scheduleCameraSave();
    }

    /**
     * The camera is a view preference (dhcodex_journey2_ui), never part of the map or its history: it is stored as the world point at the viewport centre plus the zoom,
     * so a different window size still lands on the same spot, or as "fit" so a fitted map stays fitted. Writes are debounced and flushed when the page is hidden.
     */
    function currentView() {
      if (!cameraReady || !data || !ui.viewport) return savedView;
      if (fitMode) return { fit: true, cx: 0, cy: 0, scale: 1 };
      const [vw, vh] = viewSize();
      if (!vw || !vh) return savedView;
      const w = Geo.screenToWorld(cam, vw / 2, vh / 2);
      return { fit: false, cx: w[0], cy: w[1], scale: cam.scale };
    }
    function scheduleCameraSave() {
      if (!cameraReady || cameraSaveTimer) return;
      cameraSaveTimer = setTimeout(flushCameraSave, 400);
    }
    function flushCameraSave() {
      clearTimeout(cameraSaveTimer); cameraSaveTimer = 0;
      if (inst.disposed || !cameraReady || !store || !data) return;
      saveUiPrefs();
    }
    /** Applies the stored camera (or Fit) once the viewport has a real size — at startup, or from the first resize if the layout was not ready yet. Returns whether it ran. */
    function restoreCamera() {
      const [vw, vh] = viewSize();
      if (cameraReady || !vw || !vh) return cameraReady;
      const v = savedView;
      if (v && !v.fit) {
        const scale = Math.min(MAX_ZOOM, Math.max(Math.min(minScale(), Geo.ZOOM_STEPS[0]), v.scale));
        setCamera({ scale: scale, tx: vw / 2 - v.cx * scale, ty: vh / 2 - v.cy * scale });
      } else fitToView();
      cameraReady = true;
      listen(window, 'pagehide', flushCameraSave);
      listen(document, 'visibilitychange', () => { if (document.hidden) flushCameraSave(); });
      return true;
    }

    function setCamera(next, keepFit) {
      const [vw, vh] = viewSize();
      cam = Geo.clampCamera(next, vw, vh, data.template.worldSizePx[0], data.template.worldSizePx[1], 120);
      if (!keepFit) fitMode = false;
      scheduleApply();
      scheduleCameraSave();
      updateReadouts();                               // synchronous: the zoom label and +/- availability never wait for a frame
      if (tr) updatePreview();                        // the CURRENT camera always decides the snap — never a stale transform
    }

    function zoomBy(factor, sx, sy) {
      const [vw, vh] = viewSize();
      const cx = sx == null ? vw / 2 : sx, cy = sy == null ? vh / 2 : sy;
      setCamera(Geo.zoomAt(cam, cx, cy, factor, minScale(), MAX_ZOOM));
    }

    /** Steps to the next/previous standard zoom stop (exactly 100% is one of them) around the viewport centre. */
    function zoomStep(dir) {
      const next = Geo.stepZoom(cam.scale, dir);
      if (next !== cam.scale) zoomToScale(next);
    }

    /** Sets an exact scale keeping the world point under (sx, sy) — by default the viewport centre — fixed; pan is otherwise untouched. */
    function zoomToScale(target, sx, sy) {
      const [vw, vh] = viewSize();
      const cx = sx == null ? vw / 2 : sx, cy = sy == null ? vh / 2 : sy;
      const next = Math.min(MAX_ZOOM, Math.max(Math.min(minScale(), Geo.ZOOM_STEPS[0]), target));
      const k = next / cam.scale;
      // the scale is assigned, not multiplied into place, so a stop such as 100% is exactly 1 (no float drift)
      setCamera({ scale: next, tx: cx - (cx - cam.tx) * k, ty: cy - (cy - cam.ty) * k });
    }

    function centerOnWorld(x, y, scale) {
      const [vw, vh] = viewSize();
      const s = scale || cam.scale;
      setCamera({ scale: s, tx: vw / 2 - x * s, ty: vh / 2 - y * s });
    }

    function scheduleApply() {
      if (pendingApply) return;
      pendingApply = true;
      rafId = requestAnimationFrame(() => {
        pendingApply = false;
        if (inst.disposed || !ui.world) return;
        ui.world.style.transform = 'translate(' + cam.tx + 'px,' + cam.ty + 'px) scale(' + cam.scale + ')';
        ui.world.style.setProperty('--j2-inv', String(1 / cam.scale));
        ui.world.classList.toggle('is-pixel', cam.scale >= 2);
        positionInspector();
        if (routePlanner.isActive()) { paintRoute(); positionRouteBubbles(); }   // the side-by-side offset is a constant number of screen px
        updateReadouts();
      });
    }

    /* ============================================================
       Fog of War and Player Preview (Phase C)
       Visibility is cell-based campaign data (doc.playerVisibility), changed only by the model's setCellsRevealed
       command. The GM view never hides generated content: with "Show fog state" on, a subtle hatched veil marks
       the unexplored cells. Player Preview re-renders the same document through the player projection, so
       generated overlays in unexplored cells are simply not produced. The veil is translucent and passes over the whole base map
       (printed labels and sanctuary icons included — no cut-outs, PD-024). The active tool, the hover
       cell, an in-progress stroke and the preview mode are transient: never persisted, never in history.
       ============================================================ */

    /** One shared set of SVG patterns for the fog veil and the fog tools. */
    function buildFogLayer() {
      foggable = new Map();
      data.grid.forEachValidCell((q, r) => { if (data.ctx.policy(q, r).ok) foggable.set(Geo.cellId(q, r), hexPath(q, r)); });
      ui.defs.innerHTML =
        '<pattern id="j2-fog-gm" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="j2-fogp-wash" width="9" height="9"/><line class="j2-fogp-line" x1="0" y1="0" x2="0" y2="9"/></pattern>' +
        '<pattern id="j2-fog-player" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="j2-fogp-wash is-player" width="7" height="7"/><line class="j2-fogp-line is-player" x1="0" y1="0" x2="0" y2="7"/><line class="j2-fogp-line is-player-x" x1="0" y1="3.5" x2="7" y2="3.5"/></pattern>' +
        '<pattern id="j2-fog-hide-pat" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line class="j2-fogp-hide" x1="0" y1="0" x2="0" y2="6"/></pattern>';
    }

    const FOG_COUNT_KEYS = { revealed: ['journey2_fog_revealed_n', 'journey2_fog_revealed_one'], hidden: ['journey2_fog_hidden_n', 'journey2_fog_hidden_one'] };
    function countText(kind, count) { return fill(FOG_COUNT_KEYS[kind][count === 1 ? 1 : 0], { n: n(count) }); }

    /** The fog layer: every foggable cell that is not revealed gets the veil (GM: subtle; Player Preview: stronger). Rebuilt only when the visibility data or the mode changed. */
    function renderFog() {
      if (!ui.fogVeil || !doc || !foggable) return;
      const mode = previewMode ? 'player' : 'gm';
      const source = previewMode ? playerProjection : doc.playerVisibility;
      if (!source) return;
      if (fogDrawn.vis !== source || fogDrawn.mode !== mode) {
        const revealed = previewMode ? new Set(playerProjection.revealedCells) : Model.getRevealedCellSet(doc);
        let hidden = '', edge = '';
        for (const [key, d] of foggable) { if (revealed.has(key)) edge += d; else hidden += d; }
        ui.fogVeil.setAttribute('d', hidden);
        ui.fogEdge.setAttribute('d', previewMode ? '' : edge);
        fogDrawn = { vis: source, mode: mode };
      }
      renderFogGhost();
      ui.g.fog.style.display = previewMode ? '' : 'none';
      ui.g.fog.setAttribute('data-fog-mode', mode);
    }

    /**
     * GM aid while a fog tool is active in Player Preview: a dashed outline (no symbol, no Environment, no text) around every placed hex that is still
     * hidden from the players, so the GM can find what there is to reveal. Drawn only while a tool is armed (Esc removes it); never part of the projection, the print or a stored value.
     */
    function renderFogGhost() {
      if (!ui.fogGhost || !doc || !foggable) return;
      const on = previewMode && !!fogTool;
      const key = on ? doc.tiles : null, vis = on ? doc.playerVisibility : null;
      if (ghostDrawn.tiles === key && ghostDrawn.vis === vis) return;
      let d = '';
      if (on) { const revealed = Model.getRevealedCellSet(doc); for (const tile of doc.tiles) if (!revealed.has(tile.cell)) d += foggable.get(tile.cell) || ''; }
      ui.fogGhost.setAttribute('d', d);
      ghostDrawn = { tiles: key, vis: vis };
    }

    /** Toolbar toggle states, the tool chip and the cursor class — all derived from the transient state. */
    function updateFogUi() {
      if (!ui.fogGroup || !doc) return;
      ui.biomeColors.setAttribute('aria-pressed', String(showBiome));
      ui.biomeColors.title = showBiome ? t('journey2_biome_hide') : t('journey2_biome_show');
      ui.fogTool.setAttribute('aria-pressed', String(!!fogTool));
      ui.fogTool.disabled = editLocked;
      ui.viewport.classList.toggle('is-fog-tool', !!fogTool);
      ui.root.setAttribute('data-fog-tool', fogTool || '');
      ui.fogChip.hidden = !fogTool;
      if (fogTool) {
        ui.fogChipIco.innerHTML = ICON.reveal;
        ui.fogChipTitle.textContent = t('journey2_fog_paint_active');
        ui.fogChipCount.textContent = countText('revealed', Model.getRevealedCellSet(doc).size);
        ui.fogChipHint.textContent = t('journey2_fog_pan_hint') + ' · ' + t('journey2_fog_ghost_hint') + ' · ' + t('journey2_fog_esc_hint');
      }
    }

    /**
     * Activates a fog tool (or, with null / the already-active tool, returns to neutral). Reveal and Hide are mutually exclusive with
     * each other, with armed or dragged placement and with the Region Inspector: activating one cancels those, clears the selection,
     * (Player Preview only). Pan, zoom and the sidebar state are untouched.
     */
    function setFogTool(mode, o) {
      const opts = o || {};
      if (mode && (!previewMode || editLocked || !data)) return;
      if (mode && mode === fogTool) mode = null;
      if (mode) {
        exitLocate({ quiet: true }); exitRoute({ quiet: true });   // the map tools are mutually exclusive
        cancelTransient();
        cancelFogStroke();
        hideEnvTip();
        closeMenus();
        if (diagOpen) setDiagnostics(false);
        closeInspector({ quiet: true });
        closeSanctuary({ quiet: true });
        if (sel.tileId) { sel.tileId = null; renderSelection(); renderInventory(false); }
      } else {
        cancelFogStroke();
      }
      fogTool = mode; fogHover = null;
      if (ui.viewport) ui.viewport.classList.remove('is-over-tile');
      updateFogUi(); renderFog(); scheduleFogPaint();
      if (!opts.quiet) announce(mode ? t('journey2_fog_paint_active') : t('journey2_fog_tool_off'));
    }

    /**
     * "Biome colors": a display preference for the GM view only. No command, no history entry, no autosave of the document, no change to the
     * fog, the player projection or the camera — it stores one flag in dhcodex_journey2_ui and redraws the (derived) tint.
     */
    function toggleBiomeColors() {
      showBiome = !showBiome;
      saveUiPrefs();
      updateFogUi();
      renderTiles();
    }

    /* ---- strokes ---- */

    function fogCellFromEvent(e) {
      if (!insideViewport(e)) return null;                 // not under the overlay sidebar, not outside the map: those cells cannot be painted
      const [x, y] = localPoint(e);
      const w = Geo.screenToWorld(cam, x, y);
      return data.grid.worldToCell(w[0], w[1]);
    }

    function startFogStroke(e) {
      clearHint();
      ui.viewport.focus({ preventScroll: true });
      fogStroke = { mode: e.button === 2 ? 'hide' : 'reveal', pointerId: e.pointerId, seen: new Set(), cells: [], pendD: '', last: null, hover: null };
      fogHover = null;
      try { ui.viewport.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events may lack a capturable pointer */ }
      ui.viewport.classList.add('is-fog-painting');
      const cell = fogCellFromEvent(e);
      if (cell) fogStrokeTo(cell);
      scheduleFogPaint();
    }

    /** Adds the cell under the pointer plus every cell on the hex line from the previous sample, so a fast drag leaves no gap. */
    function fogStrokeTo(cell) {
      const s = fogStroke;
      const line = s.last ? Geo.cellLine(s.last, cell) : [cell];
      for (const c of line) {
        const key = Geo.cellId(c.q, c.r);
        if (s.seen.has(key)) continue;                     // a cell joins a stroke once
        s.seen.add(key);
        if (!foggable.has(key)) continue;                  // outside the frame / title, compass and scale furniture
        s.cells.push(key);
        if (Model.isCellRevealed(doc, key) !== (s.mode === 'reveal')) s.pendD += foggable.get(key);
      }
      s.last = cell;
      s.hover = foggable.has(Geo.cellId(cell.q, cell.r)) ? cell : null;
    }

    function moveFogStroke(e) {
      const s = fogStroke;
      const samples = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
      for (const ev of samples && samples.length ? samples : [e]) {
        const cell = fogCellFromEvent(ev);
        if (cell) fogStrokeTo(cell); else { s.last = null; s.hover = null; }
      }
      scheduleFogPaint();
    }

    function updateFogHover(e) {
      const cell = fogCellFromEvent(e);
      const next = cell && foggable.has(Geo.cellId(cell.q, cell.r)) ? cell : null;
      if ((next && fogHover && next.q === fogHover.q && next.r === fogHover.r) || (!next && !fogHover)) return;
      fogHover = next;
      scheduleFogPaint();
    }

    function releaseFogCapture(id) { try { if (ui.viewport.hasPointerCapture(id)) ui.viewport.releasePointerCapture(id); } catch (err) { /* already released */ } }

    /** Pointer released: the whole stroke is ONE command (one Undo entry, one autosave). Nothing to change records nothing. */
    function finishFogStroke(e) {
      const s = fogStroke;
      if (!s) return;
      if (e) { const cell = fogCellFromEvent(e); if (cell) fogStrokeTo(cell); }
      fogStroke = null;
      ui.viewport.classList.remove('is-fog-painting');
      releaseFogCapture(s.pointerId);
      scheduleFogPaint();
      if (!s.cells.length) return;
      const revealed = s.mode === 'reveal';
      const r = dispatch({ type: 'setCellsRevealed', cellKeys: s.cells, revealed: revealed }, revealed ? 'fogReveal' : 'fogHide', true);
      if (r.ok && !r.noop) announce(countText(revealed ? 'revealed' : 'hidden', r.changed));
    }

    /** Pointer cancelled, capture lost, Escape, Undo/Redo, route exit: nothing is committed and no history entry exists. */
    function cancelFogStroke(announceIt) {
      const s = fogStroke;
      if (!s) return;
      fogStroke = null;
      if (ui.viewport) { ui.viewport.classList.remove('is-fog-painting'); releaseFogCapture(s.pointerId); }
      scheduleFogPaint();
      if (announceIt) announce(t('journey2_fog_stroke_cancelled'));
    }

    function scheduleFogPaint() {
      if (fogPaintRaf) return;
      fogPaintRaf = requestAnimationFrame(() => { fogPaintRaf = 0; if (!inst.disposed) paintFogStroke(); });
    }

    /** Pending cells of the stroke plus the brush outline on the current cell (distinct border style AND glyph for Reveal vs Hide, not colour alone). */
    function paintFogStroke() {
      const g = ui.g && ui.g.fogstroke;
      if (!g) return;
      if (!fogTool || !previewMode || !data) { g.innerHTML = ''; return; }
      const s = fogStroke, mode = s ? s.mode : 'idle';   // idle: no button held yet — a neutral outline, no glyph
      let h = '';
      if (s && s.pendD) h += '<path class="j2-fog-pend is-' + mode + '" d="' + s.pendD + '"/>';
      const cell = s ? s.hover : fogHover;
      if (cell) {
        const c = data.grid.cellCenter(cell.q, cell.r), k = data.grid.shortDimensionPx * 0.16;
        h += '<path class="j2-fog-brush is-' + mode + '" d="' + hexPath(cell.q, cell.r) + '"/>';
        h += mode === 'idle' ? ''
          : mode === 'reveal'
          ? '<circle class="j2-fog-glyph is-reveal" cx="' + fmt(c[0], 1) + '" cy="' + fmt(c[1], 1) + '" r="' + fmt(k, 1) + '"/>'
          : '<path class="j2-fog-glyph is-hide" d="M' + fmt(c[0] - k, 1) + ' ' + fmt(c[1] - k, 1) + 'l' + fmt(2 * k, 1) + ' ' + fmt(2 * k, 1) + 'm0 ' + fmt(-2 * k, 1) + 'l' + fmt(-2 * k, 1) + ' ' + fmt(2 * k, 1) + '"/>';
      }
      g.innerHTML = h;
    }

    /* ---- Player Preview ---- */

    /** Shows/hides the GM chrome and the preview bar. Everything is derived from `previewMode`, so a language switch can re-run it. */
    function applyPreviewChrome() {
      if (!ui.root) return;
      const on = previewMode;
      ui.root.setAttribute('data-mode', on ? 'preview' : 'gm');
      // the panel stays where it is in both modes (one screen); only its content changes: GM tools, New region and the stock give way to the preview controls
      ui.gmControls.hidden = on; ui.gen.hidden = on; ui.sideScroll.hidden = on; ui.previewBar.hidden = !on; ui.railStock.hidden = on;
      syncRail();
      ui.hint.hidden = true; ui.tip.hidden = true; ui.tip.innerHTML = ''; envTipKey = null;
      ui.viewport.setAttribute('aria-label', t(on ? 'journey2_preview_map_label' : 'journey2_map_label'));
      ui.viewport.classList.toggle('is-preview', on);
      const keys = container.querySelector('#j2-keys');
      if (keys) keys.textContent = t(on ? 'journey2_preview_keys_hint' : 'journey2_keys_hint');   // the editing keys do not exist in the preview
    }

    /**
     * Opens the read-only Player Preview. Everything transient is closed first (armed placement, drags, an active fog stroke/tool, menus,
     * the inspector and its highlight, the tile selection); pan and zoom are one shared state with the GM view (never saved or restored per mode). GM notes do not
     * exist any more (PD-019), so there is no pending text to flush. Never touches the document or history.
     */
    function enterPreview() {
      if (previewMode || !data || !doc) return;
      cancelTransient(); cancelFogStroke(); closeMenus();
      exitLocate({ quiet: true }); exitRoute({ quiet: true });
      if (diagOpen) setDiagnostics(false);
      setFogTool(null, { quiet: true });
      closeInspector({ quiet: true });
      closeSanctuary({ quiet: true });
      sel.tileId = null;
      clearHint();
      previewMode = true;
      saveUiPrefs();
      renderTiles(); renderFog(); renderSelection(); paintFogStroke(); renderSanctuaryRings();
      applyPreviewChrome(); applyLayerVisibility(); updateFogUi();
      announce(t('journey2_live_preview_on'));
      focusTool(ui.previewBack);
    }

    /** A reload reopens Player Preview if it was open (PD-035); waits for the restored camera so it opens on the same view. */
    function maybeResumePreview() {
      if (!resumePreview || !cameraReady) return;
      resumePreview = false;
      enterPreview();
    }

    /** Back to the GM view: the camera (including any pan or zoom made in the preview), sidebar state and fog preference carry over; nothing is reopened or re-selected. */
    function leavePreview(o) {
      if (!previewMode) return;
      closePrintPreview({ quiet: true });
      setFogTool(null, { quiet: true });
      previewMode = false;
      saveUiPrefs();
      playerProjection = null;
      cancelTransient();
      applyPreviewChrome(); applyLayerVisibility();
      renderTiles(); renderFog(); renderSelection(); renderInventory(false); updateFogUi(); updateHistoryButtons(); renderSanctuaryRings();
      if (!(o && o.quiet)) { announce(t('journey2_live_preview_off')); focusTool(ui.previewBtn); }
    }

    /* ============================================================
       Player map Print Preview (PD-028). Two A4 portrait pages built from `Journey2Print.buildPrintModel` — a data filter over the
       revealed cells with NO fog layer, tint or GM data — drawn as the original map half (a 1:1 crop of the world raster through the
       SVG viewBox) plus a vector overlay. The pages shown on screen ARE the printed DOM: the same `.j2-print-root` is what
       `@media print` leaves visible, so there is one renderer. Read-only and transient: no document change, history entry or autosave.
       ============================================================ */

    function printPageMarkup(page, index, count) {
      const [vx, vy, vw, vh] = page.viewBox, baseHref = esc(baseImg ? baseImg.src : versioned(data.template.assembledAsset.path, data.template.assembledAsset.cacheKey));
      const W = data.template.worldSizePx[0], H = data.template.worldSizePx[1];
      const polylines = Geo.chainEdgeSegments(data.grid, page.segments);
      const d = Geo.polylinesPath(polylines);
      let labels = '';
      for (const l of page.labels) {
        labels += '<text class="j2-sanc-label" data-anchor="' + esc(l.anchorId) + '" font-size="' + l.fontSize + '">' +
          l.lines.map((line, i) => '<tspan x="' + fmt(l.cx, 1) + '" y="' + fmt(l.y + l.lineHeight * (i + 0.8), 1) + '">' + esc(line) + '</tspan>').join('') + '</text>';
      }
      const mm = page.scaleMmPerPx;
      return '<section class="j2-print-page" data-page="' + page.id + '" role="group" aria-label="' + esc(fill('journey2_pp_page_n', { n: n(index + 1), total: n(count) })) + '">' +
        '<svg class="j2-pp-svg" xmlns="' + SVG_NS + '" width="' + fmt(vw * mm, 2) + 'mm" height="' + fmt(vh * mm, 2) + 'mm" viewBox="' + vx + ' ' + vy + ' ' + vw + ' ' + vh + '" aria-hidden="true" focusable="false">' +
        '<g transform="translate(' + page.translate[0] + ' ' + page.translate[1] + ')">' +
        '<image class="j2-pp-base" href="' + baseHref + '" x="0" y="0" width="' + W + '" height="' + H + '" preserveAspectRatio="none"/>' +
        '<g class="j2-pp-gen" data-pp-overlays="' + page.overlays.length + '">' + overlayMarkup(page.overlays.map(o => ({ q: o.q, r: o.r, spec: { symbolId: o.symbolId, dots: o.dots, blightMark: o.blightMark }, tint: null })).concat(page.marks.map(m => ({ q: m.q, r: m.r, floating: true })))) + '</g>' +
        '<g class="j2-pp-perimeter" data-pp-segments="' + page.segments.length + '">' + (d ? '<path class="j2-perimeter" d="' + d + '"/>' : '') + '</g>' +
        '<g class="j2-pp-labels" data-pp-labels="' + page.labels.length + '">' + labels + '</g>' +
        '</g></svg>' +
        '<p class="j2-pp-pagelabel">' + esc(fill('journey2_pp_page_n', { n: n(index + 1), total: n(count) })) + '</p></section>';
    }

    /** Everything the preview says, rebuilt from state so a language switch or a replaced document never leaves stale text or pages. */
    function printPreviewMarkup() {
      const m = pp.model;
      const status = pp.failed ? t('journey2_pp_failed') : pp.ready ? t('journey2_pp_ready') : t('journey2_pp_preparing');
      const summary = m ? fill('journey2_pp_summary', { hexes: countFor('journey2_pp_hexes', m.summary.wildernessHexes), names: countFor('journey2_pp_names', m.summary.sanctuaryNames) }) : '';
      return '<div class="j2-pp-bar">' +
        '<h2 class="j2-pp-title" tabindex="-1" data-pp-title>' + esc(t('journey2_pp_title')) + '</h2>' +
        '<p class="j2-pp-note">' + esc(t('journey2_pp_note_visible')) + ' ' + esc(t('journey2_pp_note_blank')) + '</p>' +
        '<p class="j2-pp-status" role="status" data-pp-status' + (pp.failed ? ' data-failed' : '') + '>' + esc(status) + '</p>' +
        '<div class="j2-pp-actions">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-pp-back>' + esc(t('journey2_pp_back')) + '</button>' +
        (pp.failed ? '<button type="button" class="btn btn-sm" data-pp-retry>' + esc(t('journey2_pp_retry')) + '</button>' : '') +
        '<button type="button" class="btn btn-sm" data-pp-print' + (pp.ready && m ? '' : ' disabled') + '>' + esc(t('journey2_pp_print')) + '</button>' +
        '</div></div>' +
        '<p class="sr-only" data-pp-summary>' + esc(t('journey2_pp_two_page') + '. ' + summary) + '</p>' +
        '<div class="j2-print-root" data-pp-root>' + (m ? m.pages.map((pg, i) => printPageMarkup(pg, i, m.pages.length)).join('') : '') + '</div>';
    }
    function countFor(key, count) { return fill(key + (count === 1 ? '_one' : '_n'), { n: n(count) }); }

    /** (Re)builds the model from the CURRENT document and repaints. `keep`: a refresh of an open preview (keeps the ready state and focus). */
    function paintPrintPreview(keep) {
      if (!printOpen || !pp || !doc || !data) return;
      const focused = pp.el.contains(document.activeElement) ? document.activeElement.hasAttribute('data-pp-title') ? 'title' : document.activeElement.hasAttribute('data-pp-back') ? 'back' : document.activeElement.hasAttribute('data-pp-print') ? 'print' : document.activeElement.hasAttribute('data-pp-retry') ? 'retry' : null : null;
      try { pp.model = Print.buildPrintModel(doc, data.ctx, data.template); pp.failed = false; }
      catch (err) { pp.model = null; pp.failed = true; pp.ready = false; }
      if (!keep) pp.ready = false;
      pp.el.innerHTML = printPreviewMarkup();
      if (focused) { const b = pp.el.querySelector(focused === 'title' ? '[data-pp-title]' : focused === 'back' ? '[data-pp-back]' : focused === 'print' ? '[data-pp-print]:not([disabled])' : '[data-pp-retry]'); if (b) b.focus({ preventScroll: true }); }
    }

    /** Fonts, the world raster and every symbol decoded, and the SVG painted, before Print can be pressed. Resolves false (never throws) on failure. */
    function printAssetsReady() {
      const decode = src => new Promise(resolve => { const i = new Image(); i.onload = () => resolve(i.decode ? i.decode().then(() => true, () => true) : true); i.onerror = () => resolve(false); i.src = src; });
      const raster = baseImg ? baseImg.src : versioned(data.template.assembledAsset.path, data.template.assembledAsset.cacheKey);
      const used = new Set();
      if (pp && pp.model) for (const pg of pp.model.pages) for (const o of pg.overlays) used.add(o.symbolId);
      const syms = Array.from(used).map(id => data.symbolById.get(id)).filter(Boolean);
      const fonts = document.fonts ? (document.fonts.load ? document.fonts.load('17px "Architects Daughter"').catch(() => null) : Promise.resolve()).then(() => document.fonts.ready).then(() => true, () => true) : Promise.resolve(true);
      return Promise.all([
        fonts,
        decode(raster), Promise.all(syms.map(s => decode(s.path))).then(r => r.every(Boolean)),
      ]).then(r => r.every(Boolean)).then(ok => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(ok)))));
    }

    function preparePrintAssets() {
      const token = ++pp.token;
      pp.ready = false; pp.failed = !pp.model;
      paintPrintPreview(true);
      if (pp.failed) { announce(t('journey2_pp_failed')); return; }
      announce(t('journey2_pp_preparing'));
      printAssetsReady().then(ok => {
        if (inst.disposed || !printOpen || !pp || pp.token !== token) return;
        pp.ready = ok; pp.failed = !ok;
        paintPrintPreview(true);
        announce(ok ? t('journey2_pp_ready') : t('journey2_pp_failed'));
      });
    }

    function openPrintPreview() {
      if (!previewMode || printOpen || !data || !doc || !Print) return;
      cancelTransient(); cancelFogStroke(); closeMenus(); closeInspector({ quiet: true }); closeSanctuary({ quiet: true });
      setFogTool(null, { quiet: true });
      printOpen = true;
      const host = el('div', { class: 'j2-printpreview', 'data-j2-printpreview': '' });
      pp = { el: host, model: null, ready: false, failed: false, token: 0 };
      host.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        if (b.hasAttribute('data-pp-back')) closePrintPreview({ focus: true });
        else if (b.hasAttribute('data-pp-retry')) preparePrintAssets();
        else if (b.hasAttribute('data-pp-print')) runPlayerPrint();
      });
      document.body.appendChild(host);
      document.body.classList.add('j2-printpreview-mode');
      ui.root.inert = true;
      preparePrintAssets();
      announce(t('journey2_pp_live_on'));
      const h = pp.el.querySelector('[data-pp-title]');
      if (h) h.focus({ preventScroll: true });
    }

    /** Back to the screen Player Preview (never to the editable GM view). The camera, document and history were never touched. */
    function closePrintPreview(o) {
      if (!printOpen) return;
      printOpen = false;
      if (pp) { pp.token++; pp.el.remove(); }
      pp = null;
      document.body.classList.remove('j2-printpreview-mode');
      if (ui.root) ui.root.inert = false;
      if (o && o.quiet) return;
      announce(t('journey2_pp_live_off'));
      if (o && o.focus && ui.printOpen) focusTool(ui.printOpen);
    }

    /** The system print dialog, once, only when the pages are ready; cancelling (or printing) leaves the preview exactly as it was. */
    function runPlayerPrint() {
      if (!printOpen || !pp || !pp.ready || !pp.model) return;
      const token = pp.token;
      printAssetsReady().then(ok => {
        if (inst.disposed || !printOpen || !pp || pp.token !== token) return;
        if (!ok) { pp.ready = false; pp.failed = true; paintPrintPreview(true); announce(t('journey2_pp_failed')); return; }
        window.print();
      });
    }

    /* ============================================================
       Pointer interactions
       ============================================================ */

    function bindSurface() {
      const vp = ui.viewport;
      listen(vp, 'pointerdown', onViewportDown);
      listen(vp, 'pointermove', onViewportMove);
      listen(vp, 'pointerup', onViewportUp);
      listen(vp, 'pointercancel', onViewportCancel);
      listen(vp, 'lostpointercapture', onViewportCancel);
      listen(vp, 'pointerleave', () => { pointer.inside = false; hideEnvTip(); hoverCell = null; hoverMarker = null; if (fogHover) { fogHover = null; scheduleFogPaint(); } if (locateHover) { locateHover = null; paintLocate(); } if (routeHover) { routeHover = null; paintRoute(); } if (diagOpen) renderSelection(); updateReadouts(); if (tr && tr.kind === 'armed') updatePreview(); });
      listen(vp, 'wheel', onWheel, { passive: false });
      listen(vp, 'keydown', onViewportKey);
      listen(vp, 'keyup', e => { if (e.key === ' ') { spaceDown = false; vp.classList.remove('is-space'); } });
      listen(vp, 'blur', () => { spaceDown = false; vp.classList.remove('is-space'); });
      listen(vp, 'contextmenu', e => e.preventDefault());
      listen(vp, 'click', e => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(() => { if (inst.disposed || !data) return; if (!cameraReady && restoreCamera()) { maybeResumePreview(); return; } if (fitMode) fitToView(); else setCamera(cam, true); });
        ro.observe(vp);
        cleanups.push(() => ro.disconnect());
      }
      if (typeof ResizeObserver === 'function') {
        const ro2 = new ResizeObserver(() => { if (!inst.disposed) scheduleApply(); });
        ro2.observe(ui.inspector);
        cleanups.push(() => ro2.disconnect());
      }
      listen(ui.sidewrap, 'transitionend', () => { positionInspector(); });
      listen(ui.root, 'click', onRootClick);
      listen(ui.gen, 'submit', onGenerate);
      listen(ui.panel.querySelector('[data-j2-goto]'), 'submit', onGoto);
      listen(ui.p.proofSymbol, 'change', () => { proofSymbolId = ui.p.proofSymbol.value; });
      // stock handles (pointer events bubble from the captured handle to the sidebar)
      listen(ui.side, 'pointerdown', onHandleDown);
      listen(ui.side, 'pointermove', onHandleMove);
      listen(ui.side, 'pointerup', onHandleUp);
      listen(ui.side, 'pointercancel', onHandleCancel);
      listen(ui.side, 'lostpointercapture', onHandleCancel);
      listen(ui.side, 'keydown', onHandleKey);
      // document-level: only Escape + Undo/Redo, both ignored while editing text or a dialog is open
      listen(document, 'keydown', onDocumentKey);
      listen(document, 'keydown', onMenuKey);
      listen(document, 'keyup', onDocumentKeyUp);
      listen(window, 'resize', scheduleResizeReconcile);
      cleanups.push(() => clearTimeout(resizeReconcileTimer));
      listen(window, 'blur', () => { spaceDown = false; if (ui.viewport) ui.viewport.classList.remove('is-space'); });
      listen(document, 'pointerdown', e => { if (openMenu && !e.target.closest('.j2-menu-wrap')) closeMenus(); }, true);
      importInput = el('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
      ui.root.appendChild(importInput);
      listen(importInput, 'change', onImportFile);
    }

    let suppressClick = false;
    function markDragged() { suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); }

    function localPoint(e) {
      const r = ui.viewport.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }
    /** True while the pointer is over the visible map: inside the viewport, not under the overlay sidebar or a floating panel. */
    function insideViewport(e) {
      const r = ui.viewport.getBoundingClientRect();
      if (!(e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)) return false;
      const s = ui.sidewrap.getBoundingClientRect();
      if (e.clientX >= s.left && e.clientX <= s.right && e.clientY >= s.top && e.clientY <= s.bottom) return false;
      // Hit-test the real topmost element: the Region Inspector, the sanctuary overlay, the Locate panel and any other floating panel
      // that visually covers the map also block it. Pointer-transparent decoration (SVG overlay, tooltip, chips) falls through to the viewport.
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      return !!hit && ui.viewport.contains(hit);
    }

    function tileAtScreen(sx, sy) {
      const w = Geo.screenToWorld(cam, sx, sy);
      const c = data.grid.worldToCell(w[0], w[1]);
      return Model.derive(doc).occupancy.get(Geo.cellId(c.q, c.r)) || null;
    }

    /* ---- viewport: pan / tile move / armed click ---- */

    function onViewportDown(e) {
      if (pan || fogStroke || tr && tr.kind !== 'armed') return;
      const fogPaint = fogTool && previewMode && !spaceDown && !editLocked && !(tr && tr.kind === 'armed');
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;   // the right button pans, except as the Hide brush while fog painting
      clearHint();
      ui.viewport.focus({ preventScroll: true });
      const [x, y] = localPoint(e);
      pointer.x = x; pointer.y = y; pointer.inside = true; pointer.cx = e.clientX; pointer.cy = e.clientY;
      // priority: dialog > preview > an existing drag/pan > Locate location selection (a click, never a tile drag) > armed placement > fog tool > neutral selection. Space (or the middle button) pans instead of painting.
      if (fogPaint && (e.button === 0 || e.button === 2)) { startFogStroke(e); e.preventDefault(); return; }
      const tile = e.button === 0 && !spaceDown && !editLocked && !previewMode && !fogTool && !(tr && tr.kind === 'armed') && !locateSession.isActive() && !routeSelecting() && !sanctuaryAtScreen(x, y) ? tileAtScreen(x, y) : null;
      if (tile) {
        tr = { kind: 'tile', tileId: tile.id, batchId: tile.batchId, from: tile.cell, docRef: doc, pointerId: e.pointerId, moved: false, x0: e.clientX, y0: e.clientY, preview: null };
      } else {
        pan = { id: e.pointerId, x0: x, y0: y, tx0: cam.tx, ty0: cam.ty, scale0: cam.scale, moved: false, button: e.button };
      }
      try { ui.viewport.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events may lack a capturable pointer */ }
      if (e.button === 1 || e.button === 2) e.preventDefault();
    }

    function onViewportMove(e) {
      const [x, y] = localPoint(e);
      pointer.x = x; pointer.y = y; pointer.inside = insideViewport(e); pointer.cx = e.clientX; pointer.cy = e.clientY;
      if (fogStroke && fogStroke.pointerId === e.pointerId) { moveFogStroke(e); return; }
      if (pan && pan.id === e.pointerId) {
        const dx = x - pan.x0, dy = y - pan.y0;
        if (!pan.moved && Math.hypot(dx, dy) > CLICK_SLOP_PX) { pan.moved = true; ui.viewport.classList.add('is-panning'); }
        if (pan.moved) { setCamera({ scale: pan.scale0, tx: pan.tx0 + dx, ty: pan.ty0 + dy }); return; }
      }
      if (tr && tr.kind === 'tile' && tr.pointerId === e.pointerId) {
        if (!tr.moved && Math.hypot(e.clientX - tr.x0, e.clientY - tr.y0) > CLICK_SLOP_PX) { tr.moved = true; ui.viewport.classList.add('is-moving'); }
        if (tr.moved) { updatePreview(); return; }
      }
      if (tr && tr.kind === 'armed') { updatePreview(); return; }
      if (routeSelecting() && !pan) { updateRouteHover(e); return; }
      if (locateSession.state && locateSession.state.status === 'selecting' && !pan) { updateLocateHover(e); return; }
      if (fogTool && !pan) { updateFogHover(e); return; }
      if (!tr) updateHover();
    }

    function onViewportUp(e) {
      if (fogStroke && fogStroke.pointerId === e.pointerId) { finishFogStroke(e); return; }
      if (pan && pan.id === e.pointerId) {
        const wasClick = !pan.moved && pan.button === 0;
        const moved = pan.moved;
        const [x, y] = localPoint(e);
        endPan();
        if (moved) markDragged();
        if (wasClick && ((!locateSession.isActive() && !routeSelecting()) || insideViewport(e))) handleMapClick(x, y);
        return;
      }
      if (tr && tr.kind === 'tile' && tr.pointerId === e.pointerId) {
        const t0 = tr;
        endTransient();
        if (!t0.moved) { selectTile(t0.tileId); return; }
        markDragged();
        commitTileMove(t0, e);
      }
    }

    function onViewportCancel(e) {
      if (fogStroke && fogStroke.pointerId === e.pointerId) { cancelFogStroke(true); return; }
      if (pan && pan.id === e.pointerId) endPan();
      else if (tr && tr.kind === 'tile' && tr.pointerId === e.pointerId) cancelTransient();
    }

    function endPan() {
      if (!pan) return;
      const id = pan.id;
      pan = null;
      ui.viewport.classList.remove('is-panning');
      try { if (ui.viewport.hasPointerCapture(id)) ui.viewport.releasePointerCapture(id); } catch (err) { /* already released */ }
    }

    function handleMapClick(sx, sy) {
      if (previewMode || fogTool) return;                    // read-only preview / an active fog tool never selects or inspects
      if (routeSelecting()) {                                // the Route Planner owns the map while choosing A or B: a sanctuary icon, Environment marker or tile selects its hex
        if (!spaceDown) { const id = routeCellAt(sx, sy); if (id && routePlanner.pick(id) && routePlanner.state.status === 'result') { const v = routeView(); if (v) announce(v.route.status === 'ok' ? fill('journey2_route_live_result', { strategy: t(ROUTE_LABEL[v.eff]), hexes: n(v.route.stats.hexes) }) : fill('journey2_route_live_none', { strategy: t(ROUTE_LABEL[v.eff]) })); } }
        return;
      }
      if (locateSession.state) {                             // Locate owns the map: no inspector, sanctuary overlay, Environment marker or tile selection opens
        if (locateSession.state.status === 'selecting' && !spaceDown) {
          const w = Geo.screenToWorld(cam, sx, sy), c = data.grid.worldToCell(w[0], w[1]), id = Geo.cellId(c.q, c.r);
          if (foggable.has(id)) chooseLocateOrigin(id);      // any valid, non-decorative hex of the calibrated grid — whatever is (or is not) on it
        }
        return;
      }
      if (tr && tr.kind === 'armed') { commitArmed(); return; }
      const sanctuary = sanctuaryAtScreen(sx, sy);          // a generated sanctuary icon outranks the hex under it
      if (sanctuary) { openSanctuary(sanctuary); return; }
      const tile = editLocked ? null : tileAtScreen(sx, sy);
      if (tile) { selectTile(tile.id); return; }
      // a click on empty map (a pan never gets here) closes the inspector and the sanctuary overlay and clears the hex it selected
      if (sanctuaryOpen) closeSanctuary();
      if (inspectorOpen()) closeInspector();
      if (sel.tileId) { sel.tileId = null; renderSelection(); renderInventory(false); }
      if (diagOpen) handleDiagClick(sx, sy);
    }

    /** Plain click on a placed hex: inspect its region. A map click never expands, collapses or scrolls the sidebar. */
    function selectTile(id) { openInspectorFromTile(id); }

    function onWheel(e) {
      e.preventDefault();
      const [x, y] = localPoint(e);
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      zoomBy(Math.exp(-e.deltaY * unit * 0.0016), x, y);
    }

    function onViewportKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target !== ui.viewport) return;
      if (e.key === ' ') { spaceDown = true; ui.viewport.classList.add('is-space'); e.preventDefault(); return; }
      const step = e.shiftKey ? 240 : 80;
      let handled = true;
      switch (e.key) {
        case 'ArrowLeft': setCamera({ scale: cam.scale, tx: cam.tx + step, ty: cam.ty }); break;
        case 'ArrowRight': setCamera({ scale: cam.scale, tx: cam.tx - step, ty: cam.ty }); break;
        case 'ArrowUp': setCamera({ scale: cam.scale, tx: cam.tx, ty: cam.ty + step }); break;
        case 'ArrowDown': setCamera({ scale: cam.scale, tx: cam.tx, ty: cam.ty - step }); break;
        case '+': case '=': zoomStep(1); break;
        case '-': case '_': zoomStep(-1); break;
        case '0': fitToView(); break;
        case 's': case 'S': if (fogTool || locateSession.isActive() || routeSelecting()) handled = false; else cycleSanctuary(e.shiftKey ? -1 : 1); break;
        case 'Delete': case 'Backspace':
          if (sel.tileId && !fogTool && !previewMode) returnSelected(); else handled = false;
          break;
        default: handled = false;
      }
      if (handled) e.preventDefault();
    }

    /* ---- stock handles ---- */

    function handleFromEvent(e) { return e.target.closest && e.target.closest('[data-j2-handle]'); }

    function onHandleDown(e) {
      const h = handleFromEvent(e);
      if (!h || h.disabled || e.button !== 0) return;
      if (pan) endPan();
      cancelTransient();
      exitLocate({ quiet: true }); exitRoute({ quiet: true });
      if (fogTool) setFogTool(null, { quiet: true });          // placement outranks the fog tools: they are mutually exclusive
      clearHint();
      const card = h.closest('[data-batch]');
      const batchId = card.getAttribute('data-batch');
      const batch = Model.batchById(doc, batchId);
      const remaining = Model.derive(doc).counts.get(batchId).remaining;
      const mode = h.getAttribute('data-j2-handle');
      if (!batch || remaining < 1) return;
      const wasArmed = false;
      tr = {
        kind: 'stock', mode: mode, batchId: batchId, docRef: doc, pointerId: e.pointerId, moved: false, handle: h, x0: e.clientX, y0: e.clientY,
        footprint: mode === 'all' ? Model.randomFootprint(remaining) : [{ dq: 0, dr: 0 }],     // rolled once on press (PD-032), frozen for the drag
        seed: (Math.random() * 4294967296) >>> 0,                                               // per-drag seed of the border-fit shape (PD-037)
        preview: null, wasArmed: wasArmed,
      };
      try { h.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
      h.classList.add('is-dragging');
      pointer.cx = e.clientX; pointer.cy = e.clientY;
      updateTip();
      e.preventDefault();
    }

    function onHandleMove(e) {
      if (!tr || tr.kind !== 'stock' || tr.pointerId !== e.pointerId) return;
      pointer.cx = e.clientX; pointer.cy = e.clientY;
      if (!tr.moved && Math.hypot(e.clientX - tr.x0, e.clientY - tr.y0) > CLICK_SLOP_PX) { tr.moved = true; document.body.classList.add('j2-dragging'); }
      if (tr.moved) {
        if (insideViewport(e)) { const [x, y] = localPoint(e); pointer.x = x; pointer.y = y; pointer.inside = true; }
        else pointer.inside = false;
        updatePreview();
      }
    }

    function onHandleUp(e) {
      if (!tr || tr.kind !== 'stock' || tr.pointerId !== e.pointerId) return;
      const t0 = tr;
      const inside = insideViewport(e);
      if (inside) { const [x, y] = localPoint(e); pointer.x = x; pointer.y = y; pointer.inside = true; }
      const preview = t0.moved && inside ? computePreview(t0) : null;
      endTransient();
      markDragged();
      if (!t0.moved) { armStock(t0.mode, t0.batchId, t0.handle); return; }     // a plain click arms click-to-place
      if (!inside) return;                                                       // released outside the map: cancelled, nothing changed
      commitStock(t0, preview);
    }

    function onHandleCancel(e) {
      if (tr && tr.kind === 'stock' && tr.pointerId === e.pointerId) cancelTransient();
    }

    function onHandleKey(e) {
      if ((e.key === 'Enter' || e.key === ' ') && handleFromEvent(e) && !e.target.disabled) {
        // keyboard activation arms click-to-place (the pointer then chooses the cell)
        const h = handleFromEvent(e);
        armStock(h.getAttribute('data-j2-handle'), h.closest('[data-batch]').getAttribute('data-batch'), h);
        e.preventDefault();
      }
    }

    /** Click-to-place (optional supplement): arm a stock action, then click a cell. Esc or re-clicking the handle disarms. */
    function armStock(mode, batchId, handle) {
      if (tr && tr.kind === 'armed' && tr.mode === mode && tr.batchId === batchId) { cancelTransient(); return; }
      cancelTransient();
      exitLocate({ quiet: true }); exitRoute({ quiet: true });
      if (fogTool) setFogTool(null, { quiet: true });
      const remaining = Model.derive(doc).counts.get(batchId).remaining;
      if (remaining < 1) return;
      tr = { kind: 'armed', mode: mode, batchId: batchId, docRef: doc, handle: handle, footprint: mode === 'all' ? Model.randomFootprint(remaining) : [{ dq: 0, dr: 0 }], seed: (Math.random() * 4294967296) >>> 0, preview: null };
      handle.classList.add('is-armed');
      handle.setAttribute('aria-pressed', 'true');
      ui.viewport.classList.add('is-placing');
      updatePreview();
    }

    /* ---- preview ---- */

    /** Small seeded PRNG (mulberry32): the same seed always yields the same sequence. */
    function seededRandom(seed) {
      let a = seed >>> 0;
      return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }

    function computePreview(x) {
      if (!pointer.inside || !data) return null;
      const w = Geo.screenToWorld(cam, pointer.x, pointer.y);
      const anchor = data.grid.worldToCell(w[0], w[1]);
      const offsets = x.kind === 'tile' ? [{ dq: 0, dr: 0 }] : x.footprint;
      let cells = null, fitted = false;
      if (x.kind !== 'tile' && offsets.length > 1) {
        // PD-037: near placed tiles the dashed block takes the shape of the notch under the pointer; cached per (document, anchor) so it never flickers
        const key = anchor.q + ',' + anchor.r;
        if (!x.fit || x.fit.doc !== doc || x.fit.key !== key) {
          const rng = seededRandom((x.seed ^ Math.imul(anchor.q, 73856093) ^ Math.imul(anchor.r, 19349663)) >>> 0);
          x.fit = { doc: doc, key: key, cells: Model.fitFootprint(doc, data.ctx, x.batchId, anchor, offsets.length, rng) };
        }
        if (x.fit.cells) { cells = x.fit.cells; fitted = true; }
      }
      if (!cells) cells = offsets.map(o => ({ q: anchor.q + o.dq, r: anchor.r + o.dr }));
      // the same cell policy AND region-shape rule the commit applies (Model.apply), so preview and result never disagree
      const chk = Model.checkPlacement(doc, data.ctx, x.batchId, cells, x.kind === 'tile' ? x.tileId : null);
      const checked = chk.cells;
      const origin = x.kind === 'tile' && checked[0].id === x.from;
      return { anchor: anchor, fitted: fitted, cells: checked, valid: chk.valid, connected: chk.connected, attached: chk.attached, attachCode: chk.attachCode, separateEligible: chk.separateEligible, isKind: x.kind, isOrigin: origin };
    }

    function updatePreview() {
      if (!tr || !data) return;
      if (tr.kind !== 'armed' && !tr.moved) return;
      tr.preview = computePreview(tr);
      renderPreview();
      updateTip();
    }

    function renderPreview() {
      if (!ui.g) return;
      const p = tr && tr.preview;
      if (!p) { ui.g.preview.innerHTML = ''; return; }
      const batch = Model.batchById(doc, tr.batchId);
      let h = '';
      for (const c of p.cells) {
        const cls = p.separateEligible ? 'is-detached' : c.ok && p.connected && p.attached ? 'is-ok' : 'is-bad';
        h += '<path class="j2-pv ' + cls + (p.isOrigin ? ' is-origin' : '') + '" d="' + hexPath(c.q, c.r) + '"/>';
      }
      // detached candidate: a non-colour marker (a broken-link glyph on every cell) next to the amber dashed outline
      if (p.separateEligible) for (const c of p.cells) { const ctr = data.grid.cellCenter(c.q, c.r); h += '<g class="j2-pv-detach" transform="translate(' + ctr[0] + ' ' + ctr[1] + ')"><circle r="7"/><path d="M-4 4L4 -4"/></g>'; }
      if (batch && p.valid) for (const c of p.cells) if (c.ok) h += '<g class="j2-pv-glyph">' + tileMarkup(c.q, c.r, specOfBatch(batch), 'j2-pvt', true) + '</g>';
      ui.g.preview.innerHTML = h;
    }

    function reasonText(preview) {
      const bad = preview.cells.filter(c => !c.ok);
      if (preview.separateEligible) return t('journey2_detached_hint');
      if (!bad.length) return preview.connected === false ? t('journey2_reason_disconnected_region') : preview.attached === false ? attachText(preview.attachCode, preview.isKind === 'tile' ? 'move' : 'place') : '';
      const first = t('journey2_reason_' + bad[0].reason);
      return bad.length > 1 ? first + ' · ' + fill('journey2_reason_blocked_n', { n: n(bad.length) }) : first;
    }

    function updateTip() {
      if (!ui.tip) return;
      if (!tr || (tr.kind === 'tile' && !tr.moved)) { ui.tip.hidden = true; return; }
      const batch = Model.batchById(doc, tr.batchId);
      const count = tr.kind === 'tile' ? 1 : tr.footprint.length;
      let text, bad = false, warn = false;
      if (tr.kind === 'armed' && !pointer.inside) text = t('journey2_tip_armed');
      else if (tr.kind !== 'armed' && !pointer.inside) text = t('journey2_tip_outside');
      else if (tr.preview && tr.preview.separateEligible) { text = t('journey2_detached_label') + ' · ' + reasonText(tr.preview); warn = true; }
      else if (tr.preview && !tr.preview.valid) { text = reasonText(tr.preview); bad = true; }
      else text = tr.kind !== 'tile' && tr.preview && tr.preview.valid && doc.tiles.length ? t('journey2_connected_label') : '';
      const title = tr.kind === 'tile' ? fill('journey2_tip_move', { name: batchName(batch) }) : fill(count > 1 ? 'journey2_tip_place_all' : 'journey2_tip_place_one', { name: batchName(batch), n: n(count) });
      ui.tip.innerHTML = '<strong></strong><span></span><em></em>';
      ui.tip.children[0].textContent = title;
      ui.tip.children[1].textContent = text;
      ui.tip.children[2].textContent = t('journey2_tip_cancel');
      ui.tip.classList.toggle('is-bad', bad);
      ui.tip.classList.toggle('is-warn', warn);
      ui.tip.hidden = false;
      const x = Math.min(window.innerWidth - ui.tip.offsetWidth - 8, pointer.cx + 18), y = Math.min(window.innerHeight - ui.tip.offsetHeight - 8, pointer.cy + 18);
      ui.tip.style.transform = 'translate(' + Math.max(8, x) + 'px,' + Math.max(8, y) + 'px)';
    }

    /* ---- commit / cancel ---- */

    /** Ends the transient interaction WITHOUT touching committed state; releases capture and removes every ghost. */
    function endTransient() {
      const x = tr;
      tr = null;
      if (ui.g && ui.g.preview) ui.g.preview.innerHTML = '';
      if (ui.tip) ui.tip.hidden = true;
      document.body.classList.remove('j2-dragging');
      if (ui.viewport) ui.viewport.classList.remove('is-moving', 'is-placing');
      if (x) {
        if (x.handle) { x.handle.classList.remove('is-dragging', 'is-armed'); x.handle.removeAttribute('aria-pressed'); try { if (x.pointerId != null && x.handle.hasPointerCapture(x.pointerId)) x.handle.releasePointerCapture(x.pointerId); } catch (err) { /* released */ } }
        if (x.kind === 'tile' && ui.viewport) { try { if (ui.viewport.hasPointerCapture(x.pointerId)) ui.viewport.releasePointerCapture(x.pointerId); } catch (err) { /* released */ } }
      }
    }
    function cancelTransient() { cancelFogStroke(); if (tr) endTransient(); }

    function stale(x) { return x.docRef !== doc; }

    function commitStock(x, preview) {
      if (stale(x)) { hint(t('journey2_hint_stale')); return; }
      if (!preview) return;
      if (!preview.valid) {
        // the only failed rule is "touches the prepared map": offer the explicit override on this exact, frozen candidate
        if (preview.separateEligible) { confirmSeparateArea(x, preview); return; }
        hint(fill('journey2_hint_rejected', { reason: reasonText(preview) })); return;
      }
      placeTiles(x.batchId, preview.cells.map(c => ({ id: Model.newId('t'), cell: c.id })), false);
    }

    /**
     * PD-033: every freshly placed hex gets one Environment of its region's habitat, dealt once here (least used in this region first, random
     * among equals — what already stands counts, manual changes included) and carried by the same atomic `place` command. A region without a
     * habitat list (fully overtaken) deals nothing. The ids are frozen into `tiles`, so a re-dispatched or confirmed candidate keeps them.
     */
    function dealEnvironmentsTo(batchId, tiles) {
      const b = Model.batchById(doc, batchId);
      if (!b || tiles.some(t => t.environmentId)) return;
      const pool = hexEnvironmentList(b).map(e => e.id);
      const used = {};
      for (const t of doc.tiles) if (t.batchId === batchId && t.environmentId) used[t.environmentId] = (used[t.environmentId] || 0) + 1;
      const ids = EnvDeal.dealEnvironments({ pool: pool, used: used, count: tiles.length, random: dealRandom });
      ids.forEach((id, i) => { tiles[i].environmentId = id; });
    }

    /** Dispatches one atomic `place`; `allowDetached` is transient command intent only (never stored). */
    function placeTiles(batchId, tiles, allowDetached) {
      dealEnvironmentsTo(batchId, tiles);
      const cmd = { type: 'place', batchId: batchId, tiles: tiles };
      if (allowDetached) cmd.allowDetached = true;
      const r = dispatch(cmd, 'place', true);
      if (!r.ok) { hint(fill('journey2_hint_rejected', { reason: errorText(r.error) })); return false; }
      announce(fill(allowDetached ? 'journey2_live_separate_started' : 'journey2_live_placed', { n: n(tiles.length) }));
      if (tiles.length === 1 && !inspectorOpen()) sel.tileId = null;
      warnHoles(batchId);
      return true;
    }

    /**
     * "Start separate area": a confirmation for a region that does not touch the prepared map. The candidate (ids and cells) is
     * frozen at the moment of the attempt — confirming commits exactly it, never a re-rolled or re-anchored one; Cancel changes nothing.
     */
    function confirmSeparateArea(x, preview) {
      if (detachedConfirm || editLocked) return;
      const tiles = preview.cells.map(c => ({ id: Model.newId('t'), cell: c.id }));
      detachedConfirm = { batchId: x.batchId, tiles: tiles };
      announce(t('journey2_detached_hint'));
      openDialog({
        title: t('journey2_detached_title'),
        lines: [t('journey2_detached_body')],
        actions: [
          { label: t('journey2_cancel'), kind: 'btn-ghost', value: 'cancel', autofocus: true },
          { label: t('journey2_separate_area'), kind: 'btn-primary', value: 'confirm' },
        ],
      }).then(v => {
        detachedConfirm = null;
        if (inst.disposed) return;
        if (v === 'confirm') { placeTiles(x.batchId, tiles, true); return; }
        const refs = cardRefs.get(x.batchId);
        const back = x.handle && x.handle.isConnected ? x.handle : refs && (x.mode === 'all' ? refs.handleAll : refs.handleOne);
        if (back && !back.disabled) back.focus({ preventScroll: true });
      });
    }

    function commitArmed() {
      const x = tr;
      if (!x) return;
      const preview = computePreview(x);
      if (!preview) return;
      if (!preview.valid && !preview.separateEligible) { hint(fill('journey2_hint_rejected', { reason: reasonText(preview) })); return; }
      const stay = x.mode === 'one' && preview.valid && Model.derive(doc).counts.get(x.batchId).remaining > 1;
      endTransient();
      commitStock(x, preview);
      if (stay) armStock(x.mode, x.batchId, cardRefs.get(x.batchId).handleOne);
    }

    function commitTileMove(x, e) {
      if (stale(x)) { hint(t('journey2_hint_stale')); return; }
      if (!insideViewport(e)) return;                       // dropped outside the map: cancelled, tile stays
      const [px, py] = localPoint(e);
      pointer.x = px; pointer.y = py; pointer.inside = true;
      const preview = computePreview(x);
      if (!preview) return;
      if (preview.isOrigin) return;                          // back on its own cell: a no-op, no history entry
      if (!preview.valid) { hint(fill('journey2_hint_rejected', { reason: reasonText(preview) })); return; }
      const r = dispatch({ type: 'move', tileId: x.tileId, to: preview.cells[0].id }, 'move', true);
      if (!r.ok) hint(fill('journey2_hint_rejected', { reason: errorText(r.error, 'move') }));
      else {
        // the moved hex stays selected only while the inspector is anchored on it (the inspector now carries Return to stock); it follows it
        if (inspectorOpen() && inspector.tileId === x.tileId) sel.tileId = x.tileId;
        renderSelection(); positionInspector(); announce(t('journey2_live_moved')); warnHoles(x.batchId);
      }
    }

    /** Localized text for a prepared-map failure (model codes 'detached-prepared-map' | 'would-split-prepared-map'); `how` is 'place' | 'move' | 'return'. */
    function attachText(code, how) {
      if (code === 'would-split-prepared-map') return t(how === 'return' ? 'journey2_reason_return_split' : how === 'move' ? 'journey2_reason_move_split' : 'journey2_reason_would_split');
      return t('journey2_reason_detached_prepared_map');
    }

    function errorText(err, how) {
      if (err && err.conflicts && err.conflicts.length) return t('journey2_reason_' + err.conflicts[0].reason);
      if (err && err.code === 'disconnected-region') return t('journey2_reason_disconnected_region');
      if (err && (err.code === 'detached-prepared-map' || err.code === 'would-split-prepared-map')) return attachText(err.code, how);
      return t('journey2_gen_failed');
    }

    function returnSelected() {
      if (!sel.tileId) return;
      const tile = Model.derive(doc).byId.get(sel.tileId);
      const r = dispatch({ type: 'returnTile', tileId: sel.tileId }, 'returnTile');
      if (r.ok) { sel.tileId = null; renderSelection(); announce(t('journey2_live_returned')); if (tile) warnHoles(tile.batchId); }
      else hint(fill('journey2_hint_rejected', { reason: errorText(r.error, 'return') }));
    }

    function hint(msg) {
      if (!ui.hint) return;
      ui.hint.textContent = msg;
      ui.hint.hidden = false;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { if (ui.hint) ui.hint.hidden = true; }, HINT_MS);
      announce(msg);
    }
    function clearHint() { clearTimeout(hintTimer); if (ui.hint) ui.hint.hidden = true; }
    function announce(msg) {
      if (!ui.live) return;
      ui.live.textContent = '';
      clearTimeout(liveTimer);
      liveTimer = setTimeout(() => { if (ui.live) ui.live.textContent = msg; }, 20);
    }

    /* ---- document-level keys ---- */

    function onDocumentKey(e) {
      if (inst.disposed) return;
      if (e.key === 'Escape') {
        if (document.querySelector('dialog[open]') || document.querySelector('.modal-overlay')) return;   // an environment overlay (app.js) owns Escape while it is open
        if (printOpen) { closePrintPreview({ focus: true }); e.preventDefault(); return; }
        if (openMenu) { const b = openMenu.btn; closeMenus(); b.focus(); return; }
        // priority: menu, a fog stroke, a drag / armed placement / pan, Player Preview, the fog tool, the Region Inspector, then the diagnostic selection
        if (fogStroke) { cancelFogStroke(true); e.preventDefault(); return; }
        if (pan) { setCamera({ scale: pan.scale0, tx: pan.tx0, ty: pan.ty0 }); endPan(); e.preventDefault(); return; }
        if (tr) { cancelTransient(); e.preventDefault(); return; }
        if (routeSelecting()) { routeEscape(); e.preventDefault(); return; }                         // choosing A or B: step back / leave the Route Planner (no document change)
        if (locateSession.isActive()) { exitLocate({ focus: true }); e.preventDefault(); return; }   // a result or the selection: leave Locate (no document change)
        if (fogTool) { setFogTool(null); e.preventDefault(); return; }
        if (previewMode) { leavePreview(); e.preventDefault(); return; }
        if (sanctuaryOpen) { closeSanctuary({ focus: true }); e.preventDefault(); return; }
        if (inspectorOpen()) { closeInspector({ focus: true }); e.preventDefault(); return; }
        if (routePlanner.isActive()) { routeEscape(); e.preventDefault(); return; }                   // a shown route closes last, after the panels above it
        if (e.target === ui.viewport) { sel.tileId = null; selCell = null; selMarker = null; placeMode = false; renderSelection(); renderInventory(false); updateReadouts(); }
        return;
      }
      if (e.key === ' ' && fogTool && !isEditableTarget(e.target) && fogSpaceTarget(e.target)) {
        // a fog tool takes the primary drag, so Space held = temporary pan (the key must not also press a focused toolbar button)
        spaceDown = true; ui.viewport.classList.add('is-space'); e.preventDefault(); return;
      }
      if (isEditableTarget(e.target) || e.defaultPrevented) return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { undo(); e.preventDefault(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { redo(); e.preventDefault(); }
    }

    /** Space pans (rather than activating something) only when focus is on the map, the page body or one of the fog toolbar buttons. */
    function fogSpaceTarget(t0) { return t0 === document.body || t0 === ui.viewport || !!(t0 && t0.closest && t0.closest('[data-j2-fog-group], [data-j2-echo-group], [data-j2-preview-bar], [data-j2-rail]')); }

    function onDocumentKeyUp(e) {
      if (inst.disposed || e.key !== ' ' || !spaceDown) return;
      spaceDown = false;
      if (ui.viewport) ui.viewport.classList.remove('is-space');
      if (fogTool && fogSpaceTarget(e.target)) e.preventDefault();     // swallow the click a released Space would send to a focused button
    }

    /* ============================================================
       Toolbar / menus / root events
       ============================================================ */

    function onRootClick(e) {
      const b = e.target.closest('button');
      if (!b || !ui.root.contains(b)) return;
      if (b.hasAttribute('data-j2-zoom')) {
        const z = b.getAttribute('data-j2-zoom');
        if (z === 'reset') zoomToScale(1);
        else if (b.getAttribute('aria-disabled') !== 'true') zoomStep(z === 'in' ? 1 : -1);
      }
      else if (b.hasAttribute('data-j2-card-toggle')) toggleCard(b.closest('[data-batch]').getAttribute('data-batch'));
      else if (b.hasAttribute('data-j2-inspect')) {
        const id = b.closest('[data-batch]').getAttribute('data-batch');
        if (inspectorOpen() && inspector.batchId === id) closeInspector({ focus: true });
        else { openInspectorFromCard(id); focusRegion(id); }
      }
      else if (b.hasAttribute('data-j2-insp-close')) closeInspector({ focus: true });
      else if (b.hasAttribute('data-j2-roll')) rollEncounter();
      else if (b.hasAttribute('data-j2-delete')) confirmDelete(b.closest('[data-batch]').getAttribute('data-batch'));
      else if (b.hasAttribute('data-j2-side-toggle')) toggleSide();
      else if (b.hasAttribute('data-j2-fit')) fitToView();
      else if (b.hasAttribute('data-j2-biome-colors')) toggleBiomeColors();
      else if (b.hasAttribute('data-j2-fog-tool')) setFogTool(b.getAttribute('data-j2-fog-tool'));
      else if (b.hasAttribute('data-j2-echo-place')) placeSoulEchoes();
      else if (b.hasAttribute('data-j2-echo-clear')) confirmClearSoulEchoes();
      else if (b.hasAttribute('data-j2-route-plan')) startRoute();
      else if (b.hasAttribute('data-j2-route-cancel')) exitRoute({ focus: true });
      else if (b.hasAttribute('data-j2-route-details-close')) closeRouteDetails();
      else if (b.hasAttribute('data-j2-route-strategy')) chooseRouteStrategy(b.getAttribute('data-j2-route-strategy'));
      else if (b.hasAttribute('data-j2-echo-locate')) startLocate();
      else if (b.hasAttribute('data-j2-locate-again')) chooseLocateAgain();
      else if (b.hasAttribute('data-j2-locate-close') || b.hasAttribute('data-j2-locate-cancel')) exitLocate({ focus: true });
      else if (b.hasAttribute('data-j2-seek-less')) stepSeekers(-1);
      else if (b.hasAttribute('data-j2-seek-more')) stepSeekers(1);
      else if (b.hasAttribute('data-j2-seek-close')) closeSeekers();
      else if (b.hasAttribute('data-j2-echo-collect')) toggleEchoCollected();
      else if (b.hasAttribute('data-j2-sanc-generate')) generateSanctuaries();
      else if (b.hasAttribute('data-j2-sanc-close')) closeSanctuary({ focus: true });
      else if (b.hasAttribute('data-j2-sanc-name')) toggleSanctuaryName();
      else if (b.hasAttribute('data-j2-sanc-reroll')) rerollSanctuary();
      else if (b.hasAttribute('data-j2-sanc-delete')) confirmDeleteSanctuary();
      else if (b.hasAttribute('data-j2-preview-back')) leavePreview();
      else if (b.hasAttribute('data-j2-print-open')) openPrintPreview();
      else if (b.hasAttribute('data-j2-preview')) enterPreview();
      else if (b.hasAttribute('data-j2-undo')) undo();
      else if (b.hasAttribute('data-j2-redo')) redo();
      else if (b.hasAttribute('data-j2-return')) returnSelected();
      else if (b.hasAttribute('data-j2-hexenv')) onHexEnvClick(b);
      else if (b.hasAttribute('data-j2-menu-btn')) toggleMenu(b);
      else if (b.hasAttribute('data-j2-act')) { closeMenus(); runAction(b.getAttribute('data-j2-act')); }
      else if (b.hasAttribute('data-j2-layer')) toggleLayer(b.getAttribute('data-j2-layer'), b);
      else if (b.hasAttribute('data-j2-panel-close')) setDiagnostics(false);
      else if (b.hasAttribute('data-j2-cell')) selectCellById(b.getAttribute('data-j2-cell'), true);
      else if (b.hasAttribute('data-j2-jump')) {
        const cp = data.template.grid.controlPoints.find(c => c.id === b.getAttribute('data-j2-jump'));
        if (cp) { selectCellById(cp.id, false); centerOnWorld(cp.observedCenterPx[0], cp.observedCenterPx[1], Math.max(cam.scale, 3)); }
      } else if (b.hasAttribute('data-j2-place')) {
        placeMode = !placeMode; b.setAttribute('aria-pressed', String(placeMode));
        if (placeMode && !layers.proof) toggleLayer('proof', ui.root.querySelector('[data-j2-layer="proof"]'));
        ui.viewport.classList.toggle('is-placing', placeMode);
      } else if (b.hasAttribute('data-j2-clear')) clearProof();
      else if (b.hasAttribute('data-j2-print')) runPrint(b.getAttribute('data-j2-print'));
    }

    function toggleMenu(btn) {
      const name = btn.getAttribute('data-j2-menu-btn');
      const menu = ui.root.querySelector('[data-j2-menu="' + name + '"]');
      if (openMenu && openMenu.menu === menu) { closeMenus(); return; }
      closeMenus();
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      openMenu = { btn: btn, menu: menu };
      const first = menu.querySelector('.j2-menu-item');
      if (first) first.focus();
    }
    function closeMenus() {
      if (!openMenu) return;
      openMenu.menu.hidden = true;
      openMenu.btn.setAttribute('aria-expanded', 'false');
      openMenu = null;
    }

    function runAction(act) {
      if (act === 'export') exportBackup();
      else if (act === 'import') { cancelTransient(); importInput.value = ''; importInput.click(); }
      else if (act === 'diagnostics') setDiagnostics(!diagOpen);
      else if (act === 'start-empty') startEmptyMap();
    }

    function onMenuKey(e) {
      if (!openMenu || !openMenu.menu.contains(document.activeElement)) return;
      const items = Array.from(openMenu.menu.querySelectorAll('.j2-menu-item'));
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { items[(i + 1) % items.length].focus(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { items[(i - 1 + items.length) % items.length].focus(); e.preventDefault(); }
    }

    /* ============================================================
       Backup export / import
       ============================================================ */

    function backupFileName() { return 'bacchus-atlas-journey-map-' + new Date().toISOString().slice(0, 10) + '.json'; }

    function download(text, name) {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      urls.push(url);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener';
      a.style.display = 'none';
      ui.root.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => { const i = urls.indexOf(url); if (i >= 0) urls.splice(i, 1); URL.revokeObjectURL(url); }, 4000);
    }

    function exportBackup() {
      download(Model.serializeBackup(doc), backupFileName());
      toast(t('journey2_export_done'));
    }

    function openDialog(spec) {
      return new Promise(resolve => {
        const dlg = el('dialog', { class: 'j2-dialog', 'aria-labelledby': 'j2-dlg-title' });
        dlg.innerHTML = '<form method="dialog" class="j2-dialog-in"><h3 class="j2-dialog-title" id="j2-dlg-title"></h3><div class="j2-dialog-body"></div><div class="j2-dialog-actions"></div></form>';
        dlg.querySelector('.j2-dialog-title').textContent = spec.title;
        const body = dlg.querySelector('.j2-dialog-body');
        for (const line of spec.lines || []) { const p = document.createElement('p'); p.textContent = line; body.appendChild(p); }
        if (spec.list && spec.list.length) { const ul = document.createElement('ul'); ul.className = 'j2-dialog-list'; for (const li of spec.list) { const x = document.createElement('li'); x.textContent = li; ul.appendChild(x); } body.appendChild(ul); }
        const actions = dlg.querySelector('.j2-dialog-actions');
        let result = null;
        for (const a of spec.actions) {
          const b = el('button', { type: 'button', class: 'btn btn-sm ' + (a.kind || '') });
          b.textContent = a.label;
          b.addEventListener('click', () => { if (a.keepOpen) { a.run(); return; } result = a.value; dlg.close(); });
          actions.appendChild(b);
          if (a.autofocus) b.setAttribute('autofocus', '');
        }
        dlg.addEventListener('close', () => { dialogs.delete(dlg); dlg.remove(); resolve(result); });
        ui.root.appendChild(dlg);
        dialogs.add(dlg);
        dlg.showModal();
      });
    }

    function onImportFile() {
      const file = importInput.files && importInput.files[0];
      if (!file) return;
      if (file.size > Model.MAX_IMPORT_BYTES) { showImportError({ code: 'invalid', errors: [fill('journey2_import_too_big', { mb: Model.MAX_IMPORT_BYTES / 1048576 })] }); return; }
      const reader = new FileReader();
      reader.onerror = () => { if (!inst.disposed) showImportError({ code: 'invalid', errors: [t('journey2_import_unreadable')] }); };
      reader.onload = () => { if (!inst.disposed) handleImportText(String(reader.result)); };
      reader.readAsText(file);
    }

    function showImportError(r) {
      return openDialog({
        title: t('journey2_import_error_title'),
        lines: [t('journey2_import_code_' + String(r.code).replace(/-/g, '_')), t('journey2_import_error_hint')],
        list: (r.errors || []).slice(0, 6),
        actions: [{ label: t('journey2_close'), kind: 'btn-primary', value: 'close', autofocus: true }],
      });
    }

    async function handleImportText(text) {
      const r = Model.parseBackupText(text, data.ctx);
      if (!r.ok) { await showImportError(r); return; }
      if (inst.disposed) return;
      closeInspector({ quiet: true });                   // a replaced map never keeps a stale inspector
      const hasData = !Model.isEmptyDocument(doc);
      if (hasData) {
        // Nothing is written until the user confirms: a cancelled or failed import changes nothing at all.
        const lines = [fill('journey2_import_replace_msg', { batches: n(doc.batches.length), tiles: n(doc.tiles.length) })];
        if (saveState.status !== 'unavailable') lines.push(t('journey2_import_recovery_kept'));
        const choice = await openDialog({
          title: t('journey2_import_title'), lines: lines,
          actions: [
            { label: t('journey2_import_download_first'), kind: 'btn-ghost', keepOpen: true, run: () => download(Model.serializeBackup(doc), backupFileName()) },
            { label: t('journey2_cancel'), kind: 'btn-ghost', value: 'cancel', autofocus: true },
            { label: t('journey2_import_replace'), kind: 'btn-danger', value: 'replace' },
          ],
        });
        if (choice !== 'replace' || inst.disposed) return;     // cancelled: nothing changed
        if (saveState.status !== 'unavailable') {
          const prev = store.savePrevious(doc);
          if (!prev.ok) { await showImportError({ code: 'invalid', errors: [t('journey2_import_recovery_failed')] }); return; }   // no recovery copy: replace nothing
        }
      }
      replaceDocument(r.doc);
      toast(t('journey2_import_done'));
    }

    /** Replaces the whole document (import / start-empty). Clears Undo so history can never combine two different maps. */
    function replaceDocument(next) {
      cancelTransient();
      leavePreview({ quiet: true });                     // import / reset: no preview, no fog tool, no stale stroke, no inspector
      setFogTool(null, { quiet: true });
      exitLocate({ quiet: true });                       // import / reset: no compass, no stale origin or target
      exitRoute({ quiet: true });                        // ... and no stale route
      closeInspector({ quiet: true });
      closeSanctuary({ quiet: true });
      doc = next;
      Model.historyClear(history);
      sel.tileId = null;
      if (editLocked) { editLocked = false; loadInfo = { status: 'ok' }; }
      persist();
      renderAll(true);
    }

    function startEmptyMap() {
      openDialog({
        title: t('journey2_corrupt_start_empty'), lines: [t('journey2_corrupt_confirm')],
        actions: [
          { label: t('journey2_cancel'), kind: 'btn-ghost', value: 'cancel', autofocus: true },
          { label: t('journey2_corrupt_start_empty'), kind: 'btn-danger', value: 'go' },
        ],
      }).then(v => { if (v === 'go' && !inst.disposed) replaceDocument(Model.emptyDocument(data.ctx)); });
    }

    /* ============================================================
       Diagnostics (Phase 0 inspector) — secondary, closed by default
       ============================================================ */

    function setDiagnostics(open) {
      if (open) { closeInspector({ quiet: true }); closeSanctuary({ quiet: true }); }   // the inspector, the sanctuary overlay and the diagnostics drawer never share the map
      diagOpen = open;
      ui.panel.hidden = !open;
      ui.root.classList.toggle('is-diag-open', open);
      const item = ui.root.querySelector('[data-j2-act="diagnostics"]');
      if (item) item.setAttribute('aria-checked', String(open));
      if (!open) { hoverCell = null; hoverMarker = null; selCell = null; selMarker = null; placeMode = false; ui.viewport.classList.remove('is-placing', 'is-over-marker'); renderSelection(); }
      updateReadouts();                                   // opening or closing the drawer never moves the camera; only an explicit Fit does
    }

    function buildPanel() {
      const sym = data.symbols.map(s => '<option value="' + esc(s.id) + '">' + esc(s.sourceLabel) + '</option>').join('');
      ui.panel.innerHTML = `
        <header class="j2-panel-head"><h3 class="j2-panel-title" data-t="journey2_diagnostics"></h3>
          <button type="button" class="btn btn-ghost btn-sm j2-btn-icon" data-j2-panel-close data-t-aria="journey2_close" data-t-title="journey2_close">${ICON.close}</button></header>
        <div class="j2-panel-scroll">
          <section class="j2-sec">
            <h3 class="j2-sec-title" data-t="journey2_layers_label"></h3>
            <div class="j2-layerbtns">
              <button type="button" class="btn btn-ghost btn-sm" data-j2-layer="grid" aria-pressed="false" data-t="journey2_layer_grid"></button>
              <button type="button" class="btn btn-ghost btn-sm" data-j2-layer="control" aria-pressed="false" data-t="journey2_layer_control"></button>
              <button type="button" class="btn btn-ghost btn-sm" data-j2-layer="markers" aria-pressed="false" data-t="journey2_layer_markers"></button>
              <button type="button" class="btn btn-ghost btn-sm" data-j2-layer="protection" aria-pressed="false" data-t="journey2_layer_protection"></button>
              <button type="button" class="btn btn-ghost btn-sm" data-j2-layer="proof" aria-pressed="false" data-t="journey2_layer_proof"></button>
            </div>
          </section>
          <section class="j2-sec">
            <h3 class="j2-sec-title" data-t="journey2_sec_status"></h3>
            <p class="j2-verdict" data-j2-verdict></p>
            <ul class="j2-reasons" data-j2-reasons></ul>
            <ul class="j2-slots" data-j2-slots></ul>
          </section>
          <section class="j2-sec">
            <h3 class="j2-sec-title" data-t="journey2_sec_pointer"></h3>
            <dl class="j2-kv">
              <dt data-t="journey2_k_world"></dt><dd data-j2-pt-world>—</dd>
              <dt data-t="journey2_k_cell"></dt><dd data-j2-pt-cell>—</dd>
              <dt data-t="journey2_k_marker"></dt><dd data-j2-pt-marker>—</dd>
            </dl>
          </section>
          <section class="j2-sec">
            <h3 class="j2-sec-title" data-t="journey2_sec_cell"></h3>
            <form class="j2-goto" data-j2-goto>
              <label class="sr-only" for="j2-goto-input" data-t="journey2_goto_label"></label>
              <input id="j2-goto-input" class="j2-input" type="text" inputmode="text" autocomplete="off" spellcheck="false" data-t-ph="journey2_goto_ph" data-j2-goto-input>
              <button type="submit" class="btn btn-ghost btn-sm" data-t="journey2_goto"></button>
            </form>
            <p class="j2-field-error" data-j2-goto-error role="alert" hidden></p>
            <dl class="j2-kv" data-j2-cell-kv>
              <dt data-t="journey2_k_id"></dt><dd data-j2-cell-id>—</dd>
              <dt data-t="journey2_k_center"></dt><dd data-j2-cell-center>—</dd>
              <dt data-t="journey2_k_valid"></dt><dd data-j2-cell-valid>—</dd>
            </dl>
            <ul class="j2-nbrs" data-j2-nbrs aria-label="" data-t-aria="journey2_neighbors"></ul>
          </section>
          <section class="j2-sec">
            <h3 class="j2-sec-title" data-t="journey2_sec_marker"></h3>
            <dl class="j2-kv" data-j2-marker-kv>
              <dt data-t="journey2_k_id"></dt><dd data-j2-m-id>—</dd>
              <dt data-t="journey2_k_kind"></dt><dd data-j2-m-kind>—</dd>
              <dt data-t="journey2_k_cell"></dt><dd data-j2-m-cell>—</dd>
              <dt data-t="journey2_k_panel"></dt><dd data-j2-m-panel>—</dd>
              <dt data-t="journey2_k_label"></dt><dd data-j2-m-label>—</dd>
              <dt data-t="journey2_k_status"></dt><dd data-j2-m-status>—</dd>
            </dl>
          </section>
          <section class="j2-sec">
            <h3 class="j2-sec-title"><span data-t="journey2_sec_control"></span> <span class="j2-count" data-j2-control-count></span></h3>
            <ol class="j2-ctl-list" data-j2-ctl-list></ol>
          </section>
          <section class="j2-sec">
            <h3 class="j2-sec-title" data-t="journey2_sec_proof"></h3>
            <p class="j2-note" data-t="journey2_proof_note"></p>
            <div class="j2-row">
              <label class="j2-label" for="j2-proof-symbol" data-t="journey2_proof_symbol"></label>
              <select id="j2-proof-symbol" class="j2-select" data-j2-proof-symbol>${sym}</select>
            </div>
            <div class="j2-row">
              <button type="button" class="btn btn-ghost btn-sm" data-j2-place aria-pressed="false" data-t="journey2_proof_place"></button>
              <button type="button" class="btn btn-ghost btn-sm" data-j2-clear data-t="journey2_proof_clear"></button>
              <span class="j2-count" data-j2-proof-count></span>
            </div>
          </section>
          <section class="j2-sec">
            <h3 class="j2-sec-title" data-t="journey2_sec_print"></h3>
            <p class="j2-note" data-t="journey2_print_note"></p>
            <div class="j2-col" data-j2-print-buttons></div>
            <p class="j2-note j2-print-status" data-j2-print-status role="status"></p>
          </section>
        </div>`;
      ui.p = {
        verdict: ui.panel.querySelector('[data-j2-verdict]'), reasons: ui.panel.querySelector('[data-j2-reasons]'), slots: ui.panel.querySelector('[data-j2-slots]'),
        ptWorld: ui.panel.querySelector('[data-j2-pt-world]'), ptCell: ui.panel.querySelector('[data-j2-pt-cell]'), ptMarker: ui.panel.querySelector('[data-j2-pt-marker]'),
        cellId: ui.panel.querySelector('[data-j2-cell-id]'), cellCenter: ui.panel.querySelector('[data-j2-cell-center]'), cellValid: ui.panel.querySelector('[data-j2-cell-valid]'),
        nbrs: ui.panel.querySelector('[data-j2-nbrs]'), gotoInput: ui.panel.querySelector('[data-j2-goto-input]'), gotoError: ui.panel.querySelector('[data-j2-goto-error]'),
        mId: ui.panel.querySelector('[data-j2-m-id]'), mKind: ui.panel.querySelector('[data-j2-m-kind]'), mCell: ui.panel.querySelector('[data-j2-m-cell]'),
        mPanel: ui.panel.querySelector('[data-j2-m-panel]'), mLabel: ui.panel.querySelector('[data-j2-m-label]'), mStatus: ui.panel.querySelector('[data-j2-m-status]'),
        ctlList: ui.panel.querySelector('[data-j2-ctl-list]'), ctlCount: ui.panel.querySelector('[data-j2-control-count]'),
        proofSymbol: ui.panel.querySelector('[data-j2-proof-symbol]'), place: ui.panel.querySelector('[data-j2-place]'),
        proofCount: ui.panel.querySelector('[data-j2-proof-count]'), printButtons: ui.panel.querySelector('[data-j2-print-buttons]'),
        printStatus: ui.panel.querySelector('[data-j2-print-status]'),
      };
      renderControlList();
      ui.p.printButtons.innerHTML = PRINT_PROOFS.map(pp => '<button type="button" class="btn btn-ghost btn-sm" data-j2-print="' + pp.id + '"><span data-t="' + pp.titleKey + '"></span></button>').join('');
    }

    function renderControlList() {
      if (!ui.p || !data) return;
      const cps = data.template.grid.controlPoints;
      ui.p.ctlCount.textContent = String(cps.length);
      ui.p.ctlList.innerHTML = cps.map((cp, i) =>
        '<li><button type="button" class="j2-ctl-item" data-j2-jump="' + esc(cp.id) + '"><span class="j2-ctl-num">' + (i + 1) + '</span>' +
        '<span class="j2-ctl-name">' + esc(cp.label) + '</span><span class="j2-ctl-res">' + fmt(cp.residualPx, 2) + ' px</span></button></li>').join('');
    }

    function updateStatus() {
      if (!data || !ui.p) return;
      const ok = data.readiness.ready;
      ui.p.verdict.textContent = ok ? t('journey2_verdict_ready') : t('journey2_verdict_not_ready');
      ui.p.reasons.innerHTML = ok ? '' : data.readiness.reasons.map(r => '<li>' + esc(r) + '</li>').join('');
      const v = data.template.verification || {};
      const rows = [['preparedAssets', 'journey2_slot_assets'], ['geometry', 'journey2_slot_geometry'], ['browserBehavior', 'journey2_slot_browser'], ['printProof', 'journey2_slot_print'], ['physicalPrintTest', 'journey2_slot_physical']];
      ui.p.slots.innerHTML = rows.map(([k, key]) => {
        const s = (v[k] && v[k].status) || 'pending';
        const cls = s === 'pass' ? 'ok' : s === 'fail' ? 'bad' : 'warn';
        return '<li><span class="j2-slot-name">' + esc(t(key)) + '</span><span class="j2-chip j2-chip--' + cls + '">' + esc(s) + '</span></li>';
      }).join('');
    }

    function updateReadouts() {
      if (!data || !ui.zoomReadout) return;
      const pct = Math.round(cam.scale * 100);
      ui.zoomReadout.textContent = pct + '%';
      ui.zoomReadout.setAttribute('aria-label', fill('journey2_zoom_reset_aria', { n: pct }));
      for (const z of ['in', 'out']) {
        const btn = ui.root.querySelector('[data-j2-zoom="' + z + '"]');
        if (btn) btn.setAttribute('aria-disabled', String(Geo.stepZoom(cam.scale, z === 'in' ? 1 : -1) === cam.scale));
      }
      if (!ui.p || !diagOpen) return;
      const p = ui.p;
      if (pointer.inside) {
        const w = Geo.screenToWorld(cam, pointer.x, pointer.y);
        p.ptWorld.textContent = fmt(w[0], 1) + ', ' + fmt(w[1], 1);
        const c = data.grid.worldToCell(w[0], w[1]);
        p.ptCell.textContent = Geo.cellId(c.q, c.r) + (data.grid.isValid(c.q, c.r) ? '' : ' · ' + t('journey2_outside'));
      } else { p.ptWorld.textContent = '—'; p.ptCell.textContent = '—'; }
      p.ptMarker.textContent = hoverMarker ? hoverMarker.stableId + ' · ' + t('journey2_kind_' + hoverMarker.kind) : '—';
      const sc = selCell;
      if (sc) {
        const ctr = data.grid.cellCenter(sc.q, sc.r);
        p.cellId.textContent = Geo.cellId(sc.q, sc.r);
        p.cellCenter.textContent = fmt(ctr[0], 1) + ', ' + fmt(ctr[1], 1);
        p.cellValid.textContent = data.grid.isValid(sc.q, sc.r) ? t('journey2_yes') : t('journey2_no');
        p.nbrs.innerHTML = data.grid.neighbors(sc.q, sc.r).map(nb =>
          '<li><button type="button" class="j2-nbr' + (nb.valid ? '' : ' is-outside') + '" data-j2-cell="' + nb.id + '"' + (nb.valid ? '' : ' disabled') + '>' +
          '<span class="j2-nbr-dir">' + nb.name.toUpperCase() + '</span><span class="j2-nbr-id">' + nb.id + '</span><span class="j2-nbr-state">' + (nb.valid ? '' : t('journey2_outside')) + '</span></button></li>').join('');
      } else {
        p.cellId.textContent = '—'; p.cellCenter.textContent = '—'; p.cellValid.textContent = '—';
        p.nbrs.innerHTML = '';
      }
      const m = selMarker;
      p.mId.textContent = m ? m.stableId : '—';
      p.mKind.textContent = m ? t('journey2_kind_' + m.kind) + (m.glyphClass ? ' · ' + m.glyphClass : '') : '—';
      p.mCell.textContent = m ? m.cellId : '—';
      p.mPanel.textContent = m ? m.sourcePanel + ' ' + m.sourcePixelAnchor.join(', ') : '—';
      p.mLabel.textContent = m ? (m.builtInLabel ? m.builtInLabel.text + ' (' + t('journey2_in_artwork') + ')' : t('journey2_none')) : '—';
      p.mStatus.textContent = m ? m.verificationStatus : '—';
      p.proofCount.textContent = userPlacements.length ? String(userPlacements.length) : '';
    }

    function toggleLayer(name, btn) {
      layers[name] = !layers[name];
      if (btn) btn.setAttribute('aria-pressed', String(layers[name]));
      applyLayerVisibility();
      if (name === 'proof') renderProof();
    }

    function applyLayerVisibility() {
      for (const k of Object.keys(layers)) { const g = ui.g[k]; if (g) g.style.display = layers[k] && !previewMode ? '' : 'none'; }   // Player Preview never shows a diagnostic layer
      ui.badge.hidden = !layers.proof || previewMode;
    }

    function clearProof() {
      userPlacements = [];
      placeMode = false;
      const pb = ui.root.querySelector('[data-j2-place]');
      if (pb) pb.setAttribute('aria-pressed', 'false');
      ui.viewport.classList.remove('is-placing');
      if (layers.proof) toggleLayer('proof', ui.root.querySelector('[data-j2-layer="proof"]'));
      renderProof();
      updateReadouts();
    }

    function markerAt(wx, wy) {
      let best = null, bestD = Infinity;
      for (const a of data.anchorsDoc.anchors) {
        const hr = a.hitArea.rectPx;
        const inRect = wx >= hr[0] && wx <= hr[0] + hr[2] && wy >= hr[1] && wy <= hr[1] + hr[3];
        const d = Math.hypot(wx - a.worldPixelAnchor[0], wy - a.worldPixelAnchor[1]);
        if ((inRect || d * cam.scale <= MARKER_HIT_SCREEN_PX) && d < bestD) { best = a; bestD = d; }
      }
      return best;
    }

    /** Neutral GM hover over a hex with an assignment: the Environment's current-language name in the shared tooltip. Never while a drag, fog tool, placement or preview is active. */
    function hideEnvTip() { if (envTipKey) { envTipKey = null; if (ui.tip) ui.tip.hidden = true; } }

    function updateEnvTip(c) {
      const tile = !tr && !pan && !fogStroke && !fogTool && !previewMode && !placeMode && pointer.inside && !sanctuaryAtScreen(pointer.x, pointer.y) ? Model.derive(doc).occupancy.get(Geo.cellId(c.q, c.r)) : null;
      if (!tile || !tile.environmentId) { if (envTipKey) { envTipKey = null; ui.tip.hidden = true; } return; }
      const b = Model.batchById(doc, tile.batchId), found = b ? hexEnvironmentList(b).find(e => e.id === tile.environmentId) : null;
      ui.tip.innerHTML = '<strong></strong><span></span>';
      ui.tip.children[0].textContent = found ? found.name : t('journey2_hexenv_unavailable');
      ui.tip.children[1].textContent = '';
      ui.tip.classList.remove('is-bad', 'is-warn');
      ui.tip.hidden = false;
      envTipKey = tile.id;
      const x = Math.min(window.innerWidth - ui.tip.offsetWidth - 8, pointer.cx + 18), y = Math.min(window.innerHeight - ui.tip.offsetHeight - 8, pointer.cy + 18);
      ui.tip.style.transform = 'translate(' + Math.max(8, x) + 'px,' + Math.max(8, y) + 'px)';
    }

    /** Neutral GM hover over a generated sanctuary icon: its name and whether players can see it (nothing about Soul Echoes or the tables). */
    function updateSanctuaryTip() {
      const id = !tr && !pan && !fogStroke && !fogTool && !previewMode && !placeMode && pointer.inside ? sanctuaryAtScreen(pointer.x, pointer.y) : null;
      // while that sanctuary's own overlay is open the pointer normally still rests on its icon: the tip would sit on top of the overlay text
      const e = id && id !== sanctuaryOpen ? sanctuaryEntry(id) : null;
      if (!e) { if (envTipKey && String(envTipKey).indexOf('sanc:') === 0) hideEnvTip(); return; }
      ui.tip.innerHTML = '<strong></strong><span></span>';
      ui.tip.children[0].textContent = fill(Model.isSanctuaryNameRevealed(doc, id) ? 'journey2_sanc_tip_name_visible' : 'journey2_sanc_tip_name_hidden', { name: sanctuaryTitle(e) });
      ui.tip.children[1].textContent = '';
      ui.tip.classList.remove('is-bad', 'is-warn');
      ui.tip.hidden = false;
      envTipKey = 'sanc:' + id;
      const x = Math.min(window.innerWidth - ui.tip.offsetWidth - 8, pointer.cx + 18), y = Math.min(window.innerHeight - ui.tip.offsetHeight - 8, pointer.cy + 18);
      ui.tip.style.transform = 'translate(' + Math.max(8, x) + 'px,' + Math.max(8, y) + 'px)';
    }

    function updateHover() {
      if (!data || !doc) return;
      const w = Geo.screenToWorld(cam, pointer.x, pointer.y);
      const c = data.grid.worldToCell(w[0], w[1]);
      ui.viewport.classList.toggle('is-over-tile', !editLocked && !previewMode && !fogTool && Model.derive(doc).occupancy.has(Geo.cellId(c.q, c.r)));
      ui.viewport.classList.toggle('is-over-sanctuary', !fogTool && !!sanctuaryAtScreen(pointer.x, pointer.y));
      updateEnvTip(c);
      updateSanctuaryTip();
      if (!diagOpen) return;
      hoverCell = data.grid.isValid(c.q, c.r) ? c : null;
      hoverMarker = markerAt(w[0], w[1]);
      ui.viewport.classList.toggle('is-over-marker', !!hoverMarker && !placeMode);
      renderSelection();
      updateReadouts();
    }

    /** Diagnostic-only click: cell / marker inspection and the temporary proof placement. */
    function handleDiagClick(sx, sy) {
      const w = Geo.screenToWorld(cam, sx, sy);
      const c = data.grid.worldToCell(w[0], w[1]);
      const valid = data.grid.isValid(c.q, c.r);
      if (placeMode) {
        if (!valid) return;
        const sym = data.symbols.find(s => s.id === proofSymbolId) || data.symbols[0];
        const idx = userPlacements.findIndex(p => p.q === c.q && p.r === c.r);
        const dots = (userPlacements.length % 4) + 1;
        if (idx >= 0) userPlacements.splice(idx, 1); else userPlacements.push({ q: c.q, r: c.r, symbolId: sym.id, dots: dots });
        selCell = c;
        renderProof(); renderSelection(); updateReadouts();
        return;
      }
      const m = markerAt(w[0], w[1]);
      selMarker = m;
      if (m) selCell = Geo.parseCellId(m.cellId);
      else selCell = valid ? c : null;
      renderSelection(); updateReadouts();
    }

    function selectCellById(id, center) {
      const c = Geo.parseCellId(id);
      if (!c || !data.grid.isValid(c.q, c.r)) return false;
      selCell = c; selMarker = null;
      if (center) { const ctr = data.grid.cellCenter(c.q, c.r); centerOnWorld(ctr[0], ctr[1], Math.max(cam.scale, 2.5)); }
      renderSelection(); updateReadouts();
      return true;
    }

    function onGoto(e) {
      e.preventDefault();
      const raw = ui.p.gotoInput.value.trim();
      const ok = selectCellById(raw, true);
      ui.p.gotoError.hidden = ok;
      ui.p.gotoError.textContent = ok ? '' : t('journey2_goto_error');
    }

    function renderDiagSelectMarkup() {
      if (!data || !diagOpen) return '';
      let h = '';
      const focus = selCell || hoverCell;
      if (focus) {
        for (const nb of data.grid.neighbors(focus.q, focus.r)) {
          h += '<path class="j2-nbr-hex' + (nb.valid ? '' : ' is-outside') + '" d="' + pathOf(data.grid.cellCorners(nb.q, nb.r)) + '"/>';
        }
      }
      if (hoverCell && !(selCell && selCell.q === hoverCell.q && selCell.r === hoverCell.r)) h += '<path class="j2-hover-hex" d="' + pathOf(data.grid.cellCorners(hoverCell.q, hoverCell.r)) + '"/>';
      if (selCell) { const d = pathOf(data.grid.cellCorners(selCell.q, selCell.r)); h += '<path class="j2-sel-casing" d="' + d + '"/><path class="j2-sel-hex" d="' + d + '"/>'; }
      for (const m of [hoverMarker, selMarker]) {
        if (!m) continue;
        h += '<rect class="j2-marker-ring' + (m === selMarker ? ' is-selected' : '') + '" ' + rectAttrs(m.iconProtectionArea.rectPx) + '/>';
      }
      return h;
    }

    function demoPlacements() {
      const { grid, anchorsDoc, template } = data;
      const out = [];
      const seen = new Set();
      const add = (q, r, i) => {
        const id = Geo.cellId(q, r);
        if (seen.has(id) || !grid.isValid(q, r)) return;
        seen.add(id);
        out.push({ q: q, r: r, symbolId: HABITAT_DEMO[i % HABITAT_DEMO.length], dots: TERRAIN_DEMO[i % TERRAIN_DEMO.length] });
      };
      let i = 0;
      for (const id of ['mk-056', 'mk-057', 'mk-031']) {
        const a = anchorsDoc.anchors.find(x => x.stableId === id);
        if (!a) continue;
        const c = Geo.parseCellId(a.cellId);
        add(c.q, c.r, i++);
        for (const nb of grid.neighbors(c.q, c.r)) add(nb.q, nb.r, i++);
      }
      const seamCtl = template.grid.controlPoints.find(cp => cp.area === 'seam' && /middle/.test(cp.label));
      if (seamCtl) {
        const c = Geo.parseCellId(seamCtl.id);
        add(c.q, c.r, i++);
        for (const nb of grid.neighbors(c.q, c.r)) add(nb.q, nb.r, i++);
      }
      return out;
    }

    /** Placement records -> SVG markup, shared by the screen proof overlay and the print proof (same layout, same protections). */
    function proofMarkup(placements, rectFilter, sampleLabels) {
      let h = '';
      for (const p of placements) {
        const sym = data.symbols.find(s => s.id === p.symbolId);
        if (!sym) continue;
        const ctr = data.grid.cellCenter(p.q, p.r);
        if (rectFilter && !(ctr[0] >= rectFilter[0] - 40 && ctr[0] <= rectFilter[0] + rectFilter[2] + 40 && ctr[1] >= rectFilter[1] - 40 && ctr[1] <= rectFilter[1] + rectFilter[3] + 40)) continue;
        const glyph = { w: Math.round(sym.sizePx[0] * GLYPH_SCALE * 10) / 10, h: Math.round(sym.sizePx[1] * GLYPH_SCALE * 10) / 10, dots: p.dots };
        const L = Geo.layoutProofGlyph(data.grid, p.q, p.r, glyph, data.protections, 2);
        h += '<path class="j2-test-hex' + (L.hidden ? ' is-hidden' : '') + '" d="' + pathOf(data.grid.cellCorners(p.q, p.r)) + '"/>';
        if (L.hidden) continue;
        const g = L.glyphRectPx;
        h += '<image class="j2-test-symbol" href="' + esc(sym.path) + '" x="' + g[0] + '" y="' + g[1] + '" width="' + g[2] + '" height="' + g[3] + '" preserveAspectRatio="xMidYMid meet"/>';
        for (const d of L.dotsPx) h += '<circle class="j2-test-dot" cx="' + d[0] + '" cy="' + d[1] + '" r="1.7"/>';
      }
      if (sampleLabels) {
        for (const a of data.anchorsDoc.anchors) {
          if (!a.labelAnchor || !['mk-057', 'mk-031', 'mk-013', 'mk-012'].includes(a.stableId)) continue;
          if (rectFilter && !(a.worldPixelAnchor[0] >= rectFilter[0] && a.worldPixelAnchor[0] <= rectFilter[0] + rectFilter[2] && a.worldPixelAnchor[1] >= rectFilter[1] && a.worldPixelAnchor[1] <= rectFilter[1] + rectFilter[3])) continue;
          h += '<text class="j2-test-label" x="' + a.labelAnchor.pointPx[0] + '" y="' + a.labelAnchor.pointPx[1] + '" text-anchor="middle" dominant-baseline="hanging">' + esc(t('journey2_test_label')) + '</text>';
        }
      }
      return h;
    }

    function renderProof() {
      if (!data || !ui.g) return;
      ui.g.proof.innerHTML = layers.proof ? proofMarkup(demoPlacements().concat(userPlacements), null, true) : '';
      if (ui.p) ui.p.proofCount.textContent = userPlacements.length ? String(userPlacements.length) : '';
    }

    /* ---- print proof (diagnostic only; not the production map print) ---- */

    function preloadSymbols() {
      return Promise.all(data.symbols.map(s => new Promise(resolve => { const i = new Image(); i.onload = i.onerror = () => resolve(); i.src = s.path; })));
    }

    function cropRaster(rect) {
      return new Promise((resolve, reject) => {
        const cv = document.createElement('canvas');
        cv.width = rect[2]; cv.height = rect[3];
        cv.getContext('2d').drawImage(baseImg, rect[0], rect[1], rect[2], rect[3], 0, 0, rect[2], rect[3]);
        cv.toBlob(b => (b ? resolve(URL.createObjectURL(b)) : reject(new Error('raster crop failed'))), 'image/png');
      });
    }

    function proofPageMarkup(proof, rasterUrl) {
      const r = proof.rectPx;
      const { grid, template, anchorsDoc } = data;
      let s = '<svg xmlns="' + SVG_NS + '" class="j2-print-svg" width="' + (r[2] * PRINT_SCALE_MM_PER_PX) + 'mm" height="' + (r[3] * PRINT_SCALE_MM_PER_PX) + 'mm" viewBox="' + r.join(' ') + '">';
      s += '<image href="' + rasterUrl + '" ' + rectAttrs(r) + ' preserveAspectRatio="none"/>';
      template.grid.controlPoints.forEach((cp, i) => {
        const o = cp.observedCenterPx;
        if (!(o[0] >= r[0] && o[0] <= r[0] + r[2] && o[1] >= r[1] && o[1] <= r[1] + r[3])) return;
        const c = Geo.parseCellId(cp.id);
        s += '<path class="j2-pr-ctl" d="' + pathOf(grid.cellCorners(c.q, c.r)) + '"/><text class="j2-pr-ctl-n" x="' + (o[0] - 3) + '" y="' + (o[1] + 4) + '">' + (i + 1) + '</text>';
      });
      for (const a of anchorsDoc.anchors) {
        const pr = a.iconProtectionArea.rectPx;
        if (!Geo.rectsIntersect(pr, r)) continue;
        s += '<rect class="j2-pr-protect" ' + rectAttrs(pr) + '/><text class="j2-pr-id" x="' + (pr[0] + pr[2] + 2) + '" y="' + (pr[1] + 8) + '">' + a.stableId + '</text>';
      }
      s += '<g class="j2-pr-test">' + proofMarkup(demoPlacements(), r, true) + '</g>';
      for (const [x, y, anchor] of [[r[0], r[1], 'start'], [r[0] + r[2], r[1], 'end'], [r[0], r[1] + r[3], 'start'], [r[0] + r[2], r[1] + r[3], 'end']]) {
        const dx = anchor === 'start' ? 1 : -1, dy = y === r[1] ? 1 : -1;
        s += '<path class="j2-pr-reg" d="M' + x + ' ' + (y + dy * 24) + 'V' + y + 'H' + (x + dx * 24) + '"/>';
        s += '<text class="j2-pr-coord" x="' + (x + dx * 28) + '" y="' + (y + dy * 14 + (dy > 0 ? 8 : 0)) + '" text-anchor="' + anchor + '">' + x + ', ' + y + '</text>';
      }
      const bx = r[0] + 60, by = r[1] + r[3] - 40;
      s += '<path class="j2-pr-scale" d="M' + bx + ' ' + by + 'h100M' + bx + ' ' + (by - 5) + 'v10M' + (bx + 100) + ' ' + (by - 5) + 'v10"/><text class="j2-pr-coord" x="' + bx + '" y="' + (by - 9) + '">100 px = ' + fmt(100 * PRINT_SCALE_MM_PER_PX, 0) + ' mm</text>';
      s += '</svg>';
      return s;
    }

    function preparePrintProof(id) {
      const proofs = id ? PRINT_PROOFS.filter(p => p.id === id) : PRINT_PROOFS;
      if (!data || !baseImg) return Promise.reject(new Error('map not loaded'));
      cleanupPrintProof();
      return preloadSymbols().then(() => Promise.all(proofs.map(p => cropRaster(p.rectPx)))).then(rasterUrls => {
        if (inst.disposed) { rasterUrls.forEach(u => URL.revokeObjectURL(u)); return null; }
        printUrls = rasterUrls;
        printRoot = el('div', { id: 'j2-print-root', 'aria-hidden': 'true' });
        const tplv = data.template.verification;
        printRoot.innerHTML = proofs.map((p, i) => '<section class="j2-proof-page">' +
          '<header class="j2-print-head"><strong>' + esc(t('journey2_print_heading')) + '</strong> · ' + esc(t(p.titleKey)) + '</header>' +
          proofPageMarkup(p, rasterUrls[i]) +
          '<footer class="j2-print-foot">' + esc(t('journey2_print_foot')
            .replace('{rect}', p.rectPx.join(', ')).replace('{paper}', PRINT_PAGE.paper).replace('{scale}', String(PRINT_SCALE_MM_PER_PX))
            .replace('{hex}', fmt(data.grid.shortDimensionPx * PRINT_SCALE_MM_PER_PX, 2)).replace('{status}', t(data.readiness.ready ? 'journey2_status_ready' : 'journey2_status_unverified'))) + '</footer></section>').join('');
        document.body.appendChild(printRoot);
        document.body.classList.add('j2-print-mode');
        return { pages: proofs.map(p => ({ id: p.id, rectPx: p.rectPx })), scaleMmPerWorldPx: PRINT_SCALE_MM_PER_PX, page: PRINT_PAGE, physicalPrintTested: tplv && tplv.physicalPrintTest ? tplv.physicalPrintTest.status !== 'not-tested' : false };
      });
    }

    function cleanupPrintProof() {
      document.body.classList.remove('j2-print-mode');
      if (printRoot) { printRoot.remove(); printRoot = null; }
      for (const u of printUrls.splice(0)) URL.revokeObjectURL(u);
    }

    function runPrint(id) {
      ui.p.printStatus.textContent = t('journey2_print_preparing');
      preparePrintProof(id).then(res => {
        if (!res || inst.disposed) return;
        ui.p.printStatus.textContent = '';
        const done = () => { window.removeEventListener('afterprint', done); cleanupPrintProof(); };
        window.addEventListener('afterprint', done);
        cleanups.push(() => window.removeEventListener('afterprint', done));
        window.print();
      }).catch(() => { if (!inst.disposed) ui.p.printStatus.textContent = t('journey2_print_failed'); });
    }

    /* ---- test hooks (read-only snapshot + coordinate helpers for the browser verification) ---- */

    function debugState() {
      const d = doc ? Model.derive(doc) : null;
      return {
        camera: { scale: cam.scale, tx: cam.tx, ty: cam.ty }, fitMode: fitMode, cameraStore: { ready: cameraReady, saved: savedView, pending: !!cameraSaveTimer }, layers: Object.assign({}, layers),
        selectedCell: selCell && Geo.cellId(selCell.q, selCell.r), selectedMarker: selMarker && selMarker.stableId,
        hoverCell: hoverCell && Geo.cellId(hoverCell.q, hoverCell.r), userPlacements: userPlacements.length,
        ready: data ? data.readiness.ready : null, anchors: data ? data.anchorsDoc.anchors.length : 0,
        validCells: data ? data.grid.validCellCount() : 0, allowedCells: data ? data.ctx.allowedCellCount : 0, placeMode: placeMode,
        activeBatchId: activeBatchId, inspector: { batchId: inspector.batchId, tileId: inspector.tileId, source: inspector.source, open: inspectorOpen() }, sanctuaryOpen: sanctuaryOpen, locate: locateDebug(), seekers: seekersDebug(), route: routeDebug(), sideCollapsed: sideCollapsed, diagnosticsOpen: diagOpen, saveStatus: saveState.status, saveReason: saveState.reason, editLocked: editLocked,
        selectedTile: sel.tileId, transient: tr ? { kind: tr.kind, mode: tr.mode || null, moved: !!tr.moved, cells: tr.preview ? tr.preview.cells.length : 0, valid: tr.preview ? tr.preview.valid : null, attached: tr.preview ? tr.preview.attached : null, separateEligible: tr.preview ? !!tr.preview.separateEligible : null, anchor: tr.preview ? Geo.cellId(tr.preview.anchor.q, tr.preview.anchor.r) : null, conflicts: tr.preview ? tr.preview.cells.filter(c => !c.ok).map(c => [c.id, c.reason]) : [] } : null,
        history: history ? { undo: history.undo.length, redo: history.redo.length } : null,
        batches: doc ? doc.batches.map(b => Object.assign({ id: b.id, habitat: b.habitat, terrain: b.terrain, quantity: b.quantity, quantitySource: b.quantitySource, rumor: b.rumor, encounter: b.encounter, notes: b.notes }, d.counts.get(b.id))) : [],
        tiles: doc ? doc.tiles.map(x => ({ id: x.id, batchId: x.batchId, cell: x.cell })) : [],
        domTileGlyphs: ui.g && ui.g.tiles ? ui.g.tiles.querySelectorAll('image').length : 0,
        glyphlessTiles: ui.g && ui.g.tiles && ui.g.tiles.querySelector('.is-glyphless') ? ui.g.tiles.querySelector('.is-glyphless').getAttribute('d').split('M').length - 1 : 0,
        discoveredState: 'none',
        biome: { show: showBiome, tinted: ui.g && ui.g.tiles ? ui.g.tiles.querySelectorAll('.j2-biome-tint').length : 0, playerTinted: ui.g && ui.g.player ? ui.g.player.querySelectorAll('.j2-biome-tint').length : 0 },
        fog: { tool: fogTool, previewMode: previewMode, revealed: doc ? Model.getRevealedCellSet(doc).size : 0, strokeCells: fogStroke ? fogStroke.cells.length : 0, strokePointer: fogStroke ? fogStroke.pointerId : null, hover: fogHover ? Geo.cellId(fogHover.q, fogHover.r) : null },
        detachedConfirm: detachedConfirm ? { batchId: detachedConfirm.batchId, cells: detachedConfirm.tiles.map(x => x.cell) } : null,
        perimeter: (() => { const g = ui.g && (previewMode ? ui.g.perimeterPlayer : ui.g.perimeter); return { mode: perimDrawn.mode, segments: g ? Number(g.getAttribute('data-segments') || 0) : 0, hasPath: !!(g && g.querySelector('path')), above: !previewMode }; })(),
        playerGlyphs: ui.g && ui.g.player ? ui.g.player.querySelectorAll('image').length : 0,
      };
    }

    function makeDebugApi() {
      return {
        cellToClient(cellId) {
          const c = Geo.parseCellId(cellId), ctr = data.grid.cellCenter(c.q, c.r), r = ui.viewport.getBoundingClientRect();
          const s = Geo.worldToScreen(cam, ctr[0], ctr[1]);
          return { x: r.left + s[0], y: r.top + s[1] };
        },
        worldToClient(x, y) { const r = ui.viewport.getBoundingClientRect(), s = Geo.worldToScreen(cam, x, y); return { x: r.left + s[0], y: r.top + s[1] }; },
        clientToCell(cx, cy) { const r = ui.viewport.getBoundingClientRect(), w = Geo.screenToWorld(cam, cx - r.left, cy - r.top), c = data.grid.worldToCell(w[0], w[1]); return Geo.cellId(c.q, c.r); },
        allowedCell(cellId) { const c = Geo.parseCellId(cellId); return c ? data.ctx.policy(c.q, c.r) : { ok: false, reason: 'outside' }; },
        setCamera(c) { setCamera(c); },
        zoomTo(scale, cx, cy) { zoomToScale(scale, cx, cy); },
        zoomStep(dir) { zoomStep(dir); },
        document() { return JSON.parse(Model.serializeBackup(doc)); },
        runAction(act) { runAction(act); },
        projection() { return JSON.parse(JSON.stringify(Projection.buildPlayerProjection(doc, data.ctx))); },
        dispatch(cmd) { return dispatch(cmd, cmd.type); },
        decorativeCells() { return Array.from(data.ctx.decorativeCells); },
        setDealRandom(fn) { dealRandom = typeof fn === 'function' ? fn : Math.random; },
        setRollRandom(fn) { rollRandom = typeof fn === 'function' ? fn : Math.random; },
        setLocateRandom(fn) { locateRandom = typeof fn === 'function' ? fn : Math.random; },
        sanctuaryClient(id) { const a = sanctuaryAnchorMap().get(id); return a ? this.worldToClient(a.worldPixelAnchor[0], a.worldPixelAnchor[1]) : null; },
        markers() { return data.anchorsDoc.anchors.map(a => ({ id: a.stableId, cellId: a.cellId, rect: a.iconProtectionArea.rectPx })); },
      };
    }

    return inst;
  }

  return { mount: mount, unmount: unmount, isMounted: isMounted, preparePrintProof: preparePrintProof, cleanupPrintProof: cleanupPrintProof, debugState: debugState, debugApi: debugApi, PRINT_PROOFS: PRINT_PROOFS, PRINT_SCALE_MM_PER_PX: PRINT_SCALE_MM_PER_PX, PRINT_PAGE: PRINT_PAGE };
});
