/* ============================================================
   Bacchus's Atlas — journey2-view.js
   The #/journey2 GM map editor (Journey 2, Phase 1): a fixed, measured map
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

   Layering (see docs/architecture.md "Journey 2 map editor"):
     js/journey2-geometry.js  measured lattice + camera math (pure)
     js/journey2-model.js     document, policy, commands, history (pure)
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
     document-level handlers are Escape (close a menu, else cancel a drag or
     armed placement, else close the Region Inspector) and Undo/Redo; Undo/Redo
     is ignored while a text field, select, contenteditable or dialog is active.
   ============================================================ */
(function (root, factory) {
  root.Journey2View = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const Geo = root.Journey2Geometry;
  const Model = root.Journey2Model;
  const Store = root.Journey2Store;
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
  function preparePrintProof(id) { return current ? current.preparePrintProof(id) : Promise.reject(new Error('Journey 2 view is not mounted')); }
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
    const pointer = { x: 0, y: 0, inside: false, cx: 0, cy: 0 };
    const glyphCache = new Map();
    const hexPathCache = new Map();
    let activeBatchId = null;                               // the one card expanded for placement controls (independent of the inspector)
    let sideCollapsed = false;                              // view preference, persisted apart from the document

    container.innerHTML = '';
    container.classList.add('j2-host');
    document.body.dataset.j2 = 'on';
    renderLoading();
    load();

    function makeNumberFormat() { try { return new Intl.NumberFormat(lang); } catch (e) { return new Intl.NumberFormat('en'); } }
    function n(v) { return nf.format(v); }
    function fill(key, vars) {
      let s = t(key);
      if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
      return s;
    }

    /* ---- lifecycle ---- */

    function dispose() {
      if (inst.disposed) return;
      inst.disposed = true;
      abort.abort();
      cancelAnimationFrame(rafId);
      clearTimeout(hintTimer); clearTimeout(liveTimer);
      tr = null; pan = null; inspector = Model.NO_INSPECTION;
      document.body.classList.remove('j2-dragging');
      for (const d of Array.from(dialogs)) { try { d.close(); d.remove(); } catch (e) { /* gone */ } }
      dialogs.clear();
      cleanupPrintProof();
      for (const fn of cleanups.splice(0)) { try { fn(); } catch (e) { /* teardown is best-effort */ } }
      for (const u of urls.splice(0)) URL.revokeObjectURL(u);
      if (baseImg) { baseImg.onload = baseImg.onerror = null; baseImg.src = ''; baseImg = null; }
      container.classList.remove('j2-host');
      container.innerHTML = '';
      delete document.body.dataset.j2;
      userPlacements = [];
      data = null; ui = {}; doc = null; history = null; store = null; cardRefs.clear(); glyphCache.clear(); hexPathCache.clear();
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
        updateStatus(); updateReadouts(); renderControlList(); renderAll(true);
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
      info: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 9.2v4.3M10 6.3v.1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
      close: '<svg viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="m3.5 3.5 7 7m0-7-7 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    };

    function buildSurface() {
      const tpl = data.template, [W, H] = tpl.worldSizePx;
      ui = {};
      container.innerHTML = `
        <section class="j2" aria-label="Journey 2">
          <div class="j2-toolbar" role="toolbar" data-t-aria="journey2_toolbar_label">
            <div class="j2-tb-group j2-tb-title">
              <h2 class="j2-title" data-t="journey2_map_name"></h2>
              <span class="j2-save" data-j2-save role="status" aria-live="polite"><span class="j2-save-ico" aria-hidden="true"></span><span class="j2-save-text"></span></span>
            </div>
            <div class="j2-tb-group" role="group" data-t-aria="journey2_history_label">
              <button type="button" class="btn btn-ghost btn-sm j2-btn-icon" data-j2-undo data-t-aria="journey2_undo" data-t-title="journey2_undo">${ICON.undo}</button>
              <button type="button" class="btn btn-ghost btn-sm j2-btn-icon" data-j2-redo data-t-aria="journey2_redo" data-t-title="journey2_redo">${ICON.redo}</button>
            </div>
            <div class="j2-tb-group" role="group" data-t-aria="journey2_zoom_label">
              <button type="button" class="btn btn-ghost btn-sm j2-btn-icon" data-j2-zoom="out" data-t-aria="journey2_zoom_out" data-t-title="journey2_zoom_out">−</button>
              <button type="button" class="btn btn-ghost btn-sm j2-zoom-readout" data-j2-zoom="reset" data-j2-zoom-readout data-t-title="journey2_zoom_reset_title">100%</button>
              <button type="button" class="btn btn-ghost btn-sm j2-btn-icon" data-j2-zoom="in" data-t-aria="journey2_zoom_in" data-t-title="journey2_zoom_in">+</button>
              <button type="button" class="btn btn-ghost btn-sm" data-j2-fit data-t="journey2_fit"></button>
            </div>
            <div class="j2-tb-group j2-tb-end">
              <div class="j2-menu-wrap">
                <button type="button" class="btn btn-ghost btn-sm j2-menu-btn" data-j2-menu-btn="backup" aria-haspopup="menu" aria-expanded="false"><span data-t="journey2_backup"></span>${ICON.caret}</button>
                <div class="j2-menu" role="menu" data-j2-menu="backup" hidden>
                  <button type="button" class="j2-menu-item" role="menuitem" data-j2-act="export" data-t="journey2_backup_export"></button>
                  <button type="button" class="j2-menu-item" role="menuitem" data-j2-act="import" data-t="journey2_backup_import"></button>
                </div>
              </div>
              <div class="j2-menu-wrap">
                <button type="button" class="btn btn-ghost btn-sm j2-btn-icon" data-j2-menu-btn="more" aria-haspopup="menu" aria-expanded="false" data-t-aria="journey2_more" data-t-title="journey2_more">${ICON.more}</button>
                <div class="j2-menu j2-menu--end" role="menu" data-j2-menu="more" hidden>
                  <button type="button" class="j2-menu-item" role="menuitemcheckbox" aria-checked="false" data-j2-act="diagnostics" data-t="journey2_diagnostics"></button>
                </div>
              </div>
            </div>
          </div>
          <div class="j2-stage" data-j2-stage>
            <div class="j2-mapwrap">
              <div class="j2-viewport" tabindex="0" role="application" data-t-aria="journey2_map_label" aria-describedby="j2-keys">
                <div class="j2-world" style="width:${W}px;height:${H}px">
                  <img class="j2-base" alt="" draggable="false" width="${W}" height="${H}">
                  <svg class="j2-overlay" xmlns="${SVG_NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">
                    <g data-j2-g="tiles"></g><g data-j2-g="grid"></g><g data-j2-g="protection"></g><g data-j2-g="markers"></g><g data-j2-g="control"></g>
                    <g data-j2-g="proof"></g><g data-j2-g="select"></g><g data-j2-g="preview"></g>
                  </svg>
                </div>
                <p class="sr-only" id="j2-keys" data-t="journey2_keys_hint"></p>
                <div class="j2-badge" data-j2-proof-badge hidden data-t="journey2_proof_badge"></div>
              </div>
              <div class="j2-hint-chip" data-j2-hint role="status" aria-live="polite" hidden></div>
              <aside class="j2-panel" id="j2-panel" data-t-aria="journey2_panel_label" hidden></aside>
              <aside class="j2-region-inspector" id="j2-region-inspector" role="dialog" aria-modal="false" aria-labelledby="j2-region-inspector-title" data-j2-inspector hidden>
                <span class="j2-insp-caret" aria-hidden="true"></span>
                <header class="j2-insp-head">
                  <span class="j2-insp-sym"><img alt="" width="28" height="28" data-j2-i="img"></span>
                  <div class="j2-insp-titles">
                    <h3 class="j2-insp-title" id="j2-region-inspector-title" data-j2-i="name"></h3>
                    <p class="j2-insp-sub"><span data-j2-i="ord"></span><span class="j2-blight" data-j2-i="blight" hidden></span></p>
                  </div>
                  <button type="button" class="btn btn-ghost btn-sm j2-btn-icon" data-j2-insp-close data-t-aria="journey2_inspector_close" data-t-title="journey2_inspector_close">${ICON.close}</button>
                </header>
                <div class="j2-insp-scroll">
                  <p class="j2-insp-examples" data-j2-i="examples" hidden></p>
                  <div class="j2-insp-summary">
                    <p class="j2-insp-line"><span class="j2-dots" data-j2-i="dots" role="img"></span><strong data-j2-i="terrainName"></strong><span data-j2-i="terrainN"></span></p>
                    <p class="j2-insp-line" data-j2-i="daysSize"></p>
                    <p class="j2-insp-line" data-j2-i="counts"></p>
                    <p class="j2-insp-line j2-insp-empty" data-j2-i="noTiles" hidden></p>
                    <p class="j2-insp-terrain-text" data-j2-i="terrainText" hidden></p>
                  </div>
                  <section class="j2-insp-sec"><h4 class="j2-insp-h" data-t="journey_k_encounter"></h4><div data-j2-i="enc"></div></section>
                  <section class="j2-insp-sec"><h4 class="j2-insp-h" data-t="journey_k_rumor"></h4><p class="j2-insp-p" data-j2-i="rumor"></p></section>
                </div>
                <footer class="j2-insp-tile" data-j2-insp-tile hidden>
                  <span class="j2-insp-tile-text" data-j2-i="tileText"></span>
                  <button type="button" class="btn btn-sm j2-insp-return" data-j2-return data-t="journey2_return"></button>
                </footer>
              </aside>
            </div>
            <div class="j2-sidewrap" data-j2-sidewrap>
              <aside class="j2-side" id="j2-side" data-t-aria="journey2_side_label">
                <div class="j2-side-scroll" data-j2-side-scroll>
                  <div class="j2-banner" data-j2-banner hidden role="alert"></div>
                  <form class="j2-gen" data-j2-gen novalidate>
                    <div class="j2-gen-head">
                      <h3 class="j2-h" data-t="journey2_gen_title"></h3>
                      <button type="button" class="btn btn-ghost btn-sm j2-btn-icon" data-j2-side-toggle aria-controls="j2-side" aria-expanded="true" data-t-aria="journey2_side_collapse" data-t-title="journey2_side_collapse">${ICON.chevL}</button>
                    </div>
                    <p class="j2-gen-hint" data-t="journey2_gen_hint"></p>
                    <p class="j2-field-error" id="j2-gen-error" data-j2-gen-error role="alert" hidden></p>
                    <button type="submit" class="btn btn-primary j2-gen-go" data-j2-generate><span class="j2-ico">${ICON.dice}</span><span data-t="journey2_gen_go"></span></button>
                  </form>
                  <section class="j2-stock" aria-labelledby="j2-stock-title">
                    <h3 class="j2-h j2-h--row" id="j2-stock-title"><span data-t="journey2_stock_title"></span><span class="j2-count" data-j2-stock-count></span></h3>
                    <p class="j2-empty" data-j2-stock-empty data-t="journey2_stock_empty"></p>
                    <p class="j2-place-hint" data-j2-place-hint data-t="journey2_place_hint_shared" hidden></p>
                    <div class="j2-cards" data-j2-cards></div>
                  </section>
                </div>
              </aside>
              <div class="j2-rail" data-j2-rail>
                <button type="button" class="btn btn-ghost btn-sm j2-btn-icon" data-j2-side-toggle aria-controls="j2-side" aria-expanded="false" data-t-aria="journey2_side_expand" data-t-title="journey2_side_expand">${ICON.chevR}</button>
                <span class="j2-rail-ico" aria-hidden="true">${ICON.hexes}</span>
                <span class="j2-rail-count" data-j2-rail-count></span>
              </div>
            </div>
          </div>
          <div class="j2-tip" data-j2-tip hidden></div>
          <p class="sr-only" data-j2-live role="status" aria-live="polite"></p>
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
      ui.save = container.querySelector('[data-j2-save]');
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
      initDocument();
      sideCollapsed = !!store.loadUi().sideCollapsed;
      activeBatchId = doc.batches.length ? doc.batches[doc.batches.length - 1].id : null;
      buildStaticLayers();
      buildPanel();
      applySideState(false);
      bindSurface();
      applyStrings();
      updateStatus();
      applyLayerVisibility();
      fitToView();
      updateReadouts();
      renderAll(true);
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
      if (editLocked) { saveState = { status: 'blocked', reason: loadInfo && loadInfo.code }; renderSave(); return; }
      const r = store.save(doc);
      saveState = r.ok ? { status: 'saved', reason: null } : { status: r.reason === 'unavailable' ? 'unavailable' : 'failed', reason: r.reason };
      renderSave();
      renderBanner();
    }

    function renderSave() {
      if (!ui.save) return;
      const s = saveState.status;
      ui.save.setAttribute('data-state', s);
      ui.save.querySelector('.j2-save-text').textContent = t('journey2_save_' + s);
      ui.save.title = s === 'failed' ? t('journey2_banner_failed') : s === 'unavailable' ? t('journey2_banner_unavailable') : '';
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
      if (sel.tileId && !Model.derive(doc).byId.has(sel.tileId)) sel.tileId = null;
      syncInspector();
      renderAll(false);
    }

    function undo() {
      if (inst.disposed || editLocked) return;
      cancelTransient();
      const e = Model.historyUndo(history);
      if (!e) return;
      doc = e.before;
      afterDocChange();
      announce(t('journey2_live_undo'));
    }
    function redo() {
      if (inst.disposed || editLocked) return;
      cancelTransient();
      const e = Model.historyRedo(history);
      if (!e) return;
      doc = e.after;
      afterDocChange();
      announce(t('journey2_live_redo'));
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
      if (persistIt && store) store.saveUi({ sideCollapsed: sideCollapsed });
    }

    /** Explicit toggle only. Never touches the camera, selection or active region; focus moves to the control that replaces the one used. */
    function toggleSide() {
      sideCollapsed = !sideCollapsed;
      applySideState(true);
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
      const bodyId = 'j2-cb-' + b.id, envsId = 'j2-ce-' + b.id;
      root.innerHTML = `
        <div class="j2-card-top">
          <button type="button" class="j2-card-head" data-j2-card-toggle aria-expanded="false" aria-controls="${bodyId}" data-j2-c="toggle">
            <span class="j2-card-sym"><img alt="" data-j2-c="img"></span>
            <span class="j2-card-title">
              <span class="j2-card-name"><span data-j2-c="name"></span><span class="j2-card-ord" data-j2-c="ord"></span></span>
              <span class="j2-card-meta"><span class="j2-dots" data-j2-c="dots" role="img"></span><span data-j2-c="days"></span><span class="j2-blight" data-j2-c="blight" hidden></span></span>
            </span>
          </button>
          <button type="button" class="btn btn-ghost btn-sm j2-btn-icon j2-inspect" data-j2-inspect data-j2-c="inspect" aria-controls="j2-region-inspector" aria-haspopup="dialog">${ICON.info}<span class="sr-only" data-j2-c="inspectSr"></span></button>
        </div>
        <p class="j2-card-sum" data-j2-c="sum"></p>
        <p class="j2-warn" data-j2-c="warn" hidden><span class="j2-warn-ico" aria-hidden="true">${ICON.warn}</span><span data-j2-c="warnText"></span></p>
        <div class="j2-card-body" id="${bodyId}" data-j2-c="body" hidden>
          <div class="j2-status" data-j2-c="status"><span class="j2-num" data-j2-c="placedText"></span><span class="j2-bar" role="presentation"><span data-j2-c="bar"></span></span><span class="j2-num" data-j2-c="leftText"></span></div>
          <div class="j2-actions" data-j2-c="actions">
            <button type="button" class="j2-handle" data-j2-handle="one"><span class="j2-handle-label" data-j2-c="oneLabel"></span><span class="j2-grip">${ICON.grip}</span></button>
            <button type="button" class="j2-handle j2-handle--all" data-j2-handle="all"><span class="j2-handle-label" data-j2-c="allLabel"></span><span class="j2-grip">${ICON.grip}</span></button>
          </div>
          <p class="j2-done" data-j2-c="done" hidden><span class="j2-done-ico" aria-hidden="true">${ICON.check}</span><span data-j2-c="doneText"></span></p>
          <div class="j2-envs" data-j2-c="envs" hidden>
            <button type="button" class="j2-envs-toggle" data-j2-env-toggle data-j2-c="envToggle" aria-expanded="false" aria-controls="${envsId}"><span data-j2-c="envLabel"></span><span class="j2-envs-chev" aria-hidden="true">${ICON.caret}</span></button>
            <ul class="j2-envs-list" id="${envsId}" data-j2-c="envList" hidden></ul>
          </div>
          <div class="j2-card-foot">
            <button type="button" class="btn btn-ghost btn-sm j2-btn-icon j2-delete" data-j2-delete data-j2-c="del">${ICON.trash}</button>
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
      refs.dots.innerHTML = [1, 2, 3, 4].map(i => '<i' + (i <= b.terrain.value ? ' class="on"' : '') + '></i>').join('');
      refs.dots.setAttribute('aria-label', fill('journey2_terrain_n', { n: b.terrain.value }));
      refs.blight.hidden = !(b.habitat.blighted && !b.habitat.overtaken);
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
      refs.sum.textContent = complete ? fill('journey2_all_placed', { n: n(c.quantity) }) : fill('journey2_status_placed', { placed: n(c.placed), total: n(c.quantity) }) + ' · ' + fill('journey2_status_left', { n: n(c.remaining) });
      refs.warn.hidden = !holes;
      if (holes) refs.warnText.textContent = fill('journey2_warn_holes', { n: n(holes) });
      refs.root.classList.toggle('has-holes', !!holes);
      if (generator && generator.ready()) {
        const d = generator.describe(b);
        refs.days.textContent = d.terrain ? fill('journey2_days_per_hex', { n: d.terrain.days }) : '';
      }
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
      for (const h of [refs.handleOne, refs.handleAll]) h.disabled = editLocked;
      refs.handleOne.setAttribute('aria-label', fill('journey2_handle_one_aria', { name: name }));
      refs.handleAll.setAttribute('aria-label', fill('journey2_handle_all_aria', { name: name, n: n(c.remaining) }));
      refs.del.setAttribute('aria-label', fill('journey2_delete_aria', { name: name, n: ord }));
      refs.del.setAttribute('title', t('journey2_delete_region'));
      refs.del.disabled = editLocked;
      updateEnvironments(refs, b);
    }

    /**
     * The card's "Environments" dropdown: every catalog environment tagged with the region's biome, each a plain link to
     * that environment's overlay on #/journey2 (the overlay is route-driven, so the map underneath is never re-rendered).
     * Built once per biome + language and then left alone, so an open list and the focus inside it survive every re-render.
     * An overtaken region has no biome and therefore no list.
     */
    function updateEnvironments(refs, b) {
      const biome = b.habitat.overtaken ? null : b.habitat.biome;
      const list = biome ? environmentsFor(biome) : [];
      refs.envs.hidden = !list.length;
      if (!list.length) return;
      refs.envLabel.textContent = fill('journey2_envs_label', { n: n(list.length) });
      const sig = lang + '|' + list.map(e => e.id + ':' + e.name).join(',');
      if (refs.envList.getAttribute('data-sig') !== sig) {
        refs.envList.setAttribute('data-sig', sig);
        refs.envList.innerHTML = list.map(e => '<li><a class="j2-env-link" href="' + esc(e.href) + '" data-j2-env><span class="j2-env-tier" aria-hidden="true">' + esc(e.tier) + '</span><span class="j2-env-name">' + esc(e.name) + '</span><span class="sr-only">' + esc(t('tier_label') + ' ' + e.tier) + '</span></a></li>').join('');
      }
    }

    function toggleEnvironments(btn) {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      btn.closest('.j2-envs').querySelector('.j2-envs-list').hidden = !open;
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
      ui.stockCount.textContent = list.length ? n(list.length) : '';
      ui.railCount.textContent = list.length ? n(list.length) : '';
      ui.railCount.setAttribute('aria-label', fill('journey2_rail_count_aria', { n: n(list.length) }));
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
      openDialog({
        title: t('journey2_delete_title'),
        lines: [fill('journey2_delete_msg', { name: batchName(b), n: n(idx + 1) }), t('journey2_delete_tiles_note')].concat(tiles ? [fill('journey2_delete_tiles_n', { n: n(tiles) })] : []),
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
    }

    /** Opens/keeps the inspector on the region of a placed hex and makes that hex the selected anchor. */
    function openInspectorFromTile(tileId) {
      const next = Model.inspectTile(inspector, doc, tileId);
      if (next === inspector) return;
      announceInspector(next);
      inspector = next;
      sel.tileId = tileId;
      if (diagOpen) setDiagnostics(false);
      afterInspectorChange();
    }

    /** Opens the inspector on a region from its card; no hex is selected and the card is not expanded. */
    function openInspectorFromCard(batchId) {
      const next = Model.inspectBatch(inspector, doc, batchId);
      if (next === inspector) return;
      announceInspector(next);
      const keepSel = inspector.tileId && sel.tileId === inspector.tileId;
      inspector = next;
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
      if (was.tileId && sel.tileId === was.tileId) sel.tileId = null;
      if (ui.inspector) { ui.inspector.hidden = true; ui.inspector.style.transform = ''; }
      inspectorShown = null;
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

    /** Paints the open inspector from the committed document. */
    function renderInspector() {
      if (!ui.inspector) return;
      const b = inspectorOpen() ? Model.batchById(doc, inspector.batchId) : null;
      if (!b) { ui.inspector.hidden = true; inspectorShown = null; return; }
      const I = ui.i, idx = doc.batches.indexOf(b), c = Model.derive(doc).counts.get(b.id), sym = symbolFor(b);
      ui.inspector.hidden = false;
      if (sym && I.img.getAttribute('data-sym') !== sym.id) { I.img.src = sym.path; I.img.setAttribute('data-sym', sym.id); }
      I.name.textContent = batchName(b);
      I.ord.textContent = fill('journey2_region_n', { n: n(idx + 1) });
      const blight = b.habitat.overtaken || b.habitat.blighted;
      I.blight.hidden = !blight;
      I.blight.textContent = b.habitat.overtaken ? t('journey2_overtaken') : t('journey_shadowblighted');
      I.dots.innerHTML = [1, 2, 3, 4].map(i => '<i' + (i <= b.terrain.value ? ' class="on"' : '') + '></i>').join('');
      I.dots.setAttribute('aria-label', fill('journey2_terrain_n', { n: b.terrain.value }));
      I.terrainN.textContent = ' · ' + fill('journey2_terrain_n', { n: n(b.terrain.value) });
      I.counts.textContent = fill('journey2_placed_n', { n: n(c.placed) }) + ' · ' + fill('journey2_remaining_n', { n: n(c.remaining) });
      I.noTiles.hidden = c.placed > 0;
      I.noTiles.textContent = t('journey2_inspector_no_tiles');
      if (generator && generator.ready()) {
        const d = generator.describe(b);
        I.terrainName.textContent = d.terrain ? d.terrain.name : '';
        I.terrainText.hidden = !(d.terrain && d.terrain.text);
        I.terrainText.textContent = d.terrain ? d.terrain.text : '';
        I.daysSize.textContent = (d.terrain ? fill('journey2_days_per_hex', { n: n(d.terrain.days) }) + ' · ' : '') + fill('journey2_hexes_n', { n: n(b.quantity) });
        I.examples.hidden = !d.examples;
        I.examples.textContent = d.examples || '';
        I.enc.innerHTML = (d.combined ? '<p class="j2-note">' + esc(t('journey_encounter_combined')) + '</p>' : '') + d.encounter.map(x => '<p class="j2-insp-p j2-enc">' + esc(x.text) + '</p>').join('');
        I.rumor.textContent = d.rumor;
      } else {
        I.terrainName.textContent = ''; I.terrainText.hidden = true; I.examples.hidden = true; I.enc.innerHTML = ''; I.rumor.textContent = '';
        I.daysSize.textContent = fill('journey2_hexes_n', { n: n(b.quantity) });
      }
      // the anchored hex's placement info + the one action on it (a card-opened inspector has no anchor, so no footer)
      const tile = inspector.tileId ? Model.derive(doc).byId.get(inspector.tileId) : null;
      ui.inspTile.hidden = !tile;
      if (tile) {
        I.tileText.textContent = fill('journey2_tile_cell', { cell: tile.cell });
        ui.inspTile.querySelector('[data-j2-return]').disabled = editLocked;
      }
      if (inspectorShown !== b.id) ui.inspector.querySelector('.j2-insp-scroll').scrollTop = 0;
      inspectorShown = b.id;
    }

    /** Anchor hex in map-area px (centre + half width), or null when there is no anchor or it is off screen. */
    function inspectorAnchor(view) {
      const tile = inspector.tileId ? Model.derive(doc).byId.get(inspector.tileId) : null;
      if (!tile) return null;
      const c = Geo.parseCellId(tile.cell), ctr = data.grid.cellCenter(c.q, c.r);
      const vp = ui.viewport.getBoundingClientRect(), wrap = ui.mapwrap.getBoundingClientRect();
      const s = Geo.worldToScreen(cam, ctr[0], ctr[1]);
      const x = vp.left - wrap.left + s[0], y = vp.top - wrap.top + s[1];
      if (x < 0 || y < 0 || x > view.w || y > view.h) return null;
      const xs = data.grid.cellCorners(c.q, c.r).map(p => p[0]);
      return { x: x, y: y, r: (Math.max.apply(null, xs) - Math.min.apply(null, xs)) / 2 * cam.scale };
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

    function positionInspector() {
      if (inspector.batchId == null || !ui.inspector || ui.inspector.hidden || !data) return;
      const wrap = ui.mapwrap.getBoundingClientRect();
      const view = { w: wrap.width, h: wrap.height };
      if (!view.w || !view.h) return;
      const pos = Geo.placeInspector({
        view: view, size: { w: ui.inspector.offsetWidth, h: ui.inspector.offsetHeight }, anchor: inspectorAnchor(view),
        blocked: inspectorBlocked(wrap), narrow: window.innerWidth <= 900,
      });
      ui.inspector.style.transform = 'translate(' + pos.x + 'px,' + pos.y + 'px)';
      ui.inspector.setAttribute('data-side', pos.side);
      if (pos.caret) { ui.inspector.setAttribute('data-caret', pos.caret.edge); ui.inspector.style.setProperty('--j2-caret', pos.caret.offset + 'px'); }
      else ui.inspector.removeAttribute('data-caret');
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

    /** Glyph layout (symbol + terrain dots + optional blight mark) that never covers protected artwork; cached. */
    function layoutFor(q, r, b) {
      const sym = symbolFor(b);
      if (!sym) return null;
      const dots = b.terrain.value, blight = b.habitat.blighted && !b.habitat.overtaken;
      const key = q + ',' + r + '|' + sym.id + '|' + dots + '|' + (blight ? 1 : 0);
      let L = glyphCache.get(key);
      if (L === undefined) {
        const gw = Math.round(sym.sizePx[0] * GLYPH_SCALE * 10) / 10, gh = Math.round(sym.sizePx[1] * GLYPH_SCALE * 10) / 10;
        const boxW = gw;
        // the blight X sits at the top of the hexagon (as in the book's icon), so that strip is reserved like protected artwork
        const xc = blightMarkCenter(q, r);
        const prot = blight ? data.protections.concat([{ rectPx: [xc[0] - BLIGHT_X_HALF - 1, xc[1] - BLIGHT_X_HALF - 1, 2 * BLIGHT_X_HALF + 2, 2 * BLIGHT_X_HALF + 2] }]) : data.protections;
        const lay = Geo.layoutProofGlyph(data.grid, q, r, { w: boxW, h: gh, dots: dots }, prot, 2);
        L = { lay: lay, sym: sym, gw: gw, gh: gh, boxW: boxW, blight: blight };
        glyphCache.set(key, L);
      }
      return L;
    }

    /** Committed-tile markup: one monochrome symbol, terrain dots and (when blighted) a blight mark. `cls` selects committed/preview. */
    function tileMarkup(q, r, b, cls, bodyOnly) {
      const L = layoutFor(q, r, b);
      let h = '';
      if (!L) return h;
      if (L.lay.hidden) return h;       // no clear space: the glyph is withheld (never drawn over a marker); the tile stays, outlined
      const box = L.lay.boxPx, g = L.lay.glyphRectPx;
      if (!bodyOnly) h += '<rect class="' + cls + '-halo" x="' + fmt(box[0], 1) + '" y="' + fmt(box[1], 1) + '" width="' + fmt(box[2], 1) + '" height="' + fmt(box[3], 1) + '" rx="3"/>';
      const gx = g[0] + (L.boxW - L.gw) / 2;
      h += '<image class="' + cls + '-sym" href="' + esc(L.sym.path) + '" x="' + fmt(gx, 1) + '" y="' + fmt(g[1], 1) + '" width="' + L.gw + '" height="' + L.gh + '" preserveAspectRatio="xMidYMid meet"/>';
      for (const d of L.lay.dotsPx) h += '<circle class="' + cls + '-dot" cx="' + fmt(d[0], 1) + '" cy="' + fmt(d[1], 1) + '" r="1.7"/>';
      if (L.blight) {
        const m = blightMarkCenter(q, r), k = BLIGHT_X_HALF;
        h += '<path class="' + cls + '-blight" d="M' + fmt(m[0] - k, 1) + ' ' + fmt(m[1] - k, 1) + 'l' + fmt(2 * k, 1) + ' ' + fmt(2 * k, 1) + 'm0 ' + fmt(-2 * k, 1) + 'l' + fmt(-2 * k, 1) + ' ' + fmt(2 * k, 1) + '"/>';
      }
      return h;
    }

    function renderTiles() {
      if (!ui.g || !doc) return;
      const byBatch = new Map(doc.batches.map(b => [b.id, b]));
      let outlines = '', quiet = '', body = '';
      for (const tile of doc.tiles) {
        const b = byBatch.get(tile.batchId);
        const c = Geo.parseCellId(tile.cell);
        const L = layoutFor(c.q, c.r, b);
        if (L && L.lay.hidden) quiet += hexPath(c.q, c.r); else outlines += hexPath(c.q, c.r);
        body += tileMarkup(c.q, c.r, b, 'j2-tile');
      }
      ui.g.tiles.innerHTML = (outlines ? '<path class="j2-tile-hex" d="' + outlines + '"/>' : '') + (quiet ? '<path class="j2-tile-hex is-glyphless" d="' + quiet + '"/>' : '') + body;
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
      renderSelection();
      renderInspector();
      positionInspector();
      updateHistoryButtons();
      renderSave();
      renderBanner();
      if (ui.stockCount) updateReadouts();
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
    }

    function setCamera(next, keepFit) {
      const [vw, vh] = viewSize();
      cam = Geo.clampCamera(next, vw, vh, data.template.worldSizePx[0], data.template.worldSizePx[1], 120);
      if (!keepFit) fitMode = false;
      scheduleApply();
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
        updateReadouts();
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
      listen(vp, 'pointerleave', () => { pointer.inside = false; hoverCell = null; hoverMarker = null; if (diagOpen) renderSelection(); updateReadouts(); if (tr && tr.kind === 'armed') updatePreview(); });
      listen(vp, 'wheel', onWheel, { passive: false });
      listen(vp, 'keydown', onViewportKey);
      listen(vp, 'keyup', e => { if (e.key === ' ') { spaceDown = false; vp.classList.remove('is-space'); } });
      listen(vp, 'blur', () => { spaceDown = false; vp.classList.remove('is-space'); });
      listen(vp, 'contextmenu', e => e.preventDefault());
      listen(vp, 'click', e => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(() => { if (inst.disposed || !data) return; if (fitMode) fitToView(); else setCamera(cam, true); });
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
    /** True while the pointer is over the visible map: inside the viewport and not under the overlay sidebar. */
    function insideViewport(e) {
      const r = ui.viewport.getBoundingClientRect();
      if (!(e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)) return false;
      const s = ui.sidewrap.getBoundingClientRect();
      return !(e.clientX >= s.left && e.clientX <= s.right && e.clientY >= s.top && e.clientY <= s.bottom);
    }

    function tileAtScreen(sx, sy) {
      const w = Geo.screenToWorld(cam, sx, sy);
      const c = data.grid.worldToCell(w[0], w[1]);
      return Model.derive(doc).occupancy.get(Geo.cellId(c.q, c.r)) || null;
    }

    /* ---- viewport: pan / tile move / armed click ---- */

    function onViewportDown(e) {
      if (pan || tr && tr.kind !== 'armed') return;
      if (e.button !== 0 && e.button !== 1) return;
      clearHint();
      ui.viewport.focus({ preventScroll: true });
      const [x, y] = localPoint(e);
      pointer.x = x; pointer.y = y; pointer.inside = true; pointer.cx = e.clientX; pointer.cy = e.clientY;
      const tile = e.button === 0 && !spaceDown && !editLocked && !(tr && tr.kind === 'armed') ? tileAtScreen(x, y) : null;
      if (tile) {
        tr = { kind: 'tile', tileId: tile.id, batchId: tile.batchId, from: tile.cell, docRef: doc, pointerId: e.pointerId, moved: false, x0: e.clientX, y0: e.clientY, preview: null };
      } else {
        pan = { id: e.pointerId, x0: x, y0: y, tx0: cam.tx, ty0: cam.ty, scale0: cam.scale, moved: false, button: e.button };
      }
      try { ui.viewport.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events may lack a capturable pointer */ }
      if (e.button === 1) e.preventDefault();
    }

    function onViewportMove(e) {
      const [x, y] = localPoint(e);
      pointer.x = x; pointer.y = y; pointer.inside = insideViewport(e); pointer.cx = e.clientX; pointer.cy = e.clientY;
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
      if (!tr) updateHover();
    }

    function onViewportUp(e) {
      if (pan && pan.id === e.pointerId) {
        const wasClick = !pan.moved && pan.button === 0;
        const moved = pan.moved;
        const [x, y] = localPoint(e);
        endPan();
        if (moved) markDragged();
        if (wasClick) handleMapClick(x, y);
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
      if (tr && tr.kind === 'armed') { commitArmed(); return; }
      const tile = editLocked ? null : tileAtScreen(sx, sy);
      if (tile) { selectTile(tile.id); return; }
      // a click on empty map (a pan never gets here) closes the inspector and clears the hex it selected
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
        case 'Delete': case 'Backspace':
          if (sel.tileId) returnSelected(); else handled = false;
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
        footprint: mode === 'all' ? Model.compactFootprint(remaining) : [{ dq: 0, dr: 0 }],     // generated once, frozen for the drag
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
      const remaining = Model.derive(doc).counts.get(batchId).remaining;
      if (remaining < 1) return;
      tr = { kind: 'armed', mode: mode, batchId: batchId, docRef: doc, handle: handle, footprint: mode === 'all' ? Model.compactFootprint(remaining) : [{ dq: 0, dr: 0 }], preview: null };
      handle.classList.add('is-armed');
      handle.setAttribute('aria-pressed', 'true');
      ui.viewport.classList.add('is-placing');
      updatePreview();
    }

    /* ---- preview ---- */

    function computePreview(x) {
      if (!pointer.inside || !data) return null;
      const w = Geo.screenToWorld(cam, pointer.x, pointer.y);
      const anchor = data.grid.worldToCell(w[0], w[1]);
      const offsets = x.kind === 'tile' ? [{ dq: 0, dr: 0 }] : x.footprint;
      const cells = offsets.map(o => ({ q: anchor.q + o.dq, r: anchor.r + o.dr }));
      // the same cell policy AND region-shape rule the commit applies (Model.apply), so preview and result never disagree
      const chk = Model.checkPlacement(doc, data.ctx, x.batchId, cells, x.kind === 'tile' ? x.tileId : null);
      const checked = chk.cells;
      const origin = x.kind === 'tile' && checked[0].id === x.from;
      return { anchor: anchor, cells: checked, valid: chk.valid, connected: chk.connected, isOrigin: origin };
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
        h += '<path class="j2-pv ' + (c.ok && p.connected ? 'is-ok' : 'is-bad') + (p.isOrigin ? ' is-origin' : '') + '" d="' + hexPath(c.q, c.r) + '"/>';
      }
      if (batch && p.valid) for (const c of p.cells) if (c.ok) h += '<g class="j2-pv-glyph">' + tileMarkup(c.q, c.r, batch, 'j2-pvt', true) + '</g>';
      ui.g.preview.innerHTML = h;
    }

    function reasonText(preview) {
      const bad = preview.cells.filter(c => !c.ok);
      if (!bad.length) return preview.connected === false ? t('journey2_reason_disconnected_region') : '';
      const first = t('journey2_reason_' + bad[0].reason);
      return bad.length > 1 ? first + ' · ' + fill('journey2_reason_blocked_n', { n: n(bad.length) }) : first;
    }

    function updateTip() {
      if (!ui.tip) return;
      if (!tr || (tr.kind === 'tile' && !tr.moved)) { ui.tip.hidden = true; return; }
      const batch = Model.batchById(doc, tr.batchId);
      const count = tr.kind === 'tile' ? 1 : tr.footprint.length;
      let text, bad = false;
      if (tr.kind === 'armed' && !pointer.inside) text = t('journey2_tip_armed');
      else if (tr.kind !== 'armed' && !pointer.inside) text = t('journey2_tip_outside');
      else if (tr.preview && !tr.preview.valid) { text = reasonText(tr.preview); bad = true; }
      else text = '';
      const title = tr.kind === 'tile' ? fill('journey2_tip_move', { name: batchName(batch) }) : fill(count > 1 ? 'journey2_tip_place_all' : 'journey2_tip_place_one', { name: batchName(batch), n: n(count) });
      ui.tip.innerHTML = '<strong></strong><span></span><em></em>';
      ui.tip.children[0].textContent = title;
      ui.tip.children[1].textContent = text;
      ui.tip.children[2].textContent = t('journey2_tip_cancel');
      ui.tip.classList.toggle('is-bad', bad);
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
    function cancelTransient() { if (tr) endTransient(); }

    function stale(x) { return x.docRef !== doc; }

    function commitStock(x, preview) {
      if (stale(x)) { hint(t('journey2_hint_stale')); return; }
      if (!preview) return;
      if (!preview.valid) { hint(fill('journey2_hint_rejected', { reason: reasonText(preview) })); return; }
      const tiles = preview.cells.map(c => ({ id: Model.newId('t'), cell: c.id }));
      const r = dispatch({ type: 'place', batchId: x.batchId, tiles: tiles }, 'place', true);
      if (!r.ok) { hint(fill('journey2_hint_rejected', { reason: errorText(r.error) })); return; }
      announce(fill('journey2_live_placed', { n: n(tiles.length) }));
      if (tiles.length === 1 && !inspectorOpen()) sel.tileId = null;
      warnHoles(x.batchId);
    }

    function commitArmed() {
      const x = tr;
      if (!x) return;
      const preview = computePreview(x);
      if (!preview) return;
      if (!preview.valid) { hint(fill('journey2_hint_rejected', { reason: reasonText(preview) })); return; }
      const stay = x.mode === 'one' && Model.derive(doc).counts.get(x.batchId).remaining > 1;
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
      if (!r.ok) hint(fill('journey2_hint_rejected', { reason: errorText(r.error) }));
      else {
        // the moved hex stays selected only while the inspector is anchored on it (the inspector now carries Return to stock); it follows it
        if (inspectorOpen() && inspector.tileId === x.tileId) sel.tileId = x.tileId;
        renderSelection(); positionInspector(); announce(t('journey2_live_moved')); warnHoles(x.batchId);
      }
    }

    function errorText(err) {
      if (err && err.conflicts && err.conflicts.length) return t('journey2_reason_' + err.conflicts[0].reason);
      if (err && err.code === 'disconnected-region') return t('journey2_reason_disconnected_region');
      return t('journey2_gen_failed');
    }

    function returnSelected() {
      if (!sel.tileId) return;
      const tile = Model.derive(doc).byId.get(sel.tileId);
      const r = dispatch({ type: 'returnTile', tileId: sel.tileId }, 'returnTile');
      if (r.ok) { sel.tileId = null; renderSelection(); announce(t('journey2_live_returned')); if (tile) warnHoles(tile.batchId); }
      else hint(fill('journey2_hint_rejected', { reason: errorText(r.error) }));
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
        if (openMenu) { const b = openMenu.btn; closeMenus(); b.focus(); return; }
        // priority: menu, then a drag / armed placement / pan, then the Region Inspector, then the diagnostic selection
        if (pan) { setCamera({ scale: pan.scale0, tx: pan.tx0, ty: pan.ty0 }); endPan(); e.preventDefault(); return; }
        if (tr) { cancelTransient(); e.preventDefault(); return; }
        if (inspectorOpen()) { closeInspector({ focus: true }); e.preventDefault(); return; }
        if (e.target === ui.viewport) { sel.tileId = null; selCell = null; selMarker = null; placeMode = false; renderSelection(); renderInventory(false); updateReadouts(); }
        return;
      }
      if (isEditableTarget(e.target) || e.defaultPrevented) return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { undo(); e.preventDefault(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { redo(); e.preventDefault(); }
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
      else if (b.hasAttribute('data-j2-inspect')) openInspectorFromCard(b.closest('[data-batch]').getAttribute('data-batch'));
      else if (b.hasAttribute('data-j2-insp-close')) closeInspector({ focus: true });
      else if (b.hasAttribute('data-j2-delete')) confirmDelete(b.closest('[data-batch]').getAttribute('data-batch'));
      else if (b.hasAttribute('data-j2-side-toggle')) toggleSide();
      else if (b.hasAttribute('data-j2-fit')) fitToView();
      else if (b.hasAttribute('data-j2-undo')) undo();
      else if (b.hasAttribute('data-j2-redo')) redo();
      else if (b.hasAttribute('data-j2-return')) returnSelected();
      else if (b.hasAttribute('data-j2-env-toggle')) toggleEnvironments(b);
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

    function backupFileName() { return 'journey2-map-' + new Date().toISOString().slice(0, 10) + '.json'; }

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
      closeInspector({ quiet: true });
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
      if (open) closeInspector({ quiet: true });           // the inspector and the diagnostics drawer never share the map
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
      for (const k of Object.keys(layers)) { const g = ui.g[k]; if (g) g.style.display = layers[k] ? '' : 'none'; }
      ui.badge.hidden = !layers.proof;
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

    function updateHover() {
      if (!data || !doc) return;
      const w = Geo.screenToWorld(cam, pointer.x, pointer.y);
      const c = data.grid.worldToCell(w[0], w[1]);
      ui.viewport.classList.toggle('is-over-tile', !editLocked && Model.derive(doc).occupancy.has(Geo.cellId(c.q, c.r)));
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
        printRoot.innerHTML = proofs.map((p, i) => '<section class="j2-print-page">' +
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
        camera: { scale: cam.scale, tx: cam.tx, ty: cam.ty }, fitMode: fitMode, layers: Object.assign({}, layers),
        selectedCell: selCell && Geo.cellId(selCell.q, selCell.r), selectedMarker: selMarker && selMarker.stableId,
        hoverCell: hoverCell && Geo.cellId(hoverCell.q, hoverCell.r), userPlacements: userPlacements.length,
        ready: data ? data.readiness.ready : null, anchors: data ? data.anchorsDoc.anchors.length : 0,
        validCells: data ? data.grid.validCellCount() : 0, allowedCells: data ? data.ctx.allowedCellCount : 0, placeMode: placeMode,
        activeBatchId: activeBatchId, inspector: { batchId: inspector.batchId, tileId: inspector.tileId, source: inspector.source, open: inspectorOpen() }, sideCollapsed: sideCollapsed, diagnosticsOpen: diagOpen, saveStatus: saveState.status, saveReason: saveState.reason, editLocked: editLocked,
        selectedTile: sel.tileId, transient: tr ? { kind: tr.kind, mode: tr.mode || null, moved: !!tr.moved, cells: tr.preview ? tr.preview.cells.length : 0, valid: tr.preview ? tr.preview.valid : null, anchor: tr.preview ? Geo.cellId(tr.preview.anchor.q, tr.preview.anchor.r) : null, conflicts: tr.preview ? tr.preview.cells.filter(c => !c.ok).map(c => [c.id, c.reason]) : [] } : null,
        history: history ? { undo: history.undo.length, redo: history.redo.length } : null,
        batches: doc ? doc.batches.map(b => Object.assign({ id: b.id, habitat: b.habitat, terrain: b.terrain, quantity: b.quantity, quantitySource: b.quantitySource, rumor: b.rumor, encounter: b.encounter, notes: b.notes }, d.counts.get(b.id))) : [],
        tiles: doc ? doc.tiles.map(x => ({ id: x.id, batchId: x.batchId, cell: x.cell })) : [],
        domTileGlyphs: ui.g && ui.g.tiles ? ui.g.tiles.querySelectorAll('image').length : 0,
        glyphlessTiles: ui.g && ui.g.tiles && ui.g.tiles.querySelector('.is-glyphless') ? ui.g.tiles.querySelector('.is-glyphless').getAttribute('d').split('M').length - 1 : 0,
        discoveredState: 'none',
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
        dispatch(cmd) { return dispatch(cmd, cmd.type); },
        decorativeCells() { return Array.from(data.ctx.decorativeCells); },
        markers() { return data.anchorsDoc.anchors.map(a => ({ id: a.stableId, cellId: a.cellId, rect: a.iconProtectionArea.rectPx })); },
      };
    }

    return inst;
  }

  return { mount: mount, unmount: unmount, isMounted: isMounted, preparePrintProof: preparePrintProof, cleanupPrintProof: cleanupPrintProof, debugState: debugState, debugApi: debugApi, PRINT_PROOFS: PRINT_PROOFS, PRINT_SCALE_MM_PER_PX: PRINT_SCALE_MM_PER_PX, PRINT_PAGE: PRINT_PAGE };
});
