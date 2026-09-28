/* ============================================================
   Bacchus's Atlas — freshcutgrass-utils.js
   Pure, dependency-free helper for building a FreshCutGrass
   (freshcutgrass.app) encounter URL from an encounter name and a flat list
   of English adversary names. Nothing here is specific to any one caller —
   the environment detail page's "Potential Adversaries" links and Session
   Prep's "Open in FreshCutGrass" export both go through the same
   buildFreshCutGrassEncounterUrl(), so there is exactly one encoder for the
   whole app.

   No DOM, no application state, no i18n — same shape as
   js/session-prep-utils.js, loaded as a plain <script> in the browser
   (before js/app.js, data-cache-version="ui") and required() as-is from a
   Node test (see tests/freshcutgrass-utils.test.js). TextEncoder and btoa
   are both available as globals in the browser and in Node 18+, so this
   file needs no polyfill or bundler either way.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.FreshCutGrassUtils = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Unicode-safe base64: btoa() alone throws on any non-Latin1 character
   * (any Cyrillic session title, for instance), so the UTF-8 bytes are
   * encoded first and each byte is then treated as its own Latin1
   * character — the standard workaround for btoa() with non-ASCII input. */
  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  /** Builds a FreshCutGrass encounter URL at runtime from an encounter name
   * and a flat list of adversary names. Every adversary is exported at
   * quantity 1 (`q: 1`) — Session Prep and the environment detail page both
   * treat adversary selection as binary, never a count. */
  function buildFreshCutGrassEncounterUrl(encounterName, adversaryNames) {
    const payload = {
      n: encounterName,
      d: adversaryNames.map(name => ({
        n: name,
        a: '',
        q: 1,
        u: 0,
        i: [{ n: null }],
      })),
    };
    const base64 = utf8ToBase64(JSON.stringify(payload));
    return `https://freshcutgrass.app/encounter?data=${encodeURIComponent(base64)}`;
  }

  return {
    utf8ToBase64: utf8ToBase64,
    buildFreshCutGrassEncounterUrl: buildFreshCutGrassEncounterUrl,
  };
});
