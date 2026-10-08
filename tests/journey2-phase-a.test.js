'use strict';
/* Journey 2 Phase A: fully random immutable regions, deleteBatch, connected region shapes, enclosed-hole
   detection, standard zoom steps, sidebar preference storage and localization coverage. Pure — no browser. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Geo = require('../js/journey2-geometry.js');
const M = require('../js/journey2-model.js');
const Store = require('../js/journey2-store.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const template = JSON.parse(read('data/journey2/map-template.json'));
const anchorsDoc = JSON.parse(read('data/journey2/map-anchors.json'));
const ctx = M.createContext(template, anchorsDoc);
const grid = ctx.grid;
const AT = '2026-10-06T10:00:00.000Z';
const NB = Geo.NEIGHBOR_DELTAS;

const cid = (q, r) => Geo.cellId(q, r);
const shift = (id, d) => { const c = Geo.parseCellId(id); return cid(c.q + d.dq, c.r + d.dr); };
const dist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r));
/** A placeable centre whose whole radius-2 neighbourhood is placeable too (so ring fixtures never hit the policy). */
const CENTER = (() => {
  const c0 = grid.worldToCell(1500, 1500);
  for (let dq = -20; dq <= 20; dq++) for (let dr = -20; dr <= 20; dr++) {
    const q = c0.q + dq, r = c0.r + dr;
    let ok = true;
    for (let a = -2; a <= 2 && ok; a++) for (let b = -2; b <= 2 && ok; b++) {
      if (Math.max(Math.abs(a), Math.abs(b), Math.abs(a + b)) <= 2 && !ctx.placeable(q + a, r + b)) ok = false;
    }
    if (ok) return cid(q, r);
  }
  throw new Error('no open neighbourhood');
})();
const ringCells = (center, radius) => {
  const c = Geo.parseCellId(center), out = [];
  for (let a = -radius; a <= radius; a++) for (let b = -radius; b <= radius; b++) {
    if (dist({ q: a, r: b }, { q: 0, r: 0 }) === radius) out.push(cid(c.q + a, c.r + b));
  }
  return out;
};

function region(over) {
  return Object.assign({
    habitat: { biome: 'forest', blighted: false, overtaken: false, source: 'rolled', rolls: [11] }, terrain: { value: 2, source: 'rolled' }, size: 7,
    encounter: { entries: [[3, 4]], combines: 0 }, rumor: 49,
  }, over || {});
}
function addBatch(doc, id, over) {
  const r = M.apply(doc, { type: 'createBatch', batch: M.batchFromRegion(region(over), { id: id, createdAt: AT }), at: AT }, ctx);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.doc;
}
function docWith(id, size) { return addBatch(M.emptyDocument(ctx, AT), id, { size: size || 40 }); }
function place(doc, batchId, cells, seed) {
  return M.apply(doc, { type: 'place', batchId: batchId, tiles: cells.map((cell, i) => ({ id: (seed || 'p') + i, cell: cell })), at: AT }, ctx);
}
const must = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.doc; };

/* ---------------- generation ---------------- */

test('generation: the quantity is always the rolled size and is stored once, with its dice provenance', () => {
  for (const size of [1, 7, 12]) {
    const b = M.batchFromRegion(region({ size: size }), { id: 'b' + size, createdAt: AT });
    assert.equal(b.quantity, size);
    assert.equal(b.quantitySource, 'rolled');
    assert.equal(M.validateBatch(b, 'b').errors.length, 0);
  }
});

test('generation: Redo replays the stored batch — nothing is rolled again', () => {
  const history = M.createHistory();
  const empty = M.emptyDocument(ctx, AT);
  const created = must(M.apply(empty, { type: 'createBatch', batch: M.batchFromRegion(region({ size: 9, rumor: 77 }), { id: 'b1', createdAt: AT }), at: AT }, ctx));
  M.historyCommit(history, empty, created, 'createBatch');
  assert.equal(M.historyUndo(history).before, empty);
  const redone = M.historyRedo(history).after;
  assert.equal(redone, created);
  assert.deepEqual(redone.batches[0].habitat.rolls, [11]);
  assert.equal(redone.batches[0].quantity, 9);
  assert.equal(redone.batches[0].rumor, 77);
});

