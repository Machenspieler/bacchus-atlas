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

  /** Null only when localStorage cannot be *obtained* at all (unavailable, or
   * accessing window.localStorage itself throws, as some browsers do in a
   * locked-down privacy mode). Deliberately does not probe with a test
   * setItem/removeItem: a browser can expose perfectly readable storage while
   * rejecting writes (quota exceeded, a write-blocking privacy policy), and
   * that must still let read functions see existing data. Write functions
   * below catch their own setItem/removeItem failures independently. */
  function getStorage() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
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

  /* ---------------- the writer ---------------- */

  /* User-action writes (creating a list, toggling membership, saving a
   * Journey roll…) go through the functions below instead of a bare
   * storage.setItem(). They never throw: every expected failure — storage
   * unavailable, a value that cannot be serialized, setItem() rejecting the
   * write — comes back as a structured { ok:false, reason } result for the
   * caller to act on. None of these functions know about document, state,
   * t() or showToast(): they only touch storage and return data. */

  /** { ok:true, json } or { ok:false } — never throws, even for a value
   * JSON.stringify itself cannot handle (a circular reference) or one it
   * silently turns into undefined (a bare function or symbol). */
  function safeStringify(value) {
    var json;
    try {
      json = JSON.stringify(value);
    } catch (err) {
      return { ok: false };
    }
    if (json === undefined) return { ok: false };
    return { ok: true, json: json };
  }

  /** Writes one JSON-serializable value to one key. Reasons: 'unavailable'
   * (no storage), 'serialization-failed' (value could not become JSON),
   * 'write-failed' (setItem() itself threw — quota, blocked, private mode). */
  function writeJson(storage, key, value) {
    if (!storage) return { ok: false, reason: 'unavailable' };
    var serialized = safeStringify(value);
    if (!serialized.ok) return { ok: false, reason: 'serialization-failed' };
    try {
      storage.setItem(key, serialized.json);
    } catch (err) {
      return { ok: false, reason: 'write-failed' };
    }
    return { ok: true };
  }

  /** For the one flag that is intentionally not JSON (the raw "1" of
   * dhcodex_storage_notice_dismissed) — same result shape as writeJson, no
   * serialization step. */
  function writeRaw(storage, key, rawValue) {
    if (!storage) return { ok: false, reason: 'unavailable' };
    try {
      storage.setItem(key, String(rawValue));
    } catch (err) {
      return { ok: false, reason: 'write-failed' };
    }
    return { ok: true };
  }

  /**
   * Coordinated multi-key write for an action that changes more than one
   * persisted key (deleting a list touches both the list and its
   * memberships). Best-effort transactional: not real localStorage atomicity,
   * just an attempt to avoid leaving storage half-updated when the second of
   * two writes fails.
   *
   * entries: [{ key, value }, …]. Every value is serialized before anything
   * is written; every affected key's previous raw value is read before
   * anything is written. If a write partway through the batch fails, the
   * keys already written by this batch are restored (in reverse order) to
   * their previous raw value, or removed if the key did not exist before.
   *
   * Success: { ok: true }
   * Failure: { ok: false, reason, failedKey?, rollbackAttempted, rollbackSucceeded }
   * Never includes the values being written or their previous raw contents.
   */
  function writeJsonBatch(storage, entries) {
    if (!storage) return { ok: false, reason: 'unavailable', rollbackAttempted: false, rollbackSucceeded: false };
    if (!Array.isArray(entries) || !entries.length) {
      return { ok: false, reason: 'invalid-batch', rollbackAttempted: false, rollbackSucceeded: false };
    }

    var serialized = [];
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (!entry || typeof entry.key !== 'string' || !entry.key) {
        return { ok: false, reason: 'invalid-batch', rollbackAttempted: false, rollbackSucceeded: false };
      }
      var result = safeStringify(entry.value);
      if (!result.ok) {
        return { ok: false, reason: 'serialization-failed', rollbackAttempted: false, rollbackSucceeded: false };
      }
      serialized.push({ key: entry.key, json: result.json });
    }

    /* Snapshot every affected key's previous raw value before writing
     * anything, so a failure partway through has something to roll back to. */
    var previous = [];
    try {
      for (var j = 0; j < serialized.length; j++) {
        var k = serialized[j].key;
        var raw = storage.getItem(k);
        previous.push({ key: k, existed: raw !== null && raw !== undefined, raw: raw });
      }
    } catch (err) {
      return { ok: false, reason: 'write-failed', rollbackAttempted: false, rollbackSucceeded: false };
    }

    var written = [];
    for (var w = 0; w < serialized.length; w++) {
      var toWrite = serialized[w];
      try {
        storage.setItem(toWrite.key, toWrite.json);
        written.push(toWrite.key);
      } catch (err) {
        var rollbackSucceeded = true;
        for (var r = written.length - 1; r >= 0; r--) {
          var writtenKey = written[r];
          var snapshot = previous[r];
          try {
            if (snapshot.existed) storage.setItem(writtenKey, snapshot.raw);
            else storage.removeItem(writtenKey);
          } catch (rollbackErr) {
            rollbackSucceeded = false;
          }
        }
        return {
          ok: false,
          reason: 'write-failed',
          failedKey: toWrite.key,
          rollbackAttempted: true,
          rollbackSucceeded: rollbackSucceeded,
        };
      }
    }
    return { ok: true };
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
    writeJson: writeJson,
    writeRaw: writeRaw,
    writeJsonBatch: writeJsonBatch,
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
