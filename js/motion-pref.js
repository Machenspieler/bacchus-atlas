/* ============================================================
   Bacchus's Atlas — motion-pref.js
   The device-wide "Static effects" preference of the Journey map (PD-076): one
   key, dhcodex_motion, holding the bare JSON string "static" or "animated".
   No stored value means "follow the system's prefers-reduced-motion". It is a
   device preference, not map data, so the player page (which never touches a
   dhcodex_journey2_* key) reads and writes it too.

   Pure and dependency-free apart from SafeStorage: every storage access goes
   through the `storage` argument, so a Node test can drive it with a fake.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./safe-storage.js'));
  else root.MotionPref = factory(root.SafeStorage);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (SafeStorage) {
  'use strict';

  const KEY = 'dhcodex_motion';

  /** The stored choice, or null when there is none (or it is unusable): 'static' | 'animated' | null. */
  function load(storage) {
    return SafeStorage.loadStoredJson(storage, KEY, { fallback: function () { return null; }, validate: SafeStorage.validators.motionPref });
  }

  /** Remembers an explicit choice; a failed write is reported to the caller, never thrown. */
  function save(storage, pref) {
    if (pref !== 'static' && pref !== 'animated') return { ok: false, reason: 'invalid' };
    return SafeStorage.writeJson(storage, KEY, pref);
  }

  /** True when the map's decorative effects must be drawn as one still frame: an explicit choice wins, otherwise the system setting decides. */
  function isStatic(pref, systemReduced) {
    if (pref === 'static') return true;
    if (pref === 'animated') return false;
    return !!systemReduced;
  }

  return Object.freeze({ KEY, load, save, isStatic });
});
