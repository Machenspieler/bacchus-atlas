/* Pure-logic tests for js/battle-points.js (BattlePoints). Run with:
     node --test tests/battle-points.test.js */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const BP = require('../js/battle-points.js');

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);
const demo = ['bruiser', 'standard', 'minion', 'solo'];

test('demo encounter, 4 characters', () => {
  const r = BP.calculate({ pcs: 4, entries: demo });
  near(r.spent, 11.25);
  assert.equal(r.baseBudget, 14);
  assert.equal(r.available, 14);
  near(r.remaining, 2.75);
  assert.equal(r.overBudget, false);
  assert.equal(BP.formatBP(r.spent), '11.25');
});

test('demo encounter, 5 characters', () => {
  const r = BP.calculate({ pcs: 5, entries: demo });
  near(r.spent, 11.2);
  assert.equal(r.baseBudget, 17);
});

test('8 minions with 4 characters cost 2', () => {
  near(BP.calculate({ pcs: 4, entries: Array(8).fill('minion') }).spent, 2);
});

test('quantity records are honoured, default quantity is 1', () => {
  near(BP.calculate({ pcs: 4, entries: [{ type: 'minion', quantity: 8 }, { type: 'solo' }] }).spent, 7);
});

test('two solos: spent 10, automatic -2, available 12', () => {
  const r = BP.calculate({ pcs: 4, entries: ['solo', 'solo'] });
  near(r.spent, 10);
  assert.equal(r.multipleSolosAdjustment, -2);
  assert.equal(r.available, 12);
});

test('no heavy types: standard + support gives +1', () => {
  const r = BP.calculate({ pcs: 4, entries: ['standard', 'support'] });
  near(r.spent, 3);
  assert.equal(r.noHeavyAdjustment, 1);
  assert.equal(r.available, 15);
});

test('a heavy type removes the +1', () => {
  for (const heavy of ['bruiser', 'horde', 'leader', 'solo']) {
    assert.equal(BP.calculate({ pcs: 4, entries: ['standard', heavy] }).noHeavyAdjustment, 0, heavy);
  }
});

test('empty encounter: spent 0, available 14 (never 15)', () => {
  const r = BP.calculate({ pcs: 4, entries: [] });
  assert.equal(r.spent, 0);
  assert.equal(r.available, 14);
  assert.equal(r.noHeavyAdjustment, 0);
  assert.equal(r.remaining, 14);
});

test('manual adjustments', () => {
  const base = { pcs: 4, entries: ['bruiser'] };
  assert.equal(BP.calculate({ ...base, style: 'easier' }).available, 13);
  assert.equal(BP.calculate({ ...base, style: 'dangerous' }).available, 16);
  assert.equal(BP.calculate({ ...base, style: 'standard' }).available, 14);
  assert.equal(BP.calculate({ ...base, boostedDamage: true }).available, 12);
  assert.equal(BP.calculate({ ...base, lowerTier: true }).available, 15);
  assert.equal(BP.calculate({ ...base, style: 'bogus' }).style, 'standard');
});

test('lower tier is a single +1 regardless of adversary count', () => {
  assert.equal(BP.calculate({ pcs: 4, entries: ['bruiser', 'bruiser', 'leader'], lowerTier: true }).lowerTierAdjustment, 1);
});

test('every type costs what the Battle Guide says', () => {
  const expected = { social: 1, support: 1, horde: 2, ranged: 2, skulk: 2, standard: 2, leader: 3, bruiser: 4, solo: 5 };
  for (const [type, cost] of Object.entries(expected)) {
    near(BP.calculate({ pcs: 4, entries: [type] }).spent, cost);
  }
  near(BP.calculate({ pcs: 4, entries: ['minion'] }).spent, 0.25);
});

test('unknown types are ignored; untranslated labels are not types', () => {
  const r = BP.calculate({ pcs: 4, entries: ['Bruiser', 'Громила', 'dragon'] });
  assert.equal(r.adversaryCount, 0);
  assert.equal(r.spent, 0);
});

test('overBudget is advisory and flagged', () => {
  const r = BP.calculate({ pcs: 1, entries: ['solo', 'solo'] });
  assert.equal(r.overBudget, true);
  assert.ok(r.remaining < 0);
});

test('formatBP', () => {
  assert.equal(BP.formatBP(10), '10');
  assert.equal(BP.formatBP(10.5), '10.5');
  assert.equal(BP.formatBP(10.25), '10.25');
  assert.equal(BP.formatBP(1 / 3), '0.33');
  assert.equal(BP.formatBP(10.0), '10');
  assert.equal(BP.formatBP(2.005), '2.01');
  assert.equal(BP.formatBP(-0), '0');
  assert.equal(BP.formatBP(-1.5), '-1.5');
  assert.equal(BP.formatSigned(2), '+2');
  assert.equal(BP.formatSigned(-2), '−2');
  assert.equal(BP.formatSigned(0), '0');
});

test('character count: clamp and input parsing', () => {
  assert.equal(BP.clampPcs(0), 1);
  assert.equal(BP.clampPcs(99), 20);
  assert.equal(BP.clampPcs('abc'), 4);
  assert.equal(BP.parsePcsInput('7'), 7);
  assert.equal(BP.parsePcsInput(' 12 '), 12);
  for (const bad of ['', 'abc', '4.5', '-3', '0', '21', '1e1', null, undefined]) {
    assert.equal(BP.parsePcsInput(bad), null, String(bad));
  }
});

test('an out-of-range character count in calculate() is clamped', () => {
  assert.equal(BP.calculate({ pcs: 0, entries: [] }).baseBudget, 5);
  assert.equal(BP.calculate({ pcs: 50, entries: [] }).baseBudget, 62);
});
