/* ============================================================
   Bacchus's Atlas — session-prep-utils.js
   Pure, dependency-free helpers for the Session Prep page (#/session-prep):
   the default persisted shape, active-session lookup, environment/adversary/
   item selection rules (the three-environment cap, toggle-on-select) and
   search-query normalization.

   Every selection — environment, adversary, item — is binary: selected or
   not. There is no primary environment and no quantity anywhere in this
   file; see the "Session Prep" sections in CLAUDE.md.

   No DOM, no application state, no i18n, no persistence — same shape as
   js/route-utils.js and js/list-utils.js, loaded as a plain <script> in the
   browser (before js/app.js, data-cache-version="ui") and required() as-is
   from a Node test (see tests/session-prep-utils.test.js).

   js/safe-storage.js validates a stored value's *shape* independently (its
   own sanitizeSessionPrep, mirroring sanitizeLists/sanitizeRegionEntry, and
   owns the v1->v2 schema migration) — this file is about the *rules* the UI
   applies while the page is open, not about recovering or upgrading a
   stored localStorage value.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SessionPrepUtils = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_ENVIRONMENTS = 3;
  var SCHEMA_VERSION = 2;
  var DEFAULT_SESSION_ID = 'default';

  /* ---------------- default shape ---------------- */

  function createDefaultSession(id, now) {
    var timestamp = now || new Date().toISOString();
    return {
      id: id || DEFAULT_SESSION_ID,
      title: '',
      createdAt: timestamp,
      updatedAt: timestamp,
      environmentIds: [],
      adversaryIds: [],
      itemIds: [],
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

  /* ---------------- session lifecycle (create / switch / duplicate / delete) ----------------
   * These are the pure, storage-shape half of Session Prep's multi-session
   * lifecycle — id generation, timestamps, and the "never end up with zero
   * sessions" guarantee are the caller's job (js/app.js), same division as
   * updateSessionPrepSession() already draws for a same-session edit: this
   * file decides what the resulting `sessions`/`activeSessionId` look like,
   * never how an id or a timestamp is produced. */

  /** Appends `session` (built by the caller, e.g. via createDefaultSession())
   * and makes it the active session. Used for both "new session" and
   * "duplicate session" — the caller decides `session`'s starting fields,
   * this just handles the store-level append + activate. Never mutates
   * `store` or its `sessions` array. */
  function addSession(store, session) {
    return Object.assign({}, store, {
      sessions: store.sessions.concat([session]),
      activeSessionId: session.id,
    });
  }

  /** Switches the active session to `sessionId`. A no-op (returns `store`
   * itself, not a copy) when `sessionId` doesn't match any session in the
   * store, so a caller can tell "nothing changed" apart from "switched" by
   * identity comparison. */
  function setActiveSession(store, sessionId) {
    if (!store || !Array.isArray(store.sessions)) return store;
    if (store.activeSessionId === sessionId) return store;
    var exists = store.sessions.some(function (s) { return s.id === sessionId; });
    if (!exists) return store;
    return Object.assign({}, store, { activeSessionId: sessionId });
  }

  /** Removes the session `sessionId` from `store`. If it was the active
   * session, activates the next session in list order, falling back to the
   * previous one for the last entry — never leaves `activeSessionId`
   * pointing at a session that no longer exists. Deliberately allows the
   * result to end up with an empty `sessions` array (deleting the only
   * remaining session): guaranteeing at least one session always exists
   * again afterward is the caller's job (see js/app.js's
   * deleteSessionPrepSession()), the same way this file never invents an id
   * or timestamp for a session it creates. A no-op (returns `store` itself)
   * when `sessionId` isn't found. */
  function removeSession(store, sessionId) {
    if (!store || !Array.isArray(store.sessions)) return store;
    var idx = -1;
    for (var i = 0; i < store.sessions.length; i++) {
      if (store.sessions[i] && store.sessions[i].id === sessionId) { idx = i; break; }
    }
    if (idx === -1) return store;
    var remaining = store.sessions.slice(0, idx).concat(store.sessions.slice(idx + 1));
    if (store.activeSessionId !== sessionId) {
      return Object.assign({}, store, { sessions: remaining });
    }
    var replacement = remaining.length ? (store.sessions[idx + 1] || store.sessions[idx - 1]) : null;
    return Object.assign({}, store, {
      sessions: remaining,
      activeSessionId: replacement ? replacement.id : null,
    });
  }

  /* ---------------- session title ---------------- */

  /** Resolves a raw title edit to what should actually be stored: trims
   * surrounding whitespace, and falls back to `fallback` (the caller's
   * localized default session name) when that leaves nothing — a session
   * title is never persisted as empty/whitespace-only. Mirrors
   * ListUtils.resolveListRename()'s trim-and-decide role for list renames,
   * but a Session Prep title has no "invalid" case of its own to reject: any
   * non-empty trimmed value is accepted as-is, duplicates included. */
  function resolveSessionTitle(rawValue, fallback) {
    var trimmed = String(rawValue == null ? '' : rawValue).trim();
    return trimmed || fallback;
  }

  /* ---------------- id-list normalization ---------------- */

  /** Drops duplicates, keeping the first occurrence's position. Used for
   * environment/adversary/item id lists alike — plain arrays of strings,
   * nothing more. */
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

  /** Checkbox semantics for a plain id array: absent -> add; present ->
   * remove. Generic — used for environments, adversaries, and items alike.
   * Never mutates `ids`. */
  function toggleId(ids, id) {
    return ids.indexOf(id) === -1 ? ids.concat([id]) : ids.filter(function (x) { return x !== id; });
  }

  /** Explicit removal (the central list's Remove button, or an unchecked
   * source checkbox) — always removes. Never mutates `ids`. */
  function removeId(ids, id) {
    return ids.filter(function (x) { return x !== id; });
  }

  /* ---------------- environments ---------------- */

  /** Checkbox semantics: absent + room -> add; present -> remove; absent +
   * at the cap -> rejected, `session` returned unchanged alongside
   * `limitReached: true` so the caller can show the localized explanation
   * without mutating anything. No primary-environment concept — order is
   * preserved but carries no special meaning. */
  function toggleEnvironment(session, envId) {
    if (session.environmentIds.indexOf(envId) !== -1) return removeEnvironment(session, envId);
    if (session.environmentIds.length >= MAX_ENVIRONMENTS) {
      return { session: session, changed: false, limitReached: true };
    }
    return {
      session: Object.assign({}, session, { environmentIds: toggleId(session.environmentIds, envId) }),
      changed: true,
      limitReached: false,
    };
  }

  /** Explicit removal — the central list's Remove button, or an unchecked
   * source checkbox. Always removes, never reports a limit. */
  function removeEnvironment(session, envId) {
    return {
      session: Object.assign({}, session, { environmentIds: removeId(session.environmentIds, envId) }),
      changed: true,
      limitReached: false,
    };
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

  /** True when `query` is a plain, non-empty run of digits ("3", "28") with
   * no other characters. Used to tell a numeric item search apart from a
   * name search sharing the same input. */
  function isNumericQuery(query) {
    return /^\d+$/.test(query);
  }

  /** Item search: substring match against `fields` (name.en/name.ru), like
   * matchesSearch(), OR — for a purely numeric query — an exact match
   * against the item's book roll number. Exact, not substring: "have this
   * number as their number in the book" means equality, so searching "1"
   * must not also pull in every item numbered 10-19/21/31/etc. */
  function matchesItemSearch(query, fields, roll) {
    var q = normalizeSearchText(query);
    if (!q) return true;
    if (matchesSearch(q, fields)) return true;
    return isNumericQuery(q) && roll != null && String(roll) === q;
  }

  /** Filters `items` by `query`, matching by name (`getFields`) or, for a
   * numeric query, by exact book roll number (`getRoll`). Same empty-query
   * contract as filterEntries(): returns `items` itself, unfiltered. */
  function filterItemEntries(items, query, getFields, getRoll) {
    var q = normalizeSearchText(query);
    if (!q) return items.slice();
    return items.filter(function (item) { return matchesItemSearch(q, getFields(item), getRoll(item)); });
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

  /* ---------------- adversary filters (Tier / Type / Selected only) ---------------- */

  var ADVERSARY_TIERS = [1, 2, 3, 4];
  var ADVERSARY_TYPES = ['bruiser', 'horde', 'leader', 'minion', 'ranged', 'skulk', 'social', 'solo', 'standard', 'support'];

  function toSet(value) {
    if (value instanceof Set) return value;
    var s = new Set();
    (value || []).forEach(function (v) { s.add(v); });
    return s;
  }

  /** Filters the full adversary catalogue by every active Session Prep
   * filter at once: free-text search (name.en/name.ru, see filterEntries()),
   * a Tier multiselect (`options.tiers`, values OR together, empty = no
   * restriction), a Type multiselect (`options.types`, same OR/empty rule),
   * and "Selected only" (`options.selectedOnly` + `options.selectedIds`) —
   * every group ANDs with the others, so an entirely empty filter set
   * returns the full, unfiltered catalogue. Never mutates `adversaries` or
   * `options`; a filtered-out entry is simply absent from the result, never
   * flagged as unselected. */
  function filterAdversaries(adversaries, options) {
    var opts = options || {};
    var tiers = toSet(opts.tiers);
    var types = toSet(opts.types);
    var selectedOnly = !!opts.selectedOnly;
    var selectedIds = toSet(opts.selectedIds);
    var bySearch = filterEntries(adversaries, opts.search, function (a) {
      return [a.name && a.name.en, a.name && a.name.ru];
    });
    return bySearch.filter(function (adv) {
      if (tiers.size && !tiers.has(adv.tier)) return false;
      if (types.size && !types.has(adv.type)) return false;
      if (selectedOnly && !selectedIds.has(adv.id)) return false;
      return true;
    });
  }

  /* ---------------- item filters (Category / Source) ---------------- */

  /** Filters Session Prep's item/consumable catalogue by category
   * (`options.category`: 'item' | 'consumable' | falsy for no restriction),
   * source (`options.source`: 'core' | 'hnf' | 'all'/falsy for no
   * restriction), and free-text-or-exact-roll search (see
   * matchesItemSearch()/filterItemEntries()) — every group ANDs with the
   * others. `getFields`/`getRoll` mirror filterItemEntries()'s own contract
   * (typically `i => [i.en?.name, i.ru?.name]` / `i => i.roll`). Never
   * mutates `items`. */
  function filterItems(items, options, getFields, getRoll) {
    var opts = options || {};
    var category = opts.category || null;
    var source = opts.source && opts.source !== 'all' ? opts.source : null;
    var bySearch = filterItemEntries(items, opts.search, getFields, getRoll);
    return bySearch.filter(function (item) {
      if (category && item.kind !== category) return false;
      if (source && item.src !== source) return false;
      return true;
    });
  }

  return {
    MAX_ENVIRONMENTS: MAX_ENVIRONMENTS,
    SCHEMA_VERSION: SCHEMA_VERSION,
    DEFAULT_SESSION_ID: DEFAULT_SESSION_ID,
    createDefaultSession: createDefaultSession,
    createDefaultStore: createDefaultStore,
    getActiveSession: getActiveSession,
    withActiveSession: withActiveSession,
    addSession: addSession,
    setActiveSession: setActiveSession,
    removeSession: removeSession,
    resolveSessionTitle: resolveSessionTitle,
    normalizeIdList: normalizeIdList,
    toggleId: toggleId,
    removeId: removeId,
    toggleEnvironment: toggleEnvironment,
    removeEnvironment: removeEnvironment,
    normalizeSearchText: normalizeSearchText,
    matchesSearch: matchesSearch,
    filterEntries: filterEntries,
    isNumericQuery: isNumericQuery,
    matchesItemSearch: matchesItemSearch,
    filterItemEntries: filterItemEntries,
    environmentSearchFields: environmentSearchFields,
    ADVERSARY_TIERS: ADVERSARY_TIERS,
    ADVERSARY_TYPES: ADVERSARY_TYPES,
    filterAdversaries: filterAdversaries,
    filterItems: filterItems,
  };
});
