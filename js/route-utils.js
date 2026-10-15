/* ============================================================
   Bacchus's Atlas — route-utils.js
   Pure, dependency-free hash-route parsing and canonicalization.
   Loaded before js/app.js so that the one place location.hash is
   turned into a route object never has to trust it: a malformed
   percent-encoded segment (a truncated %-escape, an invalid UTF-8
   byte sequence) must never throw and must never stop startup or a
   hashchange handler. See the "Hash routing" section in CLAUDE.md.

   Dependency-free on purpose: no reference to window/document/state,
   so it can be loaded as a plain <script> in the browser and
   required() as-is from a Node test (see tests/routing.test.js), the
   same shape as js/safe-storage.js.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.RouteUtils = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ENV_SUFFIX_PATTERN = /\/env\/([^/]+)$/;
  const LEGACY_PREP_HASH = '#/session-prep';
  const LEGACY_JOURNEY2_HASH = '#/journey2';
  const LIST_ID_PATTERN = /^#\/lists\/(.+)$/;
  // The shareable player map (PD-052): the whole snapshot rides in the fragment, `#/map/<payload>`. No environment overlay can sit on it.
  const PLAYER_MAP_PATTERN = /^#\/map\/(.*)$/;
  // The catalogue's filters (PD-068): `#/?q=…&tier=1&tier=2&type=social&biome=forest&src=…`. Repeated keys, not a comma list, because source names contain commas.
  const CATALOG_QUERY_PATTERN = /^#\/?\?(.*)$/;
  const CATALOG_QUERY_MAX_LENGTH = 1000;   // a longer query is ignored whole, so a hostile link cannot make the parser (or the address bar) do unbounded work
  const SEARCH_MAX_LENGTH = 200;
  const MAX_VALUES_PER_GROUP = 40;

  /**
   * Decodes one untrusted, percent-encoded route segment.
   *
   * Returns { ok: true, value } on success, or { ok: false, value: null }
   * when decodeURIComponent() rejects the segment as malformed percent
   * encoding or an invalid UTF-8 byte sequence (a URIError). Any other kind
   * of exception is a real programming error, not a routing concern, and is
   * rethrown rather than silently treated as a malformed route.
   */
  function safeDecodeRouteSegment(rawSegment) {
    try {
      return { ok: true, value: decodeURIComponent(rawSegment) };
    } catch (err) {
      if (err instanceof URIError) return { ok: false, value: null };
      throw err;
    }
  }

  /**
   * Parses a location.hash-shaped string into a route, never throwing.
   *
   * An open environment card is a "/env/<id>" suffix on whichever base route
   * is behind it, so the suffix is decoded and stripped first; the base
   * route underneath is then classified independently. Either segment can
   * fail to decode without invalidating the other — a malformed environment
   * id discards only the overlay, and a malformed list id falls back to the
   * Lists overview while a valid environment suffix on it is preserved.
   *
   * Returns { route, malformed, canonicalHash }:
   *   route: { name: 'catalog'|'lists'|'list'|'journey'|'prep'|'playermap', id?, env }
   *     (playermap: id = the link text, '' when it is missing or malformed; env is always null)
   *   malformed: whether any segment failed to decode
   *   canonicalHash: the safe hash the address should be repaired to, or
   *     null when nothing was malformed
   */
  function parseRouteHash(hash) {
    let working = typeof hash === 'string' ? hash : '';
    let env = null;
    let malformed = false;
    let legacy = false;

    const envMatch = working.match(ENV_SUFFIX_PATTERN);
    if (envMatch) {
      const decoded = safeDecodeRouteSegment(envMatch[1]);
      if (decoded.ok) env = decoded.value;
      else malformed = true;
      working = working.slice(0, envMatch.index) || '#';
    }

    let route;
    const listMatch = working.match(LIST_ID_PATTERN);
    const mapMatch = working.match(PLAYER_MAP_PATTERN);
    if (mapMatch) {
      const decodedMap = safeDecodeRouteSegment(mapMatch[1]);
      if (decodedMap.ok) route = { name: 'playermap', id: decodedMap.value, env: null };
      else { malformed = true; route = { name: 'playermap', id: '', env: null }; }
    } else if (listMatch) {
      const decodedId = safeDecodeRouteSegment(listMatch[1]);
      if (decodedId.ok) route = { name: 'list', id: decodedId.value, env: env };
      else { malformed = true; route = { name: 'lists', env: env }; }
    } else if (CATALOG_QUERY_PATTERN.test(working)) {
      const query = working.match(CATALOG_QUERY_PATTERN)[1];
      route = { name: 'catalog', env: env };
      if (query) route.query = query;
    } else if (working === '#/lists') {
      route = { name: 'lists', env: env };
    } else if (working === '#/journey') {
      route = { name: 'journey', env: env };
    } else if (working === LEGACY_JOURNEY2_HASH) {
      // Compatibility artifact: the map editor shipped at #/journey2 before it
      // became the canonical #/journey. Old bookmarks and shared overlay links
      // (#/journey2/env/<id>) resolve to the same route and the address is
      // repaired in place (replaceState), so Back never loops.
      route = { name: 'journey', env: env };
      legacy = true;
    } else if (working === '#/prep') {
      route = { name: 'prep', env: env };
    } else if (working === LEGACY_PREP_HASH) {
      // Compatibility artifact: this feature was once called "Session Prep"
      // and lived at #/session-prep. Old bookmarks resolve to the Prep page
      // and the address is repaired to the canonical #/prep.
      route = { name: 'prep', env: env };
      legacy = true;
    } else {
      route = { name: 'catalog', env: env };
    }

    return {
      route: route,
      malformed: malformed,
      canonicalHash: malformed || legacy ? routeToHash(route) : null,
    };
  }

  /** The address of the route behind the card, without any card on it. */
  function baseHash(route) {
    if (route.name === 'list') return '#/lists/' + encodeURIComponent(route.id);
    if (route.name === 'lists') return '#/lists';
    if (route.name === 'journey') return '#/journey';
    if (route.name === 'prep') return '#/prep';
    if (route.name === 'playermap') return '#/map/' + encodeURIComponent(route.id || '');
    return route.query ? '#/?' + route.query : '';
  }

  /** `route`'s base address with an environment overlay for `envId` — not
   * necessarily the overlay `route` itself currently carries, since this
   * also builds links to environments that are not yet open (a grid card,
   * a region neighbour). */
  function envHash(envId, route) {
    return (baseHash(route) || '#') + '/env/' + encodeURIComponent(envId);
  }

  /** The canonical address for a full route object: its base plus its own
   * environment overlay, if it has one. Used to repair a malformed hash and
   * to round-trip a parsed route back through parseRouteHash(). */
  function routeToHash(route) {
    if (route.name === 'playermap') return baseHash(route);                // no environment overlay on the player map
    return route.env ? envHash(route.env, route) : baseHash(route);
  }

  /**
   * Reads a catalogue query string (no leading "?") into plain filter values,
   * never throwing. Unknown keys, out-of-range ranks and undecodable values
   * are dropped one by one — a bad `tier` never costs a good `biome`. Type,
   * biome and source names are NOT validated here (the caller owns those
   * vocabularies); `type=region` is the Region pill and sets `regionOnly`.
   */
  function parseCatalogQuery(query) {
    const out = { search: '', tiers: [], types: [], sources: [], biomes: [], regionOnly: false };
    if (typeof query !== 'string' || !query || query.length > CATALOG_QUERY_MAX_LENGTH) return out;
    const push = (list, value) => { if (list.length < MAX_VALUES_PER_GROUP && !list.includes(value)) list.push(value); };
    for (const part of query.split('&')) {
      const eq = part.indexOf('=');
      if (eq < 1) continue;
      const decoded = safeDecodeRouteSegment(part.slice(eq + 1).replace(/\+/g, ' '));
      if (!decoded.ok || !decoded.value) continue;
      const value = decoded.value;
      switch (part.slice(0, eq)) {
        case 'q': out.search = Array.from(value).slice(0, SEARCH_MAX_LENGTH).join(''); break;
        case 'tier': { const n = Number(value); if (Number.isInteger(n) && n >= 1 && n <= 4) push(out.tiers, n); break; }
        case 'type': if (value === 'region') out.regionOnly = true; else push(out.types, value); break;
        case 'biome': push(out.biomes, value); break;
        case 'src': push(out.sources, value); break;
        default: break;
      }
    }
    return out;
  }

  /**
   * The canonical query string for a filter state (the inverse of
   * parseCatalogQuery): fixed key order, each group sorted, every value
   * encoded exactly once, '' when nothing is active. `filters` may hold Sets
   * or arrays. Canonical on purpose, so the same filters always give the same
   * address and an unchanged state never rewrites the URL.
   */
  function buildCatalogQuery(filters) {
    const f = filters || {};
    const list = v => Array.from(v || []);
    const enc = encodeURIComponent;
    const parts = [];
    const search = typeof f.search === 'string' ? f.search.trim() : '';
    if (search) parts.push('q=' + enc(Array.from(search).slice(0, SEARCH_MAX_LENGTH).join('')));
    list(f.tiers).sort((a, b) => a - b).forEach(v => parts.push('tier=' + enc(v)));
    list(f.types).sort().forEach(v => parts.push('type=' + enc(v)));
    if (f.regionOnly) parts.push('type=region');
    list(f.biomes).sort().forEach(v => parts.push('biome=' + enc(v)));
    list(f.sources).sort().forEach(v => parts.push('src=' + enc(v)));
    return parts.join('&');
  }

  return {
    parseCatalogQuery: parseCatalogQuery,
    buildCatalogQuery: buildCatalogQuery,
    safeDecodeRouteSegment: safeDecodeRouteSegment,
    parseRouteHash: parseRouteHash,
    baseHash: baseHash,
    envHash: envHash,
    routeToHash: routeToHash,
  };
});
