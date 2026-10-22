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
  const Share = root.Journey2Share;                 // the player link codec (PD-052); only the read-only player page decodes with it
  const EnvDeal = root.Journey2EnvDeal;
  const EncRoll = root.Journey2EncounterRoll;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MAX_ZOOM = 8;
  const CLICK_SLOP_PX = 4;
  const TOUCH_SLOP_PX = 10;                         // a fingertip jitters: a tap moves less than this (PD-052)
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
    const link = opts && opts.player ? String(opts.player.link) : null;   // the GM editor and each player link are different instances: a language switch re-localizes, anything else remounts
    if (current && current.container === container && !current.disposed && current.playerLink === link) { current.relocalize(opts); return current; }
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
  function fullRasterHref(template) { return versioned(template.assembledAsset.path, template.assembledAsset.cacheKey); }
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
    let baseT = (opts && opts.t) || (k => k);
    /* Player-friendly copy (PD-052): a string may have a `<key>_pl` variant written for people, without the GM's vocabulary ("generated Terrain", "diagnostic"...).
     * It is used on the player page for every string, and in the GM's Player Preview for the route strings players also read. A key without one is unchanged. */
    let t = key => {
      if (playerMode || (previewMode && key.startsWith('journey2_route_'))) { const v = baseT(key + '_pl'); if (v && v !== key + '_pl') return v; }
      return baseT(key);
    };
    let lang = (opts && opts.lang) || 'en';
    let generator = (opts && opts.generator) || null;
    let environmentsFor = (opts && opts.environmentsForBiome) || (() => []);   // biome id -> [{ id, name, tier, href }], supplied by app.js from the catalog
    const toast = (opts && opts.toast) || (() => {});
    const storage = opts && 'storage' in opts ? opts.storage : null;
    let nf = makeNumberFormat();

    const inst = {
      container: container, disposed: false, playerLink: opts && opts.player ? String(opts.player.link) : null, relocalize: relocalize, dispose: dispose,
      preparePrintProof: preparePrintProof, cleanupPrintProof: cleanupPrintProof, debugState: debugState, debugApi: null,
    };
    const abort = new AbortController();
    const cleanups = [];
    let data = null;                       // { template, anchorsDoc, symbols[], symbolById, grid, ctx, readiness, protections }
    let baseImg = null;
    let cam = { scale: 0.25, tx: 0, ty: 0 };
    let fitMode = true;
    let savedView = null, liveView = null, cameraReady = false, cameraSaveTimer = 0;   // the stored camera ({ fit, cx, cy, scale } | null), whether a stored camera may be overwritten yet, and the debounce timer
    let rafId = 0, pendingApply = false, appliedScale = 0, appliedTx = NaN, appliedTy = NaN;

    /* committed state */
    let doc = null, history = null, store = null;
    let saveState = { status: 'loading', reason: null };    // loading | saved | unsaved | failed | blocked | unavailable
    let loadInfo = null;                                    // result of store.load()
    let editLocked = false;                                 // edits paused: the saved map is unreadable (corrupt) or another tab saved a newer one (conflict)
    let conflict = false;                                   // H-04: another tab changed the saved map; sticky until this tab is reloaded (never cleared by an edit, a pref write or an import)
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
    let showPartyMark = true;                               // player page only (PD-069): a viewer may hide the drawn star; the lit cells stay (display only, never stored)
    let showRegions = false;                                // "Regions" (PD-062): one icon per region, as in the book (UI only; the player link carries it as a flag)
    let showSepia = true;                                   // "Sepia map" (PD-060): parchment ground + multiplied raster on screen (UI only; the print path never uses it)
    let showBiome = true;                                   // "Biome colors": the tint inside placed hexes — GM view, Player Preview and the player page (UI only, never in the document, backup or history)
    let fogTool = null;                                     // null | 'reveal' | 'hide' — the active map tool
    let fogStroke = null;                                   // the in-progress pointer stroke { mode, pointerId, seen:Set, cells:[key], pendD, last, hover }
    let fogHover = null;                                    // { q, r } under the pointer while a tool is active and no stroke runs
    let fogPaintRaf = 0;
    let fogDrawn = { vis: null, mode: null, doc: null };   // what the fog layer currently shows (so an unrelated document change never rebuilds it)
    let showOutline = false;                                // Player Preview: passive faint outline round placed-but-hidden hexes (GM aid, UI only; never in the document, projection or print)
    let ghostDrawn = { tiles: null, vis: null, soft: false };            // what the GM-only hidden-hex outline currently shows
    let fogUnfoggable = '';                                 // path data of valid cells the fog never covers (holes in the veil)
    let foggable = null;                                    // Map cellKey -> hex path, every cell the GM can reveal/hide (built once)
    let detachedConfirm = null;                             // transient: the frozen detached candidate whose "Start separate area" dialog is open (never stored, never in history)
    let perimDrawn = { tiles: null, vis: null, mode: null }; // what the perimeter layer currently shows (an unrelated change never rebuilds it)
    let resumePreview = false;                              // the stored "Player Preview was open" flag, consumed once the camera is restored
    const playerMode = !!(opts && opts.player);             // the read-only player page (PD-052): Player Preview of a decoded link — no storage, no GM controls, never leaves the preview
    let playerLoad = null;                                  // its decoded link: { ok: true, doc, snap } | { ok: false, code }
    let previewMode = false;                               // Player Preview: a read-only render of the player projection
    /* "Static effects" (PD-076): the device preference ('static' | 'animated' | null = follow the system) lives in its own key (js/motion-pref.js), read on the player page too; staticFx is the resolved value */
    const MP = root.MotionPref;
    const motionStorage = opts && opts.motionStorage ? opts.motionStorage : null;
    let motionPref = MP ? MP.load(motionStorage) : null;
    let staticFx = MP ? MP.isStatic(motionPref, prefersReducedMotion()) : prefersReducedMotion();
    let sbfx = null;                                       // the Shadowblight FX controller (PD-072, js/journey2-shadowblight-fx.js); null = unavailable, the glyphs stay
    let sbfxCells = { blighted: [], overtaken: [] };       // what it was last given (derived each render, never stored)
    const OVERTAKEN_SYMBOL = Model.symbolIdOf({ habitat: { overtaken: true } });
    let playerProjection = null;                            // the projection currently drawn in Player Preview
    let ruinDrawn = null;                                   // the destroyedSanctuaries object the GM ruins layer currently shows (an unrelated change never rebuilds it)
    let ruinShownKey = null;                                // Player Preview / player page: the ids the ruins layer currently shows (a fog stroke that reveals no ruin never rebuilds its canvases)
    let echoDrawn = null;                                 // the soulEchoes object the GM echoes layer currently shows (an unrelated change never rebuilds it)
    let sanctuaryOpen = null;                               // anchor id of the sanctuary whose overlay is open (transient: never persisted, never in history)
    let sanctuaryRenaming = false;                          // the open overlay's name is being edited (transient: ends on save, cancel, close or another sanctuary)
    let sanctuaryShown = null;                             // anchor id the overlay DOM currently shows (so its scroll position survives re-renders)
    let sancDrawn = { sanctuaries: null, open: null, names: null };   // what the sanctuary ring layer currently shows
    let sancLabelsDrawn = null;                             // the sanctuaryLabels currently drawn (GM map and Player Preview share them)
    let sancAnchors = null;                                 // Map anchor id -> the printed sanctuary / destination anchor (built once)
    let sancEnvPicker = false;                              // transient: the open sanctuary's inline Environment picker is open (never persisted, never in history)
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
    let printSafety = null;                                 // O-01: the one print-only instruction line (see mountPrintSafety)
    let routeDetails = false;                               // the selected route's details popover is open (a click on its bubble; transient)
    let routeBubbleSpecs = [];                              // [{ s, x, y }] world anchor of each drawn route's bubble (rebuilt by every paint)                                    // signature of what the route layers currently show (a re-render with the same state must not restart the draw-in)
    let routePinDrag = null;                                // transient (PD-031 / PD-045): { which: 'start'|'end', pointerId, from } — the A or B pin being dragged; never stored
    let partyDraft = null;                                  // transient (PD-045): { cell, placing, pointerId, from } — the party marker being placed (following the cursor) or dragged; never stored
    let partyRaf = 0;
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
    mountPrintSafety();
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
    /** `fill` with singular agreement: `counts` are the raw numbers behind the vars. One count picks `key_one` when that variant exists; two counts pick
     *  `key_one1` / `key_one2` / `key_one12` (the first, the second, or both equal 1). A key without the variant falls back to the base text (Russian never
     *  declines the noun, so it has none that differ). */
    function fillN(key, vars, counts) {
      const ones = counts.map((c, i) => (c === 1 ? String(i + 1) : '')).join('');
      let k = key;
      if (ones) { const v = key + (counts.length === 1 ? '_one' : '_one' + ones); if (t(v) !== v) k = v; }
      return fill(k, vars);
    }

    /* ---- lifecycle ---- */

    /* O-01: native browser printing (Cmd/Ctrl+P, the Print menu) of the ordinary Journey page must never carry GM-only content. `body[data-j2]` is the
     * Journey-only scope; in print media css/journey2.css hides every body child except this one line, which points to the official flow. The official
     * Player Print (`body.j2-printpreview-mode`) is exempt and renders its two pages exactly as before. Nothing here is stored or listens to print events. */
    function mountPrintSafety() {
      if (printSafety) return;
      printSafety = el('p', { class: 'j2-print-safety', 'data-j2-print-safety': '' });
      printSafety.textContent = t('journey2_pp_native_safe');
      document.body.appendChild(printSafety);
    }

    function dispose() {
      if (inst.disposed) return;
      flushCameraSave();                                   // leaving the page keeps the camera (the debounce may still be pending)
      inst.disposed = true;
      abort.abort();
      cancelAnimationFrame(rafId);
      clearTimeout(hintTimer); clearTimeout(liveTimer);
      routePlanner.dispose(); routeHover = null; routePinDrag = null;
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
      if (printSafety) { printSafety.remove(); printSafety = null; }
      delete document.body.dataset.j2;
      userPlacements = [];
      data = null; ui = {}; doc = null; history = null; store = null; foggable = null; playerProjection = null; cardRefs.clear(); glyphCache.clear(); hexPathCache.clear();
    }

    function listen(target, type, fn, options) {
      target.addEventListener(type, fn, options);
      cleanups.push(() => target.removeEventListener(type, fn, options));
    }

    function relocalize(o) {
      if (o && o.t) baseT = o.t;
      let langChanged = false;
      if (o && o.lang && o.lang !== lang) { lang = o.lang; nf = makeNumberFormat(); langChanged = true; }
      if (o && o.generator) generator = o.generator;
      if (o && o.environmentsForBiome) environmentsFor = o.environmentsForBiome;
      applyStrings();
      if (printSafety) printSafety.textContent = t('journey2_pp_native_safe');
      if (data && ui.root) {
        updateStatus(); updateReadouts(); renderControlList(); renderAll(true); applyPreviewChrome();
        renderSeekers();                                   // the step count's title / aria-label and the settled "+" explanation are language-sensitive (L5-22)
        if (langChanged && ui.live) { clearTimeout(liveTimer); ui.live.textContent = ''; }   // an announcement in the old language is obsolete; nothing new is announced (L5-03)
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

    function renderError() {
      ui = {};
      container.innerHTML = '<div class="j2-state j2-state--error" role="alert"><p class="j2-state-title" data-t="journey2_load_error"></p>' +
        '<p class="j2-state-hint" data-t="journey2_load_error_hint"></p>' +
        '<p class="j2-state-detail" data-t="journey2_load_error_detail"></p>' +
        '<button type="button" class="btn btn-primary" data-j2-retry data-t="journey2_retry"></button></div>';
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
        };
        // a phone gets the half-resolution copy (same world size once drawn): the full raster is too big for its GPU; print always uses the full one (fullRasterHref)
        const light = template.lightAsset && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
        return loadImage(light ? versioned(template.lightAsset.path, template.lightAsset.cacheKey) : fullRasterHref(template));
      }).then(img => {
        if (inst.disposed || !img) return null;
        baseImg = img;
        return playerMode ? Share.openLinkText(opts.player.link, data.ctx) : null;   // the link is decoded against the loaded template (cell count check)
      }).then(decoded => {
        if (inst.disposed || !baseImg) return;
        if (playerMode) { playerLoad = decoded; if (!decoded || !decoded.ok) { renderPlayerLinkError(decoded && decoded.code); return; } }
        buildSurface();
        if (playerMode && typeof opts.player.onOpened === 'function') { try { opts.player.onOpened(decoded.snap); } catch (err) { /* a host callback must never break the page */ } }
      }).catch(err => {
        if (inst.disposed || (err && err.name === 'AbortError')) return;
        try { console.error('Journey: map data failed to load', err); } catch (e) { /* no console */ }   // the raw exception stays technical detail; the UI shows a localized generic line (L5-18)
        renderError();
      });
    }

    /** A link that cannot be opened: a localized reason (never the raw exception) and the way out. The page holds nothing else. */
    function renderPlayerLinkError(code) {
      ui = {};
      const key = 'journey2_pl_error_' + String(code || 'invalid').replace(/-/g, '_');
      container.innerHTML = '<div class="j2-state j2-state--error" role="alert"><p class="j2-state-title" data-t="journey2_pl_error"></p>' +
        '<p class="j2-state-hint" data-t="' + (t(key) !== key ? key : 'journey2_pl_error_invalid') + '"></p></div>';
      applyStrings();
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
      grip: '<svg viewBox="0 0 12 16" aria-hidden="true" focusable="false"><g fill="currentColor"><circle cx="3.5" cy="3" r="1.1"/><circle cx="8.5" cy="3" r="1.1"/><circle cx="3.5" cy="8" r="1.1"/><circle cx="8.5" cy="8" r="1.1"/><circle cx="3.5" cy="13" r="1.1"/><circle cx="8.5" cy="13" r="1.1"/></g></svg>',
      mouseLeft: '<svg viewBox="0 0 14 20" aria-hidden="true" focusable="false"><path class="j2-mouse-hit" d="M7 1.2H6.5A5 5 0 0 0 1.5 6.2V7.6H7z"/><rect x="1.5" y="1.2" width="11" height="17.6" rx="5.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M1.5 7.6h11M7 1.2v6.4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
      mouseRight: '<svg viewBox="0 0 14 20" aria-hidden="true" focusable="false"><path class="j2-mouse-hit" d="M7 1.2h.5a5 5 0 0 1 5 5V7.6H7z"/><rect x="1.5" y="1.2" width="11" height="17.6" rx="5.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M1.5 7.6h11M7 1.2v6.4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    };

    /** Lucide icons (ISC, lucide-static 0.468) for the rail, map bar, segment and menu: one 24px grid and one stroke, set by `.j2-li` in journey2.css.
     *  `echo` and `locate` are drawn here in the same grid and stroke from the map's Soul Echo marker (PD-071). */
    const LI = {
      display: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><line x1="21" x2="14" y1="4" y2="4" /><line x1="10" x2="3" y1="4" y2="4" /><line x1="21" x2="12" y1="12" y2="12" /><line x1="8" x2="3" y1="12" y2="12" /><line x1="21" x2="16" y1="20" y2="20" /><line x1="12" x2="3" y1="20" y2="20" /><line x1="14" x2="14" y1="2" y2="6" /><line x1="8" x2="8" y1="10" y2="14" /><line x1="16" x2="16" y1="18" y2="22" /></svg>',
      party: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="fill" d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /></svg>',
      route: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></svg>',
      // Find Echo (PD-071): the Soul Echo glyph below with a needle leaving through the rings' aligned gap — the tool answers with a direction, nothing more
      locate: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle class="fill" cx="12" cy="12" r="2.3"/><path d="M6.81 9.9A5.6 5.6 0 0 1 14.28 6.88M17.12 9.72A5.6 5.6 0 0 1 15.13 16.64M13.16 17.48A5.6 5.6 0 0 1 6.49 12.97M3.1 8.4A9.6 9.6 0 0 1 15.9 3.23M20.77 8.1A9.6 9.6 0 0 1 17.37 19.96M14 21.39A9.6 9.6 0 0 1 2.55 13.67"/><path d="M14.2 9.8 19.8 4.2M15.8 4.2h4v4"/></svg>',
      brush: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" /><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" /></svg>',
      sanctuary: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M22 20v-9H2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2Z" /><path d="M18 11V4H6v7" /><path d="M15 22v-4a3 3 0 0 0-3-3a3 3 0 0 0-3 3v4" /><path d="M22 11V9" /><path d="M2 11V9" /><path d="M6 4V2" /><path d="M18 4V2" /><path d="M10 4V2" /><path d="M14 4V2" /></svg>',
      // Soul Echo (PD-071): the map marker as a line icon — the core and two broken ripple rings, each turned like the marker's (gaps never aligned)
      echo: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle class="fill" cx="12" cy="12" r="2.3"/><path d="M10.46 6.62A5.6 5.6 0 0 1 17.43 10.65M16.94 14.63A5.6 5.6 0 0 1 10.27 17.33M8.4 16.29A5.6 5.6 0 0 1 7.84 8.25M19.25 5.7A9.6 9.6 0 0 1 18.04 19.46M11.5 21.59A9.6 9.6 0 0 1 2.47 13.17M2.73 9.52A9.6 9.6 0 0 1 14.81 2.82"/></svg>',
      eraser: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" /></svg>',
      campaign: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 12h-5" /><path d="M15 8h-5" /><path d="M19 17V5a2 2 0 0 0-2-2H4" /><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" /></svg>',
      eye: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></svg>',
      gm: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" /><path d="M15 5.764v15" /><path d="M9 3.236v15" /></svg>',
      palette: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></svg>',
      undo: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" /></svg>',
      redo: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" /></svg>',
      fit: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></svg>',
      print: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" /><rect x="6" y="14" width="12" height="8" rx="1" /></svg>',
      link: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>',
      hexes: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>',
      panelClose: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="m16 15-3-3 3-3" /></svg>',
      info: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>',
      panelOpen: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="m14 9 3 3-3 3" /></svg>',
      close: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>',
      check: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5" /></svg>',
      pencil: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" /></svg>',
      warn: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>',
      inspect: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>',
      trash: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>',
      dice: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><path d="M16 8h.01" /><path d="M12 12h.01" /><path d="M8 16h.01" /></svg>',
      eyeOff: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" /></svg>',
      flame: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>',
      stock: '<svg class="j2-li" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 3.5 15.5 7.25v7.5L9 18.5 2.5 14.75v-7.5z" /><path d="m12.5 18.75 3 1.75 6-3.5v-7l-3-1.75" /></svg>',
    };

    /** One rail button: icon, one-word label and the shortcut key (shown as a keycap and exposed through aria-keyshortcuts). */
    function railBtn(attrs, icon, labelKey, key) {
      return '<button type="button" class="j2-rb" ' + attrs + (key ? ' aria-keyshortcuts="' + key + '"' : '') + '><span class="j2-rb-ico" aria-hidden="true">' + icon + '</span><span class="j2-rb-lbl" data-t="' + labelKey + '"></span>' + (key ? '<kbd class="j2-rb-key" aria-hidden="true">' + key + '</kbd>' : '') + '</button>';
    }

    /**
     * Soul Echo "Resonance" marker (PD-022 placement, PD-071 look): drawn right above the sanctuary icon, not tied to any hex. Gradients live in <defs>; the shape is inlined per Echo.
     * Available: a small luminous core and three broken ripple rings of tapered, hand-wobbled brush arcs (each ring turned so its gaps never line up — water rings, not radar)
     * that bloom outward in sequence and fade; the motion is CSS only (transform / opacity), off under prefers-reduced-motion, which leaves a still frame with all three rings.
     * Collected: its own static drawing, not the live one dimmed — a hollow ring where the core was, the first ripple frozen with one arc gone, one faint arc of the second.
     * Fixed blues and blue-greys (a map object, not UI chrome) so it reads on the parchment in both themes. Designed in .claude/mockups/soul-echo-fx-lab.html (Concept C).
     */
    const ECHO_DEFS =
      '<radialGradient id="j2-echo-halo"><stop offset="0" stop-color="#7cc4f4" stop-opacity=".37"/><stop offset=".45" stop-color="#3f86de" stop-opacity=".13"/><stop offset="1" stop-color="#2a5fd6" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="j2-echo-orb"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#bfeaff"/><stop offset="1" stop-color="#2f74d0"/></radialGradient>';

    const ECHO_LIFT = 26;                                   // world px from the icon's top edge to the marker's centre (the outer ring reaches ~23 px at full bloom, so it clears the icon)
    const ECHO_SCALE = 1.3;                                 // the shapes below are authored at 1; this brings them to about the old crystal's footprint at 100%

    /** A tapered, slightly wobbled brush arc of radius r centred on angle phi (deg) over ±span°, thickest in the middle, as one closed path. */
    function echoArc(r, phi, span, w, seed) {
      const n = 12, out = [], inn = [];
      for (let k = 0; k <= n; k++) {
        const u = k / n * 2 - 1, th = (phi + u * span) * Math.PI / 180;
        const half = w / 2 * Math.pow(Math.cos(u * Math.PI / 2), 0.85), wob = 0.2 * Math.sin(seed + u * 5.3);
        out.push([Math.cos(th) * (r + half + wob), Math.sin(th) * (r + half + wob)]);
        inn.push([Math.cos(th) * (r - half + wob), Math.sin(th) * (r - half + wob)]);
      }
      return 'M' + out.concat(inn.reverse()).map(p => fmt(p[0], 2) + ' ' + fmt(p[1], 2)).join(' ') + 'Z';
    }
    /** A broken ring: three arcs with uneven gaps, turned by `rot`; `skip` drops arcs (the collected remnant). */
    const echoRing = (r, rot, w, seed, skip) => [0, 128, 236].map((p, k) => skip && skip.includes(k) ? '' : echoArc(r, rot + p, k === 1 ? 40 : 46, w, seed + k * 1.9)).join('');

    /**
     * The two markers, centred on (0,0), inlined once per Echo (CSS does not reach a <use> clone). Each animated group carries an invisible circle on the
     * marker's centre so its fill-box (the transform origin) is the centre, not the middle of its uneven arcs.
     */
    const ECHO_LIVE =
      '<circle class="j2-echo-halo" r="15" fill="url(#j2-echo-halo)"/>' +
      [[6.6, -60, 1.7], [11, 5, 1.45], [15.4, -25, 1.2]].map((w, i) =>
        '<g class="j2-echo-wave j2-echo-w' + (i + 1) + '"><circle r="' + w[0] + '" fill="none"/><path d="' + echoRing(w[0], w[1], w[2], i * 1.7) + '"/></g>').join('') +
      '<g class="j2-echo-orb"><circle r="3.2" fill="url(#j2-echo-orb)" stroke="#123d8a" stroke-width=".75"/><circle r="1.1" fill="#fff"/></g>';
    const ECHO_SPENT =
      '<circle class="j2-echo-hollow" r="3"/>' +
      '<path class="j2-echo-rest" d="' + echoRing(6.6, -60, 1.6, 0, [2]) + '"/>' +
      '<path class="j2-echo-rest is-faint" d="' + echoRing(11, 5, 1.25, 1.7, [0, 2]) + '"/>';

    /**
     * Destroyed sanctuary (PD-070). On the screen map (GM view, Player Preview, player page) every ruin is the procedural smoke plume and fire of
     * `Journey2RuinFx` (js/journey2-ruin-fx.js) on two small canvases inside an icon-centred, pointer-transparent group (`ruinFxMarkup`); the printed icon is never touched.
     * The print keeps the still drawing (`ruinMarkup`): white tongues with a black outline and core low on the icon, two wavy dashed smoke strands up and to the right,
     * flat black and white, no gradient — in icon-centred units the fire spans about x -16..15, y -9..18 (the icon is ~50 units), the strands end near (96,-88);
     * print's RUIN_BOX (journey2-print.js) is cut from these numbers. The legend swatch reuses the tongues with the flame gradient (a static symbol).
     */
    const RUIN_DEFS =
      '<linearGradient id="j2-ruin-flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#7a1608"/><stop offset=".35" stop-color="#c8360f"/><stop offset=".75" stop-color="#ef7a1c"/><stop offset="1" stop-color="#ffbf5a" stop-opacity=".9"/></linearGradient>';
    /** Three tongues of one fire, back to front: left, right, centre (tallest). Base line y = 18. */
    const RUIN_TONGUES = [
      'M-16 18C-18 11-14 6-12 0C-10 3-8 5-7 9C-6 12-7 16-6 18Z',
      'M5 18C6 13 8 9 11 4C12 8 15 12 14 18Z',
      'M-8 18C-12 10-7 3-4-2C-2-5-3-8-1-9C0-5 3-3 5 1C8 6 9 12 6 18Z',
    ];
    const RUIN_CORE = 'M-3 18C-5 13-2 8 0 4C2 8 4 13 3 18Z';
    /** The printed smoke: two wavy strands (white halo under black ink) drifting up and to the right with the wind. */
    const RUIN_STRANDS = ['M2-10C6-26 22-30 30-44C38-58 56-58 66-70C74-80 86-80 96-88', 'M-2-12C0-22 12-28 20-38C28-48 42-52 52-62'];
    /** The approved Nebula artwork behind every tear (PD-072): one shared, screen-locked image (WebP of the approved master, uncropped). */
    const SB_NEBULA = Object.freeze({ path: 'img/journey2/void-nebula.webp', width: 1672, height: 941 });
    /**
     * Interactive-legend swatches for the two Shadowblight states (PD-072), static and lightweight — no WebGL, no animation: a still frame of the living
     * shadow baked by scripts/generate-shadowblight-legend.js from the map's own renderer, and a softly torn hex showing the same Nebula artwork. Both
     * legends exist in the markup; CSS shows the FX pair only while the FX draw (`.j2[data-sbfx]`), the X / skull pair otherwise.
     */
    const LEGEND_SHADOW_FX = '<img class="j2-legend-fx" src="img/journey2/legend-shadowblight.webp" alt="" width="28" height="28" draggable="false">';
    function legendVoidSvg() {
      // a clean hex cut from the brightest part of the approved Nebula (a still crop, no tear): reads as a window onto the void at 28px
      const d = 'M11 0L5.5 -9.5L-5.5 -9.5L-11 0L-5.5 9.5L5.5 9.5Z';
      return '<svg class="j2-legend-fx j2-legend-void" viewBox="-12 -12 24 24" aria-hidden="true"><defs><clipPath id="j2-legend-void-clip"><path d="' + d + '"/></clipPath></defs>' +
        '<image href="' + SB_NEBULA.path + '" x="-26.4" y="-20.9" width="95.5" height="53.8" preserveAspectRatio="none" clip-path="url(#j2-legend-void-clip)"/>' +
        '<path d="' + d + '" fill="none" stroke="#9db4ff" stroke-opacity=".55" stroke-width=".8" stroke-linejoin="round"/></svg>';
    }
    const RUIN_SCALE = 1.2;                                  // on the screen map; the print passes its own (the A4 page shrinks the map to about a fifth)
    const RUIN_SCALE_PRINT = 1.6;
    const ECHO_SCALE_PRINT = ECHO_SCALE * RUIN_SCALE_PRINT / RUIN_SCALE;   // the spent Echo grows with the print's ruin: the page shrinks the map, the icons beside it stay readable

    /** One destroyed sanctuary on the screen map: the animated canvas plume and fire (one still frame under prefers-reduced-motion). Where canvas is missing, the still drawing at screen scale. */
    function ruinFxMarkup(s) {
      const Fx = root.Journey2RuinFx;
      if (!Fx || !root.document.createElement('canvas').getContext) return ruinMarkup(s, false);
      return '<g class="j2-ruin j2-ruin2" data-ruin="' + esc(s.id) + '" data-glyph="' + esc(s.glyph || 'G1') + '" transform="translate(' + fmt(s.x, 1) + ' ' + fmt(s.y, 1) + ') scale(' + RUIN_SCALE + ')">' + Fx.markup(s.id) + '</g>';
    }

    /** The still drawing of one destroyed sanctuary at the icon centre of `s` ({ id, x, y }): flat black and white, no gradient, no animation, no CSS variables.
     *  `print` = at the A4 page's scale; without it, at the screen scale (only the fallback of `ruinFxMarkup`). */
    function ruinMarkup(s, print) {
      const k = print ? RUIN_SCALE_PRINT : RUIN_SCALE;
      // the print is the screen's still frame itself in grayscale (PD-077); the hand-drawn tongues and strands below remain only where there is no canvas
      const img = print && root.Journey2RuinFx && root.Journey2RuinFx.stillImages ? root.Journey2RuinFx.stillImages(s.id, s.glyph || 'G1') : null;
      if (img) {
        const im = (r) => '<image href="' + r.href + '" x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" preserveAspectRatio="none"/>';
        return '<g class="j2-ruin is-print is-still-image" data-ruin="' + esc(s.id) + '" transform="translate(' + fmt(s.x, 1) + ' ' + fmt(s.y, 1) + ') scale(' + k + ')">' + im(img.smoke) + im(img.fire) + '</g>';
      }
      const st = root.Journey2RuinFx && root.Journey2RuinFx.stillOf ? root.Journey2RuinFx.stillOf(s.glyph) : null;   // null = G1 (the hand-drawn constants above)
      let h = '<g class="j2-ruin is-print" data-ruin="' + esc(s.id) + '" transform="translate(' + fmt(s.x, 1) + ' ' + fmt(s.y, 1) + ') scale(' + k + ')">';
      h += '<g class="j2-ruin-still"' + (st && st.dy ? ' transform="translate(0 ' + st.dy + ')"' : '') + '>';
      for (const d of RUIN_STRANDS) h += '<path class="j2-ruin-strand-halo" d="' + d + '"/><path class="j2-ruin-strand" d="' + d + '"/>';
      h += '</g><ellipse class="j2-ruin-bed" cy="' + (st ? st.bedY : 18) + '" rx="17" ry="3.2"' + (st ? ' cx="' + st.glowX + '"' : '') + '/><g class="j2-ruin-flame">';
      for (const d of (st ? st.tongues : RUIN_TONGUES)) h += '<path class="j2-ruin-flame-out" d="' + d + '"/>';
      h += '<path class="j2-ruin-flame-in" d="' + (st ? st.core : RUIN_CORE) + '"/>';
      h += '</g></g>';
      return h;
    }


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
                <div class="j2-cosmos" data-j2-cosmos aria-hidden="true"></div>
                <div class="j2-world" style="width:${W}px;height:${H}px">
                  <div class="j2-ground" data-j2-ground style="width:${W}px;height:${H}px"><img class="j2-base" alt="" draggable="false" width="${W}" height="${H}"></div>
                  <svg class="j2-overlay" xmlns="${SVG_NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">
                    <defs data-j2-defs></defs><defs>${ECHO_DEFS}${RUIN_DEFS}</defs><defs data-j2-sbfx-defs></defs>
                    <g data-j2-g="tint"></g><g data-j2-g="blight" pointer-events="none" aria-hidden="true"></g><g data-j2-g="tear" pointer-events="none" aria-hidden="true"></g><g data-j2-g="tiles"></g><g data-j2-g="player"></g><g data-j2-g="perimeterPlayer" pointer-events="none"></g><g data-j2-g="fog"><path class="j2-fog-veil" data-j2-fog-veil fill-rule="evenodd" d=""/><path class="j2-fog-edge" data-j2-fog-edge d=""/><path class="j2-fog-ghost" data-j2-fog-ghost d=""/></g><g data-j2-g="perimeter" pointer-events="none"></g><g data-j2-g="fogstroke"></g><g data-j2-g="sanct" pointer-events="none"></g><g data-j2-g="echoes" pointer-events="none"></g><g data-j2-g="ruins" pointer-events="none" aria-hidden="true"></g><g data-j2-g="sanctlabels" pointer-events="none" aria-hidden="true"></g><g data-j2-g="routeline" pointer-events="none" aria-hidden="true"></g>
                    <g data-j2-g="grid"></g><g data-j2-g="protection"></g><g data-j2-g="markers"></g><g data-j2-g="control"></g>
                    <g data-j2-g="proof"></g><g data-j2-g="select"></g><g data-j2-g="preview"></g><g data-j2-g="locate" pointer-events="none"></g><g data-j2-g="seekers" pointer-events="none" aria-hidden="true"></g><g data-j2-g="party" pointer-events="none" aria-hidden="true"></g><g data-j2-g="routemark" pointer-events="none" aria-hidden="true"></g>
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
                <span class="j2-ico" aria-hidden="true">${LI.locate}</span>
                <strong data-t="journey2_echo_locate"></strong>
                <span class="j2-fog-chip-hint" data-t="journey2_loc_select_hint"></span>
                <span class="j2-fog-chip-hint" data-t="journey2_loc_esc_hint"></span>
                <button type="button" class="btn btn-sm" data-j2-locate-cancel data-t="journey2_loc_cancel"></button>
              </div>
              <aside class="j2-panel" id="j2-panel" data-t-aria="journey2_panel_label" hidden></aside>
              <aside class="j2-region-inspector" id="j2-region-inspector" role="dialog" aria-modal="false" aria-labelledby="j2-region-inspector-title" tabindex="-1" data-j2-inspector hidden>
                <span class="j2-insp-caret" aria-hidden="true"></span>
                <header class="j2-insp-head">
                  <span class="j2-insp-sym"><img alt="" width="28" height="28" data-j2-i="img"></span>
                  <div class="j2-insp-titles">
                    <h3 class="j2-insp-title" id="j2-region-inspector-title" data-j2-i="name"></h3>
                    <p class="j2-insp-sub"><span data-j2-i="ord"></span><span class="j2-insp-ex" data-j2-i="examples" hidden></span><span class="j2-blight" data-j2-i="blight" hidden></span></p>
                  </div>
                  <button type="button" class="btn btn-ghost btn-sm j2-btn-icon" data-j2-insp-close data-t-aria="journey2_inspector_close" data-t-title="journey2_inspector_close">${LI.close}</button>
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
                  <span class="j2-insp-sym"><img src="img/journey2/legend-sanctuary.webp" alt="" width="44" height="39" draggable="false"></span>
                  <div class="j2-sanc-headmain">
                    <div class="j2-insp-titles j2-sanc-titles">
                      <h3 class="j2-insp-title" id="j2-sanctuary-title" data-j2-s="name"></h3>
                      <span class="j2-sanc-rename"><button type="button" class="btn btn-ghost btn-sm j2-btn-icon" data-j2-sanc-rename data-t-aria="journey2_sanc_rename" data-t-title="journey2_sanc_rename">${LI.pencil}</button></span>
                      <span class="j2-sanc-field" data-j2-sanc-field hidden>
                        <input type="text" class="j2-sanc-name-input" data-j2-sanc-name-input maxlength="${Model.MAX_SANCTUARY_NAME}" autocomplete="off" spellcheck="false" data-t-aria="journey2_sanc_rename">
                        <button type="button" class="j2-sanc-fbtn is-save" data-j2-sanc-rename-save data-t-aria="journey2_sanc_rename_save" data-t-title="journey2_sanc_rename_save">${LI.check}</button>
                        <button type="button" class="j2-sanc-fbtn" data-j2-sanc-rename-cancel data-t-aria="journey2_sanc_rename_cancel" data-t-title="journey2_sanc_rename_cancel">${LI.close}</button>
                      </span>
                    </div>
                    <button type="button" class="btn btn-sm j2-sanc-act" data-j2-sanc-name><span class="j2-ico" aria-hidden="true" data-j2-s="nameIco"></span><span data-j2-s="nameLabel"></span></button>
                    <p class="j2-insp-sub j2-sanc-desc" data-j2-s="desc" hidden></p>
                  </div>
                  <button type="button" class="btn btn-ghost btn-sm j2-btn-icon" data-j2-sanc-close data-t-aria="journey2_sanc_close" data-t-title="journey2_sanc_close">${LI.close}</button>
                </header>
                <div class="j2-sanc-echo" data-j2-s="echo" hidden>
                  <button type="button" class="btn btn-sm j2-sanc-act" data-j2-echo-collect><span class="j2-ico" aria-hidden="true">${LI.echo}</span><span data-j2-s="echoLabel"></span></button>
                </div>
                <p class="j2-sanc-ruin" data-j2-s="ruin" hidden><span class="j2-ico" aria-hidden="true">${LI.flame}</span><span data-t="journey2_sanc_ruin_note"></span></p>
                <section class="j2-insp-sec j2-hexenv j2-sanc-env" data-j2-s="envSec" aria-labelledby="j2-sancenv-title" hidden>
                  <h4 class="j2-insp-h" id="j2-sancenv-title" data-t="journey2_sancenv_title"></h4>
                  <div data-j2-s="envBody"></div>
                </section>
                <div class="j2-insp-scroll j2-sanc-rows" data-j2-s="rows"></div>
                <footer class="j2-sanc-foot" data-j2-s="foot">
                  <button type="button" class="btn btn-sm btn-danger" data-j2-sanc-delete data-t="journey2_sanc_delete"></button>
                  <button type="button" class="btn btn-sm btn-primary" data-j2-sanc-reroll><span class="j2-ico" aria-hidden="true"><img src="img/journey2/dice/d6-3d.png" alt="" width="33" height="33" draggable="false"></span><span data-t="journey2_sanc_reroll"></span></button>
                  <button type="button" class="btn btn-sm btn-primary" data-j2-dest-reroll hidden><span class="j2-ico" aria-hidden="true"><img src="img/journey2/dice/d6-3d.png" alt="" width="33" height="33" draggable="false"></span><span data-t="journey2_dest_reroll"></span></button>
                </footer>
              </aside>
              <aside class="j2-region-inspector j2-locate" id="j2-locate" role="dialog" aria-modal="false" aria-labelledby="j2-locate-title" tabindex="-1" data-j2-locate hidden>
                <span class="j2-insp-caret" aria-hidden="true"></span>
                <header class="j2-insp-head"><span class="j2-insp-sym j2-insp-sym--tool" aria-hidden="true">${LI.locate}</span><div class="j2-insp-titles"><h3 class="j2-insp-title" id="j2-locate-title" data-t="journey2_loc_title"></h3></div><button type="button" class="btn btn-ghost btn-sm j2-btn-icon" data-j2-locate-close data-t-aria="journey2_loc_close" data-t-title="journey2_loc_close">${LI.close}</button></header>
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
                </footer>
              </aside>
              <div class="j2-fog-chip j2-route-chip" data-j2-route-chip hidden>
                <span class="j2-ico" aria-hidden="true">${LI.route}</span>
                <strong data-t="journey2_route_plan"></strong>
                <span class="j2-fog-chip-hint" data-j2-route-chip-text></span>
                <span class="j2-fog-chip-hint j2-hint-key" data-t="journey2_route_esc_hint"></span>
                <span class="j2-fog-chip-hint j2-hint-touch" data-t="journey2_route_touch_hint"></span>
                <button type="button" class="btn btn-sm" data-j2-route-cancel data-t="journey2_route_cancel"></button>
              </div>
              <div class="j2-fog-chip j2-party-chip" data-j2-party-chip hidden>
                <span class="j2-ico" aria-hidden="true">${LI.party}</span>
                <strong data-t="journey2_party_btn"></strong>
                <span class="j2-fog-chip-hint" data-t="journey2_party_place_hint"></span>
                <span class="j2-fog-chip-hint" data-t="journey2_party_esc_hint"></span>
                <button type="button" class="btn btn-sm" data-j2-party-cancel data-t="journey2_party_cancel"></button>
              </div>
              <div class="j2-route-bubbles" data-j2-route-bubbles></div>
              <div class="j2-seek" data-j2-seek role="group" data-t-aria="journey2_seek_group" hidden>
                <button type="button" class="j2-seek-btn" data-j2-seek-less data-t-aria="journey2_seek_less" data-t-title="journey2_seek_less"><span aria-hidden="true">&minus;</span></button>
                <output class="j2-seek-count" data-j2-seek-count></output>
                <button type="button" class="j2-seek-btn" data-j2-seek-more data-t-aria="journey2_seek_more" data-t-title="journey2_seek_more"><span aria-hidden="true">+</span></button>
                <button type="button" class="j2-seek-btn j2-seek-x" data-j2-seek-close data-t-aria="journey2_seek_close" data-t-title="journey2_seek_close">${LI.close}</button>
              </div>
              <aside class="j2-route" id="j2-route" role="region" aria-labelledby="j2-route-title" tabindex="-1" data-j2-route hidden>
                <header class="j2-insp-head j2-route-head">
                  <span class="j2-insp-sym j2-insp-sym--tool" aria-hidden="true">${LI.route}</span>
                  <div class="j2-insp-titles j2-route-titles">
                    <h3 class="j2-insp-title j2-route-title" id="j2-route-title" data-t="journey2_route_title"></h3>
                    <p class="j2-insp-sub j2-route-sub" data-j2-r="sub"></p>
                  </div>
                  <button type="button" class="btn btn-ghost btn-sm j2-btn-icon" data-j2-route-details-close data-t-aria="journey2_route_details_close" data-t-title="journey2_route_details_close">${LI.close}</button>
                </header>
                <div class="j2-route-body" data-j2-r="body" role="status" aria-live="polite" aria-atomic="true"></div>
                <div class="j2-route-cmp" data-j2-r="cmp" hidden></div>
                <p class="j2-route-warn j2-route-water-note" data-t="journey2_route_water_note"></p>
              </aside>
            </div>
            <div class="j2-mapbar" data-j2-mapbar role="toolbar" data-t-aria="journey2_mapbar_label">
              <div class="j2-tb-group" role="group" data-j2-history-group data-t-aria="journey2_history_label">
                <button type="button" class="btn btn-sm j2-btn-icon" data-j2-undo data-t-aria="journey2_undo" data-t-title="journey2_undo">${LI.undo}</button>
                <button type="button" class="btn btn-sm j2-btn-icon" data-j2-redo data-t-aria="journey2_redo" data-t-title="journey2_redo">${LI.redo}</button>
              </div>
              <div class="j2-tb-group" role="group" data-t-aria="journey2_zoom_label">
                <button type="button" class="btn btn-sm j2-btn-icon" data-j2-zoom="out" data-t-aria="journey2_zoom_out" data-t-title="journey2_zoom_out">−</button>
                <button type="button" class="btn btn-sm j2-zoom-readout" data-j2-zoom="reset" data-j2-zoom-readout data-t-title="journey2_zoom_reset_title">100%</button>
                <button type="button" class="btn btn-sm j2-btn-icon" data-j2-zoom="in" data-t-aria="journey2_zoom_in" data-t-title="journey2_zoom_in">+</button>
                <button type="button" class="btn btn-sm j2-btn-icon" data-j2-fit data-t-aria="journey2_fit" data-t-title="journey2_fit">${LI.fit}</button>
              </div>
            </div>
            <div class="j2-sidewrap" data-j2-sidewrap>
              <nav class="j2-rail" data-j2-rail role="toolbar" aria-orientation="vertical" data-t-aria="journey2_toolbar_label">
                <button type="button" class="j2-rb j2-rb--toggle" data-j2-side-toggle aria-controls="j2-side" aria-expanded="true" aria-keyshortcuts="[">${LI.panelClose}</button>
                <div class="j2-rail-grp" role="group" data-t-aria="journey2_rail_tools">
                  ${railBtn('data-j2-party aria-pressed="false"', LI.party, 'journey2_party_btn', 'P')}
                  ${railBtn('data-j2-route-plan aria-pressed="false" data-t-title="journey2_route_plan_title"', LI.route, 'journey2_rail_route', 'R')}
                  ${railBtn('data-j2-echo-locate aria-pressed="false" aria-describedby="j2-locate-reason"', LI.locate, 'journey2_rail_locate', 'E')}
                  ${railBtn('data-j2-fog-tool="paint" aria-pressed="false" data-t-title="journey2_fog_paint_title" hidden', LI.brush, 'journey2_rail_brush', 'E')}
                  ${railBtn('data-j2-legend-btn aria-pressed="false" aria-controls="j2-side" data-t-title="journey2_legend_title" hidden', LI.info, 'journey2_rail_legend', 'I')}
                  <span class="sr-only" id="j2-locate-reason" data-j2-locate-reason></span>
                </div>
                <div class="j2-rail-grp" data-j2-rail-pv role="group" data-t-aria="journey2_rail_share" hidden>
                  ${railBtn('data-j2-print-open data-t-title="journey2_pp_open_title"', LI.print, 'journey2_rail_print')}
                  ${railBtn('data-j2-share-link data-t-title="journey2_share_title"', LI.link, 'journey2_rail_link')}
                </div>
                <div class="j2-rail-grp j2-rail-mode" data-j2-rail-mode role="group" data-t-aria="journey2_mode_label">
                  ${railBtn('data-j2-mode-toggle aria-pressed="false" data-t-title="journey2_preview_title"', LI.eye, 'journey2_mode_players', 'V')}
                </div>
                <span class="j2-rail-grow"></span>
                <div class="j2-rail-grp j2-rail-stock" data-j2-rail-stock>
                  <span class="j2-rail-ico" aria-hidden="true">${LI.stock}</span>
                  <span class="j2-rail-count" data-j2-rail-count></span>
                </div>
                <div class="j2-menu-wrap j2-camp j2-disp">
                  ${railBtn('data-j2-menu-btn="display" aria-haspopup="menu" aria-expanded="false" data-t-aria="journey2_display_aria"', LI.display, 'journey2_rail_display')}
                  <div class="j2-menu j2-camp-menu" role="menu" data-j2-menu="display" data-t-aria="journey2_display_aria" hidden>
                    <button type="button" class="j2-menu-item j2-mi" role="menuitemcheckbox" aria-checked="true" data-j2-biome-colors><span class="j2-mi-ico" aria-hidden="true">${LI.palette}</span><span data-t="journey2_biome_label"></span><span class="j2-mi-sw" aria-hidden="true"></span></button>
                    <button type="button" class="j2-menu-item j2-mi" role="menuitemcheckbox" aria-checked="true" data-j2-sepia><span class="j2-mi-ico" aria-hidden="true">${LI.palette}</span><span data-t="journey2_sepia_label"></span><span class="j2-mi-sw" aria-hidden="true"></span></button>
                    <button type="button" class="j2-menu-item j2-mi" role="menuitemcheckbox" aria-checked="false" data-j2-regions><span class="j2-mi-ico" aria-hidden="true">${LI.hexes}</span><span data-t="journey2_regions_label"></span><span class="j2-mi-sw" aria-hidden="true"></span></button>
                    <button type="button" class="j2-menu-item j2-mi" role="menuitemcheckbox" aria-checked="false" data-j2-static-fx><span class="j2-mi-ico" aria-hidden="true">${LI.flame}</span><span data-t="journey2_static_label"></span><span class="j2-mi-sw" aria-hidden="true"></span></button>
                    <button type="button" class="j2-menu-item j2-mi" role="menuitemcheckbox" aria-checked="false" data-j2-outline data-t-title="journey2_outline_title" hidden><span class="j2-mi-ico" aria-hidden="true">${LI.hexes}</span><span data-t="journey2_rail_outline"></span><span class="j2-mi-sw" aria-hidden="true"></span></button>
                    <button type="button" class="j2-menu-item j2-mi" role="menuitemcheckbox" aria-checked="true" data-j2-party-mark hidden><span class="j2-mi-ico" aria-hidden="true">${LI.party}</span><span data-t="journey2_party_mark_label"></span><span class="j2-mi-sw" aria-hidden="true"></span></button>
                  </div>
                </div>
                <div class="j2-menu-wrap j2-camp" data-j2-gm-row>
                  ${railBtn('data-j2-menu-btn="campaign" aria-haspopup="menu" aria-expanded="false" data-t-aria="journey2_campaign_aria"', LI.campaign, 'journey2_rail_campaign')}
                  <div class="j2-menu j2-camp-menu" role="menu" data-j2-menu="campaign" data-t-aria="journey2_campaign_aria" hidden>
                    <p class="j2-menu-h" role="presentation" data-t="journey2_echo_group"></p>
                    <button type="button" class="j2-menu-item j2-mi" role="menuitem" data-j2-echo-place data-t-title="journey2_echo_place_title"><span class="j2-mi-ico" aria-hidden="true">${LI.echo}</span><span data-t="journey2_menu_echo_place"></span></button>
                    <button type="button" class="j2-menu-item j2-mi" role="menuitem" data-j2-echo-clear data-t-title="journey2_echo_clear_title"><span class="j2-mi-ico" aria-hidden="true">${LI.eraser}</span><span data-t="journey2_echo_clear"></span></button>
                    <p class="j2-menu-h" role="presentation" data-t="journey2_sanc_group"></p>
                    <button type="button" class="j2-menu-item j2-mi" role="menuitem" data-j2-sanc-generate data-t-title="journey2_sanc_generate_title"><span class="j2-mi-ico" aria-hidden="true">${LI.sanctuary}</span><span data-j2-sanc-generate-label></span></button>
                    <p class="j2-menu-h" role="presentation" data-t="journey2_ruin_group"></p>
                    <button type="button" class="j2-menu-item j2-mi" role="menuitem" data-j2-ruin-place data-t-title="journey2_ruin_place_title"><span class="j2-mi-ico" aria-hidden="true">${LI.flame}</span><span data-t="journey2_menu_ruin_place"></span></button>
                    <button type="button" class="j2-menu-item j2-mi" role="menuitem" data-j2-ruin-clear data-t-title="journey2_ruin_clear_title"><span class="j2-mi-ico" aria-hidden="true">${LI.eraser}</span><span data-t="journey2_ruin_clear"></span></button>
                    <p class="j2-menu-h" role="presentation" data-t="journey2_shadow_group"></p>
                    <button type="button" class="j2-menu-item j2-mi" role="menuitem" data-j2-shadow-reset data-t-title="journey2_shadow_reset_title"><span class="j2-mi-ico" aria-hidden="true">${LI.eraser}</span><span data-t="journey2_shadow_reset"></span></button>
                    <p class="j2-menu-h" role="presentation" data-t="journey2_clearmap_group"></p>
                    <button type="button" class="j2-menu-item j2-mi j2-mi-danger" role="menuitem" data-j2-clear-map data-t-title="journey2_clearmap_title"><span class="j2-mi-ico" aria-hidden="true">${LI.trash}</span><span data-t="journey2_clearmap"></span></button>
                  </div>
                </div>
              </nav>
              <aside class="j2-side" id="j2-side" data-t-aria="journey2_side_label">
                <header class="j2-about">
                  <h2 class="j2-about-title" data-t="journey2_about_title"></h2>
                  <p class="j2-about-sub" data-t="journey2_about_sub"></p>
                </header>
                <div class="j2-legend" data-j2-legend>
                  <h3 class="j2-legend-h" data-t="journey2_legend_h"></h3>
                  <ul class="j2-legend-list">
                    <li data-j2-legend-item="party"><span class="j2-legend-sym"><svg viewBox="-12 -12 24 24" aria-hidden="true"><g class="j2-party-mark"><path class="j2-party-halo" d="${partyStarPath(0, 0, 9)}"/><path class="j2-party-star" d="${partyStarPath(0, 0, 9)}"/></g></svg></span><span data-t="journey2_legend_party"></span></li>
                    <li data-j2-legend-item="sanctuary"><span class="j2-legend-sym"><img src="img/journey2/legend-sanctuary.webp" alt="" width="44" height="39" draggable="false"></span><span data-t="journey2_legend_sanctuary"></span></li>
                    <li data-j2-legend-item="shadow"><span class="j2-legend-sym">${LEGEND_SHADOW_FX}<svg class="j2-legend-glyph" viewBox="-12 -12 24 24" aria-hidden="true"><path class="j2-legend-x-halo" d="M-7-7l14 14m0-14l-14 14"/><path class="j2-legend-x" d="M-7-7l14 14m0-14l-14 14"/></svg></span><span><span data-t="journey2_legend_shadow"></span><span class="j2-legend-desc" data-t="journey2_legend_shadow_desc"></span></span></li>
                    <li data-j2-legend-item="echo"><span class="j2-legend-sym"><svg viewBox="-12 -12 24 24" aria-hidden="true"><g class="j2-echo is-collected">${ECHO_SPENT}</g></svg></span><span data-t="journey2_legend_echo"></span></li>
                    <li data-j2-legend-ruin hidden><span class="j2-legend-sym j2-legend-sym--ruin"><img src="img/journey2/legend-ruin.webp" alt="" width="44" height="48" draggable="false"></span><span data-t="journey2_legend_ruin"></span></li>
                    <li data-j2-legend-item="terrain"><span class="j2-legend-sym"><svg viewBox="-12 -12 24 24" aria-hidden="true"><circle class="j2-legend-dot" cx="-5" cy="0" r="1.7"/><circle class="j2-legend-dot" cx="0" cy="0" r="1.7"/><circle class="j2-legend-dot" cx="5" cy="0" r="1.7"/></svg></span><span data-t="journey2_legend_terrain"></span></li>
                    <li data-j2-legend-item="unknown"><span class="j2-legend-sym"><svg viewBox="-12 -12 24 24" aria-hidden="true"><polygon class="j2-legend-fog" points="9.5,-5.5 9.5,5.5 0.0,11.0 -9.5,5.5 -9.5,-5.5 -0.0,-11.0"/></svg></span><span data-t="journey2_legend_unknown"></span></li>
                  </ul>
                  <div class="j2-legend-biomes" data-j2-legend-biomes hidden>
                    <h3 class="j2-legend-h" data-t="journey2_legend_biomes_h"></h3>
                    <ul class="j2-legend-list j2-legend-list--biomes" data-j2-legend-biome-list></ul>
                  </div>
                  <div class="j2-legend-touch">
                    <h3 class="j2-legend-h" data-t="journey2_legend_controls_h"></h3>
                    <p class="j2-legend-p" data-t="journey2_legend_controls_touch"></p>
                  </div>
                </div>
                <div class="j2-seg" role="group" data-j2-mode-seg data-t-aria="journey2_mode_label">
                  <button type="button" class="j2-seg-btn" data-j2-preview-back aria-pressed="true" data-t-title="journey2_preview_back"><span class="j2-ico" aria-hidden="true">${LI.gm}</span><span data-t="journey2_mode_gm"></span></button>
                  <button type="button" class="j2-seg-btn" data-j2-preview aria-pressed="false" data-t-title="journey2_preview_title"><span class="j2-ico" aria-hidden="true">${LI.eye}</span><span data-t="journey2_mode_players"></span></button>
                </div>
                <div class="j2-ctl-preview" data-j2-preview-bar hidden>
                  <p class="j2-preview-note" data-t="journey2_preview_hint"></p>
                  <p class="j2-mouse-pair" aria-hidden="true"><span class="j2-mouse-ico">${ICON.mouseLeft}</span><span data-t="journey2_fog_reveal"></span><span class="j2-mouse-ico">${ICON.mouseRight}</span><span data-t="journey2_fog_hide"></span></p>
                  <div class="j2-share-out" data-j2-share-out hidden>
                    <p class="j2-share-note" data-j2-share-note role="status"></p>
                    <input type="text" class="j2-input j2-share-url" data-j2-share-url readonly data-t-aria="journey2_share_url_label">
                  </div>
                </div>
                <form class="j2-gen" data-j2-gen novalidate>
                  <button type="submit" class="btn btn-primary j2-gen-go" data-j2-generate data-t-title="journey2_gen_hint" aria-describedby="j2-gen-desc"><span class="j2-ico"><img src="img/journey2/dice/d6-3d.png" alt="" width="33" height="33" draggable="false"></span><span data-t="journey2_gen_go"></span></button>
                  <span class="sr-only" id="j2-gen-desc" data-t="journey2_gen_hint"></span>
                  <p class="j2-field-error" id="j2-gen-error" data-j2-gen-error role="alert" hidden></p>
                </form>
                <div class="j2-side-scroll" data-j2-side-scroll>
                  <div class="j2-banner" data-j2-banner hidden role="alert"></div>
                  <section class="j2-stock" aria-labelledby="j2-stock-title">
                    <h3 class="j2-h j2-h--row" id="j2-stock-title"><span data-t="journey2_stock_title"></span><span class="j2-h-end"><span class="j2-count" data-j2-stock-count></span><button type="button" class="icon-btn j2-clear-unplaced" data-j2-clear-unplaced data-t-title="journey2_clear_unplaced" data-t-aria="journey2_clear_unplaced" hidden>${LI.trash}</button></span></h3>
                    <div data-j2-stock-empty><p class="j2-empty" data-t="journey2_stock_empty"></p><p class="j2-gen-hint" data-t="journey2_gen_hint"></p></div>
                    <p class="j2-place-hint" data-j2-place-hint data-t="journey2_place_hint_shared" hidden></p>
                    <div class="j2-cards" data-j2-cards></div>
                  </section>
                </div>
              </aside>
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
      ui.sancGenerate = container.querySelector('[data-j2-sanc-generate]');
      ui.sancGenerateLabel = container.querySelector('[data-j2-sanc-generate-label]');
      ui.sancReroll = ui.sanctuary.querySelector('[data-j2-sanc-reroll]');
      ui.destReroll = ui.sanctuary.querySelector('[data-j2-dest-reroll]');
      ui.sancDelete = ui.sanctuary.querySelector('[data-j2-sanc-delete]');
      ui.sancName = ui.sanctuary.querySelector('[data-j2-sanc-name]');
      ui.sancField = ui.sanctuary.querySelector('[data-j2-sanc-field]');
      ui.sancClose = ui.sanctuary.querySelector('[data-j2-sanc-close]');
      ui.sancNameInput = ui.sanctuary.querySelector('[data-j2-sanc-name-input]');
      ui.sancRename = ui.sanctuary.querySelector('[data-j2-sanc-rename]');
      ui.echoCollect = ui.sanctuary.querySelector('[data-j2-echo-collect]');
      ui.knownSanc = container.querySelector('[data-j2-known-sanc]');
      ui.zoomReadout = container.querySelector('[data-j2-zoom-readout]');
      ui.badge = container.querySelector('[data-j2-proof-badge]');
      ui.side = container.querySelector('.j2-side');
      ui.sidewrap = container.querySelector('[data-j2-sidewrap]');
      ui.stage = container.querySelector('[data-j2-stage]');
      if (playerMode && isPhoneWidth()) ui.stage.setAttribute('data-side', 'collapsed');   // a phone's legend starts folded from the first paint (no fade-out on load)
      ui.rail = container.querySelector('[data-j2-rail]');
      ui.railCount = container.querySelector('[data-j2-rail-count]');
      ui.placeHint = container.querySelector('[data-j2-place-hint]');
      ui.sideToggle = container.querySelector('[data-j2-side-toggle]');
      ui.legendBtn = container.querySelector('[data-j2-legend-btn]');
      ui.legendBiomes = container.querySelector('[data-j2-legend-biomes]');
      ui.legendBiomeList = container.querySelector('[data-j2-legend-biome-list]');
      ui.mapbar = container.querySelector('[data-j2-mapbar]');
      ui.railPv = container.querySelector('[data-j2-rail-pv]');
      ui.railMode = container.querySelector('[data-j2-rail-mode]');
      ui.modeToggle = container.querySelector('[data-j2-mode-toggle]');
      ui.campBtn = container.querySelector('[data-j2-menu-btn="campaign"]');
      ui.dispBtn = container.querySelector('[data-j2-menu-btn="display"]');
      ui.sideScroll = container.querySelector('[data-j2-side-scroll]');
      ui.railStock = container.querySelector('[data-j2-rail-stock]');
      ui.biomeColors = container.querySelector('[data-j2-biome-colors]');
      ui.sepia = container.querySelector('[data-j2-sepia]');
      ui.regions = container.querySelector('[data-j2-regions]');
      ui.staticFx = container.querySelector('[data-j2-static-fx]');
      ui.partyMark = container.querySelector('[data-j2-party-mark]');
      ui.fogTool = container.querySelector('[data-j2-fog-tool="paint"]');
      ui.outlineBtn = container.querySelector('[data-j2-outline]');
      ui.echoPlace = container.querySelector('[data-j2-echo-place]');
      ui.echoClear = container.querySelector('[data-j2-echo-clear]');
      ui.ruinPlace = container.querySelector('[data-j2-ruin-place]');
      ui.ruinClear = container.querySelector('[data-j2-ruin-clear]');
      ui.shadowReset = container.querySelector('[data-j2-shadow-reset]');
      ui.clearMap = container.querySelector('[data-j2-clear-map]');
      ui.legendRuin = container.querySelector('[data-j2-legend-ruin]');
      ui.legendItems = Array.from(container.querySelectorAll('[data-j2-legend-item]'));
      ui.echoLocate = container.querySelector('[data-j2-echo-locate]');
      ui.locateReason = container.querySelector('[data-j2-locate-reason]');
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
      ui.partyBtn = container.querySelector('[data-j2-party]');
      ui.partyChip = container.querySelector('[data-j2-party-chip]');
      ui.previewBtn = container.querySelector('[data-j2-preview]');
      ui.previewBar = container.querySelector('[data-j2-preview-bar]');
      ui.previewBack = container.querySelector('[data-j2-preview-back]');
      ui.printOpen = container.querySelector('[data-j2-print-open]');
      ui.shareBtn = container.querySelector('[data-j2-share-link]');
      ui.shareOut = container.querySelector('[data-j2-share-out]');
      ui.shareNote = container.querySelector('[data-j2-share-note]');
      ui.shareUrl = container.querySelector('[data-j2-share-url]');
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
      ui.clearUnplaced = container.querySelector('[data-j2-clear-unplaced]');
      ui.hint = container.querySelector('[data-j2-hint]');
      ui.tip = container.querySelector('[data-j2-tip]');
      ui.live = container.querySelector('[data-j2-live]');
      ui.g = {};
      for (const g of container.querySelectorAll('[data-j2-g]')) ui.g[g.getAttribute('data-j2-g')] = g;
      baseImg.className = 'j2-base'; baseImg.alt = ''; baseImg.draggable = false; baseImg.width = W; baseImg.height = H;
      ui.base.replaceWith(baseImg);
      ui.base = baseImg;
      createShadowFx();
      syncHeaderHeight();
      initDocument();
      // H-04: another tab saving the map. `storage` events only cover tabs that are open and awake, so every edit path also re-checks the stored map (conflictBlocks).
      // View-preference writes (dhcodex_journey2_ui) are a different key and never count.
      const mapKey = store.keys.map;
      listen(window, 'storage', e => {
        if (inst.disposed || conflict) return;
        if (e.storageArea && storage && e.storageArea !== storage) return;
        if (e.key === null || e.key === mapKey) conflictBlocks();
      });
      listen(window, 'focus', () => { if (!inst.disposed && !conflict) conflictBlocks(); });
      const prefs = store.loadUi();
      sideCollapsed = playerMode ? isPhoneWidth() : !!prefs.sideCollapsed;   // the player page's panel is its legend: open on a desktop, folded on a phone; never stored
      // the player page starts from the GM's link (its defaults) and keeps any change for this session only; the GM's view and preview use the stored preferences (PD-065)
      const linked = playerMode && playerLoad && playerLoad.snap ? playerLoad.snap : null;
      showBiome = linked ? linked.biomeColors !== false : prefs.showBiomeColors !== false;
      showSepia = linked ? linked.sepiaMap !== false : prefs.sepiaMap !== false;
      showRegions = playerMode ? !!(linked && linked.regionIcons) : !!prefs.regionIcons;
      ui.root.toggleAttribute('data-sepia', showSepia);
      applyMotion();
      ui.partyMark.hidden = !playerMode;
      showOutline = !!prefs.showPlacedOutline;
      savedView = prefs.view;
      resumePreview = !!prefs.playerPreview || playerMode;
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
      if (playerMode) {                                      // PD-052: the decoded snapshot as a synthetic document; a store with NO storage, so no dhcodex_journey2_* key is ever read or written
        store = Store.createStore(null, data.ctx);
        loadInfo = { status: 'ok', doc: playerLoad.doc };
        doc = playerLoad.doc; editLocked = true; saveState = { status: 'saved', reason: null };
        return;
      }
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
      if (conflict) return;
      if (editLocked) { saveState = { status: 'blocked', reason: loadInfo && loadInfo.code }; return; }
      const r = store.save(doc);
      if (!r.ok && r.reason === 'conflict') { enterConflict(); return; }
      saveState = r.ok ? { status: 'saved', reason: null } : { status: r.reason === 'unavailable' ? 'unavailable' : 'failed', reason: r.reason };
      renderBanner();
    }

    /**
     * H-04: another tab saved a different map than the one this tab last read or wrote. Editing, Undo/Redo, import and Start-empty stop here (nothing is
     * written, nothing is merged, nothing is reloaded silently); the map stays visible and exportable. Only a reload of the tab resolves it. A storage
     * FAILURE (quota, unavailable) is a different state and never lands here.
     */
    function enterConflict() {
      if (conflict || inst.disposed) return;
      conflict = true; editLocked = true;
      saveState = { status: 'conflict', reason: 'conflict' };
      cancelTransient(); cancelFogStroke();
      renderBanner();
      if (ui.root) renderAll(false);
    }

    /** True when an edit must not proceed: already in conflict, or the stored map has changed since this tab last saw it (checked fresh, not only on `storage` events). */
    function conflictBlocks() {
      if (conflict) return true;
      if (store && !inst.disposed && store.isStale()) { enterConflict(); return true; }
      return false;
    }

    /** Why a saved (browser-stored, not imported) map could not be read; the import-file wording is the fallback for codes without a saved-map variant (L5-19). */
    function savedCodeText(code) {
      const id = String(code || 'invalid').replace(/-/g, '_'), own = 'journey2_saved_code_' + id;
      return t(t(own) !== own ? own : 'journey2_import_code_' + id);
    }

    function renderBanner() {
      if (!ui.banner) return;
      const s = saveState.status;
      let html = '';
      if (conflict) {
        html = '<p>' + esc(t('journey2_banner_conflict')) + '</p>' +
          '<div class="j2-banner-actions"><button type="button" class="btn btn-sm" data-j2-act="export">' + esc(t('journey2_backup_export')) + '</button>' +
          '<button type="button" class="btn btn-sm btn-primary" data-j2-act="reload">' + esc(t('journey2_conflict_reload')) + '</button></div>';
      } else if (editLocked) {
        const code = loadInfo && loadInfo.code;
        html = '<p>' + esc(fill('journey2_banner_corrupt', { reason: savedCodeText(code) })) + '</p>' +
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
      if (conflictBlocks()) return { ok: false, error: { code: 'conflict' } };
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
      if (inst.disposed || editLocked || conflictBlocks()) return;
      cancelTransient();
      const e = Model.historyUndo(history);
      if (!e) return;
      envPicker = null;
      doc = e.before;
      afterDocChange();
      announce(t('journey2_live_undo') + (locateNote ? '. ' + locateNote : ''));
    }
    function redo() {
      if (inst.disposed || editLocked || conflictBlocks()) return;
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
      announce(fillN('journey2_live_created', { name: batchName(batch), n: n(batch.quantity) }, [batch.quantity]));
    }

    /* ---- sidebar overlay ---- */

    /** The player page's phone composition (css/journey2.css, <= 640px): a bottom bar and a legend that opens above it. */
    function isPhoneWidth() { return !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches); }

    function applySideState(persistIt) {
      ui.stage.setAttribute('data-side', sideCollapsed ? 'collapsed' : 'expanded');
      // the hidden half is taken out of the tab order and the accessibility tree; the transition itself is CSS-only. The rail is always there (PD-057).
      ui.side.inert = sideCollapsed;
      syncSideToggle();
      if (persistIt) saveUiPrefs();
    }

    /* ---- the rail (PD-057): its buttons ARE the tools (no proxies), so state code writes straight to them ---- */

    /** One collapse / expand button whose icon, name and aria-expanded follow the panel state (and the language). */
    function syncSideToggle() {
      if (ui.legendBtn) ui.legendBtn.setAttribute('aria-pressed', String(!sideCollapsed));   // the player page's Legend tool IS the panel toggle
      const b = ui.sideToggle;
      if (!b) return;
      const label = t(sideCollapsed ? 'journey2_side_expand' : 'journey2_side_collapse');
      b.setAttribute('aria-expanded', String(!sideCollapsed));
      b.setAttribute('aria-label', label);
      b.title = label;
      const ico = sideCollapsed ? 'open' : 'close';
      if (b.getAttribute('data-ico') !== ico) { b.innerHTML = sideCollapsed ? LI.panelOpen : LI.panelClose; b.setAttribute('data-ico', ico); }
    }

    /** Re-opens a collapsed panel when something it alone can show (the copy-by-hand link field) must be seen. */
    function ensureSideOpen() {
      if (!sideCollapsed || playerMode) return;
      sideCollapsed = false;
      applySideState(true);
    }

    /** Focuses a toolbar control. The panel's half is inert while collapsed (its mode segment is then the rail's Players button), and an item of a closed rail menu (Campaign or Display) returns focus to the menu's button. */
    function focusTool(src) {
      let el = src;
      if (sideCollapsed && (src === ui.previewBack || src === ui.previewBtn)) el = ui.modeToggle;
      const menu = el && el.closest && el.closest('.j2-menu');
      if (menu && menu.hidden) el = menu.parentNode.querySelector('[data-j2-menu-btn]') || ui.campBtn;
      if (el && !el.hidden && !el.closest('[inert]')) el.focus({ preventScroll: true });
    }

    /** The stored view preferences (sidebar state, "Show fog state") — never the document, never history. */
    function saveUiPrefs() { if (store && !playerMode) store.saveUi({ sideCollapsed: sideCollapsed, showBiomeColors: showBiome, sepiaMap: showSepia, regionIcons: showRegions, showPlacedOutline: showOutline, playerPreview: previewMode, view: currentView() }); }

    /** Explicit toggle only (the user's own click): re-centres the map horizontally in the new free area at the same zoom; never a Fit, and it leaves the selection and active region alone; focus moves to the control that replaces the one used. */
    function toggleSide() {
      const before = sideInset();
      sideCollapsed = !sideCollapsed;
      if (!sideCollapsed && playerMode && isPhoneWidth()) exitRoute({ quiet: true });   // opening the phone legend ends route planning
      applySideState(true);
      // the free map area grows/shrinks by the inset difference: keep the zoom and slide the map by half of it, so what was centred stays centred (no Fit)
      if (data && ui.viewport) { const dx = (sideInset() - before) / 2; if (Math.abs(dx) >= 1) animateCameraBy(dx, 0, 250); }
      followInspector(320);
      const back = playerMode ? ui.legendBtn : ui.sideToggle;
      if (back) back.focus({ preventScroll: true });
    }

    /** Width the overlay sidebar covers on the left of the map (used by Fit only; toggling never refits). */
    function sideInset() {
      if (!ui.sidewrap) return 0;
      if (playerMode && getComputedStyle(ui.rail).flexDirection === 'row') return 0;   // the phone's bottom bar covers no side strip
      const w = sideCollapsed ? ui.rail.offsetWidth : ui.side.offsetLeft + ui.side.offsetWidth;
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
          <button type="button" class="icon-btn j2-inspect" data-j2-inspect data-j2-c="inspect" aria-controls="j2-region-inspector" aria-haspopup="dialog">${LI.inspect}<span class="sr-only" data-j2-c="inspectSr"></span></button>
        </div>
        <p class="j2-warn" data-j2-c="warn" hidden><span class="j2-warn-ico" aria-hidden="true">${LI.warn}</span><span data-j2-c="warnText"></span></p>
        <div class="j2-card-body" id="${bodyId}" data-j2-c="body" hidden>
          <div class="j2-status" data-j2-c="status"><span class="j2-num" data-j2-c="placedText"></span><span class="j2-bar" role="presentation"><span data-j2-c="bar"></span></span><span class="j2-num" data-j2-c="leftText"></span></div>
          <div class="j2-actions" data-j2-c="actions">
            <button type="button" class="j2-handle" data-j2-handle="one"><span class="j2-handle-label" data-j2-c="oneLabel"></span><span class="j2-grip">${ICON.grip}</span></button>
            <button type="button" class="j2-handle j2-handle--all" data-j2-handle="all"><span class="j2-handle-label" data-j2-c="allLabel"></span><span class="j2-grip">${ICON.grip}</span></button>
          </div>
          <div class="j2-card-end">
            <p class="j2-done" data-j2-c="done" hidden><span class="j2-done-ico" aria-hidden="true">${LI.check}</span><span data-j2-c="doneText"></span></p>
            <div class="j2-card-foot">
              <button type="button" class="btn btn-ghost btn-sm j2-btn-icon j2-delete" data-j2-delete data-j2-c="del">${LI.trash}</button>
            </div>
          </div>
        </div>`;
      const refs = { root: root, id: b.id };
      for (const x of root.querySelectorAll('[data-j2-c]')) refs[x.getAttribute('data-j2-c')] = x;
      refs.handleOne = root.querySelector('[data-j2-handle="one"]');
      refs.handleAll = root.querySelector('[data-j2-handle="all"]');
      return refs;
    }

    /** Hex Stock card artwork: the card carries its biome in data-art and css/journey2.css paints the matching img/biomes/<biome>-300.avif / -200.webp (decorative, CSS only).
     *  The eleven natural Journey biomes have art (same set as REGION_ART); a fully overtaken region (habitat.overtaken) has its own 'fully-shadowblighted' art. A merely blighted region keeps its biome's art. */
    function applyStockArt(refs, b) {
      const biome = b.habitat.overtaken ? OVERTAKEN_ART : b.habitat.biome;
      if (biome === OVERTAKEN_ART || REGION_ART[biome]) refs.root.setAttribute('data-art', biome); else refs.root.removeAttribute('data-art');
    }

    /** Updates a card's text and state in place (the handle elements are never recreated mid-drag). */
    function updateCard(refs, b, index, counts, full, holes) {
      const c = counts.get(b.id);
      applyStockArt(refs, b);
      const sym = symbolFor(b);
      const active = b.id === activeBatchId;
      const name = batchName(b), ord = n(index + 1);
      if (full || refs.img.getAttribute('data-sym') !== (sym && sym.id)) { if (sym) refs.img.src = sym.path; refs.img.setAttribute('data-sym', sym ? sym.id : ''); }
      refs.name.textContent = name;
      refs.ord.textContent = '#' + ord;
      refs.dots.hidden = !!b.habitat.overtaken;           // a fully overtaken region has no Terrain Rating
      refs.dots.innerHTML = [1, 2, 3, 4].map(i => '<i' + (i <= b.terrain.value ? ' class="on"' : '') + '></i>').join('');
      refs.dots.setAttribute('aria-label', fill('journey2_terrain_n', { n: b.terrain.value }));
      refs.dots.setAttribute('title', fillN('journey2_terrain_tip', { n: b.terrain.value, d: b.terrain.value }, [b.terrain.value]));
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
      refs.sum.textContent = complete ? fillN('journey2_all_placed', { n: n(c.quantity) }, [c.quantity]) : fill('journey2_status_placed', { placed: n(c.placed), total: n(c.quantity) }) + ' · ' + fill('journey2_status_left', { n: n(c.remaining) });
      refs.warn.hidden = !holes;
      if (holes) refs.warnText.textContent = fill('journey2_warn_holes', { n: n(holes) });
      refs.root.classList.toggle('has-holes', !!holes);
      applyStockArt(refs, b);                            // every card, collapsed or open — before the collapsed early return
      if (!active) return;
      // placement: one status row, or — when nothing is left — a single confirmation and no controls at all
      refs.status.hidden = complete;
      refs.actions.hidden = complete;
      refs.done.hidden = !complete;
      refs.doneText.textContent = fillN('journey2_all_placed', { n: n(c.quantity) }, [c.quantity]);
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
      refs.handleAll.setAttribute('aria-label', fillN('journey2_handle_all_aria', { name: name, n: n(c.remaining) }, [c.remaining]));
      refs.del.setAttribute('aria-label', fill('journey2_delete_aria', { name: name, n: ord }));
      refs.del.setAttribute('title', t('journey2_delete_region'));
      refs.del.disabled = editLocked;
    }

    /** The catalog environments this region's hexes may carry: the existing biome adapter's list, untouched. A fully overtaken region has no base biome and no list. */
    function hexEnvironmentList(b) {
      const biome = b.habitat.overtaken ? null : b.habitat.biome;
      return biome ? environmentsFor(biome) : [];
    }

    function envRowHtml(e, current, i, kind) {
      const sanc = kind === 'sancenv';   // the sanctuary overlay's picker reuses the hex row; only the action hook and the aria text differ
      return '<li class="j2-hexenv-row' + (current ? ' is-current' : '') + '"><a class="j2-env-link" href="' + esc(e.href) + '" data-j2-env><span class="j2-env-tier" aria-hidden="true">' + esc(n(e.tier)) + '</span><span class="j2-env-name">' + esc(e.name) + '</span><span class="sr-only">' + esc(fill('journey2_hexenv_tier', { n: n(e.tier) }) + ' · ' + t('journey2_hexenv_open')) + '</span></a>' +
        (current ? '<span class="j2-hexenv-assigned">' + esc(t('journey2_hexenv_assigned')) + '</span>'
          : '<button type="button" class="btn btn-sm" data-j2-' + (sanc ? 'sancenv' : 'hexenv') + '="assign" data-env-id="' + esc(e.id) + '" aria-label="' + esc(fill(sanc ? 'journey2_sancenv_assign_aria' : 'journey2_hexenv_assign_aria', { name: e.name })) + '"' + (editLocked ? ' disabled' : '') + '>' + esc(t('journey2_hexenv_assign')) + '</button>') + '</li>';
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
        ? '<button type="button" class="btn btn-sm" data-j2-hexenv="change" aria-expanded="' + open + '" aria-controls="j2-hexenv-picker"' + dis + '>' + esc(t(open ? 'journey2_close' : 'journey2_hexenv_change')) + '</button>' : '';
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
      morphInspector(() => { renderInspector(); });
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
        envPicker = null; morphInspector(() => { renderInspector(); }); ensureInspectorClear();
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
      const countAria = fillN('journey2_stock_count_aria', { r: n(list.length), n: n(left) }, [list.length, left]);
      ui.stockCount.textContent = !list.length ? '' : left ? fill('journey2_stock_left', { n: n(left) }) : t('journey2_stock_all_placed');
      ui.stockCount.classList.toggle('has-left', left > 0);
      ui.stockCount.title = list.length ? countAria : '';
      if (list.length) ui.stockCount.setAttribute('aria-label', countAria); else ui.stockCount.removeAttribute('aria-label');
      ui.railCount.textContent = list.length ? n(left) : '';
      ui.railCount.setAttribute('aria-label', fillN('journey2_rail_count_aria', { r: n(list.length), n: n(left) }, [list.length, left]));
      ui.generate.disabled = editLocked;
      ui.clearUnplaced.hidden = !unplacedBatchIds().length;
      ui.clearUnplaced.disabled = editLocked;
    }

    function unplacedBatchIds() {
      const counts = Model.derive(doc).counts;
      return doc.batches.filter(b => !counts.get(b.id).placed).map(b => b.id);
    }

    function confirmClearUnplaced() {
      const ids = unplacedBatchIds();
      if (!ids.length || editLocked || inst.disposed) return;
      openDialog({
        title: t('journey2_clear_unplaced_title'),
        lines: [fill('journey2_clear_unplaced_msg', { n: n(ids.length) }), t('journey2_clear_unplaced_note')],
        actions: [
          { label: t('journey2_cancel'), kind: 'btn-ghost', value: 'cancel', autofocus: true },
          { label: t('journey2_clear_unplaced_go'), kind: 'btn-danger', value: 'delete' },
        ],
      }).then(v => {
        if (inst.disposed || v !== 'delete') { if (!inst.disposed && ui.clearUnplaced && !ui.clearUnplaced.hidden) ui.clearUnplaced.focus({ preventScroll: true }); return; }
        const r = dispatch({ type: 'deleteUnplacedBatches' }, 'deleteUnplacedBatches');
        if (!r.ok) { hint(errorText(r.error)); return; }
        if (activeBatchId && !Model.batchById(doc, activeBatchId)) activeBatchId = null;
        announce(t('journey2_live_unplaced_deleted'));
        ui.generate.focus({ preventScroll: true });
      });
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
      // the panel sits before the rail and the cards in tab order: a keyboard user who pressed Inspect must land in it (Esc returns to the button)
      if (ui.inspector && !ui.inspector.hidden) ui.inspector.focus({ preventScroll: true });
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

    /* Illustrated headers for the shared Region Inspector and the sanctuary overlay (both are .j2-region-inspector panels). One 960x540 WebP per
     * image under img/journey2/headers/<file>.webp; a position override only where the default 'center 25%' crops an image badly.
     * REGION_ART: the eleven natural Journey biomes. universal / settlement are catalog categories, never Journey regions, so they have no entry:
     * a fully overtaken region has its own OVERTAKEN_ART illustration (1280x480, the source's aspect). SANCTUARY_ART: the Settlement illustration belongs to sanctuaries only (decorative; no data). */
    const REGION_ART = {
      forest: {}, drylands: {}, frozen: {}, underground: {}, tropical: {}, mountain: {}, badlands: {},
      aquatic: { pos: 'center 40%' },      // keeps the sea stacks and shows more water
      wetland: { pos: 'center 40%' },      // flooded ground and mist, not only the canopy
      rolling: { pos: 'center 40%' },      // the layered ridge lines
      grassland: { pos: 'center 50%' },    // the plain, river and acacias; at 25% it is mostly sky
    };
    const OVERTAKEN_ART = 'fully-shadowblighted';
    const SANCTUARY_ART = { file: 'settlement', pos: null };
    function applyArt(root, file, pos) {
      if (!file) { root.removeAttribute('data-art'); root.style.removeProperty('--j2-art'); root.style.removeProperty('--j2-art-pos'); return; }
      root.setAttribute('data-art', file);
      root.style.setProperty('--j2-art', 'url("' + new URL('img/journey2/headers/' + file + '.webp', document.baseURI).href + '")');   // absolute: a url() in a custom property otherwise resolves against css/
      if (pos) root.style.setProperty('--j2-art-pos', pos); else root.style.removeProperty('--j2-art-pos');
    }
    function applyHeaderArt(b) {
      if (b.habitat.overtaken) { applyArt(ui.inspector, OVERTAKEN_ART, 'center 55%'); return; }   // the galaxy sits a little below the middle
      const biome = b.habitat.biome, art = REGION_ART[biome];
      applyArt(ui.inspector, art ? biome : '', art && art.pos);
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
        I.terrainN.textContent = d.terrain ? ' · ' + fillN('journey2_days_per_hex', { n: n(d.terrain.days) }, [d.terrain.days]) : '';
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
      for (const node of [ui.rail, sideCollapsed ? null : ui.side, ui.mapbar, ui.panel]) {
        if (!node || node.hidden) continue;
        const r = node.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.push({ x: r.left - wrap.left, y: r.top - wrap.top, w: r.width, h: r.height });
      }
      return out;
    }

    /** Narrow windows (641-900px): a panel keeps clear of the open sidebar and rail instead of sliding under them (phones, <= 640px, use the full width). */
    function narrowLeftInset(wrap) {
      if (playerMode || window.innerWidth <= 640) return 0;
      let right = 0;
      for (const node of [ui.rail, sideCollapsed ? null : ui.side]) { if (node && !node.hidden) { const r = node.getBoundingClientRect(); if (r.width > 0) right = Math.max(right, r.right - wrap.left); } }
      return right ? right + 8 : 0;
    }
    /** Narrow windows: the panel's bottom edge stays above the floating map bar when they share a column. */
    function narrowBottomLimit(wrap) {
      if (window.innerWidth <= 640 || !ui.mapbar) return null;
      const r = ui.mapbar.getBoundingClientRect();
      return r.height > 0 ? r.top - wrap.top - 8 : null;
    }

    /** Places one screen-space panel (the Region Inspector or the sanctuary overlay) beside its anchor, clear of the sidebar and the drawer. */
    function positionPanel(node, anchorOf, key) {
      const wrap = ui.mapwrap.getBoundingClientRect();
      const view = { w: wrap.width, h: wrap.height };
      if (!view.w || !view.h) return;
      const pos = Geo.placeInspector({
        view: view, size: { w: node.offsetWidth, h: node.offsetHeight }, anchor: anchorOf(view),
        blocked: inspectorBlocked(wrap), narrow: window.innerWidth <= 900, left: narrowLeftInset(wrap), bottom: narrowBottomLimit(wrap),
      });
      // A panel that grows or shrinks in place (an expanded section, the environment picker) keeps its top edge where it was and grows downward
      // (clamped to the map area), instead of re-centring on the hex and jumping. A camera move, another hex or another side re-centres as before.
      const a = anchorOf(view), side = pos.side === 'right' || pos.side === 'left';
      if (a && side && key != null) {
        const h = node.offsetHeight, st = node._j2place;
        let hold = null;
        if (st && st.side === pos.side && st.key === key) {
          const grew = st.h !== h, moved = st.ay !== a.y;
          hold = st.hold;
          if (grew && !moved && hold == null) hold = st.y - st.ay;
          else if (moved && !grew) hold = null;
        }
        if (hold != null) {
          const m = 12, hh = Math.min(h, Math.max(0, view.h - 2 * m));
          pos.y = Math.round(Math.min(Math.max(m, a.y + hold), Math.max(m, view.h - m - hh)));
          if (pos.caret) pos.caret.offset = Math.round(Math.min(hh - 18, Math.max(18, a.y - pos.y)));
        }
        node._j2place = { side: pos.side, key: key, h: h, ay: a.y, y: pos.y, hold: hold };
      } else node._j2place = null;
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
      const pan = Geo.panForInspector({ view: view, size: { w: ui.inspector.offsetWidth, h: ui.inspector._j2to || ui.inspector.offsetHeight }, anchor: inspectorAnchor(view), blocked: inspectorBlocked(wrap), narrow: window.innerWidth <= 900 });
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

    /**
     * Runs a change that resizes the open Region Inspector (an expanded terrain note, the Hex Environment picker) and eases its height from the old to
     * the new value instead of snapping; the top edge stays put (positionPanel holds it every frame while the height moves). Instant under reduced motion.
     */
    function morphInspector(change) {
      const el = ui.inspector;
      if (!el || el.hidden || !data) { change(); positionInspector(); return; }
      const from = el.offsetHeight;
      clearTimeout(el._j2morphTimer);
      el.style.height = ''; el.classList.remove('is-morphing'); el._j2to = 0;
      change();
      const to = el.offsetHeight;
      if (prefersReducedMotion() || !from || from === to) { positionInspector(); return; }
      el._j2to = to;
      el.classList.add('is-morphing');
      el.style.height = from + 'px';
      void el.offsetHeight;                                   // commit the start height before the transition target
      el.style.height = to + 'px';
      el._j2morphTimer = setTimeout(() => { el.style.height = ''; el.classList.remove('is-morphing'); el._j2to = 0; positionInspector(); }, 220);
      positionInspector();
    }

    function positionInspector() {
      if (ui.inspector && (ui.inspector.hidden || inspector.batchId == null)) ui.inspector._j2place = null;
      if (inspector.batchId != null && ui.inspector && !ui.inspector.hidden && data) positionPanel(ui.inspector, inspectorAnchor, inspector.batchId + '|' + inspector.tileId);
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

    /**
     * The soft lift behind one tile's glyph: a feathered (blurred) paper patch, drawn BELOW the biome wash so the wash lies evenly over it and
     * over the hexes around it — a hard-edged opaque box here read as a lighter rectangle inside the tinted hex.
     */
    function tileHaloMarkup(q, r, spec) {
      const L = layoutFor(q, r, spec);
      if (!L || L.lay.hidden) return '';
      const b = L.lay.boxPx;
      return '<rect x="' + fmt(b[0], 1) + '" y="' + fmt(b[1], 1) + '" width="' + fmt(b[2], 1) + '" height="' + fmt(b[3], 1) + '" rx="3"/>';
    }

    /** Committed-tile markup: one monochrome symbol, terrain dots and (when blighted) a blight mark. `cls` selects committed/preview. */
    function tileMarkup(q, r, spec, cls, bodyOnly) {
      const L = layoutFor(q, r, spec);
      let h = '';
      if (!L) return h;
      if (L.lay.hidden) return h;       // no clear space: the glyph is withheld (never drawn over a marker); the tile stays, outlined
      const g = L.lay.glyphRectPx;
      const gx = g[0] + (L.boxW - L.gw) / 2;
      h += '<image class="' + cls + '-sym" href="' + esc(L.sym.path) + '" x="' + fmt(gx, 1) + '" y="' + fmt(g[1], 1) + '" width="' + L.gw + '" height="' + L.gh + '" preserveAspectRatio="xMidYMid meet"/>';
      for (const d of L.lay.dotsPx) h += '<circle class="' + cls + '-dot" cx="' + fmt(d[0], 1) + '" cy="' + fmt(d[1], 1) + '" r="1.7"/>';
      if (L.blight) h += blightXMarkup(q, r, cls);
      return h;
    }

    /**
     * The player page's legend names only what players can currently see on the map (like the biomes and the destroyed-sanctuary line): a symbol whose
     * subject is hidden by Fog of War, or not shown at all, would tell players it exists. Everything comes from the projection plus the printed sanctuary hexes.
     */
    function renderLegendItems() {
      if (!ui.legendItems || !playerProjection) return;
      const p = playerProjection, revealed = new Set(p.revealedCells);
      const show = {
        party: !!p.party,
        sanctuary: data.ctx.sanctuaries.some(s => s.cellId && revealed.has(s.cellId)),
        shadow: p.shadowMarks.length > 0 || p.overlays.some(o => o.blightMark),
        echo: p.collectedEchoes.length > 0,
        terrain: p.overlays.some(o => o.dots > 0),
        unknown: true,
      };
      for (const li of ui.legendItems) li.hidden = !show[li.getAttribute('data-j2-legend-item')];
    }

    /** The player page's legend lists only the biomes already on the revealed map (what the GM has just announced), named in the current language. */
    function renderLegendBiomes() {
      if (!ui.legendBiomes || !playerProjection) return;
      const seen = new Set(playerProjection.overlays.map(o => o.symbolId));
      const items = data.symbols.filter(sym => seen.has(sym.id));
      ui.legendBiomes.hidden = !items.length;
      ui.legendBiomeList.replaceChildren(...items.map(sym => {
        const li = document.createElement('li'), tile = document.createElement('span'), img = document.createElement('img'), name = document.createElement('span');
        tile.className = 'j2-legend-sym'; img.alt = ''; img.src = sym.path; img.draggable = false;
        name.textContent = sym.id === OVERTAKEN_SYMBOL ? t('journey2_overtaken') : t('biome_' + sym.id);
        tile.appendChild(img);
        if (sym.id === OVERTAKEN_SYMBOL) { img.classList.add('j2-legend-glyph'); tile.insertAdjacentHTML('afterbegin', legendVoidSvg()); }   // the tear (FX) or the skull (no FX)
        if (sym.id === Model.symbolIdOf({ habitat: { overtaken: true } })) {   // the one biome a player cannot read off its picture: a full-width entry with what it means
          const text = document.createElement('span'), desc = document.createElement('span');
          desc.className = 'j2-legend-desc'; desc.textContent = t('journey2_legend_overtaken_desc');
          text.append(name, desc); li.className = 'is-wide'; li.append(tile, text);
        } else li.append(tile, name);
        return li;
      }));
    }

    /**
     * The Shadowblight FX (PD-072): living shadows and tears on the SCREEN map. Created once per mount; unavailable (no 2D canvas / CSS masks, or a
     * missing module) leaves `sbfx` null and every glyph exactly as before. Pointer-transparent; the camera is pushed to it from scheduleApply.
     */
    function createShadowFx() {
      const Fx = root.Journey2ShadowblightFx;
      if (!Fx || !ui.viewport) return;
      try {
        const reduce = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;   // only watched for a change: the resolved choice is `staticFx`
        const fx = Fx.create({
          grid: data.grid, worldSize: data.template.worldSizePx, shadowGroup: ui.g.blight, rimGroup: ui.g.tear, defs: container.querySelector('[data-j2-sbfx-defs]'),   // its own <defs>: ui.defs is rebuilt by the fog layers
          ground: container.querySelector('[data-j2-ground]'), world: ui.world, cosmos: container.querySelector('[data-j2-cosmos]'),
          cosmosImage: { url: SB_NEBULA.path, width: SB_NEBULA.width, height: SB_NEBULA.height },
          protections: data.ctx.protections, baseHref: ui.base.currentSrc || ui.base.src, reducedMotion: staticFx,
        });
        if (!fx.available) { fx.destroy(); return; }
        sbfx = fx;
        cleanups.push(() => { if (sbfx) { sbfx.destroy(); sbfx = null; } });
        if (reduce && typeof reduce.addEventListener === 'function') listen(reduce, 'change', () => { if (motionPref === null) applyMotion(); });
      } catch (err) {
        sbfx = null;                                           // a failing effect never breaks the map: the glyphs stay
      }
      if (ui.root) ui.root.toggleAttribute('data-sbfx', !!sbfx);
    }
    /** Hands the FX the cells it may draw: the document (GM) or the player projection (Player Preview, player page) — never both, never hidden cells to players. */
    function syncShadowFx() {
      if (!sbfx) return;
      const next = previewMode ? Sbfx().cellsFromProjection(playerProjection) : Sbfx().cellsFromDocument(doc, Model);
      if (sbfx.setCells(next)) sbfxCells = next;                // unchanged cells keep the same object (and the cached perimeter)
    }
    const Sbfx = () => root.Journey2ShadowblightFx;

    /** The Shadowblight X at the top of a hexagon (white halo + ink stroke). Drawn on a tile, or alone on open ground (PD-041: an X that walked off its region). */
    function blightXMarkup(q, r, cls) {
      const m = blightMarkCenter(q, r), k = BLIGHT_X_HALF;
      const d = 'M' + fmt(m[0] - k, 1) + ' ' + fmt(m[1] - k, 1) + 'l' + fmt(2 * k, 1) + ' ' + fmt(2 * k, 1) + 'm0 ' + fmt(-2 * k, 1) + 'l' + fmt(-2 * k, 1) + ' ' + fmt(2 * k, 1);
      return '<path class="' + cls + '-blight-halo" d="' + d + '"/><path class="' + cls + '-blight" d="' + d + '"/>';
    }

    /**
     * The generated-tile layer as SVG markup for a list of { q, r, spec } entries — the ONE drawing routine behind the GM map,
     * Player Preview and the print. It knows nothing about regions, selection or visibility: what to draw has already been decided
     * (GM: every placed tile; players / print: the projection's overlays).
     * `screenFx` (PD-072): the screen map while the Shadowblight FX draw — the living shadow and the tear ARE the marks there, so no
     * Shadowblight X (on a tile or on open ground) and nothing at all for a fully overtaken tile (no skull, no tint, no hex outline: its
     * hexes are one tear). The print (and a browser without the FX) keeps every glyph. Returns { under, rest }: glyph lift + biome wash
     * (drawn below the living shadow) and outlines + glyphs (above it).
     */
    let overlayUid = 0;                                       // unique ids for the per-render <clipPath>/<filter> definitions
    function overlayMarkup(entries) { const o = overlayParts(entries, false); return o.under + o.rest; }
    function overlayParts(entries, screenFx) {
      if (screenFx) entries = entries.filter(e => e.floating || e.spec.symbolId !== OVERTAKEN_SYMBOL).map(e => (e.floating || !e.spec.blightMark ? e : Object.assign({}, e, { spec: Object.assign({}, e.spec, { blightMark: false }) })));
      let outlines = '', quiet = '', body = '', halos = '';
      const tints = new Map();                               // tint key -> merged hex paths; only entries the caller decided to tint
      // "Regions" (PD-062): one symbol per region (per connected piece of it that is drawn), on the hex nearest its middle with room for the glyph; the other
      // hexes keep their tint and Shadowblight X but carry no symbol and no hex outline — the thick region outline is the only line, as in the book
      let iconAt = null;
      if (showRegions) {
        const specAt = new Map(entries.filter(e => !e.floating).map(e => [Geo.cellId(e.q, e.r), e.spec]));
        iconAt = Geo.pickRegionIconCells(data.grid, entries.filter(e => !e.floating).map(e => ({ cell: Geo.cellId(e.q, e.r), region: e.region })),
          (q, r) => { const L = layoutFor(q, r, specAt.get(Geo.cellId(q, r))); return !!L && !L.lay.hidden; });
      }
      for (const e of entries) {
        if (e.floating) { if (!screenFx) body += blightXMarkup(e.q, e.r, 'j2-tile'); continue; }   // a bare X on a hex with no tile (on screen: its living shadow)
        if (e.tint && Tint.definitionOf(e.tint)) tints.set(e.tint, (tints.get(e.tint) || '') + hexPath(e.q, e.r));
        if (iconAt && !iconAt.has(Geo.cellId(e.q, e.r))) { if (e.spec.blightMark) body += blightXMarkup(e.q, e.r, 'j2-tile'); continue; }
        const L = layoutFor(e.q, e.r, e.spec);
        if (iconAt) { /* no per-hex outline in Regions mode */ }
        else if (L && L.lay.hidden) quiet += hexPath(e.q, e.r); else outlines += hexPath(e.q, e.r);
        halos += tileHaloMarkup(e.q, e.r, e.spec);
        body += tileMarkup(e.q, e.r, e.spec, 'j2-tile', false);
      }
      // order inside the layer: glyph lift (BELOW the wash, so the wash is one even colour over it and the hexes around it),
      // biome tint (aria-hidden, no events), hex outlines, then the black symbols / dots / blight marks
      let wash = '';
      for (const [key, d] of tints) { const def = Tint.definitionOf(key); wash += '<path class="j2-biome-tint" data-biome="' + key + '" fill="' + def.color + '" fill-opacity="' + def.opacity + '" d="' + d + '"/>'; }
      if (wash) wash = '<g class="j2-biome-layer" pointer-events="none" aria-hidden="true">' + wash + '</g>';
      // the artwork's printed labels (MARROGATE, HORIZON) are NOT hidden: a placed hex is a translucent wash over the finished map, so the lettering shows through
      let under = '';
      if (halos) {
        const id = 'j2-halo-blur-' + (++overlayUid);
        under += '<filter id="' + id + '" x="-60%" y="-40%" width="220%" height="180%"><feGaussianBlur stdDeviation="3.2"/></filter><g class="j2-tile-halo" filter="url(#' + id + ')">' + halos + '</g>';
      }
      return { under: under + wash, rest: (outlines ? '<path class="j2-tile-hex" d="' + outlines + '"/>' : '') + (quiet ? '<path class="j2-tile-hex is-glyphless" d="' + quiet + '"/>' : '') + body };
    }

    function renderTiles() {
      if (!ui.g || !doc) return;
      if (previewMode) {
        // Player Preview: the GM layer is emptied (not hidden) and only the projection is produced
        ui.g.tiles.innerHTML = '';
        playerProjection = Projection.buildPlayerProjection(projectionDoc(), data.ctx, { biomeTint: showBiome });
        const pl = overlayParts(playerProjection.overlays.map(o => ({ q: o.q, r: o.r, spec: { symbolId: o.symbolId, dots: o.dots, blightMark: o.blightMark }, region: o.region, tint: o.tint }))
          .concat(playerProjection.shadowMarks.map(m => ({ q: m.q, r: m.r, floating: true }))), !!sbfx);
        ui.g.tint.innerHTML = pl.under;
        ui.g.player.innerHTML = pl.rest;
        syncShadowFx();
        if (playerMode) { renderLegendBiomes(); renderLegendItems(); }
        renderParty();
        renderEchoes();
        renderRuins();
        renderPerimeter();
        renderSanctuaryLabels();
        syncRoute();                                         // an open route follows what the players now know (a lit party, a revealed hex)
        return;
      }
      ui.g.player.innerHTML = '';
      renderEchoes();
      renderRuins();
      const byBatch = new Map(doc.batches.map(b => [b.id, b])), tints = Tint.gmTintByCell(doc, showBiome);
      const xs = Model.getShadowXSet(doc), onTile = new Set(doc.tiles.map(tile => tile.cell));
      const entries = doc.tiles.map(tile => { const c = Geo.parseCellId(tile.cell); return { q: c.q, r: c.r, spec: Object.assign(specOfBatch(byBatch.get(tile.batchId)), { blightMark: xs.has(tile.cell) }), tint: tints.get(tile.cell) || null, region: tile.batchId }; });
      for (const id of xs) if (!onTile.has(id)) { const c = Geo.parseCellId(id); if (c) entries.push({ q: c.q, r: c.r, floating: true }); }   // an X that walked off its region (PD-041)
      const gm = overlayParts(entries, !!sbfx);
      ui.g.tint.innerHTML = gm.under;
      ui.g.tiles.innerHTML = gm.rest;
      syncShadowFx();
      renderPerimeter();
      renderSanctuaryLabels();
      renderParty();
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
      if (perimDrawn.tiles === doc.tiles && perimDrawn.vis === vis && perimDrawn.mode === mode && perimDrawn.torn === sbfxCells.overtaken) return;
      // GM: the complete outline above the (subtle) fog state. Player Preview: only the projection's safe edges, beneath the veil.
      let segs = previewMode ? playerProjection.perimeter : Model.regionBoundarySegments(doc, data.ctx);
      if (sbfx && sbfxCells.overtaken.length) {                // PD-072: on screen the torn rim IS a tear's boundary — a straight hex outline round it read as a window frame
        const torn = new Set(sbfxCells.overtaken);
        segs = segs.filter(sg => { if (torn.has(sg.cell)) return false; const c = Geo.parseCellId(sg.cell), d = Geo.NEIGHBOR_DELTAS[sg.dir]; return !torn.has(Geo.cellId(c.q + d.dq, c.r + d.dr)); });
      }
      const d = Geo.polylinesPath(Geo.chainEdgeSegments(data.grid, segs));
      const live = previewMode ? ui.g.perimeterPlayer : ui.g.perimeter, idle = previewMode ? ui.g.perimeter : ui.g.perimeterPlayer;
      live.innerHTML = d ? '<path class="j2-perimeter" d="' + d + '"/>' : '';
      live.setAttribute('data-segments', String(segs.length));
      idle.innerHTML = '';
      idle.setAttribute('data-segments', '0');
      perimDrawn = { tiles: doc.tiles, vis: vis, mode: mode, torn: sbfxCells.overtaken };
    }

    /**
     * Soul Echoes (PD-022, look PD-071): the GM sees a marker on each chosen sanctuary. Like the tiles, the layer is rebuilt (not hidden) in Player Preview: players get
     * ONLY the projection's `collectedEchoes` (PD-052 — a Collected Echo on a revealed hex, drawn as the static spent marker), never an Available one, and the print gets none.
     * The GM view is redrawn only when the set changed.
     */
    function renderEchoes() {
      if (!ui.g || !ui.g.echoes || !doc) return;
      if (previewMode) {
        // players see ONLY a Collected Echo on a revealed sanctuary hex, as the static spent marker (PD-052); an Available one is never drawn
        const at = new Map(data.ctx.sanctuaries.map(s => [s.id, s]));
        let h = '';
        for (const id of (playerProjection && playerProjection.collectedEchoes) || []) {
          const s = at.get(id);
          if (s) h += '<g class="j2-echo is-collected" data-echo="' + esc(id) + '" data-collected="true"><g transform="translate(' + fmt(s.x, 1) + ' ' + fmt(s.top - ECHO_LIFT, 1) + ') scale(' + ECHO_SCALE + ')">' + ECHO_SPENT + '</g></g>';
        }
        ui.g.echoes.innerHTML = h; echoDrawn = null;
        return;
      }
      if (echoDrawn === doc.soulEchoes) return;
      const at = new Map(data.ctx.sanctuaries.map(s => [s.id, s]));
      const got = new Set(doc.soulEchoes.collectedAnchorIds);
      let h = '', i = 0;
      for (const id of doc.soulEchoes.anchorIds) {
        const s = at.get(id);
        if (!s) continue;
        // right above the printed icon (its centre line, just over its top edge), independent of the hex grid, so the icon itself stays clear
        const x = fmt(s.x, 1), y = fmt(s.top - ECHO_LIFT, 1);
        // a collected Echo is its own static drawing (hollow core, a frozen broken ripple, no glow, no motion): shape, not only brightness or motion, tells it from an Available one
        h += got.has(id)
          ? '<g class="j2-echo is-collected" data-echo="' + esc(id) + '" data-collected="true"><g transform="translate(' + x + ' ' + y + ') scale(' + ECHO_SCALE + ')">' + ECHO_SPENT + '</g></g>'
          : '<g class="j2-echo" data-echo="' + esc(id) + '" style="--j2-echo-i:' + (i++) + '"><g transform="translate(' + x + ' ' + y + ') scale(' + ECHO_SCALE + ')">' + ECHO_LIVE + '</g></g>';
      }
      ui.g.echoes.innerHTML = h;
      echoDrawn = doc.soulEchoes;
    }

    /**
     * Destroyed sanctuaries (PD-070): the GM sees a flame and smoke on each of the five; players (Player Preview, the player page) get ONLY the projection's
     * `destroyedSanctuaries` — those whose hex is revealed. Like the Echoes the layer is rebuilt, never CSS-hidden, and the GM view is redrawn only when the set changed.
     * The legend's "Destroyed sanctuary" line follows the same rule: it exists only while one can be seen, so it never says that such places exist.
     */
    function renderRuins() {
      if (!ui.g || !ui.g.ruins || !doc) return;
      const at = new Map(data.ctx.sanctuaries.map(s => [s.id, s]));
      const ids = previewMode ? ((playerProjection && playerProjection.destroyedSanctuaries) || []) : doc.destroyedSanctuaries.anchorIds;
      if (ui.legendRuin) ui.legendRuin.hidden = !ids.length;
      if (!previewMode && ruinDrawn === doc.destroyedSanctuaries) return;
      const key = previewMode ? ids.join(',') : null;
      if (previewMode && key === ruinShownKey) return;
      let h = '';
      for (const id of ids) { const s = at.get(id); if (s) h += ruinFxMarkup(s); }
      ui.g.ruins.innerHTML = h;
      if (root.Journey2RuinFx) root.Journey2RuinFx.attach(ui.g.ruins);
      ruinDrawn = previewMode ? null : doc.destroyedSanctuaries;
      ruinShownKey = key;
    }

    /** Toolbar state of the destroyed-sanctuaries group: Remove is disabled when there is nothing to remove, both while edits are locked. */
    function updateRuinUi() {
      if (!ui.ruinPlace || !doc) return;
      ui.ruinPlace.disabled = editLocked;
      ui.ruinClear.disabled = editLocked || !doc.destroyedSanctuaries.anchorIds.length;
    }

    /** One button, five ruins: draws five of the sanctuaries WITHOUT a Soul Echo at random, then commits those exact ids as ONE undoable command. */
    function placeDestroyedSanctuaries() {
      if (inst.disposed || editLocked || previewMode || !doc) return;
      const commit = () => {
        const plan = Model.planDestroyedSanctuaries(data.ctx, undefined, new Set(doc.soulEchoes.anchorIds));
        const r = dispatch({ type: 'setDestroyedSanctuaries', anchorIds: plan.anchorIds }, 'ruinsPlace');
        if (!r.ok) { hint(errorText(r.error)); return; }
        announce(fillN('journey2_live_ruins_placed', { n: n(plan.anchorIds.length) }, [plan.anchorIds.length]));
      };
      if (!doc.destroyedSanctuaries.anchorIds.length) { commit(); return; }
      openDialog({
        title: t('journey2_ruin_replace_title'),
        lines: [t('journey2_ruin_replace_msg'), t('journey2_echo_undo_note')],
        actions: [
          { label: t('journey2_cancel'), kind: 'btn-ghost', value: 'cancel', autofocus: true },
          { label: t('journey2_echo_replace_go'), kind: 'btn-danger', value: 'replace' },
        ],
      }).then(v => { if (inst.disposed) return; if (v === 'replace') commit(); if (ui.ruinPlace) focusTool(ui.ruinPlace); });
    }

    function confirmClearDestroyedSanctuaries() {
      if (inst.disposed || editLocked || previewMode || !doc || !doc.destroyedSanctuaries.anchorIds.length) return;
      openDialog({
        title: t('journey2_ruin_clear_title_dlg'),
        lines: [fill('journey2_ruin_clear_msg', { n: n(doc.destroyedSanctuaries.anchorIds.length) }), t('journey2_echo_undo_note')],
        actions: [
          { label: t('journey2_cancel'), kind: 'btn-ghost', value: 'cancel', autofocus: true },
          { label: t('journey2_echo_clear_go'), kind: 'btn-danger', value: 'clear' },
        ],
      }).then(v => {
        if (inst.disposed) return;
        if (v === 'clear') {
          const r = dispatch({ type: 'setDestroyedSanctuaries', anchorIds: [] }, 'ruinsClear');
          if (!r.ok) { hint(errorText(r.error)); return; }
          announce(t('journey2_live_ruins_cleared'));
        }
        if (ui.ruinPlace) focusTool(ui.ruinPlace);
      });
    }

    /** Toolbar state of the Shadowblight and whole-map items (PD-074): each is disabled while edits are locked or there is nothing to reset / clear. */
    function updateShadowUi() {
      if (!ui.shadowReset || !doc) return;
      ui.shadowReset.disabled = editLocked || !(doc.shadowMarks.added.length || doc.shadowMarks.suppressed.length);
      ui.clearMap.disabled = editLocked || Model.isEmptyDocument(doc);
    }

    /** PD-074: puts every Shadowblight X back where its tiles imply it — wandering X's (off their tiles) vanish, X's that left a tile return — as ONE undoable command. */
    function confirmResetShadow() {
      if (inst.disposed || editLocked || previewMode || !doc || ui.shadowReset.disabled) return;
      openDialog({
        title: t('journey2_shadow_reset_title_dlg'),
        lines: [t('journey2_shadow_reset_msg'), t('journey2_echo_undo_note')],
        actions: [
          { label: t('journey2_cancel'), kind: 'btn-ghost', value: 'cancel', autofocus: true },
          { label: t('journey2_shadow_reset_go'), kind: 'btn-danger', value: 'reset' },
        ],
      }).then(v => {
        if (inst.disposed) return;
        if (v === 'reset') {
          const r = dispatch({ type: 'setShadowMarks', added: [], suppressed: [] }, 'shadowReset');
          if (!r.ok) { hint(errorText(r.error)); return; }
          announce(t('journey2_live_shadow_reset'));
        }
        if (ui.shadowReset) focusTool(ui.shadowReset);
      });
    }

    /**
     * PD-074: clears the whole map (regions, hexes, fog, Echoes, sanctuaries, ruins, Shadowblight, party). Not undoable (Undo history is cleared), so two
     * dialogs — the first offers a backup download first — and a recovery copy of the current map before the document is replaced (as in an import).
     * Camera, Display switches, language and every other storage key are untouched.
     */
    async function confirmClearMap() {
      if (inst.disposed || editLocked || previewMode || !doc || Model.isEmptyDocument(doc) || conflictBlocks()) return;
      const keepsRecovery = saveState.status !== 'unavailable';
      const lines = [fillN('journey2_clearmap_msg', { batches: n(doc.batches.length), tiles: n(doc.tiles.length) }, [doc.batches.length, doc.tiles.length]), t('journey2_clearmap_scope')];
      if (keepsRecovery) lines.push(t('journey2_import_recovery_kept'));
      const first = await openDialog({
        title: t('journey2_clearmap_title_dlg'), lines: lines,
        actions: [
          { label: t('journey2_import_download_first'), kind: 'btn-ghost', keepOpen: true, run: () => download(Model.serializeBackup(doc), backupFileName()) },
          { label: t('journey2_cancel'), kind: 'btn-ghost', value: 'cancel', autofocus: true },
          { label: t('journey2_clearmap_next'), kind: 'btn-danger', value: 'next' },
        ],
      });
      if (inst.disposed) return;
      const back = () => { if (ui.clearMap) focusTool(ui.clearMap); };
      if (first !== 'next') { back(); return; }
      const second = await openDialog({
        title: t('journey2_clearmap_final_title'), lines: [t('journey2_clearmap_final_msg')],
        actions: [
          { label: t('journey2_cancel'), kind: 'btn-ghost', value: 'cancel', autofocus: true },
          { label: t('journey2_clearmap_go'), kind: 'btn-danger', value: 'clear' },
        ],
      });
      if (inst.disposed) return;
      if (second !== 'clear' || conflictBlocks()) { back(); return; }   // cancelled (or another tab saved meanwhile): nothing changed
      if (keepsRecovery && !store.savePrevious(doc).ok) {
        await openDialog({ title: t('journey2_clearmap_title_dlg'), lines: [t('journey2_import_recovery_failed'), t('journey2_import_error_hint')], actions: [{ label: t('journey2_close'), kind: 'btn-primary', value: 'close', autofocus: true }] });
        if (!inst.disposed) back();
        return;
      }
      replaceDocument(Model.emptyDocument(data.ctx));
      toast(t('journey2_clearmap_done'));
    }

    /** Toolbar state of the Soul Echoes group: Remove disabled when there is nothing to remove, both disabled while edits are locked. */
    function updateEchoUi() {
      if (!ui.echoPlace || !doc) return;
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
        const plan = Model.planSoulEchoes(data.ctx, undefined, Model.getDestroyedSanctuarySet(doc));   // never on a destroyed sanctuary (PD-070)
        const r = dispatch({ type: 'setSoulEchoes', anchorIds: plan.anchorIds }, 'echoesPlace');
        if (!r.ok) { hint(errorText(r.error)); return; }
        announce(fillN('journey2_live_echoes_placed', { n: n(plan.anchorIds.length) }, [plan.anchorIds.length]));
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
       The party marker (PD-045): ONE golden four-pointed star, shown in the GM view AND Player Preview (and printed). Its position and shown flag are
       map data (doc.party, the setParty command); while it is shown its hex and the six around it are lit for the players — derived in the projection
       (Model.getVisibleCellSet), never stored in the Fog of War. The marker has absolute input priority over every other map interaction.
       Placing, dragging and the live light preview are transient (`partyDraft`): one completed drop / drag is one Undo entry, Esc or a cancelled
       pointer changes nothing. A first show with no saved position makes the marker follow the cursor until a click drops it.
       ============================================================ */

    const PARTY_K = 0.36, PARTY_PINCH = 0.3, PARTY_MIN_SCREEN_R = 8;

    /** The concave four-pointed star centred on (x, y) with outer radius k (the shape of the Locate star). */
    function partyStarPath(x, y, k) {
      const m = k * PARTY_PINCH, p = (a, b) => fmt(a, 1) + ' ' + fmt(b, 1);
      return 'M' + p(x, y - k) + 'L' + p(x + m, y - m) + 'L' + p(x + k, y) + 'L' + p(x + m, y + m) + 'L' + p(x, y + k) + 'L' + p(x - m, y + m) + 'L' + p(x - k, y) + 'L' + p(x - m, y - m) + 'Z';
    }

    /** The marker on hex (q, r): a white halo under a gold star with a dark outline. `o.minScreen` keeps it readable when zoomed out; `o.bw` is the black print version. */
    function partyMarkup(q, r, o) {
      const c = data.grid.cellCenter(q, r);
      let k = data.grid.shortDimensionPx * PARTY_K;
      if (o && o.minScreen && cam) k = Math.max(k, o.minScreen / cam.scale);
      const d = partyStarPath(c[0], c[1], k);
      return '<g class="j2-party-mark' + (o && o.bw ? ' is-bw' : '') + '"><path class="j2-party-halo" d="' + d + '"/><path class="j2-party-star" d="' + d + '"/></g>';
    }

    /** The document the player projection is built from: the stored one, or — while a drop / drag is in progress — the same with the party at the draft cell (live light). */
    function projectionDoc() {
      if (!partyDraft) return doc;
      const cell = partyDraft.cell;
      return Object.assign({}, doc, { party: cell ? { cell: cell, shown: true } : { cell: doc.party.cell, shown: false } });
    }

    /** The cell the marker is drawn on: the draft while placing / dragging, else what the current view shows (Player Preview: exactly the projection's party). */
    function partyDrawCell() {
      if (partyDraft) return partyDraft.cell;
      if (previewMode) { const p = playerProjection && playerProjection.party; return p ? Geo.cellId(p.q, p.r) : null; }
      return Model.getPartyCell(doc);
    }

    function paintPartyMarker() {
      const g = ui.g && ui.g.party;
      if (!g || !doc || !data) return;
      const cell = partyDrawCell(), c = cell ? Geo.parseCellId(cell) : null;
      g.innerHTML = c && (showPartyMark || !playerMode) ? partyMarkup(c.q, c.r, { minScreen: PARTY_MIN_SCREEN_R }) : '';
    }

    /** Marker + toolbar state: pressed while shown or being placed, the placing chip, the cursor class. */
    function renderParty() {
      if (!ui.g || !ui.g.party || !doc || !data) return;
      paintPartyMarker();
      if (!ui.partyBtn) return;
      const placing = !!(partyDraft && partyDraft.placing), shown = !!Model.getPartyCell(doc);
      ui.partyBtn.disabled = editLocked;
      ui.partyBtn.setAttribute('aria-pressed', String(shown || placing));
      ui.partyBtn.title = t(placing ? 'journey2_party_title_cancel' : shown ? 'journey2_party_title_hide' : 'journey2_party_title');
      ui.partyChip.hidden = !placing;
      ui.viewport.classList.toggle('is-party-placing', placing && partyDraft.pointerId == null);
    }

    /** The light follows a draft: Player Preview rebuilds its projection (and fog) from projectionDoc(); the GM view only needs the marker. Coalesced per frame. */
    function refreshPartyView() {
      if (!previewMode) { renderParty(); return; }
      if (partyRaf) return;
      partyRaf = requestAnimationFrame(() => { partyRaf = 0; if (!inst.disposed && doc && data) { renderTiles(); renderFog(); } });
    }

    function partyCellAt(e) {
      const c = fogCellFromEvent(e), id = c ? Geo.cellId(c.q, c.r) : null;
      return id && foggable.has(id) ? id : null;
    }

    /** True when the screen point (viewport-local px) is on the shown, stored marker. */
    function partyHitAt(x, y) {
      const cell = Model.getPartyCell(doc), c = cell ? Geo.parseCellId(cell) : null;
      if (!c || !data) return false;
      const ctr = data.grid.cellCenter(c.q, c.r), s = Geo.worldToScreen(cam, ctr[0], ctr[1]);
      const radius = Math.max(data.grid.shortDimensionPx * PARTY_K * cam.scale, PARTY_MIN_SCREEN_R);
      return Math.hypot(x - s[0], y - s[1]) <= radius * 1.15 + 3;
    }

    /** The toolbar button: hide (position remembered), show at the remembered position, or — with no position yet — start following the cursor; pressed again while following, it cancels. */
    function toggleParty() {
      if (inst.disposed || editLocked || !doc || !data) return;
      if (partyDraft && partyDraft.placing) { cancelPartyDraft(true); return; }
      const p = doc.party;
      if (p.shown) { const r = dispatch({ type: 'setParty', shown: false }, 'partyHide'); if (r.ok) announce(t('journey2_live_party_hidden')); return; }
      if (p.cell) { const r = dispatch({ type: 'setParty', shown: true }, 'partyShow'); if (r.ok) announce(t('journey2_live_party_shown')); return; }
      cancelTransient(); cancelFogStroke(); setFogTool(null, { quiet: true });
      exitLocate({ quiet: true }); exitRoute({ quiet: true });
      closeMenus(); hideEnvTip(); clearHint();
      if (diagOpen) setDiagnostics(false);
      closeInspector({ quiet: true }); closeSanctuary({ quiet: true });
      if (sel.tileId) { sel.tileId = null; renderSelection(); renderInventory(false); }
      partyDraft = { cell: null, placing: true, pointerId: null, from: null };
      if (pointer.inside) {
        const w = Geo.screenToWorld(cam, pointer.x, pointer.y), c = data.grid.worldToCell(w[0], w[1]), id = Geo.cellId(c.q, c.r);
        partyDraft.cell = foggable.has(id) ? id : null;
      }
      refreshPartyView(); renderParty();
      announce(t('journey2_live_party_placing'));
    }

    /** Pointer-down on the marker (a drag) or, while following the cursor, anywhere on a hex (the drop). Returns true when it took the press. */
    function startPartyDrag(e) {
      const placing = !!(partyDraft && partyDraft.placing);
      const cell = placing ? partyCellAt(e) : doc.party.cell;
      if (!cell) return false;
      partyDraft = { cell: cell, placing: placing, pointerId: e.pointerId, from: doc.party.cell };
      try { ui.viewport.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events may lack a capturable pointer */ }
      ui.viewport.classList.remove('is-party-hover');
      ui.viewport.classList.add('is-party-dragging');
      e.preventDefault();
      refreshPartyView(); renderParty();
      return true;
    }

    /** While following the cursor (no press yet): the marker sits on the hex under it, and is gone while the pointer is off the map. */
    function hoverPartyDraft(e) {
      const next = partyCellAt(e);
      if (next === partyDraft.cell) return;
      partyDraft.cell = next;
      refreshPartyView();
    }

    /** While pressed: the marker snaps to the hex under the pointer and keeps the last valid hex when the pointer leaves the map. */
    function movePartyDraft(e) {
      const next = partyCellAt(e);
      if (!next || next === partyDraft.cell) return;
      partyDraft.cell = next;
      refreshPartyView();
    }

    /** Pointer released: one command for the whole drop / drag (one Undo entry, one autosave). Nothing to change records nothing. */
    function finishPartyDrag(e) {
      const d = partyDraft;
      if (!d) return;
      const last = partyCellAt(e);
      if (last) d.cell = last;
      partyDraft = null;
      releaseFogCapture(d.pointerId);
      ui.viewport.classList.remove('is-party-dragging');
      markDragged();
      const stored = doc.party;
      if (d.cell && (d.placing || d.cell !== stored.cell || !stored.shown)) {
        const r = dispatch({ type: 'setParty', cell: d.cell, shown: true }, d.placing ? 'partyPlace' : 'partyMove');
        if (r.ok) { announce(t(d.placing ? 'journey2_live_party_placed' : 'journey2_live_party_moved')); return; }
      }
      if (previewMode) { renderTiles(); renderFog(); } else renderParty();
    }

    /** Escape, a cancelled pointer, another tool or Undo: the marker returns to where the document has it (or disappears if it was being placed). */
    function cancelPartyDraft(announceIt) {
      const d = partyDraft;
      if (!d) return;
      partyDraft = null;
      if (ui.viewport) { ui.viewport.classList.remove('is-party-dragging'); if (d.pointerId != null) releaseFogCapture(d.pointerId); }
      if (previewMode) { renderTiles(); renderFog(); } else renderParty();
      if (announceIt) announce(t(d.placing ? 'journey2_live_party_cancelled' : 'journey2_live_party_moved'));
    }

    /** Grab cursor while the pointer is over the marker. */
    function updatePartyCursor(x, y) {
      if (!ui.viewport) return;
      const on = !partyDraft && !editLocked && !spaceDown && partyHitAt(x, y) && !routePinAt(x, y);   // a pin over the marker wins while the Route Planner is open
      if (ui.viewport.classList.contains('is-party-hover') !== !!on) ui.viewport.classList.toggle('is-party-hover', !!on);
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
      const party = Model.getPartyCell(doc);                    // PD-045: a placed, shown party marker IS the party's hex — no selection step
      if (party) { chooseLocateOrigin(party); announce(t('journey2_echo_locate')); return; }
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
        if (!r.ok) { hint(t(seekSettledKey(s.plan))); return; }
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

    /** The message for a "+" that has nothing left to do: arrived next to the party, the way is shut, or the step cap. */
    function seekSettledKey(plan) {
      return plan.settled === 'arrived' ? 'journey2_seek_arrived' : plan.settled === 'blocked' ? 'journey2_seek_blocked' : 'journey2_seek_settled';
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
      ui.seekMore.title = s.plan.maxStep === 0 || s.step >= s.plan.maxStep ? t(seekSettledKey(s.plan)) : t('journey2_seek_more');
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
       history, autosave, backup or storage, never in the projection or a print. Fog of War is neither read nor changed. It also runs in Player Preview and on the read-only
       player page (PD-052), where it knows only the cells players see (revealed tiles + printed sanctuary icons) and shows no encounter estimate.
       ============================================================ */

    const ROUTE_LABEL = { fastest: 'journey2_route_fastest', shortest: 'journey2_route_shortest' };
    const ROUTE_GAP_PX = 6;                                 // centre-to-centre distance of the two parallel lines, in screen px

    /** Cells of fully overtaken regions: impassable to the Route Planner. */
    function blockedCells(d) {
      const over = new Set(d.batches.filter(b => b.habitat.overtaken).map(b => b.id));
      return new Set(d.tiles.filter(tl => over.has(tl.batchId)).map(tl => tl.cell));
    }

    /**
     * Terrain Ratings by cell (rebuilt only when its source object changes). The GM view reads the whole document; Player Preview and the player page read ONLY the
     * player projection — a hex is known to the planner only if players see its tile (its dots are the rating), so fogged terrain is neither used nor routed around (PD-052).
     */
    function routeIndex() {
      const key = previewMode && playerProjection ? playerProjection : doc;
      if (routeTerrain.doc !== key) {
        if (key === doc) routeTerrain = { doc: doc, index: Route.buildTerrainIndex(doc), blocked: blockedCells(doc) };
        else {
          const index = new Map(), blocked = new Set();
          for (const o of key.overlays) { const cell = Geo.cellId(o.q, o.r); if (o.symbolId === Model.OVERTAKEN_SYMBOL) blocked.add(cell); else index.set(cell, o.dots); }
          routeTerrain = { doc: key, index: index, blocked: blocked };
        }
      }
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
    function routeSelecting() { const st = routePlanner.state; return !!st && st.status !== 'result'; }
    /** The planner is usable unless a saved map is unreadable; the read-only player page has no editable map, yet plans routes (PD-052). */
    function routeLocked() { return editLocked && !playerMode; }

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

    /* ---- dragging the A / B pins (PD-031 amended): while the planner is open a press on a pin outranks the party marker (PD-045) ---- */

    const ROUTE_PIN_HIT_PX = 18;                            // screen radius of a pin's grab area (the ring is 11-15 px; a little generous for a trackpad)
    const ROUTE_PIN_HIT_TOUCH_PX = 28;                      // a fingertip is wider: a 56 px grab area for a touch (PD-052)

    /** 'start' | 'end' when the viewport-local point is on a placed pin, else null. B is only a pin in the result, and only when it is not on A's hex. */
    function routePinAt(x, y, touch) {
      const st = routePlanner.state;
      if (!st || routeLocked() || !data || st.status === 'select-start') return null;
      const pins = [['start', st.startCell]];
      if (st.status === 'result' && st.endCell !== st.startCell) pins.push(['end', st.endCell]);
      let best = null, bestD = touch ? ROUTE_PIN_HIT_TOUCH_PX : ROUTE_PIN_HIT_PX;
      for (const [which, cell] of pins) {
        const p = routeCenter(cell), s = Geo.worldToScreen(cam, p[0], p[1]), d = Math.hypot(x - s[0], y - s[1]);
        if (d <= bestD) { best = which; bestD = d; }
      }
      return best;
    }

    function startRoutePinDrag(e, which) {
      const st = routePlanner.state;
      routePinDrag = { which: which, pointerId: e.pointerId, from: which === 'start' ? st.startCell : st.endCell };
      try { ui.viewport.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events may lack a capturable pointer */ }
      ui.viewport.classList.remove('is-route-pin-hover');
      ui.viewport.classList.add('is-route-pin-dragging');
      routeHover = null;
      e.preventDefault();
    }

    /** The pin snaps to the hex under the pointer and keeps the last valid hex off the map or on the other pin; the routes follow it live. */
    function moveRoutePinDrag(e) {
      const [x, y] = localPoint(e), cell = routeCellAt(x, y), st = routePlanner.state;
      if (!cell || !st) return;
      const other = routePinDrag.which === 'start' ? st.endCell : st.startCell;
      if (cell === other) return;
      routePlanner.moveEndpoint(routePinDrag.which, cell);
    }

    function endRoutePinDrag() {
      const d = routePinDrag;
      if (!d) return null;
      routePinDrag = null;
      if (ui.viewport) { ui.viewport.classList.remove('is-route-pin-dragging'); releaseFogCapture(d.pointerId); }
      return d;
    }

    function finishRoutePinDrag(e) {
      const d = endRoutePinDrag();
      if (!d) return;
      markDragged();
      const st = routePlanner.state, now = st && (d.which === 'start' ? st.startCell : st.endCell);
      if (now && now !== d.from) announce(fill('journey2_route_live_pin_moved', { letter: d.which === 'start' ? 'A' : 'B' }));
    }

    /** Escape or a cancelled pointer: the pin goes back to where the drag began. */
    function cancelRoutePinDrag() {
      const d = endRoutePinDrag();
      if (d && routePlanner.state) routePlanner.moveEndpoint(d.which, d.from);
    }

    /** Grab cursor while the pointer is over a pin. */
    function updateRoutePinCursor(x, y) {
      if (!ui.viewport || routePinDrag) return;
      const on = !spaceDown && !!routePinAt(x, y);
      if (ui.viewport.classList.contains('is-route-pin-hover') !== on) ui.viewport.classList.toggle('is-route-pin-hover', on);
    }

    /** Enters the transient tool: everything that could compete for the map is cancelled first; pan, zoom, the sidebar and Fog of War are untouched. */
    function startRoute() {
      if (inst.disposed || routeLocked() || !doc || !data) return;
      if (routePlanner.isActive()) { exitRoute({ focus: true }); return; }
      cancelTransient(); cancelFogStroke(); setFogTool(null, { quiet: true });
      exitLocate({ quiet: true });
      closeMenus(); hideEnvTip(); clearHint();
      if (playerMode && !sideCollapsed && isPhoneWidth()) { sideCollapsed = true; applySideState(false); }   // the phone's legend sheet and the route banner never stack
      if (diagOpen) setDiagnostics(false);
      closeInspector({ quiet: true }); closeSanctuary({ quiet: true });
      if (sel.tileId) { sel.tileId = null; renderSelection(); renderInventory(false); }
      routeHover = null;
      routePlanner.start();
      const party = Model.getPartyCell(doc);                    // PD-045: a placed, shown party marker is point A (Esc steps back to choosing A by hand)
      if (party) { routePlanner.pick(party); announce(t('journey2_route_plan') + '. ' + t('journey2_route_select_end')); return; }
      announce(t('journey2_route_plan') + '. ' + t('journey2_route_select_start'));      // the instruction is announced once
    }

    /** Leaves the planner (Escape, the toolbar button, another tool, Player Preview, import, teardown). `quiet` skips the announcement. */
    function exitRoute(o) {
      if (!routePlanner.isActive()) return false;
      endRoutePinDrag();
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
      if (ev === 'select-start' || ev === 'select-end' || ev === 'closed' || ev === 'move') { routeHover = null; routeDetails = false; }
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
      if (!st || st.status !== 'result' || !st.routes) return null;
      let eff = Route.effectiveStrategy(st.routes, st.strategy);
      if (eff === 'shortest' && routeShortestRedundant(st.routes)) eff = 'fastest';   // no separate bubble: it is the Fastest route
      return { st: st, eff: eff, route: st.routes[eff], shown: routeShownList(st.routes) };
    }

    /** Toolbar, chip, cursor, map layers, bubbles and details from the planner state. */
    function renderRoute() {
      if (!ui.route || !doc || !data) return;
      const st = routePlanner.state, active = !!st, selecting = routeSelecting();
      if (ui.routePlan) { ui.routePlan.disabled = routeLocked(); ui.routePlan.setAttribute('aria-pressed', String(active)); }
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
      if (!st || !data) { if (routeDrawn.line) gl.innerHTML = ''; if (routeDrawn.mark) gm.innerHTML = ''; routeDrawn = { line: '', mark: '' }; return; }
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
      const stats = r.stats.complete ? fillN('journey2_route_bub_stats', { hexes: n(r.stats.hexes), dist: dist, days: n(r.stats.travelDays) }, [r.stats.hexes, r.stats.travelDays]) : fillN('journey2_route_bub_unknown', { hexes: n(r.stats.hexes), dist: dist }, [r.stats.hexes]);
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
        // the expected-encounter estimate is the GM's: players (Player Preview, the player page) never get it (PD-052)
        (previewMode ? '' : '<div><dt>' + esc(t('journey2_route_expected')) + '</dt><dd>' + (s.complete ? nf2.format(s.expectedEncounters) : unknown) + '</dd></div>') + '</dl>';
      if (!s.complete) {
        h += '<p class="j2-route-warn"><strong>' + esc(t('journey2_route_time_unknown')) + '.</strong> ' + (previewMode ? '' : esc(t('journey2_route_enc_unknown')) + '. ') +
          esc(s.unknownHexes === 1 ? t('journey2_route_unknown_one') : fill('journey2_route_unknown_n', { n: n(s.unknownHexes) })) + '</p>' +
          '<p class="j2-route-note">' + esc(t('journey2_route_known_terrain')) + ': ' + n(s.knownHexes) + ' · ' + esc(t('journey2_route_unknown_terrain')) + ': ' + n(s.unknownHexes) +
          (s.knownHexes ? '<br>' + esc(fillN('journey2_route_known_days', { n: n(s.knownDays) }, [s.knownDays])) : '') + '</p>';
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
      const line = (key, r) => '<li>' + esc(fillN('journey2_route_compare_line', { label: t(key), hexes: n(r.stats.hexes), days: n(r.stats.travelDays) }, [r.stats.hexes, r.stats.travelDays])) + '</li>';
      const dh = f.stats.hexes - s.stats.hexes, dd = s.stats.travelDays - f.stats.travelDays;
      return '<ul class="j2-route-cmp-list">' + line('journey2_route_fastest', f) + line('journey2_route_shortest', s) + '</ul>' +
        (dh > 0 && dd > 0 ? '<p class="j2-route-note">' + esc(fillN('journey2_route_compare_hint', { h: n(dh), d: n(dd) }, [dh, dd])) + '</p>' : '');
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
      if (v2) announce(fillN('journey2_route_live_result', { strategy: t(ROUTE_LABEL[v2.eff]), hexes: n(v2.route.stats.hexes) }, [v2.route.stats.hexes]));
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
      if (!sancAnchors) sancAnchors = new Map(data.anchorsDoc.anchors.filter(a => a.kind === 'sanctuary' || a.kind === 'destination').map(a => [a.stableId, a]));
      return sancAnchors;
    }
    function sanctuaryEntry(id) { return id && doc ? (doc.sanctuaries.entries.find(e => e.anchorId === id) || null) : null; }
    /** Horizon / Marrogate (PD-081): the stored Environment of a destination, or null. A destination is clickable only once it has one. */
    function destinationEntry(id) { return id && doc ? (Model.destinationList(doc).find(d => d.anchorId === id) || null) : null; }
    function destinationKey(id) { const a = sanctuaryAnchorMap().get(id); return a && a.builtInLabel && a.builtInLabel.text === 'HORIZON' ? 'journey2_dest_horizon' : 'journey2_dest_marrogate'; }
    function destinationTitle(id) { return t(destinationKey(id)); }
    /** The overlay opens for a sanctuary with generated characteristics OR a Soul Echo (the Echo's state belongs to the fixed anchor, not to the generated data). */
    function sanctuaryHasEcho(id) { return !!(id && doc && doc.soulEchoes.anchorIds.includes(id)); }
    function sanctuaryOpenable(id) { return !!(sanctuaryEntry(id) || sanctuaryHasEcho(id) || destinationEntry(id)); }
    function openableSanctuaryIds() { const ids = new Set(doc.sanctuaries.entries.map(e => e.anchorId)); for (const id of doc.soulEchoes.anchorIds) ids.add(id); for (const d of Model.destinationList(doc)) ids.add(d.anchorId); return ids; }
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
      // Horizon / Marrogate carry no name to reveal, so their dot is always drawn: it is the only sign that the icon opens an Environment (PD-081)
      for (const d of Model.destinationList(doc)) {
        const a = at.get(d.anchorId);
        if (!a) continue;
        const pr = a.iconProtectionArea.rectPx;
        h += '<g class="j2-sanc" data-sanc="' + esc(d.anchorId) + '" data-name-visible="false"><circle class="j2-sanc-dot" cx="' + fmt(a.worldPixelAnchor[0], 1) + '" cy="' + fmt(pr[1] + pr[3], 1) + '" r="3"/></g>';
      }
      ui.g.sanct.innerHTML = h;
      sancDrawn = { sanctuaries: doc.sanctuaries, open: sanctuaryOpen, names: names };
    }

    /** Toolbar state: the one button carries the sanctuary count of the printed map and is disabled while edits are locked. */
    function updateSanctuaryUi() {
      if (!ui.sancGenerate || !doc || !data) return;
      ui.sancGenerateLabel.textContent = fillN('journey2_sanc_generate', { n: n(data.ctx.sanctuaries.length) }, [data.ctx.sanctuaries.length]);
      ui.sancGenerate.disabled = editLocked;
    }

    /** Hides the overlay AND empties it: a closed panel keeps no sanctuary name or table in the DOM (Player Preview must not carry any). */
    function clearSanctuaryPanel() {
      if (!ui.sanctuary) return;
      ui.sanctuary.hidden = true; sanctuaryShown = null; applyArt(ui.sanctuary, '');
      sanctuaryRenaming = false; ui.sancNameInput.value = '';
      ui.s.name.textContent = ''; ui.s.desc.textContent = ''; ui.s.desc.hidden = true; ui.s.rows.innerHTML = ''; ui.s.rows.removeAttribute('data-sig');
      sancEnvPicker = false; ui.s.envSec.hidden = true; ui.s.envBody.innerHTML = ''; ui.s.envBody.removeAttribute('data-sig');
    }

    /** Paints the open overlay from the committed document (rows only when they changed, so a scroll position survives). */
    function renderSanctuaryPanel() {
      if (!ui.sanctuary) return;
      const e = previewMode ? null : sanctuaryEntry(sanctuaryOpen), echo = !previewMode && sanctuaryHasEcho(sanctuaryOpen), dest = previewMode ? null : destinationEntry(sanctuaryOpen);
      if (!e && !echo && !dest) { clearSanctuaryPanel(); return; }
      ui.sanctuary.hidden = false;
      applyArt(ui.sanctuary, SANCTUARY_ART.file, SANCTUARY_ART.pos);
      if (sanctuaryShown !== sanctuaryOpen) { sanctuaryRenaming = false; sancEnvPicker = false; }   // another sanctuary: an unfinished edit and an open picker are dropped
      if (!e) sanctuaryRenaming = false;
      ui.s.name.textContent = dest ? destinationTitle(dest.anchorId) : e ? e.name : t('journey2_sanc_fallback');   // an empty name shows nothing (the pencil still offers the edit)
      ui.s.name.hidden = sanctuaryRenaming;
      ui.s.desc.textContent = dest ? t(destinationKey(dest.anchorId) + '_desc') : '';   // one campaign-book sentence, Horizon / Marrogate only
      ui.s.desc.hidden = !dest;
      ui.sancField.hidden = !sanctuaryRenaming;                          // the input keeps what is typed across re-renders
      ui.sancRename.hidden = ui.sancRename.parentNode.hidden = !e || sanctuaryRenaming;   // the wrapper goes too, or it keeps an empty box
      ui.sancClose.disabled = sanctuaryRenaming;                        // no second X next to the discard X while editing
      ui.sancRename.disabled = editLocked;
      // an Echo-only sanctuary (its characteristics were deleted) shows just the Soul Echo row: no name toggle, no tables, no Reroll / Delete
      ui.sancName.hidden = !e; ui.s.rows.hidden = !e; ui.s.foot.hidden = !(e || dest);
      // Horizon / Marrogate (PD-081): the footer keeps only its own Reroll (no Delete, no sanctuary Reroll)
      ui.sancDelete.hidden = ui.sancReroll.hidden = !!dest; ui.destReroll.hidden = !dest; ui.s.foot.classList.toggle('is-dest', !!dest);
      renderSanctuaryEnv(e, dest);
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
        ui.s.nameIco.innerHTML = shown ? LI.eye : LI.eyeOff;
        ui.s.nameLabel.textContent = t(shown ? 'journey2_sanc_name_hide' : 'journey2_sanc_name_reveal');
        ui.sancName.title = t(shown ? 'journey2_sanc_name_hide_title' : 'journey2_sanc_name_reveal_title');
        ui.sancName.disabled = editLocked;
        ui.sancReroll.disabled = editLocked || !sanctuaryReady();
        ui.sancDelete.disabled = editLocked;
      } else if (dest) ui.destReroll.disabled = editLocked || !sanctuaryEnvironments().length;
      if (!e && ui.s.rows.getAttribute('data-sig')) { ui.s.rows.innerHTML = ''; ui.s.rows.removeAttribute('data-sig'); }
      // GM-only Soul Echo strip: one real button whose label is the next action (the spent marker on the map shows the state); only when this sanctuary holds an Echo
      ui.s.echo.hidden = !echo;
      ui.s.ruin.hidden = !(e && Model.isSanctuaryDestroyed(doc, sanctuaryOpen));   // GM note only: the flame on the map says the same; nothing to click (the name button above still works)
      if (echo) {
        const got = Model.isEchoCollected(doc, sanctuaryOpen);
        ui.s.echoLabel.textContent = t(got ? 'journey2_echo_restore' : 'journey2_echo_mark');
        ui.echoCollect.disabled = editLocked;
      }
      if (sanctuaryShown !== sanctuaryOpen) ui.s.rows.scrollTop = 0;
      sanctuaryShown = sanctuaryOpen;
    }

    /* ---------------- Sanctuary Environments (PD-081) ---------------- */

    /** Every catalog Environment tagged `settlement`, no Tier or other filter: the pool for the 56 sanctuaries and for Horizon / Marrogate (the existing biome adapter, untouched). */
    function sanctuaryEnvironments() { return environmentsFor('settlement'); }

    /** How many sanctuaries / destinations already carry each Environment id (the open one's current id included, so a reroll prefers one nobody holds). */
    function sanctuaryEnvironmentUse() {
      const used = {};
      for (const x of doc.sanctuaries.entries) if (x.environmentId) used[x.environmentId] = (used[x.environmentId] || 0) + 1;
      for (const x of Model.destinationList(doc)) used[x.environmentId] = (used[x.environmentId] || 0) + 1;
      return used;
    }

    /** One id from the settlement pool by the hex rule (least used first, random among equals), or null when the pool is empty. */
    function dealSanctuaryEnvironment() {
      const ids = EnvDeal.dealEnvironments({ pool: sanctuaryEnvironments().map(x => x.id), used: sanctuaryEnvironmentUse(), count: 1, random: dealRandom });
      return ids.length ? ids[0] : null;
    }

    /** The overlay's Environment section: the assigned one as a link to the Environment overlay plus Change (Horizon / Marrogate also have Reroll in the footer). Rebuilt only when its signature changes. */
    function renderSanctuaryEnv(e, dest) {
      const S = ui.s;
      if (!e && !dest) { sancEnvPicker = false; S.envSec.hidden = true; S.envBody.innerHTML = ''; S.envBody.removeAttribute('data-sig'); return; }
      S.envSec.hidden = false;
      const list = sanctuaryEnvironments(), id = (e ? e.environmentId : dest.environmentId) || null;
      const found = id ? list.find(x => x.id === id) || null : null;
      const canChange = list.length > 0, open = !!(sancEnvPicker && canChange);
      if (sancEnvPicker && !canChange) sancEnvPicker = false;
      const sig = [lang, sanctuaryOpen, id || '', open ? 1 : 0, canChange ? 1 : 0, editLocked ? 1 : 0, list.map(x => x.id + ':' + x.name + ':' + x.tier).join(',')].join('|');
      if (S.envBody.getAttribute('data-sig') === sig) return;
      S.envBody.setAttribute('data-sig', sig);
      const change = canChange
        ? '<button type="button" class="btn btn-sm" data-j2-sancenv="change" aria-expanded="' + open + '" aria-controls="j2-sancenv-picker"' + (editLocked ? ' disabled' : '') + '>' + esc(t(open ? 'journey2_close' : 'journey2_hexenv_change')) + '</button>' : '';
      let h = '';
      if (id && found) {
        h += '<div class="j2-hexenv-card"><a class="j2-env-link j2-hexenv-link" href="' + esc(found.href) + '" data-j2-env data-j2-sancenv-link><span class="j2-env-name">' + esc(found.name) + '</span><span class="sr-only"> (' + esc(t('journey2_hexenv_open')) + ')</span></a>' + change + '</div>';
      } else if (id) {
        h += '<div class="j2-hexenv-card is-unavailable"><div class="j2-hexenv-info"><strong class="j2-hexenv-gone">' + esc(t('journey2_hexenv_unavailable')) + '</strong>' +
          '<span class="j2-hexenv-id">' + esc(t('journey2_hexenv_stored_id')) + ': <code>' + esc(id) + '</code></span>' +
          (list.length ? '<span class="j2-insp-muted">' + esc(t('journey2_sancenv_gone')) + '</span>' : '') + '</div>' + change + '</div>';
      } else {
        h += '<div class="j2-hexenv-card is-unavailable"><span class="j2-insp-muted">' + esc(t('journey2_sancenv_none')) + '</span>' + change + '</div>';   // an older save: Change (or Reroll) assigns one
      }
      if (open) h += '<ul class="j2-envs-list j2-hexenv-list" id="j2-sancenv-picker" role="group" aria-label="' + esc(t('journey2_sancenv_picker')) + '">' + list.map((x, i) => envRowHtml(x, x.id === id, i, 'sancenv')).join('') + '</ul>';
      S.envBody.innerHTML = h;
    }

    /** Opens/closes the inline picker. Pure UI state: no command, no history, no autosave. */
    function setSancEnvPicker(open, focus) {
      if (previewMode || !(sanctuaryEntry(sanctuaryOpen) || destinationEntry(sanctuaryOpen))) { sancEnvPicker = false; return; }
      sancEnvPicker = !!open;
      renderSanctuaryPanel(); positionSanctuary();
      if (focus) { const b = ui.s.envBody.querySelector('[data-j2-sancenv="change"]'); if (b) b.focus({ preventScroll: true }); }
    }

    function onSancEnvClick(btn) {
      if (inst.disposed || previewMode || !doc || !sanctuaryOpen) return;
      const kind = btn.getAttribute('data-j2-sancenv'), e = sanctuaryEntry(sanctuaryOpen), d = e ? null : destinationEntry(sanctuaryOpen);
      if (!e && !d) return;
      if (kind === 'change') { setSancEnvPicker(!sancEnvPicker, true); return; }
      if (kind === 'assign') {
        if (editLocked) return;
        const id = btn.getAttribute('data-env-id'), pick = sanctuaryEnvironments().find(x => x.id === id);
        if (!pick) return;                                    // only what the settlement list currently offers can be assigned
        const r = e
          ? dispatch({ type: 'setSanctuary', entry: Object.assign({}, e, { environmentId: pick.id }) }, 'sanctuaryEnvironment', true)
          : dispatch({ type: 'setDestinationEnvironment', anchorId: d.anchorId, environmentId: pick.id }, 'destinationEnvironment', true);
        if (!r.ok) { hint(t('journey2_hexenv_failed')); return; }
        sancEnvPicker = false; renderSanctuaryPanel(); positionSanctuary();
        announce(fill('journey2_hexenv_live_changed', { name: pick.name }));
        const l = ui.s.envBody.querySelector('[data-j2-sancenv-link]'); if (l) l.focus({ preventScroll: true });
      }
    }

    /** Horizon / Marrogate: deals the open destination a fresh Environment (one Undo entry; no confirmation, like the sanctuary Reroll). */
    function rerollDestination() {
      if (inst.disposed || editLocked || previewMode || !doc || !sanctuaryOpen) return;
      const d = destinationEntry(sanctuaryOpen);
      if (!d) return;
      const id = dealSanctuaryEnvironment();
      if (!id) { hint(t('journey2_sanc_unavailable')); return; }
      const r = dispatch({ type: 'setDestinationEnvironment', anchorId: d.anchorId, environmentId: id }, 'destinationReroll');
      if (!r.ok) { hint(t('journey2_sanc_failed')); return; }
      const found = sanctuaryEnvironments().find(x => x.id === id);
      announce(fill('journey2_hexenv_live_changed', { name: found ? found.name : id }));
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
      announce(fill('journey2_live_sanc_opened', { name: e ? sanctuaryTitle(e) : destinationEntry(id) ? destinationTitle(id) : t('journey2_sanc_fallback') }));
      return true;
    }

    /** Closes the overlay; `focus` returns focus to the map, `quiet` skips the live announcement (deletion, import, teardown). */
    function closeSanctuary(opts) {
      if (!sanctuaryOpen) return false;
      const o = opts || {};
      sanctuaryOpen = null; sanctuaryShown = null; sancEnvPicker = false;
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
        // PD-081: one Environment per sanctuary AND per destination (Horizon, Marrogate), all dealt in this one press from the settlement pool by the hex rule —
        // 58 slots from the whole pool, so none repeats; carried by the same single command (one Undo, Redo never re-deals)
        const dests = data.ctx.destinations;
        const ids = EnvDeal.dealEnvironments({ pool: sanctuaryEnvironments().map(x => x.id), used: {}, count: entries.length + dests.length, random: dealRandom });
        entries.forEach((x, i) => { if (ids[i]) x.environmentId = ids[i]; });
        const destinations = dests.map((d, i) => ({ anchorId: d.id, environmentId: ids[entries.length + i] })).filter(d => d.environmentId);
        const r = entries.length ? dispatch({ type: 'setSanctuaries', entries: entries, destinations: destinations }, 'sanctuariesGenerate') : { ok: false };
        if (!r.ok) { hint(t('journey2_sanc_failed')); return; }
        announce(fillN('journey2_live_sanc_generated', { n: n(entries.length) }, [entries.length]));
      };
      const have = doc.sanctuaries.entries.length, visibleNames = Model.getRevealedSanctuaryNameSet(doc).size;
      if (!have) { commit(); return; }
      openDialog({
        title: t('journey2_sanc_replace_title'),
        lines: [fillN('journey2_sanc_replace_msg', { n: n(have) }, [have])].concat(visibleNames ? [fillN('journey2_sanc_replace_visible_msg', { n: n(visibleNames) }, [visibleNames])] : [], [t('journey2_echo_undo_note')]),
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
      const env = dealSanctuaryEnvironment() || e.environmentId;      // PD-081: the Environment is dealt anew with the rest (kept only when the catalog offers nothing)
      if (env) next.environmentId = env;
      const r = dispatch({ type: 'setSanctuary', entry: next }, 'sanctuaryReroll');
      if (!r.ok) { hint(t('journey2_sanc_failed')); return; }
      announce(fill('journey2_live_sanc_rerolled', { name: sanctuaryTitle(next) }));
    }

    /** Pencil: the name becomes a text field holding the old name, fully selected. */
    function startSanctuaryRename() {
      if (inst.disposed || editLocked || previewMode || !doc || !sanctuaryOpen) return;
      const e = sanctuaryEntry(sanctuaryOpen);
      if (!e) return;
      sanctuaryRenaming = true;
      ui.sancNameInput.value = e.name;
      renderSanctuaryPanel();
      ui.sancNameInput.focus({ preventScroll: true }); ui.sancNameInput.select();
    }

    /** Tick (or Enter): saves the field as the name — empty is valid — as one Undo entry, then back to the pencil. Cancel (X or Esc): back to the old name. */
    function endSanctuaryRename(save) {
      if (!sanctuaryRenaming) return;
      const e = sanctuaryEntry(sanctuaryOpen), text = ui.sancNameInput.value.trim();
      sanctuaryRenaming = false;
      if (save && e && !editLocked && !inst.disposed && text !== e.name) {
        const r = dispatch({ type: 'setSanctuary', entry: Object.assign({}, e, { name: text }) }, 'sanctuaryRename');
        if (!r.ok) hint(t('journey2_sanc_failed'));
      }
      renderSanctuaryPanel();
      if (ui.sancRename && !ui.sancRename.hidden) ui.sancRename.focus({ preventScroll: true });
    }

    function onSanctuaryNameKey(ev) {
      ev.stopPropagation();                                            // typing never reaches the map's shortcuts; Esc ends the edit, not the overlay
      if (ev.key === 'Enter') { ev.preventDefault(); endSanctuaryRename(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); endSanctuaryRename(false); }
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
      updateRuinUi();
      updateShadowUi();
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
    /** Zooming out stops at Fit (the whole map in the area the overlays leave free): further out is only empty space. */
    function minScale() { const [vw, vh] = viewSize(); return Geo.fitCamera(Math.max(200, vw - panelInset() - sideInset()), vh, data.template.worldSizePx[0], data.template.worldSizePx[1], 8).scale; }

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
      if (cameraReady) liveView = measureView() || liveView;
      scheduleApply();
      scheduleCameraSave();
    }

    /**
     * The camera is a view preference (dhcodex_journey2_ui), never part of the map or its history: it is stored as the world point at the viewport centre plus the zoom,
     * so a different window size still lands on the same spot, or as "fit" so a fitted map stays fitted. Writes are debounced and flushed when the page is hidden.
     */
    function measureView() {
      if (fitMode) return { fit: true, cx: 0, cy: 0, scale: 1 };
      const [vw, vh] = viewSize();
      if (!vw || !vh) return null;
      const w = Geo.screenToWorld(cam, vw / 2, vh / 2);
      return { fit: false, cx: w[0], cy: w[1], scale: cam.scale };
    }
    /* Measured at the moment the camera changes, never at save time: when the page is left the route container is already collapsed (a 344px-wide viewport),
       and a centre measured then drifted the stored camera by hundreds of pixels on every visit. */
    function currentView() {
      if (!cameraReady || !data || !ui.viewport) return savedView;
      return liveView || savedView;
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
      const v = savedView, pv = playerMode && playerLoad && playerLoad.snap && playerLoad.snap.view;
      if (pv) {                                              // the player page opens on the GM's camera: the same world centre and the same width of world on THIS screen
        const scale = Math.min(MAX_ZOOM, Math.max(Math.min(minScale(), Geo.ZOOM_STEPS[0]), vw / pv.width));
        setCamera({ scale: scale, tx: vw / 2 - pv.cx * scale, ty: vh / 2 - pv.cy * scale });
      } else if (v && !v.fit) {
        const scale = Math.min(MAX_ZOOM, Math.max(Math.min(minScale(), Geo.ZOOM_STEPS[0]), v.scale));
        setCamera({ scale: scale, tx: vw / 2 - v.cx * scale, ty: vh / 2 - v.cy * scale });
      } else fitToView();
      cameraReady = true;
      liveView = measureView();
      listen(window, 'pagehide', flushCameraSave);
      listen(document, 'visibilitychange', () => { if (document.hidden) flushCameraSave(); });
      return true;
    }

    /** On a phone the player page has a bottom bar, a Fit button and (when open) the legend panel over the lower map: the camera limit stops above the highest of them, so the very bottom of the map can be dragged into view. */
    function bottomInset() {
      if (!playerMode || !ui.rail || !ui.viewport || getComputedStyle(ui.rail).flexDirection !== 'row') return 0;
      const bottom = ui.viewport.getBoundingClientRect().bottom;
      let top = Infinity;
      for (const node of [ui.rail, sideCollapsed ? null : ui.side, ui.mapbar]) {
        if (!node || node.hidden) continue;
        const r = node.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) top = Math.min(top, r.top);
      }
      return top === Infinity ? 0 : Math.max(0, Math.round(bottom - top));
    }

    function setCamera(next, keepFit) {
      const [vw, vh] = viewSize();
      cam = Geo.clampCamera(next, vw, vh, data.template.worldSizePx[0], data.template.worldSizePx[1], 24, { left: sideInset(), right: panelInset(), bottom: bottomInset() });
      if (!keepFit) fitMode = false;
      if (cameraReady) liveView = measureView() || liveView;
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

    /* On touch screens the world is promoted to its own layer (will-change: transform) only WHILE the camera moves, so a drag is composited and smooth; at rest the
       promotion is dropped, which makes the browser re-raster the map crisply at the final zoom and never keep a stale or oversized layer (black blocks on phones). */
    let camIdleTimer = 0;
    cleanups.push(() => clearTimeout(camIdleTimer));
    /* Dropping the promotion invalidates every tile (the map is re-rastered at the new zoom), so it must never happen while a finger is still down — a held-still finger
       that then drags would re-promote over tiles that are still being drawn (the black flash) — and a zoom followed straight away by a drag lands inside the grace period. */
    function dropCamPromotion() {
      if (!ui.world) return;
      if (touches.size > 0) { camIdleTimer = setTimeout(dropCamPromotion, 300); return; }
      ui.world.classList.remove('is-cam-active');
    }
    function scheduleApply() {
      if (pendingApply) return;
      pendingApply = true;
      rafId = requestAnimationFrame(() => {
        pendingApply = false;
        if (inst.disposed || !ui.world) return;
        /* A promoted layer keeps the raster scale it was promoted at: promote while zoomed in, pinch out, and the whole map is held at the old high resolution
           (hundreds of MB) — the phone's GPU gives up and the whole page, UI included, goes black until the next tap. So the layer is promoted only for a pure pan
           (the scale unchanged since the last frame); any frame that changes the scale demotes it and the browser re-rasters at the new scale. */
        const scaling = appliedScale !== 0 && appliedScale !== cam.scale;
        const moved = appliedScale !== cam.scale || appliedTx !== cam.tx || appliedTy !== cam.ty;   // a re-apply with the same camera must not promote / demote the layer
        appliedScale = cam.scale; appliedTx = cam.tx; appliedTy = cam.ty;
        if (moved) {
          ui.world.classList.toggle('is-cam-active', !scaling);
          clearTimeout(camIdleTimer);
          camIdleTimer = setTimeout(dropCamPromotion, 600);
          ui.world.style.transform = 'translate(' + cam.tx + 'px,' + cam.ty + 'px) scale(' + cam.scale + ')';
        }
        if (sbfx) { const [vw, vh] = viewSize(); sbfx.setCamera(cam, vw, vh); }   // the same frame: the cosmos box and culling never lag the map; nothing is read back
        ui.world.style.setProperty('--j2-inv', String(1 / cam.scale));
        ui.world.classList.toggle('is-pixel', cam.scale >= 2);
        positionInspector();
        paintPartyMarker();                              // its minimum on-screen size follows the zoom
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
      fogUnfoggable = '';
      data.grid.forEachValidCell((q, r) => { if (data.ctx.policy(q, r).ok) foggable.set(Geo.cellId(q, r), hexPath(q, r)); });
      // The printed title, compass and scale lettering stay clear of the veil as plain rectangles (a hex-shaped hole read as a ragged glow around them).
      const pad = data.grid.shortDimensionPx * 0.5;
      // The veil is even-odd, so overlapping rectangles (compass + scale line) are first merged into disjoint slabs.
      const rects = (data.template.decorativeAreas || []).map(d => [d.rectPx[0] - pad, d.rectPx[1] - pad, d.rectPx[0] + d.rectPx[2] + pad, d.rectPx[1] + d.rectPx[3] + pad]);
      const xs = [...new Set(rects.flatMap(r => [r[0], r[2]]))].toSorted((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i++) {
        const ivs = rects.filter(r => r[0] <= xs[i] && r[2] >= xs[i + 1]).map(r => [r[1], r[3]]).toSorted((a, b) => a[0] - b[0]);
        for (let j = 0; j < ivs.length; j++) {
          const y0 = ivs[j][0];
          let y1 = ivs[j][1];
          while (j + 1 < ivs.length && ivs[j + 1][0] <= y1) y1 = Math.max(y1, ivs[++j][1]);
          fogUnfoggable += 'M' + xs[i] + ' ' + y0 + 'H' + xs[i + 1] + 'V' + y1 + 'H' + xs[i] + 'Z';
        }
      }
      ui.defs.innerHTML =
        '<pattern id="j2-fog-gm" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="j2-fogp-wash" width="9" height="9"/><line class="j2-fogp-line" x1="0" y1="0" x2="0" y2="9"/></pattern>' +
        '<pattern id="j2-fog-player" width="4" height="4" patternUnits="userSpaceOnUse"><rect class="j2-fogp-wash is-player" width="4" height="4"/><line class="j2-fogp-line is-player" x1="0" y1="0.5" x2="4" y2="0.5"/></pattern>' +
        '<filter id="j2-fog-soft" x="-2%" y="-2%" width="104%" height="104%"><feGaussianBlur stdDeviation="6"/></filter>' +
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
        // The veil is the whole map (plus a margin, so the feathering blur never fades at the border) minus the revealed hexes and the
        // cells the fog never covers (even-odd): the slivers between the hex grid's zigzag and the map edge are fogged too, not left as light islands.
        const M = 64, W = data.template.worldSizePx[0], H = data.template.worldSizePx[1];
        let hidden = 'M' + (-M) + ' ' + (-M) + 'H' + (W + M) + 'V' + (H + M) + 'H' + (-M) + 'Z' + fogUnfoggable, edge = '';
        for (const [key, d] of foggable) { if (revealed.has(key)) { edge += d; hidden += d; } }
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
      const on = previewMode && (!!fogTool || showOutline), soft = on && !fogTool;
      const key = on ? doc.tiles : null, vis = on ? doc.playerVisibility : null;
      if (ghostDrawn.tiles === key && ghostDrawn.vis === vis && ghostDrawn.soft === soft) return;
      let d = '';
      if (on) { const revealed = Model.getRevealedCellSet(doc); for (const tile of doc.tiles) if (!revealed.has(tile.cell)) d += foggable.get(tile.cell) || ''; }
      ui.fogGhost.setAttribute('d', d);
      ui.fogGhost.classList.toggle('is-soft', soft);
      ghostDrawn = { tiles: key, vis: vis, soft: soft };
    }

    /** Toolbar toggle states, the tool chip and the cursor class — all derived from the transient state. */
    function updateFogUi() {
      if (!ui.fogTool || !doc) return;
      ui.biomeColors.setAttribute('aria-checked', String(showBiome));
      ui.biomeColors.title = showBiome ? t('journey2_biome_hide') : t('journey2_biome_show');
      ui.sepia.setAttribute('aria-checked', String(showSepia));
      ui.sepia.title = showSepia ? t('journey2_sepia_hide') : t('journey2_sepia_show');
      ui.regions.setAttribute('aria-checked', String(showRegions));
      ui.staticFx.setAttribute('aria-checked', String(staticFx));
      ui.staticFx.title = staticFx ? t('journey2_static_hide') : t('journey2_static_show');
      ui.regions.title = showRegions ? t('journey2_regions_hide') : t('journey2_regions_show');
      ui.partyMark.setAttribute('aria-checked', String(showPartyMark));
      ui.partyMark.title = showPartyMark ? t('journey2_party_mark_hide') : t('journey2_party_mark_show');
      ui.fogTool.setAttribute('aria-pressed', String(!!fogTool));
      ui.outlineBtn.setAttribute('aria-checked', String(showOutline));
      ui.outlineBtn.title = t(showOutline ? 'journey2_outline_hide' : 'journey2_outline_title');
      ui.fogTool.disabled = editLocked;
      ui.viewport.classList.toggle('is-fog-tool', !!fogTool);
      ui.root.setAttribute('data-fog-tool', fogTool || '');
      ui.fogChip.hidden = !fogTool;
      if (fogTool) {
        ui.fogChipIco.innerHTML = LI.eye;
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
    function toggleOutline() {
      showOutline = !showOutline;
      saveUiPrefs();
      updateFogUi();
      renderFogGhost();
    }

    function toggleSepia() {
      showSepia = !showSepia;
      ui.root.toggleAttribute('data-sepia', showSepia);
      saveUiPrefs();
      updateFogUi();
    }

    /** "Static effects" (PD-076): Soul Echo, destroyed sanctuaries and Shadowblight drawn as one still frame. A device preference, not map data: no command, no history, no document change. */
    function toggleStaticFx() {
      motionPref = staticFx ? 'animated' : 'static';
      if (MP) MP.save(motionStorage, motionPref);              // a failed write keeps the choice for this page load only
      applyMotion();
      updateFogUi();
    }

    /** Resolves the preference (an explicit choice, else the system setting) and pushes it to the three effects: the Echo CSS (`data-motion`), the ruin canvases and the living shadow. */
    function applyMotion() {
      staticFx = MP ? MP.isStatic(motionPref, prefersReducedMotion()) : prefersReducedMotion();
      if (ui.root) ui.root.setAttribute('data-motion', staticFx ? 'static' : 'animated');
      if (root.Journey2RuinFx && root.Journey2RuinFx.setStill) root.Journey2RuinFx.setStill(staticFx);
      if (sbfx) sbfx.setReducedMotion(staticFx);
    }

    /** "Regions": one icon per region instead of one per hex. A display preference like Biome colors — no command, no history, no change to the document or fog. */
    function toggleRegions() {
      showRegions = !showRegions;
      saveUiPrefs();
      updateFogUi();
      renderTiles();
    }

    /** "Party marker" (player page only, PD-069): hides or shows the drawn star. The seven lit cells stay — they are already in the snapshot. No storage, no link flag. */
    function togglePartyMark() {
      showPartyMark = !showPartyMark;
      updateFogUi();
      paintPartyMarker();
    }

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
      applyStrings();                                          // titles pick the player copy (or the GM copy again) with the mode
      // one screen, two modes (PD-040, PD-057): the panel stays where it is and the segment at its top switches the mode; the GM's New region + stock give way to the preview note.
      // Route and the party marker stay in BOTH modes (PD-052: players plan routes over what they know); the Campaign menu and Locate are the GM's, the brush and the preview's Outline / Print / Link are the preview's.
      ui.gen.hidden = on; ui.sideScroll.hidden = on; ui.previewBar.hidden = !on || playerMode; ui.railStock.hidden = on;
      for (const row of container.querySelectorAll('[data-j2-gm-row]')) row.hidden = on;
      ui.railPv.hidden = !on || playerMode;
      ui.outlineBtn.hidden = !on || playerMode;                // the placed-hex outline is a GM aid: a Display item of Player Preview only
      ui.fogTool.hidden = !on || playerMode;
      ui.echoLocate.hidden = on;
      ui.previewBack.setAttribute('aria-pressed', String(!on));
      ui.previewBtn.setAttribute('aria-pressed', String(on));
      ui.modeToggle.setAttribute('aria-pressed', String(on));
      if (ui.shareOut && !on) ui.shareOut.hidden = true;       // the last link's note belongs to the preview that made it
      if (playerMode) {                                        // the player page is read-only: no history, no party toggle, no panel, no way back to a GM view
        ui.root.setAttribute('data-player', '');
        ui.partyBtn.hidden = true; ui.railMode.hidden = true; ui.sideToggle.hidden = true; ui.legendBtn.hidden = false;
        for (const el of ui.mapbar.querySelectorAll('[data-j2-history-group]')) el.hidden = true;
      }
      syncSideToggle();
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
      if (playerMode) return;                                  // the player page simply opens on the map: nothing to announce or focus
      announce(t('journey2_live_preview_on'));
      focusTool(ui.previewBack);
    }

    /**
     * "Copy player link" (PD-052): the player link of what Player Preview shows right now — a snapshot, so a later change needs a new link. Built from the same player
     * projection the preview draws (the party's light included, even mid-drag). The address is this page's own, plus `#/map/<link>`. The clipboard is tried first; when it is
     * unavailable the link is shown selected in a read-only field to copy by hand, and a success message appears only after a real copy. The length is always shown, with a
     * warning above 2000 characters (the limit of a chat message in some apps).
     */
    const SHARE_WARN_CHARS = 2000;
    async function copyPlayerLink() {
      if (inst.disposed || !previewMode || playerMode || !data || !doc || !Share) return;
      let url;
      try {
        // the GM's camera rides along (world centre + how much world is on screen), so the player opens on the same spot at the same zoom; a fitted map stays "fit"
        const cv = currentView(), vw = viewSize()[0];
        const view = cv && !cv.fit && vw && cv.scale > 0 ? { cx: cv.cx, cy: cv.cy, width: vw / cv.scale } : null;
        const text = await Share.createLinkText(projectionDoc(), data.ctx, { lang: lang, view: view, regionIcons: showRegions, sepiaMap: showSepia, biomeColors: showBiome });
        if (inst.disposed) return;
        url = location.href.split('#')[0] + '#/map/' + text;
      } catch (err) {
        try { console.error('Journey: the player link could not be created', err); } catch (e) { /* no console */ }
        announce(t('journey2_share_failed')); ensureSideOpen(); if (ui.shareNote) { ui.shareOut.hidden = false; ui.shareNote.textContent = t('journey2_share_failed'); ui.shareUrl.hidden = true; }
        return;
      }
      let copied = false;
      try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(url); copied = true; } } catch (err) { copied = false; }
      if (inst.disposed || !ui.shareOut) return;
      const n0 = url.length, long = n0 > SHARE_WARN_CHARS;
      if (!copied || long) ensureSideOpen();
      ui.shareOut.hidden = false;
      ui.shareUrl.hidden = copied && !long; ui.shareUrl.value = url;
      ui.shareNote.textContent = fill(copied ? 'journey2_share_copied' : 'journey2_share_manual', { n: n(n0) }) + (long ? ' ' + fill('journey2_share_long', { n: n(SHARE_WARN_CHARS) }) : '');
      ui.shareNote.classList.toggle('is-warn', long);
      if (!copied) { ui.shareUrl.focus({ preventScroll: true }); ui.shareUrl.select(); }
      if (copied) { toast(t('journey2_share_toast')); announce(fill('journey2_share_copied', { n: n(n0) })); }
    }

    /** A reload reopens Player Preview if it was open (PD-035); waits for the restored camera so it opens on the same view. */
    function maybeResumePreview() {
      if (!resumePreview || !cameraReady) return;
      resumePreview = false;
      enterPreview();
    }

    /** Back to the GM view: the camera (including any pan or zoom made in the preview), sidebar state and fog preference carry over; nothing is reopened or re-selected. */
    function leavePreview(o) {
      if (!previewMode || playerMode) return;                  // the player page has no GM view to go back to
      exitRoute({ quiet: true });                              // the planner knows different things in the two views (PD-052)
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
       Player map Print Preview (PD-028, PD-073). Eight butt-joined A4 portrait sheets built from `Journey2Print.buildPrintModel` — a data filter over the
       revealed cells with NO fog layer, tint or GM data — drawn as the original map half (a 1:1 crop of the world raster through the
       SVG viewBox) plus a vector overlay. The pages shown on screen ARE the printed DOM: the same `.j2-print-root` is what
       `@media print` leaves visible, so there is one renderer. Read-only and transient: no document change, history entry or autosave.
       ============================================================ */

    function printPageMarkup(page, index, count) {
      const [vx, vy, vw, vh] = page.viewBox, baseHref = esc(fullRasterHref(data.template));
      const W = data.template.worldSizePx[0], H = data.template.worldSizePx[1];
      const polylines = Geo.chainEdgeSegments(data.grid, page.segments);
      const d = Geo.polylinesPath(polylines);
      let labels = '';
      for (const l of page.labels) {
        labels += '<text class="j2-sanc-label" data-anchor="' + esc(l.anchorId) + '" font-size="' + l.fontSize + '">' +
          l.lines.map((line, i) => '<tspan x="' + fmt(l.cx, 1) + '" y="' + fmt(l.y + l.lineHeight * (i + 0.8), 1) + '">' + esc(line) + '</tspan>').join('') + '</text>';
      }
      const mm = page.scaleMmPerPx, A4 = Print.A4_MM, [px, py, pw, ph] = page.placeMm;
      const sheetLabel = fill('journey2_pp_page_n', { n: n(index + 1), total: n(count) });
      const pct = (v, of) => fmt(v / of * 100, 4) + '%';
      return '<section class="j2-print-page" data-page="' + page.id + '" role="group" aria-label="' + esc(sheetLabel) + '">' +
        '<svg class="j2-pp-svg" xmlns="' + SVG_NS + '" style="left:' + pct(px, A4.widthMm) + ';top:' + pct(py, A4.heightMm) + ';width:' + pct(pw, A4.widthMm) + '" width="' + fmt(vw * mm, 2) + 'mm" height="' + fmt(vh * mm, 2) + 'mm" viewBox="' + vx + ' ' + vy + ' ' + vw + ' ' + vh + '" aria-hidden="true" focusable="false">' +
        '<g transform="translate(' + page.translate[0] + ' ' + page.translate[1] + ')">' +
        '<image class="j2-pp-base" href="' + baseHref + '" x="0" y="0" width="' + W + '" height="' + H + '" preserveAspectRatio="none"/>' +
        '<g class="j2-pp-gen" data-pp-overlays="' + page.overlays.length + '">' + overlayMarkup(page.overlays.map(o => ({ q: o.q, r: o.r, spec: { symbolId: o.symbolId, dots: o.dots, blightMark: o.blightMark }, region: o.region, tint: null })).concat(page.marks.map(m => ({ q: m.q, r: m.r, floating: true })))) + '</g>' +
        '<g class="j2-pp-perimeter" data-pp-segments="' + page.segments.length + '">' + (d ? '<path class="j2-perimeter" d="' + d + '"/>' : '') + '</g>' +
        '<g class="j2-pp-ruins" data-pp-ruins="' + page.ruins.length + '">' + page.ruins.map(r => ruinMarkup(r, true)).join('') + '</g>' +
        '<g class="j2-pp-echoes" data-pp-echoes="' + page.spent.length + '">' + page.spent.map(e => '<g class="j2-echo is-collected is-print" data-echo="' + esc(e.id) + '"><g transform="translate(' + fmt(e.x, 1) + ' ' + fmt(e.top - ECHO_LIFT, 1) + ') scale(' + ECHO_SCALE_PRINT + ')">' + ECHO_SPENT + '</g></g>').join('') + '</g>' +
        '<g class="j2-pp-labels" data-pp-labels="' + page.labels.length + '">' + labels + '</g>' +
        '<g class="j2-pp-party" data-pp-party="' + (page.party ? 1 : 0) + '">' + (page.party ? partyMarkup(page.party.q, page.party.r, { bw: true }) : '') + '</g>' +
        '</g></svg>' +
        '<p class="j2-pp-pagelabel">' + esc(sheetLabel + ' · ' + t('journey2_pp_cut')) + '</p></section>';
    }

    /** Everything the preview says, rebuilt from state so a language switch or a replaced document never leaves stale text or pages. */
    function printPreviewMarkup() {
      const m = pp.model;
      const status = pp.failed ? t('journey2_pp_failed') : pp.ready ? t('journey2_pp_ready') : t('journey2_pp_preparing');
      const summary = m ? fill('journey2_pp_summary', { hexes: countFor('journey2_pp_hexes', m.summary.wildernessHexes), names: countFor('journey2_pp_names', m.summary.sanctuaryNames) }) : '';
      return '<div class="j2-pp-bar">' +
        '<h2 class="j2-pp-title" tabindex="-1" data-pp-title>' + esc(t('journey2_pp_title')) + '</h2>' +
        '<p class="j2-pp-note">' + esc(t('journey2_pp_note_visible')) + ' ' + esc(t('journey2_pp_note_blank')) + ' ' + esc(t('journey2_pp_note_assemble')) + '</p>' +
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
      const raster = fullRasterHref(data.template);
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
      if (sbfx) sbfx.setPaused(true);                         // the pages cover the map: no shadow updates behind them
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
      if (sbfx) sbfx.setPaused(false);
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
      listen(vp, 'pointerleave', () => { pointer.inside = false; if (partyDraft && partyDraft.placing && partyDraft.pointerId == null && partyDraft.cell) { partyDraft.cell = null; refreshPartyView(); } if (ui.viewport) ui.viewport.classList.remove('is-party-hover'); hideEnvTip(); hoverCell = null; hoverMarker = null; if (fogHover) { fogHover = null; scheduleFogPaint(); } if (locateHover) { locateHover = null; paintLocate(); } if (routeHover) { routeHover = null; paintRoute(); } if (diagOpen) renderSelection(); updateReadouts(); if (tr && tr.kind === 'armed') updatePreview(); });
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
        const ro2 = new ResizeObserver(() => { if (!inst.disposed) positionInspector(); });   // only the panel follows its own size: never a camera re-apply (it promoted the map layer for 600 ms, a visible 1-2 px hop)
        ro2.observe(ui.inspector);
        cleanups.push(() => ro2.disconnect());
      }
      listen(ui.sidewrap, 'transitionend', () => { positionInspector(); });
      listen(ui.root, 'click', onRootClick);
      listen(ui.sancNameInput, 'keydown', onSanctuaryNameKey);
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
      // the phone's legend is a sheet over the map: a press anywhere outside it (and outside the bottom bar that toggles it) closes it
      listen(document, 'pointerdown', e => {
        if (!playerMode || sideCollapsed || !isPhoneWidth() || !ui.side || !ui.rail) return;
        if (ui.side.contains(e.target) || ui.rail.contains(e.target)) return;
        sideCollapsed = true; applySideState(false);
      }, true);
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
      if (touchDown(e)) return;                                  // a second finger starts a pinch (a third is ignored)
      if (pan || fogStroke || tr && tr.kind !== 'armed' || partyDraft && partyDraft.pointerId != null) return;
      const fogPaint = fogTool && previewMode && !spaceDown && !editLocked && !(tr && tr.kind === 'armed');
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;   // the right button pans, except as the Hide brush while fog painting
      clearHint();
      ui.viewport.focus({ preventScroll: true });
      const [x, y] = localPoint(e);
      pointer.x = x; pointer.y = y; pointer.inside = true; pointer.cx = e.clientX; pointer.cy = e.clientY;
      // while the Route Planner is open its A / B pins outrank even the party marker (PD-031): a press on a pin drags that pin, and the party stays where it is
      if (e.button === 0 && !spaceDown && !partyDraft) { const pin = routePinAt(x, y, e.pointerType === 'touch'); if (pin) { startRoutePinDrag(e, pin); return; } }
      // the party marker (PD-045) outranks everything below: a press on it drags it, and while it follows the cursor a left click drops it
      if (e.button === 0 && !editLocked && !spaceDown && ((partyDraft && partyDraft.placing) || partyHitAt(x, y)) && startPartyDrag(e)) return;
      // priority: dialog > preview > an existing drag/pan > Locate location selection (a click, never a tile drag) > armed placement > fog tool > neutral selection. Space (or the middle button) pans instead of painting.
      if (fogPaint && (e.button === 0 || e.button === 2)) { startFogStroke(e); e.preventDefault(); return; }
      const tile = e.button === 0 && !spaceDown && !editLocked && !previewMode && !fogTool && !(tr && tr.kind === 'armed') && !locateSession.isActive() && !routeSelecting() && !sanctuaryAtScreen(x, y) ? tileAtScreen(x, y) : null;
      if (tile) {
        tr = { kind: 'tile', tileId: tile.id, batchId: tile.batchId, from: tile.cell, docRef: doc, pointerId: e.pointerId, moved: false, x0: e.clientX, y0: e.clientY, preview: null };
      } else {
        pan = { id: e.pointerId, x0: x, y0: y, tx0: cam.tx, ty0: cam.ty, scale0: cam.scale, moved: false, button: e.button, slop: e.pointerType === 'touch' ? TOUCH_SLOP_PX : CLICK_SLOP_PX };
      }
      try { ui.viewport.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events may lack a capturable pointer */ }
      if (e.button === 1 || e.button === 2) e.preventDefault();
    }

    function onViewportMove(e) {
      const [x, y] = localPoint(e);
      pointer.x = x; pointer.y = y; pointer.inside = insideViewport(e); pointer.cx = e.clientX; pointer.cy = e.clientY;
      if (touchMove(e)) return;
      if (routePinDrag && routePinDrag.pointerId === e.pointerId) { moveRoutePinDrag(e); return; }
      if (partyDraft) {
        if (partyDraft.pointerId === e.pointerId) { movePartyDraft(e); return; }
        if (partyDraft.pointerId == null && !pan) { hoverPartyDraft(e); return; }
      } else if (!pan) { updateRoutePinCursor(x, y); updatePartyCursor(x, y); }
      if (fogStroke && fogStroke.pointerId === e.pointerId) { moveFogStroke(e); return; }
      if (pan && pan.id === e.pointerId) {
        const dx = x - pan.x0, dy = y - pan.y0;
        if (!pan.moved && Math.hypot(dx, dy) > pan.slop) { pan.moved = true; ui.viewport.classList.add('is-panning'); }
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
      if (touchEnd(e)) return;
      if (routePinDrag && routePinDrag.pointerId === e.pointerId) { finishRoutePinDrag(e); return; }
      if (partyDraft && partyDraft.pointerId === e.pointerId) { finishPartyDrag(e); return; }
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

    /* ---- two-finger pinch zoom + pan (touch only; PD-052 — the editor itself stays mouse-only, PD-048) ---- */

    const touches = new Map();                              // pointerId -> { x, y } (viewport-local) of every finger down
    let pinch = null;                                       // { dist0, scale0, wx, wy } while two fingers are down: the zoom and the world point held between them

    function pinchGeometry() {
      const pts = Array.from(touches.values()).slice(0, 2);
      return { cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2, dist: Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)) };
    }

    function startPinch() {
      if (pan) endPan();
      cancelRoutePinDrag();
      const g = pinchGeometry();
      pinch = { dist0: g.dist, scale0: cam.scale, wx: (g.cx - cam.tx) / cam.scale, wy: (g.cy - cam.ty) / cam.scale };
      ui.viewport.classList.add('is-panning');
    }

    function movePinch() {
      const g = pinchGeometry(), [vw, vh] = viewSize();
      const scale = Math.min(MAX_ZOOM, Math.max(Math.min(minScale(), Geo.ZOOM_STEPS[0]), pinch.scale0 * g.dist / pinch.dist0));
      setCamera({ scale: scale, tx: g.cx - pinch.wx * scale, ty: g.cy - pinch.wy * scale });
    }

    /** True when the touch event belongs to the pinch (down of a second finger, a move while two are down, or the release of one of them). */
    function touchDown(e) {
      if (e.pointerType !== 'touch') return false;
      // the first finger of a gesture is always the primary pointer: nothing else can be down, so any entry still in the map is a stale one (its up/cancel never reached us) and would turn this drag into a pinch
      if (e.isPrimary) { touches.clear(); pinch = null; if (pan) endPan(); ui.viewport.classList.remove('is-panning'); }
      const [x, y] = localPoint(e);
      touches.set(e.pointerId, { x: x, y: y });
      try { ui.viewport.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events may lack a capturable pointer */ }   // every finger's up/cancel comes back here, even when it is lifted over a control
      if (touches.size === 2) { startPinch(); return true; }
      return touches.size > 2;
    }
    function touchMove(e) {
      if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return false;
      const [x, y] = localPoint(e);
      touches.set(e.pointerId, { x: x, y: y });
      if (pinch && touches.size >= 2) { movePinch(); return true; }
      return false;
    }
    function touchEnd(e) {
      if (e.pointerType !== 'touch' || e.type === 'lostpointercapture' || !touches.delete(e.pointerId)) return false;
      if (!pinch) return false;
      const wasPinch = pinch;
      if (touches.size < 2) {
        pinch = null; ui.viewport.classList.remove('is-panning'); markDragged();   // the finger left behind must not tap
        // ...but it keeps dragging: hand it over as a pan from where it is now, so a pinch flows into a drag without lifting
        const rest = touches.entries().next().value;
        if (rest && !pan) {
          pan = { id: rest[0], x0: rest[1].x, y0: rest[1].y, tx0: cam.tx, ty0: cam.ty, scale0: cam.scale, moved: true, button: 0, slop: TOUCH_SLOP_PX };
          ui.viewport.classList.add('is-panning');
        }
      }
      return !!wasPinch;
    }

    function onViewportCancel(e) {
      if (touchEnd(e)) return;
      if (routePinDrag && routePinDrag.pointerId === e.pointerId) { cancelRoutePinDrag(); return; }
      if (partyDraft && partyDraft.pointerId === e.pointerId) { cancelPartyDraft(true); return; }
      if (fogStroke && fogStroke.pointerId === e.pointerId) { cancelFogStroke(true); return; }
      if (pan && pan.id === e.pointerId) endPan();
      else if (tr && tr.kind === 'tile' && tr.pointerId === e.pointerId) cancelTransient();
    }

    function endPan() {
      if (!pan) return;
      const id = pan.id;
      pan = null;
      ui.viewport.classList.remove('is-panning');
      try { if (!touches.has(id) && ui.viewport.hasPointerCapture(id)) ui.viewport.releasePointerCapture(id); } catch (err) { /* already released */ }
    }

    function handleMapClick(sx, sy) {
      if (fogTool || (previewMode && !routeSelecting())) return;   // read-only preview / an active fog tool never selects or inspects (only the Route Planner picks hexes there, PD-052)
      if (routeSelecting()) {                                // the Route Planner owns the map while choosing A or B: a sanctuary icon, Environment marker or tile selects its hex
        if (!spaceDown) { const id = routeCellAt(sx, sy); if (id && routePlanner.pick(id) && routePlanner.state.status === 'result') { const v = routeView(); if (v) announce(v.route.status === 'ok' ? fillN('journey2_route_live_result', { strategy: t(ROUTE_LABEL[v.eff]), hexes: n(v.route.stats.hexes) }, [v.route.stats.hexes]) : fill('journey2_route_live_none', { strategy: t(ROUTE_LABEL[v.eff]) })); } }
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
        case 's': case 'S': case 'ы': case 'Ы': if (fogTool || locateSession.isActive() || routeSelecting()) handled = false; else cycleSanctuary(e.shiftKey ? -1 : 1); break;
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
      // the dragged hex stays identifiable on a refused cell too: its glyph is drawn dimmed there, so the GM always sees which tile is in hand
      if (batch) for (const c of p.cells) if (p.valid ? c.ok : true) h += '<g class="j2-pv-glyph' + (p.valid ? '' : ' is-refused') + '">' + tileMarkup(c.q, c.r, specOfBatch(batch), 'j2-pvt', true) + '</g>';
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
    function cancelTransient() { cancelFogStroke(); cancelPartyDraft(); if (tr) endTransient(); }

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
      announce(fillN(allowDetached ? 'journey2_live_separate_started' : 'journey2_live_placed', { n: n(tiles.length) }, [tiles.length]));
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
        if (routePinDrag) { cancelRoutePinDrag(); e.preventDefault(); return; }                      // an A / B pin being dragged: back to where it was
        if (partyDraft) { cancelPartyDraft(true); e.preventDefault(); return; }                      // the party marker being placed / dragged (PD-045)
        if (pan) { setCamera({ scale: pan.scale0, tx: pan.tx0, ty: pan.ty0 }); endPan(); e.preventDefault(); return; }
        if (tr) { cancelTransient(); e.preventDefault(); return; }
        if (routeSelecting()) { routeEscape(); e.preventDefault(); return; }                         // choosing A or B: step back / leave the Route Planner (no document change)
        if (locateSession.isActive()) { exitLocate({ focus: true }); e.preventDefault(); return; }   // a result or the selection: leave Locate (no document change)
        if (fogTool) { setFogTool(null); e.preventDefault(); return; }
        if (previewMode && routePlanner.isActive()) { routeEscape(); e.preventDefault(); return; }    // a route shown in the preview closes before the preview does (PD-052)
        if (playerMode && !sideCollapsed) { toggleSide(); e.preventDefault(); return; }                // the player page's legend closes before anything else is left
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
      if (!(e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat) && onToolHotkey(e)) return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      // a blocking modal (environment card, confirm dialog) owns the keyboard: no history change behind it (audit 04 Z-01)
      if (document.querySelector('dialog[open]') || document.querySelector('.modal-overlay')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { undo(); e.preventDefault(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { redo(); e.preventDefault(); }
    }

    /**
     * Single-key tool shortcuts (PD-057), matched by the PHYSICAL key (event.code) so they work on a Russian layout too: P party, R route, E Locate (the fog brush in Player Preview),
     * V Player Preview on / off, [ the panel. Each one just clicks the rail button, so a hidden, disabled or locked tool does nothing and every guard stays in one place.
     */
    function onToolHotkey(e) {
      if (!ui.root || !doc || !data || printOpen) return false;
      if (document.querySelector('dialog[open]') || document.querySelector('.modal-overlay')) return false;
      let b = null;
      if (e.code === 'KeyP') b = ui.partyBtn;
      else if (e.code === 'KeyR') b = ui.routePlan;
      else if (e.code === 'KeyE') b = previewMode ? ui.fogTool : ui.echoLocate;
      else if (e.code === 'KeyV') b = playerMode ? null : ui.modeToggle;
      else if (e.code === 'BracketLeft') b = playerMode ? null : ui.sideToggle;
      else if (e.code === 'KeyI') b = playerMode ? ui.legendBtn : null;
      if (!b || b.hidden || b.disabled || b.closest('[hidden]')) return false;
      b.click();
      e.preventDefault();
      return true;
    }

    /** Space pans (rather than activating something) only when focus is on the map, the page body or one of the fog toolbar buttons. */
    function fogSpaceTarget(t0) { return t0 === document.body || t0 === ui.viewport || !!(t0 && t0.closest && t0.closest('[data-j2-preview-bar], [data-j2-rail]')); }

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
      const sum = e.target.closest && e.target.closest('.j2-insp-summary > summary');
      if (sum && ui.inspector && ui.inspector.contains(sum)) {
        const det = sum.parentNode;
        if (det.classList.contains('has-more')) { e.preventDefault(); morphInspector(() => { det.open = !det.open; }); }
        return;
      }
      const b = e.target.closest('button');
      if (!b || !ui.root.contains(b)) return;
      if (b.closest('[data-j2-menu="campaign"]')) { const mb = openMenu && openMenu.btn; closeMenus(); if (mb) mb.focus({ preventScroll: true }); }   // a Campaign action closes the menu and hands focus back to its button (a dialog it opens then takes it); the Display switches (their own menu) keep it open
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
      else if (b.hasAttribute('data-j2-clear-unplaced')) confirmClearUnplaced();
      else if (b.hasAttribute('data-j2-delete')) confirmDelete(b.closest('[data-batch]').getAttribute('data-batch'));
      else if (b.hasAttribute('data-j2-side-toggle') || b.hasAttribute('data-j2-legend-btn')) toggleSide();
      else if (b.hasAttribute('data-j2-fit')) fitToView();
      else if (b.hasAttribute('data-j2-biome-colors')) toggleBiomeColors();
      else if (b.hasAttribute('data-j2-sepia')) toggleSepia();
      else if (b.hasAttribute('data-j2-regions')) toggleRegions();
      else if (b.hasAttribute('data-j2-static-fx')) toggleStaticFx();
      else if (b.hasAttribute('data-j2-party-mark')) togglePartyMark();
      else if (b.hasAttribute('data-j2-outline')) toggleOutline();
      else if (b.hasAttribute('data-j2-fog-tool')) setFogTool(b.getAttribute('data-j2-fog-tool'));
      else if (b.hasAttribute('data-j2-party-cancel')) cancelPartyDraft(true);
      else if (b.hasAttribute('data-j2-party')) toggleParty();
      else if (b.hasAttribute('data-j2-echo-place')) placeSoulEchoes();
      else if (b.hasAttribute('data-j2-echo-clear')) confirmClearSoulEchoes();
      else if (b.hasAttribute('data-j2-ruin-place')) placeDestroyedSanctuaries();
      else if (b.hasAttribute('data-j2-ruin-clear')) confirmClearDestroyedSanctuaries();
      else if (b.hasAttribute('data-j2-shadow-reset')) confirmResetShadow();
      else if (b.hasAttribute('data-j2-clear-map')) confirmClearMap();
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
      else if (b.hasAttribute('data-j2-sanc-rename-save')) endSanctuaryRename(true);
      else if (b.hasAttribute('data-j2-sanc-rename-cancel')) endSanctuaryRename(false);
      else if (b.hasAttribute('data-j2-sanc-rename')) startSanctuaryRename();
      else if (b.hasAttribute('data-j2-sanc-reroll')) rerollSanctuary();
      else if (b.hasAttribute('data-j2-dest-reroll')) rerollDestination();
      else if (b.hasAttribute('data-j2-sancenv')) onSancEnvClick(b);
      else if (b.hasAttribute('data-j2-sanc-delete')) confirmDeleteSanctuary();
      else if (b.hasAttribute('data-j2-preview-back')) leavePreview();
      else if (b.hasAttribute('data-j2-print-open')) openPrintPreview();
      else if (b.hasAttribute('data-j2-share-link')) copyPlayerLink();
      else if (b.hasAttribute('data-j2-preview')) enterPreview();
      else if (b.hasAttribute('data-j2-mode-toggle')) { if (previewMode) leavePreview(); else enterPreview(); }
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
      if (playerMode && !sideCollapsed) { sideCollapsed = true; applySideState(false); }   // the legend and a rail menu never stack (the menu opens over the panel)
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
      else if (act === 'reload') location.reload();
      else if (act === 'import') { if (conflictBlocks()) return; cancelTransient(); importInput.value = ''; importInput.click(); }
      else if (act === 'diagnostics') setDiagnostics(!diagOpen);
      else if (act === 'start-empty') startEmptyMap();
    }

    function onMenuKey(e) {
      if (!openMenu || !openMenu.menu.contains(document.activeElement)) return;
      const items = Array.from(openMenu.menu.querySelectorAll('.j2-menu-item'));
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { items[(i + 1) % items.length].focus(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { items[(i - 1 + items.length) % items.length].focus(); e.preventDefault(); }
      else if (e.key === 'Home') { items[0].focus(); e.preventDefault(); }
      else if (e.key === 'End') { items[items.length - 1].focus(); e.preventDefault(); }
      else if (e.key === 'Tab') { const b = openMenu.btn; closeMenus(); b.focus({ preventScroll: true }); }   // leaving the menu closes it; Tab then continues from its button
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
      if (inst.disposed || conflictBlocks()) return;
      const hasData = !Model.isEmptyDocument(doc);
      if (hasData) {
        // Nothing is written until the user confirms: a cancelled or failed import changes nothing at all.
        const lines = [fillN('journey2_import_replace_msg', { batches: n(doc.batches.length), tiles: n(doc.tiles.length) }, [doc.batches.length, doc.tiles.length])];
        if (saveState.status !== 'unavailable') lines.push(t('journey2_import_recovery_kept'));
        const choice = await openDialog({
          title: t('journey2_import_title'), lines: lines,
          actions: [
            { label: t('journey2_import_download_first'), kind: 'btn-ghost', keepOpen: true, run: () => download(Model.serializeBackup(doc), backupFileName()) },
            { label: t('journey2_cancel'), kind: 'btn-ghost', value: 'cancel', autofocus: true },
            { label: t('journey2_import_replace'), kind: 'btn-danger', value: 'replace' },
          ],
        });
        if (choice !== 'replace' || inst.disposed) return;     // cancelled: nothing changed — the selection, the inspector and the camera stay as they were
        if (conflictBlocks()) return;                          // another tab saved while the dialog was open: replace nothing
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
      if (conflictBlocks()) return;
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
      if (conflictBlocks()) return;
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
          <button type="button" class="btn btn-ghost btn-sm j2-btn-icon" data-j2-panel-close data-t-aria="journey2_close" data-t-title="journey2_close">${LI.close}</button></header>
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
        activeBatchId: activeBatchId, inspector: { batchId: inspector.batchId, tileId: inspector.tileId, source: inspector.source, open: inspectorOpen() }, sanctuaryOpen: sanctuaryOpen, locate: locateDebug(), seekers: seekersDebug(), route: routeDebug(), sideCollapsed: sideCollapsed, diagnosticsOpen: diagOpen, saveStatus: saveState.status, saveReason: saveState.reason, editLocked: editLocked, conflict: conflict,
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
        shadowFx: sbfx ? Object.assign(sbfx.stats(), { cells: { blighted: sbfxCells.blighted.length, overtaken: sbfxCells.overtaken.length } }) : null,
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
