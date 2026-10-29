/* ============================================================
   Bacchus's Atlas — env-tier-utils.js
   Pure logic for an environment that is written for more than one tier
   (`tiers: [2, 3, 4]`, `difficulty_by_tier: { "2": 13, "3": 16, "4": 19 }`,
   PD-084). `tier` stays the lowest of them, so sorting, Prep and the
   Journey lists keep working on one number; everything that asks "is this
   tier one of its own" goes through here.

   Dependency-free, the same shape as js/random-environment-utils.js: a
   plain <script> in the browser, require()'d as-is from a Node test (see
   tests/env-tier-utils.test.js).
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.EnvTierUtils = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Every tier the stat block is written for, ascending. */
  function envTiers(env) {
    if (env && Array.isArray(env.tiers) && env.tiers.length) {
      return env.tiers.slice().sort(function (a, b) { return a - b; });
    }
    return env && env.tier != null ? [env.tier] : [];
  }

  function isNativeTier(env, tier) { return envTiers(env).indexOf(tier) !== -1; }

  /** "3", or "2–4" for a run of consecutive tiers, "1, 3" otherwise. */
  function tierLabel(env) {
    var tiers = envTiers(env);
    if (tiers.length < 2) return tiers.length ? String(tiers[0]) : '';
    var run = tiers.every(function (n, i) { return i === 0 || n === tiers[i - 1] + 1; });
    return run ? tiers[0] + '–' + tiers[tiers.length - 1] : tiers.join(', ');
  }

  /** The own tier closest to `tier` (the lower one on a tie) — the one a read at
   * a foreign tier is scaled from. */
  function nearestNativeTier(env, tier) {
    var best = null;
    envTiers(env).forEach(function (n) {
      if (best === null || Math.abs(n - tier) < Math.abs(best - tier)) best = n;
    });
    return best;
  }

  /** The difficulty printed for one of the environment's own tiers. */
  function difficultyAt(env, tier) {
    var by = env && env.difficulty_by_tier;
    if (by && typeof by === 'object' && by[tier] !== undefined) return by[tier];
    return env ? env.difficulty : undefined;
  }

  return {
    envTiers: envTiers,
    isNativeTier: isNativeTier,
    tierLabel: tierLabel,
    nearestNativeTier: nearestNativeTier,
    difficultyAt: difficultyAt,
  };
});
