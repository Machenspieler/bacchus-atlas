/* ============================================================
   Bacchus's Atlas — tests/random-environment-utils.test.js
   Dependency-free regression tests for js/random-environment-utils.js. Run
   with:

     node --test tests/random-environment-utils.test.js

   RandomEnvironmentUtils is pure (no DOM, no application state), so it's
   exercised directly here, the same shape as tests/catalog-progressive.test.js.
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const RandomEnvironmentUtils = require('../js/random-environment-utils.js');
const { computeTierBadge, pickRandomEnvironment } = RandomEnvironmentUtils;

test('computeTierBadge: single-tier pool shows that tier', () => {
  assert.equal(computeTierBadge([{ tier: 2 }, { tier: 2 }, { tier: 2 }]), '2');
  assert.equal(computeTierBadge([{ tier: 1 }]), '1');
});

test('computeTierBadge: mixed-tier pool shows "?"', () => {
  assert.equal(computeTierBadge([{ tier: 1 }, { tier: 2 }]), '?');
  assert.equal(computeTierBadge([{ tier: 1 }, { tier: 2 }, { tier: 3 }]), '?');
});

test('computeTierBadge: empty pool falls back to "?"', () => {
  assert.equal(computeTierBadge([]), '?');
  assert.equal(computeTierBadge(undefined), '?');
});

test('computeTierBadge: a missing tier alongside a shared one is ignored, not treated as a second tier', () => {
  assert.equal(computeTierBadge([{ tier: 2 }, { tier: null }]), '2');
});

test('computeTierBadge: entirely missing tier data falls back safely', () => {
  assert.equal(computeTierBadge([{}, {}]), '?');
});

test('pickRandomEnvironment: empty pool returns null without calling randomFn', () => {
  let called = false;
  assert.equal(pickRandomEnvironment([], () => { called = true; return 0; }), null);
  assert.equal(called, false);
});

test('pickRandomEnvironment: single-member pool always returns that member', () => {
  const env = { id: 'only' };
  assert.equal(pickRandomEnvironment([env], () => 0.99), env);
});

test('pickRandomEnvironment: selection is deterministic given a stubbed randomFn', () => {
  const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  assert.equal(pickRandomEnvironment(pool, () => 0), pool[0]);
  assert.equal(pickRandomEnvironment(pool, () => 0.26), pool[1]);
  assert.equal(pickRandomEnvironment(pool, () => 0.99), pool[3]);
});

test('pickRandomEnvironment: a roll of exactly 1 never indexes out of bounds', () => {
  const pool = [{ id: 'a' }, { id: 'b' }];
  assert.equal(pickRandomEnvironment(pool, () => 1), pool[1]);
});

test('pickRandomEnvironment: defaults to Math.random when no randomFn is given', () => {
  const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const picked = pickRandomEnvironment(pool);
  assert.ok(pool.includes(picked));
});
