'use strict';
/* Journey 2 local persistence: real outcomes, corrupt data preserved, nothing outside the dhcodex_journey2_ keys touched. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../js/journey2-model.js');
const Store = require('../js/journey2-store.js');

const ROOT = path.join(__dirname, '..');
const template = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-template.json'), 'utf8'));
const anchorsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-anchors.json'), 'utf8'));
const ctx = M.createContext(template, anchorsDoc);
const AT = '2026-10-06T10:00:00.000Z';

function fakeStorage(initial, opts) {
  const data = new Map(Object.entries(initial || {}));
  return {
    data, writes: [], failWrites: !!(opts && opts.failWrites), failReads: !!(opts && opts.failReads),
    getItem(k) { if (this.failReads) throw new Error('blocked'); return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { if (this.failWrites) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } this.writes.push(k); data.set(k, String(v)); },
    removeItem(k) { data.delete(k); },
  };
}
function sampleDoc() {
  const b = M.batchFromRegion({ habitat: { biome: 'forest', blighted: false, overtaken: false, source: 'manual' }, terrain: { value: 2, source: 'manual' }, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 5 }, { id: 'b1', createdAt: AT, quantity: { value: 20, source: 'manual' } });
  return M.apply(M.emptyDocument(ctx, AT), { type: 'createBatch', batch: b, at: AT }, ctx).doc;
}
const LEGACY = { dhcodex_journey_regions: '[{"id":"reg-1"}]', dhcodex_lang: '"ru"', dhcodex_session_prep: '{"x":1}', unrelated: 'abc' };

test('store: an empty storage loads as "empty"; a saved document round-trips exactly', () => {
  const s = fakeStorage(LEGACY), store = Store.createStore(s, ctx);
  assert.equal(store.load().status, 'empty');
  const doc = sampleDoc();
  assert.deepEqual(store.save(doc), { ok: true });
  const r = store.load();
  assert.equal(r.status, 'ok'); assert.deepEqual(r.doc, doc);
});

test('store: only Journey 2-owned keys are ever written; legacy and unrelated values stay byte-identical', () => {
  const s = fakeStorage(LEGACY), store = Store.createStore(s, ctx);
  store.load(); store.save(sampleDoc()); store.savePrevious(sampleDoc());
  const owned = Store.ownedKeys();
  assert.ok(s.writes.every(k => owned.includes(k)), s.writes.join());
  for (const [k, v] of Object.entries(LEGACY)) assert.equal(s.data.get(k), v, k);
  assert.ok(owned.every(k => k.startsWith('dhcodex_journey2_')));
});

test('store: a failed write is reported (never "ok") and leaves the previous value intact', () => {
  const s = fakeStorage(LEGACY), store = Store.createStore(s, ctx);
  store.save(sampleDoc());
  const before = s.data.get(Store.KEYS.map);
  s.failWrites = true;
  assert.deepEqual(store.save(M.emptyDocument(ctx, AT)), { ok: false, reason: 'write-failed' });
  assert.equal(s.data.get(Store.KEYS.map), before);
  assert.deepEqual(Store.createStore(null, ctx).save(sampleDoc()), { ok: false, reason: 'unavailable' });
});

test('store: unavailable / unreadable storage loads as "unavailable" without throwing', () => {
  assert.equal(Store.createStore(null, ctx).load().status, 'unavailable');
  assert.equal(Store.createStore(fakeStorage({}, { failReads: true }), ctx).load().status, 'unavailable');
});

test('store: corrupt JSON and invalid documents are reported, preserved raw, and never overwritten by load()', () => {
  for (const raw of ['{broken', JSON.stringify({ schemaVersion: 1 }), JSON.stringify(Object.assign({}, sampleDoc(), { schemaVersion: 9 }))]) {
    const s = fakeStorage(Object.assign({ [Store.KEYS.map]: raw }, LEGACY)), store = Store.createStore(s, ctx);
    const r = store.load();
    assert.equal(r.status, 'corrupt');
    assert.ok(r.errors.length > 0);
    assert.equal(s.data.get(Store.KEYS.map), raw, 'original key untouched');
    assert.equal(s.data.get(Store.KEYS.recovery), raw, 'recovery copy kept');
    assert.deepEqual(s.writes, [Store.KEYS.recovery]);
  }
});

test('store: the previous map is kept for recovery and re-validated when read back', () => {
  const s = fakeStorage({}), store = Store.createStore(s, ctx);
  assert.equal(store.loadPrevious(), null);
  const doc = sampleDoc();
  store.savePrevious(doc);
  assert.deepEqual(store.loadPrevious(), doc);
  s.data.set(Store.KEYS.previous, '{"nope":1}');
  assert.equal(store.loadPrevious(), null);
});
