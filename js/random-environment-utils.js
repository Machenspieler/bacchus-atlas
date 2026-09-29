/* ============================================================
   Bacchus's Atlas — random-environment-utils.js
   Pure logic behind the catalog's "Random Environment" action card: what
   its Tier badge should read for a given candidate pool, and which pool
   member a click selects. No DOM, no application state — see js/app.js
   (randomCardHtml, handleRandomCardActivate) for where the catalog's
   filtered result set and the details overlay are wired in.

   Dependency-free on purpose, the same shape as js/catalog-progressive.js:
   a plain <script> in the browser, require()'d as-is from a Node test (see
   tests/random-environment-utils.test.js).
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.RandomEnvironmentUtils = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** The Tier badge for the current candidate pool: the shared Tier number
   * when every environment in the pool has the same one, "?" otherwise —
   * including when the pool is empty or a tier is missing/inconsistent. */
  function computeTierBadge(pool) {
    const tiers = new Set(
      (pool || [])
        .map(env => env && env.tier)
        .filter(tier => tier != null)
    );
    return tiers.size === 1 ? String([...tiers][0]) : '?';
  }

  /** One environment picked from the pool, or null for an empty pool.
   * `randomFn` defaults to Math.random but takes a stub in tests so the
   * pick is deterministic. */
  function pickRandomEnvironment(pool, randomFn) {
    if (!pool || !pool.length) return null;
    const roll = (randomFn || Math.random)();
    const index = Math.min(pool.length - 1, Math.floor(roll * pool.length));
    return pool[index];
  }

  return {
    computeTierBadge: computeTierBadge,
    pickRandomEnvironment: pickRandomEnvironment,
  };
});
