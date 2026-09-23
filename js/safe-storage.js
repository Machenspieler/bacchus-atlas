/* ============================================================
   Bacchus's Atlas — safe-storage.js
   Defensive localStorage boundary. Loaded before js/app.js so that
   nothing in state construction runs a bare
   JSON.parse(localStorage.getItem(key) || fallback) over a value a
   previous session, a browser extension, or a manual edit could have
   left malformed.

   Dependency-free on purpose: no reference to window/document/state/
   t()/i18n, so it can be loaded as a plain <script> in the browser and
   required() as-is from a Node test (see tests/storage.test.js). All
   storage access is passed in as a `storage` argument rather than read
   from a global, which is what lets tests exercise it with a fake
   Storage that can be told to throw.

   See the "Safe browser storage" section in CLAUDE.md for the recovery
   contract this implements.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SafeStorage = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------- storage access ---------------- */

  /** Null when localStorage cannot be used at all (unavailable, blocked,
   * or a private-mode browser that exposes it but throws on write). Every
   * caller must treat that as "run with defaults", not "crash". */
  function getStorage() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      var probeKey = '__dhcodex_probe__';
      window.localStorage.setItem(probeKey, '1');
      window.localStorage.removeItem(probeKey);
      return window.localStorage;
    } catch (err) {
      return null;
    }
  }

  /* ---------------- recovery bookkeeping ---------------- */

  /* One entry per affected key for this page load. Never holds raw stored
   * values — only the key name and a technical reason — so it is safe to
   * both console.warn and eventually surface (in aggregate) to the user. */
  var recoveryLog = [];

  function resetRecoverySummary() { recoveryLog = []; }

  function recordRecovery(key, reason, extra) {
    var entry = { key: key, reason: reason };
    if (extra) {
      if (extra.backedUp !== undefined) entry.backedUp = extra.backedUp;
      if (extra.repaired !== undefined) entry.repaired = extra.repaired;
    }
    recoveryLog.push(entry);
  }

  function getRecoverySummary() {
    var unavailable = false, backedUp = false;
    for (var i = 0; i < recoveryLog.length; i++) {
      if (recoveryLog[i].reason === 'unavailable') unavailable = true;
      if (recoveryLog[i].backedUp) backedUp = true;
    }
    return {
      hasIssues: recoveryLog.length > 0,
      unavailable: unavailable,
      backedUp: backedUp,
      count: recoveryLog.length,
      items: recoveryLog.slice(),
    };
  }

  /* Developer-facing only. Never logs the raw stored value. */
  function logRecoverySummary() {
    recoveryLog.forEach(function (entry) {
      console.warn('[atlas] Recovered invalid browser storage', { key: entry.key, reason: entry.reason });
    });
  }

  /** Which i18n keys (see data/i18n.json) app.js should show for the current
   * summary, or null when there is nothing to report. Kept here, rather than
   * in app.js, so the "which message for which situation" decision has one
   * home and can be tested without t() or a loaded dictionary. */
  function recoveryMessageKeys(summary) {
    if (!summary || !summary.hasIssues) return null;
    if (summary.unavailable) return { main: 'storage_unavailable_warning' };
    return {
      main: 'storage_recovery_warning',
      backupNote: summary.backedUp ? 'storage_recovery_backup_note' : null,
    };
  }

  /* ---------------- best-effort backup + repair ---------------- */

  var BACKUP_PREFIX = 'dhcodex_corrupt_backup_';

  /** Deterministic per-source-key backup key, so a repeated reload replaces
   * the previous backup instead of accumulating new ones. */
  function backupKeyFor(key) {
    return BACKUP_PREFIX + String(key).replace(/^dhcodex_/, '');
  }

  function attemptBackup(storage, key, raw, reason) {
    try {
      storage.setItem(backupKeyFor(key), JSON.stringify({
        sourceKey: key,
        capturedAt: new Date().toISOString(),
        reason: reason,
        raw: raw,
      }));
      return true;
    } catch (err) {
      return false;
    }
  }

  function attemptRepair(storage, key, safeValue) {
    try {
      storage.setItem(key, JSON.stringify(safeValue));
      return true;
    } catch (err) {
      return false;
    }
  }

  /* Backup is attempted first; the original key is only overwritten with the
   * safe value once that backup attempt has actually succeeded (recovery
   * order, CLAUDE.md "Safe browser storage"). */
  function recoverCorrupted(storage, key, raw, reason, safeValue) {
    var backedUp = attemptBackup(storage, key, raw, reason);
    var repaired = backedUp && attemptRepair(storage, key, safeValue);
    recordRecovery(key, reason, { backedUp: backedUp, repaired: repaired });
  }

  /* ---------------- the reader ---------------- */

  /**
   * Safely load one JSON-shaped localStorage value.
   *
   * storage: a Storage-like object (getItem/setItem), or null/undefined.
   * options.fallback(): factory returning a *fresh* default value.
   * options.parse(raw): optional custom parse (defaults to JSON.parse).
   *   Must not throw for its own recoverable cases (e.g. a legacy bare
   *   string) — only throw for input it genuinely cannot make sense of.
   * options.validate(parsed): optional; returns
   *   { ok: false }                          — unusable top-level shape
   *   { ok: true, value, changed: false }    — usable as-is
   *   { ok: true, value, changed: true }     — usable after sanitizing
   *   Omit to accept whatever parsed to.
   */
  function loadStoredJson(storage, key, options) {
    options = options || {};
    var fallbackFactory = options.fallback || function () { return null; };

    if (!storage) {
      recordRecovery(key, 'unavailable');
      return fallbackFactory();
    }

    var raw;
    try {
      raw = storage.getItem(key);
    } catch (err) {
      recordRecovery(key, 'unavailable');
      return fallbackFactory();
    }

    if (raw === null || raw === undefined) return fallbackFactory();

    var parsed;
    try {
      parsed = options.parse ? options.parse(raw) : JSON.parse(raw);
    } catch (err) {
      var safeOnParseFail = fallbackFactory();
      recoverCorrupted(storage, key, raw, 'invalid-json', safeOnParseFail);
      return safeOnParseFail;
    }

    var result = options.validate ? options.validate(parsed) : { ok: true, value: parsed, changed: false };
    if (!result || !result.ok) {
      var safeOnBadShape = fallbackFactory();
      recoverCorrupted(storage, key, raw, 'invalid-shape', safeOnBadShape);
      return safeOnBadShape;
    }
    if (result.changed) {
      var backedUp = attemptBackup(storage, key, raw, 'sanitized');
      var repaired = backedUp && attemptRepair(storage, key, result.value);
      recordRecovery(key, 'sanitized', { backedUp: backedUp, repaired: repaired });
    }
    return result.value;
  }

  /** For the one flag that is not JSON at all (dhcodex_storage_notice_dismissed
   * stores the bare string "1"). Guards the getItem() call only — the value
   * itself has no shape to validate, and any unexpected string safely reads
   * as "not dismissed" the same way it always has. */
  function readRawFlag(storage, key) {
    if (!storage) { recordRecovery(key, 'unavailable'); return null; }
    try {
      return storage.getItem(key);
    } catch (err) {
      recordRecovery(key, 'unavailable');
      return null;
    }
  }

  /* ---------------- validators ---------------- */

  function isPlainObject(v) { return typeof v === 'object' && v !== null && !Array.isArray(v); }
  function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }
  function isNonEmptyString(v) { return typeof v === 'string' && v.length > 0; }

  /* data/… never appears here — these mirror only the localStorage-side
   * shapes read in js/app.js (state.lists, state.envLists, state.journey*). */

  function sanitizeLists(parsed) {
    if (!Array.isArray(parsed)) return { ok: false };
    var kept = [];
    var changed = false;
    parsed.forEach(function (entry) {
      if (isPlainObject(entry) && isNonEmptyString(entry.id) && typeof entry.name === 'string') {
        kept.push(entry);
      } else {
        changed = true;
      }
    });
    return { ok: true, value: kept, changed: changed };
  }

  var DANGEROUS_KEYS = { '__proto__': true, prototype: true, constructor: true };

  function sanitizeEnvLists(parsed) {
    if (!isPlainObject(parsed)) return { ok: false };
    var out = {};
    var changed = false;
    Object.keys(parsed).forEach(function (envId) {
      if (DANGEROUS_KEYS[envId]) { changed = true; return; }
      var value = parsed[envId];
      if (!Array.isArray(value)) { changed = true; return; }
      var ids = [];
      value.forEach(function (id) {
        if (!isNonEmptyString(id)) { changed = true; return; }
        if (ids.indexOf(id) === -1) ids.push(id);
        else changed = true;
      });
      if (!ids.length) { changed = true; return; }
      out[envId] = ids;
    });
    return { ok: true, value: out, changed: changed };
  }

  function isValidEncounterPair(pair) {
    return Array.isArray(pair) && pair.length >= 2 && isFiniteNumber(pair[0]) && isFiniteNumber(pair[1]);
  }

  /** Normalizes an optional cosmetic `name` field without failing the whole
   * entry over it — a wrong-typed name can't crash rendering (it's read as
   * entry.name || ''), it just needs to actually be a string or absent. */
  function withSanitizedName(entry) {
    if (entry.name === undefined || typeof entry.name === 'string') {
      return { ok: true, value: entry, changed: false };
    }
    var copy = {};
    Object.keys(entry).forEach(function (k) { copy[k] = entry[k]; });
    copy.name = '';
    return { ok: true, value: copy, changed: true };
  }

  /* Mirrors what regionRows()/habitatView()/encounterValueHtml() actually
   * dereference (js/app.js) — habitat.rolls, encounter.entries/combines,
   * and the three plain die rolls. */
  function sanitizeRegionEntry(entry) {
    if (!isPlainObject(entry) || !isNonEmptyString(entry.id)) return { ok: false };
    var habitat = entry.habitat;
    if (!isPlainObject(habitat) || !Array.isArray(habitat.rolls) || !habitat.rolls.length
        || !habitat.rolls.every(isFiniteNumber)) return { ok: false };
    if (!isFiniteNumber(entry.size)) return { ok: false };
    var encounter = entry.encounter;
    if (!isPlainObject(encounter) || !Array.isArray(encounter.entries) || !encounter.entries.length
        || !encounter.entries.every(isValidEncounterPair) || !isFiniteNumber(encounter.combines)) {
      return { ok: false };
    }
    if (!isFiniteNumber(entry.terrain) || !isFiniteNumber(entry.rumor)) return { ok: false };
    return withSanitizedName(entry);
  }

  /* Mirrors sanctuaryRows() — trade/quirk/crisis/drive/size/population read
   * directly as s[key], politics.rolls walked for the combined-systems row. */
  function sanitizeSanctuaryEntry(entry) {
    if (!isPlainObject(entry) || !isNonEmptyString(entry.id)) return { ok: false };
    var numericFields = ['trade', 'quirk', 'crisis', 'drive', 'size', 'population'];
    for (var i = 0; i < numericFields.length; i++) {
      if (!isFiniteNumber(entry[numericFields[i]])) return { ok: false };
    }
    var politics = entry.politics;
    if (!isPlainObject(politics) || !Array.isArray(politics.rolls) || !politics.rolls.length
        || !politics.rolls.every(isFiniteNumber)) return { ok: false };
    return withSanitizedName(entry);
  }

  function sanitizeJourneyArray(parsed, sanitizeEntry) {
    if (!Array.isArray(parsed)) return { ok: false };
    var kept = [];
    var changed = false;
    parsed.forEach(function (entry) {
      var result = sanitizeEntry(entry);
      if (!result.ok) { changed = true; return; }
      if (result.changed) changed = true;
      kept.push(result.value);
    });
    return { ok: true, value: kept, changed: changed };
  }

  function sanitizeJourneyRegions(parsed) { return sanitizeJourneyArray(parsed, sanitizeRegionEntry); }
  function sanitizeJourneySanctuaries(parsed) { return sanitizeJourneyArray(parsed, sanitizeSanctuaryEntry); }

  return {
    getStorage: getStorage,
    loadStoredJson: loadStoredJson,
    readRawFlag: readRawFlag,
    resetRecoverySummary: resetRecoverySummary,
    getRecoverySummary: getRecoverySummary,
    logRecoverySummary: logRecoverySummary,
    recoveryMessageKeys: recoveryMessageKeys,
    backupKeyFor: backupKeyFor,
    BACKUP_PREFIX: BACKUP_PREFIX,
    validators: {
      lists: sanitizeLists,
      envLists: sanitizeEnvLists,
      journeyRegions: sanitizeJourneyRegions,
      journeySanctuaries: sanitizeJourneySanctuaries,
    },
  };
});
