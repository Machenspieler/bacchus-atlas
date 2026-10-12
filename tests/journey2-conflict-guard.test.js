'use strict';
/* Journey 2 H-04 / H-03: stale-tab write protection in the store (pure, fake Storage) and the source-level wiring that keeps every
   document-writing path behind it. The real two-tab behaviour is verified in Chrome (artifacts/journey-audit-06-undo-redo-fixes/tools/two-tab.cjs).
   Limit: a read-then-compare in front of setItem is not an atomic transaction — see docs/architecture.md "Multi-tab write protection". */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../js/journey2-model.js');
const Store = require('../js/journey2-store.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ctx = M.createContext(JSON.parse(read('data/journey2/map-template.json')), JSON.parse(read('data/journey2/map-anchors.json')));
const AT = '2026-10-06T10:00:00.000Z';

function fakeStorage(initial) {
  const data = new Map(Object.entries(initial || {}));
  return { data, failWrites: false, failReads: false,
    getItem(k) { if (this.failReads) throw new Error('blocked'); return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { if (this.failWrites) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } data.set(k, String(v)); },
    removeItem(k) { data.delete(k); } };
}
function docWith(id) {
  const b = M.batchFromRegion({ habitat: { biome: 'forest', blighted: false, overtaken: false, source: 'manual' }, terrain: { value: 2, source: 'manual' }, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 5 }, { id: id, createdAt: AT, quantity: { value: 20, source: 'manual' } });
  return M.apply(M.emptyDocument(ctx, AT), { type: 'createBatch', batch: b, at: AT }, ctx).doc;
}
const KEY = Store.KEYS.map;

test('conflict: another tab saved after this tab loaded -> save is refused and the newer map is untouched', () => {
  const shared = fakeStorage();
  const s0 = Store.createStore(shared, ctx); s0.save(docWith('s0'));
  const A = Store.createStore(shared, ctx), B = Store.createStore(shared, ctx);
  A.load(); B.load();
  assert.deepEqual(A.save(docWith('a1')), { ok: true });
  const stored = shared.data.get(KEY);
  assert.equal(B.isStale(), true);
  assert.deepEqual(B.save(docWith('b1')), { ok: false, reason: 'conflict' });
  assert.equal(shared.data.get(KEY), stored);
  assert.equal(B.save(docWith('b2')).reason, 'conflict');             // stays refused: only a reload (new store/load) resolves it
  assert.equal(A.isStale(), false);
  assert.deepEqual(A.save(docWith('a2')), { ok: true });             // the tab that holds the newest map keeps working
});

test('conflict: a tab that loaded an empty store is stale once another tab saved', () => {
  const shared = fakeStorage(), A = Store.createStore(shared, ctx), B = Store.createStore(shared, ctx);
  A.load(); B.load();
  assert.equal(A.save(docWith('a')).ok, true);
  assert.equal(B.save(docWith('b')).reason, 'conflict');
});

test('conflict: the map key being removed by another tab also counts', () => {
  const shared = fakeStorage(), A = Store.createStore(shared, ctx); A.save(docWith('a')); A.load();
  shared.removeItem(KEY);
  assert.equal(A.isStale(), true);
});

test('no false positives: repeated same-tab saves, view-preference writes and other keys never make the store stale', () => {
  const shared = fakeStorage({ other: 'x' }), A = Store.createStore(shared, ctx);
  A.load();
  for (let i = 0; i < 5; i++) { assert.equal(A.save(docWith('a' + i)).ok, true); assert.equal(A.isStale(), false); }
  A.saveUi({ sideCollapsed: true, showBiomeColors: false, view: { fit: true } });
  shared.setItem('unrelated', '1'); shared.setItem(Store.KEYS.previous, '{}');
  assert.equal(A.isStale(), false);
  assert.equal(A.save(docWith('z')).ok, true);
});

test('recovery: a store created after the other tab saved loads the latest map and can save again', () => {
  const shared = fakeStorage(), A = Store.createStore(shared, ctx), B = Store.createStore(shared, ctx);
  A.load(); B.load(); A.save(docWith('latest'));
  assert.equal(B.save(docWith('stale')).reason, 'conflict');
  const B2 = Store.createStore(shared, ctx), r = B2.load();
  assert.equal(r.status, 'ok'); assert.equal(r.doc.batches[0].id, 'latest');
  assert.equal(B2.save(docWith('after-reload')).ok, true);
});

test('a storage failure is not a conflict: unreadable storage, failed writes and a missing storage keep their own reasons', () => {
  const shared = fakeStorage(), A = Store.createStore(shared, ctx); A.load();
  shared.failWrites = true;
  assert.deepEqual(A.save(docWith('a')), { ok: false, reason: 'write-failed' });
  assert.equal(A.isStale(), false);
  shared.failWrites = false; shared.failReads = true;
  assert.equal(A.isStale(), false);
  assert.equal(Store.createStore(null, ctx).save(docWith('a')).reason, 'unavailable');
  assert.equal(Store.createStore(null, ctx).isStale(), false);
});

test('a failed write does not advance the observed value (the next successful save still compares against the real stored text)', () => {
  const shared = fakeStorage(), A = Store.createStore(shared, ctx); A.load();
  shared.failWrites = true; A.save(docWith('x')); shared.failWrites = false;
  assert.equal(A.isStale(), false);
  assert.equal(A.save(docWith('y')).ok, true);
});

test('a corrupt saved map keeps its raw text and is not itself a conflict', () => {
  const shared = fakeStorage({ [KEY]: '{broken' }), A = Store.createStore(shared, ctx);
  assert.equal(A.load().status, 'corrupt');
  assert.equal(A.isStale(), false);
  assert.equal(shared.data.get(KEY), '{broken');
});

/* ---- source-level wiring (view) ---- */
const view = read('js/journey2-view.js');
const body = name => { const i = view.indexOf('function ' + name + '('); assert.ok(i > 0, name); const j = view.indexOf('\n    function ', i + 10); return view.slice(i, j < 0 ? undefined : j); };

test('wiring: every document-writing path checks the conflict guard before it mutates anything', () => {
  for (const fn of ['dispatch', 'undo', 'redo', 'replaceDocument', 'startEmptyMap']) assert.match(body(fn), /conflictBlocks\(\)|conflict/, fn + ' must be guarded');
  assert.match(body('handleImportText'), /conflictBlocks\(\)/);
  assert.ok(body('persist').includes("reason === 'conflict'"));
  assert.ok(!/store\.save\(/.test(view.replace(body('persist'), '')), 'store.save is only called from persist()');
});

test('wiring: the conflict is sticky — nothing but a reload clears it, and view prefs / editLocked resets cannot', () => {
  assert.equal((view.match(/(?<!let )conflict = false/g) || []).length, 0, 'conflict is only initialised via its declaration');
  assert.match(view, /let conflict = false;/);
  assert.ok(body('replaceDocument').indexOf('conflictBlocks()') < body('replaceDocument').indexOf('doc = next'));
});

test('wiring: one storage listener per instance, registered through listen() so dispose removes it', () => {
  assert.equal((view.match(/addEventListener\('storage'/g) || []).length, 0);
  assert.equal((view.match(/listen\(window, 'storage'/g) || []).length, 1);
  assert.match(view, /e\.key === null \|\| e\.key === mapKey/);
});

test('H-03: a cancelled import never closes the inspector; the confirmed replacement does (replaceDocument)', () => {
  const imp = body('handleImportText');
  assert.ok(!/closeInspector/.test(imp), 'handleImportText must not touch the inspector');
  const rd = body('replaceDocument');
  assert.match(rd, /closeInspector\(\{ quiet: true \}\)/);
  assert.match(rd, /sel\.tileId = null/);
  assert.match(rd, /Model\.historyClear\(history\)/);
});

test('i18n: the conflict banner exists in EN and RU', () => {
  const i18n = JSON.parse(read('data/i18n.json'));
  const langs = Object.keys(i18n).filter(k => i18n[k] && typeof i18n[k] === 'object' && i18n[k].journey2_banner_conflict);
  assert.ok(langs.length >= 2, 'EN and RU');
  for (const l of langs) { assert.ok(i18n[l].journey2_banner_conflict.length > 40); assert.ok(i18n[l].journey2_conflict_reload); }
});
