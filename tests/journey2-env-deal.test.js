'use strict';
/* Journey 2: the Environment dealer (PD-033). Pure — no browser. "Least used first, random among equals": no repeats while the pool is
   not exhausted, an even spread once it is, what already stands counts, and the injected RNG makes every result reproducible. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { dealEnvironments } = require('../js/journey2-env-deal.js');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const ids = n => Array.from({ length: n }, (_, i) => 'env-' + i);
/** Deterministic RNG (mulberry32). */
const rng = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const tally = list => list.reduce((m, id) => (m[id] = (m[id] || 0) + 1, m), {});

test('fewer hexes than Environments: no Environment is repeated', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const out = dealEnvironments({ pool: ids(15), count: 3, random: rng(seed) });
    assert.equal(out.length, 3);
    assert.equal(new Set(out).size, 3);
  }
});

test('as many hexes as Environments: every Environment is used exactly once, in a random order', () => {
  const orders = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const out = dealEnvironments({ pool: ids(6), count: 6, random: rng(seed) });
    assert.deepEqual(out.slice().sort(), ids(6));
    orders.add(out.join());
  }
  assert.ok(orders.size > 20, 'the order really varies');
});

test('more hexes than Environments: every Environment is used floor(N/K) or ceil(N/K) times', () => {
  for (const [k, n] of [[3, 6], [3, 7], [2, 7], [2, 12], [5, 12], [9, 12], [1, 4]]) {
    for (let seed = 1; seed <= 50; seed++) {
      const counts = tally(dealEnvironments({ pool: ids(k), count: n, random: rng(seed) }));
      assert.equal(Object.keys(counts).length, k, 'all ' + k + ' used for ' + n);
      for (const c of Object.values(counts)) assert.ok(c === Math.floor(n / k) || c === Math.ceil(n / k), k + '/' + n + ': ' + c);
    }
  }
  const six = tally(dealEnvironments({ pool: ids(3), count: 6, random: rng(9) }));
  assert.deepEqual(Object.values(six), [2, 2, 2], 'three Environments on six hexes: at most two each');
});

test('what already stands counts: one-by-one placement behaves like a batch', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const r = rng(seed), used = {}, all = [];
    for (let i = 0; i < 7; i++) {
      const [id] = dealEnvironments({ pool: ids(3), used: used, count: 1, random: r });
      used[id] = (used[id] || 0) + 1; all.push(id);
    }
    assert.deepEqual(Object.values(tally(all)).sort(), [2, 2, 3]);
  }
});

test('a manual change is respected: unused Environments are dealt before any that already stands', () => {
  const out = dealEnvironments({ pool: ids(4), used: { 'env-0': 2, 'env-1': 1 }, count: 2, random: rng(3) });
  assert.deepEqual(out.slice().sort(), ['env-2', 'env-3']);
  const next = dealEnvironments({ pool: ids(4), used: { 'env-0': 2, 'env-1': 1, 'env-2': 1, 'env-3': 1 }, count: 3, random: rng(3) });
  assert.deepEqual(next.slice().sort(), ['env-1', 'env-2', 'env-3'], 'env-0 is the most used and waits');
});

test('ids outside the pool are neither dealt nor allowed to skew the others', () => {
  const out = dealEnvironments({ pool: ids(2), used: { 'long-gone': 9 }, count: 2, random: rng(5) });
  assert.deepEqual(out.slice().sort(), ids(2));
});

test('an empty pool or a zero count deals nothing; bad input never throws', () => {
  assert.deepEqual(dealEnvironments({ pool: [], count: 3 }), []);
  assert.deepEqual(dealEnvironments({ pool: ids(3), count: 0 }), []);
  assert.deepEqual(dealEnvironments({ pool: ids(3), count: -1 }), []);
  assert.deepEqual(dealEnvironments({ pool: 'x', count: 2 }), []);
  assert.deepEqual(dealEnvironments(), []);
  assert.equal(dealEnvironments({ pool: ['a', 'a', 'a'], count: 3 }).length, 3, 'duplicate pool ids collapse to one candidate');
  assert.equal(dealEnvironments({ pool: ids(3), count: 2, random: () => NaN }).length, 2, 'a broken RNG still yields ids');
  assert.equal(dealEnvironments({ pool: ids(3), count: 2, random: () => 1 }).length, 2, 'an RNG returning 1 never indexes past the end');
});

test('same seed, same deal; a different seed deals differently', () => {
  const a = dealEnvironments({ pool: ids(8), count: 5, random: rng(11) });
  assert.deepEqual(dealEnvironments({ pool: ids(8), count: 5, random: rng(11) }), a);
  assert.notDeepEqual(dealEnvironments({ pool: ids(8), count: 5, random: rng(12) }), a);
});

test('it never mutates its inputs', () => {
  const pool = ids(3), used = { 'env-0': 1 };
  dealEnvironments({ pool: pool, used: used, count: 5, random: rng(2) });
  assert.deepEqual(pool, ids(3));
  assert.deepEqual(used, { 'env-0': 1 });
});

/* ---------------- wiring guards ---------------- */

const view = read('js/journey2-view.js');
const fn = (from, to) => view.slice(view.indexOf('function ' + from), view.indexOf('function ' + to, view.indexOf('function ' + from) + 1));

test('view: placeTiles deals once, before the single atomic place command; the pool is the region\'s biome list', () => {
  const place = fn('placeTiles', 'confirmSeparateArea');
  assert.match(place, /dealEnvironmentsTo\(batchId, tiles\)[\s\S]*type: 'place'/);
  assert.equal((view.match(/type: 'place'/g) || []).length, 1, 'there is one place path');
  const deal = fn('dealEnvironmentsTo', 'placeTiles');
  assert.match(deal, /hexEnvironmentList\(b\)\.map\(e => e\.id\)/);
  assert.match(deal, /EnvDeal\.dealEnvironments\(/);
  assert.match(deal, /t\.batchId === batchId && t\.environmentId/, 'usage is counted per region');
  assert.doesNotMatch(deal, /dispatch\(|persist\(|setTileEnvironment/, 'dealing is not a second command');
});

test('view: no Choose / Detach control survives in the inspector', () => {
  assert.doesNotMatch(view.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), /data-j2-hexenv="(choose|detach)"|journey2_hexenv_(choose|detach)/);
});

test('wiring: the module is loaded before the view and listed in the Journey 2 build check', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('js/journey2-env-deal.js') > 0 && html.indexOf('js/journey2-env-deal.js') < html.indexOf('js/journey2-view.js'));
  assert.match(read('scripts/check-journey2-build.js'), /js\/journey2-env-deal\.js/);
});
