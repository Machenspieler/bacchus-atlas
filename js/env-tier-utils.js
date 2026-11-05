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

  /* The tier formula (Fractus, the Broken World storms): a multi-tier stat block
   * writes "T" for "the tier the card is being read at" — `Td6+T`, `(T)`,
   * `(T+2, T+1)`, `(T)x2`. It is opt-in per environment (only a card with
   * `tiers`) and is spelt out before dice, countdowns and DCs are looked for, so
   * the result is an ordinary `2d6+2`. A marker such as "T3/4" (a feature that
   * only applies at those tiers) is not a formula and is left alone. */
  var TIER_FORMULA_RE = /(^|[^A-Za-z0-9])T(?:d\d|\b(?![-\w]))|\(T\)/;

  function usesTierFormula(text) {
    return typeof text === 'string' && TIER_FORMULA_RE.test(text);
  }

  function substituteTier(text, tier) {
    if (typeof text !== 'string' || !usesTierFormula(text)) return text;
    var n = Number(tier);
    return text
      .replace(/\(T\)\s*x\s*(\d+)/g, function (_, k) { return String(n * Number(k)); })
      .replace(/\(T\)/g, String(n))
      .replace(/(^|[^A-Za-z0-9])T(?=d\d)/g, function (_, pre) { return pre + n; })
      .replace(/(^|[^A-Za-z0-9])T\s*\+\s*(\d+)\b/g, function (_, pre, k) { return pre + (n + Number(k)); })
      .replace(/(^|[^A-Za-z0-9])T(?![-\w])/g, function (_, pre) { return pre + n; });
  }

  return {
    usesTierFormula: usesTierFormula,
    substituteTier: substituteTier,
    envTiers: envTiers,
    isNativeTier: isNativeTier,
    tierLabel: tierLabel,
    nearestNativeTier: nearestNativeTier,
    difficultyAt: difficultyAt,
  };
});
