/* ============================================================
   Bacchus's Atlas — prep-utils.js
   Pure, dependency-free helpers for the Prep page (#/prep):
   the default persisted shape, active-prep lookup, environment/adversary/
   item selection rules (the three-environment cap, toggle-on-select) and
   search-query normalization.

   Every selection — environment, adversary, item — is binary: selected or
   not. There is no primary environment and no quantity anywhere in this
   file; see the "Prep" sections in CLAUDE.md.

   No DOM, no application state, no i18n, no persistence — same shape as
   js/route-utils.js and js/list-utils.js, loaded as a plain <script> in the
   browser (before js/app.js, data-cache-version="ui") and required() as-is
   from a Node test (see tests/prep-utils.test.js).

   js/safe-storage.js validates a stored value's *shape* independently (its
   own sanitizePrep, mirroring sanitizeLists/sanitizeRegionEntry, and
   owns the v1->v2 schema migration) — this file is about the *rules* the UI
   applies while the page is open, not about recovering or upgrading a
   stored localStorage value.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PrepUtils = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_ENVIRONMENTS = 3;
  var SCHEMA_VERSION = 2;
  var DEFAULT_PREP_ID = 'default';

  /* ---------------- default shape ---------------- */

  function createDefaultPrep(id, now) {
    var timestamp = now || new Date().toISOString();
    return {
      id: id || DEFAULT_PREP_ID,
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
      activeSessionId: DEFAULT_PREP_ID,
      sessions: [createDefaultPrep(DEFAULT_PREP_ID, now)],
    };
  }

  /** The prep the UI operates on for this MVP. Never mutates `store`. */
  function getActivePrep(store) {
    if (!store || !Array.isArray(store.sessions)) return null;
    var found = null;
    for (var i = 0; i < store.sessions.length; i++) {
      if (store.sessions[i] && store.sessions[i].id === store.activeSessionId) { found = store.sessions[i]; break; }
    }
    return found || store.sessions[0] || null;
  }

  /** Replaces the active prep in `store` with `prep`, returning a new
   * store object. `store` and `prep` are never mutated in place. */
  function withActivePrep(store, prep) {
    var preps = store.sessions.map(function (s) { return s.id === prep.id ? prep : s; });
    return Object.assign({}, store, { sessions: preps });
  }

  /* ---------------- prep lifecycle (create / switch / duplicate / delete) ----------------
   * These are the pure, storage-shape half of Prep's multi-prep
   * lifecycle — id generation, timestamps, and the "never end up with zero
   * preps" guarantee are the caller's job (js/app.js), same division as
   * updatePrep() already draws for a same-prep edit: this
   * file decides what the resulting `preps`/`activeSessionId` look like,
   * never how an id or a timestamp is produced. */

  /** Appends `prep` (built by the caller, e.g. via createDefaultPrep())
   * and makes it the active prep. Used for both "new prep" and
   * "duplicate prep" — the caller decides `prep`'s starting fields,
   * this just handles the store-level append + activate. Never mutates
   * `store` or its `preps` array. */
  function addPrep(store, prep) {
    return Object.assign({}, store, {
      sessions: store.sessions.concat([prep]),
      activeSessionId: prep.id,
    });
  }

  /** Switches the active prep to `prepId`. A no-op (returns `store`
   * itself, not a copy) when `prepId` doesn't match any prep in the
   * store, so a caller can tell "nothing changed" apart from "switched" by
   * identity comparison. */
  function setActivePrep(store, prepId) {
    if (!store || !Array.isArray(store.sessions)) return store;
    if (store.activeSessionId === prepId) return store;
    var exists = store.sessions.some(function (s) { return s.id === prepId; });
    if (!exists) return store;
    return Object.assign({}, store, { activeSessionId: prepId });
  }

  /** Removes the prep `prepId` from `store`. If it was the active
   * prep, activates the next prep in list order, falling back to the
   * previous one for the last entry — never leaves `activeSessionId`
   * pointing at a prep that no longer exists. Deliberately allows the
   * result to end up with an empty `preps` array (deleting the only
   * remaining prep): guaranteeing at least one prep always exists
   * again afterward is the caller's job (see js/app.js's
   * deletePrep()), the same way this file never invents an id
   * or timestamp for a prep it creates. A no-op (returns `store` itself)
   * when `prepId` isn't found. */
  function removePrep(store, prepId) {
    if (!store || !Array.isArray(store.sessions)) return store;
    var idx = -1;
    for (var i = 0; i < store.sessions.length; i++) {
      if (store.sessions[i] && store.sessions[i].id === prepId) { idx = i; break; }
    }
    if (idx === -1) return store;
    var remaining = store.sessions.slice(0, idx).concat(store.sessions.slice(idx + 1));
    if (store.activeSessionId !== prepId) {
      return Object.assign({}, store, { sessions: remaining });
    }
    var replacement = remaining.length ? (store.sessions[idx + 1] || store.sessions[idx - 1]) : null;
    return Object.assign({}, store, {
      sessions: remaining,
      activeSessionId: replacement ? replacement.id : null,
    });
  }

  /* ---------------- prep title ---------------- */

  /** Resolves a raw title edit to what should actually be stored: trims
   * surrounding whitespace, and falls back to `fallback` (the caller's
   * localized default prep name) when that leaves nothing — a prep
   * title is never persisted as empty/whitespace-only. Mirrors
   * ListUtils.resolveListRename()'s trim-and-decide role for list renames,
   * but a Prep title has no "invalid" case of its own to reject: any
   * non-empty trimmed value is accepted as-is, duplicates included. */
  function resolvePrepTitle(rawValue, fallback) {
    var trimmed = String(rawValue == null ? '' : rawValue).trim();
    return trimmed || fallback;
  }

  /** Resolves an inline rename attempt (the Prep Bar's pencil / Rename
   * menu item) against the title the bar currently shows. Unlike
   * resolvePrepTitle() above — which substitutes the localized default for
   * an empty value — an empty rename here is rejected outright so the caller
   * restores the previous name instead of silently overwriting it with the
   * placeholder. Same status vocabulary as ListUtils.resolveListRename():
   * 'invalid' (trims to nothing; `value` is `currentTitle`), 'unchanged'
   * (trims to exactly `currentTitle`), 'changed' (`value` is the trimmed new
   * title, clamped to `maxLength`). `currentTitle` is the *displayed* title,
   * so a prep whose stored title is still '' (showing the placeholder)
   * compares equal to that placeholder rather than persisting it. */
  function resolvePrepRename(currentTitle, rawValue, maxLength) {
    var trimmed = String(rawValue == null ? '' : rawValue).trim();
    if (!trimmed) return { status: 'invalid', value: currentTitle };
    if (typeof maxLength === 'number' && trimmed.length > maxLength) trimmed = trimmed.slice(0, maxLength).trim();
    if (trimmed === currentTitle) return { status: 'unchanged', value: currentTitle };
    return { status: 'changed', value: trimmed };
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
   * at the cap -> rejected, `prep` returned unchanged alongside
   * `limitReached: true` so the caller can show the localized explanation
   * without mutating anything. No primary-environment concept — order is
   * preserved but carries no special meaning. */
  function toggleEnvironment(prep, envId) {
    if (prep.environmentIds.indexOf(envId) !== -1) return removeEnvironment(prep, envId);
    if (prep.environmentIds.length >= MAX_ENVIRONMENTS) {
      return { prep: prep, changed: false, limitReached: true };
    }
    return {
      prep: Object.assign({}, prep, { environmentIds: toggleId(prep.environmentIds, envId) }),
      changed: true,
      limitReached: false,
    };
  }

  /** Explicit removal — the central list's Remove button, or an unchecked
   * source checkbox. Always removes, never reports a limit. */
  function removeEnvironment(prep, envId) {
    return {
      prep: Object.assign({}, prep, { environmentIds: removeId(prep.environmentIds, envId) }),
      changed: true,
      limitReached: false,
    };
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
   * as every "tier N"/"rank N"/"ранг N" alias — see the Prep header
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

  /** One record per adversary, keyed by id — built once when the Prep
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

  /* ---------------- display sort (pickers + central lists) ----------------
   * The Prep environment/adversary tables (both the "All
   * Environments"/"All Adversaries" pickers and the central Selected lists)
   * share one order: Tier ascending (1 -> 4) first, then alphabetically by
   * the caller's already-localized name. Locale-aware name comparison
   * (Intl.Collator) lives in js/app.js, not here — this file stays free of
   * any i18n/Intl dependency, so `compareNames(a, b)` is injected the same
   * way filterEntries() injects `getFields`. Never mutates `entries`. */
  function sortByTierThenName(entries, getTier, compareNames) {
    return (entries || []).slice().sort(function (a, b) {
      var diff = getTier(a) - getTier(b);
      return diff !== 0 ? diff : compareNames(a, b);
    });
  }

  /** Book source rank for the Items table sort below: 'core' before 'hnf',
   * anything else (there is no third source today) sorts after both rather
   * than throwing. */
  function itemSourceRank(src) {
    if (src === 'core') return 0;
    if (src === 'hnf') return 1;
    return 2;
  }

  /** Item Kind rank for the same sort: plain items before consumables. */
  function itemKindRank(kind) {
    return kind === 'consumable' ? 1 : 0;
  }

  /** The Items table's own sort order (deliberately different from
   * sortByTierThenName() above — items carry no Tier): book roll number
   * ascending (1 -> 99) first, then book Source (core -> Hope and Fear),
   * then Kind (item -> consumable), then alphabetically by the caller's
   * already-localized name. `compareNames(a, b)` is injected for the same
   * reason as sortByTierThenName(). Never mutates `items`. */
  function sortItemsForPrep(items, compareNames) {
    return (items || []).slice().sort(function (a, b) {
      if (a.roll !== b.roll) return a.roll - b.roll;
      var sourceDiff = itemSourceRank(a.src) - itemSourceRank(b.src);
      if (sourceDiff !== 0) return sourceDiff;
      var kindDiff = itemKindRank(a.kind) - itemKindRank(b.kind);
      if (kindDiff !== 0) return kindDiff;
      return compareNames(a, b);
    });
  }

  /* ---------------- item search + filters (compact "All Items" toolbar) ----------------
   * Reuses the same precomputed-index + normalizeSearchToken()/
   * tokenizeEnvironmentQuery()/matchesEnvironmentTokens() machinery the
   * environment/adversary toolbars above already established — none of it
   * is actually environment-specific. The one genuinely new piece is
   * numeric/range extraction (an exact book roll number, "#30", "1-10",
   * a reversed range): it has to run on a *lightly* normalized copy of
   * the raw query — case-folded and with every Unicode dash variant
   * collapsed to a plain "-" — before normalizeSearchToken() gets a
   * chance to erase that dash into a bare space, which would make "1-10"
   * and "1 10" indistinguishable by the time a range regex saw it. */

  var ITEM_KIND_ALIASES = {
    item: ['item', 'items', 'предмет', 'предметы'],
    consumable: ['consumable', 'consumables', 'расходник', 'расходники'],
  };
  var ITEM_SOURCE_ALIASES = {
    core: ['core'],
    hnf: ['hope and fear', 'hope & fear'],
  };

  /** The raw (unnormalized) fields one item contributes to its
   * compact-toolbar search text: bilingual name plus every EN/RU alias
   * word for its own Kind and Source. `item.kind`/`item.src` are always
   * one of the fixed keys above, so — unlike the environment/adversary
   * indexes — this never needs an i18n dictionary; the alias lists above
   * already are the localized vocabulary. */
  function itemIndexRawFields(item) {
    var kindAliases = ITEM_KIND_ALIASES[item.kind] || [];
    var srcAliases = ITEM_SOURCE_ALIASES[item.src] || [];
    return [item.en && item.en.name, item.ru && item.ru.name].concat(kindAliases, srcAliases);
  }

  /** The precomputed, locale-independent search text for one item — every
   * field above, normalized once (through the same normalizeSearchToken()
   * the environment/adversary toolbars use) and joined with spaces. */
  function buildItemSearchText(item) {
    return normalizeSearchToken(itemIndexRawFields(item).filter(Boolean).join(' '));
  }

  /** One record per item, keyed by id — built once when the Prep
   * catalogue loads, never rebuilt per keystroke or per filter pass. */
  function buildItemSearchIndex(items) {
    var index = new Map();
    (items || []).forEach(function (item) { index.set(item.id, buildItemSearchText(item)); });
    return index;
  }

  /** Collapses only case and Unicode dash variants — deliberately not the
   * full normalizeSearchToken() punctuation strip, which would erase the
   * "-" a range query needs before extractItemNumberCriteria() below ever
   * sees it. */
  function lightlyNormalizeItemQuery(value) {
    var str = String(value == null ? '' : value);
    if (typeof str.normalize === 'function') str = str.normalize('NFKC');
    return str.toLowerCase().replace(/[\u2010-\u2015\u2212]/g, '-');
  }

  /** Pulls every numeric/range criterion out of a raw item-browser query,
   * returning what's left (`rest`) for keyword tokenizing. A range
   * ("1-10", "#1-10", "1 - 10", any Unicode dash) is captured as
   * `[lo, hi]`, swapped into ascending order when typed reversed
   * ("10-1"); a bare or "#"-prefixed number left standing alone afterward
   * is an exact criterion. Never throws on malformed input ("1-",
   * "abc-def") — every step is a regex replace against an
   * already-matched run of digits, never an unguarded parseInt. */
  function extractItemNumberCriteria(rawQuery) {
    var exacts = [];
    var ranges = [];
    var working = lightlyNormalizeItemQuery(rawQuery);
    working = working.replace(/#?(\d+)\s*-\s*(\d+)/g, function (match, a, b) {
      var lo = Number(a), hi = Number(b);
      ranges.push(lo <= hi ? [lo, hi] : [hi, lo]);
      return ' ';
    });
    working = working.replace(/#(\d+)/g, function (match, a) {
      exacts.push(Number(a));
      return ' ';
    });
    working = working.replace(/\b(\d+)\b/g, function (match, a) {
      exacts.push(Number(a));
      return ' ';
    });
    return { exacts: exacts, ranges: ranges, rest: working };
  }

  /** True when `roll` satisfies the numeric half of a parsed query: no
   * numeric criteria at all imposes no restriction; otherwise `roll` must
   * equal one of the exact numbers or fall inside one of the ranges — OR
   * within the numeric group, the same convention every other multiselect
   * filter in this file already uses. */
  function itemNumberCriteriaMatches(criteria, roll) {
    if (!criteria.exacts.length && !criteria.ranges.length) return true;
    if (criteria.exacts.indexOf(roll) !== -1) return true;
    return criteria.ranges.some(function (range) { return roll >= range[0] && roll <= range[1]; });
  }

  /** The compact toolbar's full item filter: a Kind multiselect
   * (`options.types`, values 'item'/'consumable', OR within the set), a
   * Source multiselect (`options.sources`, values 'core'/'hnf', OR within
   * the set), an active dice-roll filter (`options.rollTotal`, exact
   * `item.roll` equality), and the search query — itself split into
   * numeric/range criteria (OR within that group) ANDed with whatever
   * keyword text remains (tokenized via tokenizeEnvironmentQuery(),
   * matched via matchesEnvironmentTokens() against the precomputed
   * `haystackIndex`, AND across tokens) — every group ANDs with every
   * other. An empty Kind/Source group or a `null` `rollTotal` imposes no
   * restriction of its own. Never mutates `items`; ordering is
   * preserved — the caller still applies its own sort
   * (sortItemsForPrep()) afterward, same as filterAdversariesByToolbar()
   * leaves sorting to its own caller. */
  function filterItemsByToolbar(items, haystackIndex, options) {
    var opts = options || {};
    var types = toSet(opts.types);
    var sources = toSet(opts.sources);
    var criteria = extractItemNumberCriteria(opts.search);
    var tokens = tokenizeEnvironmentQuery(criteria.rest);
    var byIndex = haystackIndex || new Map();
    var rollTotal = opts.rollTotal == null ? null : opts.rollTotal;
    return (items || []).filter(function (item) {
      if (types.size && !types.has(item.kind)) return false;
      if (sources.size && !sources.has(item.src)) return false;
      if (rollTotal != null && item.roll !== rollTotal) return false;
      if (!itemNumberCriteriaMatches(criteria, item.roll)) return false;
      return matchesEnvironmentTokens(byIndex.get(item.id) || '', tokens);
    });
  }

  /** Sum of `diceCount` independent 1-12 draws — the item browser's dice
   * roll-and-filter buttons. `randomFn` defaults to Math.random and is
   * injectable so a caller (a test) can supply a deterministic sequence
   * without monkeypatching the global. */
  function rollNd12(diceCount, randomFn) {
    var rf = randomFn || Math.random;
    var total = 0;
    for (var i = 0; i < diceCount; i++) total += 1 + Math.floor(rf() * 12);
    return total;
  }

  return {
    MAX_ENVIRONMENTS: MAX_ENVIRONMENTS,
    SCHEMA_VERSION: SCHEMA_VERSION,
    DEFAULT_PREP_ID: DEFAULT_PREP_ID,
    createDefaultPrep: createDefaultPrep,
    createDefaultStore: createDefaultStore,
    getActivePrep: getActivePrep,
    withActivePrep: withActivePrep,
    addPrep: addPrep,
    setActivePrep: setActivePrep,
    removePrep: removePrep,
    resolvePrepTitle: resolvePrepTitle,
    resolvePrepRename: resolvePrepRename,
    normalizeIdList: normalizeIdList,
    toggleId: toggleId,
    removeId: removeId,
    toggleEnvironment: toggleEnvironment,
    removeEnvironment: removeEnvironment,
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
    sortByTierThenName: sortByTierThenName,
    itemSourceRank: itemSourceRank,
    itemKindRank: itemKindRank,
    sortItemsForPrep: sortItemsForPrep,
    ITEM_KIND_ALIASES: ITEM_KIND_ALIASES,
    ITEM_SOURCE_ALIASES: ITEM_SOURCE_ALIASES,
    buildItemSearchText: buildItemSearchText,
    buildItemSearchIndex: buildItemSearchIndex,
    extractItemNumberCriteria: extractItemNumberCriteria,
    itemNumberCriteriaMatches: itemNumberCriteriaMatches,
    filterItemsByToolbar: filterItemsByToolbar,
    rollNd12: rollNd12,
  };
});
