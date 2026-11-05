/* ============================================================
   Bacchus's Atlas — tests/env-tier-utils.test.js
   Regression tests for js/env-tier-utils.js. Run with:
     node --test tests/env-tier-utils.test.js
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/env-tier-utils.js');

const multi = { tier: 2, tiers: [2, 3, 4], difficulty: 13, difficulty_by_tier: { 2: 13, 3: 16, 4: 19 } };
const single = { tier: 3, difficulty: 15 };

test('envTiers: the own tiers, ascending; a plain environment has one', () => {
  assert.deepEqual(U.envTiers(multi), [2, 3, 4]);
  assert.deepEqual(U.envTiers({ tier: 1, tiers: [3, 2] }), [2, 3]);
  assert.deepEqual(U.envTiers(single), [3]);
  assert.deepEqual(U.envTiers({}), []);
});

test('isNativeTier', () => {
  assert.equal(U.isNativeTier(multi, 4), true);
  assert.equal(U.isNativeTier(multi, 1), false);
  assert.equal(U.isNativeTier(single, 3), true);
  assert.equal(U.isNativeTier(single, 2), false);
});

test('tierLabel: one number, a range for a run, a list otherwise', () => {
  assert.equal(U.tierLabel(single), '3');
  assert.equal(U.tierLabel(multi), '2–4');
  assert.equal(U.tierLabel({ tier: 1, tiers: [1, 3] }), '1, 3');
});

test('nearestNativeTier: the closest own tier, the lower one on a tie', () => {
  assert.equal(U.nearestNativeTier(multi, 1), 2);
  assert.equal(U.nearestNativeTier(multi, 3), 3);
  assert.equal(U.nearestNativeTier({ tier: 1, tiers: [1, 3] }, 2), 1);
  assert.equal(U.nearestNativeTier(single, 4), 3);
});

test('difficultyAt: the per-tier value, else the single difficulty', () => {
  assert.equal(U.difficultyAt(multi, 3), 16);
  assert.equal(U.difficultyAt(multi, 4), 19);
  assert.equal(U.difficultyAt(single, 3), 15);
});

test('substituteTier: the tier formula T becomes the tier the card is read at', () => {
  assert.equal(U.substituteTier('takes Td6+T physical damage', 2), 'takes 2d6+2 physical damage');
  assert.equal(U.substituteTier('Spend up to (T) Fear', 3), 'Spend up to 3 Fear');
  assert.equal(U.substituteTier('Challenge Countdown (T+2, T+1)', 1), 'Challenge Countdown (3, 2)');
  assert.equal(U.substituteTier('(T)x2 BP of adversaries', 4), '8 BP of adversaries');
  assert.equal(U.substituteTier('Td4+2 direct damage', 4), '4d4+2 direct damage');
});

test('substituteTier: markers such as T3/4 and ordinary words are left alone', () => {
  assert.equal(U.usesTierFormula('(Exposed, T3/4) Chained Smite'), false);
  assert.equal(U.substituteTier('T3/4 only, T-shirt, Tier 2', 2), 'T3/4 only, T-shirt, Tier 2');
  assert.equal(U.usesTierFormula('Spend a Fear'), false);
});
