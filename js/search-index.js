/* ============================================================
   Bacchus's Atlas — search-index.js
   Precomputed environment search text and the alias-search rules that
   match against it. Environment data is read-only for the life of the
   page, so the searchable text derived from it — feature names, lore,
   rawText, and the rest of the fields listed in the "Environment search
   index" section of CLAUDE.md — is built once per environment rather
   than rebuilt on every filter pass.

   Dependency-free on purpose: no reference to window/document/state, so
   it can be loaded as a plain <script> in the browser and required() as-is
   from a Node test (see tests/search-index.test.js), the same shape as
   js/route-utils.js.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SearchIndex = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* A group holds names for one and the same place, nothing looser. Everything a
   * wider reading used to sweep in has been taken back out:
   * - the person standing in the place ("торгов"/"merchant" matched 21 of 188
   *   environments, nearly all of them a feast or a casino that merely lists a
   *   Merchant among its adversaries; likewise innkeeper, bartender, barkeep),
   * - the thing kept inside it ("книг"/"book" put Лаборатория, Магическая буря
   *   and Оживлённый рынок under "библиотека"; "алтар"/"altar" put Туманная
   *   Пустошь under "храм"),
   * - a neighbouring but different place — a market is not a shop, a cave is not
   *   a dungeon, a crypt is not a graveyard, so those now sit in groups of their
   *   own,
   * - a word the data only ever uses in another sense ("store" appears solely as
   *   the verb, "store that roll"),
   * - a synonym the data never uses at all, which only lengthens the table. */
  const SEARCH_ALIASES = [
    ['магазин', 'лавк', 'shop'],
    ['рынок', 'базар', 'market'],
    ['таверн', 'трактир', 'кабак', 'tavern'],
    ['кладбищ', 'погост', 'graveyard', 'cemetery'],
    ['склеп', 'гробниц', 'tomb', 'crypt'],
    ['храм', 'церк', 'temple', 'church'],
    ['пещер', 'cave', 'cavern'],
    ['библиотек', 'library'],
  ];

  // Below this length a query is too generic to expand — "ба" would otherwise
  // pull in the whole tavern group.
  const MIN_ALIAS_QUERY = 3;

  const aliasRegexCache = new Map();

  function wordStartRegex(term) {
    let re = aliasRegexCache.get(term);
    if (!re) {
      re = new RegExp('(^|[^\\p{L}\\p{N}])' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu');
      aliasRegexCache.set(term, re);
    }
    return re;
  }

  // A query expands only as a whole: it must be a prefix of a group term (user
  // typed a stem, "таверн") or start with one (user typed an inflection,
  // "таверной"). Multi-word queries stay literal — someone narrowing to
  // "магазин товаров" wants fewer results than "магазин", not the whole group.
  function aliasTermsFor(query) {
    if (query.length < MIN_ALIAS_QUERY || /\s/.test(query)) return [];
    const terms = new Set();
    for (const group of SEARCH_ALIASES) {
      if (!group.some(term => term.startsWith(query) || query.startsWith(term))) continue;
      for (const term of group) terms.add(term);
    }
    return [...terms];
  }

  /**
   * Builds the compact search record for one environment: an alias-eligible
   * haystack (name, impulses, every feature's name/description/prompt,
   * rawText, lore — in that order, EN then RU per field) and a literal-only
   * haystack that also carries potential_adversaries. Potential adversaries
   * are deliberately excluded from aliasText: a roster of stock NPCs says
   * nothing about what the place is, so an alias for "market" must not match
   * an unrelated environment merely because it lists a Merchant. Typing an
   * adversary's name outright still finds it, through literalText.
   */
  function buildEnvironmentSearchRecord(env) {
    const featureText = (env.features || []).flatMap(feat => [
      feat.name?.en, feat.name?.ru, feat.description?.en, feat.description?.ru, feat.prompt?.en, feat.prompt?.ru,
    ]);
    const rawText = env.rawText ? [env.rawText.en, env.rawText.ru] : [];
    const loreText = env.lore ? [env.lore.en, env.lore.ru] : [];
    const adversaries = env.potential_adversaries
      ? [...(env.potential_adversaries.en || []), ...(env.potential_adversaries.ru || [])]
      : [];
    const aliasText = [
      env.name.en, env.name.ru,
      ...(env.impulses ? [...(env.impulses.en || []), ...(env.impulses.ru || [])] : []),
      ...featureText, ...rawText, ...loreText,
    ].filter(Boolean).join(' ').toLowerCase();
    const literalText = adversaries.length
      ? aliasText + ' ' + adversaries.join(' ').toLowerCase()
      : aliasText;
    return { aliasText, literalText };
  }

  /** One record per environment, keyed by id — a plain Map, built once. */
  function buildEnvironmentSearchIndex(environments) {
    const index = new Map();
    for (const env of environments) index.set(env.id, buildEnvironmentSearchRecord(env));
    return index;
  }

  /**
   * Normalizes and alias-expands a raw query once per filtering pass, not
   * once per environment. `aliasMatchers` are the compiled, cached
   * word-start regexes for whatever alias terms apply — never recompiled
   * per environment, never built from the raw user query itself.
   */
  function prepareSearchQuery(rawQuery) {
    const normalized = (rawQuery || '').trim().toLowerCase();
    if (!normalized) return { normalized: '', empty: true, aliasTerms: [], aliasMatchers: [] };
    const aliasTerms = aliasTermsFor(normalized);
    return {
      normalized,
      empty: false,
      aliasTerms,
      aliasMatchers: aliasTerms.map(wordStartRegex),
    };
  }

  // Literal substring first, so every match that worked before still works; the
  // alias pass only ever widens the result set, and only against aliasText —
  // never literalText's adversary tail.
  function matches(record, preparedQuery) {
    if (!record) return false;
    if (preparedQuery.empty) return true;
    if (record.literalText.includes(preparedQuery.normalized)) return true;
    return preparedQuery.aliasMatchers.some(re => re.test(record.aliasText));
  }

  return {
    SEARCH_ALIASES: SEARCH_ALIASES,
    MIN_ALIAS_QUERY: MIN_ALIAS_QUERY,
    wordStartRegex: wordStartRegex,
    aliasTermsFor: aliasTermsFor,
    buildEnvironmentSearchRecord: buildEnvironmentSearchRecord,
    buildEnvironmentSearchIndex: buildEnvironmentSearchIndex,
    prepareSearchQuery: prepareSearchQuery,
    matches: matches,
  };
});
