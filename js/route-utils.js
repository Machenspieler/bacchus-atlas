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
  const LIST_ID_PATTERN = /^#\/lists\/(.+)$/;

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
   *   route: { name: 'catalog'|'lists'|'list'|'journey', id?, env }
   *   malformed: whether any segment failed to decode
   *   canonicalHash: the safe hash the address should be repaired to, or
   *     null when nothing was malformed
   */
  function parseRouteHash(hash) {
    let working = typeof hash === 'string' ? hash : '';
    let env = null;
    let malformed = false;

    const envMatch = working.match(ENV_SUFFIX_PATTERN);
    if (envMatch) {
      const decoded = safeDecodeRouteSegment(envMatch[1]);
      if (decoded.ok) env = decoded.value;
      else malformed = true;
      working = working.slice(0, envMatch.index) || '#';
    }

    let route;
    const listMatch = working.match(LIST_ID_PATTERN);
    if (listMatch) {
      const decodedId = safeDecodeRouteSegment(listMatch[1]);
      if (decodedId.ok) route = { name: 'list', id: decodedId.value, env: env };
      else { malformed = true; route = { name: 'lists', env: env }; }
    } else if (working === '#/lists') {
      route = { name: 'lists', env: env };
    } else if (working === '#/journey') {
      route = { name: 'journey', env: env };
    } else {
      route = { name: 'catalog', env: env };
    }

    return {
      route: route,
      malformed: malformed,
      canonicalHash: malformed ? routeToHash(route) : null,
    };
  }

  /** The address of the route behind the card, without any card on it. */
  function baseHash(route) {
    if (route.name === 'list') return '#/lists/' + encodeURIComponent(route.id);
    if (route.name === 'lists') return '#/lists';
    if (route.name === 'journey') return '#/journey';
    return '';
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
    return route.env ? envHash(route.env, route) : baseHash(route);
  }

  return {
    safeDecodeRouteSegment: safeDecodeRouteSegment,
    parseRouteHash: parseRouteHash,
    baseHash: baseHash,
    envHash: envHash,
    routeToHash: routeToHash,
  };
});
