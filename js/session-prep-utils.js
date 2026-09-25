/* ============================================================
   Bacchus's Atlas — session-prep-utils.js
   Pure, dependency-free helpers for the Session Prep page (#/session-prep):
   the default persisted shape, active-session lookup, environment/adversary/
   item selection rules (the three-environment cap and primary promotion,
   toggle-on-select, 1-99 quantity clamping) and search-query normalization.

   No DOM, no application state, no i18n, no persistence — same shape as
   js/route-utils.js and js/list-utils.js, loaded as a plain <script> in the
   browser (before js/app.js, data-cache-version="ui") and required() as-is
   from a Node test (see tests/session-prep-utils.test.js).

   js/safe-storage.js validates a stored value's *shape* independently (its
   own sanitizeSessionPrep, mirroring sanitizeLists/sanitizeRegionEntry) —
   this file is about the *rules* the UI applies while the page is open, not
   about recovering a broken localStorage value. See the "Session Prep"
   sections in CLAUDE.md.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SessionPrepUtils = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_ENVIRONMENTS = 3;
  var MIN_QUANTITY = 1;
  var MAX_QUANTITY = 99;
  var SCHEMA_VERSION = 1;
  var DEFAULT_SESSION_ID = 'default';
  var ITEM_STRIP_INITIAL_DIRECTION = 1;

  /* ---------------- default shape ---------------- */

  function createDefaultSession(id, now) {
    var timestamp = now || new Date().toISOString();
    return {
      id: id || DEFAULT_SESSION_ID,
      title: '',
      createdAt: timestamp,
      updatedAt: timestamp,
      primaryEnvironmentId: null,
      environmentIds: [],
      adversaries: [],
      items: [],
    };
  }

  function createDefaultStore(now) {
    return {
      schemaVersion: SCHEMA_VERSION,
      activeSessionId: DEFAULT_SESSION_ID,
      sessions: [createDefaultSession(DEFAULT_SESSION_ID, now)],
    };
  }

  /** The session the UI operates on for this MVP. Never mutates `store`. */
  function getActiveSession(store) {
    if (!store || !Array.isArray(store.sessions)) return null;
    var found = null;
    for (var i = 0; i < store.sessions.length; i++) {
      if (store.sessions[i] && store.sessions[i].id === store.activeSessionId) { found = store.sessions[i]; break; }
    }
    return found || store.sessions[0] || null;
  }

  /** Replaces the active session in `store` with `session`, returning a new
   * store object. `store` and `session` are never mutated in place. */
  function withActiveSession(store, session) {
    var sessions = store.sessions.map(function (s) { return s.id === session.id ? session : s; });
    return Object.assign({}, store, { sessions: sessions });
  }

  /* ---------------- id-list normalization ---------------- */

  /** Drops duplicates, keeping the first occurrence's position — the order a
   * list of ids was selected in is meaningful (first environment = primary
   * candidate) and must survive de-duplication. */
  function normalizeIdList(ids) {
    var seen = Object.create(null);
    var out = [];
    (ids || []).forEach(function (id) {
      if (typeof id !== 'string' || !id) return;
      if (seen[id]) return;
      seen[id] = true;
      out.push(id);
    });
    return out;
  }

  /* ---------------- environments ---------------- */

  /** Checkbox semantics: absent + room -> add (and become primary if it's the
   * first); present -> remove (promoting the next environment if it was
   * primary); absent + at the cap -> rejected, `session` returned unchanged
   * alongside `limitReached: true` so the caller can show the localized
   * explanation without mutating anything. */
  function toggleEnvironment(session, envId) {
    var ids = session.environmentIds.slice();
    var idx = ids.indexOf(envId);
    if (idx !== -1) return removeEnvironment(session, envId);
    if (ids.length >= MAX_ENVIRONMENTS) {
      return { session: session, changed: false, limitReached: true };
    }
    ids.push(envId);
    var primary = session.primaryEnvironmentId || envId;
    return {
      session: Object.assign({}, session, { environmentIds: ids, primaryEnvironmentId: primary }),
      changed: true,
      limitReached: false,
    };
  }

  /** Explicit removal (the central list's Remove button, or an unchecked
   * source checkbox) — always removes, never reports a limit. Promotes the
   * next remaining environment to primary when the removed one held that
   * role. */
  function removeEnvironment(session, envId) {
    var ids = session.environmentIds.filter(function (id) { return id !== envId; });
    var primary = session.primaryEnvironmentId === envId ? (ids[0] || null) : session.primaryEnvironmentId;
    return {
      session: Object.assign({}, session, { environmentIds: ids, primaryEnvironmentId: primary }),
      changed: true,
      limitReached: false,
    };
  }

  /** No-op (returns the same session reference) if `envId` isn't currently
   * selected — "Make primary" only ever appears on a selected entry, but a
   * stale click after a race should still be inert rather than corrupt. */
  function setPrimaryEnvironment(session, envId) {
    if (session.primaryEnvironmentId === envId) return session;
    if (session.environmentIds.indexOf(envId) === -1) return session;
    return Object.assign({}, session, { primaryEnvironmentId: envId });
  }

  /* ---------------- adversaries / items (quantity entries) ---------------- */

  function clampQuantity(value) {
    var n = Math.round(Number(value));
    if (!Number.isFinite(n)) return MIN_QUANTITY;
    return Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, n));
  }

  /** Checkbox semantics for an { id, quantity } list: absent -> add at
   * quantity 1; present -> remove entirely. */
  function toggleEntry(list, id) {
    var idx = list.findIndex(function (e) { return e.id === id; });
    if (idx !== -1) return list.filter(function (e) { return e.id !== id; });
    return list.concat([{ id: id, quantity: MIN_QUANTITY }]);
  }

  /** Explicit removal — the central list's Remove button. */
  function removeEntry(list, id) {
    return list.filter(function (e) { return e.id !== id; });
  }

  function setEntryQuantity(list, id, quantity) {
    var q = clampQuantity(quantity);
    return list.map(function (e) { return e.id === id ? Object.assign({}, e, { quantity: q }) : e; });
  }

  function adjustEntryQuantity(list, id, delta) {
    return list.map(function (e) {
      return e.id === id ? Object.assign({}, e, { quantity: clampQuantity((e.quantity || 0) + delta) }) : e;
    });
  }

  function incrementEntry(list, id) { return adjustEntryQuantity(list, id, 1); }
  function decrementEntry(list, id) { return adjustEntryQuantity(list, id, -1); }

  /* ---------------- counts ---------------- */

  function countUnique(list) { return list.length; }
  function countTotalQuantity(list) {
    return list.reduce(function (sum, e) { return sum + (Number(e.quantity) || 0); }, 0);
  }

  /* ---------------- item strip auto-pan boundary math ---------------- */

  /** One frame of the Session Prep item strip's idle auto-pan: advances
   * `scrollLeft` by `speedPxPerSec * elapsedMs` in `direction` (1 = toward
   * increasing scrollLeft, -1 = toward zero), reversing direction and
   * clamping exactly at either boundary rather than overshooting past it —
   * so even a huge `elapsedMs` (e.g. a tab that was backgrounded, or a
   * caller that forgot to reset its timestamp) lands on the boundary and
   * flips direction instead of scrolling out of range. Pure function of its
   * inputs — no DOM, no timers — so the DOM controller in js/app.js
   * (initSessionPrepItemStrip() et al.) can drive a real element's
   * scrollLeft from its result without this file ever touching the page.
   * Returns `{ scrollLeft: 0, direction: ITEM_STRIP_INITIAL_DIRECTION }`,
   * i.e. no movement, when the strip has no horizontal overflow to pan. */
  function computeAutoPanStep(params) {
    var scrollWidth = params.scrollWidth || 0;
    var clientWidth = params.clientWidth || 0;
    var max = Math.max(0, scrollWidth - clientWidth);
    if (max <= 0) return { scrollLeft: 0, direction: ITEM_STRIP_INITIAL_DIRECTION };

    var direction = params.direction === -1 ? -1 : 1;
    var current = Math.min(max, Math.max(0, params.scrollLeft || 0));
    var elapsedMs = Math.max(0, params.elapsedMs || 0);
    var speed = Math.max(0, params.speedPxPerSec || 0);
    var distance = (speed * elapsedMs) / 1000;

    var next = current + direction * distance;
    if (next >= max) {
      next = max;
      direction = -1;
    } else if (next <= 0) {
      next = 0;
      direction = 1;
    }
    return { scrollLeft: next, direction: direction };
  }

  /* ---------------- search ---------------- */

  function normalizeSearchText(value) {
    return String(value == null ? '' : value).toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /** True when `query` is empty (matches everything) or is found as a
   * substring of any of `fields`, all case-insensitively. Used to search a
   * catalogue entry across its English and Russian names at once, so
   * switching the display language never makes the other language
   * unsearchable. */
  function matchesSearch(query, fields) {
    var q = normalizeSearchText(query);
    if (!q) return true;
    for (var i = 0; i < fields.length; i++) {
      if (normalizeSearchText(fields[i]).indexOf(q) !== -1) return true;
    }
    return false;
  }

  /** Filters `entries` by `query`, using `getFields(entry)` to produce the
   * array of searchable strings for each entry (typically `[name.en,
   * name.ru]`). Returns `entries` itself, unfiltered, for an empty query. */
  function filterEntries(entries, query, getFields) {
    var q = normalizeSearchText(query);
    if (!q) return entries.slice();
    return entries.filter(function (entry) { return matchesSearch(q, getFields(entry)); });
  }

  /** Searchable fields for one environment in the Session Prep picker: its
   * bilingual name plus, for every biome id it carries, the raw biome id
   * itself and its EN/RU localized label — read from the supplied i18n
   * dictionaries' `biome_<id>` keys (both languages at once, regardless of
   * which one is currently displayed), never a biome name hardcoded here.
   * `i18nEn`/`i18nRu` are plain `{ key: value }` dictionaries, e.g.
   * `state.i18n.en`/`state.i18n.ru` in js/app.js — this stays a pure
   * function of its arguments, with no access to application state itself.
   * See "Biome tagging" in CLAUDE.md for the fixed set of biome ids. */
  function environmentSearchFields(env, i18nEn, i18nRu) {
    var enDict = i18nEn || {};
    var ruDict = i18nRu || {};
    var biomeFields = (env.biomes || []).flatMap(function (id) {
      return [id, enDict['biome_' + id], ruDict['biome_' + id]];
    });
    return [env.name && env.name.en, env.name && env.name.ru].concat(biomeFields);
  }

  return {
    MAX_ENVIRONMENTS: MAX_ENVIRONMENTS,
    MIN_QUANTITY: MIN_QUANTITY,
    MAX_QUANTITY: MAX_QUANTITY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    DEFAULT_SESSION_ID: DEFAULT_SESSION_ID,
    ITEM_STRIP_INITIAL_DIRECTION: ITEM_STRIP_INITIAL_DIRECTION,
    computeAutoPanStep: computeAutoPanStep,
    createDefaultSession: createDefaultSession,
    createDefaultStore: createDefaultStore,
    getActiveSession: getActiveSession,
    withActiveSession: withActiveSession,
    normalizeIdList: normalizeIdList,
    toggleEnvironment: toggleEnvironment,
    removeEnvironment: removeEnvironment,
    setPrimaryEnvironment: setPrimaryEnvironment,
    clampQuantity: clampQuantity,
    toggleEntry: toggleEntry,
    removeEntry: removeEntry,
    setEntryQuantity: setEntryQuantity,
    incrementEntry: incrementEntry,
    decrementEntry: decrementEntry,
    countUnique: countUnique,
    countTotalQuantity: countTotalQuantity,
    normalizeSearchText: normalizeSearchText,
    matchesSearch: matchesSearch,
    filterEntries: filterEntries,
    environmentSearchFields: environmentSearchFields,
  };
});
