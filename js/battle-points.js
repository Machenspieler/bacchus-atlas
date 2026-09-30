/* ============================================================
   Bacchus's Atlas — battle-points.js
   Pure, dependency-free Battle Points arithmetic (Daggerheart Battle
   Guide) for the Prep Adversaries header (js/battle-points-ui.js). No DOM, no
   application state, no storage — so it can be loaded as a plain
   <script> and required() from a Node test (tests/battle-points.test.js),
   the same shape as js/prep-utils.js.

   Adversary types are the canonical data-model ids (`adv.type`, e.g.
   'bruiser'), never translated labels.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.BattlePoints = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MIN_PCS = 1;
  var MAX_PCS = 20;
  var DEFAULT_PCS = 4;

  /** Cost per adversary. Minion is special-cased: quantity / PCs. */
  var TYPE_COST = {
    social: 1, support: 1,
    horde: 2, ranged: 2, skulk: 2, standard: 2,
    leader: 3, bruiser: 4, solo: 5,
  };
  /** Display order of the "Adversary cost" breakdown. */
  var TYPE_ORDER = ['minion', 'social', 'support', 'horde', 'ranged', 'skulk', 'standard', 'leader', 'bruiser', 'solo'];
  var HEAVY_TYPES = ['bruiser', 'horde', 'leader', 'solo'];

  var STYLE_ADJUSTMENT = { easier: -1, standard: 0, dangerous: 2 };
  var BOOSTED_DAMAGE_ADJUSTMENT = -2;
  var LOWER_TIER_ADJUSTMENT = 1;
  var MULTIPLE_SOLOS_ADJUSTMENT = -2;
  var NO_HEAVY_ADJUSTMENT = 1;

  /** Clamps to an integer in [MIN_PCS, MAX_PCS]; anything unusable is the default. */
  function clampPcs(value) {
    var n = Math.floor(Number(value));
    if (!isFinite(n)) return DEFAULT_PCS;
    return Math.min(MAX_PCS, Math.max(MIN_PCS, n));
  }

  /** Parses typed input: returns the integer, or null when it isn't a whole
   * number in range (caller restores the previous valid value). */
  function parsePcsInput(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!/^\d+$/.test(s)) return null;
    var n = parseInt(s, 10);
    return n >= MIN_PCS && n <= MAX_PCS ? n : null;
  }

  /** Tallies canonical types. `entries` is an array of type ids, or of
   * `{ type, quantity }` records (quantity defaults to 1). Unknown types
   * are ignored. Returns { type: quantity } in TYPE_ORDER insertion order. */
  function countTypes(entries) {
    var counts = {};
    (entries || []).forEach(function (entry) {
      var type = typeof entry === 'string' ? entry : entry && entry.type;
      var qty = typeof entry === 'string' || entry.quantity == null ? 1 : Number(entry.quantity);
      if (TYPE_ORDER.indexOf(type) === -1 || !(qty > 0)) return;
      counts[type] = (counts[type] || 0) + qty;
    });
    return counts;
  }

  /**
   * options: { pcs, entries, style: 'easier'|'standard'|'dangerous',
   *            boostedDamage: bool, lowerTier: bool }
   * Full precision throughout; round only via formatBP().
   */
  function calculate(options) {
    var opts = options || {};
    var pcs = clampPcs(opts.pcs);
    var counts = countTypes(opts.entries);
    var total = 0;
    Object.keys(counts).forEach(function (t) { total += counts[t]; });

    var costLines = TYPE_ORDER.filter(function (t) { return counts[t]; }).map(function (t) {
      var quantity = counts[t];
      var cost = t === 'minion' ? quantity / pcs : quantity * TYPE_COST[t];
      return { type: t, quantity: quantity, cost: cost };
    });
    var spent = costLines.reduce(function (sum, line) { return sum + line.cost; }, 0);

    var baseBudget = 3 * pcs + 2;
    var styleKey = Object.prototype.hasOwnProperty.call(STYLE_ADJUSTMENT, opts.style) ? opts.style : 'standard';
    var styleAdjustment = STYLE_ADJUSTMENT[styleKey];
    var boostedDamageAdjustment = opts.boostedDamage ? BOOSTED_DAMAGE_ADJUSTMENT : 0;
    var lowerTierAdjustment = opts.lowerTier ? LOWER_TIER_ADJUSTMENT : 0;
    var multipleSolos = (counts.solo || 0) >= 2;
    var multipleSolosAdjustment = multipleSolos ? MULTIPLE_SOLOS_ADJUSTMENT : 0;
    // "No heavy types" only means something when there is an encounter at all.
    var noHeavy = total > 0 && !HEAVY_TYPES.some(function (t) { return counts[t]; });
    var noHeavyAdjustment = noHeavy ? NO_HEAVY_ADJUSTMENT : 0;

    var available = baseBudget + styleAdjustment + boostedDamageAdjustment
      + lowerTierAdjustment + multipleSolosAdjustment + noHeavyAdjustment;

    return {
      pcs: pcs,
      style: styleKey,
      adversaryCount: total,
      costLines: costLines,
      baseBudget: baseBudget,
      styleAdjustment: styleAdjustment,
      boostedDamageAdjustment: boostedDamageAdjustment,
      lowerTierAdjustment: lowerTierAdjustment,
      multipleSolos: multipleSolos,
      multipleSolosAdjustment: multipleSolosAdjustment,
      noHeavy: noHeavy,
      noHeavyAdjustment: noHeavyAdjustment,
      available: available,
      spent: spent,
      remaining: available - spent,
      overBudget: spent > available,
    };
  }

  /** Max two decimals, no trailing zeroes ("10", "10.5", "10.25", "0.33").
   * Display only — never feed the result back into arithmetic. */
  function formatBP(value) {
    var n = Number(value);
    if (!isFinite(n)) return '0';
    var rounded = Math.round((n + (n < 0 ? -1e-9 : 1e-9)) * 100) / 100;
    if (rounded === 0) return '0'; // also folds -0
    return String(rounded);
  }

  /** Same as formatBP() with an explicit sign, for adjustment rows ("+2", "−1", "0"). */
  function formatSigned(value) {
    var text = formatBP(value);
    if (text === '0') return '0';
    return value > 0 ? '+' + text : '−' + text.replace('-', '');
  }

  return {
    MIN_PCS: MIN_PCS, MAX_PCS: MAX_PCS, DEFAULT_PCS: DEFAULT_PCS,
    TYPE_COST: TYPE_COST, TYPE_ORDER: TYPE_ORDER, HEAVY_TYPES: HEAVY_TYPES,
    STYLE_ADJUSTMENT: STYLE_ADJUSTMENT,
    clampPcs: clampPcs, parsePcsInput: parsePcsInput, countTypes: countTypes,
    calculate: calculate, formatBP: formatBP, formatSigned: formatSigned,
  };
});
