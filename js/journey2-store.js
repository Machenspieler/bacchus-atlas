/* ============================================================
   Bacchus's Atlas — journey2-store.js
   Local persistence for the single Journey 2 map document, built on the
   repository's safe-storage boundary (js/safe-storage.js). Storage is passed
   in, so it loads as a plain <script> and is exercised from a Node test with
   a fake Storage that can be told to fail (tests/journey2-store.test.js).

   Contract (see .claude/rules/browser-state.md and docs/architecture.md
   "Journey 2 map editor"):
   - Four dedicated keys (the map document, its recovery copy, the pre-import copy, and view preferences), all prefixed dhcodex_journey2_. Legacy Journey,
     Prep and every other key are never read, written or cleared here.
   - A stored document that fails validation is NEVER replaced by an empty
     autosave. load() reports { status: 'corrupt' } and keeps the raw text
     untouched under its own key plus a best-effort copy under the recovery
     key; the caller blocks autosave until the user imports a backup or
     explicitly starts an empty map.
   - save() reports the real outcome; the caller must not show "Saved"
     unless { ok: true } came back.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./safe-storage.js'), require('./journey2-model.js'));
  else root.Journey2Store = factory(root.SafeStorage, root.Journey2Model);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (SafeStorage, Model) {
  'use strict';

  const KEYS = Object.freeze({
    map: 'dhcodex_journey2_map',
    recovery: 'dhcodex_journey2_map_recovery',     // raw text of a map that failed validation
    previous: 'dhcodex_journey2_map_previous',     // the map that an import replaced
    ui: 'dhcodex_journey2_ui',                     // view preferences (sidebar state, fog-state overlay, biome colors, camera) — never part of the map or its history
  });

  /** All Journey 2-owned keys; anything else in storage must stay byte-identical across any Journey 2 use. */
  function ownedKeys() { return Object.keys(KEYS).map(k => KEYS[k]); }

  /** A stored camera, or null: finite numbers only and a positive zoom — anything else falls back to Fit. */
  function cleanView(v) {
    if (!v || typeof v !== 'object' || typeof v.fit !== 'boolean') return null;
    if (v.fit) return { fit: true, cx: 0, cy: 0, scale: 1 };
    return Number.isFinite(v.cx) && Number.isFinite(v.cy) && Number.isFinite(v.scale) && v.scale > 0 ? { fit: false, cx: v.cx, cy: v.cy, scale: v.scale } : null;
  }

  function createStore(storage, ctx) {
    /** { status: 'empty'|'ok'|'corrupt'|'unavailable', doc?, errors?, code? } */
    function load() {
      if (!storage) return { status: 'unavailable' };
      let raw;
      try { raw = storage.getItem(KEYS.map); } catch (e) { return { status: 'unavailable' }; }
      if (raw === null || raw === undefined) return { status: 'empty' };
      const parsed = Model.parseBackupText(raw, ctx);
      if (parsed.ok) return { status: 'ok', doc: parsed.doc };
      const copy = SafeStorage.writeRaw(storage, KEYS.recovery, raw);
      return { status: 'corrupt', code: parsed.code, errors: parsed.errors, recoveryCopySaved: copy.ok };
    }

    /** { ok:true } | { ok:false, reason: 'unavailable'|'serialization-failed'|'write-failed' } — never throws. */
    function save(doc) { return SafeStorage.writeJson(storage, KEYS.map, doc); }

    /** Keeps the map an import is about to replace. Best effort; the caller also offers a download. */
    function savePrevious(doc) { return SafeStorage.writeJson(storage, KEYS.previous, doc); }

    function loadPrevious() {
      const raw = SafeStorage.readRawFlag(storage, KEYS.previous);
      if (raw === null || raw === undefined) return null;
      const r = Model.parseBackupText(raw, ctx);
      return r.ok ? r.doc : null;
    }

    /**
     * View preferences, separate from the map document and its history: { sideCollapsed, showFogState, showBiomeColors, view }, where
     * view = { fit, cx, cy, scale } is the camera (the WORLD point at the viewport centre plus the zoom; fit: true = "fitted to the window", so
     * the numbers are ignored) or null when none was stored. Unreadable or malformed values -> defaults (sidebar open, fog-state overlay shown,
     * no camera -> Fit). The Player Preview mode, the active Reveal/Hide tool and any in-progress stroke are NEVER stored.
     */
    function loadUi() {
      const out = { sideCollapsed: false, showFogState: true, showBiomeColors: true, view: null };
      const raw = SafeStorage.readRawFlag(storage, KEYS.ui);
      if (typeof raw !== 'string') return out;
      try {
        const v = JSON.parse(raw);
        if (v && typeof v === 'object') {
          if (typeof v.sideCollapsed === 'boolean') out.sideCollapsed = v.sideCollapsed;
          if (typeof v.showFogState === 'boolean') out.showFogState = v.showFogState;
          if (typeof v.showBiomeColors === 'boolean') out.showBiomeColors = v.showBiomeColors;
          out.view = cleanView(v.view);
        }
      } catch (e) { /* defaults */ }
      return out;
    }
    function saveUi(ui) {
      return SafeStorage.writeJson(storage, KEYS.ui, { sideCollapsed: !!(ui && ui.sideCollapsed), showFogState: !(ui && ui.showFogState === false), showBiomeColors: !(ui && ui.showBiomeColors === false), view: cleanView(ui && ui.view) });
    }

    return { load: load, save: save, savePrevious: savePrevious, loadPrevious: loadPrevious, loadUi: loadUi, saveUi: saveUi, keys: KEYS };
  }

  return { KEYS: KEYS, ownedKeys: ownedKeys, createStore: createStore };
});