test('generation: no command can reroll or edit a generated value', () => {
  const doc = docWith('b1', 5);
  for (const type of ['reroll', 'rerollHabitat', 'rerollTerrain', 'rerollEncounter', 'rerollRumor', 'setHabitat', 'setTerrain', 'setEncounter', 'setRumor', 'setQuantity', 'updateBatch']) {
    assert.equal(M.apply(doc, { type: type, batchId: 'b1', value: 1, at: AT }, ctx).error.code, 'unknown-command', type);
  }
});

test('generation: the Journey 2 adapter and view have no manual habitat / size / terrain override path', () => {
  const app = read('js/app.js'), view = read('js/journey2-view.js');
  assert.match(app, /const journey2Generator = \{[\s\S]*?roll\(\) \{/);
  assert.doesNotMatch(app.slice(app.indexOf('const journey2Generator')), /roll\(\{/);
  assert.doesNotMatch(view, /generator\.roll\(\{|rollSize|data-j2-habitat|data-j2-qty|data-j2-terrain|parseQuantity/);
  assert.doesNotMatch(view, /d20|d12|d100|d8\b/, 'raw dice results are never shown');
});

/* ---------------- delete a region ---------------- */

test('deleteBatch: removes the batch and every tile of it, leaving other batches untouched', () => {
  let doc = docWith('a', 10);
  doc = addBatch(doc, 'b', { size: 10 });
  const cells = ringCells(CENTER, 1);
  doc = must(place(doc, 'a', cells.slice(0, 3), 'a'));
  doc = must(place(doc, 'b', [shift(CENTER, { dq: 0, dr: 0 })], 'b'));
  const del = M.apply(doc, { type: 'deleteBatch', batchId: 'a', at: AT }, ctx);
  assert.equal(del.ok, true);
  assert.deepEqual(del.doc.batches.map(b => b.id), ['b']);
  assert.deepEqual(del.doc.tiles.map(t => t.id), ['b0']);
  assert.equal(M.validateDocument(del.doc, ctx).ok, true);
  assert.equal(doc.batches.length, 2, 'the source document is not mutated');
  assert.equal(M.apply(doc, { type: 'deleteBatch', batchId: 'nope', at: AT }, ctx).error.code, 'no-batch');
});

test('deleteBatch: Undo restores the batch and all its tiles, Redo removes them again', () => {
  const h = M.createHistory();
  let doc = docWith('a', 10);
  doc = must(place(doc, 'a', ringCells(CENTER, 1).slice(0, 4), 'a'));
  const after = must(M.apply(doc, { type: 'deleteBatch', batchId: 'a', at: AT }, ctx));
  M.historyCommit(h, doc, after, 'deleteBatch');
  const undone = M.historyUndo(h).before;
  assert.equal(undone, doc);
  assert.equal(undone.batches.length, 1); assert.equal(undone.tiles.length, 4);
  const redone = M.historyRedo(h).after;
  assert.equal(redone, after);
  assert.equal(redone.batches.length, 0); assert.equal(redone.tiles.length, 0);
});

test('document validation rejects a tile whose batch is missing (no orphans), without throwing', () => {
  let doc = docWith('a', 10);
  doc = must(place(doc, 'a', ringCells(CENTER, 1).slice(0, 2), 'a'));
  const orphaned = JSON.parse(JSON.stringify(doc));
  orphaned.batches = [];
  const r = M.validateDocument(orphaned, ctx);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /missing batch/);
});

/* ---------------- connected region shapes ---------------- */

test('connectivity: the first tile goes anywhere valid; an adjacent second is accepted; a detached second is refused', () => {
  const doc0 = docWith('a');
  const first = must(place(doc0, 'a', [CENTER], 'f'));
  const nb = shift(CENTER, NB[0]);
  assert.equal(place(first, 'a', [nb], 'g').ok, true);
  const far = shift(CENTER, { dq: 5, dr: 0 });
  const bad = place(first, 'a', [far], 'g');
  assert.equal(bad.ok, false); assert.equal(bad.error.code, 'disconnected-region');
});

test('connectivity: a connected multi-tile placement is accepted, a disconnected one is refused', () => {
  const doc = docWith('a');
  assert.equal(place(doc, 'a', ringCells(CENTER, 1).slice(0, 3), 'x').ok, true);
  const split = place(doc, 'a', [CENTER, shift(CENTER, { dq: 4, dr: 0 })], 'x');
  assert.equal(split.error.code, 'disconnected-region');
  const placed = must(place(doc, 'a', [CENTER], 'c'));
  assert.equal(place(placed, 'a', [shift(CENTER, NB[1]), shift(CENTER, { dq: 4, dr: 0 })], 'y').error.code, 'disconnected-region', 'existing tiles + footprint must be one component');
  assert.equal(place(placed, 'a', [shift(CENTER, NB[1]), shift(shift(CENTER, NB[1]), NB[1])], 'y').ok, true);
});

function chain3(doc) {
  const a = CENTER, b = shift(a, NB[0]), c = shift(b, NB[0]);
  return { a, b, c, doc: must(place(doc, 'a', [a, b, c], 'L')) };       // ids L0 (a), L1 (b: the bridge), L2 (c)
}

test('connectivity: a bridge tile cannot be moved away or returned; a leaf can', () => {
  const { a, b, doc } = chain3(docWith('a'));
  const away = M.apply(doc, { type: 'move', tileId: 'L1', to: shift(a, { dq: 0, dr: 3 }), at: AT }, ctx);
  assert.equal(away.error.code, 'disconnected-region');
  assert.equal(M.apply(doc, { type: 'returnTile', tileId: 'L1', at: AT }, ctx).error.code, 'disconnected-region');
  // returning a leaf keeps the rest connected
  const ret = M.apply(doc, { type: 'returnTile', tileId: 'L2', at: AT }, ctx);
  assert.equal(ret.ok, true); assert.equal(ret.doc.tiles.length, 2);
  // moving a leaf around the shape (still touching the bridge) keeps it one region
  const around = M.apply(doc, { type: 'move', tileId: 'L2', to: shift(b, NB[1]), at: AT }, ctx);
  assert.equal(around.ok, true, JSON.stringify(around));
  // moving a leaf to where it touches nothing splits it
  assert.equal(M.apply(doc, { type: 'move', tileId: 'L2', to: shift(b, { dq: 0, dr: 4 }), at: AT }, ctx).error.code, 'disconnected-region');
});

test('connectivity: returning down to zero or one tile is always allowed', () => {
  let doc = must(place(docWith('a'), 'a', [CENTER, shift(CENTER, NB[0])], 'r'));
  doc = must(M.apply(doc, { type: 'returnTile', tileId: 'r0', at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'returnTile', tileId: 'r1', at: AT }, ctx));
  assert.equal(doc.tiles.length, 0);
});

test('connectivity: another region never satisfies this region\'s connectivity', () => {
  let doc = addBatch(docWith('a'), 'b');
  doc = must(place(doc, 'a', [CENTER], 'a'));
  const touchingA = shift(CENTER, NB[0]);
  // b may touch a freely (its first tile)…
  doc = must(place(doc, 'b', [touchingA], 'b'));
  // …but a's second tile cannot hang off b's tile alone
  const hangingOffB = shift(touchingA, NB[0]);
  assert.equal(place(doc, 'a', [hangingOffB], 'a2').error.code, 'disconnected-region');
  assert.equal(place(doc, 'a', [shift(CENTER, NB[3])], 'a2').ok, true);
});

test('connectivity: preview and commit use one rule (checkPlacement agrees with apply)', () => {
  const doc = must(place(docWith('a'), 'a', [CENTER], 'a'));
  const ok = M.checkPlacement(doc, ctx, 'a', [{ q: Geo.parseCellId(shift(CENTER, NB[0])).q, r: Geo.parseCellId(shift(CENTER, NB[0])).r }]);
  assert.equal(ok.valid, true);
  const farC = Geo.parseCellId(shift(CENTER, { dq: 6, dr: 0 }));
  const far = M.checkPlacement(doc, ctx, 'a', [farC]);
  assert.equal(far.valid, false); assert.equal(far.connected, false); assert.ok(far.cells.every(c => c.ok));
  assert.equal(place(doc, 'a', [cid(farC.q, farC.r)], 'z').error.code, 'disconnected-region');
});

test('connectivity: a legacy split region stays usable — an edit may keep or reduce, never increase, the component count', () => {
  const far = shift(CENTER, { dq: 6, dr: 0 });
  const doc = docWith('a');
  const legacy = Object.assign({}, doc, { tiles: [{ id: 'x', batchId: 'a', cell: CENTER }, { id: 'y', batchId: 'a', cell: far }, { id: 'z', batchId: 'a', cell: shift(far, NB[0]) }] });
  assert.equal(M.validateDocument(legacy, ctx).ok, true);
  assert.equal(M.componentCount(legacy.tiles.map(t => t.cell)), 2);
  // reducing: returning the lone tile, or joining it to the pair, is fine
  assert.equal(M.apply(legacy, { type: 'returnTile', tileId: 'x', at: AT }, ctx).ok, true);
  assert.equal(M.apply(legacy, { type: 'move', tileId: 'x', to: shift(far, { dq: 0, dr: 1 }), at: AT }, ctx).ok, true);
  // keeping: moving a tile without changing the count is fine
  assert.equal(M.apply(legacy, { type: 'move', tileId: 'x', to: shift(CENTER, NB[2]), at: AT }, ctx).ok, true);
  // worsening: a new detached tile, or splitting the pair into a third piece, is refused
  assert.equal(place(legacy, 'a', [shift(CENTER, { dq: -2, dr: 0 })], 'n').error.code, 'disconnected-region');
  assert.equal(M.apply(legacy, { type: 'move', tileId: 'z', to: shift(CENTER, { dq: 0, dr: -2 }), at: AT }, ctx).error.code, 'disconnected-region');
  // once connected, the strict rule applies
  const joined = must(M.apply(legacy, { type: 'move', tileId: 'x', to: shift(far, { dq: 0, dr: 1 }), at: AT }, ctx));
  assert.equal(M.componentCount(joined.tiles.map(t => t.cell)), 1);
  assert.equal(place(joined, 'a', [shift(CENTER, { dq: -2, dr: 0 })], 'n').error.code, 'disconnected-region');
});

/* ---------------- enclosed holes ---------------- */

test('holes: an open arc has none; a six-tile ring around one empty cell has one', () => {
  const ring = ringCells(CENTER, 1);
  assert.deepEqual(M.enclosedHoles(ring.slice(0, 5)), []);
  assert.deepEqual(M.enclosedHoles(ring), [CENTER]);
});

test('holes: a larger enclosed empty area counts every empty cell inside', () => {
  const outer = ringCells(CENTER, 2);
  const inner = [CENTER].concat(ringCells(CENTER, 1));
  assert.equal(M.enclosedHoles(outer).length, inner.length);
  assert.deepEqual(M.enclosedHoles(outer).sort(), inner.slice().sort());
});

test('holes: only this region\'s tiles are barriers — another region closing the gap does not create a hole', () => {
  const ring = ringCells(CENTER, 1);
  let doc = addBatch(addBatch(M.emptyDocument(ctx, AT), 'a', { size: 20 }), 'b', { size: 20 });
  doc = must(place(doc, 'a', ring.slice(0, 5), 'a'));
  doc = must(place(doc, 'b', [ring[5]], 'b'));
  assert.equal(M.holeCounts(doc, ctx).has('a'), false);
  assert.equal(M.holeCounts(doc, ctx).has('b'), false);
});

test('holes: closing the ring warns; fixing the gap clears the warning', () => {
  const ring = ringCells(CENTER, 1);
  let doc = must(place(docWith('a', 20), 'a', ring, 'a'));
  assert.equal(M.holeCounts(doc, ctx).get('a'), 1);
  const fixed = must(M.apply(doc, { type: 'returnTile', tileId: 'a5', at: AT }, ctx));
  assert.equal(M.holeCounts(fixed, ctx).has('a'), false);
});

test('holes: the warning is nonblocking — the enclosing edit is accepted', () => {
  const ring = ringCells(CENTER, 1);
  const doc = must(place(docWith('a', 20), 'a', ring.slice(0, 5), 'a'));
  assert.equal(place(doc, 'a', [ring[5]], 'z').ok, true);
});

test('holes: a shape against the map edge does not produce false holes', () => {
  // an edge cell: valid, with at least one neighbour outside the map; surround it on every valid side
  let edge = null;
  grid.forEachValidCell((q, r) => {
    if (edge || !ctx.policy(q, r).ok) return;
    const nbs = grid.neighbors(q, r);
    const inside = nbs.filter(n => n.valid && ctx.policy(n.q, n.r).ok);
    if (nbs.some(n => !n.valid) && inside.length >= 3) edge = { q, r };
  });
  assert.ok(edge, 'a map-edge cell exists');
  const e = cid(edge.q, edge.r);
  const around = ringCells(e, 1).concat(ringCells(e, 2)).filter(id => { const c = Geo.parseCellId(id); return ctx.policy(c.q, c.r).ok; });
  assert.ok(around.length >= 6);
  assert.deepEqual(M.enclosedHoles(around, (q, r) => ctx.policy(q, r).ok), []);
});

/* ---------------- zoom ---------------- */

test('zoom: the standard stops include exactly 100%', () => {
  assert.deepEqual(Array.from(Geo.ZOOM_STEPS), [0.5, 0.67, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0]);
  assert.ok(Geo.ZOOM_STEPS.includes(1));
});

test('zoom: stepping from a fitted (non-standard) scale lands on the next stop', () => {
  assert.equal(Geo.stepZoom(0.98, 1), 1);
  assert.equal(Geo.stepZoom(0.78, 1), 0.8);
  assert.equal(Geo.stepZoom(Geo.stepZoom(0.78, 1), 1), 0.9);
  assert.equal(Geo.stepZoom(1.22, -1), 1.1);
  assert.equal(Geo.stepZoom(0.98, -1), 0.9);
  assert.equal(Geo.stepZoom(1, 1), 1.1);
  assert.equal(Geo.stepZoom(1, -1), 0.9);
  assert.equal(Geo.stepZoom(0.2, 1), 0.5, 'a map-wide fit steps up to the first stop');
});

test('zoom: the ends clamp (a limit leaves the scale unchanged)', () => {
  assert.equal(Geo.stepZoom(2, 1), 2);
  assert.equal(Geo.stepZoom(0.5, -1), 0.5);
  assert.equal(Geo.stepZoom(0.3, -1), 0.3);
  assert.equal(Geo.stepZoom(3, 1), 3);
});

test('zoom: a reset to exactly 1 keeps the world point under the pivot fixed', () => {
  const cam = { scale: 0.37, tx: 120, ty: -40 };
  const next = Geo.zoomAt(cam, 400, 300, 1 / cam.scale, 0.1, 8);
  assert.equal(next.scale, 1);
  const before = Geo.screenToWorld(cam, 400, 300), after = Geo.screenToWorld(next, 400, 300);
  assert.ok(Math.abs(before[0] - after[0]) < 1e-9 && Math.abs(before[1] - after[1]) < 1e-9);
});

/* ---------------- sidebar preference ---------------- */

function fakeStorage(initial) {
  const data = new Map(Object.entries(initial || {}));
  return { data, writes: [], getItem(k) { return data.has(k) ? data.get(k) : null; }, setItem(k, v) { this.writes.push(k); data.set(k, String(v)); }, removeItem(k) { data.delete(k); } };
}

test('sidebar preference: stored apart from the map document, round-trips, and malformed values fall back', () => {
  const s = fakeStorage({ dhcodex_lang: '"ru"' }), store = Store.createStore(s, ctx);
  assert.deepEqual(store.loadUi(), { sideCollapsed: false, showFogState: true, showBiomeColors: true, view: null });
  assert.deepEqual(store.saveUi({ sideCollapsed: true }), { ok: true });
  assert.deepEqual(store.loadUi(), { sideCollapsed: true, showFogState: true, showBiomeColors: true, view: null });
  assert.deepEqual(s.writes, [Store.KEYS.ui]);
  assert.notEqual(Store.KEYS.ui, Store.KEYS.map);
  assert.equal(s.data.get('dhcodex_lang'), '"ru"');
  for (const raw of ['{broken', '[]', '{"sideCollapsed":"yes"}', 'null']) { s.data.set(Store.KEYS.ui, raw); assert.deepEqual(store.loadUi(), { sideCollapsed: false, showFogState: true, showBiomeColors: true, view: null }, raw); }
  assert.ok(Store.ownedKeys().every(k => k.startsWith('dhcodex_journey2_')));
  assert.equal(store.load().status, 'empty', 'the preference never looks like a saved map');
  assert.deepEqual(Store.createStore(null, ctx).loadUi(), { sideCollapsed: false, showFogState: true, showBiomeColors: true, view: null });
});

/* ---------------- localization ---------------- */

test('localization: every key the Journey 2 view uses exists in English and Russian with the same placeholders', () => {
  const i18n = JSON.parse(read('data/i18n.json'));
  const src = read('js/journey2-view.js');
  const keys = new Set();
  for (const re of [/\bt\('([A-Za-z0-9_]+)'\)/g, /\bfill\('([A-Za-z0-9_]+)'/g, /data-t(?:-aria|-title|-ph)?="([A-Za-z0-9_]+)"/g]) {
    let m; while ((m = re.exec(src))) keys.add(m[1]);
  }
  for (const k of ['journey2_save_saved', 'journey2_save_unsaved', 'journey2_save_failed', 'journey2_save_unavailable', 'journey2_save_blocked', 'journey2_save_loading',
    'journey2_reason_outside', 'journey2_reason_decorative', 'journey2_reason_occupied', 'journey2_reason_disconnected_region']) keys.add(k);
  assert.ok(keys.size > 60);
  const ph = s => (String(s).match(/\{[A-Za-z0-9_]+\}/g) || []).sort().join();
  const missing = [];
  for (const k of keys) {
    if (typeof i18n.en[k] !== 'string' || !i18n.en[k]) missing.push('en:' + k);
    if (typeof i18n.ru[k] !== 'string' || !i18n.ru[k]) missing.push('ru:' + k);
    else if (ph(i18n.en[k]) !== ph(i18n.ru[k])) missing.push('placeholders:' + k);
  }
  assert.deepEqual(missing, []);
});

test('localization: the removed manual-generator strings are gone from both languages', () => {
  const i18n = JSON.parse(read('data/i18n.json'));
  for (const lang of ['en', 'ru']) for (const k of Object.keys(i18n[lang])) assert.doesNotMatch(k, /^journey2_(gen_hexes|gen_roll|gen_random|qty_)/, k);
});

test('selection: clicking a map tile never expands or scrolls a sidebar card', () => {
  const view = read('js/journey2-view.js');
  const body = view.slice(view.indexOf('function selectTile(id)'), view.indexOf('function onWheel'));
  assert.doesNotMatch(body, /activeBatchId|scrollIntoView|detailSection/);
  assert.match(view, /j2-region-hl/, 'the whole region is highlighted on the map');
});
