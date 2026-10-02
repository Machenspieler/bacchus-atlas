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
   *   { ok: true, value, changed: false, migrated: true }
   *     — the value differs from what was stored only because of an
   *       expected schema version upgrade, not because anything was
   *       invalid. Written back best-effort but never backed up and never
   *       recorded as a recovery — an upgrade must not be presented to the
   *       user as corrupted browser storage.
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
    } else if (result.migrated) {
      // A clean version upgrade, not corruption — write the upgraded value
      // back best-effort (no backup needed, nothing was invalid) and never
      // call recordRecovery(), so no recovery toast is shown for it. The
      // in-memory value returned below is the migrated one regardless of
      // whether this silent write-back succeeds.
      attemptRepair(storage, key, result.value);
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

  /** Global soundboard preferences: { schemaVersion, master, sounds:{id:level} }.
   * Every level is clamped into 0..1 (never amplification) and a non-numeric
   * one is dropped; a missing or wrong-typed master is dropped too — the
   * caller (SoundboardManifest.normalizePrefs) fills in defaults, so this
   * stays ignorant of which sounds exist. Only an unusable top level fails. */
  function sanitizeSoundboard(parsed) {
    if (!isPlainObject(parsed)) return { ok: false };
    var changed = false;
    var value = { schemaVersion: 1, sounds: {} };
    if (parsed.schemaVersion !== 1) changed = true;
    if (isFiniteNumber(parsed.master)) {
      value.master = Math.min(1, Math.max(0, parsed.master));
      if (value.master !== parsed.master) changed = true;
    } else {
      changed = true;
    }
    if (isPlainObject(parsed.sounds)) {
      Object.keys(parsed.sounds).forEach(function (id) {
        var level = parsed.sounds[id];
        if (DANGEROUS_KEYS[id] || !isFiniteNumber(level)) { changed = true; return; }
        value.sounds[id] = Math.min(1, Math.max(0, level));
        if (value.sounds[id] !== level) changed = true;
      });
    } else {
      changed = true;
    }
    return { ok: true, value: value, changed: changed };
  }

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

  /* ---------------- Prep (dhcodex_session_prep) ----------------
   * Mirrors the shape PrepUtils (js/prep-utils.js) operates
   * on, but is deliberately self-contained rather than requiring that
   * module: this validator only needs to know the storage *shape* is sound
   * (bounds, uniqueness, cross-field consistency), not the selection rules
   * a live page applies, and duplicating the small constants below keeps
   * this file loadable standalone in a test the same way
   * sanitizeRegionEntry/sanitizeSanctuaryEntry already are.
   *
   * Schema v2 (current) is a plain binary-selection shape: every prep
   * has `environmentIds`/`adversaryIds`/`itemIds`, each a deduplicated
   * array of string ids — no primary environment, no quantity anywhere.
   * Schema v1 (legacy) had `primaryEnvironmentId` and `adversaries`/`items`
   * as `{ id, quantity }[]`. This is the one place a v1 store is migrated
   * to v2: dropping `primaryEnvironmentId` and each entry's `quantity` is
   * the *intended* effect of the migration, not something to flag as
   * "changed" — only a genuinely invalid row (bad id, duplicate, over the
   * environment cap, a bad timestamp, ...) is. See the "Prep"
   * section of CLAUDE.md and options.validate's contract in
   * loadStoredJson() above for how a clean migration avoids the recovery
   * toast while still writing the upgraded value back. */

  var SP_MAX_ENVIRONMENTS = 3;
  var SP_SCHEMA_VERSION = 2;

  function isValidIsoTimestamp(v) {
    if (typeof v !== 'string' || !v) return false;
    var d = new Date(v);
    return !isNaN(d.getTime());
  }

  /** Sanitizes a plain array of string ids: drops non-string/empty/
   * dangerous/duplicate entries (keeping the first occurrence), optionally
   * capping the result length. Never fails the whole list over one bad
   * entry. */
  function sanitizeIdList(list, max) {
    var raw = Array.isArray(list) ? list : [];
    var changed = !Array.isArray(list);
    var seen = Object.create(null);
    var out = [];
    raw.forEach(function (id) {
      if (!isNonEmptyString(id) || DANGEROUS_KEYS[id]) { changed = true; return; }
      if (seen[id]) { changed = true; return; }
      seen[id] = true;
      out.push(id);
    });
    if (typeof max === 'number' && out.length > max) {
      out = out.slice(0, max);
      changed = true;
    }
    return { value: out, changed: changed };
  }

  /** Migrates a v1 selection list into a plain id array. Tolerates three
   * shapes for `list`: a v1 `{ id, quantity }[]`, an already-migrated plain
   * `string[]`, or a mix of both (a partially-migrated row) — extracting
   * and deduplicating ids from whichever form each entry takes. Discarding
   * the `quantity` field itself is the silent, intended part of the
   * migration and is never flagged as `changed`; only a missing/invalid/
   * duplicate/dangerous id is. */
  function migrateIdListFromEntries(list) {
    if (!Array.isArray(list)) return { value: [], changed: true };
    var seen = Object.create(null);
    var out = [];
    var changed = false;
    list.forEach(function (entry) {
      var id = typeof entry === 'string' ? entry : (isPlainObject(entry) ? entry.id : null);
      if (!isNonEmptyString(id) || DANGEROUS_KEYS[id]) { changed = true; return; }
      if (seen[id]) { changed = true; return; }
      seen[id] = true;
      out.push(id);
    });
    return { value: out, changed: changed };
  }

  /** Shared id-list/title/timestamp sanitizing for one prep, used by
   * both the v1->v2 migration and the v2 shape validator below —
   * `getSelectionIds(prep)` is the one difference between them (where
   * the adversary/item ids are read from, and by which rule). */
  function sanitizePrepCommon(prep, getSelectionIds) {
    if (!isPlainObject(prep) || !isNonEmptyString(prep.id)) return { ok: false };
    var changed = false;
    var now = new Date().toISOString();

    var title = typeof prep.title === 'string' ? prep.title : '';
    if (title !== prep.title) changed = true;

    // `notes` arrived after the first v2 stores shipped, so a missing value is
    // the normal legacy shape and is filled in silently (not a recovery
    // event); only a present-but-non-string value counts as `changed`. The
    // text itself is never trimmed or otherwise rewritten.
    var notes = typeof prep.notes === 'string' ? prep.notes : '';
    if (prep.notes !== undefined && notes !== prep.notes) changed = true;

    var createdAt = isValidIsoTimestamp(prep.createdAt) ? prep.createdAt : now;
    if (createdAt !== prep.createdAt) changed = true;
    var updatedAt = isValidIsoTimestamp(prep.updatedAt) ? prep.updatedAt : now;
    if (updatedAt !== prep.updatedAt) changed = true;

    var envResult = sanitizeIdList(prep.environmentIds, SP_MAX_ENVIRONMENTS);
    if (envResult.changed) changed = true;

    var selection = getSelectionIds(prep);
    if (selection.adversaryIds.changed) changed = true;
    if (selection.itemIds.changed) changed = true;

    return {
      ok: true,
      changed: changed,
      value: {
        id: prep.id,
        title: title,
        notes: notes,
        createdAt: createdAt,
        updatedAt: updatedAt,
        environmentIds: envResult.value,
        adversaryIds: selection.adversaryIds.value,
        itemIds: selection.itemIds.value,
      },
    };
  }

  /** v1 -> v2: reads the legacy `adversaries`/`items` quantity-entry arrays
   * (tolerating a partially-migrated string array too) and drops
   * `primaryEnvironmentId` entirely — that drop is never itself flagged as
   * `changed`. */
  function migratePrepV1ToV2(prep) {
    return sanitizePrepCommon(prep, function (s) {
      return {
        adversaryIds: migrateIdListFromEntries(s.adversaryIds !== undefined ? s.adversaryIds : s.adversaries),
        itemIds: migrateIdListFromEntries(s.itemIds !== undefined ? s.itemIds : s.items),
      };
    });
  }

  /** Current (v2) shape: `adversaryIds`/`itemIds` are read directly as
   * plain id arrays — defensive against a hand-edited or otherwise
   * malformed v2 store. */
  function sanitizePrepV2(prep) {
    return sanitizePrepCommon(prep, function (s) {
      return {
        adversaryIds: sanitizeIdList(s.adversaryIds),
        itemIds: sanitizeIdList(s.itemIds),
      };
    });
  }

  function sanitizePrep(parsed) {
    if (!isPlainObject(parsed)) return { ok: false };
    var version = parsed.schemaVersion;
    if (version !== 1 && version !== 2) return { ok: false };
    if (!Array.isArray(parsed.sessions) || !parsed.sessions.length) return { ok: false };

    var anySanitized = false;
    var kept = [];
    parsed.sessions.forEach(function (prep) {
      var result = version === 1 ? migratePrepV1ToV2(prep) : sanitizePrepV2(prep);
      if (!result.ok) { anySanitized = true; return; }
      if (result.changed) anySanitized = true;
      kept.push(result.value);
    });
    if (!kept.length) return { ok: false };

    var activeSessionId = parsed.activeSessionId;
    if (!isNonEmptyString(activeSessionId) || !kept.some(function (s) { return s.id === activeSessionId; })) {
      activeSessionId = kept[0].id;
      anySanitized = true;
    }

    var value = { schemaVersion: SP_SCHEMA_VERSION, activeSessionId: activeSessionId, sessions: kept };
    if (version === 1) {
      // A clean version bump (nothing here was actually invalid) is a
      // silent migration, not a recovery — see loadStoredJson()'s
      // `migrated` contract above.
      return { ok: true, changed: anySanitized, value: value, migrated: !anySanitized };
    }
    return { ok: true, changed: anySanitized, value: value };
  }

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
      prep: sanitizePrep,
      soundboard: sanitizeSoundboard,
    },
  };
});
