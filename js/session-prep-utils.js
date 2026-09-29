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

  /* ---------------- environment search (compact "All Environments" toolbar) ----------------
   * A single reusable normalizer feeds both sides of the match: the indexed
   * text built once per environment (below) and every raw query typed into
   * the search field. Lowercases, applies Unicode NFKC, folds ё -> е, and
   * replaces every run of punctuation/separators/hyphens/whitespace with one
   * space (trimmed) — so "Tier-1", "tier  1" and "Tier 1" all normalize
   * identically. No fuzzy matching or typo correction: this is deterministic
   * substring matching only. */
  function normalizeSearchToken(value) {
    var str = String(value == null ? '' : value);
    if (typeof str.normalize === 'function') str = str.normalize('NFKC');
    str = str.toLowerCase().replace(/ё/g, 'е');
    str = str.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    return str;
  }

  /** Splits a normalized query into AND-matched tokens. Empty for a blank
   * query, so callers can treat "no tokens" as "match everything" without a
   * separate empty check. */
  function tokenizeEnvironmentQuery(query) {
    var normalized = normalizeSearchToken(query);
    return normalized ? normalized.split(' ') : [];
  }

  /** The raw (unnormalized) fields one environment contributes to its
   * compact-toolbar search text: bilingual name, tier (as a bare number and
   * as every "tier N"/"rank N"/"ранг N" alias — see the Session Prep header
   * spec), canonical type + its EN/RU label, and every biome id it carries
   * plus its EN/RU label. `i18nEn`/`i18nRu` are plain `{ key: value }`
   * dictionaries (e.g. `state.i18n.en`/`state.i18n.ru` in js/app.js) — this
   * stays a pure function of its arguments, with no access to application
   * state itself. Lore, features, story seeds, source text, and adversaries
   * are deliberately excluded — see "Search Field" in the compact-header
   * spec for what this search covers and what it doesn't. See "Biome
   * tagging" in CLAUDE.md for the fixed set of biome ids. */
  function environmentIndexRawFields(env, i18nEn, i18nRu) {
    var enDict = i18nEn || {};
    var ruDict = i18nRu || {};
    var tier = env.tier;
    var tierFields = (tier === 0 || tier) ? [
      String(tier), 'tier ' + tier, 'rank ' + tier, 'ранг ' + tier,
    ] : [];
    var typeFields = env.type ? [env.type, enDict['type_' + env.type], ruDict['type_' + env.type]] : [];
    var biomeFields = (env.biomes || []).flatMap(function (id) {
      return [id, enDict['biome_' + id], ruDict['biome_' + id]];
    });
    return [env.name && env.name.en, env.name && env.name.ru].concat(tierFields, typeFields, biomeFields);
  }

  /** The precomputed, locale-independent search text for one environment —
   * every field above, normalized once and joined with spaces. */
  function buildEnvironmentSearchText(env, i18nEn, i18nRu) {
    return normalizeSearchToken(environmentIndexRawFields(env, i18nEn, i18nRu).filter(Boolean).join(' '));
  }

  /** One record per environment, keyed by id — built once when the catalogue
   * loads (or changes), never rebuilt per keystroke or per filter pass. See
   * "Precomputed Search Index" in the compact-header spec. */
  function buildEnvironmentSearchIndex(environments, i18nEn, i18nRu) {
    var index = new Map();
    (environments || []).forEach(function (env) {
      index.set(env.id, buildEnvironmentSearchText(env, i18nEn, i18nRu));
    });
    return index;
  }

  /** AND across tokens, OR across the fields already folded into `searchText`
   * — an empty token list (blank query) matches everything. */
  function matchesEnvironmentTokens(searchText, tokens) {
    if (!tokens || !tokens.length) return true;
    return tokens.every(function (token) { return searchText.indexOf(token) !== -1; });
  }

  /** The compact toolbar's full filter: a Tier multiselect (`options.tiers`,
   * OR within the set, no restriction when empty) ANDed with the tokenized
   * text query, matched against the precomputed `index`
   * (`buildEnvironmentSearchIndex()`). `options.tokens` lets a caller
   * tokenize once and reuse it (e.g. across a memoized filter pass);
   * otherwise it's derived from `options.search`. Never mutates
   * `environments`; ordering is preserved (no relevance sort). */
  function filterEnvironmentsByToolbar(environments, index, options) {
    var opts = options || {};
    var tiers = toSet(opts.tiers);
    var tokens = opts.tokens || tokenizeEnvironmentQuery(opts.search);
    var byIndex = index || new Map();
    return (environments || []).filter(function (env) {
      if (tiers.size && !tiers.has(env.tier)) return false;
      return matchesEnvironmentTokens(byIndex.get(env.id) || '', tokens);
    });
  }

  /* ---------------- adversary filters (Tier / Type) ---------------- */

  var ADVERSARY_TIERS = [1, 2, 3, 4];
  var ADVERSARY_TYPES = ['bruiser', 'horde', 'leader', 'minion', 'ranged', 'skulk', 'social', 'solo', 'standard', 'support'];

  function toSet(value) {
    if (value instanceof Set) return value;
    var s = new Set();
    (value || []).forEach(function (v) { s.add(v); });
    return s;
  }

  /* ---------------- adversary search (compact "All Adversaries" toolbar) ----------------
   * Same precomputed-index shape as the environment toolbar's own
   * buildEnvironmentSearchIndex()/filterEnvironmentsByToolbar() above (built
   * once, reused across every keystroke/filter pass), reusing that same
   * normalizeSearchToken()/tokenizeEnvironmentQuery()/matchesEnvironmentTokens()
   * machinery — none of it is actually environment-specific, it just
   * operates on a precomputed searchText string and a token list. Kept as a
   * separate index/builder rather than folding adversaries into the
   * environment one because the alias set a bare "1"/"tier1"/"t1"/"тир 1"
   * adversary query needs is richer than what the environment toolbar's own
   * "tier N"/"rank N"/"ранг N" aliases cover — see
   * adversaryTierAliasFields() below — and changing the environment
   * aliases to match would be an unrelated behavior change to that picker. */

  /** Every alias form a bare Tier query should hit for adversary search:
   * the bare digit, "tier N"/"tierN"/"tN" (English, spaced and unspaced),
   * "ранг N"/"рангN" (the RU UI's own word for Tier — see tier_label), and
   * "тир N"/"тирN" (a common RU transliteration of "tier", requested
   * separately from "ранг" in the search spec). Every literal form is
   * indexed as its own field rather than relying on suffix stripping, so a
   * query token only ever needs a plain substring match against the
   * precomputed searchText. */
  function adversaryTierAliasFields(tier) {
    return [
      String(tier),
      'tier ' + tier, 'tier' + tier, 't' + tier,
      'ранг ' + tier, 'ранг' + tier,
      'тир ' + tier, 'тир' + tier,
    ];
  }

  /** The raw (unnormalized) fields one adversary contributes to its
   * compact-toolbar search text: bilingual name, every Tier alias above,
   * the raw Type key, and its EN/RU Type label. `i18nEn`/`i18nRu` are plain
   * `{ key: value }` dictionaries (e.g. state.i18n.en/state.i18n.ru) —
   * stays a pure function of its arguments, no application state access. */
  function adversaryIndexRawFields(adv, i18nEn, i18nRu) {
    var enDict = i18nEn || {};
    var ruDict = i18nRu || {};
    var tier = adv.tier;
    var tierFields = (tier === 0 || tier) ? adversaryTierAliasFields(tier) : [];
    var typeFields = adv.type ? [adv.type, enDict['adversary_type_' + adv.type], ruDict['adversary_type_' + adv.type]] : [];
    return [adv.name && adv.name.en, adv.name && adv.name.ru].concat(tierFields, typeFields);
  }

  /** The precomputed, locale-independent search text for one adversary —
   * every field above, normalized once and joined with spaces. */
  function buildAdversarySearchText(adv, i18nEn, i18nRu) {
    return normalizeSearchToken(adversaryIndexRawFields(adv, i18nEn, i18nRu).filter(Boolean).join(' '));
  }

  /** One record per adversary, keyed by id — built once when the Session
   * Prep catalogue loads, never rebuilt per keystroke or per filter pass. */
  function buildAdversarySearchIndex(adversaries, i18nEn, i18nRu) {
    var index = new Map();
    (adversaries || []).forEach(function (adv) {
      index.set(adv.id, buildAdversarySearchText(adv, i18nEn, i18nRu));
    });
    return index;
  }

  /** The compact toolbar's full adversary filter: a Tier multiselect
   * (`options.tiers`, OR within the set) and a Type multiselect
   * (`options.types`, OR within the set) each AND the tokenized text query
   * (AND across tokens), matched against the precomputed `index`
   * (buildAdversarySearchIndex()). An empty Tier/Type group imposes no
   * restriction. Never mutates `adversaries`; ordering is preserved (no
   * relevance sort — the caller applies its own localized sort). */
  function filterAdversariesByToolbar(adversaries, index, options) {
    var opts = options || {};
    var tiers = toSet(opts.tiers);
    var types = toSet(opts.types);
    var tokens = opts.tokens || tokenizeEnvironmentQuery(opts.search);
    var byIndex = index || new Map();
    return (adversaries || []).filter(function (adv) {
      if (tiers.size && !tiers.has(adv.tier)) return false;
      if (types.size && !types.has(adv.type)) return false;
      return matchesEnvironmentTokens(byIndex.get(adv.id) || '', tokens);
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
    normalizeSearchToken: normalizeSearchToken,
    tokenizeEnvironmentQuery: tokenizeEnvironmentQuery,
    buildEnvironmentSearchText: buildEnvironmentSearchText,
    buildEnvironmentSearchIndex: buildEnvironmentSearchIndex,
    matchesEnvironmentTokens: matchesEnvironmentTokens,
    filterEnvironmentsByToolbar: filterEnvironmentsByToolbar,
    ADVERSARY_TIERS: ADVERSARY_TIERS,
    ADVERSARY_TYPES: ADVERSARY_TYPES,
    adversaryTierAliasFields: adversaryTierAliasFields,
    buildAdversarySearchText: buildAdversarySearchText,
    buildAdversarySearchIndex: buildAdversarySearchIndex,
    filterAdversariesByToolbar: filterAdversariesByToolbar,
    filterItems: filterItems,
  };
});
